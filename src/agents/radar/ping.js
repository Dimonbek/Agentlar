import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sukut bo'yicha sog'lom deb hisoblanadigan kodlar. */
const DEFAULT_EXPECT = '200-399';

/**
 * Javob kodi kutilganlar ro'yxatiga tushadimi.
 * spec: '200-399' | '200,401' | '200-399,401'
 */
export function codeAllowed(code, spec) {
  for (const part of String(spec || DEFAULT_EXPECT).split(',')) {
    const s = part.trim();
    if (!s) continue;
    const range = s.match(/^(\d{3})\s*-\s*(\d{3})$/);
    if (range) {
      if (code >= Number(range[1]) && code <= Number(range[2])) return true;
    } else if (Number(s) === code) {
      return true;
    }
  }
  return false;
}

/**
 * HTTP manzilini bir marta tekshiradi.
 * HEAD ko'p serverda 405 qaytaradi, shuning uchun GET yuboramiz,
 * lekin javob tanasini saqlamaymiz — ulanish ochilishi kifoya.
 */
async function httpAttempt(url, expect) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.monitor.timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DIMON-Agency-Monitor/1.0' },
    });
    const ms = Math.round(performance.now() - t0);
    await res.arrayBuffer().catch(() => {});

    if (!codeAllowed(res.status, expect)) {
      return { status: 'err', http: res.status, ms, note: `HTTP ${res.status}` };
    }
    if (ms > config.monitor.slowMs) {
      return { status: 'warn', http: res.status, ms, note: 'sekin javob' };
    }
    return { status: 'ok', http: res.status, ms, note: null };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const note = e.name === 'AbortError'
      ? `javob bermadi (${config.monitor.timeoutMs} ms)`
      : (e.cause?.code || e.message || 'ulanib bo\'lmadi');
    return { status: 'err', http: null, ms, note };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Docker konteynerini tekshiradi — Telegram botlari kabi HTTP porti yo'q
 * loyihalar uchun. Agentlar shu serverda turgani uchun to'g'ridan-to'g'ri so'raymiz.
 * Konteyner nomi bazadan keladi, shuning uchun execFile (shell emas) ishlatiladi.
 */
async function dockerAttempt(name) {
  const t0 = performance.now();
  const fmt = '{{.State.Running}}|{{.State.Status}}|{{.State.StartedAt}}|'
    + '{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}';
  try {
    const { stdout } = await run('docker', ['inspect', '--format', fmt, name], {
      timeout: config.monitor.timeoutMs,
    });
    const ms = Math.round(performance.now() - t0);
    const [running, state, startedAt, health] = stdout.trim().split('|');

    if (running !== 'true') return { status: 'err', http: null, ms, note: `konteyner o'chiq (${state})` };
    if (health === 'unhealthy') return { status: 'err', http: null, ms, note: 'healthcheck: unhealthy' };
    if (health === 'starting') return { status: 'warn', http: null, ms, note: 'ishga tushyapti' };

    // Yaqinda qayta ko'tarilgan bo'lsa — qulab-tiklanib turgan bo'lishi mumkin
    const up = Date.now() - new Date(startedAt).getTime();
    if (Number.isFinite(up) && up < config.monitor.freshRestartMs) {
      return { status: 'warn', http: null, ms, note: 'hozirgina qayta ishga tushdi' };
    }
    return { status: 'ok', http: null, ms, note: null };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const err = `${e.stderr || ''} ${e.message || ''}`.toLowerCase();
    if (e.code === 'ENOENT') return { status: 'err', http: null, ms, note: 'docker topilmadi' };
    if (err.includes('no such object')) return { status: 'err', http: null, ms, note: 'konteyner topilmadi' };
    return { status: 'err', http: null, ms, note: (e.stderr || e.message || 'docker xatosi').trim().slice(0, 120) };
  }
}

/**
 * systemd servisini tekshiradi — Docker'siz, to'g'ridan-to'g'ri serverda
 * ishlaydigan loyihalar uchun (masalan Python botlari).
 */
async function systemdAttempt(unit) {
  const t0 = performance.now();
  try {
    // `--value` ISHLATILMAYDI: systemctl xossalarni so'ralgan tartibda emas,
    // o'z tartibida chiqaradi, shuning uchun qiymatlar nomi bilan o'qiladi.
    const { stdout } = await run('systemctl', [
      'show', unit, '--property=ActiveState,SubState,ActiveEnterTimestamp,Result',
    ], { timeout: config.monitor.timeoutMs });
    const ms = Math.round(performance.now() - t0);
    const q = Object.fromEntries(
      stdout.trim().split('\n').map((qator) => {
        const i = qator.indexOf('=');
        return i < 0 ? ['', ''] : [qator.slice(0, i).trim(), qator.slice(i + 1).trim()];
      }),
    );
    const active = q.ActiveState;
    const sub = q.SubState;
    const since = q.ActiveEnterTimestamp;
    const result = q.Result;

    if (active !== 'active') {
      const sabab = result && result !== 'success' ? `, ${result}` : '';
      return { status: 'err', http: null, ms, note: `servis ${active || 'topilmadi'} (${sub}${sabab})` };
    }
    // Yaqinda ko'tarilgan bo'lsa — qulab-tiklanib turgan bo'lishi mumkin
    const up = Date.now() - new Date(since).getTime();
    if (Number.isFinite(up) && up > 0 && up < config.monitor.freshRestartMs) {
      return { status: 'warn', http: null, ms, note: 'hozirgina qayta ishga tushdi' };
    }
    return { status: 'ok', http: null, ms, note: null };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    if (e.code === 'ENOENT') return { status: 'err', http: null, ms, note: 'systemctl topilmadi' };
    return { status: 'err', http: null, ms, note: (e.stderr || e.message || 'systemd xatosi').trim().slice(0, 120) };
  }
}

function attempt(p) {
  if (p.kind === 'docker') return dockerAttempt(p.target);
  if (p.kind === 'systemd') return systemdAttempt(p.target);
  return httpAttempt(p.target, p.expect);
}

/**
 * Loyihani tekshiradi. Birinchi urinish yiqilsa qayta uradi —
 * bir lahzalik uzilish uchun keyingi tekshiruvgacha kutib o'tirmaymiz.
 */
export async function checkProject(p) {
  let r = await attempt(p);
  for (let i = 0; i < config.monitor.retries && r.status === 'err'; i++) {
    await sleep(config.monitor.retryDelayMs);
    log.info(`qayta urinish: ${p.name}`);
    r = await attempt(p);
  }
  return r;
}
