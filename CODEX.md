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

### 絶対プリフライト

作業開始時の最初の実行は、コード追加や設計書作成ではなく**runtime readiness確認**にする。`evaluateRuntimeReadiness()` またはGASの `verifyEncryptedZipIntakeRuntimeReadiness()` を使い、ZIP bytes取得・パスワードメール読取・解凍器・Drive書込/再取得をつなぐ現在有効な経路が1本以上あることを確認する。

- 経路がなければ `BLOCKED`。`RUNNING`、`完成`、`実装済みなのであとは実行だけ` と扱わない。
- workflowファイルの存在、commit成功、CI成功、フォルダ作成、パスワードメール発見はproduction実行証拠ではない。
- BLOCKED時は不足コンポーネントを修復し、再probeで `ready=true` を確認してから本処理へ進む。
- ユーザーが「保存・解凍・実行」を求めている時、実行経路未確認のままドキュメント作成を主成果物へ置換しない。

完了判定は、**runtime preflight PASS → ZIP実体取得 → サイズ照合 → ZIP名一致のパスワード通知 → 解凍 → 正規Driveフォルダ解決 → 保存 → Drive再取得 → 資料リンク返却**まで。

パスワード値はGitHub、Notion、Driveメタデータ、ログへ保存しない。値は実行時のみ扱う。
