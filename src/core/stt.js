import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { transcribe as transcribeGemini } from './gemini.js';
import { transcribeGroq } from './groq.js';
import { log } from './logger.js';

const client = new Anthropic({ apiKey: config.llm.apiKey });

/** Turk/ozarbayjon harflari — transkripsiya adashganining belgisi. */
const WRONG_LANG = /[əığşçöüĞŞÇÖÜİ]/;

const FIX_SYSTEM = `Sen o'zbek tilidagi ovozli xabar transkripsiyasini to'g'irlaysan.

Nutq O'ZBEK TILIDA aytilgan, lekin transkripsiya dasturi uni turk yoki ozarbayjon tili deb
noto'g'ri yozib yuborgan (ə, ğ, ı, ş, ç, ö, ü harflari bilan).

Vazifang: matnni asl o'zbekcha ko'rinishiga qaytar.
- Faqat to'g'irlangan matnni qaytar, hech qanday izoh berma.
- O'zbek lotin alifbosidan foydalan (o‘, g‘, sh, ch, ng, q, x).
- Ma'noni saqla, o'zingdan yangi gap qo'shma.
- Tez-tez uchraydigan buzilishlar: "oğaya/qoya" -> "g‘oya", "günlük/künlik" -> "kunlik",
  "ingilis dili" -> "ingliz tili", "dərslik" -> "darslik", "təyərləmaq" -> "tayyorlamoq",
  "hazır" -> "hozir", "yaxşı" -> "yaxshi", "en" -> "eng".`;

/** Buzuq transkripsiyani Claude bilan o'zbekchaga to'g'irlaydi. */
async function fixUzbek(text) {
  try {
    const res = await client.messages.create({
      model: config.llm.model,
      max_tokens: 800,
      system: FIX_SYSTEM,
      messages: [{ role: 'user', content: text }],
    });
    const fixed = res.content.find((b) => b.type === 'text')?.text?.trim();
    if (fixed) {
      log.info('Ovoz: buzuq transkripsiya o\'zbekchaga to\'g\'irlandi');
      return fixed;
    }
  } catch (e) {
    log.warn(`Transkripsiyani to'g'irlab bo'lmadi: ${e.message.slice(0, 80)}`);
  }
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ovozni matnga o'giradi.
 *
 * Gemini o'zbek tilini ancha yaxshi tushunadi, Whisper (Groq) esa uni tez-tez
 * turk/ozarbayjon deb yozib yuboradi. Shuning uchun avval Gemini'ga bir necha
 * imkon beramiz (kvota limiti odatda bir necha soniyada tiklanadi), faqat
 * shundan keyin Groq'ga o'tamiz va natijani Claude bilan to'g'irlaymiz.
 */
export async function speechToText(audioBase64, mime = 'audio/ogg') {
  if (config.gemini.apiKey) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const text = await transcribeGemini(audioBase64, mime);
        if (text) return WRONG_LANG.test(text) ? fixUzbek(text) : text;
        break; // bo'sh natija — qayta urinish foyda bermaydi
      } catch (e) {
        const isQuota = /\b429\b/.test(e.message);
        if (!isQuota) {
          log.warn(`Ovoz: Gemini xatosi (${e.message.slice(0, 80)})`);
          break;
        }
        if (attempt < 3) {
          await sleep(attempt * 2500); // 2.5s, keyin 5s
          log.info(`Ovoz: Gemini kvotasi band — ${attempt}-qayta urinish`);
        } else {
          log.warn('Ovoz: Gemini kvotasi tiklanmadi, Groq zaxirasiga o\'tamiz');
        }
      }
    }
  }

  if (config.groq.apiKey) {
    try {
      const text = await transcribeGroq(audioBase64, mime);
      if (text) {
        log.info('Ovoz: Groq (zaxira) bilan o\'girildi');
        // Whisper o'zbekchani turk/ozarbayjon deb yozadi — Claude to'g'irlaydi
        return WRONG_LANG.test(text) ? fixUzbek(text) : text;
      }
    } catch (e) {
      log.warn(`Ovoz: Groq ham ishlamadi (${e.message.slice(0, 80)})`);
    }
  }

  if (!config.gemini.apiKey && !config.groq.apiKey) {
    throw new Error('Ovoz uchun kalit sozlanmagan (GEMINI_API_KEY yoki GROQ_API_KEY)');
  }
  return '';
}
