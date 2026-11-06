import cron from 'node-cron';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../core/config.js';
import { createSender, esc } from '../../core/telegram.js';
import {
  listObunalar, countObunalar, addObuna, setObunaSana,
  kvOl, kvQoy, logRun,
} from '../../core/db.js';
import { log } from '../../core/logger.js';

const { send } = createSender({
  token: config.chat.tokens.layla || '',
  chatId: config.chat.groupChatId,
});

const KUN = 86_400_000;

/** Sana YYYY-MM-DD → bugundan necha kun qolgani (manfiy = o'tib ketgan). */
export function qolganKun(sana, bugun = new Date()) {
  const [y, m, d] = String(sana).split('-').map(Number);
  const nishon = Date.UTC(y, m - 1, d);
  const hozir = Date.UTC(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());
  return Math.round((nishon - hozir) / KUN);
}

/** Keyingi to'lov sanasi — davrga qarab oldinga suriladi. */
export function keyingiSana(sana, davr) {
  const [y, m, d] = String(sana).split('-').map(Number);
  if (davr === 'yillik') return iso(y + 1, m, d);
  if (davr === 'oylik') {
    const ym = m === 12 ? [y + 1, 1] : [y, m + 1];
    // 31-sanali oydan 30 kunli oyga o'tganda oxirgi kunga tushadi
    const oxirgi = new Date(Date.UTC(ym[0], ym[1], 0)).getUTCDate();
    return iso(ym[0], ym[1], Math.min(d, oxirgi));
  }
  return null;                                   // bir martalik — takrorlanmaydi
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const pul = (o) => `${o.valyuta}${Number(o.summa).toLocaleString('uz-UZ')}`;
const sanaMatn = (s) => new Date(s + 'T00:00:00Z')
  .toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Oylikka keltirilgan xarajat — yillikni 12 ga bo'lamiz. */
export function oylikXarajat(obunalar) {
  return obunalar.reduce((s, o) => {
    if (o.davr === 'oylik') return s + Number(o.summa);
    if (o.davr === 'yillik') return s + Number(o.summa) / 12;
    return s;
  }, 0);
}

/** Birinchi ishga tushishda data/obunalar.json dan yuklaydi. */
function urugla() {
  if (countObunalar() > 0) return;
  const fayl = resolve(config.obuna.seedFile);
  if (!existsSync(fayl)) {
    log.warn(`Layla: obuna yo'q. ${config.obuna.seedFile} yarating.`);
    return;
  }
  try {
    for (const o of JSON.parse(readFileSync(fayl, 'utf8'))) addObuna(o);
    log.info(`Layla: ${countObunalar()} ta obuna urug'dan yuklandi`);
  } catch (e) {
    log.error(`Layla: ${config.obuna.seedFile} o'qilmadi — ${e.message}`);
  }
}

/**
 * Kunlik tekshiruv: 7, 3 va 1 kun qolganda hamda o'tib ketganda eslatadi.
 * Har bosqich uchun bir marta — kv da belgilanadi, aks holda har kuni
 * bir xil xabar kelaverardi.
 */
export async function tekshir() {
  const obunalar = listObunalar({ onlyEnabled: true });
  if (!obunalar.length) {
    log.info('Layla: obuna yo\'q');
    logRun('layla:tekshir', true, 'obuna yo\'q');
    return { eslatildi: 0 };
  }

  let eslatildi = 0;
  for (const o of obunalar) {
    const qoldi = qolganKun(o.sana);
    const bosqich = qoldi <= 0 ? 'otdi' : config.obuna.kunlar.includes(qoldi) ? String(qoldi) : null;
    if (!bosqich) continue;

    const kalit = `tolov:${o.kalit}:${o.sana}:${bosqich}`;
    if (kvOl(kalit)) continue;                    // bu bosqich allaqachon aytilgan

    const matn = qoldi > 0
      ? `💳 <b>${esc(o.nom)}</b> to'loviga <b>${qoldi} kun</b> qoldi\n` +
        `${pul(o)} · ${sanaMatn(o.sana)}${o.izoh ? `\n<i>${esc(o.izoh)}</i>` : ''}`
      : `🔴 <b>${esc(o.nom)}</b> to'lovi <b>${Math.abs(qoldi) === 0 ? 'bugun' : Math.abs(qoldi) + ' kun oldin'}</b> edi\n` +
        `${pul(o)} · ${sanaMatn(o.sana)}\nTo'laganingizdan keyin sanani yangilang.`;

    await send(matn).catch((e) => log.error('Layla xabar yubora olmadi:', e.message));
    kvQoy(kalit, Date.now());
    eslatildi++;
    log.info(`Layla: ${o.nom} — ${bosqich === 'otdi' ? 'muddati o\'tdi' : bosqich + ' kun qoldi'}`);
  }

  logRun('layla:tekshir', true, `${obunalar.length} obuna, ${eslatildi} eslatma`);
  return { eslatildi };
}

/** Oy oxirida umumiy xarajat. */
export async function oylikHisobot() {
  const obunalar = listObunalar({ onlyEnabled: true });
  if (!obunalar.length) return;
  const jami = oylikXarajat(obunalar);
  const qatorlar = [...obunalar]
    .sort((a, b) => Number(b.summa) - Number(a.summa))
    .map((o) => `• ${esc(o.nom)} — ${pul(o)} (${o.davr})`);
  await send(
    `📊 <b>Oylik xarajat</b>\n\n${qatorlar.join('\n')}\n\n` +
    `<b>Jami oyiga: $${jami.toFixed(2)}</b>\n<i>Yillik to'lovlar 12 ga bo'lib hisoblandi.</i>`,
  ).catch((e) => log.error('Layla oylik hisobot:', e.message));
  logRun('layla:oylik', true, `$${jami.toFixed(2)}`);
}

/** To'landi deb belgilash — sanani keyingi davrga suradi. */
export function tolandi(kalit) {
  const o = listObunalar().find((x) => x.kalit === kalit);
  if (!o) throw new Error(`Obuna topilmadi: ${kalit}`);
  const yangi = keyingiSana(o.sana, o.davr);
  if (!yangi) return null;                        // bir martalik
  setObunaSana(kalit, yangi);
  log.info(`Layla: ${o.nom} to'landi — keyingisi ${yangi}`);
  return yangi;
}

export const lingoJobs = {
  'layla:tekshir': async () => { urugla(); return tekshir(); },
  'layla:oylik': oylikHisobot,
};

export function startLingo() {
  if (!config.chat.tokens.layla) {
    log.warn('Layla tokeni yo\'q — obuna eslatmalari ishga tushmadi');
    return;
  }
  urugla();
  const opts = { timezone: config.tz };
  cron.schedule(config.obuna.cron, () => {
    tekshir().catch((e) => log.error('Layla tekshiruv:', e.message));
  }, opts);
  cron.schedule(config.obuna.oylikCron, () => {
    oylikHisobot().catch((e) => log.error('Layla oylik:', e.message));
  }, opts);
  log.info(`Layla 💳 obuna nazorati ishga tushdi — "${config.obuna.cron}" (${config.tz})`);
}
