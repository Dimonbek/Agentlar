import { askJson } from '../../core/llm.js';
import { isSeen, markSeen, itemId } from '../../core/db.js';
import { esc } from '../../core/telegram.js';
import { log } from '../../core/logger.js';
import { config } from '../../core/config.js';
import { fetchNewsItems, fetchIdeaItems } from './sources.js';

/** Bir xil URL'ni bir marta, ko'rilganlarni umuman qoldirmaydi. */
function freshOnly(items, { windowHours }) {
  const cutoff = Date.now() - windowHours * 3600_000;
  const seenNow = new Set();
  const out = [];

  for (const it of items) {
    if (!it.url || !it.title) continue;
    if (it.published < cutoff) continue;
    const id = itemId(it.url);
    if (seenNow.has(id)) continue;
    if (isSeen(it.url)) continue;
    seenNow.add(id);
    out.push(it);
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.published - a.published);
}

function numbered(items) {
  return items
    .map((it, i) => {
      const parts = [`[${i}] ${it.title}`, `manba: ${it.source}`];
      if (it.score) parts.push(`reyting: ${it.score}`);
      if (it.summary) parts.push(`matn: ${it.summary.slice(0, 400)}`);
      return parts.join(' | ');
    })
    .join('\n');
}

function uzDate() {
  const oylar = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const d = new Date();
  return `${d.getDate()}-${oylar[d.getMonth()]}`;
}

// ============ 1. AI Digest ============

const NEWS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          title_uz: { type: 'string' },
          what_uz: { type: 'string' },
          why_uz: { type: 'string' },
        },
        required: ['index', 'title_uz', 'what_uz', 'why_uz'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const NEWS_SYSTEM = `Sen sun'iy intellekt sohasidagi yangiliklarni kuzatuvchi tahlilchisan.
Foydalanuvchi — O'zbekistonlik dasturchi va tadbirkor. U AI bilan real mahsulot quradi.

Vazifang: berilgan nomzodlar ro'yxatidan ENG MUHIM yangiliklarni tanlash va o'zbek tiliga o'girish.

Tanlash mezoni (yuqoridan pastga):
1. Yangi model / imkoniyat chiqishi (Anthropic, OpenAI, Google va h.k.)
2. Dasturchi darhol ishlata oladigan asbob yoki API
3. Bozorni o'zgartiradigan yirik voqea (sarmoya, qonun, sotib olish)
Past ustuvorlik: mavhum mulohazalar, takroriy xabarlar, reklama xarakteridagi postlar.

Yozish qoidalari:
- Sof o'zbek tilida, tabiiy va jonli. Kalka tarjima QILMA.
- Texnik atamalarni (API, model, token, prompt) o'zbekchalashtirmay, o'z holicha qoldir.
- title_uz: 60 belgigacha sarlavha.
- what_uz: 1-2 gap — aynan nima bo'ldi.
- why_uz: 1 gap — bu foydalanuvchi uchun nega ahamiyatli.
- Hech qanday emoji ishlatma, formatlashni men o'zim qo'shaman.`;

export async function buildNewsDigest() {
  const raw = await fetchNewsItems();
  const items = freshOnly(raw, { windowHours: config.radar.windowHours }).slice(0, 45);
  log.info(`Yangilik nomzodlari: ${items.length} ta (jami ${raw.length})`);

  if (items.length === 0) return { text: null, used: [] };

  const { items: picked } = await askJson({
    system: NEWS_SYSTEM,
    prompt: `Bugungi nomzodlar:\n\n${numbered(items)}\n\n` +
      `Shulardan eng muhim ${config.radar.newsCount} tasini tanla va o'zbekchada tayyorla. ` +
      `index — ro'yxatdagi raqam. Agar arziydigan yangilik ${config.radar.newsCount} tadan kam bo'lsa, kamroq qaytar.`,
    schema: NEWS_SCHEMA,
  });

  const valid = picked
    .filter((p) => items[p.index])
    .slice(0, config.radar.newsCount);

  if (valid.length === 0) return { text: null, used: [] };

  const lines = [`🤖 <b>${uzDate()} · AI Digest</b>`, ''];
  valid.forEach((p, i) => {
    const src = items[p.index];
    lines.push(`<b>${i + 1}. ${esc(p.title_uz)}</b>`);
    lines.push(esc(p.what_uz));
    lines.push(`<i>Nega muhim:</i> ${esc(p.why_uz)}`);
    lines.push(`<a href="${esc(src.url)}">${esc(src.source)}</a>`);
    lines.push('');
  });

  return { text: lines.join('\n').trim(), used: items };
}

// ============ 2. Kunning g'oyasi ============

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'integer' },
    title_uz: { type: 'string' },
    where_uz: { type: 'string' },
    money_uz: { type: 'string' },
    how_uz: { type: 'string' },
    uzbekistan_uz: { type: 'string' },
    first_step_uz: { type: 'string' },
    risk_uz: { type: 'string' },
    score: { type: 'integer' },
  },
  required: ['index', 'title_uz', 'where_uz', 'money_uz', 'how_uz',
    'uzbekistan_uz', 'first_step_uz', 'risk_uz', 'score'],
  additionalProperties: false,
};

const IDEA_SYSTEM = `Sen chet eldagi ishlab ketgan mikro-bizneslarni kuzatib, ularni O'zbekiston bozoriga moslaydigan tahlilchisan.
Foydalanuvchi — O'zbekistonlik dasturchi. Kapitali kichik, lekin o'zi kod yoza oladi va AI'dan foydalanadi.

Vazifang: berilgan postlardan ENG BITTA arziydigan g'oyani tanlab, uni amaliy tahlil qilish.

Yaxshi g'oyaning belgilari:
- Aniq daromad dalili bor (raqam, mijoz soni, oylik tushum)
- Bir kishi boshlashi mumkin, katta jamoa kerak emas
- O'zbekistonda hali yo'q yoki zaif — ya'ni bo'sh joy bor
- Dasturchilik/AI ko'nikmasi ustunlik beradi

Yaramaydi: sof reklama, "qanday qilib boy bo'lish" turidagi bo'sh postlar,
faqat AQSh qonunchiligiga bog'liq narsalar, katta kapital talab qiladiganlar.

score: 0-100 — O'zbekistonda takrorlanish ehtimoli.
Agar hech biri arzimasa, index=-1 va score=0 qaytar.

Yozish qoidalari:
- Sof, jonli o'zbek tilida. Kalka tarjima qilma.
- Aniq va konkret bo'l, umumiy gaplardan qoch.
- money_uz da raqamlarni saqlab qol (masalan "$4k/oy, 3 oyda").
- first_step_uz: shu hafta bajarish mumkin bo'lgan bitta aniq qadam.
- Emoji ishlatma.`;

export async function buildIdeaPost() {
  const raw = await fetchIdeaItems();
  const items = freshOnly(raw, { windowHours: 72 }).slice(0, 40);
  log.info(`G'oya nomzodlari: ${items.length} ta (jami ${raw.length})`);

  if (items.length === 0) return { text: null, used: [] };

  const idea = await askJson({
    system: IDEA_SYSTEM,
    prompt: `Nomzod postlar:\n\n${numbered(items)}\n\n` +
      `Eng arziydigan BITTA g'oyani tanla va tahlil qil. index — ro'yxatdagi raqam.`,
    schema: IDEA_SCHEMA,
  });

  const src = items[idea.index];
  if (idea.index < 0 || !src || idea.score < 40) {
    log.info(`Bugun arziydigan g'oya topilmadi (score: ${idea.score})`);
    return { text: null, used: items };
  }

  const text = [
    `💡 <b>Kunning g'oyasi</b> · ${uzDate()}`,
    '',
    `<b>${esc(idea.title_uz)}</b>`,
    '',
    `📍 <b>Qayerda ishladi:</b> ${esc(idea.where_uz)}`,
    `💰 <b>Daromad:</b> ${esc(idea.money_uz)}`,
    `⚙️ <b>Qanday ishlaydi:</b> ${esc(idea.how_uz)}`,
    `🇺🇿 <b>O'zbekistonda:</b> ${esc(idea.uzbekistan_uz)}`,
    `🚀 <b>Birinchi qadam:</b> ${esc(idea.first_step_uz)}`,
    `⚠️ <b>Xavf:</b> ${esc(idea.risk_uz)}`,
    '',
    `Baho: <b>${idea.score}/100</b> · <a href="${esc(src.url)}">manba (${esc(src.source)})</a>`,
  ].join('\n');

  return { text, used: items };
}

export { markSeen };
