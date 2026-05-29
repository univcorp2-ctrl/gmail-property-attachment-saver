# CODEX

このリポジトリはGmail添付保存と不動産分析自動化のためのGASプロジェクトです。

## 開発指針

- SecretsやAPIキーはコミットしない。
- 分析ルール変更時は `config/analysis_rules.json`、`src/Code.js`、`tests/propertyScoring.test.js` を同時に確認する。
- CIは `npm run lint` と `npm test` を必ず通す。
