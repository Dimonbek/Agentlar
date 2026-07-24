import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { detectPersona } from './personas.js';
import { transcribe } from './gemini.js';
import { respond } from './brain.js';
import { splitMessage } from './telegram.js';
import { addHistory, getHistory } from './db.js';
import { debraTools, runDebraTool } from '../agents/kotib/tools.js';
import { log } from './logger.js';

/** LLM'ga beriladigan suhbat tarixi uzunligi (≈30 savol-javob). */
const HISTORY_LIMIT = 60;

/** Chaqiruv so'zini matn boshidan olib tashlaydi: "Rita, salom" -> "salom". */
function stripTrigger(text, persona) {
  const re = new RegExp(`^\\s*(${persona.triggers.join('|')})\\s*[,!.:—-]*\\s*`, 'i');
  return text.replace(re, '').trim();
}

/** Telegram voice/audio obyektini yuklab, Gemini bilan matnga o'giradi. */
async function voiceToText(ctx, v) {
  if (!v || !config.gemini.apiKey) return '';
  const link = await ctx.telegram.getFileLink(v.file_id);
  const res = await fetch(link.href);
  const buf = Buffer.from(await res.arrayBuffer());
  return transcribe(buf.toString('base64'), v.mime_type || 'audio/ogg');
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

      // Debra lichka xabarlari bazasiga murojaat qila oladi
      const isDebra = persona.agent === 'kotib';
      const answer = await respond({
        persona,
        userText: fullQuery,
        history,
        tools: isDebra ? debraTools : [],
        runTool: isDebra ? runDebraTool : null,
      });

      // Xotiraga yozamiz — keyingi safar shu suhbatni eslaydi
      addHistory(persona.agent, chatId, 'user', fullQuery);
      addHistory(persona.agent, chatId, 'assistant', answer);

      const prefix = hasVoice ? `🎤 «${text.slice(0, 120)}»\n\n` : '';

      for (const chunk of splitMessage(prefix + answer)) {
        await ctx.reply(chunk, {
          reply_parameters: { message_id: msg.message_id },
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (e) {
      log.error(`${persona.name} javob xatosi:`, e.message);
    }
  });

  return bot;
}
