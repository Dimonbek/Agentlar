import { startRadar, jobs } from './agents/radar/index.js';
import { log } from './core/logger.js';

const onceArg = process.argv.find((a) => a.startsWith('--once='));

if (onceArg) {
  // Bir martalik ishga tushirish: npm run radar:news
  const name = onceArg.slice('--once='.length);
  const job = jobs[name];
  if (!job) {
    log.error(`Noma'lum job: ${name}. Mavjudlari: ${Object.keys(jobs).join(', ')}`);
    process.exit(1);
  }
  await job();
  process.exit(0);
}

startRadar();

process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
