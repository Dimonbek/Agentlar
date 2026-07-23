import cron from 'node-cron';
import { config } from '../../core/config.js';
import { createSender } from '../../core/telegram.js';
import { markSeen, logRun, prune } from '../../core/db.js';
import { log } from '../../core/logger.js';
import { buildNewsDigest, buildIdeaPost } from './pipeline.js';

const { send } = createSender({
  token: config.radar.token,
  chatId: config.radar.chatId,
});

async function runJob(name, build, topicId) {
  log.info(`--- ${name} boshlandi ---`);
  try {
    const { text, used } = await build();

    if (!text) {
      log.info(`${name}: yuboradigan narsa yo'q`);
      logRun(name, true, 'bo\'sh');
      return;
    }

    await send(text, { topicId });
    // Faqat muvaffaqiyatli yuborilgandan keyin belgilaymiz —
    // aks holda xatolik bo'lsa yangiliklar butunlay yo'qoladi.
    markSeen(used, name);
    logRun(name, true, `${used.length} nomzod`);
    log.info(`--- ${name} tugadi ---`);
  } catch (err) {
    log.error(`${name} xatosi:`, err);
    logRun(name, false, err.message);
  }
}

export const jobs = {
  'radar:news': () => runJob('radar:news', buildNewsDigest, config.radar.newsTopicId),
  'radar:idea': () => runJob('radar:idea', buildIdeaPost, config.radar.ideasTopicId),
};

export function startRadar() {
  const opts = { timezone: config.tz };

  cron.schedule(config.radar.cronNews, jobs['radar:news'], opts);
  cron.schedule(config.radar.cronIdea, jobs['radar:idea'], opts);
  cron.schedule('0 4 * * 0', () => prune(90), opts);

  log.info(`Radar ishga tushdi — yangiliklar: "${config.radar.cronNews}", g'oya: "${config.radar.cronIdea}" (${config.tz})`);
}
