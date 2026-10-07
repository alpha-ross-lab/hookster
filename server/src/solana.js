// Проверка перевода SOL: берём транзакцию из RPC и убеждаемся, что кошелёк заплатил на кошелёк сервиса.
import { cfg } from "./config.js";

export const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export async function rpc(method, params, fetchFn = fetch) {
  const r = await fetchFn(cfg.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

export function checkTransfer(tx, { from, to, minLamports, now = Date.now() }) {
  if (!tx) return { ok: false, reason: "transaction not found yet" };
  if (tx.meta && tx.meta.err) return { ok: false, reason: "transaction failed" };
  if (tx.blockTime && now / 1000 - tx.blockTime > 3 * 86400) return { ok: false, reason: "transaction too old" };
  const ixs = (tx.transaction?.message?.instructions || []);
  let paid = 0;
  for (const ix of ixs) {
    const p = ix.parsed;
    if (ix.program === "system" && p?.type === "transfer" && p.info?.source === from && p.info?.destination === to) paid += Number(p.info.lamports || 0);
  }
  if (paid < minLamports) return { ok: false, reason: "payment is smaller than the pack price" };
  return { ok: true, paid };
}

export async function verifyPayment(signature, from, minLamports, fetchFn = fetch) {
  if (!SIG_RE.test(signature)) return { ok: false, reason: "bad signature" };
  const tx = await rpc("getTransaction", [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }], fetchFn);
  return checkTransfer(tx, { from, to: cfg.treasury, minLamports });
}
