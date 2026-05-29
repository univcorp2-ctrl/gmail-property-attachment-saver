import test from 'node:test';
import assert from 'node:assert/strict';
import { annualLoanPayment, scoreProperty } from '../lib/propertyScoring.js';

test('annualLoanPayment returns positive value', () => {
  assert.ok(annualLoanPayment(80000000, 0.025, 25) > 0);
});

test('strong cash flow property scores higher than weak one', () => {
  const strong = scoreProperty({ propertyName: 'A', price: 100000000, annualGrossIncome: 12000000, buildingAge: 18, structure: 'RC' });
  const weak = scoreProperty({ propertyName: 'B', price: 100000000, annualGrossIncome: 5000000, buildingAge: 35, structure: '木造' });
  assert.ok(strong.totalScore > weak.totalScore);
  assert.equal(strong.financingView, '融資検討可能');
});

test('old building with low cash flow is marked as financing caution', () => {
  const result = scoreProperty({ price: 50000000, annualGrossIncome: 2500000, buildingAge: 40, structure: '木造' });
  assert.equal(result.financingView, '融資注意');
  assert.ok(result.totalScore < 60);
});
