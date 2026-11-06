import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../core/config.js';
import { listProjects, recentChecks } from '../core/db.js';
import { log } from '../core/logger.js';

const BU = dirname(fileURLToPath(import.meta.url));
const SAHIFA = join(BU, 'ofis.html');
// Suratlar shu papkaga tashlanadi; bo'lmasa sahifa chizmalar bilan ishlayveradi.
const AVATAR = resolve(config.web.avatarDir);

const TUR = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

/** Guruh nomlari — bazada qisqa kalit, sahifada ko'rinadigan nom. */
const GURUH = {
  agentlar: { nom: 'AGENTLAR', izoh: 'AI jamoa',          rang: '#2b52ee' },
  kgf:      { nom: 'KGF',      izoh: 'HR va xarajat',     rang: '#0ea5e9' },
  tur:      { nom: 'TUR',      izoh: 'sayohat botlari',   rang: '#7c3aed' },
  subtitr:  { nom: 'SUBTITR',  izoh: 'AI subtitr',        rang: '#3b82f6' },
  crm:      { nom: 'CRM',      izoh: 'mijozlar bazasi',   rang: '#0891b2' },
  infra:    { nom: 'INFRA',    izoh: 'umumiy xizmatlar',  rang: '#64748b' },
};

/** Agentlarning o'zi — bazada emas, chunki ular kuzatilmaydi, kuzatadi. */
function agentlar() {
  const oxirgi = listProjects()
    .map((p) => p.last_check)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] ?? null;
  return [
    { nom: 'Debra', kind: 'agent', target: 'ertalabki hisobot',    status: 'warn', note: '4-bosqich' },
    { nom: 'Rita',  kind: 'agent', target: 'har 30 daqiqada ping', status: 'ok',   at: oxirgi },
    { nom: 'Layla', kind: 'agent', target: 'obunalar',             status: 'warn', note: '2-bosqich' },
    { nom: 'Sara',  kind: 'agent', target: 'xatolar',              status: 'warn', note: '3-bosqich' },
  ];
}

/**
 * Qaysi agentning surati bor. Sahifa shu ro'yxatga qarab chizma yoki
 * surat ishlatadi — yo'q faylga havola qilib bo'sh doira chiqarmaydi.
 */
async function avatarlar() {
  try {
    const fayllar = await readdir(AVATAR);
    const bor = {};
    for (const f of fayllar) {
      const tur = extname(f).toLowerCase();
      if (!TUR[tur]) continue;
      bor[f.slice(0, -tur.length).toLowerCase()] = '/avatar/' + encodeURIComponent(f);
    }
    return bor;
  } catch {
    return {};                       // papka yo'q — chizmalar ishlatiladi
  }
}

/** Bazadagi holatni sahifa kutadigan ko'rinishga o'giradi. */
function holat() {
  const xonalar = new Map();
  const qoy = (kalit, item) => {
    if (!xonalar.has(kalit)) {
      const g = GURUH[kalit] ?? { nom: kalit.toUpperCase(), izoh: '', rang: '#64748b' };
      xonalar.set(kalit, { id: kalit, ...g, items: [] });
    }
    xonalar.get(kalit).items.push(item);
  };

  for (const a of agentlar()) qoy('agentlar', a);

  for (const p of listProjects()) {
    qoy(p.grp, {
      nom: p.name,
      kind: p.kind,
      target: p.target,
      status: p.enabled ? p.status : 'ochiq',
      ms: p.ms,
      http: p.http,
      note: p.note,
      at: p.last_check,
      tarix: recentChecks(p.key, 24).map((c) => c.status),
    });
  }
  return { yangilandi: Date.now(), xonalar: [...xonalar.values()] };
}

function javob(res, kod, tur, tana, keshsiz = true) {
  res.writeHead(kod, {
    'Content-Type': tur,
    'Cache-Control': keshsiz ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(tana);
}

async function avatarBer(res, nom) {
  // Yo'ldan chiqib ketishning oldini olamiz: faqat AVATAR ichidagi fayl.
  const yol = normalize(join(AVATAR, nom));
  if (yol !== AVATAR && !yol.startsWith(AVATAR + sep)) return javob(res, 403, 'text/plain', 'yo’q');
  const tur = TUR[extname(yol).toLowerCase()];
  if (!tur) return javob(res, 415, 'text/plain', 'bu tur qo’llanmaydi');
  try {
    javob(res, 200, tur, await readFile(yol), false);
  } catch {
    javob(res, 404, 'text/plain', 'surat topilmadi');
  }
}

export function startWeb() {
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/api/holat') {
        const tana = { ...holat(), avatarlar: await avatarlar() };
        return javob(res, 200, 'application/json; charset=utf-8', JSON.stringify(tana));
      }
      if (u.pathname.startsWith('/avatar/')) {
        return await avatarBer(res, decodeURIComponent(u.pathname.slice('/avatar/'.length)));
      }
      if (u.pathname === '/' || u.pathname === '/index.html') {
        return javob(res, 200, 'text/html; charset=utf-8', await readFile(SAHIFA));
      }
      javob(res, 404, 'text/plain', 'topilmadi');
    } catch (e) {
      log.error('web xatosi:', e.message);
      javob(res, 500, 'text/plain', 'ichki xato');
    }
  });

  // Faqat ichki manzilda tinglaydi — tashqariga Caddy chiqaradi (parol bilan).
  server.listen(config.web.port, config.web.host, () => {
    log.info(`Ofis sahifasi: http://${config.web.host}:${config.web.port} (avatar: ${AVATAR})`);
  });
  return server;
}
