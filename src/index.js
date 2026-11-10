import { startRadar, jobs } from './agents/radar/index.js';
import { startLingo, lingoJobs } from './agents/lingo/index.js';
import { startHisobot, hisobotJobs } from './agents/kotib/hisobot.js';
import { startSara, saraJobs } from './agents/sara/index.js';
import { personas } from './core/personas.js';
import { createChatBot } from './core/interactive.js';
import { attachBusiness, BUSINESS_UPDATES } from './agents/kotib/business.js';
import { startWeb } from './web/server.js';
import { config } from './core/config.js';
import { log } from './core/logger.js';

const onceArg = process.argv.find((a) => a.startsWith('--once='));

const allJobs = { ...jobs, ...lingoJobs, ...hisobotJobs, ...saraJobs };

if (onceArg) {
  // Bir martalik ishga tushirish: npm run radar:news / npm run lingo:lesson
  const name = onceArg.slice('--once='.length);
  const job = allJobs[name];
  if (!job) {
    log.error(`Noma'lum job: ${name}. Mavjudlari: ${Object.keys(allJobs).join(', ')}`);
    process.exit(1);
  }
  await job();
  process.exit(0);
}

const isActive = (key) => config.activeAgents.includes(key);
log.info(`Faol agentlar: ${config.activeAgents.join(', ') || '(hech kim)'}`);

// 1. Rita — loyihalar nazorati (HTTP ping)
if (isActive('rita')) startRadar();
else log.info('Rita 🛰 dam olmoqda — loyihalar nazorati o\'chirilgan');

// 2. Layla — kunlik ingliz tili darsi
if (isActive('layla')) startLingo();
else log.info('Layla 📚 dam olmoqda — dars jadvali o\'chirilgan');

// 3. Debra — kunlik va haftalik hisobot, uzoq yiqilganlarga eslatma
if (isActive('debra')) startHisobot();
else log.info('Debra 🗂 dam olmoqda — hisobot jadvali o\'chirilgan');

// 4. Sara — loyihalardagi xatoliklarni jurnaldan topadi
if (isActive('sara')) startSara();
else log.info('Sara 🔎 dam olmoqda — xatoliklar nazorati o\'chirilgan');

// 5. Ofis sahifasi — loyihalar holatini ko'rsatadi
if (config.web.enabled) startWeb();
else log.info('Ofis sahifasi o\'chirilgan (ENABLE_WEB=0)');

/*
 * Botni tinglashga qo'yadi.
 *
 * "tinglayapti" yozuvi `onLaunch` ichida — ya'ni tinglash haqiqatan
 * boshlangandan keyin. Ilgari u launch dan keyin shartsiz yozilardi:
 * serverning tarmog'i bir lahzaga uzilib, Rita umuman ishga tushmagan
 * paytda ham jurnalda "Rita tinglayapti" deb turgan, muammo esa faqat
 * guruhda javob kelmaganidan bilingan.
 *
 * Shuning uchun xato bo'lsa qayta uriniladi — bunday uzilish odatda
 * server endi ko'tarilayotganda, bir necha soniyaga bo'ladi.
 */
function ishgaTushir(bot, persona, opts, extra, urinish = 1) {
  const KUT = 15_000;
  const ENG_KOP = 5;
  bot.launch(opts, () => {
    log.info(`${persona.name} ${persona.emoji} tinglayapti (${persona.role})${extra}`);
  }).catch((e) => {
    log.error(`${persona.name} tinglay olmadi (${urinish}/${ENG_KOP}): ${e.message}`);
    if (urinish < ENG_KOP) {
      setTimeout(() => ishgaTushir(bot, persona, opts, extra, urinish + 1), KUT);
    } else {
      log.error(`${persona.name} guruhni tinglamaydi — xizmatni qayta ishga tushiring`);
    }
  });
}

// 6. Interaktiv suhbat — faqat faol agentlar guruhni tinglaydi
const bots = [];
if (config.chat.enabled && config.chat.groupChatId) {
  for (const [key, persona] of Object.entries(personas)) {
    if (!isActive(key)) continue;
    const token = config.chat.tokens[key];
    if (!token) {
      log.warn(`${persona.name}: token yo'q — tinglamaydi`);
      continue;
    }
    const bot = createChatBot(persona, token);

    // Debra — guruh + Business (lichka) rejimida
    const launchOpts = {};
    if (persona.agent === 'kotib') {
      attachBusiness(bot);
      launchOpts.allowedUpdates = BUSINESS_UPDATES;
    }

    bots.push(bot);
    const extra = persona.agent === 'kotib' ? ' + Business (lichka)' : '';
    ishgaTushir(bot, persona, launchOpts, extra);
  }
  if (!config.gemini.apiKey) {
    log.warn('GEMINI_API_KEY yo\'q — ovozli xabarlar tushunilmaydi (faqat matn)');
  }
} else {
  log.info('Interaktiv suhbat o\'chirilgan (ENABLE_CHAT=0 yoki GROUP_CHAT_ID yo\'q)');
}

function shutdown(sig) {
  bots.forEach((b) => {
    try { b.stop(sig); } catch { /* ignore */ }
  });
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
