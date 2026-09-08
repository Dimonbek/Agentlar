import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = 'test';
process.env.RADAR_BOT_TOKEN = 'test';
process.env.GROUP_CHAT_ID = '-100';
process.env.BUSINESS_OWNER_ID = '42';

const { relayMessage } = await import('../src/agents/kotib/relay.js');
const { attachBusiness } = await import('../src/agents/kotib/business.js');
const { attachPrivateApproval, proposePrivateMessage } = await import('../src/agents/kotib/approval.js');
const { saveBizConn, saveBizContact, getBizContacts } = await import('../src/core/db.js');
const { runDebraTool } = await import('../src/agents/kotib/tools.js');

test('captionless media uses original Telegram file IDs; text keeps entities', async () => {
  for (const [kind, method] of Object.entries({ animation: 'sendAnimation', video: 'sendVideo',
    photo: 'sendPhoto', voice: 'sendVoice', audio: 'sendAudio', document: 'sendDocument',
    sticker: 'sendSticker', video_note: 'sendVideoNote' })) {
    const calls = [];
    await relayMessage({ callApi: async (...args) => calls.push(args) }, '-100',
      { [kind]: kind === 'photo' ? [{ file_id: 'small' }, { file_id: 'original' }] : { file_id: 'original' } }, 8);
    assert.equal(calls[0][0], method);
    assert.equal(calls[0][1][kind], 'original');
    assert.equal(calls[0][1].reply_parameters.message_id, 8);
  }
  const entities = [{ type: 'bold', offset: 0, length: 5 }];
  await relayMessage({ callApi: async (method, data) => {
    assert.equal(method, 'sendMessage'); assert.deepEqual(data.entities, entities);
  } }, '-100', { text: 'hello', entities }, 8);
});

test('Business relays GIF with identity, ignores owner/foreign connections, never auto-replies', async () => {
  saveBizConn(42, 'conn');
  const handlers = {}, calls = [];
  const bot = { on: (event, fn) => { handlers[event] = fn; }, telegram: {
    sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 1 }; },
    callApi: async (method, data) => {
      if (method === 'getBusinessConnection') return { id: data.business_connection_id, user: { id: data.business_connection_id === 'foreign' ? 99 : 42 }, is_enabled: true };
      calls.push([method, data]);
    },
  } };
  attachBusiness(bot);
  const m = { chat: { id: 7 }, from: { id: 7, first_name: 'Ali', username: 'AliTest' },
    message_id: 10, date: Math.floor(Date.now() / 1000), business_connection_id: 'conn', animation: { file_id: 'gif' } };
  await handlers.business_message({ update: { business_message: m } });
  assert.match(calls[0][2], /^@AliTest\nTelegram ID: <code>7<\/code>\nXabar turi: GIF\n/);
  assert.match(calls[0][2], /Telegram ID: <code>7<\/code>/);
  assert.equal(calls[1][0], 'sendAnimation');
  assert.equal(getBizContacts()[0].username, 'AliTest');
  const count = calls.length;
  await handlers.business_message({ update: { business_message: { ...m, from: { id: 42 } } } });
  await handlers.business_message({ update: { business_message: { ...m, business_connection_id: 'foreign' } } });
  assert.equal(calls.length, count);
});

test('Business handler relays text, photo, video, GIF and sticker with sender ID and captions', async () => {
  saveBizConn(42, 'conn');
  const handlers = {}, headers = [], payloads = [];
  attachBusiness({ on: (event, fn) => { handlers[event] = fn; }, telegram: {
    sendMessage: async (chat, text) => { headers.push(text); return { message_id: headers.length }; },
    callApi: async (method, data) => {
      if (method === 'getBusinessConnection') return { id: 'conn', user: { id: 42 }, is_enabled: true };
      payloads.push({ method, data });
    },
  } });
  const cases = [
    [{ text: 'Salom <Debra>' }, 'sendMessage', 'text', 'Salom <Debra>'],
    [{ photo: [{ file_id: 'photo' }], caption: 'Rasm izohi' }, 'sendPhoto', 'photo', 'photo'],
    [{ video: { file_id: 'video' } }, 'sendVideo', 'video', 'video'],
    [{ animation: { file_id: 'gif' }, document: { file_id: 'gif-document' } }, 'sendAnimation', 'animation', 'gif'],
    [{ sticker: { file_id: 'sticker' } }, 'sendSticker', 'sticker', 'sticker'],
  ];
  for (const [content, method, field, expected] of cases) {
    await handlers.business_message({ update: { business_message: {
      chat: { id: 7 }, from: { id: 8, first_name: 'Ali' }, business_connection_id: 'conn',
      message_id: 100 + headers.length, date: Math.floor(Date.now() / 1000), ...content,
    } } });
    assert.match(headers.at(-1), /^Username yo‘q\nTelegram ID: <code>8<\/code>\nXabar turi: /);
    assert.match(headers.at(-1), /Telegram ID: <code>8<\/code>/);
    assert.equal(payloads.at(-1).method, method);
    assert.equal(payloads.at(-1).data[field], expected);
    if (content.caption) assert.equal(payloads.at(-1).data.caption, content.caption);
  }
});

test('only owner may approve exact draft; duplicate/foreign clicks and revoked connection cannot send', async () => {
  saveBizConn(42, 'conn');
  saveBizContact({ chat: { id: 7 }, from: { username: 'AliTest' }, business_connection_id: 'conn', date: Date.now() / 1000 }, 'Ali');
  let handler, nextId = 100;
  const calls = [];
  const bot = { action: (_, fn) => { handler = fn; }, telegram: {
    sendMessage: async (chat, text, opts) => { const message_id = ++nextId; calls.push({ chat, text, opts, message_id }); return { message_id }; },
    callApi: async () => ({ user: { id: 42 }, is_enabled: true, rights: { can_reply: true } }),
  } };
  const auth = { userId: 42, groupId: '-100' };
  assert.match(await proposePrivateMessage(bot, 7, 'hello', { ...auth, userId: 99 }), /Ruxsat/);
  assert.equal(calls.length, 0);
  assert.match(await runDebraTool('list_contacts', {}, { bot }), /Ruxsat/);
  assert.match(await runDebraTool('list_contacts', { search: '@alitest' }, { bot, auth }), /chat_id=7/);
  attachPrivateApproval(bot);
  await proposePrivateMessage(bot, 7, 'hello', auth);
  assert.equal(calls.filter(c => c.chat === 7).length, 0);
  const draft = calls.at(-1);
  const id = draft.opts.reply_markup.inline_keyboard[0][0].callback_data.slice('biz:send:'.length);
  const ctx = { match: ['', 'send', id], from: { id: 99 }, chat: { id: '-100' },
    callbackQuery: { message: { message_id: draft.message_id } },
    answerCbQuery: async () => {}, editMessageReplyMarkup: async () => {}, reply: async () => {} };
  await handler(ctx);
  assert.equal(calls.filter(c => c.chat === 7).length, 0);
  ctx.from.id = 42;
  await Promise.all([handler(ctx), handler(ctx)]);
  assert.equal(calls.filter(c => c.chat === 7).length, 1);
  assert.equal(calls.at(-1).text, 'hello');
  await proposePrivateMessage(bot, 7, 'second', auth);
  const second = calls.at(-1);
  ctx.match[2] = second.opts.reply_markup.inline_keyboard[0][0].callback_data.slice('biz:send:'.length);
  ctx.callbackQuery.message.message_id = second.message_id;
  saveBizConn(42, null);
  await handler(ctx);
  assert.equal(calls.filter(c => c.chat === 7).length, 1);
});
