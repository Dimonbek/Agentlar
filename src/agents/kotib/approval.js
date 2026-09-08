import { randomUUID } from 'node:crypto';
import { config } from '../../core/config.js';
import { getBizConn, getBizContacts } from '../../core/db.js';

const pending = new Map();
const TTL = 10 * 60_000;

export function isBusinessOwner(userId) {
  const owner = config.business.ownerId ?? getBizConn().owner_id;
  return !!owner && String(userId) === String(owner);
}

export async function proposePrivateMessage(bot, chatId, text, auth) {
  if (!isBusinessOwner(auth?.userId) || String(auth?.groupId) !== String(config.chat.groupChatId)) {
    return 'Ruxsat yo‘q: faqat egasi xabar yuborishni so‘rashi mumkin.';
  }
  const contact = getBizContacts().find(c => String(c.chat_id) === String(chatId));
  if (!contact || contact.conn_id !== getBizConn().conn_id) return 'Kontakt joriy Business ulanishida topilmadi.';
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) return 'Xabar 1–4096 belgi bo‘lishi kerak.';
  for (const [id, draft] of pending) if (draft.expires < Date.now()) pending.delete(id);
  if (pending.size >= 100) return 'Tasdiqlanmagan xabarlar ko‘p. Avval ularni tasdiqlang yoki bekor qiling.';
  const id = randomUUID();
  // Keep the full Telegram text limit available to the message itself.
  const preview = await bot.telegram.sendMessage(auth.groupId,
    `Kimga: ${contact.sender}${contact.username ? ` (@${contact.username})` : ''}\nChat ID: ${contact.chat_id}\n` +
    'Quyidagi matn faqat «Yuborish» bosilganda yuboriladi (10 daqiqa).');
  const content = await bot.telegram.sendMessage(auth.groupId, text, {
    reply_parameters: { message_id: preview.message_id },
    reply_markup: { inline_keyboard: [[
      { text: 'Yuborish', callback_data: `biz:send:${id}` },
      { text: 'Bekor qilish', callback_data: `biz:cancel:${id}` },
    ]] },
  });
  pending.set(id, { chatId: contact.chat_id, connId: contact.conn_id, text,
    userId: auth.userId, groupId: auth.groupId, messageId: content.message_id, expires: Date.now() + TTL });
  return 'Xabar hali yuborilmadi. Egasi guruhdagi «Yuborish» tugmasini bosishi kerak.';
}

export function attachPrivateApproval(bot) {
  bot.action(/^biz:(send|cancel):(.+)$/, async ctx => {
    const [, action, id] = ctx.match;
    const draft = pending.get(id);
    if (!isBusinessOwner(ctx.from?.id) || !draft || String(ctx.from.id) !== String(draft.userId) ||
        String(ctx.chat?.id) !== String(draft.groupId) || ctx.callbackQuery.message?.message_id !== draft.messageId) {
      await ctx.answerCbQuery('Ruxsat yo‘q yoki tasdiqlash muddati tugagan.');
      return;
    }
    pending.delete(id); // Consume before awaiting: repeated clicks cannot send twice.
    await ctx.answerCbQuery();
    let result = 'Bekor qilindi.';
    if (action === 'send' && draft.expires < Date.now()) result = 'Muddati tugadi. Xabarni qayta tayyorlang.';
    else if (action === 'send') {
      try {
        if (getBizConn().conn_id !== draft.connId) throw new Error('Business ulanish o‘zgargan yoki o‘chirilgan.');
        const live = await bot.telegram.callApi('getBusinessConnection', { business_connection_id: draft.connId });
        if (!live.is_enabled || !isBusinessOwner(live.user?.id) || !(live.rights?.can_reply ?? live.can_reply)) {
          throw new Error('Business ulanishda javob yuborish huquqi yo‘q.');
        }
        await bot.telegram.sendMessage(draft.chatId, draft.text, { business_connection_id: draft.connId });
        result = '✅ Xabar yuborildi.';
      } catch {
        result = '⚠️ Yuborish tasdiqlanmadi. Telegramdagi suhbatni tekshiring; avtomatik qayta yuborilmaydi. Business ruxsati yoki 24 soatlik javob muddati sabab bo‘lishi mumkin.';
      }
    }
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await ctx.reply(result, { reply_parameters: { message_id: draft.messageId } });
  });
}
