// ПРОЕКТ: Hookster (хакатон Solana) — app/src/config.ts
import Constants from 'expo-constants';
// Server URL: set in app.json -> expo.extra.apiBase (or EXPO_PUBLIC_API_BASE at build time)
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE || (Constants.expoConfig?.extra as any)?.apiBase || 'http://10.0.2.2:8787';
export const APP_IDENTITY = { name: 'Hookster', uri: 'https://github.com/alpha-ross-lab/hookster', icon: 'favicon.ico' };
