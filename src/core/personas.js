/**
 * Jamoa — Dexter serialidan ilhomlangan personajlar.
 * Har agent = alohida bot = alohida shaxs.
 * `triggers` — guruhda shu so'zlar bilan chaqirilsa, o'sha agent javob beradi.
 * Imlo xatolari va turli talaffuzlar ham tushuniladi (fuzzy moslash).
 */
export const personas = {
  rita: {
    name: 'Rita',
    agent: 'radar',
    role: 'yangiliklar va AI g\'oyalari',
    emoji: '🗞',
    triggers: ['rita', 'rito', 'ritta', 'рита', 'ритта'],
  },
  debra: {
    name: 'Debra',
    agent: 'kotib',
    role: 'shaxsiy yordamchi',
    emoji: '🗂',
    triggers: ['debra', 'debora', 'deborah', 'debbi', 'deb', 'дебра', 'дебора', 'деб'],
  },
  layla: {
    name: 'Layla',
    agent: 'lingo',
    role: 'ingliz tili',
    emoji: '📚',
    triggers: ['layla', 'laylo', 'leyla', 'leylo', 'layla', 'lola', 'лайла', 'лайло', 'лейла', 'лейло'],
  },
};

/** Bitta agent nomi bo'yicha personani beradi (radar → Rita). */
export function personaOf(agent) {
  return Object.values(personas).find((p) => p.agent === agent);
}

/** Levenshtein masofasi — kichik imlo xatolarini kechirish uchun. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** Chaqiruv so'zini tozalaydi: "Rita," / "Rita?" / "RITA!" → "rita" */
function normalizeWord(w = '') {
  return w
    .toLowerCase()
    .replace(/[,!.?:;—–-]+$/g, '')
    .replace(/[''`]/g, '')
    .trim();
}

/**
 * Matn boshidagi chaqiruv so'zi bo'yicha qaysi persona chaqirilganini aniqlaydi.
 * "Rita, yangiliklarni yubor" → rita. "Laylo salom" → layla (fuzzy).
 * Topilmasa null.
 */
export function detectPersona(text = '') {
  const first = normalizeWord(text.trim().split(/\s+/)[0] || '');
  if (!first) return null;

  // 1) Aniq moslik
  for (const p of Object.values(personas)) {
    if (p.triggers.includes(first)) return p;
  }

  // 2) Imlo xatosi bilan moslik (uzunligi yaqin va 1 belgi farq)
  if (first.length >= 3) {
    for (const p of Object.values(personas)) {
      for (const t of p.triggers) {
        if (Math.abs(t.length - first.length) <= 1 && levenshtein(t, first) <= 1) return p;
      }
    }
  }

  return null;
}
