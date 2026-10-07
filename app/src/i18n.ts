import { getLocales } from 'expo-localization';

const ru = {
  tagline: 'Находим залетевшие Shorts и пишем твой сценарий',
  connect: 'Подключить кошелёк', connecting: 'Подключаем…',
  connectHint: 'Нужен Phantom или Solflare на этом телефоне (devnet).',
  hooks: 'крючков', buy: 'Купить', niche: 'Опиши свой бизнес или канал',
  nichePh: 'Например: студия йоги в Варшаве, короткие уроки для новичков', find: 'Найти залетевшие видео',
  searching: 'Ищем…', noResults: 'Ничего не нашли. Попробуй описать иначе или придумай идею с нуля.',
  invent: 'Придумать идеи с нуля', more: 'Показать ещё', times: '× от размера канала', views: 'просмотров',
  analyze: 'Разобрать', analyzing: 'Разбираем…', hook: 'Крючок', format: 'Формат', structure: 'Структура', why: 'Почему залетел',
  length: 'Длина видео, сек (10–300)', makeIdeas: 'Идеи для меня', ideas: 'Идеи', reroll: 'Другие идеи', script: 'Сценарий',
  writing: 'Пишем…', caption: 'Подпись', beats: 'Раскадровка', copy: 'Копировать', copied: 'Скопировано', back: 'Назад',
  free: 'бесплатно', cost: 'Стоимость', packs: 'Пакеты крючков', pay: 'Оплатить SOL (devnet)', paying: 'Ждём кошелёк…',
  confirming: 'Проверяем платёж…', bought: 'Крючки начислены', notEnough: 'Не хватает крючков', error: 'Ошибка', disconnect: 'Выйти',
  open: 'Открыть видео', pending: 'Платёж ещё не подтверждён. Нажми «Проверить» через несколько секунд.', recheck: 'Проверить',
};
const en: typeof ru = {
  tagline: 'Find viral Shorts and get your own script',
  connect: 'Connect wallet', connecting: 'Connecting…',
  connectHint: 'Requires Phantom or Solflare on this phone (devnet).',
  hooks: 'hooks', buy: 'Buy', niche: 'Describe your business or channel',
  nichePh: 'e.g. yoga studio in Warsaw, short lessons for beginners', find: 'Find viral videos',
  searching: 'Searching…', noResults: 'Nothing found. Rephrase it, or invent ideas from scratch.',
  invent: 'Invent ideas from scratch', more: 'Show more', times: '× channel size', views: 'views',
  analyze: 'Break down', analyzing: 'Analyzing…', hook: 'Hook', format: 'Format', structure: 'Structure', why: 'Why it went viral',
  length: 'Video length, sec (10–300)', makeIdeas: 'Ideas for me', ideas: 'Ideas', reroll: 'More ideas', script: 'Script',
  writing: 'Writing…', caption: 'Caption', beats: 'Storyboard', copy: 'Copy', copied: 'Copied', back: 'Back',
  free: 'free', cost: 'Cost', packs: 'Hook packs', pay: 'Pay with SOL (devnet)', paying: 'Waiting for wallet…',
  confirming: 'Verifying payment…', bought: 'Hooks added', notEnough: 'Not enough hooks', error: 'Error', disconnect: 'Sign out',
  open: 'Open video', pending: 'Payment not confirmed yet. Tap "Check" in a few seconds.', recheck: 'Check',
};
export type Strings = typeof ru;
export const lang: 'ru' | 'en' = (getLocales()[0]?.languageCode || 'en').startsWith('ru') ? 'ru' : 'en';
export const t: Strings = lang === 'ru' ? ru : en;
