import { log } from './logger.js';

let keshKurs = null;
let keshVaqt = 0;
const KURS_TTL = 3600_000; // 1 soat kesh

/** Markaziy Bankning (CBU) jonli USD kursini oladi. */
export async function getUsdRate() {
  if (keshKurs && Date.now() - keshVaqt < KURS_TTL) {
    return keshKurs;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = Number(data[0]?.Rate);
    if (Number.isFinite(rate) && rate > 0) {
      keshKurs = rate;
      keshVaqt = Date.now();
      return rate;
    }
  } catch (e) {
    log.warn(`Valyuta kursi olinmadi (${e.message}), zaxira kurs ishlatiladi`);
    if (keshKurs) return keshKurs;
  }
  // Zaxira kurs (agar Markaziy Bank saytiga ulanib bo'lmasa)
  return 12800;
}

/** Obuna summasini chiroyli formatlaydi (dollarda bo'lsa so'mdagi qiymati bilan). */
export async function formatPul(o) {
  const isUsd = o.valyuta === '$' || String(o.valyuta).toUpperCase() === 'USD';
  const summa = Number(o.summa);

  if (!isUsd) {
    return `${summa.toLocaleString('uz-UZ')} ${o.valyuta || "so'm"}`;
  }

  const kurs = await getUsdRate();
  const som = Math.round(summa * kurs);
  return `$${summa} (≈ ${som.toLocaleString('uz-UZ')} so'm, MB kursi: ${Math.round(kurs).toLocaleString('uz-UZ')})`;
}

/** Obunaning so'mdagi qiymatini hisoblaydi (jami oylik xarajat uchun). */
export async function obunaSomda(o) {
  const isUsd = o.valyuta === '$' || String(o.valyuta).toUpperCase() === 'USD';
  const summa = Number(o.summa);
  if (!isUsd) return summa;

  const kurs = await getUsdRate();
  return Math.round(summa * kurs);
}
