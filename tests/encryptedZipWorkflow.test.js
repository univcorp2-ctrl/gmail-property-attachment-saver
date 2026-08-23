import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPassword,
  extractZipFilename,
  passwordMailMatchesZip,
  propertyTokens,
  scoreDriveFolder,
  selectDriveFolder,
  buildExecutionContract
} from '../lib/encryptedZipWorkflow.js';

test('extracts Japanese password and matching zip filename', () => {
  const body = '添付ファイル名: 国立市谷保ＰＪ賃料査定書_2026-08-23_1028.zip\n解凍パスワード: AbC123!';
  assert.equal(extractZipFilename(body), '国立市谷保PJ賃料査定書_2026-08-23_1028.zip');
  assert.equal(extractPassword(body), 'AbC123!');
  assert.equal(passwordMailMatchesZip(body, '国立市谷保ＰＪ賃料査定書_2026-08-23_1028.zip'), true);
});

test('does not accept password mail for a different zip', () => {
  const body = '添付ファイル名：別案件_2026-08-23.zip\n解凍パスワード：secret';
  assert.equal(passwordMailMatchesZip(body, '国立市谷保ＰＪ賃料査定書_2026-08-23_1028.zip'), false);
});

test('scores exact property folder above generic folders', () => {
  const tokens = propertyTokens('国立市谷保4丁目 新築', '国立市谷保ＰＪ賃料査定書');
  const generic = scoreDriveFolder('DAIWA_物件資料', tokens, {});
  const exact = scoreDriveFolder('2026-08-23_国立市谷保4丁目_新築', tokens, { address: '国立市谷保4丁目' });
  assert.ok(exact > generic);
});

test('selectDriveFolder refuses ambiguous ties above threshold', () => {
  const result = selectDriveFolder(
    [{ id: 'a', name: '国立市谷保4丁目' }, { id: 'b', name: '国立市谷保4丁目' }],
    ['国立市谷保4丁目'],
    {},
    10
  );
  assert.equal(result.best, null);
  assert.equal(result.ambiguous, true);
});

test('execution contract requires verification gates and memory-only password policy', () => {
  const contract = buildExecutionContract({
    gmailMessageId: '1a02c3bce8b37823',
    zipFilename: '国立市谷保ＰＪ賃料査定書_2026-08-23_1028.zip'
  });
  assert.equal(contract.password_policy, 'memory_only_never_log');
  assert.ok(contract.completion_gate.includes('drive_relisted_and_verified'));
  assert.ok(contract.completion_gate.includes('share_links_returned'));
});
