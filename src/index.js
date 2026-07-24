import { startRadar, jobs } from './agents/radar/index.js';
import { startLingo, lingoJobs } from './agents/lingo/index.js';
import { startMonitor, monitorJobs } from './agents/kotib/monitor.js';
import { personas } from './core/personas.js';
import { createChatBot } from './core/interactive.js';
import { attachBusiness, BUSINESS_UPDATES } from './agents/kotib/business.js';
import { config } from './core/config.js';
import { log } from './core/logger.js';

const onceArg = process.argv.find((a) => a.startsWith('--once='));

const allJobs = { ...jobs, ...lingoJobs, ...monitorJobs };

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

// 1. Radar jadvali (yangiliklar + g'oya)
startRadar();

// 2. Layla — kunlik ingliz tili darsi
startLingo();

// 3. Debra — serverlar holati nazorati
startMonitor();

// 2. Interaktiv suhbat — Rita/Layla/Debra guruhni tinglaydi
const bots = [];
if (config.chat.enabled && config.chat.groupChatId) {
  for (const [key, persona] of Object.entries(personas)) {
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

    bot.launch(launchOpts).catch((e) => log.error(`${persona.name} launch xato:`, e.message));
    bots.push(bot);
    const extra = persona.agent === 'kotib' ? ' + Business (lichka)' : '';
    log.info(`${persona.name} ${persona.emoji} tinglayapti (${persona.role})${extra}`);
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
