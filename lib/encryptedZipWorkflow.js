const PASSWORD_PATTERNS = [
  /解凍パスワード\s*[:：]\s*([^\s]+)/i,
  /password\s*[:：]\s*([^\s]+)/i,
  /パスワード\s*[:：]\s*([^\s]+)/i
];

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
}

export function extractZipFilename(text = '') {
  const normalized = normalizeText(text);
  const matches = normalized.match(/[^\s<>"']+\.zip/ig) || [];
  if (!matches.length) return null;
  return matches[0].replace(/[),。．、]+$/, '');
}

export function extractPassword(text = '') {
  const normalized = String(text).normalize('NFKC');
  for (const pattern of PASSWORD_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function passwordMailMatchesZip(passwordMailText, expectedZipFilename) {
  const found = extractZipFilename(passwordMailText);
  if (!found || !expectedZipFilename) return false;
  return normalizeText(found).toLowerCase() === normalizeText(expectedZipFilename).toLowerCase();
}

export function propertyTokens(...values) {
  const joined = normalizeText(values.filter(Boolean).join(' '))
    .replace(/[【】\[\]()（）「」『』｜|／\\_,.:;]+/g, ' ');
  const stop = new Set(['新築', '中古', '物件', '資料', '賃料', '査定', 'pj', 'プロジェクト', '一棟', '収益']);
  return [...new Set(joined.split(/\s+/).filter(Boolean).filter(v => v.length >= 2).filter(v => !stop.has(v.toLowerCase())))];
}

export function scoreDriveFolder(folderName, tokens = [], hints = {}) {
  const name = normalizeText(folderName).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const t = normalizeText(token).toLowerCase();
    if (t && name.includes(t)) score += Math.min(25, 8 + t.length);
  }
  if (hints.company && name.includes(normalizeText(hints.company).toLowerCase())) score += 10;
  if (hints.address && name.includes(normalizeText(hints.address).toLowerCase())) score += 30;
  if (hints.exactLabel && name === normalizeText(hints.exactLabel).toLowerCase()) score += 50;
  return score;
}

export function selectDriveFolder(candidates, tokens, hints = {}, threshold = 30) {
  const ranked = (candidates || [])
    .map(folder => ({ ...folder, score: scoreDriveFolder(folder.name || '', tokens, hints) }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'ja'));
  const best = ranked[0] || null;
  const second = ranked[1] || null;
  const ambiguous = Boolean(best && second && best.score === second.score && best.score >= threshold);
  return {
    best: best && best.score >= threshold && !ambiguous ? best : null,
    ranked,
    ambiguous
  };
}

export function buildExecutionContract(input) {
  if (!input?.zipFilename) throw new Error('zipFilename is required');
  if (!input?.gmailMessageId) throw new Error('gmailMessageId is required');
  return {
    schema_version: 1,
    operation: 'gmail_encrypted_zip_to_drive',
    gmail_message_id: input.gmailMessageId,
    zip_filename: input.zipFilename,
    sender: input.sender || null,
    property_label: input.propertyLabel || null,
    destination_root_folder_id: input.destinationRootFolderId || null,
    preserve_original_zip: input.preserveOriginalZip !== false,
    password_policy: 'memory_only_never_log',
    completion_gate: [
      'zip_bytes_acquired',
      'zip_size_verified',
      'password_mail_filename_matches',
      'archive_extracted',
      'drive_destination_resolved',
      'files_uploaded',
      'drive_relisted_and_verified',
      'share_links_returned'
    ]
  };
}
