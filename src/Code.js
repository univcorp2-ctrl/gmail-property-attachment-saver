const DEFAULT_SETTINGS = {
  targetFolderPath: '0.物件資料_お客様紹介用/Gmail_受信資料',
  analysisFolderPath: '0.物件資料_お客様紹介用/Gmail_受信資料/分析結果',
  processedLabelName: 'property-doc-saved',
  gmailSearchQuery: 'has:attachment newer_than:30d -label:property-doc-saved',
  maxThreadsPerRun: 50,
  allowedExtensions: ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
  timezone: 'Asia/Tokyo'
};

const ANALYSIS_RULES = {
  assumptions: { vacancyRate: 0.05, operatingExpenseRate: 0.2, purchaseCostRate: 0.07, saleCostRate: 0.04, annualInterestRate: 0.025, defaultLoanYears: 25, targetLtv: 0.8, minDscr: 1.2, appreciationRate: 0, maxLoanYearsByStructure: { RC: 35, SRC: 35, S: 30, '木造': 22, W: 22, '軽量鉄骨': 27, UNKNOWN: 25 }, maxBuildingAgeForLoan: { RC: 47, SRC: 47, S: 34, '木造': 22, W: 22, '軽量鉄骨': 27, UNKNOWN: 30 } },
  weights: { resaleProfit: 30, cashFlowRatio: 30, oldBuildingCashFlow: 20, financing: 20 },
  thresholds: { strongCashFlowRatio: 0.03, acceptableCashFlowRatio: 0.015, minimumCashFlowRatio: 0, oldBuildingAge: 25, highScore: 80, watchScore: 60 }
};

function runAllJobs() {
  return { saveResult: runGmailAttachmentSaveJob(), analysisResult: runPropertyAnalysisJob() };
}

function runGmailAttachmentSaveJob() {
  const settings = getSettings_();
  const targetFolder = getFolderByIdOrPath_('TARGET_DRIVE_FOLDER_ID', settings.targetFolderPath);
  const processedLabel = GmailApp.getUserLabelByName(settings.processedLabelName) || GmailApp.createLabel(settings.processedLabelName);
  const threads = GmailApp.search(settings.gmailSearchQuery, 0, settings.maxThreadsPerRun);
  const saved = [];
  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      const attachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
      attachments.forEach(attachment => {
        if (!isAllowedAttachment_(attachment.getName(), settings.allowedExtensions)) return;
        const safeName = buildSafeFileName_(message.getDate(), message.getFrom(), attachment.getName());
        const file = targetFolder.createFile(attachment.copyBlob()).setName(safeName);
        file.setDescription(JSON.stringify({ source: 'gmail', gmailMessageId: message.getId(), gmailThreadId: thread.getId(), from: message.getFrom(), subject: message.getSubject(), plainBody: message.getPlainBody(), savedAt: new Date().toISOString() }));
        saved.push({ name: safeName, id: file.getId(), subject: message.getSubject() });
      });
    });
    thread.addLabel(processedLabel);
  });
  return { ok: true, savedCount: saved.length, saved };
}

function runPropertyAnalysisJob() {
  const settings = getSettings_();
  const sourceFolder = getFolderByIdOrPath_('TARGET_DRIVE_FOLDER_ID', settings.targetFolderPath);
  const resultFolder = getFolderByIdOrPath_('ANALYSIS_RESULT_FOLDER_ID', settings.analysisFolderPath);
  const rows = listFiles_(sourceFolder).map(file => analyzeFile_(file)).filter(Boolean).sort((a, b) => b.totalScore - a.totalScore);
  rows.forEach((row, index) => row.rank = index + 1);
  const timestamp = Utilities.formatDate(new Date(), settings.timezone, 'yyyyMMdd_HHmmss');
  const csv = buildCsv_(rows);
  const sql = buildSql_(rows);
  resultFolder.createFile(`property_analysis_${timestamp}.csv`, csv, MimeType.CSV);
  resultFolder.createFile('property_analysis_latest.csv', csv, MimeType.CSV);
  resultFolder.createFile(`property_analysis_${timestamp}.json`, JSON.stringify(rows, null, 2), MimeType.PLAIN_TEXT);
  resultFolder.createFile('property_analysis_latest.sql', sql, MimeType.PLAIN_TEXT);
  const spreadsheet = SpreadsheetApp.create(`property_analysis_latest_${timestamp}`);
  const sheet = spreadsheet.getActiveSheet();
  const table = csv.split('\n').map(line => line.split(','));
  if (table.length > 0 && table[0].length > 0) sheet.getRange(1, 1, table.length, table[0].length).setValues(table);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(resultFolder);
  return { ok: true, analyzedCount: rows.length, outputFolderId: resultFolder.getId(), spreadsheetId: spreadsheet.getId() };
}

function setupInitialTriggers() {
  ScriptApp.newTrigger('runAllJobs').timeBased().everyHours(1).create();
  return { ok: true };
}

function getSettings_() {
  const props = PropertiesService.getScriptProperties();
  return Object.assign({}, DEFAULT_SETTINGS, { gmailSearchQuery: props.getProperty('GMAIL_SEARCH_QUERY') || DEFAULT_SETTINGS.gmailSearchQuery });
}

function getFolderByIdOrPath_(propertyName, path) {
  const id = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (id) return DriveApp.getFolderById(id);
  return path.split('/').filter(Boolean).reduce((parent, name) => {
    const folders = parent.getFoldersByName(name);
    return folders.hasNext() ? folders.next() : parent.createFolder(name);
  }, DriveApp.getRootFolder());
}

function isAllowedAttachment_(name, extensions) {
  const ext = String(name).split('.').pop().toLowerCase();
  return extensions.indexOf(ext) >= 0;
}

function buildSafeFileName_(date, from, originalName) {
  const ymd = Utilities.formatDate(date, DEFAULT_SETTINGS.timezone, 'yyyyMMdd_HHmmss');
  const sender = String(from).replace(/[\\/:*?"<>|@\s]+/g, '_').slice(0, 40);
  const name = String(originalName).replace(/[\\/:*?"<>|]+/g, '_');
  return `${ymd}_${sender}_${name}`;
}

function listFiles_(folder) {
  const files = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) files.push(iterator.next());
  return files;
}

function analyzeFile_(file) {
  const text = `${file.getName()}\n${file.getDescription() || ''}`;
  const fields = extractPropertyFields_(text);
  const score = scoreProperty_(fields, ANALYSIS_RULES);
  return Object.assign({ rank: 0, fileId: file.getId(), fileName: file.getName(), fileUrl: file.getUrl(), analyzedAt: new Date().toISOString() }, score);
}

function extractPropertyFields_(text) {
  const t = String(text || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const price = extractMoney_(t, /(価格|売買価格|物件価格|販売価格)[:：\s]*([0-9,.]+)\s*(億|万)?円?/);
  const monthlyRent = extractMoney_(t, /(月額賃料|家賃|賃料)[:：\s]*([0-9,.]+)\s*(億|万)?円?/);
  const annualRent = extractMoney_(t, /(年間賃料|年収|満室想定年収|想定年収)[:：\s]*([0-9,.]+)\s*(億|万)?円?/);
  return { propertyName: extractName_(t), price, annualGrossIncome: annualRent || monthlyRent * 12, buildingAge: extractAge_(t), structure: extractStructure_(t) };
}

function extractMoney_(text, regex) {
  const m = text.match(regex);
  if (!m) return 0;
  const n = Number(String(m[2]).replace(/,/g, ''));
  if (m[3] === '億') return n * 100000000;
  if (m[3] === '万') return n * 10000;
  return n;
}

function extractAge_(text) {
  const age = text.match(/(築年数|築)[:：\s]*([0-9]+)\s*年/);
  if (age) return Number(age[2]);
  const year = text.match(/(築年月|竣工|建築)[:：\s]*(19[0-9]{2}|20[0-9]{2})年/);
  return year ? new Date().getFullYear() - Number(year[2]) : 0;
}

function extractName_(text) {
  const m = text.match(/(物件名|名称)[:：\s]*([^\n\r]+)/);
  return m ? m[2].trim().slice(0, 80) : '名称未抽出';
}

function extractStructure_(text) {
  if (/SRC|鉄骨鉄筋コンクリート/.test(text)) return 'SRC';
  if (/RC|鉄筋コンクリート/.test(text)) return 'RC';
  if (/軽量鉄骨/.test(text)) return '軽量鉄骨';
  if (/木造|W造/.test(text)) return '木造';
  if (/鉄骨|S造/.test(text)) return 'S';
  return 'UNKNOWN';
}

function annualLoanPayment_(principal, annualRate, years) {
  if (!principal || !years) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return r === 0 ? principal / years : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) * 12;
}

function scoreByThreshold_(value, min, ok, strong, weight) {
  if (value <= min) return 0;
  if (value >= strong) return weight;
  if (value <= ok) return weight * 0.5 * ((value - min) / (ok - min));
  return weight * (0.5 + 0.5 * ((value - ok) / (strong - ok)));
}

function scoreProperty_(p, rules) {
  const a = rules.assumptions;
  const price = p.price || 0;
  const annualGrossIncome = p.annualGrossIncome || 0;
  const noi = annualGrossIncome * (1 - a.vacancyRate) * (1 - a.operatingExpenseRate);
  const loanYears = Math.min(a.defaultLoanYears, a.maxLoanYearsByStructure[p.structure] || a.maxLoanYearsByStructure.UNKNOWN);
  const annualDebtService = annualLoanPayment_(price * a.targetLtv, a.annualInterestRate, loanYears);
  const annualCashFlow = noi - annualDebtService;
  const annualCashFlowRatio = price > 0 ? annualCashFlow / price : 0;
  const resaleProfit = price * (1 + a.appreciationRate) - price - price * a.saleCostRate;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  const maxAge = a.maxBuildingAgeForLoan[p.structure] || a.maxBuildingAgeForLoan.UNKNOWN;
  const remainingUsefulLife = Math.max(maxAge - (p.buildingAge || 0), 0);
  const resaleProfitScore = resaleProfit > 0 ? rules.weights.resaleProfit : Math.max(0, rules.weights.resaleProfit * (1 + resaleProfit / Math.max(price, 1)));
  const cashFlowRatioScore = scoreByThreshold_(annualCashFlowRatio, rules.thresholds.minimumCashFlowRatio, rules.thresholds.acceptableCashFlowRatio, rules.thresholds.strongCashFlowRatio, rules.weights.cashFlowRatio);
  const oldBuildingCashFlowScore = (p.buildingAge || 0) >= rules.thresholds.oldBuildingAge ? scoreByThreshold_(annualCashFlowRatio, rules.thresholds.minimumCashFlowRatio, rules.thresholds.acceptableCashFlowRatio, rules.thresholds.strongCashFlowRatio, rules.weights.oldBuildingCashFlow) : rules.weights.oldBuildingCashFlow * 0.8;
  const financingScore = Math.min(rules.weights.financing, Math.min(1, dscr / a.minDscr) * 10 + Math.min(1, remainingUsefulLife / 10) * 6 + 4);
  const totalScore = resaleProfitScore + cashFlowRatioScore + oldBuildingCashFlowScore + financingScore;
  return Object.assign({}, p, { grossYield: price ? annualGrossIncome / price : 0, netYield: price ? noi / (price * (1 + a.purchaseCostRate)) : 0, noi, annualDebtService, annualCashFlow, annualCashFlowRatio, resaleProfit, dscr, remainingUsefulLife, resaleProfitScore, cashFlowRatioScore, oldBuildingCashFlowScore, financingScore, totalScore, grade: totalScore >= rules.thresholds.highScore ? 'A' : totalScore >= rules.thresholds.watchScore ? 'B' : 'C', financingView: dscr >= a.minDscr && remainingUsefulLife > 0 ? '融資検討可能' : '融資注意' });
}

function buildCsv_(rows) {
  const headers = ['rank','propertyName','grade','totalScore','price','annualGrossIncome','grossYield','netYield','annualCashFlow','annualCashFlowRatio','resaleProfit','dscr','buildingAge','structure','remainingUsefulLife','financingView','fileName','fileUrl','analyzedAt'];
  const escape = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [headers.join(',')].concat(rows.map(row => headers.map(h => escape(row[h])).join(','))).join('\n');
}

function buildSql_(rows) {
  const esc = v => String(v == null ? '' : v).replace(/'/g, "''");
  const ddl = "create table if not exists property_analysis (rank integer, property_name text, grade text, total_score real, price real, annual_gross_income real, gross_yield real, net_yield real, annual_cash_flow real, annual_cash_flow_ratio real, resale_profit real, dscr real, building_age integer, structure text, remaining_useful_life integer, financing_view text, file_name text, file_url text, analyzed_at text);";
  const inserts = rows.map(r => `insert into property_analysis values (${Number(r.rank)||0}, '${esc(r.propertyName)}', '${esc(r.grade)}', ${Number(r.totalScore)||0}, ${Number(r.price)||0}, ${Number(r.annualGrossIncome)||0}, ${Number(r.grossYield)||0}, ${Number(r.netYield)||0}, ${Number(r.annualCashFlow)||0}, ${Number(r.annualCashFlowRatio)||0}, ${Number(r.resaleProfit)||0}, ${Number(r.dscr)||0}, ${Number(r.buildingAge)||0}, '${esc(r.structure)}', ${Number(r.remainingUsefulLife)||0}, '${esc(r.financingView)}', '${esc(r.fileName)}', '${esc(r.fileUrl)}', '${esc(r.analyzedAt)}');`);
  return [ddl].concat(inserts).join('\n');
}
