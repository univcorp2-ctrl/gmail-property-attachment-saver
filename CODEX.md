# CODEX

このリポジトリはGmail添付保存と不動産分析自動化のためのGASプロジェクトです。

## 開発指針

- SecretsやAPIキーはコミットしない。
- 分析ルール変更時は `config/analysis_rules.json`、`src/Code.js`、`tests/propertyScoring.test.js` を同時に確認する。
- CIは `npm run lint` と `npm test` を必ず通す。

## Gmail暗号化ZIPの不動産資料

Gmailのパスワード付きZIP、別送パスワード通知、Google Driveへの物件別保存を扱うタスクでは、最初に次を読むこと。

- `skills/gmail-encrypted-zip-to-drive/SKILL.md`
- `skills/gmail-encrypted-zip-to-drive/job.schema.json`
- `lib/encryptedZipWorkflow.js`
- `src/EncryptedZipIntake.js`

完了判定は、ZIP名確認やパスワードメール発見ではなく、**ZIP実体取得 → サイズ照合 → ZIP名一致のパスワード通知 → 解凍 → 正規Driveフォルダ解決 → 保存 → Drive再取得 → 資料リンク返却**まで。

パスワード値はGitHub、Notion、Driveメタデータ、ログへ保存しない。値は実行時のみ扱う。
