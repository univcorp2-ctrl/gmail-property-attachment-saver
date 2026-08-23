# Gmail encrypted ZIP → property Drive folder

## Purpose
Reusable skill for ChatGPT, Custom GPT, Claude, Codex, Cursor, local agents, or deterministic automation to process password-protected property attachments received by Gmail.

## Trigger examples
- 「堀田さんの新着資料を保存して」
- 「メールのZIPを解凍して該当物件フォルダへ入れて」
- 「大和ハウスの資料をDrive整理してリンクを出して」

## Required outcome
A run is **not complete** until all of the following are true:
1. The Gmail message containing the ZIP is identified.
2. The ZIP bytes are actually acquired and their byte size is checked.
3. The separate password email is identified by **exact ZIP filename match**, not sender/date alone.
4. The password is used only in-memory/transiently and is never written to GitHub, Notion, Drive descriptions, logs, or final chat output.
5. The archive is successfully extracted.
6. The property identity is inferred from email subject/body, ZIP name, and extracted filenames.
7. Existing Google Drive folders under the configured real-estate root are searched and scored.
8. A unique high-confidence existing folder is selected; ambiguous matches go to a holding folder and must not be silently guessed.
9. The original ZIP (optional but recommended) and all extracted files are saved.
10. Drive is re-listed after upload and filename/size/count are verified.
11. Folder and file share/view links are returned.
12. A Notion execution log is updated without the password value.

## Architecture
### Layer A — Gmail / Apps Script intake
`src/EncryptedZipIntake.js`
- Finds `.zip` attachments.
- Saves the encrypted original ZIP as bytes.
- Searches for a password-notification message matching the ZIP filename.
- Stores only the password-message ID, never the password value.
- Scores existing Drive folder names from property tokens.
- Falls back to `99_暗号化ZIP_展開待ち` when destination confidence is insufficient.

### Layer B — Windows executor / archive extraction
The paired local executor (`secure-local-ai-agent` via `custom-gpt-cloudflare-bridge`) performs password-protected extraction because Google Apps Script does not provide a dependable password parameter for encrypted ZIP extraction.
- Prefer 7-Zip when available.
- Password must be obtained locally from Gmail or passed via an ephemeral secure channel that is not persisted.
- Delete temporary plaintext/password files immediately after extraction.
- Require process exit code `0` **and** bridge job state `succeeded`.

### Layer C — Google Drive verification
After local extraction/upload:
- Re-read destination folder using Google Drive API/connector.
- Compare expected extracted files to actual Drive children.
- Return verified links only.

## Folder selection
Use `lib/encryptedZipWorkflow.js` for deterministic scoring where possible.

Signals, strongest first:
1. Exact normalized property label/address match.
2. Municipality + area/chome match.
3. Building/project name match.
4. ZIP filename tokens.
5. Sender/company folder affinity only as a weak tiebreaker.

Never choose a folder only because it is recently modified.
Never create a duplicate property folder when a unique existing folder can be resolved.
If two candidates tie above threshold, mark `ambiguous=true` and use the holding folder.

## Password pairing
A password email is valid only when its body includes the exact normalized `.zip` filename of the target attachment. Date proximity and sender identity are supporting evidence, not sufficient evidence.

Accepted password labels include Japanese `解凍パスワード:` / `パスワード:` and English `password:`.

## Secret policy
- Password value: memory/transient execution only.
- Do not write password to GitHub task JSON, Actions logs, Drive metadata, Notion, stdout, stderr, screenshots, or chat.
- It is acceptable to store the password-notification Gmail message ID and ZIP filename.

## Idempotency
Before creating a Drive file, compare normalized filename and byte size. If an identical verified file exists, reuse it rather than create another copy. If filename matches but size differs, preserve both with a timestamp suffix and log the conflict.

## Current production entry point
Repository: `univcorp2-ctrl/custom-gpt-cloudflare-bridge`
- Workflow: `.github/workflows/property-attachment-local-executor.yml`
- Job contract: `.ops/property-attachment-job.json`
- Result contract: `.ops/property-attachment-result.json`

The job JSON must never contain the password.

## AI-neutral job contract
```json
{
  "schema_version": 1,
  "mode": "process",
  "request_id": "unique-id",
  "gmail_message_id": "gmail-id",
  "gmail_message_url": "https://mail.google.com/...",
  "sender": "sender@example.com",
  "zip_filename": "example.zip",
  "destination_folder_id": "optional-known-id",
  "destination_root_folder_id": "real-estate-root-id",
  "property_label": "property/address hint"
}
```

## Completion response contract
```json
{
  "status": "succeeded|partial|failed",
  "gmail_message_id": "...",
  "zip_filename": "...",
  "zip_bytes": 0,
  "destination_folder_id": "...",
  "destination_folder_url": "...",
  "files": [
    {"name":"...","bytes":0,"drive_file_id":"...","url":"..."}
  ],
  "password_persisted": false,
  "drive_relisted_verified": true,
  "notes": []
}
```

## Failure handling
- Gmail connector says ZIP unsupported: do not claim completion. Use raw intake / Apps Script / Windows executor.
- Password mail not found: keep original ZIP, mark `PASSWORD_MAIL_NOT_FOUND`, do not brute-force.
- Filename mismatch: stop extraction for that password message.
- Extraction exit code non-zero: do not upload partial extraction as complete.
- Destination ambiguous: store in holding folder and return candidate folders.
- Drive upload succeeds but re-list fails: status is `partial`, not `succeeded`.

## Maker–Checker gate
Maker performs intake/extraction/upload. Checker independently re-reads Gmail metadata and Drive folder contents. Final success requires:
- correct message + ZIP,
- exact password-mail filename pairing,
- archive extraction success,
- Drive file count/size verification,
- verified links.
