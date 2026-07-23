import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import { esc } from '../../core/telegram.js';
import {
  saveBizMessage,
  getBizMessage,
  canAutoReply,
  saveBizConn,
  getBizConn,
} from '../../core/db.js';

/** Telegram Business (lichka) update'lari — bulardan foydalanish uchun launch'da allowedUpdates ochilishi kerak. */
export const BUSINESS_UPDATES = [
  'message',
  'edited_message',
  'business_connection',
  'business_message',
  'edited_business_message',
  'deleted_business_messages',
];

/**
 * Debra botiga Business handlerlarini ulaydi:
 *  - lichka xabari kelsa → guruhga yetkazadi (+ ixtiyoriy avto-javob)
 *  - xabar o'chirilsa → saqlangan matn bilan guruhga xabar beradi
 */
export function attachBusiness(bot) {
  // Ulanish holati — egasi (Dexter) user id va connection id saqlanadi
  bot.on('business_connection', (ctx) => {
    const c = ctx.update.business_connection;
    if (c.is_enabled) {
      saveBizConn(c.user?.id ?? null, c.id);
      log.info(`Business ulandi: owner=${c.user?.id}, conn=${c.id}`);
    } else {
      log.info('Business ulanish o\'chirildi');
    }
  });

  // Lichka xabar keldi
  bot.on('business_message', async (ctx) => {
    try {
      const m = ctx.update.business_message;
      const conn = getBizConn();
      const ownerId = config.business.ownerId ?? conn.owner_id;

      // Dexter o'zi mijozga yozgan bo'lsa — e'tiborsiz (faqat kelgan xabarni yetkazamiz)
      if (ownerId && m.from?.id === ownerId) return;

      const sender =
        [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') ||
        (m.from?.username ? `@${m.from.username}` : 'Noma\'lum');
      const text = m.text || m.caption || '[matnsiz xabar]';

      saveBizMessage(m.chat.id, m.message_id, sender, text);

      await bot.telegram.sendMessage(
        config.chat.groupChatId,
        `📨 <b>${esc(sender)}</b> lichkaga yozdi:\n${esc(text)}`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
      log.info(`Debra: lichka xabar yetkazildi (${sender})`);

      // Avto-javob (ixtiyoriy, spam bo'lmasligi uchun mijozga 6 soatda bir marta)
      if (config.business.autoReply && m.business_connection_id && canAutoReply(m.chat.id)) {
        await bot.telegram.sendMessage(m.chat.id, config.business.autoReplyText, {
          business_connection_id: m.business_connection_id,
        });
      }
    } catch (e) {
      log.error('business_message xatosi:', e.message);
    }
  });

  // Lichkadagi xabar o'chirildi
  bot.on('deleted_business_messages', async (ctx) => {
    try {
      const d = ctx.update.deleted_business_messages;
      for (const id of d.message_ids) {
        const saved = getBizMessage(d.chat.id, id);
        const who = saved?.sender || d.chat?.first_name || 'Kimdir';
        const what = saved?.text ? `\nMatni: <i>${esc(saved.text)}</i>` : ' (matni saqlanmagan)';
        await bot.telegram.sendMessage(
          config.chat.groupChatId,
          `🗑 <b>${esc(who)}</b> lichkadagi xabarini o'chirdi.${what}`,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
        );
      }
      log.info('Debra: o\'chirilgan xabar(lar) guruhga bildirildi');
    } catch (e) {
      log.error('deleted_business_messages xatosi:', e.message);
    }
  });
}
