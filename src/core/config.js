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

  // Interaktiv suhbat: guruhda "Rita/Layla/Debra, ..." deb chaqirish
  chat: {
    enabled: process.env.ENABLE_CHAT !== '0',
    groupChatId: process.env.GROUP_CHAT_ID || '',
    // persona kaliti → bot tokeni
    tokens: {
      rita: process.env.RADAR_BOT_TOKEN,
      layla: process.env.LINGO_BOT_TOKEN,
      debra: process.env.KOTIB_BOT_TOKEN,
    },
  },

  // Gemini — ovozli xabarni matnga o'girish (bepul)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  // Layla — 30 kunlik ingliz tili kursi
  lingo: {
    cron: process.env.CRON_LESSON || '0 10 * * *',
  },

  // Debra — Railway serverlar nazorati
  railway: {
    token: process.env.RAILWAY_API_TOKEN || '',
    cron: process.env.CRON_SERVERS || '30 8 * * *',
  },

  // Debra — Telegram Business (lichka xabarlari)
  business: {
    autoReply: process.env.BUSINESS_AUTOREPLY === '1',
    ownerId: Number(process.env.BUSINESS_OWNER_ID) || null,
    autoReplyText:
      process.env.BUSINESS_AUTOREPLY_TEXT ||
      'Salom! Men Dilmurodning AI yordamchisiman 🤖 Xabaringizni unga yetkazdim — tez orada javob beradi. Shoshilinch bo\'lsa shu yerga yozib qoldiring.',
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
