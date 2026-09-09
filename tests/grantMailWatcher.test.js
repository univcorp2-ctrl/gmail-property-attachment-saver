import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/GrantMailWatcher.js', import.meta.url), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

function message(overrides = {}) {
  return {
    getFrom: () => overrides.from || '"就労・経営支援 係" <CHUSHO-K@city.suginami.lg.jp>',
    getSubject: () => overrides.subject || 'RE: 杉並区デジタル化推進事業助成金',
    getPlainBody: () => overrides.body || '受付番号に関する審査状況をご案内します。',
    getDate: () => new Date('2026-09-09T00:00:00Z')
  };
}

test('matches a Suginami grant reply from the resolved sender', () => {
  assert.equal(
    context.isMatchingGrantMessage_(message(), { sender: 'CHUSHO-K@city.suginami.lg.jp' }),
    true
  );
});

test('rejects unrelated senders and unrelated Suginami messages', () => {
  assert.equal(
    context.isMatchingGrantMessage_(message({ from: 'other@example.com' }), {
      sender: 'CHUSHO-K@city.suginami.lg.jp'
    }),
    false
  );
  assert.equal(
    context.isMatchingGrantMessage_(message({ subject: '杉並区からのお知らせ', body: '図書館休館日' }), {
      sender: 'CHUSHO-K@city.suginami.lg.jp'
    }),
    false
  );
});

test('deduplicates and bounds persisted message ids', () => {
  const result = context.compactSeenIds_(['a', 'b', 'a', 'c', 'd'], 3);
  assert.deepEqual(Array.from(result), ['b', 'c', 'd']);
});

test('notification includes the direct Gmail thread URL', () => {
  context.Utilities = {
    formatDate: () => '2026-09-09 09:00'
  };
  const result = context.buildGrantNotification_(
    { getId: () => 'thread123' },
    message(),
    { timezone: 'Asia/Tokyo' }
  );
  assert.match(result.subject, /杉並区助成金メール受信/);
  assert.match(result.body, /https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/thread123/);
});
