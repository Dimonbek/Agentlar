import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.RADAR_BOT_TOKEN = 'test';
process.env.GROUP_CHAT_ID = '-100';

const { xatoYoz } = await import('../src/core/db.js');
const { runSaraTool, saraTools } = await import('../src/agents/sara/tools.js');

test('saraTools schema definition is valid', () => {
  assert.equal(saraTools.length, 1);
  assert.equal(saraTools[0].name, 'get_recent_errors');
});

test('get_recent_errors returns clean message when empty', async () => {
  const empty = await runSaraTool('get_recent_errors', {});
  assert.equal(empty.jami_xatolar_soni, 0);
  assert.ok(empty.xabar.includes('toza'));
});

test('get_recent_errors returns errors and supports filtering', async () => {
  xatoYoz({
    manba: 'c-kgf-web',
    barmoq: 'permission-denied-app-log',
    xabar: 'Error: EACCES: permission denied, open /app/logs/error.log',
    soni: 5,
    at: Date.now() - 60_000,
  });

  xatoYoz({
    manba: 'c-subtitr',
    barmoq: 'connection-refused-db',
    xabar: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    soni: 12,
    at: Date.now(),
  });

  const barcha = await runSaraTool('get_recent_errors', {});
  assert.equal(barcha.jami_xatolar_soni, 2);
  assert.equal(barcha.xatolar[0].manba, 'c-subtitr'); // ordered by oxirgi desc
  assert.equal(barcha.xatolar[0].takrorlanish_soni, 12);

  // filter by manba
  const kgfOnly = await runSaraTool('get_recent_errors', { manba: 'kgf' });
  assert.equal(kgfOnly.jami_xatolar_soni, 1);
  assert.equal(kgfOnly.xatolar[0].manba, 'c-kgf-web');

  // filter nonexistent
  const none = await runSaraTool('get_recent_errors', { manba: 'random-unknown' });
  assert.equal(none.jami_xatolar_soni, 0);
});
