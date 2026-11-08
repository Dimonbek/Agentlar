/*
 * Rita'ning ikkinchi ko'zi: loyiha "ishlayaptimi" degan savoldan tashqari,
 * yaqin kelajakda nima buzilishi mumkinligini ham ko'radi.
 *
 *   server  — disk, operativ xotira, swap, protsessor yuki
 *   ssl     — sertifikat necha kundan keyin tugaydi
 *   domen   — domen ijarasi necha kundan keyin tugaydi
 *   sekin   — sayt ilgarigidan sezilarli sekinlashdimi
 *
 * Bularning hammasi bir xil ko'rinishda qaytadi: { status, matn, ... }.
 * `status` — 'ok' | 'warn' | 'err', sahifa va Telegram xabari shunga qaraydi.
 */
import { readFile, statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import tls from 'node:tls';
import { config } from '../../core/config.js';
import { listProjects, msOraliq } from '../../core/db.js';
import { log } from '../../core/logger.js';

const run = promisify(execFile);
const KUN = 86_400_000;

/** Uchta chegaradan holat: kichik qiymat yaxshi (disk, xotira foizi). */
function yuqoriYomon(qiymat, warn, err) {
  if (qiymat >= err) return 'err';
  if (qiymat >= warn) return 'warn';
  return 'ok';
}

/** Kichik qiymat yomon (qolgan kunlar). */
function pastYomon(qiymat, warn, err) {
  if (qiymat <= err) return 'err';
  if (qiymat <= warn) return 'warn';
  return 'ok';
}

const gb = (bayt) => (bayt / 1024 ** 3).toFixed(1);

// ---- Server resurslari ----

/*
 * Operativ xotirani `os.freemem()` bilan o'lchash yaramaydi: Linux bo'sh
 * xotirani fayl keshiga beradi, shuning uchun "bo'sh" deyarli doim kam
 * ko'rinadi. /proc/meminfo dagi MemAvailable — yadroning o'zi hisoblagan
 * "dasturlarga berish mumkin" qiymati, kerak bo'lsa kesh bo'shatiladi.
 */
async function meminfo() {
  const matn = await readFile('/proc/meminfo', 'utf8');
  const olch = {};
  for (const qator of matn.split('\n')) {
    const m = qator.match(/^(\w+):\s+(\d+) kB$/);
    if (m) olch[m[1]] = Number(m[2]) * 1024;
  }
  return olch;
}

export async function serverHolati() {
  const s = config.salomat;
  const chiq = [];

  try {
    const d = await statfs('/');
    const jami = d.blocks * d.bsize;
    const bosh = d.bavail * d.bsize;          // bfree emas: root uchun zaxira hisobga olinmaydi
    const foiz = Math.round((1 - bosh / jami) * 100);
    chiq.push({
      kalit: 'disk',
      nom: 'Disk',
      status: yuqoriYomon(foiz, s.diskWarn, s.diskErr),
      foiz,
      matn: `${foiz}% to'lgan — ${gb(bosh)} GB bo'sh (${gb(jami)} GB dan)`,
    });
  } catch (e) {
    log.warn(`Rita: disk o'qilmadi — ${e.message}`);
  }

  try {
    const m = await meminfo();
    if (m.MemTotal && m.MemAvailable) {
      const foiz = Math.round((1 - m.MemAvailable / m.MemTotal) * 100);
      chiq.push({
        kalit: 'ram',
        nom: 'Operativ xotira',
        status: yuqoriYomon(foiz, s.ramWarn, s.ramErr),
        foiz,
        matn: `${foiz}% band — ${gb(m.MemAvailable)} GB bo'sh (${gb(m.MemTotal)} GB dan)`,
      });
    }
    // Swap — diskdagi zaxira xotira. To'lib qolsa server sekinlashadi.
    if (m.SwapTotal > 0) {
      const foiz = Math.round((1 - m.SwapFree / m.SwapTotal) * 100);
      chiq.push({
        kalit: 'swap',
        nom: 'Zaxira xotira (swap)',
        status: foiz >= s.swapWarn ? 'warn' : 'ok',
        foiz,
        matn: `${foiz}% band — ${gb(m.SwapTotal - m.SwapFree)} GB ishlatilgan`,
      });
    }
  } catch (e) {
    log.warn(`Rita: xotira o'qilmadi — ${e.message}`);
  }

  // Protsessor yuki — 5 daqiqalik o'rtacha, yadro soniga bo'lingan.
  // 1 dan oshsa navbat paydo bo'ladi, shuning uchun yadroga nisbatan olinadi.
  const yadro = os.cpus().length || 1;
  const yuk = os.loadavg()[1] / yadro;
  chiq.push({
    kalit: 'cpu',
    nom: 'Protsessor',
    status: yuk >= s.yukWarn ? 'warn' : 'ok',
    foiz: Math.round(yuk * 100),
    matn: `yuk ${yuk.toFixed(2)} (${yadro} yadro, 5 daqiqalik o'rtacha)`,
  });

  return chiq;
}

/*
 * Xotirani eng ko'p yeyayotgan uchta konteyner. Ogohlantirish bermaydi —
 * "xotira to'lgan" degan xabarni o'qigan odam darhol "kim yeyapti?" deb
 * so'raydi, javob shu yerda tursin.
 */
export async function ogirKonteynerlar(nechta = 3) {
  try {
    const { stdout } = await run('docker',
      ['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}'],
      { timeout: 25_000 });
    return stdout.trim().split('\n')
      .map((q) => {
        const [nom, xotira, xotiraFoiz, cpu] = q.split('|');
        return { nom, xotira, cpu, tartib: parseFloat(xotiraFoiz) || 0 };
      })
      .sort((a, b) => b.tartib - a.tartib)
      .slice(0, nechta);
  } catch (e) {
    log.warn(`Rita: docker stats o'qilmadi — ${e.message}`);
    return [];
  }
}

// ---- SSL sertifikati ----

/** Bitta hostning sertifikati qachon tugaydi. */
function sertifikat(host, port = 443) {
  return new Promise((resolve) => {
    const tugat = (natija) => { resolve(natija); try { s.destroy(); } catch { /* yopilgan */ } };
    // rejectUnauthorized: false — maqsad ishonchni tekshirish emas, muddatni
    // o'qish. Muddati o'tgan sertifikatni ham ko'rishimiz kerak.
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      if (!c || !c.valid_to) return tugat({ host, xato: 'sertifikat o\'qilmadi' });
      const tugaydi = new Date(c.valid_to).getTime();
      tugat({
        host,
        tugaydi,
        kun: Math.floor((tugaydi - Date.now()) / KUN),
        beruvchi: c.issuer?.O || null,
      });
    });
    s.setTimeout(10_000, () => tugat({ host, xato: 'ulanish vaqti tugadi' }));
    s.on('error', (e) => tugat({ host, xato: e.message }));
  });
}

export async function sertifikatlar() {
  const s = config.salomat;
  const hostlar = [...new Set(
    listProjects({ onlyEnabled: true })
      .filter((p) => p.kind === 'http' && /^https:\/\//i.test(p.target))
      .map((p) => { try { return new URL(p.target).hostname; } catch { return null; } })
      .filter(Boolean),
  )];

  const natija = await Promise.all(hostlar.map((h) => sertifikat(h)));
  return natija.map((r) => r.xato
    ? { ...r, status: 'warn', matn: `sertifikat tekshirilmadi — ${r.xato}` }
    : {
      ...r,
      status: pastYomon(r.kun, s.sslWarn, s.sslErr),
      matn: r.kun < 0
        ? `sertifikat ${-r.kun} kun oldin tugagan`
        : `sertifikat ${r.kun} kundan keyin tugaydi`,
    });
}

// ---- Domen ijarasi ----

/*
 * Ikki bo'g'inli oxirgi qo'shimchalar: `co.uz` ning o'zi domen emas,
 * shuning uchun `sayt.co.uz` dan uch bo'g'in olinadi.
 */
const IKKI_BOGIN = /\.(?:co|com|net|org|gov|edu|biz|info|me)\.[a-z]{2,3}$/i;

export function asosiyDomen(host) {
  const b = String(host || '').toLowerCase().replace(/\.$/, '').split('.');
  if (b.length < 2) return null;
  const kerak = IKKI_BOGIN.test(host) ? 3 : 2;
  return b.length <= kerak ? b.join('.') : b.slice(-kerak).join('.');
}

/*
 * RDAP — domen ma'lumotini olishning zamonaviy usuli (whois ning JSON
 * ko'rinishi). .uz uchun rasmiy manzil rdap.cctld.uz, boshqa zonalar
 * uchun rdap.org o'zi kerakli reyestrga yo'naltiradi.
 */
async function rdap(domen) {
  const uz = /\.uz$/i.test(domen);
  const url = uz
    ? `https://rdap.cctld.uz/domain/${encodeURIComponent(domen)}`
    : `https://rdap.org/domain/${encodeURIComponent(domen)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { Accept: 'application/rdap+json', 'User-Agent': 'DIMON-Agency-Monitor/1.0' },
    });
    if (!res.ok) return { domen, xato: `RDAP ${res.status}` };
    const j = await res.json();
    const hodisa = (j.events || []).find((e) => e.eventAction === 'expiration');
    if (!hodisa?.eventDate) return { domen, xato: 'muddat ko\'rsatilmagan' };
    const tugaydi = new Date(hodisa.eventDate).getTime();
    if (!Number.isFinite(tugaydi)) return { domen, xato: 'muddat o\'qilmadi' };
    return { domen, tugaydi, kun: Math.floor((tugaydi - Date.now()) / KUN) };
  } catch (e) {
    return { domen, xato: e.name === 'AbortError' ? 'javob bermadi' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function domenlar() {
  const s = config.salomat;

  // Loyihalardagi hostlardan o'zimizning domenlarni ajratamiz. sslip.io,
  // railway.app va shunga o'xshash bepul subdomenlar bizning emas — ularning
  // muddatini kuzatishdan ma'no yo'q.
  const royxat = new Set(s.domenlar);
  for (const p of listProjects({ onlyEnabled: true })) {
    if (p.kind !== 'http') continue;
    let host;
    try { host = new URL(p.target).hostname; } catch { continue; }
    if (/^[\d.]+$/.test(host) || host === 'localhost') continue;
    if (s.begona.some((re) => re.test(host))) continue;
    const d = asosiyDomen(host);
    if (d) royxat.add(d);
  }

  const natija = await Promise.all([...royxat].map((d) => rdap(d)));
  return natija.map((r) => r.xato
    ? { ...r, status: 'warn', matn: `muddat tekshirilmadi — ${r.xato}` }
    : {
      ...r,
      status: pastYomon(r.kun, s.domenWarn, s.domenErr),
      matn: r.kun < 0
        ? `ijara ${-r.kun} kun oldin tugagan`
        : `ijara ${r.kun} kundan keyin tugaydi`,
    });
}

// ---- Sekinlashuv ----

const mediana = (royxat) => {
  if (!royxat.length) return null;
  const s = [...royxat].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/*
 * Sayt "ishlayapti" bo'lib tursa ham sekinlashib borayotgan bo'lishi mumkin.
 * Oxirgi bir kunlik medianani undan oldingi bir haftalik mediana bilan
 * solishtiramiz. Mediana olinadi, o'rtacha emas: bitta tasodifiy sekin
 * javob o'rtachani ko'taradi, medianaga ta'sir qilmaydi.
 *
 * Ikki shart birga bajarilishi kerak — necha barobar va necha millisekund.
 * Faqat barobarga qarasa, 20 ms dan 50 ms ga o'tgan sayt ham "2.5 barobar
 * sekinlashdi" bo'lib chiqadi, aslida odam buni sezmaydi.
 */
export function sekinlashuv() {
  const s = config.salomat;
  const now = Date.now();
  const chiq = [];

  for (const p of listProjects({ onlyEnabled: true })) {
    if (p.kind !== 'http') continue;

    const hozir = msOraliq(p.key, now - KUN, now);
    const oldin = msOraliq(p.key, now - 7 * KUN, now - KUN);
    if (hozir.length < s.ozKam || oldin.length < s.ozKam) continue;

    const a = mediana(hozir);
    const b = mediana(oldin);
    if (!a || !b) continue;

    const sekinlashdi = a >= b * s.karra && a - b >= s.qoshimcha;
    if (!sekinlashdi) continue;

    chiq.push({
      kalit: p.key,
      nom: p.name,
      hozir: a,
      oldin: b,
      status: 'warn',
      matn: `${b} ms dan ${a} ms ga sekinlashdi (${(a / b).toFixed(1)} barobar)`,
    });
  }
  return chiq;
}

// ---- Hammasi birga ----

/** Barcha tekshiruvlar. Biri yiqilsa qolganlari baribir qaytadi. */
export async function profilaktika() {
  const [server, ssl, domen, ogir] = await Promise.all([
    serverHolati().catch((e) => { log.warn(`Rita: server — ${e.message}`); return []; }),
    sertifikatlar().catch((e) => { log.warn(`Rita: ssl — ${e.message}`); return []; }),
    domenlar().catch((e) => { log.warn(`Rita: domen — ${e.message}`); return []; }),
    ogirKonteynerlar().catch(() => []),
  ]);
  let sekin = [];
  try { sekin = sekinlashuv(); } catch (e) { log.warn(`Rita: sekinlashuv — ${e.message}`); }

  const hammasi = [...server, ...ssl, ...domen, ...sekin];
  const eng = hammasi.some((x) => x.status === 'err') ? 'err'
    : hammasi.some((x) => x.status === 'warn') ? 'warn' : 'ok';

  return { server, ssl, domen, sekin, ogir, status: eng, at: Date.now() };
}
