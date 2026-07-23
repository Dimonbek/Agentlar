/**
 * Jamoa — Dexter serialidan ilhomlangan personajlar.
 * Har agent = alohida bot = alohida shaxs.
 * `triggers` — guruhda shu so'zlar bilan chaqirilsa, o'sha agent javob beradi.
 */
export const personas = {
  rita: {
    name: 'Rita',
    agent: 'radar',
    role: 'yangiliklar va AI g\'oyalari',
    emoji: '🗞',
    triggers: ['rita', 'рита'],
  },
  debra: {
    name: 'Debra',
    agent: 'kotib',
    role: 'shaxsiy yordamchi',
    emoji: '🗂',
    triggers: ['debra', 'дебра', 'deb'],
  },
  layla: {
    name: 'Layla',
    agent: 'lingo',
    role: 'ingliz tili',
    emoji: '📚',
    triggers: ['layla', 'лайла', 'лейла'],
  },
};

/** Bitta agent nomi bo'yicha personani beradi (radar → Rita). */
export function personaOf(agent) {
  return Object.values(personas).find((p) => p.agent === agent);
}

/**
 * Matn boshidagi chaqiruv so'zi bo'yicha qaysi persona chaqirilganini aniqlaydi.
 * "Rita, yangiliklarni yubor" → rita. Topilmasa null.
 */
export function detectPersona(text = '') {
  const firstWord = text.trim().toLowerCase().replace(/[,!.:—-]+$/, '').split(/\s+/)[0];
  for (const p of Object.values(personas)) {
    if (p.triggers.includes(firstWord)) return p;
  }
  return null;
}
