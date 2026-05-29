# Gmail Property Attachment Saver & Analyzer

Gmailで受信したPDF・物件資料をGoogle Driveへ自動保存し、保存済み資料から物件分析結果をCSV/Excel向けCSV/SQL/JSONにまとめるGoogle Apps Script + claspプロジェクトです。

## 保存先

- 受信資料: `マイドライブ/0.物件資料_お客様紹介用/Gmail_受信資料`
- 分析結果: `マイドライブ/0.物件資料_お客様紹介用/Gmail_受信資料/分析結果`

Google Apps ScriptではWindowsの `G:\マイドライブ` ではなく、Google Drive上のフォルダ階層として扱います。同名フォルダ対策としてScript Propertiesに次を設定できます。

- `TARGET_DRIVE_FOLDER_ID`
- `ANALYSIS_RESULT_FOLDER_ID`
- `GMAIL_SEARCH_QUERY`

## 主な機能

1. Gmail添付の自動保存
2. 処理済みラベルによる二重保存防止
3. OCR済みテキスト、メール本文、ファイル名から物件項目を抽出
4. 売却益、キャッシュフロー比率、築古CF耐性、融資可能性でスコアリング
5. ランキング付きCSV/JSON/SQLを分析結果フォルダに出力
6. 過去分析結果をSQLで取り出せるDDL/INSERTとして保存
7. 分析方法は `config/analysis_rules.json` と `src/Code.js` の `ANALYSIS_RULES` を修正して変更可能

## 初期設定

```bash
npm install
npm run clasp:login
npm run clasp:create
npm run clasp:push
```

GASエディタで `setupInitialTriggers` を1回だけ実行してください。以後は1時間ごとに `runAllJobs` が動きます。

手動運用の場合は `src/Code.js` をApps Scriptへ貼り付け、`setupInitialTriggers` を実行してください。

## 分析方法を変える場所

- 点数配分: `config/analysis_rules.json` の `weights`
- 空室率・経費率・金利・LTV: `assumptions`
- 合格ライン: `thresholds`
- GAS実行ロジック: `src/Code.js` の `ANALYSIS_RULES`
- テスト: `tests/propertyScoring.test.js`

現在の配点:

| 項目 | 配点 |
|---|---:|
| 売却益が出るか | 30 |
| 物件価格に対する年間CF比率 | 30 |
| 築古でもCFが出るか | 20 |
| 銀行融資がつきやすいか | 20 |

## SQL利用例

分析結果フォルダに出る `property_analysis_latest.sql` をSQLiteへ投入します。

```bash
sqlite3 property_analysis.db < property_analysis_latest.sql
sqlite3 property_analysis.db "select rank, property_name, total_score, annual_cash_flow_ratio from property_analysis order by total_score desc;"
```

## 注意

初期版は、メール本文・ファイル名・TXT化済み本文からの抽出を優先します。PDF本文の高精度OCRは次段階でDrive OCR、Cloud Vision API、外部LLM API連携を追加できます。スコアは一次スクリーニング用であり、融資判断・売却価格・税務判断は専門家確認が必要です。
