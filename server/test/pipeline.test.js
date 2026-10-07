// ПРОЕКТ: Hookster (хакатон Solana) — server/test/pipeline.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { cfg } from "../src/config.js";
import { findShorts } from "../src/youtube.js";
import { analyzeVideo, makeIdeas, writeScript } from "../src/prompts.js";

cfg.geminiKeys = ["k1"]; cfg.youtubeKey = "yk";
const gem = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const now = new Date().toISOString();

test("findShorts: queries -> search -> filter by length and ratio -> sorted", async () => {
  const urls = [];
  const fetchFn = async (url, opts) => {
    urls.push(String(url));
    if (String(url).includes("generativelanguage")) return gem({ queries: ["bake rolls", "cinnamon", "baking"], language: "en" });
    if (String(url).includes("/search")) return { ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: "v1aaaaaaaa" } }, { id: { videoId: "v2aaaaaaaa" } }, { id: { videoId: "v3aaaaaaaa" } }] }) };
    if (String(url).includes("/videos")) return { ok: true, status: 200, json: async () => ({ items: [
      { id: "v1aaaaaaaa", snippet: { title: "A", channelId: "c1", channelTitle: "C1", publishedAt: now }, statistics: { viewCount: "50000" }, contentDetails: { duration: "PT30S" } },
      { id: "v2aaaaaaaa", snippet: { title: "B", channelId: "c2", channelTitle: "C2", publishedAt: now }, statistics: { viewCount: "900000" }, contentDetails: { duration: "PT45S" } },
      { id: "v3aaaaaaaa", snippet: { title: "Long", channelId: "c2", channelTitle: "C2", publishedAt: now }, statistics: { viewCount: "9000000" }, contentDetails: { duration: "PT10M" } },
    ] }) };
    if (String(url).includes("/channels")) return { ok: true, status: 200, json: async () => ({ items: [{ id: "c1", statistics: { subscriberCount: "10000" } }, { id: "c2", statistics: { subscriberCount: "3000" } }] }) };
    throw new Error("unexpected " + url);
  };
  const items = await findShorts("A bakery that sells cinnamon rolls", ["zzzzzzzzzz"], fetchFn);
  assert.deepEqual(items.map((i) => i.id), ["v2aaaaaaaa", "v1aaaaaaaa"]);   // длинное видео отброшено, сортировка по ratio
  assert.equal(items[0].ratio, 300);
  assert.ok(urls.filter((u) => u.includes("/search")).length === 2);          // не больше двух поисков (квота)
});

test("gemini: falls over to the second model and returns structured data", async () => {
  const seen = [];
  const fetchFn = async (url) => {
    seen.push(String(url));
    if (String(url).includes("flash-lite")) return { ok: false, status: 503, json: async () => ({ error: "busy" }) };
    return gem({ hook: "h", format: "f", structure: [{ name: "a", text: "b" }, { name: "c", text: "d" }, { name: "e", text: "f" }], why: ["x", "y"] });
  };
  const a = await analyzeVideo({ title: "t", description: "", tags: [], views: 1, subs: 1, ratio: 1, seconds: 10, ageDays: 1 }, "niche niche niche", fetchFn);
  assert.equal(a.hook, "h");
  assert.ok(seen[0].includes("flash-lite") && !seen[1].includes("flash-lite"));
});

test("ideas and script validators reject bad structure", async () => {
  const bad = async () => gem({ ideas: [{ title: "only one" }] });
  await assert.rejects(makeIdeas({ niche: "n".repeat(20), seconds: 10 }, bad));
  const good = async () => gem({ hook: "h", beats: [{ time: "0-3s", visual: "v", voice: "x" }, { time: "3-10s", visual: "v2", voice: "" }], caption: "c?", hashtags: ["#a"] });
  const s = await writeScript({ niche: "n".repeat(20), seconds: 10, idea: { title: "t" } }, good);
  assert.equal(s.beats.length, 2);
});

import { parseKeyFiles, loadKeysFromDrive } from "../src/keys.js";
import { ask } from "../src/gemini.js";

test("keys from Drive files: parsing, loading, Claude fallback", async () => {
  const k = parseKeyFiles([
    { name: "gemini_keys.txt", text: "# my keys\nGEMINI_KEY=AIzaAAAAAAAAAAAAAAAAAAAAAA\nAIzaBBBBBBBBBBBBBBBBBBBBBB\n\nsk-ant-api03-CCCCCCCCCCCCCCCC\n" },
    { name: "youtube_key.txt", text: "AIzaYYYYYYYYYYYYYYYYYYYYYY\n" },
  ]);
  assert.deepEqual(k.gemini, ["AIzaAAAAAAAAAAAAAAAAAAAAAA", "AIzaBBBBBBBBBBBBBBBBBBBBBB"]);
  assert.deepEqual(k.claude, ["sk-ant-api03-CCCCCCCCCCCCCCCC"]);
  assert.equal(k.youtube, "AIzaYYYYYYYYYYYYYYYYYYYYYY");

  const files = { g: "AIzaGGGGGGGGGGGGGGGGGGGGGG", y: "AIzaYYYYYYYYYYYYYYYYYYYYYY", c: "sk-ant-zzzzzzzzzzzzzzzzzzzz" };
  const fake = async (url) => {
    url = String(url);
    if (url.includes("/files?")) return { ok: true, json: async () => ({ files: [{ id: "g", name: "gemini.txt", mimeType: "text/plain" }, { id: "c", name: "claude.txt", mimeType: "text/plain" }, { id: "y", name: "youtube.txt", mimeType: "text/plain" }] }) };
    const id = url.match(/files\/(\w+)\?/)[1];
    return { ok: true, text: async () => files[id] };
  };
  const r = await loadKeysFromDrive({ folderId: "F", apiKey: "K", fetchFn: fake });
  assert.deepEqual(r, { gemini: 1, claude: 1, youtube: true });
  assert.equal(cfg.youtubeKey, files.y);

  const calls = [];
  const ai = async (url) => {
    calls.push(String(url));
    if (String(url).includes("generativelanguage")) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ content: [{ text: "hi from claude" }] }) };
  };
  assert.equal(await ask("s", "u", { fetchFn: ai }), "hi from claude");
  assert.ok(calls.some((c) => c.includes("anthropic.com")));
});
