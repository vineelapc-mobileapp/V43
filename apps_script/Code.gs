// EEE Practice - Student register + daily count (Google Apps Script)
// Paste into: Google Sheet -> Extensions -> Apps Script.  Deploy as Web app.
const TEACHER_KEY = 'CHANGE_THIS_SECRET';   // <-- your own secret word (same one you type in Teacher page)
const TZ = 'Asia/Kolkata';
const TEACHER_EMAIL = '';   // where the 12-hour doubt summary goes. Leave '' to use the Google account that owns this script.

function sheet_(name, header, textCols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(header);
    s.setFrozenRows(1);
    textCols.forEach(c => s.getRange(c + ':' + c).setNumberFormat('@'));
  }
  return s;
}
function clip_(v) { return String(v || '').trim().slice(0, 80); }
function dstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }


// V128 NEW: in-app doubts ------------------------------------------------
const DOUBT_HEAD = ['ID', 'Email', 'Name', 'Secret', 'Time', 'Subject', 'Topic', 'Level', 'Question', 'Message', 'Status', 'Reply', 'Replied at', 'Media'];   // V129 NEW: Media (col 14) = JSON list of reply attachments
function dsheet_() {
  const s = sheet_('Doubts', DOUBT_HEAD, ['A', 'D']);
  if (s.getLastColumn() < 14) s.getRange(1, 14).setValue('Media');   // V129 NEW: upgrades the old 13-column sheet
  return s;
}
// V129 NEW: teacher reply attachments (voice / photo / video) are stored in YOUR Google Drive folder 'EEE Doubt Replies' (private)
const MEDIA_OK = /^(image\/(jpeg|png|webp)|audio\/(webm|mp4|mpeg|ogg|wav|aac|x-m4a|m4a)|video\/(mp4|webm|quicktime))$/;
function mediaList_(v) { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function mediaFolder_() {
  const it = DriveApp.getFoldersByName('EEE Doubt Replies');
  return it.hasNext() ? it.next() : DriveApp.createFolder('EEE Doubt Replies');
}
function clipN_(v, n) { return String(v || '').trim().slice(0, n); }
function fmtT_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : String(v || ''); }
function doubtOut_(r, withEmail) {
  const o = { id: String(r[0]), time: fmtT_(r[4]), subject: String(r[5]), topic: String(r[6]), level: String(r[7]), question: String(r[8]), message: String(r[9]), status: String(r[10] || 'Open'), reply: String(r[11] || ''), repliedAt: fmtT_(r[12]), media: mediaList_(r[13]) };
  if (withEmail) { o.email = String(r[1]); o.name = String(r[2]); }
  return o;
}
function handleDoubt_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return { ok: false };
  const id = String(d.id || ''), secret = String(d.secret || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || !/^[a-f0-9]{16,64}$/.test(secret)) return { ok: false };
  const message = clipN_(d.message, 1500);
  if (!message) return { ok: false };
  const sh = dsheet_(), rows = sh.getDataRange().getValues();
  const since = Date.now() - 24 * 3600 * 1000;
  let recent = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) return { ok: true, dup: true };
    if (String(rows[i][1]).toLowerCase() === email && rows[i][4] instanceof Date && rows[i][4].getTime() > since) recent++;
  }
  if (recent >= 30) return { ok: false, error: 'limit' };
  sh.appendRow([id, email, clipN_(d.name, 80), secret, new Date(), clipN_(d.subject, 80), clipN_(d.topic, 80), clipN_(d.level, 20), clipN_(d.question, 300), message, 'Open', '', '']);
  return { ok: true };
}
// V131 NEW: ONE summary e-mail every 12 hours (only if new doubts arrived). Run setupDigest once.
function setupDigest() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'sendDigest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDigest').timeBased().everyHours(12).create();
}
function sendDigest() {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('lastDigest') || 0), now = Date.now();
  const rows = dsheet_().getDataRange().getValues().slice(1);
  const fresh = rows.filter(r => r[4] instanceof Date && r[4].getTime() > last);
  const waiting = rows.filter(r => String(r[10] || 'Open') !== 'Answered').length;
  props.setProperty('lastDigest', String(now));
  if (!fresh.length) return;
  const lines = fresh.slice(0, 40).map((r, i) => (i + 1) + '. ' + clipN_(r[2], 40) + ' - ' + clipN_(r[6] || 'General', 40) + ': ' + clipN_(r[9], 120));
  MailApp.sendEmail(TEACHER_EMAIL || Session.getEffectiveUser().getEmail(),
    fresh.length + ' new student doubt(s), ' + waiting + ' waiting in total',
    lines.join('\n') + (fresh.length > 40 ? '\n...and ' + (fresh.length - 40) + ' more' : '') + '\n\nReply in the Teacher page > Menu 4 (Student Doubts).');
}

function handleReply_(d) {
  if (d.key !== TEACHER_KEY) return { ok: false, error: 'key' };
  const id = String(d.id || ''), reply = clipN_(d.reply, 3000);
  const files = Array.isArray(d.media) ? d.media.slice(0, 3) : [];   // V129 NEW: up to 3 files per send
  if (!id || (!reply && !files.length)) return { ok: false };
  const sh = dsheet_(), rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) {
    const list = mediaList_(rows[i][13]);
    for (const f of files) {
      const mime = String(f.mime || '').split(';')[0].toLowerCase(), b64 = String(f.b64 || '');
      if (!MEDIA_OK.test(mime) || !b64 || b64.length > 9000000 || list.length >= 6) return { ok: false, error: 'media' };
      const nm = String(f.name || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
      const file = mediaFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, id + '_' + nm));
      list.push({ id: file.getId(), mime: mime, name: nm });
    }
    sh.getRange(i + 1, 11, 1, 3).setValues([['Answered', reply || String(rows[i][11] || ''), new Date()]]);
    sh.getRange(i + 1, 14).setValue(JSON.stringify(list));
    return { ok: true };
  }
  return { ok: false, error: 'notfound' };
}

// Student app -> one call per student per day
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'doubt') return out_(handleDoubt_(d));   // V128 NEW
    if (d.action === 'reply') return out_(handleReply_(d));   // V128 NEW
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return out_({ ok: false });
    const name = clip_(d.name), college = clip_(d.college);
    const now = new Date();
    const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');

    const st = sheet_('Students', ['Email', 'Name', 'College', 'First seen', 'Last seen', 'Last day', 'Days used'], ['F']);
    const data = st.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < data.length; i++) if (String(data[i][0]).toLowerCase() === email) { row = i + 1; break; }
    let newDay = true;
    if (row < 0) {
      st.appendRow([email, name, college, now, now, today, 1]);
    } else {
      const r = data[row - 1];
      newDay = dstr_(r[5]) !== today;
      st.getRange(row, 2, 1, 2).setValues([[r[1] || name, r[2] || college]]);   // V106 NEW: registered details are never overwritten
      st.getRange(row, 5, 1, 3).setValues([[now, today, newDay ? Number(r[6] || 0) + 1 : r[6]]]);
    }
    if (newDay) {
      const dl = sheet_('Daily', ['Date', 'Students'], ['A']);
      const dv = dl.getDataRange().getValues();
      let dr = -1;
      for (let i = dv.length - 1; i >= 1; i--) if (dstr_(dv[i][0]) === today) { dr = i + 1; break; }
      if (dr < 0) dl.appendRow([today, 1]); else dl.getRange(dr, 2).setValue(Number(dv[dr - 1][1]) + 1);
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false });
  } finally {
    lock.releaseLock();
  }
}

// Teacher page -> ?action=list&key=SECRET
function doGet(e) {
  const p = (e && e.parameter) || {};
  // V106 NEW: a student who is already registered restores the profile on a new phone/PC (no new row)
  if (p.action === 'lookup') {
    const em = String(p.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return out_({ ok: true, found: false });
    const rows = sheet_('Students', ['Email', 'Name', 'College', 'First seen', 'Last seen', 'Last day', 'Days used'], ['F']).getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === em) return out_({ ok: true, found: true, name: String(rows[i][1]), college: String(rows[i][2]) });
    return out_({ ok: true, found: false });
  }
  // V128 NEW: a student reads ONLY their own doubts (email + the secret stored on their device)
  if (p.action === 'mydoubts') {
    const em = String(p.email || '').trim().toLowerCase(), sec = String(p.secret || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !/^[a-f0-9]{16,64}$/.test(sec)) return out_({ ok: false });
    const rows = dsheet_().getDataRange().getValues(), mine = [];
    for (let i = 1; i < rows.length; i++) if (String(rows[i][1]).toLowerCase() === em && String(rows[i][3]) === sec) mine.push(doubtOut_(rows[i], false));
    return out_({ ok: true, doubts: mine });
  }
  // V129 NEW: a student fetches ONE attachment of THEIR OWN doubt (email + device code + the file must belong to that doubt)
  if (p.action === 'media') {
    const em = String(p.email || '').trim().toLowerCase(), sec = String(p.secret || ''), id = String(p.id || ''), fid = String(p.fid || '');
    if (!/^[a-f0-9]{16,64}$/.test(sec) || !em) return out_({ ok: false });
    const rows = dsheet_().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === id && String(rows[i][1]).toLowerCase() === em && String(rows[i][3]) === sec) {
      const m = mediaList_(rows[i][13]).filter(x => x.id === fid)[0];
      if (!m) return out_({ ok: false });
      return out_({ ok: true, mime: m.mime, b64: Utilities.base64Encode(DriveApp.getFileById(fid).getBlob().getBytes()) });
    }
    return out_({ ok: false });
  }
  // V128 NEW: teacher reads all doubts (secret key needed)
  if (p.action === 'doubts') {
    if (p.key !== TEACHER_KEY) return out_({ ok: false, error: 'key' });
    const rows = dsheet_().getDataRange().getValues().slice(1).slice(-500).map(r => doubtOut_(r, true));
    return out_({ ok: true, doubts: rows });
  }
  if (p.action !== 'list' && p.action !== 'count') return out_({ ok: true, service: 'running' });
  if (p.key !== TEACHER_KEY) return out_({ ok: false, error: 'key' });
  if (p.action === 'count') {   // V96 NEW: numbers only (fast, no student list)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st0 = sheet_('Students', ['Email', 'Name', 'College', 'First seen', 'Last seen', 'Last day', 'Days used'], ['F']);
    const dl0 = sheet_('Daily', ['Date', 'Students'], ['A']);
    const total = Math.max(0, st0.getLastRow() - 1);
    const dv = dl0.getDataRange().getValues().slice(1).map(r => ({ date: dstr_(r[0]), count: Number(r[1]) }));
    let pk = { date: '', count: 0 };
    dv.forEach(x => { if (x.count > pk.count) pk = x; });
    const td = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    const tt = dv.filter(x => x.date === td)[0];
    return out_({ ok: true, total: total, todayCount: tt ? tt.count : 0, peak: pk, sheetId: ss.getId(), sheetUrl: ss.getUrl() });
  }
  const st = sheet_('Students', ['Email', 'Name', 'College', 'First seen', 'Last seen', 'Last day', 'Days used'], ['F']);
  const dl = sheet_('Daily', ['Date', 'Students'], ['A']);
  const fmt = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : String(v);
  const students = st.getDataRange().getValues().slice(1).map(r => ({
    email: r[0], name: r[1], college: r[2], first: fmt(r[3]), last: fmt(r[4]), days: Number(r[6] || 0)
  }));
  const daily = dl.getDataRange().getValues().slice(1).map(r => ({ date: dstr_(r[0]), count: Number(r[1]) }));
  let peak = { date: '', count: 0 };
  daily.forEach(x => { if (x.count > peak.count) peak = x; });
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const t = daily.filter(x => x.date === today)[0];
  return out_({ ok: true, students, daily, today, todayCount: t ? t.count : 0, peak });
}
