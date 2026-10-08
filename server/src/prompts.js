// ПРОЕКТ: Hookster (хакатон Solana) — server/src/prompts.js
// Промпты. Язык ответа: английский по умолчанию, другой — только если ниша написана на нём.
import { ask, parseJson } from "./gemini.js";

const LANG = "OUTPUT LANGUAGE: English by default. Use another language ONLY if the user's niche description itself is clearly written in that language. Never choose the language from the source video's title, description or channel, and never from the app or phone locale.";
const SAFE = "Family-friendly only: no medical or health promises, no politics, no violence, no adult content, no fake statistics, no real private people.";

async function jsonCall(system, user, check, maxTokens, fetchFn) {
  let err;
  for (let i = 0; i < 2; i++) {
    try {
      const j = parseJson(await ask(system, user, { json: true, maxTokens, fetchFn }));
      if (check(j)) return j;
      err = new Error("model returned an unexpected structure");
    } catch (e) { err = e; }
  }
  throw err;
}
const str = (x) => typeof x === "string" && x.trim().length > 0;

export async function analyzeVideo(v, niche, fetchFn) {
  const system = `You are an analyst of viral short videos. You explain WHY a short video worked and how its hook is built. ${LANG} ${SAFE} You only have the video's metadata (title, description, tags, numbers), no transcript: base the analysis on that, never invent what is said or shown. Return JSON only.`;
  const user = `Niche of the user:\n"""${niche.slice(0, 800)}"""\n\nVideo:\n${JSON.stringify({ title: v.title, description: v.description, tags: v.tags, channel: v.channel, views: v.views, subscribers: v.subs, timesAboveChannelSize: v.ratio, seconds: v.seconds, ageDays: v.ageDays })}\n\nReturn {"hook": "how the hook is built, 1-2 sentences", "format": "the format in a few words", "structure": [exactly 5 objects {"name": "2-3 words", "text": "one sentence"}], "why": [4 to 6 short bullets: why it went viral]}`;
  return jsonCall(system, user, (j) => str(j.hook) && str(j.format) && Array.isArray(j.structure) && j.structure.length >= 3 && Array.isArray(j.why) && j.why.length >= 2, 1400, fetchFn);
}

const ideaShape = (j) => Array.isArray(j.ideas) && j.ideas.length >= 3 && j.ideas.every((i) => str(i.title) && str(i.description));

export async function makeIdeas({ niche, seconds, analysis, avoid = [] }, fetchFn) {
  const system = `You are a short-video strategist. You adapt a proven viral mechanism to the user's own niche and propose 5 different video ideas. ${LANG} ${SAFE} Return JSON only.`;
  const user = `Niche of the user:\n"""${niche.slice(0, 800)}"""\n\nVideo length: ${seconds} seconds.\n\nProven mechanism to adapt:\n${JSON.stringify(analysis || {})}\n\nIdeas already shown (do not repeat): ${JSON.stringify(avoid.slice(0, 20))}\n\nReturn {"ideas": [5 objects {"title": "short title", "description": "2 sentences: what is on screen and what the voice says, in the first second the hook", "why": "one sentence: why this works"}]}`;
  const j = await jsonCall(system, user, ideaShape, 1800, fetchFn);
  return j.ideas.slice(0, 5);
}

export async function inventIdeas({ niche, seconds, avoid = [] }, fetchFn) {
  const system = `You are a short-video strategist who invents fresh hook-first video ideas for a niche. ${LANG} ${SAFE} Return JSON only.`;
  const user = `Niche of the user:\n"""${niche.slice(0, 800)}"""\n\nVideo length: ${seconds} seconds.\nIdeas already shown (do not repeat): ${JSON.stringify(avoid.slice(0, 20))}\n\nReturn {"ideas": [5 objects {"title": "short title", "description": "2 sentences: what is on screen and what the voice says, in the first second the hook", "why": "one sentence: why this works"}]}`;
  const j = await jsonCall(system, user, ideaShape, 1800, fetchFn);
  return j.ideas.slice(0, 5);
}

export async function writeScript({ niche, seconds, idea }, fetchFn) {
  const words = Math.max(12, Math.round(seconds * 2.5));
  const system = `You write ready-to-shoot scripts for short vertical videos. ${LANG} ${SAFE} The voice-over of the whole video is about ${words} words. Return JSON only.`;
  const user = `Niche of the user:\n"""${niche.slice(0, 800)}"""\nVideo length: ${seconds} seconds.\nIdea:\n${JSON.stringify(idea)}\n\nReturn {"hook": "the on-screen text of the first second, max 12 words", "beats": [3 to 6 objects {"time": "0-3s", "visual": "what is on screen", "voice": "what is said, may be empty"}], "caption": "post caption, 2-4 short lines, ends with a question", "hashtags": [5 hashtags]}`;
  return jsonCall(system, user, (j) => str(j.hook) && Array.isArray(j.beats) && j.beats.length >= 2 && str(j.caption), 1500, fetchFn);
}
