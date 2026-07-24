import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { detectPersona } from './personas.js';
import { speechToText } from './stt.js';
import { respond } from './brain.js';
import { splitMessage } from './telegram.js';
import { addHistory, getHistory } from './db.js';
import { debraTools, runDebraTool } from '../agents/kotib/tools.js';
import { log } from './logger.js';

/** LLM'ga beriladigan suhbat tarixi uzunligi (≈30 savol-javob). */
const HISTORY_LIMIT = 60;

/** Telegram HTML'da ruxsat etilgan teglar. */
const ALLOWED_TAGS = /<\/?(b|strong|i|em|u|s|code|pre)>/gi;
/** Teglarni vaqtincha almashtirish uchun matnda uchramaydigan belgi. */
const MARK = '@@TAG';

/**
 * Model javobini Telegram HTML'ga tayyorlaydi:
 *  - markdown (**qalin**, ###, "- ") ni HTML/belgilarga o'giradi
 *  - ruxsat etilgan teglarni saqlab, qolgan < > & belgilarini xavfsizlaydi
 * Shu tufayli javob chiroyli chiqadi va noto'g'ri belgi Telegram'ni yiqitmaydi.
 */
function tidy(text) {
  let t = String(text ?? '');

  // Markdown -> HTML
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/__([^_\n]+)__/g, '<b>$1</b>');
  t = t.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  // Ro'yxat chiziqchalarini nuqtaga almashtiramiz
  t = t.replace(/^[ \t]*[-*][ \t]+/gm, '• ');

  // Ruxsat etilgan teglarni vaqtincha chetga olamiz (matndagi raqamlarga tegmasin)
  const saved = [];
  t = t.replace(ALLOWED_TAGS, (m) => {
    saved.push(m);
    return `${MARK}${saved.length - 1}${MARK}`;
  });
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, i) => saved[Number(i)] ?? '');

  return t.trim();
}

/** HTML ishlamasa — teglarsiz toza matn. */
function stripTags(text) {
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Chaqiruv so'zini matn boshidan olib tashlaydi: "Rita, salom" -> "salom". */
function stripTrigger(text, persona) {
  const re = new RegExp(`^\\s*(${persona.triggers.join('|')})\\s*[,!.:—-]*\\s*`, 'i');
  return text.replace(re, '').trim();
}

/**
 * Ovoz transkripsiyasi keshi.
 * Uchala bot bir xil xabarni oladi — kesh bo'lmasa bitta ovoz 3 marta
 * yuborilib, bepul kvota 3x tez tugaydi. Shu yerda birinchi bot
 * so'rov qiladi, qolganlari o'sha natijani kutadi.
 */
const voiceCache = new Map(); // file_unique_id -> { promise, at }
const VOICE_CACHE_TTL = 10 * 60_000;

/** Kvota ogohlantirishi oxirgi marta qachon yuborilgani (takror spam bo'lmasin). */
let quotaWarnedAt = 0;

function cacheGet(key) {
  const hit = voiceCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > VOICE_CACHE_TTL) {
    voiceCache.delete(key);
    return null;
  }
  return hit.promise;
}

/** Telegram voice/audio obyektini yuklab, matnga o'giradi (Gemini -> Groq zanjiri). */
async function voiceToText(ctx, v) {
  if (!v) return '';
  if (!config.gemini.apiKey && !config.groq.apiKey) return '';

  const key = v.file_unique_id || v.file_id;
  const cached = cacheGet(key);
  if (cached) return cached;

  const promise = (async () => {
    const link = await ctx.telegram.getFileLink(v.file_id);
    const res = await fetch(link.href);
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    // stt.js o'zi Gemini -> Groq zanjirini boshqaradi
    return speechToText(b64, v.mime_type || 'audio/ogg');
  })();

  voiceCache.set(key, { promise, at: Date.now() });
  // Xato bo'lsa keshda "yiqilgan promise" qolib ketmasin
  promise.catch(() => voiceCache.delete(key));
  return promise;
}

/**
 * Bitta persona uchun tinglaydigan bot yaratadi.
 * Javob beradi, agar:
 *  - xabar "Rita/Layla/Debra, ..." bilan boshlansa, YOKI
 *  - foydalanuvchi shu botning xabariga reply qilsa.
 * Reply qilingan xabar (matn yoki ovoz) kontekst sifatida qo'shiladi.
 */
export function createChatBot(persona, token) {
  const bot = new Telegraf(token);

  bot.on('message', async (ctx) => {
    try {
      if (String(ctx.chat.id) !== String(config.chat.groupChatId)) return;

      const msg = ctx.message;
      const replyTo = msg.reply_to_message;
      const myId = ctx.botInfo?.id;
      const isReplyToMe = !!(replyTo && myId && replyTo.from?.id === myId);

      // Asosiy xabar matni (ovoz bo'lsa transkripsiya)
      let text = msg.text || msg.caption || '';
      const hasVoice = !!(msg.voice || msg.audio);
      if (hasVoice) {
        text = await voiceToText(ctx, msg.voice || msg.audio);
        if (!text) {
          // Tushunilmadi: agar menga reply bo'lsa xabar beramiz, aks holda jimgina o'tamiz
          // (chaqiruv ovoz ichida bo'lgani uchun kimga tegishli ekani noma'lum)
          if (isReplyToMe) {
            await ctx.reply('Ovozingni tushunolmadim — biroz balandroq yoki matn bilan yozib ko\'r.', {
              reply_parameters: { message_id: msg.message_id },
            });
          } else {
            log.warn(`${persona.name}: ovozli xabar tushunilmadi (bo'sh transkripsiya)`);
          }
          return;
        }
      }

      // Bu xabar menga tegishlimi?
      const called = detectPersona(text);
      let query;
      if (called && called.agent === persona.agent) {
        query = stripTrigger(text, called);
      } else if (isReplyToMe) {
        query = text; // mening xabarimga reply — chaqiruvsiz javob beraman
      } else {
        return; // chaqiruv meniki emas va reply ham menga emas
      }

      // Reply qilingan xabarni kontekstga qo'shamiz (ovozga "eshit va ayt" shu yerda ishlaydi)
      let context = '';
      if (replyTo) {
        const rv = replyTo.voice || replyTo.audio;
        if (rv) {
          const rt = await voiceToText(ctx, rv);
          if (rt) context = `\n\n[Yuqoridagi ovozli xabar matni]:\n${rt}`;
        } else if (!isReplyToMe && (replyTo.text || replyTo.caption)) {
          context = `\n\n[Javob berilgan xabar]:\n${replyTo.text || replyTo.caption}`;
        }
      }

      let fullQuery = (query + context).trim();
      // Yolg'iz chaqirilgan bo'lsa ham qolipli javob emas — modeldan tabiiy javob olamiz
      if (!fullQuery) {
        fullQuery = '(Dexter seni ismingni aytib chaqirdi, hali hech narsa so\'ramadi. ' +
          'Bir og\'iz tabiiy javob ber — har safar boshqacha, qolipsiz.)';
      }

      log.info(`${persona.name} <- "${query.slice(0, 50)}"${hasVoice ? ' (ovoz)' : ''}${context ? ' +kontekst' : ''}`);
      await ctx.sendChatAction('typing');

      const chatId = ctx.chat.id;
      const history = getHistory(persona.agent, chatId, HISTORY_LIMIT);

      // Debra lichka xabarlari va serverlar bazasiga murojaat qila oladi
      const isDebra = persona.agent === 'kotib';
      const answer = await respond({
        persona,
        userText: fullQuery,
        history,
        tools: isDebra ? debraTools : [],
        runTool: isDebra ? (n, i) => runDebraTool(n, i, { bot }) : null,
      });

      // Xotiraga yozamiz — keyingi safar shu suhbatni eslaydi
      addHistory(persona.agent, chatId, 'user', fullQuery);
      addHistory(persona.agent, chatId, 'assistant', answer);

      const prefix = hasVoice ? `🎤 «${text.slice(0, 120)}»\n\n` : '';

      for (const chunk of splitMessage(tidy(prefix + answer))) {
        const opts = {
          reply_parameters: { message_id: msg.message_id },
          link_preview_options: { is_disabled: true },
        };
        try {
          await ctx.reply(chunk, { ...opts, parse_mode: 'HTML' });
        } catch {
          // Model noto'g'ri HTML yozib qo'ysa xabar yo'qolmasin — teglarsiz yuboramiz
          log.warn(`${persona.name}: HTML formatlash xatosi, oddiy matn bilan yuborildi`);
          await ctx.reply(stripTags(chunk), opts);
        }
      }
    } catch (e) {
      // Kvota tugasa — 3 bot 3 marta emas, bir marta ogohlantiramiz
      if (/\b429\b/.test(e.message) && Date.now() - quotaWarnedAt > 5 * 60_000) {
        quotaWarnedAt = Date.now();
        try {
          await ctx.reply(
            'Ovozni matnga o\'girish limiti hozircha tugagan. ' +
              'Bir-ikki daqiqadan keyin qayta yuboring yoki matn bilan yozing.',
            { reply_parameters: { message_id: ctx.message.message_id } },
          );
        } catch { /* javob berib bo'lmasa jim qolamiz */ }
      }
      log.error(`${persona.name} javob xatosi:`, e.message.slice(0, 200));
    }
  });

  return bot;
}
