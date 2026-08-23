const ENCRYPTED_ZIP_SETTINGS = {
  processedLabelName: 'encrypted-zip-intake-saved',
  searchQuery: 'has:attachment filename:zip newer_than:30d -label:encrypted-zip-intake-saved',
  fallbackFolderName: '99_暗号化ZIP_展開待ち',
  maxThreadsPerRun: 50,
  folderScoreThreshold: 30,
  maxFolderDepth: 4,
  timezone: 'Asia/Tokyo'
};

function verifyEncryptedZipIntakeRuntimeReadiness() {
  const props = PropertiesService.getScriptProperties();
  const blockers = [];
  const rootId = props.getProperty('DAIWA_ROOT_FOLDER_ID') || props.getProperty('TARGET_DRIVE_FOLDER_ID');
  let root = null;

  if (!rootId) {
    blockers.push('DRIVE_ROOT_NOT_CONFIGURED');
  } else {
    try {
      root = DriveApp.getFolderById(rootId);
      root.getName();
    } catch (error) {
      blockers.push('DRIVE_ROOT_NOT_ACCESSIBLE');
    }
  }

  try {
    GmailApp.search('newer_than:1d', 0, 1);
  } catch (error) {
    blockers.push('GMAIL_NOT_AUTHORIZED');
  }

  const triggerExists = ScriptApp.getProjectTriggers().some(
    trigger => trigger.getHandlerFunction() === 'runEncryptedZipIntakeJob'
  );
  if (!triggerExists) blockers.push('INTAKE_TRIGGER_MISSING');

  let fallbackFolderId = null;
  if (root) {
    const folders = root.getFoldersByName(ENCRYPTED_ZIP_SETTINGS.fallbackFolderName);
    if (folders.hasNext()) {
      fallbackFolderId = folders.next().getId();
    } else {
      blockers.push('FALLBACK_FOLDER_MISSING');
    }
  }

  return {
    ok: blockers.length === 0,
    ready: blockers.length === 0,
    blockers,
    rootFolderId: root ? root.getId() : null,
    fallbackFolderId,
    triggerExists,
    checkedAt: new Date().toISOString()
  };
}

function repairEncryptedZipIntakeRuntime() {
  const props = PropertiesService.getScriptProperties();
  const rootId = props.getProperty('DAIWA_ROOT_FOLDER_ID') || props.getProperty('TARGET_DRIVE_FOLDER_ID');
  if (!rootId) throw new Error('DAIWA_ROOT_FOLDER_ID or TARGET_DRIVE_FOLDER_ID is required before repair');

  const root = DriveApp.getFolderById(rootId);
  getOrCreateChildFolder_(root, ENCRYPTED_ZIP_SETTINGS.fallbackFolderName);
  setupEncryptedZipIntakeTrigger();

  const readiness = verifyEncryptedZipIntakeRuntimeReadiness();
  if (!readiness.ready) {
    throw new Error(`Encrypted ZIP intake runtime is still blocked: ${readiness.blockers.join(',')}`);
  }
  return readiness;
}

function runEncryptedZipIntakeJob() {
  const props = PropertiesService.getScriptProperties();
  const rootId = props.getProperty('DAIWA_ROOT_FOLDER_ID') || props.getProperty('TARGET_DRIVE_FOLDER_ID');
  if (!rootId) throw new Error('DAIWA_ROOT_FOLDER_ID or TARGET_DRIVE_FOLDER_ID is required');

  const root = DriveApp.getFolderById(rootId);
  const fallback = getOrCreateChildFolder_(root, ENCRYPTED_ZIP_SETTINGS.fallbackFolderName);
  const label = GmailApp.getUserLabelByName(ENCRYPTED_ZIP_SETTINGS.processedLabelName) ||
    GmailApp.createLabel(ENCRYPTED_ZIP_SETTINGS.processedLabelName);
  const threads = GmailApp.search(
    props.getProperty('ENCRYPTED_ZIP_SEARCH_QUERY') || ENCRYPTED_ZIP_SETTINGS.searchQuery,
    0,
    ENCRYPTED_ZIP_SETTINGS.maxThreadsPerRun
  );
  const results = [];

  threads.forEach(thread => {
    let threadHandled = false;
    thread.getMessages().forEach(message => {
      const zipAttachments = message
        .getAttachments({ includeInlineImages: false, includeAttachments: true })
        .filter(blob => /\.zip$/i.test(blob.getName()));
      if (!zipAttachments.length) return;

      zipAttachments.forEach(attachment => {
        const contextText = [message.getSubject(), message.getPlainBody(), attachment.getName()].join('\n');
        const tokens = buildPropertyTokens_(contextText);
        const resolved = resolveDestinationFolder_(root, tokens, ENCRYPTED_ZIP_SETTINGS.maxFolderDepth, ENCRYPTED_ZIP_SETTINGS.folderScoreThreshold);
        const destination = resolved.folder || fallback;
        const safeName = dedupeFileName_(destination, attachment.getName());
        const file = destination.createFile(attachment.copyBlob()).setName(safeName);
        const passwordMail = findPasswordMailForZip_(attachment.getName(), message.getDate());
        const meta = {
          source: 'gmail-encrypted-zip-intake',
          gmailMessageId: message.getId(),
          gmailThreadId: thread.getId(),
          from: message.getFrom(),
          subject: message.getSubject(),
          originalZipFilename: attachment.getName(),
          attachmentBytes: attachment.getBytes().length,
          passwordMessageId: passwordMail ? passwordMail.getId() : null,
          passwordValuePersisted: false,
          destinationFolderId: destination.getId(),
          destinationFolderName: destination.getName(),
          destinationScore: resolved.score,
          destinationAmbiguous: resolved.ambiguous,
          extracted: false,
          savedAt: new Date().toISOString()
        };
        file.setDescription(JSON.stringify(meta));
        results.push({
          ok: true,
          zipFileId: file.getId(),
          zipFileName: file.getName(),
          zipFileUrl: file.getUrl(),
          destinationFolderId: destination.getId(),
          destinationFolderUrl: destination.getUrl(),
          passwordMessageId: meta.passwordMessageId,
          passwordValuePersisted: false,
          needsExtraction: true,
          usedFallback: !resolved.folder
        });
        threadHandled = true;
      });
    });
    if (threadHandled) thread.addLabel(label);
  });
  return { ok: true, savedCount: results.length, results };
}

function setupEncryptedZipIntakeTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'runEncryptedZipIntakeJob');
  if (!exists) ScriptApp.newTrigger('runEncryptedZipIntakeJob').timeBased().everyHours(1).create();
  return { ok: true, alreadyExisted: exists };
}

function findPasswordMailForZip_(zipFilename, receivedAt) {
  const escaped = String(zipFilename).replace(/"/g, '');
  const after = new Date(receivedAt.getTime() - 24 * 60 * 60 * 1000);
  const before = new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000);
  const fmt = d => Utilities.formatDate(d, ENCRYPTED_ZIP_SETTINGS.timezone, 'yyyy/MM/dd');
  const query = `after:${fmt(after)} before:${fmt(before)} "${escaped}"`;
  const threads = GmailApp.search(query, 0, 20);
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      const body = String(message.getPlainBody() || '');
      if (normalizeZipText_(body).includes(normalizeZipText_(zipFilename)) && /(パスワード|password)/i.test(body + message.getSubject())) {
        return message;
      }
    }
  }
  return null;
}

function buildPropertyTokens_(text) {
  const normalized = normalizeZipText_(text)
    .replace(/[【】\[\]()（）「」『』｜|／\\_,.:;<>]/g, ' ')
    .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, ' ')
    .replace(/\b\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{4}\b/g, ' ');
  const stop = {
    '新築': true, '中古': true, '物件': true, '資料': true, '賃料': true,
    '査定': true, 'pj': true, 'プロジェクト': true, '一棟': true, '収益': true,
    'zip': true, 'pdf': true, '大和ハウス': true, '大和ハウスリアルエステート': true
  };
  const raw = normalized.split(/\s+/).filter(Boolean);
  const tokens = [];
  raw.forEach(token => {
    const key = token.toLowerCase();
    if (token.length < 2 || stop[key]) return;
    if (tokens.indexOf(token) < 0) tokens.push(token);
  });
  return tokens.slice(0, 30);
}

function resolveDestinationFolder_(root, tokens, maxDepth, threshold) {
  const candidates = [];
  collectFolders_(root, 0, maxDepth, candidates);
  const ranked = candidates.map(folder => ({
    folder,
    score: scoreFolderName_(folder.getName(), tokens)
  })).sort((a, b) => b.score - a.score || a.folder.getName().localeCompare(b.folder.getName()));
  const best = ranked[0] || null;
  const second = ranked[1] || null;
  const ambiguous = Boolean(best && second && best.score === second.score && best.score >= threshold);
  return {
    folder: best && best.score >= threshold && !ambiguous ? best.folder : null,
    score: best ? best.score : 0,
    ambiguous,
    topCandidates: ranked.slice(0, 5).map(x => ({ id: x.folder.getId(), name: x.folder.getName(), score: x.score }))
  };
}

function collectFolders_(parent, depth, maxDepth, out) {
  if (depth >= maxDepth) return;
  const iter = parent.getFolders();
  while (iter.hasNext()) {
    const folder = iter.next();
    out.push(folder);
    collectFolders_(folder, depth + 1, maxDepth, out);
  }
}

function scoreFolderName_(folderName, tokens) {
  const name = normalizeZipText_(folderName).toLowerCase();
  let score = 0;
  tokens.forEach(token => {
    const t = normalizeZipText_(token).toLowerCase();
    if (t && name.indexOf(t) >= 0) score += Math.min(25, 8 + t.length);
  });
  return score;
}

function normalizeZipText_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
}

function getOrCreateChildFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function dedupeFileName_(folder, originalName) {
  if (!folder.getFilesByName(originalName).hasNext()) return originalName;
  const dot = originalName.lastIndexOf('.');
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : '';
  const suffix = Utilities.formatDate(new Date(), ENCRYPTED_ZIP_SETTINGS.timezone, 'yyyyMMdd_HHmmss');
  return `${stem}_${suffix}${ext}`;
}
