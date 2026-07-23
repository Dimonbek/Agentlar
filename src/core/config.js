import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`.env da ${name} yo'q`);
  return v;
}

function num(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  tz: process.env.TZ || 'Asia/Tashkent',

  llm: {
    apiKey: req('ANTHROPIC_API_KEY'),
    model: process.env.LLM_MODEL || 'claude-opus-4-8',
    effort: process.env.LLM_EFFORT || 'medium',
  },

  radar: {
    token: req('RADAR_BOT_TOKEN'),
    chatId: req('GROUP_CHAT_ID'),
    newsTopicId: num('TOPIC_NEWS_ID', undefined),
    ideasTopicId: num('TOPIC_IDEAS_ID', undefined),
    cronNews: process.env.CRON_NEWS || '0 9 * * *',
    cronIdea: process.env.CRON_IDEA || '0 20 * * *',
    newsCount: num('NEWS_COUNT', 5),
    windowHours: num('NEWS_WINDOW_HOURS', 36),
  },
};
