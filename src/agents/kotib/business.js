import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import { esc } from '../../core/telegram.js';
import {
  saveBizMessage,
  getBizMessage,
  saveBizContact,
  saveBizConn,
  getBizConn,
} from '../../core/db.js';
import { messageLabel, relayMessage } from './relay.js';

/** Telegram Business (lichka) update'lari — bulardan foydalanish uchun launch'da allowedUpdates ochilishi kerak. */
export const BUSINESS_UPDATES = [
  'message',
  'callback_query',
  'edited_message',
  'business_connection',
  'business_message',
  'edited_business_message',
  'deleted_business_messages',
];

/**
 * Debra botiga Business handlerlarini ulaydi:
 *  - lichka xabari kelsa → kimdan kelgani va kontentini guruhga yetkazadi
 *  - xabar o'chirilsa → saqlangan matn bilan guruhga xabar beradi
 */
export function attachBusiness(bot) {
  if (!(config.business.ownerId ?? getBizConn().owner_id)) {
    log.error('Debra Business: BUSINESS_OWNER_ID sozlanmagan va bazada egasi yo‘q. Kiruvchi xabarlar va buyruqlar egasi sozlanguncha qabul qilinmaydi.');
  }
  // Ulanish holati — egasi (Dexter) user id va connection id saqlanadi
  bot.on('business_connection', (ctx) => {
    const c = ctx.update.business_connection;
    const ownerId = config.business.ownerId ?? getBizConn().owner_id;
    if (!ownerId || String(c.user?.id) !== String(ownerId)) return;
    if (c.is_enabled) {
      saveBizConn(c.user?.id ?? null, c.id);
      log.info(`Business ulandi: owner=${c.user?.id}, conn=${c.id}`);
    } else {
      if (getBizConn().conn_id === c.id) saveBizConn(ownerId, null);
      log.info('Business ulanish o\'chirildi');
    }
  });

  // Lichka xabar keldi
  bot.on('business_message', async (ctx) => {
    try {
      const m = ctx.update.business_message;
      const conn = getBizConn();
      const ownerId = config.business.ownerId ?? conn.owner_id;

      if (!ownerId || !m.business_connection_id) return;
      // Verify the connection with Telegram, including after restart/revocation.
      const live = await bot.telegram.callApi('getBusinessConnection', { business_connection_id: m.business_connection_id });
      if (!live.is_enabled || String(live.user?.id) !== String(ownerId)) return;
      saveBizConn(ownerId, live.id);
      if (String(m.from?.id) === String(ownerId) || m.sender_business_bot || m.from?.is_bot) return;

      const sender =
        [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') ||
        (m.from?.username ? `@${m.from.username}` : 'Noma\'lum');
      const text = m.text || m.caption || `[${messageLabel(m)}]`;

      saveBizContact(m, sender);
      saveBizMessage(m.chat.id, m.message_id, sender, text);

      const header = await bot.telegram.sendMessage(
        config.chat.groupChatId,
        `📨 <b>Yangi xabar</b>\n` +
          `Ismi: <b>${esc(sender)}</b>\n` +
          `Username: ${m.from?.username ? `@${esc(m.from.username)}` : 'yo‘q'}\n` +
          `Telegram ID: <code>${esc(m.from?.id ?? m.chat.id)}</code>\n` +
          `Xabar turi: ${messageLabel(m)}\n` +
          `Xabarning o‘zi quyida 👇`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
      try {
        await relayMessage(bot.telegram, config.chat.groupChatId, m, header.message_id);
      } catch (e) {
        await bot.telegram.sendMessage(config.chat.groupChatId,
          `⚠️ ${sender}: ${messageLabel(m)} uzatilmadi. Telegramda asl xabarni tekshiring.`,
          { reply_parameters: { message_id: header.message_id } });
        throw e;
      }
      log.info(`Debra: lichka xabar yetkazildi (${sender})`);

      // No automatic private replies: the owner must approve each outgoing message.
    } catch (e) {
      log.error('business_message xatosi:', e.message);
    }
  });

  // Lichkadagi xabar o'chirildi
  bot.on('deleted_business_messages', async (ctx) => {
    try {
      const d = ctx.update.deleted_business_messages;
      if (!getBizConn().conn_id || d.business_connection_id !== getBizConn().conn_id) return;
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
