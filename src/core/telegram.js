import { Telegraf } from 'telegraf';
import { log } from './logger.js';

const TG_LIMIT = 4096;

/**
 * Bitta agent uchun Telegram yuboruvchi.
 * topicId — forum (Topics) rejimidagi gruppada mavzu ID'si; bo'sh bo'lsa asosiy oqim.
 */
export function createSender({ token, chatId }) {
  const bot = new Telegraf(token);

  async function send(text, { topicId, disablePreview = true } = {}) {
    for (const chunk of splitMessage(text)) {
      await bot.telegram.sendMessage(chatId, chunk, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: disablePreview },
        ...(topicId ? { message_thread_id: topicId } : {}),
      });
    }
    log.info(`Telegram: ${text.length} belgi yuborildi${topicId ? ` (topic ${topicId})` : ''}`);
  }

  return { bot, send };
}

/** Uzun xabarni 4096 belgidan oshmaydigan bo'laklarga bo'ladi (qator chegarasi bo'yicha). */
export function splitMessage(text) {
  if (text.length <= TG_LIMIT) return [text];

  const parts = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (buf.length + line.length + 1 > TG_LIMIT) {
      if (buf) parts.push(buf);
      buf = line;
      // Bitta qatorning o'zi limitdan uzun bo'lsa — majburan kesamiz
      while (buf.length > TG_LIMIT) {
        parts.push(buf.slice(0, TG_LIMIT));
        buf = buf.slice(TG_LIMIT);
      }
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/** HTML parse_mode uchun xavfsiz matn. */
export function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
