import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.js";
import * as store from "../src/store.js";
import { cfg } from "../src/config.js";
import { checkTransfer } from "../src/solana.js";
import { isoSeconds, scoreVideo } from "../src/youtube.js";
import { parseJson } from "../src/gemini.js";

const W = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const T = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
cfg.treasury = T;

async function boot(deps) {
  store.reset();
  const app = createApp(deps);
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, body, wallet = W) => {
    const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(wallet ? { "x-wallet": wallet } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { call, close: () => srv.close() };
}

test("helpers", () => {
  assert.equal(isoSeconds("PT1M5S"), 65);
  assert.equal(isoSeconds("PT45S"), 45);
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  const v = { id: "abc", snippet: { title: "t", channelTitle: "c", publishedAt: new Date(Date.now() - 10 * 86400000).toISOString() }, statistics: { viewCount: "100000" }, contentDetails: { duration: "PT30S" } };
  const s = scoreVideo(v, { statistics: { subscriberCount: "1000" } });
  assert.equal(s.ratio, 100); assert.equal(s.seconds, 30); assert.equal(s.ageDays, 10);
});

test("solana transfer check", () => {
  const tx = (src, dst, lam, err = null) => ({ blockTime: Math.floor(Date.now() / 1000), meta: { err }, transaction: { message: { instructions: [{ program: "system", parsed: { type: "transfer", info: { source: src, destination: dst, lamports: lam } } }] } } });
  assert.equal(checkTransfer(tx(W, T, 10_000_000), { from: W, to: T, minLamports: 10_000_000 }).ok, true);
  assert.equal(checkTransfer(tx(W, T, 9_000_000), { from: W, to: T, minLamports: 10_000_000 }).ok, false);
  assert.equal(checkTransfer(tx(T, T, 10_000_000), { from: W, to: T, minLamports: 10_000_000 }).ok, false); // платит не тот
  assert.equal(checkTransfer(tx(W, W, 10_000_000), { from: W, to: T, minLamports: 10_000_000 }).ok, false); // не на наш адрес
  assert.equal(checkTransfer(tx(W, T, 10_000_000, { x: 1 }), { from: W, to: T, minLamports: 10_000_000 }).ok, false);
  assert.equal(checkTransfer(null, { from: W, to: T, minLamports: 1 }).ok, false);
});

test("wallet required, free hooks, search charges only on results", async () => {
  const items = [{ id: "aaaaaaaaaaa", title: "t", ratio: 10 }];
  let found = items;
  const { call, close } = await boot({ findShorts: async () => found });
  assert.equal((await call("/api/me", null, "")).status, 401);
  assert.equal((await call("/api/me")).body.hooks, 50);
  const niche = "A bakery in Helsinki selling cinnamon rolls";
  let r = await call("/api/search", { niche });
  assert.equal(r.body.charged, 30); assert.equal(r.body.hooks, 20);
  r = await call("/api/search", { niche });                       // 20 < 30
  assert.equal(r.status, 402);
  r = await call("/api/search", { niche, exclude: ["aaaaaaaaaaa"] }); // "ещё 10" стоит 20
  assert.equal(r.body.charged, 20); assert.equal(r.body.hooks, 0);
  found = [];
  store.credit(W, 30);
  r = await call("/api/search", { niche });                       // пусто - не списывается
  assert.equal(r.body.charged, 0); assert.equal(r.body.canInvent, true); assert.equal(r.body.hooks, 30);
  assert.equal((await call("/api/search", { niche: "short" })).status, 400);
  close();
});

test("analyze, ideas (first free), script charge once", async () => {
  const { call, close } = await boot({
    getVideo: async (id) => ({ id, title: "T", description: "", tags: [], views: 1, subs: 1, ratio: 5, seconds: 20 }),
    analyzeVideo: async () => ({ hook: "h", format: "f", structure: [], why: [] }),
    makeIdeas: async () => [{ title: "i1", description: "d" }],
    inventIdeas: async () => [{ title: "n1", description: "d" }],
    writeScript: async () => ({ hook: "h", beats: [], caption: "c" }),
  });
  let r = await call("/api/analyze", { videoId: "abcdefghijk", niche: "x".repeat(20) });
  assert.equal(r.body.hooks, 40);
  r = await call("/api/ideas", { videoId: "abcdefghijk", niche: "x".repeat(20), seconds: 10 });
  assert.equal(r.body.charged, 0); assert.equal(r.body.hooks, 40);
  r = await call("/api/ideas", { videoId: "abcdefghijk", niche: "x".repeat(20), seconds: 10 });
  assert.equal(r.body.charged, 10); assert.equal(r.body.hooks, 30);
  r = await call("/api/script", { niche: "x".repeat(20), seconds: 10, idea: { title: "i", description: "d" } });
  assert.equal(r.body.hooks, 25);
  r = await call("/api/ideas", { videoId: "invent", niche: "x".repeat(20), seconds: 10 });
  assert.equal(r.body.charged, 15); assert.equal(r.body.hooks, 10);
  close();
});

test("a failing model does not cost hooks", async () => {
  const { call, close } = await boot({ getVideo: async (id) => ({ id }), analyzeVideo: async () => { throw new Error("boom"); } });
  const r = await call("/api/analyze", { videoId: "abcdefghijk", niche: "x".repeat(20) });
  assert.equal(r.status, 502);
  assert.equal((await call("/api/me")).body.hooks, 50);
  close();
});

test("buying hooks: verified once, never twice", async () => {
  let ok = true;
  const { call, close } = await boot({ verifyPayment: async () => (ok ? { ok: true } : { ok: false, reason: "payment is smaller than the pack price" }) });
  const sig = "5".repeat(88);
  let r = await call("/api/buy/verify", { packId: "p100", signature: sig });
  assert.equal(r.body.hooks, 150); assert.equal(r.body.added, 100);
  r = await call("/api/buy/verify", { packId: "p100", signature: sig });   // повтор той же транзакции
  assert.equal(r.status, 409); assert.equal(r.body.hooks, 150);
  ok = false;
  r = await call("/api/buy/verify", { packId: "p20", signature: "6".repeat(88) });
  assert.equal(r.status, 402);
  assert.equal((await call("/api/buy/verify", { packId: "nope", signature: sig })).status, 400);
  close();
});
