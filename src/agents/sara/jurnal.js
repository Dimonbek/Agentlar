import { execFile } from 'node:child_process';

/** Buyruqni shellsiz ishga tushiradi — konteyner nomi bazadan kelgani uchun. */
function run(cmd, args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 12 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        matn: (stdout || '') + (stderr || ''),
        xato: err && !stdout && !stderr ? err.message : null,
      }));
  });
}

/** Konteyner jurnali. Docker xatolarni stderr ga yozadi — ikkisi ham kerak. */
export const dockerJurnal = (nom, sekund) =>
  run('docker', ['logs', '--since', `${sekund}s`, '--tail', '2000', nom]);

/** systemd servis jurnali — faqat ogohlantirish va undan jiddiyroq. */
export const systemdJurnal = (unit, sekund) =>
  run('journalctl', ['-u', unit, '--since', `-${sekund}s`,
    '-p', 'warning', '--no-pager', '-n', '2000', '-o', 'cat']);

/*
 * Xatoga o'xshash qatorni tanish. Yalang'och "warn" olinmaydi — u juda
 * shovqinli. Tarkibi:
 *   1-qator — ingliz tilidagi odatiy belgilar
 *   2-qator — tizim xato kodlari (EACCES, ECONNREFUSED, ENOENT...)
 *   3-qator — HTTP so'rovidagi 4xx/5xx javob kodi (404 ham shunda tutiladi)
 *   4-qator — o'zimizning o'zbekcha loglarimiz
 */
const birlashtir = (royxat, bayroq) =>
  new RegExp(royxat.map((r) => r.source).join('|'), bayroq);

// Katta-kichik harf farq qilmaydigan belgilar
const XATO_BELGI = birlashtir([
  /\b(?:errors?|fatal|critical|exceptions?|traceback|panic|unhandled|rejection)\b/,
  /\b(?:fail|failed|failure)\b/,
  /permission denied|cannot find|refused|timed out|out of memory/,
  /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\b[^\n]*\b[45]\d\d\b/,
  /\bstatus\s*[:=]?\s*[45]\d\d\b/,
  /xato|uzilish|yiqil|ishlamadi/,
], 'i');

/*
 * Bu naqshlar katta-kichik harfni AJRATADI. Sababi tekshirilgan: /i bilan
 * `\bE[A-Z]{3,}\b` oddiy "Established" so'zini EACCES deb tutib, muvaffaqiyatli
 * ulanish haqidagi INFO qatorini xato deb yuborgan.
 *   EACCES, ECONNREFUSED, ENOENT — tizim xato kodlari (hammasi bosh harf)
 *   ValueError, KeyError, HTTPException — Pythonning CamelCase xatolari
 */
const XATO_BELGI_AA = birlashtir([
  /\bE[A-Z]{3,}\d*\b/,
  /\b[A-Z]\w*(?:Error|Exception)\b/,
], '');

/*
 * Xatoning DAVOMI bo'lgan qatorlar. Bular alohida xato emas: stek izi,
 * "Read more:" havolasi, Pythonning "File ..." qatori. Ajratib olinsa,
 * Sara bitta xatoni ikkita deb o'ylab, ikkinchisiga izoh to'qib chiqaradi.
 */
const DAVOMI = [
  /^at\s/i,                       // JS stek izi: "at Object.foo (...)"
  /^read more\b/i,                // Next.js havolasi
  /^file\s".+",\s*line\s\d+/i,    // Python traceback
  /^\s*\^+\s*$/,                  // kursor ko'rsatkichi
  /^https?:\/\/\S+$/i,            // yolg'iz havola
  /^\.{3}|^\|\s/,                 // qisqartirish va ustun chizig'i
  /^\(/,                          // "(background on this error at: ...)"
  // Dastur o'zi "bu xato emas" deb belgilagan qatorlar
  /^(?:INFO|DEBUG|TRACE|NOTICE)\b/i,
  /^\[(?:info|debug|trace)\]/i,
];

/** Faqat xatoga o'xshash qatorlarni ajratadi (davomi qatorlarsiz). */
export function xatoQatorlari(matn) {
  return matn.split(/\r?\n/)
    .map((q) => q.trim())
    .filter((q) => q.length > 8 && q.length < 2000
      && !DAVOMI.some((re) => re.test(q))
      && (XATO_BELGI.test(q) || XATO_BELGI_AA.test(q)));
}

// Javob kodini raqamsiz nomga aylantiramiz — aks holda keyingi qadamda
// hamma raqam N ga aylanib, 404 va 500 bitta xato bo'lib qolardi.
const KOD = {
  400: 'sorov-xato', 401: 'kirish-yoq', 403: 'ruxsat-yoq', 404: 'topilmadi',
  409: 'ziddiyat', 413: 'juda-katta', 429: 'kop-sorov',
  500: 'server-xatosi', 502: 'shlyuz-xato', 503: 'ishlamayapti', 504: 'kutish-tugadi',
};

/**
 * Qatorni "barmoq izi"ga aylantiradi: o'zgaruvchi qismlar (vaqt, raqam,
 * UUID, IP) olib tashlanadi. Shunda bitta xatoning ming marta takrorlanishi
 * bazada bitta yozuv bo'lib qoladi.
 */
export function barmoqIzi(qator) {
  return qator
    .replace(/\u001b\[[0-9;]*m/g, '')                                    // ANSI ranglar
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g, '') // ISO vaqt
    .replace(/\b[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/g, '')     // syslog vaqt
    .replace(/\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b([45]\d\d)\b/g, (m, k) => `<${KOD[k] || 'kod'}>`)        // 404 ≠ 500
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}
