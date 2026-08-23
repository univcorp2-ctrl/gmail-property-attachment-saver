import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const source = readFileSync(new URL('../src/EncryptedZipIntake.js', import.meta.url), 'utf8');

test('EncryptedZipIntake GAS source parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(source));
});

test('EncryptedZipIntake enforces runtime repair before intake', () => {
  assert.match(source, /function verifyEncryptedZipIntakeRuntimeReadiness\(\)/);
  assert.match(source, /function repairEncryptedZipIntakeRuntime\(\)/);
  assert.match(source, /function runEncryptedZipIntakeJob\(\) \{\s*repairEncryptedZipIntakeRuntime\(\);/);
});
