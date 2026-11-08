import cron from 'node-cron';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../core/config.js';
import { createSender, esc } from '../../core/telegram.js';
import {
  listProjects, countProjects, addProject,
  recordCheck, pruneChecks, logRun, kvQoy,
} from '../../core/db.js';
import { log } from '../../core/logger.js';
import { checkProject } from './ping.js';
import { profilaktika } from './salomat.js';

const { send } = createSender({
  token: config.radar.token,
  chatId: config.radar.chatId,
});

/** "2 soat 10 daqiqa" ko'rinishida. */
function human(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'noma\'lum';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'bir daqiqadan kam';
  if (m < 60) return `${m} daqiqa`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} soat ${m % 60} daqiqa` : `${h} soat`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} kun ${h % 24} soat` : `${d} kun`;
}

/**
 * Birinchi ishga tushishda data/projects.json dan loyihalarni oladi.
 * Jadval bo'sh bo'lsagina ishlaydi — keyin baza yagona manba bo'lib qoladi.
 */
function seedProjects() {
  if (countProjects() > 0) return;
  const file = resolve(config.monitor.seedFile);
  if (!existsSync(file)) {
    log.warn(`Rita: loyiha yo'q. ${config.monitor.seedFile} yarating yoki dashboarddan qo'shing.`);
    return;
  }
  try {
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    for (const p of rows) {
      // `url` — `target` ning eski nomi, qo'lda yozilgan fayllar buzilmasin
      const target = p.target ?? p.url;
      if (!p.key || !p.name || !target) {
        log.warn(`Rita: urug' yozuvi to'liq emas, o'tkazib yuborildi: ${JSON.stringify(p)}`);
        continue;
      }
      addProject({ ...p, target });
    }
    log.info(`Rita: ${countProjects()} ta loyiha urug'dan yuklandi`);
  } catch (e) {
    log.error(`Rita: ${config.monitor.seedFile} o'qilmadi — ${e.message}`);
  }
}

/** Ro'yxatni bir vaqtda nechtadan tekshirish (serverni bo'g'ib qo'ymaslik uchun). */
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const DOWN = (s) => s === 'err';

/** Hamma loyihani tekshiradi, holat o'zgarganlari uchun Telegramga yozadi. */
export async function sweep() {
  const projects = listProjects({ onlyEnabled: true });
  if (!projects.length) {
    log.info('Rita: tekshiradigan loyiha yo\'q');
    logRun('rita:ping', true, 'loyiha yo\'q');
    return { checked: 0, alerts: [] };
  }

  log.info(`Rita: ${projects.length} ta loyiha tekshirilmoqda...`);
  const now = Date.now();
  const alerts = [];

  await mapLimit(projects, config.monitor.concurrency, async (p) => {
    const r = await checkProject(p);
    const streak = DOWN(r.status) ? p.fail_streak + 1 : 0;
    recordCheck(p.key, { ...r, at: now, fail_streak: streak });

    const wasDown = DOWN(p.status);
    const isDown = DOWN(r.status);

    // O'chdi: ketma-ket N marta tasdiqlangandan keyin xabar beramiz
    if (!wasDown && isDown && streak >= config.monitor.failStreak) {
      const ago = p.last_ok ? `\nOxirgi marta ishlagan: ${human(now - p.last_ok)} oldin` : '';
      const what = p.kind === 'docker' ? 'ishlamayapti' : 'javob bermayapti';
      alerts.push(
        `🔴 <b>${esc(p.name)}</b> ${what}\n` +
        `<code>${esc(p.target)}</code>\n` +
        `Sabab: ${esc(r.note || 'noma\'lum')}${ago}`,
      );
    }

    // Qaytdi
    if (wasDown && !isDown) {
      const down = p.last_ok ? ` — ${human(now - p.last_ok)} o'chiq turdi` : '';
      const how = p.kind === 'docker' ? '' : ` (${r.ms} ms)`;
      alerts.push(`🟢 <b>${esc(p.name)}</b> qaytdi${how}${down}`);
    }

    log.info(`  ${p.name}: ${r.status} ${r.http ?? '-'} ${r.ms}ms${r.note ? ` (${r.note})` : ''}`);
  });

  for (const text of alerts) {
    await send(text).catch((e) => log.error(`Rita xabar yubora olmadi: ${e.message}`));
  }

  logRun('rita:ping', true, `${projects.length} ta, ${alerts.length} ogohlantirish`);
  log.info(`Rita: tekshiruv tugadi — ${alerts.length} ta ogohlantirish`);
  return { checked: projects.length, alerts };
}

const BELGI = { err: '🔴', warn: '🟡', ok: '🟢' };

/*
 * Profilaktika — kunda bir marta. Hammasi joyida bo'lsa Telegramga yozilmaydi:
 * har kuni "disk 64% to'lgan" deb turadigan xabarni odam bir haftada o'qimay
 * qo'yadi, keyin haqiqiy ogohlantirishni ham o'tkazib yuboradi.
 *
 * Natija baribir bazaga yoziladi — dashboard shu yerdan o'qiydi.
 */
export async function profilaktikaIsh() {
  const n = await profilaktika();
  kvQoy('rita:salomat', JSON.stringify(n));

  // Jiddiylari yuqorida tursin
  const tartib = { err: 0, warn: 1 };
  const muhim = [...n.server, ...n.ssl, ...n.domen, ...n.sekin]
    .filter((x) => x.status !== 'ok')
    .sort((a, b) => tartib[a.status] - tartib[b.status]);

  if (!muhim.length) {
    log.info('Rita: profilaktika — hammasi joyida');
    logRun('rita:salomat', true, 'hammasi joyida');
    return n;
  }

  const qatorlar = muhim.map((x) => {
    const nom = x.nom || x.host || x.domen || x.kalit;
    return `${BELGI[x.status]} <b>${esc(nom)}</b> — ${esc(x.matn)}`;
  });

  // Xotira muammosi bo'lsa "kim yeyapti?" degan savol darhol tug'iladi
  const xotira = muhim.some((x) => x.kalit === 'ram' || x.kalit === 'swap');
  if (xotira && n.ogir.length) {
    qatorlar.push('', '<i>Eng ko\'p xotira olgan konteynerlar:</i>');
    for (const k of n.ogir) qatorlar.push(`• ${esc(k.nom)} — ${esc(k.xotira)} (CPU ${esc(k.cpu)})`);
  }

  await send(`🩺 <b>Rita — profilaktika</b>\n\n${qatorlar.join('\n')}`)
    .catch((e) => log.error(`Rita profilaktika xabari ketmadi: ${e.message}`));

  log.info(`Rita: profilaktika — ${muhim.length} ta e'tibor talab qiladigan narsa`);
  logRun('rita:salomat', true, `${muhim.length} ogohlantirish`);
  return n;
}

export const jobs = {
  // Qo'lda ishga tushirilganda ham urug' yuklanadi: aks holda birinchi
  // `npm run rita:ping` bo'sh bazaga urilib, hech narsa tekshirmasdi.
  'rita:ping': async () => { seedProjects(); return sweep(); },
  'rita:salomat': profilaktikaIsh,
};

export function startRadar() {
  seedProjects();
  const opts = { timezone: config.tz };
  cron.schedule(config.monitor.cron, () => {
    sweep().catch((e) => {
      log.error('Rita sweep xatosi:', e.message);
      logRun('rita:ping', false, e.message);
    });
  }, opts);
  cron.schedule(config.salomat.cron, () => {
    profilaktikaIsh().catch((e) => {
      log.error('Rita profilaktika xatosi:', e.message);
      logRun('rita:salomat', false, e.message);
    });
  }, opts);
  cron.schedule('0 4 * * 0', () => pruneChecks(config.monitor.keepDays), opts);
  log.info(`Rita 🛰 nazorati ishga tushdi — ping "${config.monitor.cron}", `
    + `profilaktika "${config.salomat.cron}" (${config.tz})`);
}
