export const defaultRules = {
  assumptions: {
    vacancyRate: 0.05,
    operatingExpenseRate: 0.2,
    purchaseCostRate: 0.07,
    saleCostRate: 0.04,
    annualInterestRate: 0.025,
    defaultLoanYears: 25,
    targetLtv: 0.8,
    minDscr: 1.2,
    appreciationRate: 0,
    maxLoanYearsByStructure: { RC: 35, SRC: 35, S: 30, 木造: 22, W: 22, 軽量鉄骨: 27, UNKNOWN: 25 },
    maxBuildingAgeForLoan: { RC: 47, SRC: 47, S: 34, 木造: 22, W: 22, 軽量鉄骨: 27, UNKNOWN: 30 }
  },
  weights: { resaleProfit: 30, cashFlowRatio: 30, oldBuildingCashFlow: 20, financing: 20 },
  thresholds: { strongCashFlowRatio: 0.03, acceptableCashFlowRatio: 0.015, minimumCashFlowRatio: 0, oldBuildingAge: 25, highScore: 80, watchScore: 60 }
};

export function annualLoanPayment(principal, annualRate, years) {
  if (!principal || principal <= 0 || !years || years <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const months = years * 12;
  if (monthlyRate === 0) return principal / years;
  return (principal * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1) * 12;
}

export function scoreByThreshold(value, min, ok, strong, weight) {
  if (value <= min) return 0;
  if (value >= strong) return weight;
  if (value <= ok) return weight * 0.5 * ((value - min) / (ok - min));
  return weight * (0.5 + 0.5 * ((value - ok) / (strong - ok)));
}

export function scoreProperty(property, rules = defaultRules) {
  const p = { price: 0, annualGrossIncome: 0, buildingAge: 0, structure: 'UNKNOWN', ...property };
  const a = rules.assumptions;
  const price = p.price || 0;
  const annualGrossIncome = p.annualGrossIncome || 0;
  const vacancyAdjustedIncome = annualGrossIncome * (1 - a.vacancyRate);
  const noi = vacancyAdjustedIncome * (1 - a.operatingExpenseRate);
  const loanAmount = price * a.targetLtv;
  const loanYears = Math.min(a.defaultLoanYears, a.maxLoanYearsByStructure[p.structure] || a.maxLoanYearsByStructure.UNKNOWN);
  const annualDebtService = annualLoanPayment(loanAmount, a.annualInterestRate, loanYears);
  const annualCashFlow = noi - annualDebtService;
  const annualCashFlowRatio = price > 0 ? annualCashFlow / price : 0;
  const grossYield = price > 0 ? annualGrossIncome / price : 0;
  const netYield = price > 0 ? noi / (price * (1 + a.purchaseCostRate)) : 0;
  const futureSalePrice = price * (1 + a.appreciationRate);
  const resaleProfit = futureSalePrice - price - price * a.saleCostRate;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  const maxAge = a.maxBuildingAgeForLoan[p.structure] || a.maxBuildingAgeForLoan.UNKNOWN;
  const remainingUsefulLife = Math.max(maxAge - (p.buildingAge || 0), 0);
  const resaleProfitScore = resaleProfit > 0 ? rules.weights.resaleProfit : Math.max(0, rules.weights.resaleProfit * (1 + resaleProfit / Math.max(price, 1)));
  const cashFlowRatioScore = scoreByThreshold(annualCashFlowRatio, rules.thresholds.minimumCashFlowRatio, rules.thresholds.acceptableCashFlowRatio, rules.thresholds.strongCashFlowRatio, rules.weights.cashFlowRatio);
  const oldBuildingCashFlowScore = (p.buildingAge || 0) >= rules.thresholds.oldBuildingAge ? scoreByThreshold(annualCashFlowRatio, rules.thresholds.minimumCashFlowRatio, rules.thresholds.acceptableCashFlowRatio, rules.thresholds.strongCashFlowRatio, rules.weights.oldBuildingCashFlow) : rules.weights.oldBuildingCashFlow * 0.8;
  const dscrScore = Math.min(1, dscr / a.minDscr) * 10;
  const ageScore = Math.min(1, remainingUsefulLife / 10) * 6;
  const ltvScore = a.targetLtv <= 0.85 ? 4 : 2;
  const financingScore = Math.min(rules.weights.financing, dscrScore + ageScore + ltvScore);
  const totalScore = resaleProfitScore + cashFlowRatioScore + oldBuildingCashFlowScore + financingScore;
  return {
    ...p,
    grossYield, netYield, noi, annualDebtService, annualCashFlow, annualCashFlowRatio, resaleProfit, dscr, remainingUsefulLife,
    resaleProfitScore, cashFlowRatioScore, oldBuildingCashFlowScore, financingScore, totalScore,
    grade: totalScore >= rules.thresholds.highScore ? 'A' : totalScore >= rules.thresholds.watchScore ? 'B' : 'C',
    financingView: dscr >= a.minDscr && remainingUsefulLife > 0 ? '融資検討可能' : '融資注意'
  };
}
