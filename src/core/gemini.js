import { config } from './config.js';

/**
 * Ovozli xabarni matnga o'giradi (Gemini, bepul).
 * audioBase64 — base64 kodlangan audio; mime — masalan 'audio/ogg'.
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
                'hech qanday izoh yoki qo\'shimcha belgi qo\'shma. ' +
                'Xabar o\'zbek, rus yoki ingliz tilida bo\'lishi mumkin — qaysi tilda aytilgan bo\'lsa, o\'sha tilda yoz.',
            },
            { inline_data: { mime_type: mime, data: audioBase64 } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}
