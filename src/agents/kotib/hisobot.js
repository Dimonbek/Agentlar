import cron from 'node-cron';
import { config } from '../../core/config.js';
import { createSender, esc } from '../../core/telegram.js';
import { listProjects, holatOzgarishlari, listObunalar, kvOl, kvQoy, logRun } from '../../core/db.js';
import { qolganKun, oylikXarajat } from '../lingo/index.js';
import { askText } from '../../core/llm.js';
import { log } from '../../core/logger.js';

const { send } = createSender({
  token: config.chat.tokens.debra || '',
  chatId: config.chat.groupChatId,
});

const SOAT = 3600_000;
const soat = (ts) => new Date(ts).toLocaleTimeString('uz-UZ',
  { hour: '2-digit', minute: '2-digit', timeZone: config.tz });
const sana = (ts) => new Date(ts).toLocaleDateString('uz-UZ',
  { day: 'numeric', month: 'long', timeZone: config.tz });

function muddat(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'noma\'lum';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} daqiqa`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} soat ${m % 60} daqiqa` : `${h} soat`;
}

/** Hisobot uchun xom ma'lumot — LLM ga shu beriladi. */
function xomMalumot(fromMs) {
  const loyihalar = listProjects({ onlyEnabled: true });
  const ozgarishlar = holatOzgarishlari(fromMs);

  // Har loyiha uchun necha marta yiqilgani — eng beqarorini topish uchun
  const yiqilish = new Map();
  for (const o of ozgarishlar) {
    if (o.turi === 'yiqildi') yiqilish.set(o.nom, (yiqilish.get(o.nom) ?? 0) + 1);
  }

  // Layla yozib boradigan to'lovlar — 14 kun ichidagilari hisobotga tushadi
  const obunalar = listObunalar({ onlyEnabled: true })
    .map((o) => ({ ...o, qoldi: qolganKun(o.sana) }))
    .filter((o) => o.qoldi <= 14)
    .sort((a, b) => a.qoldi - b.qoldi);

  return {
    jami: loyihalar.length,
    hozirYiqilgan: loyihalar.filter((p) => p.status === 'err'),
    ogohlantirish: loyihalar.filter((p) => p.status === 'warn'),
    ozgarishlar,
    beqaror: [...yiqilish.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    obunalar,
    oylikXarajat: oylikXarajat(listObunalar({ onlyEnabled: true })),
  };
}

/** Xom ma'lumotni modelga tushunarli matn qilib beradi. */
function matnga(d, fromMs) {
  const q = [];
  q.push(`Jami kuzatilayotgan loyiha: ${d.jami}`);
  q.push(`Hozir yiqilgan: ${d.hozirYiqilgan.length ? d.hozirYiqilgan.map((p) =>
    `${p.name} (${p.note ?? 'sabab noma\'lum'}, oxirgi marta ishlagan: ${
      p.last_ok ? muddat(Date.now() - p.last_ok) + ' oldin' : 'noma\'lum'})`).join('; ') : 'yo\'q'}`);
  q.push(`Sekin yoki ogohlantirishli: ${d.ogohlantirish.length
    ? d.ogohlantirish.map((p) => `${p.name} (${p.note ?? ''})`).join('; ') : 'yo\'q'}`);
  q.push('');
  q.push(`${sana(fromMs)} dan beri bo'lgan o'zgarishlar:`);
  if (!d.ozgarishlar.length) q.push('  (hech narsa o\'zgarmadi — hamma vaqt barqaror ishladi)');
  for (const o of d.ozgarishlar) {
    q.push(`  ${soat(o.at)} — ${o.nom} ${o.turi}${o.sabab ? ` (${o.sabab})` : ''}`);
  }
  if (d.beqaror.length) {
    q.push('');
    q.push(`Eng ko'p yiqilgan: ${d.beqaror.map(([n, k]) => `${n} — ${k} marta`).join(', ')}`);
  }
  if (d.obunalar.length) {
    q.push('');
    q.push('Yaqinlashayotgan to\'lovlar:');
    for (const o of d.obunalar) {
      const qachon = o.qoldi < 0 ? `${Math.abs(o.qoldi)} kun oldin o'tib ketgan`
        : o.qoldi === 0 ? 'bugun' : `${o.qoldi} kun qoldi`;
      q.push(`  ${o.nom} — ${o.valyuta}${o.summa}, ${qachon}`);
    }
    q.push(`Oylik umumiy xarajat: $${d.oylikXarajat.toFixed(2)}`);
  }
  return q.join('\n');
}

const USLUB = `Sen — Debra, Dilmurodning AI jamoasining boshlig'i. O'zbek tilida,
lotin yozuvida yozasan. Uslubing: qisqa, to'g'ridan-to'g'ri, ortiqcha rasmiyatchiliksiz.
Hazil qilishing mumkin, lekin muammo bo'lsa jiddiy bo'lasan.

QOIDALAR:
- Faqat berilgan ma'lumotga tayan. Raqam yoki sabab o'ylab topma.
- Texnik atamani odam tiliga o'gir: "HTTP 502" emas, "sayt ochilmadi".
- Eng muhimini boshida ayt. Hammasi joyida bo'lsa — shuni bir qatorda ayt, cho'zma.
- Telegram HTML: <b> va <i> ishlatsang bo'ladi. Markdown yulduzcha ISHLATMA.
- Sarlavha YOZMA ("Kunlik hisobot" kabi) — u xabarning boshiga alohida qo'shiladi.
- 10 qatordan oshmasin.`;

/** Kunlik hisobot — kecha ertalabdan hozirgacha. */
export async function kunlikHisobot() {
  const from = Date.now() - 24 * SOAT;
  const d = xomMalumot(from);
  try {
    const matn = await askText({
      system: USLUB,
      prompt: `Kunlik hisobot yoz. Quyidagi ma'lumotga tayan:\n\n${matnga(d, from)}`,
      maxTokens: 900,
    });
    await send(`☀️ <b>Ertalabki hisobot</b>\n\n${matn}`);
    logRun('debra:kunlik', true, `${d.ozgarishlar.length} o'zgarish`);
    log.info('Debra: kunlik hisobot yuborildi');
  } catch (e) {
    // Model ishlamasa ham hisobot ketsin — xom holda bo'lsa ham
    log.error('Debra kunlik hisobot xatosi:', e.message);
    await send(`☀️ <b>Ertalabki hisobot</b>\n\n<pre>${esc(matnga(d, from))}</pre>`)
      .catch((e2) => log.error('Debra zaxira hisoboti ham ketmadi:', e2.message));
    logRun('debra:kunlik', false, e.message);
  }
}

/** Haftalik yakun — yakshanba kechqurun. */
export async function haftalikHisobot() {
  const from = Date.now() - 7 * 24 * SOAT;
  const d = xomMalumot(from);
  try {
    const matn = await askText({
      system: USLUB,
      prompt: `Haftalik yakun yoz. Hafta davomida nima bo'lgani, qaysi loyiha beqaror
ekani va nimaga e'tibor berish kerakligini ayt.\n\n${matnga(d, from)}`,
      maxTokens: 1100,
    });
    await send(`📅 <b>Haftalik yakun</b>\n\n${matn}`);
    logRun('debra:haftalik', true);
    log.info('Debra: haftalik yakun yuborildi');
  } catch (e) {
    log.error('Debra haftalik hisobot xatosi:', e.message);
    logRun('debra:haftalik', false, e.message);
  }
}

/**
 * Uzoq yiqilib yotgan loyihalar haqida qayta eslatma.
 * Rita yiqilgan paytda darhol xabar beradi; Debra esa tuzalmay
 * qolganini eslatadi — har `eslatmaSoat` da bir marta, spam bo'lmasin.
 */
export async function eslatma() {
  const chegara = config.hisobot.eslatmaSoat * SOAT;
  const hozir = Date.now();
  const yiqilgan = listProjects({ onlyEnabled: true }).filter((p) =>
    p.status === 'err' && p.last_ok && hozir - p.last_ok >= chegara);

  for (const p of yiqilgan) {
    const kalit = `eslatma:${p.key}`;
    const oxirgi = Number(kvOl(kalit) ?? 0);
    if (hozir - oxirgi < chegara) continue;        // yaqinda eslatilgan
    await send(
      `⏰ <b>${esc(p.name)}</b> hali ham ishlamayapti\n` +
      `<code>${esc(p.target)}</code>\n` +
      `${muddat(hozir - p.last_ok)} dan beri o'chiq. Sabab: ${esc(p.note ?? 'noma\'lum')}`,
    ).catch((e) => log.error('Debra eslatma yubora olmadi:', e.message));
    kvQoy(kalit, hozir);
    log.info(`Debra: ${p.name} uchun eslatma yuborildi`);
  }
  // Tuzalganlarning hisobi tozalansin, keyingi safar darhol eslatilsin
  for (const p of listProjects()) {
    if (p.status !== 'err' && kvOl(`eslatma:${p.key}`)) kvQoy(`eslatma:${p.key}`, 0);
  }
}

export const hisobotJobs = {
  'debra:kunlik': kunlikHisobot,
  'debra:haftalik': haftalikHisobot,
  'debra:eslatma': eslatma,
};

export function startHisobot() {
  if (!config.chat.tokens.debra) {
    log.warn('Debra tokeni yo\'q — hisobot jadvali ishga tushmadi');
    return;
  }
  const opts = { timezone: config.tz };
  cron.schedule(config.hisobot.kunlik, () => {
    kunlikHisobot().catch((e) => log.error('Debra kunlik:', e.message));
  }, opts);
  cron.schedule(config.hisobot.haftalik, () => {
    haftalikHisobot().catch((e) => log.error('Debra haftalik:', e.message));
  }, opts);
  cron.schedule(config.hisobot.eslatmaCron, () => {
    eslatma().catch((e) => log.error('Debra eslatma:', e.message));
  }, opts);
  log.info(`Debra 🗂 hisoboti ishga tushdi — kunlik "${config.hisobot.kunlik}", ` +
    `haftalik "${config.hisobot.haftalik}" (${config.tz})`);
}
