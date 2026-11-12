import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.RADAR_BOT_TOKEN = 'test';
process.env.GROUP_CHAT_ID = '-100';

const { addObuna, listObunalar } = await import('../src/core/db.js');
const { runLaylaTool, laylaTools } = await import('../src/agents/lingo/tools.js');

test('laylaTools schema definition is valid', () => {
  assert.equal(laylaTools.length, 2);
  const names = laylaTools.map((t) => t.name);
  assert.ok(names.includes('list_subscriptions'));
  assert.ok(names.includes('mark_subscription_paid'));
});

test('list_subscriptions returns empty list when no subscriptions', async () => {
  const res = await runLaylaTool('list_subscriptions', {});
  assert.equal(res.jami_obunalar_soni ?? res.obunalar.length, 0);
  assert.deepEqual(res.obunalar, []);
});

test('list_subscriptions and mark_subscription_paid work as expected', async () => {
  addObuna({
    kalit: 'hetzner',
    nom: 'Hetzner Server',
    summa: 120000,
    valyuta: 'so\'m',
    davr: 'oylik',
    sana: '2026-11-15',
    izoh: 'Asosiy VPS server',
    enabled: 1,
  });

  addObuna({
    kalit: 'domain-uz',
    nom: 'kokandgoldfuture.uz domeni',
    summa: 360000,
    valyuta: 'so\'m',
    davr: 'yillik',
    sana: '2026-12-01',
    izoh: 'cunic.uz orqali',
    enabled: 1,
  });

  const res = await runLaylaTool('list_subscriptions', {});
  assert.equal(res.jami_obunalar_soni, 2);
  assert.equal(res.obunalar.length, 2);
  // Oylik o'rtacha: 120,000 + (360,000 / 12) = 150,000
  assert.equal(res.oylik_ortacha_xarajat, 150000);

  // mark_subscription_paid monthly
  const paidHetzner = await runLaylaTool('mark_subscription_paid', { kalit: 'hetzner' });
  assert.equal(paidHetzner.muvaffaqiyatli, true);
  assert.equal(paidHetzner.eski_sana, '2026-11-15');
  assert.equal(paidHetzner.yangi_sana, '2026-12-15');

  // mark_subscription_paid yearly
  const paidDomain = await runLaylaTool('mark_subscription_paid', { kalit: 'domain-uz' });
  assert.equal(paidDomain.muvaffaqiyatli, true);
  assert.equal(paidDomain.eski_sana, '2026-12-01');
  assert.equal(paidDomain.yangi_sana, '2027-12-01');

  // not found
  const notFound = await runLaylaTool('mark_subscription_paid', { kalit: 'unknown' });
  assert.ok(notFound.xato);
});
