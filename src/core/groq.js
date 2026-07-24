import { config } from './config.js';

/**
 * Ovozni matnga o'giradi (Groq — Whisper large v3 turbo).
 * Gemini limitga urilganda zaxira sifatida ishlatiladi. Bepul tier ancha saxiy.
 */
export async function transcribeGroq(audioBase64, mime = 'audio/ogg') {
  if (!config.groq.apiKey) throw new Error('GROQ_API_KEY yo\'q');

  const buf = Buffer.from(audioBase64, 'base64');
  const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : 'ogg';

  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
  form.append('model', config.groq.model);
  form.append('response_format', 'json');
  // Tilni aniq ko'rsatamiz — aks holda Whisper o'zbekchani turk/ozarbayjon deb
  // aniqlab, "ə, ğ, ı" harflari bilan noto'g'ri yozib yuboradi.
  if (config.groq.language) form.append('language', config.groq.language);
  form.append(
    'prompt',
    'Ovozli xabar o‘zbek tilida, lotin alifbosida. ' +
      'Namuna so‘zlar: salom, rahmat, hozir, bugun, ertaga, qanday, eng yaxshi, ' +
      'g‘oya, reja, o‘ttiz kunlik, darslik, tayyorlamoqchi edik, loyiha, server.',
  );

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.groq.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const text = String(json.text ?? '').trim();
  // Whisper nutqsiz audioda "." yoki " ." kabi bo'sh natija qaytaradi
  return /^[.,!?\s—–-]*$/.test(text) ? '' : text;
}
