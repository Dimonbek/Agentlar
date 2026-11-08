import cron from 'node-cron';
import { config } from '../../core/config.js';
import { createSender, esc } from '../../core/telegram.js';
import { listProjects, xatoYoz, xatoAytildi, pruneXatolar, logRun } from '../../core/db.js';
import { askText } from '../../core/llm.js';
import { log } from '../../core/logger.js';
import { dockerJurnal, systemdJurnal, xatoQatorlari, barmoqIzi } from './jurnal.js';

const { send } = createSender({
  token: config.sara.token,
  chatId: config.radar.chatId,
});

/**
 * Jurnallardan xatolarni yig'ib, barmoq izi bo'yicha guruhlaydi.
 * Natija: manba → Map(barmoq → { soni, namuna }).
 */
export async function yig(sekund) {
  const loyihalar = listProjects({ onlyEnabled: true })
    .filter((p) => p.kind === 'docker' || p.kind === 'systemd');

  const natija = [];
  for (const p of loyihalar) {
    const { matn, xato } = p.kind === 'docker'
      ? await dockerJurnal(p.target, sekund)
      : await systemdJurnal(p.target, sekund);

    if (xato) {
      log.warn(`Sara: ${p.name} jurnali o'qilmadi — ${xato}`);
      continue;
    }

    const guruh = new Map();
    for (const qator of xatoQatorlari(matn)) {
      const barmoq = barmoqIzi(qator);
      if (!barmoq) continue;
      const bor = guruh.get(barmoq);
      if (bor) bor.soni++;
      else guruh.set(barmoq, { soni: 1, namuna: qator.slice(0, 400) });
    }
    if (guruh.size) natija.push({ loyiha: p, guruh });
  }
  return natija;
}

/** Jim ro'yxat — o'z-o'zidan tuzaladigan o'tkinchi uzilishlar. */
function jimmi(barmoq) {
  return config.sara.jim.some((re) => re.test(barmoq));
}

/**
 * Qaysi xato haqida gapirish kerak:
 *   - bazada yo'q edi → yangi xato, bir marta aytiladi
 *   - bor edi, lekin bu oynada juda ko'p takrorlandi → portlash
 * Qolgani bazada jim sanaladi.
 */
export function tanla(yigilgan) {
  const aytiladi = [];
  const now = Date.now();

  for (const { loyiha, guruh } of yigilgan) {
    for (const [barmoq, { soni, namuna }] of guruh) {
      const holat = xatoYoz({
        manba: loyiha.key, barmoq, xabar: namuna, soni, at: now,
      });

      if (jimmi(barmoq)) continue;

      const kutish = config.sara.qaytaSoat * 3600_000;
      const yaqinda = holat.aytilgan && now - holat.aytilgan < kutish;

      let sabab = null;
      if (holat.yangimi) sabab = 'yangi';
      else if (soni >= config.sara.portlash && !yaqinda) sabab = 'portlash';

      if (sabab) aytiladi.push({ loyiha, barmoq, soni, namuna, sabab });
    }
  }

  // Eng ko'p takrorlanganlari yuqorida, bir martada hammasi emas
  return aytiladi
    .sort((a, b) => b.soni - a.soni)
    .slice(0, config.sara.birMarta);
}

const USLUB = `Sen — Sara, loyihalar xatoliklarini kuzatuvchi agent. Dilmurodga
(dasturchi emas, biznes egasi) xato haqida TUSHUNARLI tilda yozasan.

Qoidalar:
- O'zbek tilida, lotin alifbosida.
- Har xato uchun 2-3 qator: 1) sodda tilda nima bo'lgani, 2) bu nimaga olib keladi,
  3) nima qilish kerak (aniq qadam).
- Texnik atamani tarjima qil: "permission denied" → "fayl yozishga ruxsat yo'q",
  "404" → "so'ralgan sahifa topilmadi", "ECONNREFUSED" → "ulanish qabul qilinmadi".
- Xatoni O'YLAB TOPMA. Faqat berilgan matndan kelib chiq. Bilmasang "aniq sabab
  ko'rinmayapti" deb yoz.
- Raqamlarni o'zgartirma, yangi raqam qo'shma.
- Telegram HTML: <b>, <i>, <code>. Markdown ishlatma. Sarlavha yozma.
- Jami 12 qatordan oshmasin.`;

/** Tanlangan xatolarni odam tiliga o'giradi. */
/*
 * Model ba'zan Markdown yozib qo'yadi ("# sarlavha", "**qalin**") — Telegram
 * HTML rejimida ular xom belgi bo'lib ko'rinadi. Kodda tozalaymiz: so'rovga
 * ishonib qolgandan ko'ra ishonchliroq.
 */
function tozala(matn = '') {
  return matn
    .replace(/^\s*#{1,6}\s+.*$/gm, '')          // sarlavha qatorlari
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')     // **qalin** → <b>
    .replace(/(^|\n)\s*[-*_]{3,}\s*(?=\n|$)/g, '$1') // --- ajratgich
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function tushuntir(royxat) {
  const matn = royxat.map((x, i) =>
    `${i + 1}) Loyiha: ${x.loyiha.name}\n`
    + `   Bu oynada necha marta: ${x.soni}\n`
    + `   ${x.sabab === 'yangi' ? 'Yangi xato — ilgari uchramagan' : 'Avval bor edi, hozir juda ko\'paydi'}\n`
    + `   Jurnal matni: ${x.namuna}`,
  ).join('\n\n');

  try {
    const javob = await askText({
      system: USLUB,
      prompt: `Quyidagi xatolarni tushuntir:\n\n${matn}`,
      maxTokens: 900,
    });
    return tozala(javob);
  } catch (e) {
    log.warn(`Sara: tushuntirish olinmadi — ${e.message}`);
    return null;
  }
}

/** Model javob bermasa — xom ro'yxat. Jim turgandan ko'ra shu yaxshi. */
function xomMatn(royxat) {
  return royxat.map((x) =>
    `🔴 <b>${esc(x.loyiha.name)}</b> — ${x.soni} marta\n<code>${esc(x.namuna.slice(0, 200))}</code>`,
  ).join('\n\n');
}

export async function tekshir() {
  const sekund = config.sara.oynaDaqiqa * 60;
  const yigilgan = await yig(sekund);
  const tanlangan = tanla(yigilgan);

  const jami = yigilgan.reduce((s, y) => s + y.guruh.size, 0);
  if (!tanlangan.length) {
    log.info(`Sara: ${jami} ta xato turi ko'rildi, yangisi yo'q`);
    // Jim o'tgan tekshiruv ham ish — aks holda sahifada Sara to'xtab
    // qolgandek ko'rinadi (holat oxirgi yozuvdan hisoblanadi).
    logRun('sara:tekshir', 1, jami ? `${jami} tur, yangisi yo'q` : 'xato yo\'q');
    return { korilgan: jami, aytilgan: 0 };
  }

  const izoh = await tushuntir(tanlangan);
  const sarlavha = tanlangan.length === 1
    ? '⚠️ <b>Xatolik aniqlandi</b>'
    : `⚠️ <b>${tanlangan.length} ta xatolik aniqlandi</b>`;

  await send(`${sarlavha}\n\n${izoh || xomMatn(tanlangan)}`);
  for (const x of tanlangan) xatoAytildi(x.loyiha.key, x.barmoq);

  log.info(`Sara: ${tanlangan.length} ta xato aytildi (${jami} turdan)`);
  logRun('sara:tekshir', 1, `${tanlangan.length}/${jami}`);
  return { korilgan: jami, aytilgan: tanlangan.length };
}

export const saraJobs = { 'sara:tekshir': tekshir };

export function startSara() {
  cron.schedule(config.sara.cron, () => {
    tekshir().catch((e) => log.error('Sara xato:', e.message));
  }, { timezone: config.tz });

  cron.schedule('25 4 * * *', () => {
    try { pruneXatolar(config.sara.keepDays); } catch { /* ignore */ }
  }, { timezone: config.tz });

  log.info(`Sara 🔎 xatoliklarni kuzatadi (${config.sara.cron})`);
}
