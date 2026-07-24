import cron from 'node-cron';
import { config } from '../../core/config.js';
import { createSender } from '../../core/telegram.js';
import { askJson } from '../../core/llm.js';
import { getLingoDay, setLingoDay, addHistory, logRun } from '../../core/db.js';
import { log } from '../../core/logger.js';
import { lessonFor, TOTAL_DAYS } from './curriculum.js';

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string' },
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' },
          uz: { type: 'string' },
          example: { type: 'string' },
          example_uz: { type: 'string' },
        },
        required: ['en', 'uz', 'example', 'example_uz'],
        additionalProperties: false,
      },
    },
    tasks: { type: 'array', items: { type: 'string' } },
  },
  required: ['explanation', 'words', 'tasks'],
  additionalProperties: false,
};

const SYSTEM = `Sen — Layla, Dexterning shaxsiy ingliz tili o'qituvchisisan.
Dexter — O'zbekistonlik dasturchi. Maqsadi: ingliz tilidagi matnni o'qib tushunish va ingliz tilida javob yoza olish.
Imtihonga tayyorlanmaydi — unga jonli, amaliy til kerak.

Dars tayyorlash qoidalari:
- Tushuntirish SOF O'ZBEK TILIDA, sodda va qisqa bo'lsin (4-7 gap). Grammatik atamalarni ortiqcha ishlatma.
- Qoidani misol bilan ko'rsat, quruq nazariya berma.
- 8 ta yangi so'z ber: eng ko'p ishlatiladigan, shu mavzuga tegishli.
- Har so'zga: inglizcha, o'zbekcha tarjima, inglizcha misol gap va uning o'zbekcha tarjimasi.
- 3 ta vazifa ber: Dexter o'zi ingliz tilida gap tuzadigan qilib. Vazifa o'zbek tilida yozilsin.
- Vazifalar oson boshlanib, oxirgisi biroz qiyinroq bo'lsin.`;

/** Berilgan kun uchun darsni tayyorlaydi va formatlaydi. */
export async function buildLesson(day) {
  const plan = lessonFor(day);
  if (!plan) return null;

  const data = await askJson({
    system: SYSTEM,
    prompt:
      `Bugungi dars — ${day}-kun (jami ${TOTAL_DAYS} kun).\n` +
      `Mavzu: ${plan.topic}\n` +
      `Diqqat qaratiladigan nuqta: ${plan.focus}\n\n` +
      `Shu mavzu bo'yicha dars tayyorla.`,
    schema: LESSON_SCHEMA,
    maxTokens: 4000,
  });

  const lines = [
    `📚 <b>Layla · ${day}-kun / ${TOTAL_DAYS}</b>`,
    `<b>Mavzu:</b> ${plan.topic}`,
    '',
    data.explanation,
    '',
    '🔤 <b>Yangi so\'zlar:</b>',
  ];

  data.words.slice(0, 10).forEach((w, i) => {
    lines.push(`${i + 1}. <b>${w.en}</b> — ${w.uz}`);
    lines.push(`   <i>${w.example}</i>`);
    lines.push(`   ${w.example_uz}`);
  });

  lines.push('', '✍️ <b>Vazifa — ingliz tilida gap tuz:</b>');
  data.tasks.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t}`));

  lines.push(
    '',
    'Javobingni shu xabarga <b>reply</b> qilib yoz — tekshirib, xatolaringni tushuntiraman 😊',
  );

  return lines.join('\n');
}

const { send } = createSender({
  token: config.chat.tokens.layla || '',
  chatId: config.chat.groupChatId,
});

/** Navbatdagi kunning darsini yuboradi. */
export async function sendNextLesson() {
  try {
    const { day } = getLingoDay();
    const next = day + 1;

    if (next > TOTAL_DAYS) {
      await send(
        '🎉 <b>Layla</b>: 30 kunlik kurs tugadi! Yangi bosqichni boshlashni xohlasang ayt — keyingi darajaga o\'tamiz.',
      );
      logRun('lingo:lesson', true, 'kurs tugadi');
      return;
    }

    log.info(`Layla: ${next}-kun darsi tayyorlanmoqda...`);
    const text = await buildLesson(next);
    if (!text) return;

    await send(text);
    setLingoDay(next);

    // Layla darsni eslab qolsin — javobni tekshirishda kerak bo'ladi
    addHistory('lingo', config.chat.groupChatId, 'assistant', text);

    logRun('lingo:lesson', true, `${next}-kun`);
    log.info(`Layla: ${next}-kun darsi yuborildi`);
  } catch (err) {
    log.error('Layla dars xatosi:', err.message);
    logRun('lingo:lesson', false, err.message);
  }
}

export function startLingo() {
  if (!config.chat.tokens.layla) {
    log.warn('Layla tokeni yo\'q — kurs ishga tushmadi');
    return;
  }
  cron.schedule(config.lingo.cron, sendNextLesson, { timezone: config.tz });
  log.info(`Layla kursi ishga tushdi — kunlik dars: "${config.lingo.cron}" (${config.tz})`);
}

export const lingoJobs = {
  'lingo:lesson': sendNextLesson,
};
