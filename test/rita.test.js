import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.RADAR_BOT_TOKEN = 'test';
process.env.GROUP_CHAT_ID = '-100';

const { addProject, kvQoy } = await import('../src/core/db.js');
const { runRitaTool, ritaTools } = await import('../src/agents/radar/tools.js');

test('ritaTools schema definition is valid', () => {
  assert.equal(ritaTools.length, 2);
  const names = ritaTools.map((t) => t.name);
  assert.ok(names.includes('get_projects_health'));
  assert.ok(names.includes('check_project_live'));
});

test('get_projects_health returns correct summary and alerts', async () => {
  // Empty projects
  const boSh = await runRitaTool('get_projects_health', {});
  assert.equal(boSh.jami_loyihalar, 0);
  assert.equal(boSh.muammoli_loyihalar_soni, 0);

  // Add healthy and failing projects
  addProject({
    key: 'kgf-web',
    name: 'Kokand Gold Future',
    grp: 'web',
    kind: 'http',
    target: 'https://kokandgoldfuture.uz',
    expect: '200-399',
    enabled: 1,
  });

  addProject({
    key: 'broken-api',
    name: 'Buzuq API',
    grp: 'api',
    kind: 'http',
    target: 'http://127.0.0.1:9999/down',
    expect: '200',
    enabled: 1,
  });

  // Profilaktika cache mock
  kvQoy('rita:salomat', JSON.stringify({
    at: Date.now(),
    server: [
      { kalit: 'disk', nom: 'Disk', status: 'ok', foiz: 45, matn: '45% to\'lgan' },
      { kalit: 'mem', nom: 'Operativ xotira', status: 'ok', foiz: 60, matn: '60% band' },
    ],
    ssl: [
      { host: 'kokandgoldfuture.uz', status: 'ok', matn: '65 kun qoldi' },
    ],
    domen: [
      { domen: 'subtitr.uz', status: 'warn', matn: 'ijaraga 14 kun qoldi' },
    ],
    sekin: [],
  }));

  const res = await runRitaTool('get_projects_health', {});
  assert.equal(res.jami_loyihalar, 2);
  // broken-api has status 'kutilyapti' by default before any ping, so status !== 'ok'
  assert.equal(res.muammoli_loyihalar_soni, 2);
  assert.equal(res.server_resurslari.length, 2);
  // Warn on domain expiration
  assert.equal(res.profilaktika_ogohlantirishlari.length, 1);
  assert.equal(res.profilaktika_ogohlantirishlari[0].turi, 'warn');
  assert.equal(res.profilaktika_ogohlantirishlari[0].nom, 'subtitr.uz');
});

test('check_project_live validates project presence', async () => {
  const notFound = await runRitaTool('check_project_live', { project: 'nonexistent-project' });
  assert.ok(notFound.xato);
  assert.ok(notFound.xato.includes('topilmadi'));
});
