// ПРОЕКТ: Hookster (хакатон Solana) — server/src/config.js
// Все настройки сервера. Секреты - только из переменных окружения, в приложение они не попадают.
const list = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

export const cfg = {
  port: Number(process.env.PORT || 8787),
  geminiKeys: list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY),
  // самые дешёвые модели Gemini первыми (flash-lite), обычный flash - запасной
  geminiModels: list(process.env.GEMINI_MODELS) .length ? list(process.env.GEMINI_MODELS) : ["gemini-flash-lite-latest", "gemini-flash-latest"],
  claudeKeys: list(process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY),
  claudeModel: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001", // самая дешёвая
  driveFolderId: process.env.DRIVE_FOLDER_ID || "",
  driveApiKey: process.env.DRIVE_API_KEY || "",
  youtubeKey: process.env.YOUTUBE_API_KEY || "",
  cluster: process.env.SOLANA_CLUSTER || "devnet",
  rpc: process.env.SOLANA_RPC || "https://api.devnet.solana.com",
  treasury: process.env.TREASURY_ADDRESS || "",
  dataFile: process.env.DATA_FILE || "./data.json",
  freeHooks: Number(process.env.FREE_HOOKS || 50),
  // цена действий в "хуках"
  cost: { search: 30, searchMore: 20, analyze: 10, ideasReroll: 10, script: 5, invent: 15 },
  // пакеты хуков за SOL (на devnet SOL бесплатный - для демо; цены можно менять)
  packs: [
    { id: "p20", hooks: 20, lamports: 10_000_000 },
    { id: "p100", hooks: 100, lamports: 40_000_000 },
    { id: "p300", hooks: 300, lamports: 100_000_000 },
    { id: "p1000", hooks: 1000, lamports: 300_000_000 },
  ],
  maxShortSeconds: 90,
  minRatio: 2,
};
