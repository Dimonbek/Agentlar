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

  -- Business (lichka) xabarlar — o'chirilganini ko'rsatish uchun saqlanadi
  CREATE TABLE IF NOT EXISTS biz_messages (
    chat_id     INTEGER NOT NULL,
    message_id  INTEGER NOT NULL,
    sender      TEXT,
    text        TEXT,
    at          INTEGER NOT NULL,
    PRIMARY KEY (chat_id, message_id)
  );

  -- Avto-javob spam bo'lmasligi uchun: mijozga oxirgi javob vaqti
  CREATE TABLE IF NOT EXISTS biz_autoreply (
    chat_id     INTEGER PRIMARY KEY,
    last_at     INTEGER NOT NULL
  );

  -- Business ulanish egasi (Dexter user id) va connection id
  CREATE TABLE IF NOT EXISTS biz_conn (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    owner_id    INTEGER,
    conn_id     TEXT
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
  db.prepare('DELETE FROM biz_messages WHERE at < ?').run(cutoff);
}

// ---- Business (lichka) yordamchilari ----

const _saveBiz = db.prepare(
  `INSERT OR REPLACE INTO biz_messages (chat_id, message_id, sender, text, at)
   VALUES (?, ?, ?, ?, ?)`,
);
const _getBiz = db.prepare(
  'SELECT sender, text FROM biz_messages WHERE chat_id = ? AND message_id = ?',
);

export function saveBizMessage(chatId, messageId, sender, text) {
  _saveBiz.run(chatId, messageId, sender, text, Date.now());
}
export function getBizMessage(chatId, messageId) {
  return _getBiz.get(chatId, messageId);
}

const _getAr = db.prepare('SELECT last_at FROM biz_autoreply WHERE chat_id = ?');
const _setAr = db.prepare(
  'INSERT OR REPLACE INTO biz_autoreply (chat_id, last_at) VALUES (?, ?)',
);

/** Mijozga N soatda bir martadan ko'p avto-javob yubormaslik uchun tekshiruv. */
export function canAutoReply(chatId, everyHours = 6) {
  const row = _getAr.get(chatId);
  if (row && Date.now() - row.last_at < everyHours * 3600_000) return false;
  _setAr.run(chatId, Date.now());
  return true;
}

const _getConn = db.prepare('SELECT owner_id, conn_id FROM biz_conn WHERE id = 1');
const _setConn = db.prepare(
  'INSERT OR REPLACE INTO biz_conn (id, owner_id, conn_id) VALUES (1, ?, ?)',
);

export function saveBizConn(ownerId, connId) {
  _setConn.run(ownerId, connId);
}
export function getBizConn() {
  return _getConn.get() ?? {};
}
