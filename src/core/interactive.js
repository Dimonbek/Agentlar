import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { detectPersona } from './personas.js';
import { transcribe } from './gemini.js';
import { respond } from './brain.js';
import { splitMessage } from './telegram.js';
import { log } from './logger.js';

/** Chaqiruv so'zini matn boshidan olib tashlaydi: "Rita, salom" -> "salom". */
function stripTrigger(text, persona) {
  const re = new RegExp(`^\\s*(${persona.triggers.join('|')})\\s*[,!.:—-]*\\s*`, 'i');
  return text.replace(re, '').trim();
}

/** Telegram ovozli/audio xabarni yuklab, Gemini bilan matnga o'giradi. */
async function voiceToText(ctx) {
  const v = ctx.message.voice || ctx.message.audio;
  if (!v) return '';
  const link = await ctx.telegram.getFileLink(v.file_id);
  const res = await fetch(link.href);
  const buf = Buffer.from(await res.arrayBuffer());
  return transcribe(buf.toString('base64'), v.mime_type || 'audio/ogg');
}

/**
 * Bitta persona uchun tinglaydigan bot yaratadi.
 * Faqat o'z chaqiruv-so'zi bilan boshlangan xabarlarga javob beradi.
 */
export function createChatBot(persona, token) {
  const bot = new Telegraf(token);

  bot.on('message', async (ctx) => {
    try {
      if (String(ctx.chat.id) !== String(config.chat.groupChatId)) return;

      let text = ctx.message.text || ctx.message.caption || '';
      const hasVoice = !!(ctx.message.voice || ctx.message.audio);

      if (hasVoice) {
        if (!config.gemini.apiKey) return; // ovoz hali sozlanmagan
        text = await voiceToText(ctx);
        if (!text) return;
      }

      const called = detectPersona(text);
      if (!called || called.agent !== persona.agent) return; // bu chaqiruv meniki emas

      const query = stripTrigger(text, called);
      if (!query) {
        await ctx.reply(`${persona.emoji} Labbay, eshitaman. Nima kerak?`, {
          reply_parameters: { message_id: ctx.message.message_id },
        });
        return;
      }

      log.info(`${persona.name} <- "${query.slice(0, 60)}"${hasVoice ? ' (ovoz)' : ''}`);
      await ctx.sendChatAction('typing');

      const answer = await respond({ persona, userText: query });
      // Ovozdan kelgan bo'lsa, nima eshitganini ko'rsatib qo'yamiz
      const prefix = hasVoice ? `🎤 «${text.slice(0, 120)}»\n\n` : '';

      for (const chunk of splitMessage(prefix + answer)) {
        await ctx.reply(chunk, {
          reply_parameters: { message_id: ctx.message.message_id },
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (e) {
      log.error(`${persona.name} javob xatosi:`, e.message);
    }
  });

  return bot;
}
