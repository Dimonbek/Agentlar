import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const XOTIRA_DIR = resolve('data/xotira');
const LOYIHALAR_DIR = join(XOTIRA_DIR, 'loyihalar');
const AGENTLAR_DIR = join(XOTIRA_DIR, 'agentlar');
const TARIX_DIR = join(XOTIRA_DIR, 'tarix');
const VOQEALAR_FAYL = join(TARIX_DIR, 'voqealar.jsonl');

/** Kerakli papkalarni tekshirib, yo'q bo'lsa yaratadi. */
function ensureDirs() {
  for (const d of [XOTIRA_DIR, LOYIHALAR_DIR, AGENTLAR_DIR, TARIX_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

/** Loyiha so'rovini tegishli fayl nomiga xaritalash. */
const PROJECT_MAP = {
  // CRM
  crm: 'crm.md',
  dimocrm: 'crm.md',
  'dimo-crm': 'crm.md',
  'exotic-crm': 'crm.md',
  'exotic-crm-web': 'crm.md',
  'kgf-crm': 'crm.md',
  // KGF
  kgf: 'kgf.md',
  'kgf-web': 'kgf.md',
  'kokandgoldfuture.uz': 'kgf.md',
  'c-resume': 'kgf.md',
  'c-hisobot': 'kgf.md',
  yuznazorat: 'kgf.md',
  xarajat: 'kgf.md',
  'xarajat-web': 'kgf.md',
  // Infra
  infra: 'infra.md',
  caddy: 'infra.md',
  'c-caddy': 'infra.md',
  baza: 'infra.md',
  'c-kgf-db': 'infra.md',
  mail: 'infra.md',
  'c-kgf-mail': 'infra.md',
  server: 'infra.md',
  obuna: 'infra.md',
  obunalar: 'infra.md',
  // Turizm
  tur: 'turizm.md',
  turizm: 'turizm.md',
  rivatour: 'turizm.md',
  'c-rivatour': 'turizm.md',
  zuhro: 'turizm.md',
  'c-zuhro': 'turizm.md',
  dilrabo: 'turizm.md',
  'c-dilrabo': 'turizm.md',
  'exotic-bot': 'turizm.md',
  // Subtitr
  subtitr: 'subtitr.md',
  'subtitr-web': 'subtitr.md',
  'subtitr.uz': 'subtitr.md',
  'c-subtitr': 'subtitr.md',
};

/** Loyiha pasportini o'qish. */
export function getProjectMemory(query = '') {
  ensureDirs();
  const q = String(query).toLowerCase().trim();
  const filename = PROJECT_MAP[q] || (q.endsWith('.md') ? q : `${q}.md`);
  const fullPath = join(LOYIHALAR_DIR, filename);

  if (!existsSync(fullPath)) {
    return {
      topildi: false,
      xabar: `"${query}" bo'yicha loyiha xotirasi topilmadi. Mavjud loyihalar: crm, kgf, infra, turizm, subtitr.`,
    };
  }

  const matn = readFileSync(fullPath, 'utf8');
  // Oxirgi voqealarini ham ulaymiz
  const loqKey = filename.replace(/\.md$/, '');
  const voqealar = getHistoryEvents({ days: 14, project: loqKey });

  return {
    topildi: true,
    fayl: filename,
    pasport: matn,
    oxirgiVoqealar: voqealar,
  };
}

/** Agent xotira jurnalini o'qish. */
export function getAgentMemory(agent = '') {
  ensureDirs();
  const a = String(agent).toLowerCase().trim();
  const filename = `${a}.md`;
  const fullPath = join(AGENTLAR_DIR, filename);

  if (!existsSync(fullPath)) {
    return {
      topildi: false,
      xabar: `"${agent}" agenti uchun xotira fayli topilmadi.`,
    };
  }

  return {
    topildi: true,
    fayl: filename,
    matn: readFileSync(fullPath, 'utf8'),
  };
}

/** Voqealar tarixini olish (kecha yoki oxirgi N kun). */
export function getHistoryEvents({ days = 7, project = null, agent = null } = {}) {
  ensureDirs();
  if (!existsSync(VOQEALAR_FAYL)) return [];

  try {
    const raw = readFileSync(VOQEALAR_FAYL, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const limitMs = Date.now() - (Number(days) || 7) * 86400_000;

    const list = [];
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const itemMs = new Date(item.sana).getTime();
        if (Number.isFinite(itemMs) && itemMs < limitMs) continue;

        if (project) {
          const p = String(project).toLowerCase();
          const itemP = String(item.loyiha || '').toLowerCase();
          if (!itemP.includes(p) && !p.includes(itemP)) continue;
        }

        if (agent) {
          const a = String(agent).toLowerCase();
          const itemA = String(item.agent || '').toLowerCase();
          if (a !== itemA) continue;
        }

        list.push(item);
      } catch {
        // noto'g'ri qator bo'lsa o'tkazamiz
      }
    }

    return list.reverse(); // Eng yangilari boshida
  } catch {
    return [];
  }
}

/** Yangi bajarilgan ishni tarixga va agent jurnaliga yozish. */
export function logProjectAction({ agent = 'agent', project = 'umumiy', action, details = '' }) {
  ensureDirs();
  if (!action) throw new Error('action (bajarilgan ish matni) kiritilishi shart');

  const nowIso = new Date().toISOString();
  const sanaTxt = new Date().toLocaleDateString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const entry = {
    sana: nowIso,
    agent: String(agent).toLowerCase(),
    loyiha: String(project).toLowerCase(),
    ish: String(action),
    tafsilot: details ? String(details) : undefined,
  };

  // 1) voqealar.jsonl ga qo'shish
  appendFileSync(VOQEALAR_FAYL, JSON.stringify(entry) + '\n', 'utf8');

  // 2) agentlar/<agent>.md fayliga yozish
  const agentFile = join(AGENTLAR_DIR, `${entry.agent}.md`);
  if (existsSync(agentFile)) {
    const yozuv = `\n- **[${sanaTxt}] (${entry.loyiha}):** ${entry.ish}${details ? ` — _${details}_` : ''}`;
    appendFileSync(agentFile, yozuv, 'utf8');
  }

  return {
    muvaffaqiyatli: true,
    xabar: `Xotiraga yozildi: [${entry.agent}] ${entry.loyiha} -> ${entry.ish}`,
    yozuv: entry,
  };
}

/** Loyiha taklifini saqlash. */
export function saveProjectProposal({ agent = 'agent', project = 'umumiy', proposal }) {
  ensureDirs();
  if (!proposal) throw new Error('proposal (taklif matni) kiritilishi shart');

  const nowIso = new Date().toISOString();
  const loqKey = PROJECT_MAP[String(project).toLowerCase()] || `${project}.md`;
  const fullPath = join(LOYIHALAR_DIR, loqKey);

  const sanaTxt = new Date().toLocaleDateString('uz-UZ', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Loyiha pasportiga qo'shish
  if (existsSync(fullPath)) {
    const yozuv = `\n\n### Taklif (${sanaTxt}, Agent: ${agent})\n${proposal}\n`;
    appendFileSync(fullPath, yozuv, 'utf8');
  }

  // Tarixga ham qayd qilish
  logProjectAction({
    agent,
    project,
    action: `Loyiha bo'yicha taklif kiritildi: ${proposal.slice(0, 80)}...`,
    details: proposal,
  });

  return {
    muvaffaqiyatli: true,
    xabar: `"${project}" loyihasi pasportiga taklif kiritildi va qayd etildi.`,
  };
}

/** Agentlar uchun umumiy xotira asboblari (Claude tools). */
export const memoryTools = [
  {
    name: 'get_project_memory',
    description:
      "Loyiha pasportini (batafsil ma'lumoti, arxitekturasi, bog'langan serverlari, mas'ul agenti va oxirgi voqealarini) o'qiydi. " +
      "'Loyiha haqida nima bilasan?', 'pasportini ko'rsat', 'qanday texnologiya ishlatilgan?' so'rovlarida ishlatiladi.",
    input_schema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: "Loyiha nomi yoki kaliti (masalan: 'crm', 'kgf', 'infra', 'turizm', 'subtitr').",
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_history_events',
    description:
      "Kecha, bugun yoki oxirgi 7 kun ichida tizimda, loyihalarda yoki agentlar tomonidan amalga oshirilgan aniq ishlar tarixini oladi. " +
      "'Kecha nima bo'ldi?', '7 kun oldin nima ish qilingan?', 'oxirgi o'zgarishlar qanday?' so'rovlarida ishlatiladi.",
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: "Necha kun oldingi tarix kerak (standart: 7 kun, kecha uchun: 1 yoki 2).",
        },
        project: {
          type: 'string',
          description: "Ixtiyoriy: faqat ma'lum bir loyiha bo'yicha filtrlash (masalan: 'crm', 'infra', 'kgf').",
        },
        agent: {
          type: 'string',
          description: "Ixtiyoriy: faqat ma'lum bir agent bo'yicha filtrlash (masalan: 'debra', 'layla', 'rita', 'sara').",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'log_project_action',
    description:
      "Amalga oshirilgan ish, qilingan o'zgarish, profilaktika yoki muhim hodisani loyiha xotirasiga va voqealar tarixiga yozib qo'yadi. " +
      "Dexter 'xotiraga yoz', 'qayd qilib qo'y' desa yoki agent muhim ish bajarganda ishlatiladi.",
    input_schema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: "Loyiha nomi yoki yo'nalishi (masalan: 'crm', 'kgf', 'infra', 'turizm', 'subtitr').",
        },
        action: {
          type: 'string',
          description: "Qisqa va aniq nima ish bajarilgani.",
        },
        details: {
          type: 'string',
          description: "Qo'shimcha tafsilotlar yoki natijalar (ixtiyoriy).",
        },
      },
      required: ['project', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_project_proposal',
    description:
      "Loyiha bo'yicha yangi taklif, g'oya yoki optimallashtirish rejasini loyiha pasportiga va agent xotirasiga yozadi.",
    input_schema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: "Qaysi loyiha uchun taklif (masalan: 'crm', 'kgf', 'infra', 'turizm', 'subtitr').",
        },
        proposal: {
          type: 'string',
          description: "Batafsil taklif matni.",
        },
      },
      required: ['project', 'proposal'],
      additionalProperties: false,
    },
  },
];

/** Asbob chaqiruvini bajarish. */
export async function runMemoryTool(name, input, currentAgent = 'agent') {
  if (name === 'get_project_memory') {
    return getProjectMemory(input.project);
  }
  if (name === 'get_history_events') {
    return getHistoryEvents({
      days: input.days ?? 7,
      project: input.project,
      agent: input.agent,
    });
  }
  if (name === 'log_project_action') {
    return logProjectAction({
      agent: currentAgent,
      project: input.project,
      action: input.action,
      details: input.details,
    });
  }
  if (name === 'save_project_proposal') {
    return saveProjectProposal({
      agent: currentAgent,
      project: input.project,
      proposal: input.proposal,
    });
  }
  throw new Error(`Noma'lum xotira asbobi: ${name}`);
}
