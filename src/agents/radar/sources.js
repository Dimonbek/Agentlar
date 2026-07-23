import { XMLParser } from 'fast-xml-parser';
import { log } from '../../core/logger.js';

const UA = 'agentlar-radar/0.1 (personal digest bot)';
const TIMEOUT_MS = 15_000;

/** AI yangiliklari uchun RSS manbalari */
const NEWS_FEEDS = [
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
];

/**
 * Biznes g'oyalari uchun subreddit'lar — best-effort.
 * Reddit datacenter IP'larini ko'pincha bloklaydi (403); yiqilsa Show/Ask HN qoplaydi.
 */
const IDEA_SUBS = ['SideProject', 'EntrepreneurRideAlong', 'indiebiz'];

async function get(url, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, ...headers },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- RSS ----------

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function pickLink(entry) {
  if (typeof entry.link === 'string') return entry.link;
  // Atom: <link rel="alternate" href="..."/>
  for (const l of asArray(entry.link)) {
    if (typeof l === 'string') return l;
    if (l?.['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
  }
  return entry.id || entry.guid?.['#text'] || entry.guid || null;
}

function pickText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v['#text'] ?? '';
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”',
  '#8211': '–', '#8212': '—', '#8230': '…',
};

function decodeEntities(s) {
  return String(s).replace(/&(#?\w+);/g, (m, code) => {
    if (ENTITIES[code] != null) return ENTITIES[code];
    if (/^#\d+$/.test(code)) return String.fromCodePoint(Number(code.slice(1)));
    if (/^#x[0-9a-f]+$/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    return m;
  });
}

function stripHtml(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchFeed({ name, url }) {
  const res = await get(url);
  const xml = parser.parse(await res.text());
  const entries = asArray(xml?.rss?.channel?.item).concat(asArray(xml?.feed?.entry));

  return entries
    .map((e) => {
      const link = pickLink(e);
      if (!link) return null;
      const dateRaw = e.pubDate || e.published || e.updated || e['dc:date'];
      const published = dateRaw ? Date.parse(dateRaw) : NaN;
      return {
        title: stripHtml(pickText(e.title)),
        url: String(link).trim(),
        source: name,
        summary: stripHtml(pickText(e.description) || pickText(e.summary) || '').slice(0, 600),
        published: Number.isFinite(published) ? published : Date.now(),
        score: null,
      };
    })
    .filter(Boolean);
}

// ---------- Hacker News (Algolia, bepul) ----------

async function fetchHN({ minPoints = 100, tag = 'story', hours = 48, aiOnly = true, label = 'Hacker News' } = {}) {
  const since = Math.floor((Date.now() - hours * 3600_000) / 1000);
  const url =
    `https://hn.algolia.com/api/v1/search_by_date?tags=${tag}` +
    `&numericFilters=created_at_i>${since},points>${minPoints}&hitsPerPage=60`;
  const res = await get(url);
  const { hits = [] } = await res.json();

  const aiRe = /\b(ai|llm|gpt|claude|openai|anthropic|model|agent|ml|neural)\b/i;
  return hits
    .filter((h) => {
      // Show HN'da story URL bo'lmasa HN muhokamasiga havola beramiz
      if (!h.url && tag !== 'show_hn') return false;
      return aiOnly ? aiRe.test(h.title || '') : true;
    })
    .map((h) => ({
      title: (h.title || '').replace(/^(Show HN|Ask HN):\s*/i, ''),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: label,
      summary: (h.story_text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 800),
      published: h.created_at_i * 1000,
      score: h.points,
    }));
}

// ---------- Reddit (bepul JSON) ----------

async function fetchSub(sub, { minScore = 30, limit = 40 } = {}) {
  const res = await get(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=${limit}`);
  const json = await res.json();

  return (json?.data?.children ?? [])
    .map((c) => c.data)
    .filter((d) => d && !d.stickied && d.score >= minScore)
    .map((d) => ({
      title: d.title,
      url: `https://reddit.com${d.permalink}`,
      source: `r/${sub}`,
      summary: (d.selftext || '').replace(/\s+/g, ' ').slice(0, 1200),
      published: d.created_utc * 1000,
      score: d.score,
    }));
}

// ---------- Umumiy yig'uvchilar ----------

/** Bitta manba yiqilsa qolganlari ishlashda davom etsin. */
async function gather(tasks) {
  const results = await Promise.allSettled(tasks.map(([label, fn]) => fn()));
  const out = [];
  results.forEach((r, i) => {
    const label = tasks[i][0];
    if (r.status === 'fulfilled') {
      log.info(`  ${label}: ${r.value.length} ta`);
      out.push(...r.value);
    } else {
      log.warn(`  ${label} ishlamadi: ${r.reason?.message ?? r.reason}`);
    }
  });
  return out;
}

export async function fetchNewsItems() {
  log.info('Yangilik manbalari o\'qilmoqda...');
  return gather([
    ...NEWS_FEEDS.map((f) => [f.name, () => fetchFeed(f)]),
    ['Hacker News', () => fetchHN({ minPoints: 100 })],
  ]);
}

export async function fetchIdeaItems() {
  log.info('G\'oya manbalari o\'qilmoqda...');
  return gather([
    // Asosiy manba — HN launch va so'rovlari (ishonchli, bloklashsiz)
    ['Show HN', () => fetchHN({ tag: 'show_hn', minPoints: 8, hours: 96, aiOnly: false, label: 'Show HN' })],
    ['Ask HN', () => fetchHN({ tag: 'ask_hn', minPoints: 20, hours: 96, aiOnly: false, label: 'Ask HN' })],
    // Reddit — best-effort, bloklansa gather uni jimgina o'tkazib yuboradi
    ...IDEA_SUBS.map((s) => [`r/${s}`, () => fetchSub(s, { minScore: 25 })]),
  ]);
}
