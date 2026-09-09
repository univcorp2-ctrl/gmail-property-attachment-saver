const GRANT_WATCH_DEFAULTS = {
  enabled: true,
  sender: 'CHUSHO-K@city.suginami.lg.jp',
  searchQuery:
    'from:CHUSHO-K@city.suginami.lg.jp after:2026/09/08 ("杉並区" OR "デジタル化推進事業" OR "助成金")',
  maxThreadsPerRun: 20,
  seenProperty: 'SUGINAMI_GRANT_WATCH_SEEN_IDS',
  maxSeenIds: 200,
  timezone: 'Asia/Tokyo'
};

function runSuginamiGrantMailWatchJob() {
  const settings = getGrantWatchSettings_();
  if (!settings.enabled) return { ok: true, disabled: true, notifiedCount: 0 };

  const properties = PropertiesService.getScriptProperties();
  const seenIds = parseSeenIds_(properties.getProperty(settings.seenProperty));
  const seen = new Set(seenIds);
  const notifyTo = settings.notifyTo || Session.getEffectiveUser().getEmail();
  if (!notifyTo) throw new Error('通知先メールアドレスを取得できません。SUGINAMI_GRANT_NOTIFY_TO を設定してください。');

  const notifications = [];
  const newlySeen = [];
  const threads = GmailApp.search(settings.searchQuery, 0, settings.maxThreadsPerRun);

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      const messageId = message.getId();
      if (seen.has(messageId) || !isMatchingGrantMessage_(message, settings)) return;

      const notification = buildGrantNotification_(thread, message, settings);
      GmailApp.sendEmail(notifyTo, notification.subject, notification.body);
      notifications.push({ messageId, threadId: thread.getId(), subject: message.getSubject() });
      newlySeen.push(messageId);
      seen.add(messageId);
    });
  });

  if (newlySeen.length) {
    properties.setProperty(
      settings.seenProperty,
      JSON.stringify(compactSeenIds_(seenIds.concat(newlySeen), settings.maxSeenIds))
    );
  }

  return { ok: true, notifiedCount: notifications.length, notifications };
}

function getGrantWatchSettings_() {
  const properties = PropertiesService.getScriptProperties();
  const enabledValue = properties.getProperty('SUGINAMI_GRANT_WATCH_ENABLED');
  return Object.assign({}, GRANT_WATCH_DEFAULTS, {
    enabled: enabledValue == null ? GRANT_WATCH_DEFAULTS.enabled : enabledValue === 'true',
    sender: properties.getProperty('SUGINAMI_GRANT_SENDER') || GRANT_WATCH_DEFAULTS.sender,
    searchQuery:
      properties.getProperty('SUGINAMI_GRANT_SEARCH_QUERY') || GRANT_WATCH_DEFAULTS.searchQuery,
    notifyTo: properties.getProperty('SUGINAMI_GRANT_NOTIFY_TO') || ''
  });
}

function isMatchingGrantMessage_(message, settings) {
  const from = String(message.getFrom() || '').toLowerCase();
  const sender = String(settings.sender || '').toLowerCase();
  if (!from.includes(sender)) return false;

  const subject = String(message.getSubject() || '');
  const body = String(message.getPlainBody() || '');
  const haystack = `${subject}\n${body}`;
  return /杉並区/.test(haystack) && /(デジタル化推進事業|助成金|受付番号|交付|審査|不備|追加書類)/.test(haystack);
}

function buildGrantNotification_(thread, message, settings) {
  const receivedAt = Utilities.formatDate(message.getDate(), settings.timezone, 'yyyy-MM-dd HH:mm');
  const originalSubject = String(message.getSubject() || '(件名なし)');
  const body = String(message.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const gmailUrl = `https://mail.google.com/mail/u/0/#all/${thread.getId()}`;
  return {
    subject: `【通知】杉並区助成金メール受信｜${originalSubject}`,
    body: [
      '杉並区のデジタル化推進事業助成金に関する新着メールを検知しました。',
      '',
      `受信日時: ${receivedAt}`,
      `差出人: ${message.getFrom()}`,
      `件名: ${originalSubject}`,
      '',
      '本文冒頭:',
      body || '(本文なし)',
      '',
      `Gmailで開く: ${gmailUrl}`
    ].join('\n')
  };
}

function parseSeenIds_(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    console.warn(`Invalid seen-id state; resetting: ${error.message}`);
    return [];
  }
}

function compactSeenIds_(ids, limit) {
  const unique = [];
  const observed = new Set();
  ids.forEach(id => {
    const value = String(id);
    if (observed.has(value)) return;
    observed.add(value);
    unique.push(value);
  });
  return unique.slice(Math.max(unique.length - limit, 0));
}
