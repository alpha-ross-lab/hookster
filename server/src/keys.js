// ПРОЕКТ: Hookster (хакатон Solana) — server/src/keys.js
// Ключи из текстовых файлов в папке Google Drive (вместо переменных окружения).
// Папка должна быть открыта "всем, у кого есть ссылка" (просмотр). Нужен DRIVE_API_KEY (Google API key с включённым Drive API).
// Файлы распознаются так: имя содержит "youtube" -> ключ YouTube; иначе каждая строка:
//   sk-ant-...  -> ключ Claude (запасной), остальное -> ключи Gemini. Пустые строки и строки с # игнорируются.
import { cfg } from "./config.js";

const API = "https://www.googleapis.com/drive/v3";

export function parseKeyFiles(files) {
  const out = { gemini: [], claude: [], youtube: "" };
  for (const f of files) {
    const lines = String(f.text || "").split(/\r?\n/).map((l) => l.trim().replace(/^[\w .-]*[=:]\s*/, "").replace(/^["']|["']$/g, "").trim()).filter((l) => l && !l.startsWith("#"));
    if (/youtube/i.test(f.name)) { const k = lines.find((l) => /^\S{20,}$/.test(l)); if (k) out.youtube = k; continue; }
    for (const l of lines) {
      if (/\s/.test(l) || l.length < 20) continue;
      (l.startsWith("sk-ant-") ? out.claude : out.gemini).push(l);
    }
  }
  return out;
}

export async function loadKeysFromDrive({ folderId = cfg.driveFolderId, apiKey = cfg.driveApiKey, fetchFn = fetch } = {}) {
  if (!folderId || !apiKey) return false;
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const r = await fetchFn(`${API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50&key=${apiKey}`);
  if (!r.ok) throw new Error(`Drive list failed: HTTP ${r.status} (is the folder shared by link, and Drive API enabled for DRIVE_API_KEY?)`);
  const files = ((await r.json()).files || []).filter((f) => /text\/plain|document/.test(f.mimeType) || /\.txt$/i.test(f.name));
  const got = [];
  for (const f of files) {
    const url = f.mimeType === "application/vnd.google-apps.document"
      ? `${API}/files/${f.id}/export?mimeType=text/plain&key=${apiKey}` : `${API}/files/${f.id}?alt=media&key=${apiKey}`;
    const x = await fetchFn(url);
    if (x.ok) got.push({ name: f.name, text: await x.text() });
  }
  const k = parseKeyFiles(got);
  if (k.gemini.length) cfg.geminiKeys = k.gemini;
  if (k.claude.length) cfg.claudeKeys = k.claude;
  if (k.youtube) cfg.youtubeKey = k.youtube;
  return { gemini: k.gemini.length, claude: k.claude.length, youtube: !!k.youtube };
}

export function startKeyRefresh(everyMs = 10 * 60 * 1000) {
  const run = () => loadKeysFromDrive().then((r) => r && console.log("keys from Drive:", JSON.stringify(r))).catch((e) => console.error(e.message));
  run();
  if (cfg.driveFolderId) setInterval(run, everyMs).unref();
}
