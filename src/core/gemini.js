import { config } from './config.js';
import { log } from './logger.js';

/**
 * Ovozli xabarni matnga o'giradi (Gemini, bepul).
 * audioBase64 — base64 kodlangan audio; mime — masalan 'audio/ogg'.
 * Bo'sh natija qaytsa sababi log'ga yoziladi (jimgina yo'qolmasin).
 */
export async function transcribe(audioBase64, mime = 'audio/ogg') {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY yo\'q');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent` +
    `?key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                'Bu ovozli xabarni so\'zma-so\'z matnga o\'gir. Faqat matnning o\'zini qaytar, ' +
                'hech qanday izoh, tirnoq yoki qo\'shimcha belgi qo\'shma. ' +
                'Xabar o\'zbek, rus yoki ingliz tilida bo\'lishi mumkin — qaysi tilda aytilgan bo\'lsa, o\'sha tilda yoz. ' +
                'Agar ovozda umuman nutq bo\'lmasa, bo\'sh javob qaytar.',
            },
            { inline_data: { mime_type: mime, data: audioBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        // Transkripsiya uchun "o'ylash" kerak emas — u javob matnini yeb qo'yadi
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Gemini ${res.status}: ${body}`);
  }

  const json = await res.json();
  const cand = json?.candidates?.[0];
  // Javob bir necha part'da bo'lishi mumkin — hammasini yig'amiz
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join(' ')
    .trim();

  if (!text) {
    log.warn(
      `Gemini transkripsiya bo'sh qaytdi (finishReason=${cand?.finishReason ?? '?'}, ` +
        `mime=${mime}, promptFeedback=${JSON.stringify(json?.promptFeedback ?? {})})`,
    );
  }

  return text;
}
