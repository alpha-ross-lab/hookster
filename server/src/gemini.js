// ПРОЕКТ: Hookster (хакатон Solana) — server/src/gemini.js
// Gemini: самые дешёвые модели первыми, ключи по очереди. Без ключа сервер всё равно запускается (ошибка понятным текстом).
import { cfg } from "./config.js";

let thinkingOff = false;

async function call(model, key, system, user, json, maxTokens, fetchFn) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.7 };
    if (json) generationConfig.responseMimeType = "application/json";
    if (!thinkingOff) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const r = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 400 && !thinkingOff) { thinkingOff = true; continue; }
    if (!r.ok) throw new Error(`${model}: HTTP ${r.status} ${JSON.stringify(data).slice(0, 160)}`);
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text.trim()) throw new Error(`${model}: empty answer`);
    return text;
  }
  throw new Error(`${model}: failed`);
}

async function callClaude(key, system, user, maxTokens, fetchFn) {
  const r = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.claudeModel, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`claude: HTTP ${r.status} ${JSON.stringify(data).slice(0, 160)}`);
  const text = (data.content || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("claude: empty answer");
  return text;
}

export async function ask(system, user, { json = false, maxTokens = 2000, fetchFn = fetch } = {}) {
  if (!cfg.geminiKeys.length && !cfg.claudeKeys.length) throw new Error("no AI keys on the server (Gemini or Claude)");
  let last = null;
  for (const key of cfg.geminiKeys) {
    for (const model of cfg.geminiModels) {
      try { return await call(model, key, system, user, json, maxTokens, fetchFn); } catch (e) { last = e; }
    }
  }
  // запасной вариант: Claude (когда Gemini недоступен или кончилась квота)
  for (const key of cfg.claudeKeys) {
    try { return await callClaude(key, system, user, maxTokens, fetchFn); } catch (e) { last = e; }
  }
  throw last || new Error("AI unavailable");
}

export function parseJson(text) {
  const t = String(text || "").replace(/^```(?:json)?|```$/gm, "").trim();
  try { return JSON.parse(t); } catch { /* ищем первый JSON внутри текста */ }
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw new Error("model did not return JSON");
  return JSON.parse(m[0]);
}
