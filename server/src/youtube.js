// YouTube Data API v3 (бесплатная квота 10 000 единиц в день: один поиск = 2 запроса search.list = 200 единиц).
import { cfg } from "./config.js";
import { ask, parseJson } from "./gemini.js";

const API = "https://www.googleapis.com/youtube/v3";

async function yt(path, params, fetchFn = fetch) {
  if (!cfg.youtubeKey) throw new Error("YOUTUBE_API_KEY is not set on the server");
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: cfg.youtubeKey })}`;
  const r = await fetchFn(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube ${path}: ${j.error?.message || r.status}`);
  return j;
}

export function isoSeconds(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export async function makeQueries(niche, fetchFn = fetch) {
  const system = "You turn a short description of a business or channel into YouTube search queries that find viral SHORT videos in the same niche. Return JSON only.";
  const user = `Description:\n"""${niche.slice(0, 1500)}"""\n\nReturn {"queries": [3 short search queries, 2-5 words each, in the language of the description; the third one in English], "language": "ISO 639-1 code of the description language"}.`;
  try {
    const j = parseJson(await ask(system, user, { json: true, maxTokens: 300, fetchFn }));
    const queries = (j.queries || []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    if (queries.length) return { queries, language: String(j.language || "").slice(0, 2) };
  } catch { /* запасной вариант ниже */ }
  return { queries: [niche.replace(/\s+/g, " ").slice(0, 60)], language: "" };
}

export function scoreVideo(v, ch, now = Date.now()) {
  const views = Number(v.statistics?.viewCount || 0);
  const subs = Number(ch?.statistics?.subscriberCount || 0);
  const seconds = isoSeconds(v.contentDetails?.duration);
  const ageDays = Math.max(0, Math.round((now - Date.parse(v.snippet?.publishedAt || now)) / 86400000));
  const ratio = subs > 0 || !ch?.statistics?.hiddenSubscriberCount ? views / Math.max(subs, 500) : 0;
  return {
    id: v.id, title: v.snippet?.title || "", channel: v.snippet?.channelTitle || "", views, subs, seconds, ageDays,
    ratio: Math.round(ratio * 10) / 10, url: `https://www.youtube.com/shorts/${v.id}`,
    thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
  };
}

export async function findShorts(niche, exclude = [], fetchFn = fetch) {
  const { queries, language } = await makeQueries(niche, fetchFn);
  const after = new Date(Date.now() - 365 * 86400000).toISOString();
  const ids = [];
  for (const q of queries.slice(0, 2)) {
    const params = { part: "snippet", type: "video", videoDuration: "short", order: "viewCount", maxResults: "25", publishedAfter: after, q };
    if (language) params.relevanceLanguage = language;
    const j = await yt("search", params, fetchFn);
    for (const it of j.items || []) if (it.id?.videoId && !ids.includes(it.id.videoId) && !exclude.includes(it.id.videoId)) ids.push(it.id.videoId);
  }
  if (!ids.length) return [];
  const vids = (await yt("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(0, 50).join(",") }, fetchFn)).items || [];
  const chIds = [...new Set(vids.map((v) => v.snippet?.channelId).filter(Boolean))];
  const chs = (await yt("channels", { part: "statistics", id: chIds.join(",") }, fetchFn)).items || [];
  const chById = Object.fromEntries(chs.map((c) => [c.id, c]));
  return vids
    .map((v) => scoreVideo(v, chById[v.snippet?.channelId]))
    .filter((x) => x.seconds > 0 && x.seconds <= cfg.maxShortSeconds && x.ratio >= cfg.minRatio)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 10);
}

export async function getVideo(id, fetchFn = fetch) {
  const j = await yt("videos", { part: "snippet,statistics,contentDetails", id }, fetchFn);
  const v = (j.items || [])[0];
  if (!v) return null;
  const ch = (await yt("channels", { part: "statistics", id: v.snippet.channelId }, fetchFn)).items?.[0];
  return { ...scoreVideo(v, ch), description: (v.snippet.description || "").slice(0, 900), tags: (v.snippet.tags || []).slice(0, 12) };
}
