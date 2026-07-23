import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH || resolve('data/agentlar.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_items (
    id        TEXT PRIMARY KEY,
    url       TEXT NOT NULL,
    title     TEXT,
    source    TEXT,
    kind      TEXT NOT NULL DEFAULT 'news',
    seen_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_seen_kind_at ON seen_items(kind, seen_at);

  CREATE TABLE IF NOT EXISTS runs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    job       TEXT NOT NULL,
    ok        INTEGER NOT NULL,
    note      TEXT,
    ran_at    INTEGER NOT NULL
  );
`);

/** URL'ni normallashtirib hash qiladi (utm_* va shunga o'xshash chiqindilarni tashlaydi). */
export function itemId(url) {
  let clean = url;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_src|fbclid|gclid|source$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    clean = u.toString().replace(/\/$/, '');
  } catch {
    /* xato URL bo'lsa xom holida hash qilamiz */
  }
  return createHash('sha1').update(clean).digest('hex').slice(0, 20);
}

const hasStmt = db.prepare('SELECT 1 FROM seen_items WHERE id = ?');
const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO seen_items (id, url, title, source, kind, seen_at)
   VALUES (@id, @url, @title, @source, @kind, @seen_at)`,
);

export function isSeen(url) {
  return !!hasStmt.get(itemId(url));
}

/** Ko'rilgan deb belgilaydi. items: [{url, title, source}] */
export const markSeen = db.transaction((items, kind = 'news') => {
  const now = Date.now();
  for (const it of items) {
    insertStmt.run({
      id: itemId(it.url),
      url: it.url,
      title: it.title ?? null,
      source: it.source ?? null,
      kind,
      seen_at: now,
    });
  }
});

const runStmt = db.prepare(
  'INSERT INTO runs (job, ok, note, ran_at) VALUES (?, ?, ?, ?)',
);

export function logRun(job, ok, note = null) {
  runStmt.run(job, ok ? 1 : 0, note, Date.now());
}

/** 90 kundan eski yozuvlarni tozalaydi — DB cheksiz o'smasin. */
export function prune(days = 90) {
  const cutoff = Date.now() - days * 86400_000;
  db.prepare('DELETE FROM seen_items WHERE seen_at < ?').run(cutoff);
  db.prepare('DELETE FROM runs WHERE ran_at < ?').run(cutoff);
}
