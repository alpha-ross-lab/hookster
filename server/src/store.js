// Простое хранилище в JSON-файле (для хакатона). На бесплатном хостинге файл может сбрасываться при перезапуске.
import fs from "node:fs";
import { cfg } from "./config.js";

let db = { wallets: {}, sigs: {}, ideas: {} };
let timer = null;

export function load(file = cfg.dataFile) {
  try { db = { wallets: {}, sigs: {}, ideas: {}, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch { /* нет файла - начинаем с нуля */ }
}
function save(file = cfg.dataFile) {
  clearTimeout(timer);
  timer = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(db)); } catch { /* диск недоступен - живём в памяти */ } }, 300);
}
export function reset() { db = { wallets: {}, sigs: {}, ideas: {} }; }

export function wallet(addr) {
  if (!db.wallets[addr]) { db.wallets[addr] = { hooks: cfg.freeHooks, created: Date.now() }; save(); }
  return db.wallets[addr];
}
export function balance(addr) { return wallet(addr).hooks; }
export function canPay(addr, n) { return wallet(addr).hooks >= n; }
export function charge(addr, n) { const w = wallet(addr); w.hooks = Math.max(0, w.hooks - n); save(); return w.hooks; }
export function credit(addr, n) { const w = wallet(addr); w.hooks += n; save(); return w.hooks; }
export function sigUsed(sig) { return !!db.sigs[sig]; }
export function markSig(sig, addr) { db.sigs[sig] = { addr, t: Date.now() }; save(); }
export function ideasSeen(addr, videoId) { const k = addr + ":" + videoId; const seen = !!db.ideas[k]; db.ideas[k] = 1; save(); return seen; }
