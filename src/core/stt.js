import { config } from './config.js';
import { transcribe as transcribeGemini } from './gemini.js';
import { transcribeGroq } from './groq.js';
import { log } from './logger.js';

/**
 * Ovozni matnga o'giradi: avval Gemini (o'zbekchani yaxshi tushunadi),
 * limitga urilsa yoki xato bo'lsa — Groq (Whisper) davom ettiradi.
 * Shu tufayli bitta provayder kvotasi tugasa ham ovoz ishlashda davom etadi.
 */
export async function speechToText(audioBase64, mime = 'audio/ogg') {
  const errors = [];

  if (config.gemini.apiKey) {
    try {
      const text = await transcribeGemini(audioBase64, mime);
      if (text) return text;
      errors.push('Gemini: bo\'sh natija');
    } catch (e) {
      errors.push(`Gemini: ${e.message.slice(0, 120)}`);
      log.warn(`Ovoz: Gemini ishlamadi (${e.message.slice(0, 80)}) — Groq'ga o'tamiz`);
    }
  }

  if (config.groq.apiKey) {
    try {
      const text = await transcribeGroq(audioBase64, mime);
      if (text) {
        log.info('Ovoz: Groq (zaxira) bilan o\'girildi');
        return text;
      }
      errors.push('Groq: bo\'sh natija');
    } catch (e) {
      errors.push(`Groq: ${e.message.slice(0, 120)}`);
    }
  }

  if (!config.gemini.apiKey && !config.groq.apiKey) {
    throw new Error('Ovoz uchun kalit sozlanmagan (GEMINI_API_KEY yoki GROQ_API_KEY)');
  }

  // Ikkalasi ham natija bermadi
  if (errors.length) log.warn(`Ovoz o'girilmadi: ${errors.join(' | ')}`);
  return '';
}
