/*
 * Testlar uchun qum solingan xotira papkasi.
 *
 * Xotira moduli haqiqiy fayllarga yozadi: pasportlarga qator qo'shadi,
 * voqealar jurnaliga yozuv tushiradi. Testlar ham xuddi shu funksiyalarni
 * chaqirgani uchun, ilgari har test ishga tushganda data/xotira ichidagi
 * fayllar o'zgarib qolardi — gitda "Test aksiyasi muvaffaqiyatli bajarildi"
 * degan yozuvlar paydo bo'lib, server bilan git ajralib ketardi.
 *
 * Shuning uchun bu fayl vaqtinchalik papka yasab, haqiqiy pasportlarni
 * o'sha yerga nusxalaydi va XOTIRA_DIR ni o'shanga yo'naltiradi. Testlar
 * o'qiy oladi (pasportlar joyida), yozgani esa haqiqiy fayllarga tegmaydi.
 *
 * Muhim: bu fayl xotira modulidan OLDIN import qilinishi kerak — modul
 * papka yo'lini yuklanish paytida bir marta o'qiydi.
 */
import { cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const asl = resolve('data/xotira');
const qum = mkdtempSync(join(tmpdir(), 'agentlar-xotira-'));

if (existsSync(asl)) cpSync(asl, qum, { recursive: true });
process.env.XOTIRA_DIR = qum;

// Testlar tugagach o'zidan keyin tozalab ketadi
process.on('exit', () => {
  try { rmSync(qum, { recursive: true, force: true }); } catch { /* muhim emas */ }
});

export const qumPapka = qum;
