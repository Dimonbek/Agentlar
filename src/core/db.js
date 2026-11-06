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
  CREATE TABLE IF NOT EXISTS biz_contacts (
    chat_id INTEGER PRIMARY KEY,
    sender TEXT NOT NULL,
    username TEXT,
    conn_id TEXT NOT NULL,
    last_at INTEGER NOT NULL
  );

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

  -- Suhbat xotirasi: har agent o'z suhbatini eslab qoladi
  CREATE TABLE IF NOT EXISTS chat_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    agent     TEXT NOT NULL,
    chat_id   TEXT NOT NULL,
    role      TEXT NOT NULL,
    content   TEXT NOT NULL,
    at        INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_hist ON chat_history(agent, chat_id, id);

  -- Layla: ingliz tili kursi progressi
  CREATE TABLE IF NOT EXISTS lingo_progress (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    day         INTEGER NOT NULL DEFAULT 0,
    last_sent   INTEGER
  );

  -- Rita: ping tarixi (dashboard grafigi uchun)
  CREATE TABLE IF NOT EXISTS checks (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    pkey    TEXT NOT NULL,
    status  TEXT NOT NULL,
    http    INTEGER,
    ms      INTEGER,
    note    TEXT,
    at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_checks ON checks(pkey, at);
`);

// Rita: kuzatiladigan loyihalar. Ustunlar ro'yxati migratsiyada ham
// ishlatilgani uchun alohida turadi.
const PROJECT_COLS = `
  key         TEXT PRIMARY KEY,                -- barqaror identifikator: 'kgf-web'
  name        TEXT NOT NULL,                   -- ko'rinadigan nom: 'KGF Web'
  grp         TEXT NOT NULL DEFAULT 'boshqa',  -- guruh: 'kgf', 'botlar', ...
  kind        TEXT NOT NULL DEFAULT 'http',    -- http | docker | systemd
  target      TEXT NOT NULL,                   -- URL, konteyner nomi yoki systemd unit
  expect      TEXT,                            -- sog'lom kodlar: '200-399,401'
  enabled     INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'unknown', -- ok | warn | err | unknown
  http        INTEGER,                         -- oxirgi HTTP kodi
  ms          INTEGER,                         -- oxirgi javob vaqti
  note        TEXT,                            -- oxirgi xato matni
  fail_streak INTEGER NOT NULL DEFAULT 0,
  last_check  INTEGER,
  last_ok     INTEGER,
  created_at  INTEGER NOT NULL
`;

db.exec(`CREATE TABLE IF NOT EXISTS projects (${PROJECT_COLS});`);

// Migratsiya: eski `url` ustuni → `kind` + `target` + `expect`.
// SQLite ustun qo'shishni cheklaydi, shuning uchun jadvalni qayta quramiz.
const projectCols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
if (!projectCols.includes('target') && projectCols.includes('url')) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    ALTER TABLE projects RENAME TO projects_eski;
    CREATE TABLE projects (${PROJECT_COLS});
    INSERT INTO projects
      (key, name, grp, kind, target, expect, enabled, status, http, ms, note,
       fail_streak, last_check, last_ok, created_at)
    SELECT
       key, name, grp, 'http', url, NULL, enabled, status, http, ms, note,
       fail_streak, last_check, last_ok, created_at
    FROM projects_eski;
    DROP TABLE projects_eski;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

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

const _bizSince = db.prepare(
  `SELECT chat_id, sender, text, at FROM biz_messages
   WHERE at >= ? AND at <= ? ORDER BY at ASC`,
);

/** Berilgan davrda kelgan lichka xabarlari (Debra hisobot berishi uchun). */
export function getBizMessagesBetween(fromMs, toMs = Date.now()) {
  return _bizSince.all(fromMs, toMs);
}

// Preserve contacts from databases created before usernames were stored.
db.exec(`INSERT OR IGNORE INTO biz_contacts (chat_id, sender, username, conn_id, last_at)
  SELECT m.chat_id, COALESCE(m.sender, 'Noma’lum'), NULL, c.conn_id, MAX(m.at)
  FROM biz_messages m CROSS JOIN biz_conn c
  WHERE c.id = 1 AND c.conn_id IS NOT NULL GROUP BY m.chat_id`);

/** Lichkada yozishgan odamlar ro'yxati (kimga javob yuborish mumkinligi). */
export function getBizContacts() {
  return db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM biz_messages m WHERE m.chat_id = c.chat_id) AS cnt
    FROM biz_contacts c ORDER BY last_at DESC`).all();
}

export function saveBizContact(m, sender) {
  db.prepare(`INSERT INTO biz_contacts (chat_id, sender, username, conn_id, last_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET
    sender=excluded.sender, username=excluded.username, conn_id=excluded.conn_id,
    last_at=excluded.last_at`).run(m.chat.id, sender, m.from?.username ?? null,
      m.business_connection_id, m.date * 1000 || Date.now());
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

// ---- Suhbat xotirasi ----

const _addHist = db.prepare(
  'INSERT INTO chat_history (agent, chat_id, role, content, at) VALUES (?, ?, ?, ?, ?)',
);
const _getHist = db.prepare(
  `SELECT role, content FROM chat_history
   WHERE agent = ? AND chat_id = ?
   ORDER BY id DESC LIMIT ?`,
);
const _trimHist = db.prepare(
  `DELETE FROM chat_history
   WHERE agent = ? AND chat_id = ? AND id NOT IN (
     SELECT id FROM chat_history WHERE agent = ? AND chat_id = ? ORDER BY id DESC LIMIT ?
   )`,
);

const KEEP = 300; // DB'da saqlanadigan oxirgi xabarlar soni (agent+chat uchun)

export function addHistory(agent, chatId, role, content) {
  _addHist.run(agent, String(chatId), role, content, Date.now());
  _trimHist.run(agent, String(chatId), agent, String(chatId), KEEP);
}

/** Oxirgi N xabarni (eskidan yangiga) qaytaradi — LLM'ga kontekst sifatida beriladi. */
export function getHistory(agent, chatId, limit = 30) {
  return _getHist.all(agent, String(chatId), limit).reverse();
}

export function clearHistory(agent, chatId) {
  db.prepare('DELETE FROM chat_history WHERE agent = ? AND chat_id = ?').run(agent, String(chatId));
}

// ---- Layla: kurs progressi ----

export function getLingoDay() {
  const row = db.prepare('SELECT day, last_sent FROM lingo_progress WHERE id = 1').get();
  return row ?? { day: 0, last_sent: null };
}

export function setLingoDay(day) {
  db.prepare(
    'INSERT OR REPLACE INTO lingo_progress (id, day, last_sent) VALUES (1, ?, ?)',
  ).run(day, Date.now());
}

// ---- Rita: loyihalar nazorati ----

/** Loyiha qo'shadi yoki tahrirlaydi. Holat maydonlariga tegmaydi. */
const _upsertProject = db.prepare(`
  INSERT INTO projects (key, name, grp, kind, target, expect, enabled, created_at)
  VALUES (@key, @name, @grp, @kind, @target, @expect, @enabled, @created_at)
  ON CONFLICT(key) DO UPDATE SET
    name = excluded.name, grp = excluded.grp, kind = excluded.kind,
    target = excluded.target, expect = excluded.expect, enabled = excluded.enabled
`);

export function addProject({ key, name, grp = 'boshqa', kind = 'http', target, expect = null, enabled = true }) {
  if (!target) throw new Error(`Loyiha "${key}": target (URL yoki konteyner nomi) ko'rsatilmagan`);
  if (!['http', 'docker', 'systemd'].includes(kind)) throw new Error(`Loyiha "${key}": noma'lum kind "${kind}"`);
  _upsertProject.run({
    key, name, grp, kind, target, expect,
    enabled: enabled ? 1 : 0, created_at: Date.now(),
  });
}

export function listProjects({ onlyEnabled = false } = {}) {
  return db
    .prepare(`SELECT * FROM projects ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY grp, name`)
    .all();
}

export function countProjects() {
  return db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
}

export function removeProject(key) {
  db.prepare('DELETE FROM checks WHERE pkey = ?').run(key);
  db.prepare('DELETE FROM projects WHERE key = ?').run(key);
}

const _saveCheck = db.prepare(
  'INSERT INTO checks (pkey, status, http, ms, note, at) VALUES (@pkey, @status, @http, @ms, @note, @at)',
);
const _updProject = db.prepare(`
  UPDATE projects SET status = @status, http = @http, ms = @ms, note = @note,
    fail_streak = @fail_streak, last_check = @at,
    last_ok = CASE WHEN @status = 'err' THEN last_ok ELSE @at END
  WHERE key = @key
`);

/** Ping natijasini yozadi: loyiha holati + tarix. */
export const recordCheck = db.transaction((key, r) => {
  const row = { pkey: key, status: r.status, http: r.http ?? null, ms: r.ms ?? null, note: r.note ?? null, at: r.at };
  _saveCheck.run(row);
  _updProject.run({ key, ...row, fail_streak: r.fail_streak });
});

/** Oxirgi N ta tekshiruv (dashboard grafigi uchun). */
export function recentChecks(key, limit = 48) {
  return db
    .prepare('SELECT status, http, ms, at FROM checks WHERE pkey = ? ORDER BY at DESC LIMIT ?')
    .all(key, limit)
    .reverse();
}

/** Ping tarixini kesadi — baza cheksiz o'smasin. */
export function pruneChecks(days = 30) {
  db.prepare('DELETE FROM checks WHERE at < ?').run(Date.now() - days * 86400_000);
}

// ---- Debra: hisobot uchun ----

db.exec(`
  -- Kichik kalit-qiymat: oxirgi eslatma vaqti kabi mayda holatlar.
  CREATE TABLE IF NOT EXISTS kv (
    kalit   TEXT PRIMARY KEY,
    qiymat  TEXT,
    at      INTEGER NOT NULL
  );
`);

const _kvOl = db.prepare('SELECT qiymat FROM kv WHERE kalit = ?');
const _kvQoy = db.prepare('INSERT OR REPLACE INTO kv (kalit, qiymat, at) VALUES (?, ?, ?)');
export const kvOl = (kalit) => _kvOl.get(kalit)?.qiymat ?? null;
export const kvQoy = (kalit, qiymat) => { _kvQoy.run(kalit, String(qiymat), Date.now()); };

/**
 * Berilgan davrdagi holat o'zgarishlari: qaysi loyiha qachon yiqildi
 * va qachon qaytdi. `checks` da har tekshiruv yozilgani uchun ketma-ket
 * yozuvlarni solishtirib, faqat o'zgargan nuqtalar olinadi.
 */
export function holatOzgarishlari(fromMs, toMs = Date.now()) {
  const nomlar = new Map(listProjects().map((p) => [p.key, p.name]));
  const qatorlar = db
    .prepare('SELECT pkey, status, note, at FROM checks WHERE at >= ? AND at <= ? ORDER BY pkey, at')
    .all(fromMs, toMs);

  const chiq = [];
  let oldingi = null;
  let oldingiKey = null;
  for (const c of qatorlar) {
    if (c.pkey !== oldingiKey) { oldingiKey = c.pkey; oldingi = null; }
    const yiqilgan = c.status === 'err';
    const oldinYiqilgan = oldingi === 'err';
    if (oldingi !== null && yiqilgan !== oldinYiqilgan) {
      chiq.push({
        kalit: c.pkey,
        nom: nomlar.get(c.pkey) ?? c.pkey,
        turi: yiqilgan ? 'yiqildi' : 'qaytdi',
        sabab: c.note,
        at: c.at,
      });
    }
    oldingi = c.status;
  }
  return chiq.sort((a, b) => a.at - b.at);
}
