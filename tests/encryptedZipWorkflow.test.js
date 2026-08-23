import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPassword,
  extractZipFilename,
  passwordMailMatchesZip,
  propertyTokens,
  scoreDriveFolder,
  selectDriveFolder,
  evaluateRuntimeReadiness,
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

test('runtime readiness blocks when no executable path exists', () => {
  const readiness = evaluateRuntimeReadiness({
    gmailZipBytesReadable: false,
    passwordMailReadable: true,
    gasDeployed: false,
    gasAuthorized: false,
    localZipPresent: false,
    extractorAvailable: false,
    windowsExecutorReachable: false,
    bridgeAuthAvailable: false,
    driveWritable: true
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.allowedStatus, 'blocked');
  assert.ok(readiness.blockers.includes('ZIP_BYTES_ROUTE_UNAVAILABLE'));
  assert.ok(readiness.blockers.includes('EXTRACTOR_NOT_AVAILABLE'));
});

test('runtime readiness accepts GAS plus Windows executor route', () => {
  const readiness = evaluateRuntimeReadiness({
    gmailZipBytesReadable: false,
    passwordMailReadable: false,
    gasDeployed: true,
    gasAuthorized: true,
    localZipPresent: false,
    extractorAvailable: true,
    windowsExecutorReachable: true,
    bridgeAuthAvailable: true,
    driveWritable: true
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.selectedRoute, 'gas_windows');
  assert.equal(readiness.allowedStatus, 'running');
});

test('execution contract requires runtime preflight and verification gates', () => {
  const contract = buildExecutionContract({
    gmailMessageId: '1a02c3bce8b37823',
    zipFilename: '国立市谷保ＰＪ賃料査定書_2026-08-23_1028.zip'
  });
  assert.equal(contract.password_policy, 'memory_only_never_log');
  assert.equal(contract.runtime_policy, 'preflight_before_implementation_or_success_claim');
  assert.equal(contract.completion_gate[0], 'runtime_preflight_passed');
  assert.ok(contract.completion_gate.includes('drive_relisted_and_verified'));
  assert.ok(contract.completion_gate.includes('share_links_returned'));
});
