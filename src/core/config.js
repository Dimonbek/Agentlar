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

  // Qaysi agentlar ishlaydi (vergul bilan). Hozircha faqat Debra —
  // Rita va Layla dam olmoqda. Qaytarish: ACTIVE_AGENTS=debra,rita,layla
  activeAgents: (process.env.ACTIVE_AGENTS || 'debra')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  // Interaktiv suhbat: guruhda "Rita/Layla/Debra, ..." deb chaqirish
  chat: {
    enabled: process.env.ENABLE_CHAT !== '0',
    groupChatId: process.env.GROUP_CHAT_ID || '',
    // persona kaliti → bot tokeni
    tokens: {
      rita: process.env.RADAR_BOT_TOKEN,
      layla: process.env.LINGO_BOT_TOKEN,
      debra: process.env.KOTIB_BOT_TOKEN,
      sara: process.env.SARA_BOT_TOKEN,
    },
  },

  // Gemini — ovozli xabarni matnga o'girish (asosiy)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  // Groq — ovoz uchun zaxira (Gemini limitga urilganda)
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    // Ovoz tili. Bo'sh qoldirilsa avtomatik aniqlanadi (lekin o'zbekcha
    // turk/ozarbayjon bilan chalkashadi), shuning uchun default 'uz'.
    language: process.env.STT_LANGUAGE ?? 'uz',
  },

  // Layla — obunalar va to'lov eslatmalari
  obuna: {
    cron: process.env.CRON_OBUNA || '0 9 * * *',          // har kuni 09:00
    oylikCron: process.env.CRON_OBUNA_OYLIK || '0 10 1 * *', // har oy 1-sanada
    // Necha kun qolganda eslatilsin (o'tib ketgani doim eslatiladi)
    kunlar: (process.env.OBUNA_KUNLAR || '7,3,1')
      .split(',').map((s) => Number(s.trim())).filter(Number.isFinite),
    seedFile: process.env.OBUNA_SEED || 'data/obunalar.json',
  },

  // Debra — Railway (faqat chatdagi buyruqlar uchun qoldi)
  railway: {
    token: process.env.RAILWAY_API_TOKEN || '',
  },

  // Debra — hisobotlar
  hisobot: {
    kunlik: process.env.CRON_KUNLIK || '30 8 * * *',       // har kuni 08:30
    haftalik: process.env.CRON_HAFTALIK || '0 20 * * 0',   // yakshanba 20:00
    // Yiqilgan loyiha shuncha soatdan keyin ham tuzalmasa — qayta eslatma
    eslatmaSoat: num('ESLATMA_SOAT', 3),
    eslatmaCron: process.env.CRON_ESLATMA || '10 * * * *', // har soat 10-daqiqada
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
  },

  // Rita — loyihalar nazorati (HTTP ping)
  monitor: {
    cron: process.env.CRON_PING || '*/30 * * * *',
    timeoutMs: num('PING_TIMEOUT_MS', 10_000),
    // Shundan sekin javob "warn" deb belgilanadi (xabar yuborilmaydi)
    slowMs: num('PING_SLOW_MS', 1500),
    // Birinchi urinish yiqilsa shuncha marta qayta uriladi — bir lahzalik
    // uzilish uchun keyingi tekshiruvgacha kutib o'tirmaslik uchun
    retries: num('PING_RETRIES', 1),
    retryDelayMs: num('PING_RETRY_DELAY_MS', 4000),
    // Ketma-ket shuncha marta yiqilgandan keyin Telegramga xabar ketadi
    failStreak: num('PING_FAIL_STREAK', 1),
    concurrency: num('PING_CONCURRENCY', 6),
    // Konteyner shundan yaqin ko'tarilgan bo'lsa "hozirgina qayta ishga tushdi"
    freshRestartMs: num('DOCKER_FRESH_RESTART_MS', 120_000),
    keepDays: num('PING_KEEP_DAYS', 30),
    seedFile: process.env.PROJECTS_SEED || 'data/projects.json',
  },

  // Sara — loyihalardagi xatoliklarni jurnaldan topadi
  sara: {
    // Alohida bot bo'lmasa Ritaning boti bilan yuboradi
    token: process.env.SARA_BOT_TOKEN || req('RADAR_BOT_TOKEN'),
    cron: process.env.CRON_XATO || '*/15 * * * *',
    // Har tekshiruvda jurnalning shuncha oxirgi daqiqasi o'qiladi.
    // Cron oralig'idan kattaroq — qator yo'qolib qolmasin.
    oynaDaqiqa: num('XATO_OYNA_DAQIQA', 20),
    // Avval ko'rilgan xato shuncha marta takrorlansa — qayta aytiladi
    portlash: num('XATO_PORTLASH', 50),
    // O'sha xato haqida qayta aytishdan oldingi tinchlik (soat)
    qaytaSoat: num('XATO_QAYTA_SOAT', 6),
    // Bir xabarda nechta xato turi (qolgani bazada qoladi)
    birMarta: num('XATO_BIR_MARTA', 5),
    keepDays: num('XATO_KEEP_DAYS', 30),
    // Jim ro'yxat — o'z-o'zidan tuzaladigan o'tkinchi uzilishlar. Haqiqiy
    // jurnallarda tekshirilgan: hisobot-kunlik-botda 478 xatodan 469 tasi
    // shu "fetch failed", kgf-resume-botda 31 tadan 31 tasi Telegram tarmoq
    // uzilishi. Bular haqida xabar bersa, Sara foydasiz shovqinga aylanadi.
    jim: [
      // Telegram polling uzilishlari — bot o'zi qayta ulanadi
      /Polling tarmoq uzilishi/i,
      /TelegramNetworkError/i,
      /TelegramServerError/i,
      /getUpdates xatosi/i,
      /Failed to fetch updates/i,
      /fetch failed$/i,
      /Bad Gateway/i,
      // Brauzer har kirganda so'raydi, sayt ishlashiga ta'sir qilmaydi
      /favicon\.ico/i,
      /robots\.txt|apple-touch-icon|\.well-known/i,
      // Brauzerning o'zi so'rovni bekor qilgan (boshqa sahifaga o'tdi).
      // Caddy jurnalida tekshirilgan: logo va ikonka yuklanishlari.
      /H3_REQUEST_CANCELLED|REQUEST_CANCELLED/i,
      /aborting with incomplete response/i,
      /client canceled|context canceled|broken pipe/i,
    ],
  },

  // Ofis sahifasi. Tashqariga to'g'ridan-to'g'ri chiqmaydi — Caddy parol
  // bilan uzatadi. Caddy konteyner ichida bo'lgani uchun host ko'pincha
  // docker ko'prigining shlyuzi bo'ladi (masalan 172.19.0.1).
  web: {
    enabled: process.env.ENABLE_WEB !== '0',
    host: process.env.WEB_HOST || '127.0.0.1',
    port: num('WEB_PORT', 4200),
    avatarDir: process.env.AVATAR_DIR || 'public/avatar',
  },
};
