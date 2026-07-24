import { getBizMessagesBetween } from '../../core/db.js';

/** Debra ixtiyoridagi asboblar (Claude tool-use). */
export const debraTools = [
  {
    name: 'get_private_messages',
    description:
      'Dexterning shaxsiy (lichka) Telegram xabarlarini oladi: kim yozgan, nima yozgan va qachon. ' +
      '"Bugun kim yozdi?", "kecha nima xabar keldi?", "shu haftadagi xabarlar", "kim menga yozgan" ' +
      'kabi har qanday so\'rovda ALBATTA shu asbobni ishlat — xotiradan javob berma.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'week', 'month', 'all'],
          description: 'Qaysi davr uchun: bugun / kecha / shu hafta / shu oy / hammasi',
        },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
];

function periodRange(period) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400_000;

  switch (period) {
    case 'today':
      return [startOfToday, Date.now()];
    case 'yesterday':
      return [startOfToday - DAY, startOfToday];
    case 'week':
      return [startOfToday - 6 * DAY, Date.now()];
    case 'month':
      return [startOfToday - 29 * DAY, Date.now()];
    default:
      return [0, Date.now()];
  }
}

function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(ts) {
  const d = new Date(ts);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Debra asbobini bajaradi va natijani matn sifatida qaytaradi. */
export function runDebraTool(name, input) {
  if (name !== 'get_private_messages') return `Noma'lum asbob: ${name}`;

  const [from, to] = periodRange(input?.period ?? 'today');
  const rows = getBizMessagesBetween(from, to);

  if (!rows.length) {
    return 'Bu davrda hech kim lichkaga yozmagan (yoki Business ulanmagan paytdagi xabarlar saqlanmagan).';
  }

  // Jo'natuvchi bo'yicha guruhlaymiz
  const bySender = new Map();
  for (const r of rows) {
    const key = r.sender || 'Noma\'lum';
    if (!bySender.has(key)) bySender.set(key, []);
    bySender.get(key).push(r);
  }

  const lines = [`Jami ${rows.length} ta xabar, ${bySender.size} kishidan:`, ''];
  for (const [sender, msgs] of bySender) {
    lines.push(`${sender} — ${msgs.length} ta xabar:`);
    for (const m of msgs.slice(-5)) {
      const when = input?.period === 'today' || input?.period === 'yesterday'
        ? hhmm(m.at)
        : `${dayLabel(m.at)} ${hhmm(m.at)}`;
      lines.push(`  ${when} — ${String(m.text).slice(0, 200)}`);
    }
    if (msgs.length > 5) lines.push(`  (...yana ${msgs.length - 5} ta xabar)`);
    lines.push('');
  }

  return lines.join('\n').trim();
}
