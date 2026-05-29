# Setup Guide

## 1. Google Driveフォルダ

次のフォルダをマイドライブに作ります。スクリプトが自動作成もできます。

- `0.物件資料_お客様紹介用/Gmail_受信資料`
- `0.物件資料_お客様紹介用/Gmail_受信資料/分析結果`

## 2. Apps Script作成

claspを使う場合:

```bash
npm install
npm run clasp:login
npm run clasp:create
npm run clasp:push
```

手動の場合は `src/Code.js` と `src/appsscript.json` をApps Scriptにコピーします。

## 3. 初回実行

Apps Scriptエディタで `setupInitialTriggers` を実行します。Googleの認可画面が出たら許可します。

## 4. 必要に応じたプロパティ

Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」で設定できます。

| Key | Value |
|---|---|
| `TARGET_DRIVE_FOLDER_ID` | 受信資料フォルダID |
| `ANALYSIS_RESULT_FOLDER_ID` | 分析結果フォルダID |
| `GMAIL_SEARCH_QUERY` | Gmail検索条件 |

## 5. 本番で必要な追加検討

PDF本文を高精度に解析するには、Google Drive OCR、Cloud Vision API、または外部LLM APIの追加が有効です。APIキー等を使う場合はApps ScriptのScript Propertiesに保存し、コードへ直書きしないでください。
