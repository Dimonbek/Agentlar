import cron from 'node-cron';
import { config } from '../../core/config.js';
import { createSender } from '../../core/telegram.js';
import { buildStatusReport } from '../../core/railway.js';
import { addHistory, logRun } from '../../core/db.js';
import { log } from '../../core/logger.js';

const { send } = createSender({
  token: config.chat.tokens.debra || '',
  chatId: config.chat.groupChatId,
});

/** Serverlar holatini tekshirib, guruhga hisobot yuboradi. */
export async function sendServerReport() {
  try {
    log.info('Debra: serverlar tekshirilmoqda...');
    const text = await buildStatusReport();
    await send(text);
    // Debra hisobotni eslab qolsin — keyin savol berilsa kontekst bo'ladi
    addHistory('kotib', config.chat.groupChatId, 'assistant', text);
    logRun('kotib:servers', true);
    log.info('Debra: serverlar hisoboti yuborildi');
  } catch (err) {
    log.error('Debra serverlar hisoboti xatosi:', err.message);
    logRun('kotib:servers', false, err.message);
  }
}

export function startMonitor() {
  if (!config.railway.token) {
    log.warn('RAILWAY_API_TOKEN yo\'q — serverlar nazorati o\'chirilgan');
    return;
  }
  if (!config.chat.tokens.debra) {
    log.warn('Debra tokeni yo\'q — serverlar nazorati ishga tushmadi');
    return;
  }
  cron.schedule(config.railway.cron, sendServerReport, { timezone: config.tz });
  log.info(`Debra serverlar nazorati ishga tushdi — "${config.railway.cron}" (${config.tz})`);
}

export const monitorJobs = {
  'kotib:servers': sendServerReport,
};
