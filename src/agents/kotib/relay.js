// Reuse Telegram file IDs: no downloads or AI processing of private media.
const media = [
  ['animation', 'sendAnimation'], ['photo', 'sendPhoto'], ['video', 'sendVideo'],
  ['voice', 'sendVoice'], ['audio', 'sendAudio'], ['document', 'sendDocument'],
  ['sticker', 'sendSticker'], ['video_note', 'sendVideoNote'],
];

const labels = { animation: 'GIF', photo: 'rasm', video: 'video', voice: 'ovozli xabar',
  audio: 'audio', document: 'fayl', sticker: 'stiker', video_note: 'video doira',
  text: 'matn', contact: 'kontakt', venue: 'manzil', location: 'joylashuv', poll: 'so‘rovnoma', dice: 'zar' };

export function messageLabel(m) {
  return labels[messageKind(m)] || 'boshqa xabar';
}

export function messageKind(m) {
  return media.find(([key]) => m[key])?.[0] ||
    ['text', 'contact', 'venue', 'location', 'poll', 'dice'].find(key => m[key]) || 'boshqa xabar';
}

export async function relayMessage(telegram, groupId, m, headerId) {
  const options = { reply_parameters: { message_id: headerId } };
  if (m.text) return telegram.callApi('sendMessage', {
    chat_id: groupId, text: m.text, entities: m.entities, ...options,
  });
  for (const [key, method] of media) {
    if (!m[key]) continue;
    const file = key === 'photo' ? m.photo.at(-1) : m[key];
    return telegram.callApi(method, {
      chat_id: groupId, [key]: file.file_id, ...options,
      ...(!['sticker', 'video_note'].includes(key) ? {
        caption: m.caption, caption_entities: m.caption_entities,
        has_spoiler: m.has_spoiler,
      } : {}),
    });
  }
  if (m.contact || m.venue || m.location) {
    const key = m.contact ? 'contact' : m.venue ? 'venue' : 'location';
    const data = m[key];
    const payload = key === 'venue' ? { ...data, ...data.location } : data;
    return telegram.callApi(`send${key[0].toUpperCase()}${key.slice(1)}`, {
      chat_id: groupId, ...payload, ...options,
    });
  }
  const summary = m.poll ? `📊 ${m.poll.question}\n${m.poll.options.map(o => o.text).join('\n')}`
    : m.dice ? `${m.dice.emoji} Natija: ${m.dice.value}`
    : `Bu xabar turi hozircha uzatilmaydi: ${messageKind(m)}. Telegramda ochib ko'ring.`;
  return telegram.callApi('sendMessage', { chat_id: groupId, text: summary, ...options });
}
