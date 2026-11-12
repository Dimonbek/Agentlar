import { listProjects, kvOl, recordCheck } from '../../core/db.js';
import { checkProject } from './ping.js';

/** Rita ixtiyoridagi asboblar (Claude tool-use). */
export const ritaTools = [
  {
    name: 'get_projects_health',
    description:
      "Barcha kuzatilayotgan veb-saytlar, botlar, Docker konteynerlari va serverlar (disk, operativ xotira, swap, CPU, SSL sertifikatlar) " +
      "holatini bazadan oladi. 'Loyihalarim qalay?', 'server qanday?', 'qaysi sayt ishlamayapti?', 'salomatlik qanday?' " +
      "kabi har qanday monitoring so'rovida ALBATTA shu asbobni ishlat.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'check_project_live',
    description:
      "Bitta aniq loyihani hozirning o'zida jonli tekshirib (ping qilib), uning yangi holati, HTTP kodi va javob tezligini (ms) qaytaradi. " +
      "Dexter 'falon saytni tekshir', 'ishlayaptimi qara' deb so'raganda ishlatiladi.",
    input_schema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: "Loyiha kaliti yoki nomi (masalan: 'kgf-web', 'subtitr-web', 'crm', 'kokandgoldfuture.uz').",
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
];

function oxirgiSalomat() {
  try {
    const xom = kvOl('rita:salomat');
    return xom ? JSON.parse(xom) : null;
  } catch {
    return null;
  }
}

export async function runRitaTool(name, input) {
  if (name === 'get_projects_health') {
    const loyihalar = listProjects();
    const salomat = oxirgiSalomat();

    const faol = loyihalar.filter((p) => p.enabled);
    const ishlayotgan = faol.filter((p) => p.status === 'ok');
    const muammoli = faol.filter((p) => p.status !== 'ok').map((p) => ({
      kalit: p.key,
      nom: p.name,
      holat: p.status,
      target: p.target,
      http_kod: p.http,
      javob_vaqti_ms: p.ms,
      oxirgi_ishlagan_vaqt: p.last_ok ? new Date(p.last_ok).toISOString() : null,
      xatolar_ketma_ketligi: p.fail_streak,
    }));

    const ogohlantirishlar = [];
    if (salomat) {
      for (const x of [...(salomat.ssl || []), ...(salomat.domen || []), ...(salomat.sekin || [])]) {
        if (x.status !== 'ok') {
          ogohlantirishlar.push({
            turi: x.status,
            nom: x.nom || x.host || x.domen || x.kalit,
            matn: x.matn,
          });
        }
      }
    }

    return {
      jami_loyihalar: faol.length,
      ishlayotgan_loyihalar_soni: ishlayotgan.length,
      muammoli_loyihalar_soni: muammoli.length,
      muammoli_loyihalar: muammoli,
      server_resurslari: salomat?.server || [],
      profilaktika_ogohlantirishlari: ogohlantirishlar,
      loyihalar_qisqacha: faol.map((p) => ({
        kalit: p.key,
        nom: p.name,
        holat: p.status,
        ms: p.ms,
        http: p.http,
      })),
    };
  }

  if (name === 'check_project_live') {
    const query = String(input.project || '').toLowerCase().trim();
    const loyihalar = listProjects();
    const p = loyihalar.find(
      (x) => x.key.toLowerCase() === query ||
             x.name.toLowerCase() === query ||
             x.target.toLowerCase().includes(query)
    );

    if (!p) {
      return {
        xato: `'${input.project}' bo'yicha loyiha topilmadi. Mavjud kalitlar: ${loyihalar.map((x) => x.key).join(', ')}`,
      };
    }

    const r = await checkProject(p);
    const now = Date.now();
    const streak = r.status === 'err' ? p.fail_streak + 1 : 0;
    recordCheck(p.key, { ...r, at: now, fail_streak: streak });

    return {
      kalit: p.key,
      nom: p.name,
      holat: r.status,
      javob_vaqti_ms: r.ms,
      http_kod: r.http || null,
      izoh: r.note || null,
      target: p.target,
      xabar: r.status === 'ok'
        ? `✅ ${p.name} muvaffaqiyatli javob berdi (${r.ms} ms${r.http ? ', HTTP ' + r.http : ''}).`
        : `❌ ${p.name} da muammo: ${r.note || r.status} (${r.ms} ms).`,
    };
  }

  throw new Error(`Noma'lum Rita asbobi: ${name}`);
}
