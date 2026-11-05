import cron from 'node-cron';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../core/config.js';
import { createSender, esc } from '../../core/telegram.js';
import {
  listProjects, countProjects, addProject,
  recordCheck, pruneChecks, logRun,
} from '../../core/db.js';
import { log } from '../../core/logger.js';
import { checkProject } from './ping.js';

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

export const jobs = {
  // Qo'lda ishga tushirilganda ham urug' yuklanadi: aks holda birinchi
  // `npm run rita:ping` bo'sh bazaga urilib, hech narsa tekshirmasdi.
  'rita:ping': async () => { seedProjects(); return sweep(); },
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
  cron.schedule('0 4 * * 0', () => pruneChecks(config.monitor.keepDays), opts);
  log.info(`Rita 🛰 nazorati ishga tushdi — "${config.monitor.cron}" (${config.tz})`);
}
