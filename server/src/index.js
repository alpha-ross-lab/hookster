// ПРОЕКТ: Hookster (хакатон Solana) — server/src/index.js
import express from "express";
import { cfg } from "./config.js";
import * as store from "./store.js";
import { findShorts, getVideo } from "./youtube.js";
import { analyzeVideo, makeIdeas, inventIdeas, writeScript } from "./prompts.js";
import { startKeyRefresh } from "./keys.js";
import { verifyPayment, ADDR_RE } from "./solana.js";

export function createApp(deps = {}) {
  const d = { findShorts, getVideo, analyzeVideo, makeIdeas, inventIdeas, writeScript, verifyPayment, ...deps };
  const app = express();
  app.use(express.json({ limit: "30kb" }));
  app.use((req, res, next) => {
    res.set({ "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-wallet", "access-control-allow-methods": "GET,POST,OPTIONS" });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // простой лимит запросов с одного адреса: 60 в минуту
  const hits = new Map();
  app.use((req, res, next) => {
    const k = req.ip, now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < 60000);
    arr.push(now); hits.set(k, arr);
    if (arr.length > 60) return res.status(429).json({ error: "too many requests" });
    next();
  });

  const analysisCache = new Map();

  const needWallet = (req, res, next) => {
    const w = String(req.get("x-wallet") || "");
    if (!ADDR_RE.test(w)) return res.status(401).json({ error: "connect a wallet first" });
    req.wallet = w; next();
  };
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e.message); res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
  };
  // списать хуки только после успешного результата
  const needHooks = (n) => (req, res, next) => {
    if (!store.canPay(req.wallet, n)) return res.status(402).json({ error: "not enough hooks", need: n, have: store.balance(req.wallet) });
    next();
  };
  const cleanNiche = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  const cleanSeconds = (s) => Math.min(300, Math.max(10, Math.round(Number(s) || 10)));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/config", (_req, res) => res.json({ cluster: cfg.cluster, rpc: cfg.rpc, treasury: cfg.treasury, packs: cfg.packs, cost: cfg.cost, freeHooks: cfg.freeHooks }));
  app.get("/api/me", needWallet, (req, res) => res.json({ hooks: store.balance(req.wallet) }));

  app.post("/api/search", needWallet, (req, res, next) => needHooks((req.body?.exclude || []).length ? cfg.cost.searchMore : cfg.cost.search)(req, res, next), wrap(async (req, res) => {
    const niche = cleanNiche(req.body?.niche);
    if (niche.length < 10) return res.status(400).json({ error: "describe your business or channel in a sentence or two" });
    const exclude = (Array.isArray(req.body?.exclude) ? req.body.exclude : []).map(String).filter((x) => /^[\w-]{6,20}$/.test(x)).slice(0, 100);
    const price = exclude.length ? cfg.cost.searchMore : cfg.cost.search;
    const items = await d.findShorts(niche, exclude);
    if (!items.length) return res.json({ items: [], charged: 0, hooks: store.balance(req.wallet), canInvent: true });
    const hooks = store.charge(req.wallet, price);
    res.json({ items, charged: price, hooks });
  }));

  app.post("/api/analyze", needWallet, needHooks(cfg.cost.analyze), wrap(async (req, res) => {
    const id = String(req.body?.videoId || "");
    if (!/^[\w-]{6,20}$/.test(id)) return res.status(400).json({ error: "bad video id" });
    const niche = cleanNiche(req.body?.niche);
    const video = await d.getVideo(id);
    if (!video) return res.status(404).json({ error: "video not found" });
    const ck = id + "|" + niche.slice(0, 40);
    let analysis = analysisCache.get(ck);
    if (!analysis) { analysis = await d.analyzeVideo(video, niche); analysisCache.set(ck, analysis); if (analysisCache.size > 300) analysisCache.delete(analysisCache.keys().next().value); }
    const hooks = store.charge(req.wallet, cfg.cost.analyze);
    res.json({ video, analysis, hooks });
  }));

  // первые 5 идей по видео бесплатны, "ещё пять" стоят ideasReroll
  app.post("/api/ideas", needWallet, wrap(async (req, res) => {
    const niche = cleanNiche(req.body?.niche), seconds = cleanSeconds(req.body?.seconds);
    const videoId = String(req.body?.videoId || "invent");
    const avoid = (Array.isArray(req.body?.avoid) ? req.body.avoid : []).map(String).slice(0, 20);
    const again = store.ideasSeen(req.wallet, videoId + ":" + seconds);
    const price = videoId === "invent" ? cfg.cost.invent : again ? cfg.cost.ideasReroll : 0;
    if (!store.canPay(req.wallet, price)) return res.status(402).json({ error: "not enough hooks", need: price, have: store.balance(req.wallet) });
    const ideas = videoId === "invent" ? await d.inventIdeas({ niche, seconds, avoid }) : await d.makeIdeas({ niche, seconds, analysis: req.body?.analysis, avoid });
    const hooks = price ? store.charge(req.wallet, price) : store.balance(req.wallet);
    res.json({ ideas, charged: price, hooks });
  }));

  app.post("/api/script", needWallet, needHooks(cfg.cost.script), wrap(async (req, res) => {
    const idea = req.body?.idea;
    if (!idea || typeof idea.title !== "string") return res.status(400).json({ error: "idea is required" });
    const script = await d.writeScript({ niche: cleanNiche(req.body?.niche), seconds: cleanSeconds(req.body?.seconds), idea: { title: idea.title.slice(0, 200), description: String(idea.description || "").slice(0, 600) } });
    const hooks = store.charge(req.wallet, cfg.cost.script);
    res.json({ script, hooks });
  }));

  app.post("/api/buy/verify", needWallet, wrap(async (req, res) => {
    const pack = cfg.packs.find((p) => p.id === req.body?.packId);
    const sig = String(req.body?.signature || "");
    if (!pack) return res.status(400).json({ error: "unknown pack" });
    if (!cfg.treasury) return res.status(500).json({ error: "server treasury address is not configured" });
    if (store.sigUsed(sig)) return res.status(409).json({ error: "this payment was already counted", hooks: store.balance(req.wallet) });
    const r = await d.verifyPayment(sig, req.wallet, pack.lamports);
    if (!r.ok) return res.status(402).json({ error: r.reason, pending: /not found/.test(r.reason) });
    store.markSig(sig, req.wallet);
    const hooks = store.credit(req.wallet, pack.hooks);
    res.json({ hooks, added: pack.hooks });
  }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  store.load();
  startKeyRefresh();
  createApp().listen(cfg.port, () => console.log(`Hookster server on :${cfg.port} (${cfg.cluster})`));
}
