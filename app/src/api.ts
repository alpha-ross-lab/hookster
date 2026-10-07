import { API_BASE } from './config';

export type Pack = { id: string; lamports: number; hooks: number };
export type Cfg = { cluster: string; rpc: string; treasury: string; packs: Pack[]; cost: Record<string, number>; freeHooks: number };
export type Short = { id: string; title: string; channel: string; views: number; subs: number; seconds: number; ageDays: number; ratio: number; url: string; thumb: string };
export type Analysis = { hook: string; format: string; structure: { name: string; text: string }[]; why: string[] };
export type Idea = { title: string; description: string; why?: string };
export type Script = { hook: string; beats: { time: string; visual: string; voice: string }[]; caption: string; hashtags: string[] };

export class ApiError extends Error { status: number; body: any; constructor(m: string, s: number, b: any) { super(m); this.status = s; this.body = b; } }

let wallet = '';
export const setWallet = (w: string) => { wallet = w; };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(API_BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-wallet': wallet },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || `HTTP ${r.status}`, r.status, j);
  return j as T;
}

export const getConfig = () => call<Cfg>('/api/config');
export const getMe = () => call<{ hooks: number }>('/api/me');
export const search = (niche: string, exclude: string[]) =>
  call<{ items: Short[]; charged: number; hooks: number; canInvent?: boolean }>('/api/search', { niche, exclude });
export const analyze = (videoId: string, niche: string) =>
  call<{ video: Short; analysis: Analysis; hooks: number }>('/api/analyze', { videoId, niche });
export const ideas = (p: { niche: string; seconds: number; videoId: string; analysis?: Analysis; avoid?: string[] }) =>
  call<{ ideas: Idea[]; charged: number; hooks: number }>('/api/ideas', p);
export const script = (p: { niche: string; seconds: number; idea: Idea }) =>
  call<{ script: Script; hooks: number }>('/api/script', p);
export const verifyBuy = (packId: string, signature: string) =>
  call<{ hooks: number; added: number }>('/api/buy/verify', { packId, signature });
