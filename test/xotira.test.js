// Qum papka eng yuqorida: statik importlar tartib bilan bajariladi,
// xotira moduli esa papka yo'lini yuklanishda bir marta o'qiydi.
import './qum.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProjectMemory,
  getHistoryEvents,
  logProjectAction,
  saveProjectProposal,
  memoryTools,
  runMemoryTool,
} from '../src/core/xotira.js';

test('memoryTools definition is valid', () => {
  assert.ok(Array.isArray(memoryTools));
  assert.equal(memoryTools.length, 4);
  const names = memoryTools.map((t) => t.name);
  assert.ok(names.includes('get_project_memory'));
  assert.ok(names.includes('get_history_events'));
  assert.ok(names.includes('log_project_action'));
  assert.ok(names.includes('save_project_proposal'));
});

test('getProjectMemory retrieves project passport and recent events', () => {
  const crm = getProjectMemory('crm');
  assert.equal(crm.topildi, true);
  assert.equal(crm.fayl, 'crm.md');
  assert.match(crm.pasport, /DimoCRM/);
  assert.match(crm.pasport, /Debra/);

  const unknown = getProjectMemory('noma-lum-loyiha-xyz');
  assert.equal(unknown.topildi, false);
});

test('getHistoryEvents retrieves events and supports filters', () => {
  const events = getHistoryEvents({ days: 30 });
  assert.ok(Array.isArray(events));
  assert.ok(events.length >= 1);

  const infraEvents = getHistoryEvents({ days: 30, project: 'infra' });
  assert.ok(Array.isArray(infraEvents));
  for (const e of infraEvents) {
    assert.match(e.loyiha.toLowerCase(), /infra/);
  }
});

test('logProjectAction and runMemoryTool work properly', async () => {
  const res = await runMemoryTool(
    'log_project_action',
    { project: 'crm', action: 'Test aksiyasi muvaffaqiyatli bajarildi', details: 'Batafsil test izohi' },
    'debra'
  );

  assert.equal(res.muvaffaqiyatli, true);
  assert.equal(res.yozuv.agent, 'debra');
  assert.equal(res.yozuv.loyiha, 'crm');

  const recent = getHistoryEvents({ days: 1, project: 'crm' });
  const found = recent.find((e) => e.ish === 'Test aksiyasi muvaffaqiyatli bajarildi');
  assert.ok(found);
  assert.equal(found.agent, 'debra');
});
