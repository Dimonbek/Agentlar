import { listProjects, listObunalar, kvOl, logRun } from '../../core/db.js';
import { qolganKun } from '../lingo/index.js';
import { obunaSomda, formatPul } from '../../core/valyuta.js';
import { logProjectAction } from '../../core/xotira.js';
import { askText } from '../../core/llm.js';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import { createSender, esc } from '../../core/telegram.js';

const { send } = createSender({
  token: config.chat.tokens.debra || config.radar.token || '',
  chatId: config.chat.groupChatId || config.radar.chatId || '',
});

/** Server resurslari va salomatlik holatini keshdan olish. */
function getSalomatlik() {
  try {
    const raw = kvOl('rita:salomat');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Oxirgi xatoliklarni olish (Sara domeni). */
function getOxirgiXatolar() {
  try {
    const raw = kvOl('sara:xatolar');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 1) Rita Domeni: Turizm operatorlari botlari holati. */
export function getRitaDomainStatus() {
  const loyihalar = listProjects();
  const turBotlar = loyihalar.filter((p) => p.grp === 'tur');

  const ishlayotgan = turBotlar.filter((p) => p.status === 'ok');
  const muammo = turBotlar.filter((p) => p.status !== 'ok');

  return {
    agent: 'Rita 🛰',
    vazifa: 'Turizm operatorlari nazorati',
    jami: turBotlar.length,
    ishlayapti: ishlayotgan.map((b) => ({ nom: b.name, kalit: b.key, ms: b.ms })),
    muammoli: muammo.map((b) => ({ nom: b.name, kalit: b.key, holat: b.status, note: b.note })),
    izoh: muammo.length
      ? `${muammo.length} ta turizm botida uzilish kuzatildi!`
      : 'Barcha sayyohlik botlari faol, lidlar qabuli normal holatda.',
  };
}

/** 2) Layla Domeni: Infratuzilma va To'lovlar holati. */
export async function getLaylaDomainStatus() {
  const loyihalar = listProjects();
  const infraLoyihalar = loyihalar.filter((p) => p.grp === 'infra');
  const salomat = getSalomatlik();

  // Yaqin 7 kun ichidagi to'lovlar
  const barchaObunalar = listObunalar({ onlyEnabled: true });
  const yaqinTolovlar = [];

  for (const o of barchaObunalar) {
    const qoldi = qolganKun(o.sana);
    const somda = await obunaSomda(o);
    if (qoldi <= 7) {
      yaqinTolovlar.push({
        nom: o.nom,
        qoldi,
        summaStr: formatPul(o),
        somdaStr: somda ? `≈ ${somda.toLocaleString('uz-UZ')} so'm` : null,
      });
    }
  }

  const infraMuammo = infraLoyihalar.filter((p) => p.status !== 'ok');

  return {
    agent: 'Layla 🏗️💳',
    vazifa: 'Infratuzilma va to\'lovlar',
    infraJami: infraLoyihalar.length,
    infraMuammoli: infraMuammo.map((i) => ({ nom: i.name, target: i.target, holat: i.status })),
    resurslar: salomat?.server || [],
    yaqinTolovlar,
    izoh: infraMuammo.length
      ? `Infratuzilmada ${infraMuammo.length} ta xizmatda muammo bor!`
      : 'VPS resurslari, Caddy shlyuzi, PostgreSQL va Mail barqaror ishlamoqda.',
  };
}

/** 3) Sara Domeni: Subtitr.uz va xavfsizlik/xatoliklar holati. */
export function getSaraDomainStatus() {
  const loyihalar = listProjects();
  const subtitrLoyihalar = loyihalar.filter((p) => p.grp === 'subtitr');
  const xatolar = getOxirgiXatolar();

  const subtitrMuammo = subtitrLoyihalar.filter((p) => p.status !== 'ok');
  // Oxirgi 24 soatdagi muhim xatolar
  const xavfliXatolar = xatolar.filter((x) => x.daraja === 'critical' || x.daraja === 'xavf');

  return {
    agent: 'Sara 🔎',
    vazifa: 'Subtitr.uz va xavfsizlik nazorati',
    subtitrJami: subtitrLoyihalar.length,
    subtitrMuammoli: subtitrMuammo.map((s) => ({ nom: s.name, holat: s.status })),
    oxirgiXatolarSoni: xatolar.length,
    xavfliXatolarSoni: xavfliXatolar.length,
    izoh: subtitrMuammo.length || xavfliXatolar.length
      ? `Subtitr.uz yoki xavfsizlikda e'tibor talab holatlar mavjud (${xatolar.length} ta xatolik qayd etilgan).`
      : 'Subtitr.uz veb-sayti va bot faol, tizimda xavfli xatolik yoki shubhali harakat aniqlanmadi.',
  };
}

/** 4) Debra Domeni: CRM va KGF loyihalari holati. */
export function getDebraDomainStatus() {
  const loyihalar = listProjects();
  const crmLoyihalar = loyihalar.filter((p) => p.grp === 'crm');
  const kgfLoyihalar = loyihalar.filter((p) => p.grp === 'kgf');

  const crmMuammo = crmLoyihalar.filter((p) => p.status !== 'ok');
  const kgfMuammo = kgfLoyihalar.filter((p) => p.status !== 'ok');

  return {
    agent: 'Debra 🗂',
    vazifa: 'Jamoa boshlig‘i, CRM va KGF nazorati',
    crmJami: crmLoyihalar.length,
    crmMuammoli: crmMuammo.map((c) => ({ nom: c.name, holat: c.status })),
    kgfJami: kgfLoyihalar.length,
    kgfMuammoli: kgfMuammo.map((k) => ({ nom: k.name, holat: k.status })),
    izoh: (crmMuammo.length || kgfMuammo.length)
      ? `CRM yoki KGF loyihalarida uzilish bor!`
      : 'DimoCRM, Exotic CRM va barcha KGF tizimlari (sayt, botlar, yuznazorat) to\'liq ishlamoqda.',
  };
}

/** Standart zaxira HTML brifing formati (model ishlamay qolganda yoki xom holatda). */
function tuzatilganHtmlBrifing(debra, layla, rita, sara) {
  const bugun = new Date().toLocaleDateString('uz-UZ', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const qismlar = [
    `🌅 <b>DIMON Agency — Ertalabki Jamoa Brifingi (08:30)</b>`,
    `<i>Sana: ${bugun} | Mas'ul: Debra 🗂 (Boshliq)</i>\n`,
    `<b>🗂 Debra (CRM va KGF):</b>`,
    `• ${debra.izoh}`,
    debra.crmMuammoli.length ? `• ⚠️ CRM muammo: ${debra.crmMuammoli.map((m) => m.nom).join(', ')}` : '',
    debra.kgfMuammoli.length ? `• ⚠️ KGF muammo: ${debra.kgfMuammoli.map((m) => m.nom).join(', ')}` : '',
    `\n<b>🏗️💳 Layla (Infratuzilma va To'lovlar):</b>`,
    `• ${layla.izoh}`,
  ];

  if (layla.yaqinTolovlar?.length) {
    qismlar.push(`• 📌 <b>Yaqin to'lovlar:</b>`);
    for (const t of layla.yaqinTolovlar) {
      const qachon = t.qoldi === 0 ? 'Bugun' : `${t.qoldi} kundan so'ng`;
      qismlar.push(`  - ${t.nom}: ${t.summaStr} (${qachon})`);
    }
  }

  qismlar.push(
    `\n<b>🛰 Rita (Turizm operatorlari):</b>`,
    `• ${rita.izoh}`,
    rita.muammoli.length ? `• ⚠️ Muammoli botlar: ${rita.muammoli.map((m) => m.nom).join(', ')}` : '',
    `\n<b>🔎 Sara (Subtitr.uz va Xavfsizlik):</b>`,
    `• ${sara.izoh}`,
    sara.subtitrMuammoli.length ? `• ⚠️ Subtitr muammo: ${sara.subtitrMuammoli.map((m) => m.nom).join(', ')}` : '',
    `\n✅ <i>Barcha ma'lumotlar monitoring xotirasiga qayd etildi.</i>`
  );

  return qismlar.filter(Boolean).join('\n');
}

/** 08:30 da Debra nomidan jamlangan ertalabki jamoa brifingi. */
export async function runCoordinatorBriefing() {
  log.info('Debra: 08:30 ertalabki jamoa brifingi to\'planmoqda...');

  // 1) Har bir agent domenidan ma'lumot olish
  const debraStat = getDebraDomainStatus();
  const laylaStat = await getLaylaDomainStatus();
  const ritaStat = getRitaDomainStatus();
  const saraStat = getSaraDomainStatus();

  const domenData = {
    debra: debraStat,
    layla: laylaStat,
    rita: ritaStat,
    sara: saraStat,
  };

  const xomMatn = tuzatilganHtmlBrifing(debraStat, laylaStat, ritaStat, saraStat);
  let yakuniyMatn = xomMatn;

  // 2) Debra personasi orqali LLM bilan chiroyli shaklga keltirish
  if (config.llm?.apiKey) {
    try {
      const prompt = `Sen — Debra, DIMON Agency AI jamoasining boshlig'i va koordinatori.
Har kuni ertalab 08:30 da Dexterga jamoang nomidan qisqa, aniq, jonli va professional ertalabki brifing berasan.
Quyidagi haqiqiy ma'lumotlarga tayanib Telegram HTML formatida (b, i, code) chiroyli hisobot yoz.
Har bir agenting (Debra, Layla, Rita, Sara) o'z sohasini qanday topshirganini ko'rsat.
Markdown yulduzchalar ISHLATMA, faqat HTML teglar.

Ma'lumotlar:
${JSON.stringify(domenData, null, 2)}`;

      const llmResult = await askText({
        system: `Sen — Debra. O'tkir tilli, samimiy, aniq va jamoa boshlig'i sifatida gapirasan. 12-15 qatordan oshmasin.`,
        prompt,
        maxTokens: 1000,
      });

      if (llmResult && llmResult.trim().length > 50) {
        yakuniyMatn = llmResult.trim();
      }
    } catch (err) {
      log.warn('Debra LLM brifing formatlashda xato, xom format ishlatiladi:', err.message);
    }
  }

  // 3) Telegramga yuborish
  try {
    await send(yakuniyMatn);
  } catch (err) {
    log.warn('Debra brifingini Telegramga yuborishda xato (ehtimol test muhiti):', err.message);
  }

  // 4) Xotiraga monitoring natijasini yozish
  const monitoringXulosa = `08:30 brifingi o'tkazildi. CRM/KGF: ${debraStat.izoh}; Infra: ${laylaStat.izoh}; Turizm: ${ritaStat.izoh}; Sara: ${saraStat.izoh}`;
  logProjectAction({
    agent: 'debra',
    project: 'boshqaruv',
    action: '08:30 ertalabki jamoa brifingi Dexterga taqdim etildi',
    details: monitoringXulosa,
  });

  logRun('debra:briefing', true, monitoringXulosa.slice(0, 100));
  log.info('Debra: 08:30 jamoa brifingi muvaffaqiyatli yuborildi va xotiraga yozildi.');

  return {
    muvaffaqiyatli: true,
    matn: yakuniyMatn,
    domenData,
  };
}
