import * as pdfjsLib from './libs/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.min.mjs';

// Firebase is loaded ON DEMAND (dynamic import), not as a static top-level
// import. A static import is fatal if it fails to load (offline, network
// hiccup, blocked) - it would take down the ENTIRE Teacher Upload app,
// even for teachers who never touch Media Storage. Loading it lazily,
// only when actually needed, means everything else keeps working exactly
// as before if Firebase can't be reached for any reason.
let firebaseModules = null;
async function loadFirebaseSDK(){
  if (firebaseModules) return firebaseModules;
  const [{ initializeApp }, authMod, storageMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js')
  ]);
  firebaseModules = { initializeApp, ...authMod, ...storageMod };
  return firebaseModules;
}

let firebaseApp = null;
let firebaseAuth = null;
let firebaseStorage = null;
let firebaseSignedIn = false;

let DATA = null;

const subjectSelect = document.getElementById('subjectSelect');
const subtopicSelect = document.getElementById('subtopicSelect');
const levelSelect = document.getElementById('levelSelect');
const cameraBtn = document.getElementById('cameraBtn');
const filesBtn = document.getElementById('filesBtn');
const dictateBtn = document.getElementById('dictateBtn');
const photoAsQuestionBtn = document.getElementById('photoAsQuestionBtn');
const photoAsQuestionInput = document.getElementById('photoAsQuestionInput');
const dictateBtnLabel = document.getElementById('dictateBtnLabel');
const cameraInput = document.getElementById('cameraInput');
const filesInput = document.getElementById('filesInput');
const statusLine = document.getElementById('statusLine');
const rawSection = document.getElementById('rawSection');
const rawText = document.getElementById('rawText');
const splitBtn = document.getElementById('splitBtn');
const questionsSection = document.getElementById('questionsSection');
const downloadBtn = document.getElementById('downloadBtn');
const publishBtn = document.getElementById('publishBtn');

const settingsToggle = document.getElementById('settingsToggle');
const settingsBody = document.getElementById('settingsBody');
const settingsChev = document.getElementById('settingsChev');
const connBadge = document.getElementById('connBadge');
const ghUser = document.getElementById('ghUser');
const ghRepo = document.getElementById('ghRepo');
const ghBranch = document.getElementById('ghBranch');
const ghPath = document.getElementById('ghPath');
const ghToken = document.getElementById('ghToken');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

const fbBadge = document.getElementById('fbBadge');
const fbApiKey = document.getElementById('fbApiKey');
const fbAuthDomain = document.getElementById('fbAuthDomain');
const fbProjectId = document.getElementById('fbProjectId');
const fbStorageBucket = document.getElementById('fbStorageBucket');
const fbSenderId = document.getElementById('fbSenderId');
const fbAppId = document.getElementById('fbAppId');
const fbEmail = document.getElementById('fbEmail');
const fbPassword = document.getElementById('fbPassword');
const saveFirebaseBtn = document.getElementById('saveFirebaseBtn');

const cldBadge = document.getElementById('cldBadge');
const cldCloudName = document.getElementById('cldCloudName');
const cldPreset = document.getElementById('cldPreset');
const saveCloudinaryBtn = document.getElementById('saveCloudinaryBtn');

const teacherTabSelect = document.getElementById('teacherTabSelect');
const tab1Panel = document.getElementById('tab1Panel');
const tab2Panel = document.getElementById('tab2Panel');
const tab3Panel = document.getElementById('tab3Panel');
const tab4Panel = document.getElementById('tab4Panel');
const exportBar = document.getElementById('exportBar');
const verifySummary = document.getElementById('verifySummary');
const verifyDetail = document.getElementById('verifyDetail');

let pendingTopicChanges = false; // true once a new topic is saved but not yet downloaded/published

teacherTabSelect.addEventListener('change', () => {
  const tab = teacherTabSelect.value;
  tab1Panel.classList.toggle('hidden', tab !== 'upload');
  tab2Panel.classList.toggle('hidden', tab !== 'verify');
  tab3Panel.classList.toggle('hidden', tab !== 'marks');
  tab4Panel.classList.toggle('hidden', tab !== 'doubts');
  document.getElementById('tab5Panel').classList.toggle('hidden', tab !== 'students');

  if (tab === 'verify') renderVerifyTab();
});

// Download File / Publish to GitHub is now permanently visible at the
// bottom of the screen on every Teacher Menu tab - Upload Questions,
// Verify Uploaded Data, Student Marks, Student Doubts - not conditional
// on pending changes or which tab is open. This is now a no-op kept only
// so existing call sites don't need to change.
function updateExportBarVisibility(){ saveDraft(); }

// ---------- Tab 2: Verify Uploaded Data ----------
function renderVerifyTab(){
  verifySummary.innerHTML = '';
  verifyDetail.innerHTML = '';

  let totalQuestions = 0, missingVideo = 0, missingExplanation = 0;

  DATA.subjects.forEach(subj => {
    const subjBox = document.createElement('div');
    subjBox.className = 'settings-panel';

    const subjHeader = document.createElement('div');
    subjHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;';
    const subjTitle = document.createElement('h3');
    subjTitle.style.margin = '0';
    subjTitle.textContent = subj.name;
    subjHeader.appendChild(subjTitle);

    const visLabel = document.createElement('label');
    visLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;white-space:nowrap;';
    const visCheckbox = document.createElement('input');
    visCheckbox.type = 'checkbox';
    visCheckbox.checked = subj.visible !== false; // undefined/missing = visible by default, backward compatible
    visCheckbox.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    visCheckbox.onchange = () => {
      subj.visible = visCheckbox.checked;
      pendingTopicChanges = true;
      saveDraft();
      visLabel.querySelector('span').textContent = visCheckbox.checked ? 'Visible to students' : 'Hidden from students';
      setStatus(`"${subj.name}" is now ${visCheckbox.checked ? 'visible to' : 'hidden from'} students. Use Download or Publish to make this live.`, 'ok');
    };
    const visText = document.createElement('span');
    visText.textContent = visCheckbox.checked ? 'Visible to students' : 'Hidden from students';
    visLabel.appendChild(visCheckbox);
    visLabel.appendChild(visText);
    subjHeader.appendChild(visLabel);
    subjBox.appendChild(subjHeader);

    // ---- Class Work Book Solution (Part 1 / Part 2) - subject-wide PDFs,
    // each with its own upload + on/off switch, same pattern as the
    // per-topic Concepts & Formulas PDF but scoped to the whole subject. ----
    const classworkBox = document.createElement('div');
    classworkBox.className = 'settings-panel';
    classworkBox.style.background = '#F4F6FB';
    const classworkTitle = document.createElement('h3');
    classworkTitle.style.margin = '0 0 8px 0';
    classworkTitle.textContent = '📘 Class Work Book (Questions + Solutions)';
    classworkBox.appendChild(classworkTitle);

    function buildSubjectPdfRow(partLabel, urlField, visibleField){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid #E4E9F5;';

      const partTitle = document.createElement('span');
      partTitle.style.cssText = 'font-size:13px;font-weight:700;color:var(--text);flex-basis:100%;';
      partTitle.textContent = partLabel;
      row.appendChild(partTitle);

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'btn btn-secondary';
      uploadBtn.style.fontSize = '12px';
      uploadBtn.textContent = subj[urlField] ? 'Replace PDF' : 'Upload PDF';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      fileInput.style.display = 'none';
      uploadBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 20) {
          setStatus(`That PDF is ${sizeMB.toFixed(1)} MB - please keep it under 20 MB.`, 'error');
          fileInput.value = '';
          return;
        }
        try {
          if (cloudinaryConfigured || firebaseSignedIn) {
            setStatus(`Uploading ${partLabel} to Media Storage...`);
            subj[urlField] = await uploadMedia(file, 'classwork-pdfs', file.name);
          } else {
            setStatus(`Attaching ${partLabel}...`);
            subj[urlField] = await fileToDataUrl(file);
          }
          pendingTopicChanges = true;
          updateExportBarVisibility();
          setStatus(`${partLabel} attached to "${subj.name}". Turn the switch on and Publish to make it visible to students.`, 'ok');
          renderVerifyTab();
        } catch (err) {
          setStatus(`Could not attach ${partLabel}: ` + err.message, 'error');
        }
        fileInput.value = '';
      };
      row.appendChild(uploadBtn);
      row.appendChild(fileInput);

      if (subj[urlField]) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-q';
        removeBtn.style.fontSize = '12px';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => {
          subj[urlField] = null;
          subj[visibleField] = false;
          pendingTopicChanges = true;
          updateExportBarVisibility();
          setStatus(`${partLabel} removed from "${subj.name}".`, 'ok');
          renderVerifyTab();
        };
        row.appendChild(removeBtn);

        const switchLabel = document.createElement('label');
        switchLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;white-space:nowrap;margin-left:auto;';
        const switchCheckbox = document.createElement('input');
        switchCheckbox.type = 'checkbox';
        switchCheckbox.checked = !!subj[visibleField];
        switchCheckbox.style.cssText = 'width:18px;height:18px;cursor:pointer;';
        const switchText = document.createElement('span');
        switchText.textContent = switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students';
        switchCheckbox.onchange = () => {
          subj[visibleField] = switchCheckbox.checked;
          pendingTopicChanges = true;
          updateExportBarVisibility();
          setStatus(`${partLabel} for "${subj.name}" is now ${switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students'}. Publish to make this live.`, 'ok');
          switchText.textContent = switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students';
        };
        switchLabel.appendChild(switchCheckbox);
        switchLabel.appendChild(switchText);
        row.appendChild(switchLabel);
      }
      return row;
    }

    // V92 NEW: separate Questions PDF for each part (old Solutions slots unchanged)
    classworkBox.appendChild(buildSubjectPdfRow('Part 1 - Questions', 'classworkPart1QUrl', 'classworkPart1QVisible'));
    classworkBox.appendChild(buildSubjectPdfRow('Part 1 - Solutions', 'classworkPart1Url', 'classworkPart1Visible'));
    classworkBox.appendChild(buildSubjectPdfRow('Part 2 - Questions', 'classworkPart2QUrl', 'classworkPart2QVisible'));
    classworkBox.appendChild(buildSubjectPdfRow('Part 2 - Solutions', 'classworkPart2Url', 'classworkPart2Visible'));
    subjBox.appendChild(classworkBox);

    // V95 NEW: one-tap load of the ready-made EDITABLE concepts for every topic
    const cptBox = document.createElement('div');
    cptBox.className = 'settings-panel';
    cptBox.style.background = '#F4F6FB';
    const cptTitle = document.createElement('h3');
    cptTitle.style.margin = '0 0 6px 0';
    cptTitle.textContent = '✏ Editable Concepts & Formulas';
    cptBox.appendChild(cptTitle);
    const cptHint = document.createElement('div');
    cptHint.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:8px;';
    cptHint.textContent = 'Loads the ready-made formula pages into every topic of this subject that has none yet (existing PDFs stay). Then open a topic to edit, and Publish.';
    cptBox.appendChild(cptHint);
    const cptBtn = document.createElement('button');
    cptBtn.className = 'btn btn-secondary';
    cptBtn.style.fontSize = '12px';
    cptBtn.textContent = 'Load editable concepts for all topics';
    cptBtn.onclick = async () => {
      try {
        const seed = await loadConceptsSeed();
        let n = 0;
        subj.subtopics.forEach(st => {
          if ((!st.conceptsItems || !st.conceptsItems.length) && seed[st.id]) {
            st.conceptsItems = JSON.parse(JSON.stringify(seed[st.id].items));
            st.conceptsTextVisible = !!st.conceptsPdfVisible;
            n++;
          }
        });
        pendingTopicChanges = true;
        updateExportBarVisibility();
        setStatus(n + ' topic(s) now have editable concepts. Open a topic to edit; Publish to make it live.', 'ok');
      } catch (err) {
        setStatus('Could not load data/concepts_seed.json - upload it into the data folder first.', 'error');
      }
    };
    cptBox.appendChild(cptBtn);
    subjBox.appendChild(cptBox);

    const table = document.createElement('div');
    table.style.fontSize = '13px';

    subj.subtopics.forEach(st => {
      const l1 = (st.levels['1'] || []);
      const l2 = (st.levels['2'] || []);
      const lc = (st.levels['conventional'] || []);
      const count = l1.length + l2.length + lc.length;
      totalQuestions += count;

      [...l1, ...l2, ...lc].forEach(q => {
        if (!hasVideoSource(q)) missingVideo++;
        if (!q.explanation) missingExplanation++;
      });

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #f0f2fa;cursor:pointer;';
      const flagBits = [];
      const noVideoCount = [...l1, ...l2, ...lc].filter(q => !hasVideoSource(q)).length;
      const noExplCount = [...l1, ...l2, ...lc].filter(q => !q.explanation).length;
      if (count === 0) flagBits.push('<span style="color:var(--wrong);">empty</span>');
      if (noVideoCount > 0) flagBits.push(`<span style="color:#e65100;">${noVideoCount} missing video</span>`);
      if (noExplCount > 0) flagBits.push(`<span style="color:var(--muted);">${noExplCount} missing explanation</span>`);
      row.innerHTML = `
        <span>${st.name}</span>
        <span style="text-align:right;">
          <strong>${count}</strong> Qs (L1: ${l1.length}, L2: ${l2.length}, Conv: ${lc.length})
          ${flagBits.length ? '<br><span style="font-size:11px;">' + flagBits.join(' &middot; ') + '</span>' : ''}
        </span>
      `;
      row.onclick = () => toggleSubtopicDetail(st, row, subj.name);
      table.appendChild(row);
    });

    subjBox.appendChild(table);
    verifySummary.appendChild(subjBox);
  });

  // ---- Master kill-switch: blocks every student from using the app's
  // content the moment it's toggled. This does NOT remove the installed
  // icon/PWA from any student's device - no website can do that, for any
  // app, ever (a real web security boundary, not a limitation of this
  // build). What it DOES do: the next time a student opens or refreshes
  // the app, they see a plain "temporarily unavailable" screen instead of
  // any questions, regardless of which subject/topic they try to reach. ----
  const killSwitchBox = document.createElement('div');
  killSwitchBox.className = 'settings-panel';
  killSwitchBox.style.background = DATA.studentAccessEnabled === false ? '#FBEAEA' : '#fff';
  const killLabel = document.createElement('label');
  killLabel.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;';
  const killCheckbox = document.createElement('input');
  killCheckbox.type = 'checkbox';
  killCheckbox.checked = DATA.studentAccessEnabled === false;
  killCheckbox.style.cssText = 'width:20px;height:20px;cursor:pointer;';
  killCheckbox.onchange = () => {
    // V109 NEW: ask before blocking every student
    if (killCheckbox.checked && !window.confirm('Students will NOT be able to access the app.\n\nAre you sure you want to proceed?')) {
      killCheckbox.checked = false;
      return;
    }
    DATA.studentAccessEnabled = killCheckbox.checked ? false : true;
    pendingTopicChanges = true;
    updateExportBarVisibility();
    setStatus(
      killCheckbox.checked
        ? 'Student access will be disabled once you Publish. Every student sees "temporarily unavailable" until you turn this back off.'
        : 'Student access restored - Publish to make it live again.',
      'ok'
    );
    renderVerifyTab();
  };
  const killText = document.createElement('span');
  killText.innerHTML = '<strong style="color:var(--wrong);">🔴 Disable ALL student access</strong><br><span style="font-size:12px;color:var(--muted);">Blocks every subject/question for every student until you turn this back off. Does not remove the installed app from any device - see note below.</span>';
  killLabel.appendChild(killCheckbox);
  killLabel.appendChild(killText);
  killSwitchBox.appendChild(killLabel);
  // Inserted after Overview below, then moved to the very top - see the
  // insertBefore call right after Overview is placed.

  const overview = document.createElement('div');
  overview.className = 'settings-panel';
  overview.style.background = '#eef1fb';
  const sizeBytes = new Blob([JSON.stringify(DATA)]).size;
  const sizeMB = sizeBytes / (1024 * 1024);
  const sizeColor = sizeBytes > 20000000 ? 'var(--wrong)' : (sizeBytes > 8000000 ? '#e65100' : 'var(--correct)'); // V83 NEW: limits raised (Git Data API)
  const sizeWarning = sizeBytes > 20000000
    ? '<br><span style="color:var(--wrong);font-weight:700;">⚠ Over 20 MB - Publish to GitHub will be blocked until this is smaller (remove a heavy uploaded video, or use a Link instead).</span>'
    : '';
  overview.innerHTML = `
    <h3>Overview</h3>
    <div class="hint" style="margin-bottom:0;">
      <strong>${totalQuestions}</strong> total questions across all subtopics.
      <strong>${missingVideo}</strong> missing a video link.
      <strong>${missingExplanation}</strong> missing an explanation.
      Tap any subtopic above to preview its questions.
      <br>Question bank file size: <strong style="color:${sizeColor};">${sizeMB.toFixed(2)} MB</strong>${sizeWarning}
    </div>
  `;
  if (sizeBytes > 300000) {
    const reportBtn = document.createElement('button');
    reportBtn.className = 'btn btn-secondary full-width';
    reportBtn.style.marginTop = '10px';
    reportBtn.textContent = '🔍 Show Storage Report - find the heaviest questions';
    reportBtn.onclick = () => renderStorageReport();
    overview.appendChild(reportBtn);
  }

  // ---- Full question-bank export, chapter-wise, for offline review ----
  // Covers every subject/subtopic/level in one document - teacher-only,
  // never exposed to students, for reading/verifying/marking corrections
  // away from the app.
  const exportFullRow = document.createElement('div');
  exportFullRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
  const wordBtn = document.createElement('button');
  wordBtn.className = 'btn btn-secondary';
  wordBtn.style.fontSize = '13px';
  wordBtn.textContent = '📄 Download Full Question Bank (Word)';
  wordBtn.onclick = () => downloadFullBankDocx();
  const pdfBtn = document.createElement('button');
  pdfBtn.className = 'btn btn-secondary';
  pdfBtn.style.fontSize = '13px';
  pdfBtn.textContent = '📕 Download Full Question Bank (PDF)';
  pdfBtn.onclick = () => downloadFullBankPdf();
  exportFullRow.appendChild(wordBtn);
  exportFullRow.appendChild(pdfBtn);
  overview.appendChild(exportFullRow);
  const exportFullHint = document.createElement('div');
  exportFullHint.className = 'progress-note';
  exportFullHint.style.marginTop = '6px';
  exportFullHint.textContent = 'Every subject, subtopic, and level, questions + options + correct answer + explanation, in reading order - for offline review. Teacher-only.';
  overview.appendChild(exportFullHint);

  verifySummary.insertBefore(overview, verifySummary.firstChild);
  verifySummary.insertBefore(killSwitchBox, verifySummary.firstChild); // kill switch stays the topmost element
}

// Sorts every question across every subject/subtopic by its embedded size
// (uploaded video + images), biggest first - the fastest way to find what's
// actually causing a large file, rather than checking topic-by-topic.
// Converts an already-embedded base64 data URI (from an existing question)
// into a Blob, so it can be uploaded to Firebase without needing the
// teacher to re-select the original file - the data is already right here.
function dataUriToBlob(dataUri){
  const [header, base64] = dataUri.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function renderStorageReport(){
  const rows = [];
  DATA.subjects.forEach(subj => {
    subj.subtopics.forEach(subt => {
      ['1', '2'].forEach(level => {
        (subt.levels[level] || []).forEach(q => {
          const videoSize = q.videoFile ? new Blob([q.videoFile]).size : 0;
          const qImgSize = q.questionImage ? new Blob([q.questionImage]).size : 0;
          const explImgSize = q.explanationImage ? new Blob([q.explanationImage]).size : 0;
          const total = videoSize + qImgSize + explImgSize;
          // Only count genuinely embedded media (not a short Firebase URL
          // left behind after migration) - a Firebase download link is a
          // couple hundred bytes at most, nowhere near worth flagging.
          if (total > 10240) rows.push({ subj, subt, level, q, videoSize, qImgSize, explImgSize, total });
        });
      });
    });
  });
  rows.sort((a, b) => b.total - a.total);

  verifyDetail.dataset.openFor = '__storage_report__';
  verifyDetail.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'settings-panel';
  const migrateHint = (cloudinaryConfigured || firebaseSignedIn)
    ? 'Media Storage is connected - use "Move to Media Storage" on any item below to shrink questions.json without losing the file.'
    : 'Connect Media Storage above (Publish Settings) to move these already-uploaded files there instead of just removing them.';
  header.innerHTML = `<h3>Storage Report</h3><div class="hint" style="margin-bottom:0;">${rows.length} question(s) with attached media, heaviest first. ${migrateHint}</div>`;
  verifyDetail.appendChild(header);

  if ((cloudinaryConfigured || firebaseSignedIn) && rows.length > 0) {
    const migrateAllBtn = document.createElement('button');
    migrateAllBtn.className = 'btn btn-secondary full-width';
    migrateAllBtn.style.marginBottom = '14px';
    migrateAllBtn.textContent = `📦 Move all ${rows.length} item(s) to Media Storage`;
    migrateAllBtn.onclick = async () => {
      migrateAllBtn.disabled = true;
      let done = 0;
      for (const r of rows) {
        migrateAllBtn.textContent = `Moving ${done + 1} of ${rows.length}...`;
        await migrateAllMediaForRow(r);
        done++;
      }
      pendingTopicChanges = true;
      saveDraft();
      setStatus(`Moved ${done} question(s)' media to Media Storage.`, 'ok');
      renderStorageReport();
    };
    verifyDetail.appendChild(migrateAllBtn);
  }

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'progress-note';
    empty.textContent = 'No attached media found.';
    verifyDetail.appendChild(empty);
    return;
  }

  rows.forEach(r => {
    const box = document.createElement('div');
    box.className = 'qblock';
    const mb = b => (b / (1024 * 1024)).toFixed(2);
    const parts = [];
    if (r.videoSize) parts.push(`🎬 Uploaded video: ${mb(r.videoSize)} MB`);
    if (r.qImgSize) parts.push(`🖼 Question figure: ${mb(r.qImgSize)} MB`);
    if (r.explImgSize) parts.push(`📎 Explanation image: ${mb(r.explImgSize)} MB`);
    box.innerHTML = `
      <span class="row-label">${r.subj.name} → ${r.subt.name} (Level ${r.level}) — <strong style="color:var(--wrong);">${mb(r.total)} MB</strong></span>
      <div style="font-weight:600;margin-bottom:8px;">${r.q.question.slice(0, 100)}${r.q.question.length > 100 ? '…' : ''}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">${parts.join('<br>')}</div>
    `;
    if (r.videoSize) {
      const btnRow = document.createElement('div');
      btnRow.style.marginBottom = '6px';
      if (cloudinaryConfigured || firebaseSignedIn) {
        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn btn-secondary';
        moveBtn.style.cssText = 'font-size:12px;padding:6px 10px;margin-right:8px;';
        moveBtn.textContent = '📦 Move to Media Storage';
        moveBtn.onclick = async () => {
          moveBtn.disabled = true;
          moveBtn.textContent = 'Uploading...';
          try {
            r.q.videoFile = await uploadMedia(dataUriToBlob(r.q.videoFile), 'videos', `migrated_${r.q.id || Date.now()}.webm`);
            pendingTopicChanges = true;
            saveDraft();
            setStatus('Video moved to Media Storage.', 'ok');
            renderStorageReport();
          } catch (err) {
            setStatus('Move failed: ' + err.message, 'error');
            moveBtn.disabled = false;
            moveBtn.textContent = '📦 Move to Media Storage';
          }
        };
        btnRow.appendChild(moveBtn);
      }
      const rmVideoBtn = document.createElement('button');
      rmVideoBtn.className = 'remove-q';
      rmVideoBtn.textContent = 'Remove this uploaded video (' + mb(r.videoSize) + ' MB)';
      rmVideoBtn.onclick = () => {
        r.q.videoFile = null;
        pendingTopicChanges = true;
        saveDraft();
        renderStorageReport();
        setStatus('Removed uploaded video. Consider pasting a YouTube/Drive link instead - it barely adds any size.', 'ok');
      };
      btnRow.appendChild(rmVideoBtn);
      box.appendChild(btnRow);
    }
    if (r.qImgSize) {
      const btnRow2 = document.createElement('div');
      btnRow2.style.marginBottom = '6px';
      if (cloudinaryConfigured || firebaseSignedIn) {
        const moveImgBtn = document.createElement('button');
        moveImgBtn.className = 'btn btn-secondary';
        moveImgBtn.style.cssText = 'font-size:12px;padding:6px 10px;margin-right:8px;';
        moveImgBtn.textContent = '📦 Move to Media Storage';
        moveImgBtn.onclick = async () => {
          moveImgBtn.disabled = true;
          moveImgBtn.textContent = 'Uploading...';
          try {
            r.q.questionImage = await uploadMedia(dataUriToBlob(r.q.questionImage), 'question-figures', `migrated_${r.q.id || Date.now()}.jpg`);
            pendingTopicChanges = true;
            saveDraft();
            setStatus('Figure moved to Media Storage.', 'ok');
            renderStorageReport();
          } catch (err) {
            setStatus('Move failed: ' + err.message, 'error');
            moveImgBtn.disabled = false;
            moveImgBtn.textContent = '📦 Move to Media Storage';
          }
        };
        btnRow2.appendChild(moveImgBtn);
      }
      const rmImgBtn = document.createElement('button');
      rmImgBtn.className = 'remove-q';
      rmImgBtn.textContent = 'Remove question figure (' + mb(r.qImgSize) + ' MB)';
      rmImgBtn.onclick = () => {
        r.q.questionImage = null;
        pendingTopicChanges = true;
        saveDraft();
        renderStorageReport();
      };
      btnRow2.appendChild(rmImgBtn);
      box.appendChild(btnRow2);
    }
    if (r.explImgSize) {
      const btnRow3 = document.createElement('div');
      if (cloudinaryConfigured || firebaseSignedIn) {
        const moveExplBtn = document.createElement('button');
        moveExplBtn.className = 'btn btn-secondary';
        moveExplBtn.style.cssText = 'font-size:12px;padding:6px 10px;margin-right:8px;';
        moveExplBtn.textContent = '📦 Move to Media Storage';
        moveExplBtn.onclick = async () => {
          moveExplBtn.disabled = true;
          moveExplBtn.textContent = 'Uploading...';
          try {
            r.q.explanationImage = await uploadMedia(dataUriToBlob(r.q.explanationImage), 'explanation-images', `migrated_${r.q.id || Date.now()}.jpg`);
            pendingTopicChanges = true;
            saveDraft();
            setStatus('Explanation image moved to Media Storage.', 'ok');
            renderStorageReport();
          } catch (err) {
            setStatus('Move failed: ' + err.message, 'error');
            moveExplBtn.disabled = false;
            moveExplBtn.textContent = '📦 Move to Media Storage';
          }
        };
        btnRow3.appendChild(moveExplBtn);
      }
      const rmExplBtn = document.createElement('button');
      rmExplBtn.className = 'remove-q';
      rmExplBtn.textContent = 'Remove explanation image (' + mb(r.explImgSize) + ' MB)';
      rmExplBtn.onclick = () => {
        r.q.explanationImage = null;
        pendingTopicChanges = true;
        saveDraft();
        renderStorageReport();
      };
      btnRow3.appendChild(rmExplBtn);
      box.appendChild(btnRow3);
    }
    verifyDetail.appendChild(box);
  });
}

// Used by the "Move all" bulk button - migrates every media field present
// on a single row's question, one at a time.
async function migrateAllMediaForRow(r){
  try {
    if (r.videoSize) {
      r.q.videoFile = await uploadMedia(dataUriToBlob(r.q.videoFile), 'videos', `migrated_${r.q.id || Date.now()}.webm`);
    }
    if (r.qImgSize) {
      r.q.questionImage = await uploadMedia(dataUriToBlob(r.q.questionImage), 'question-figures', `migrated_${r.q.id || Date.now()}.jpg`);
    }
    if (r.explImgSize) {
      r.q.explanationImage = await uploadMedia(dataUriToBlob(r.q.explanationImage), 'explanation-images', `migrated_${r.q.id || Date.now()}.jpg`);
    }
  } catch (err) {
    console.error('Migration failed for a question:', err);
  }
}


function toggleSubtopicDetail(subtopic, rowEl, subjectName){
  if (verifyDetail.dataset.openFor === subtopic.id) {
    verifyDetail.innerHTML = '';
    verifyDetail.dataset.openFor = '';
    return;
  }
  verifyDetail.dataset.openFor = subtopic.id;
  renderSubtopicDetailContents(subtopic, subjectName);
}
function renderSubtopicDetailContents(subtopic, subjectName){
  verifyDetail.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'progress-note';
  intro.style.marginBottom = '10px';
  intro.textContent = 'Edit any question below directly - your changes save to this page immediately. Look for the Download / Publish to GitHub bar at the very bottom of the screen to make edits live for students.';
  verifyDetail.appendChild(intro);

  // ---- Concepts & Formulas PDF for THIS topic (Quick Revision) ----
  // One PDF per subtopic, with its own on/off switch. Only visible and
  // downloadable by students for this specific topic when the switch is
  // on - the switch, not just having a file attached, controls whether
  // students see it at all.
  const pdfBox = document.createElement('div');
  pdfBox.className = 'settings-panel';
  pdfBox.style.background = '#F4F6FB';
  const pdfTitle = document.createElement('h3');
  pdfTitle.style.margin = '0 0 6px 0';
  pdfTitle.textContent = '📄 Concepts & Formulas (Quick Revision)';
  pdfBox.appendChild(pdfTitle);

  const pdfStatusLine = document.createElement('div');
  pdfStatusLine.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:8px;';
  pdfStatusLine.textContent = subtopic.conceptsPdfUrl
    ? 'A PDF is attached for this topic.'
    : 'No PDF attached yet for this topic.';
  pdfBox.appendChild(pdfStatusLine);

  const pdfControlsRow = document.createElement('div');
  pdfControlsRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

  const pdfUploadBtn = document.createElement('button');
  pdfUploadBtn.className = 'btn btn-secondary';
  pdfUploadBtn.style.fontSize = '12px';
  pdfUploadBtn.textContent = subtopic.conceptsPdfUrl ? 'Replace PDF' : 'Upload PDF';
  const pdfInput = document.createElement('input');
  pdfInput.type = 'file';
  pdfInput.accept = '.pdf';
  pdfInput.style.display = 'none';
  pdfUploadBtn.onclick = () => pdfInput.click();
  pdfInput.onchange = async () => {
    const file = pdfInput.files[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 20) {
      setStatus(`That PDF is ${sizeMB.toFixed(1)} MB - please keep the revision sheet under 20 MB.`, 'error');
      pdfInput.value = '';
      return;
    }
    try {
      if (cloudinaryConfigured || firebaseSignedIn) {
        setStatus('Uploading Concepts & Formulas PDF to Media Storage...');
        subtopic.conceptsPdfUrl = await uploadMedia(file, 'concepts-pdfs', file.name);
      } else {
        setStatus('Attaching Concepts & Formulas PDF...');
        subtopic.conceptsPdfUrl = await fileToDataUrl(file);
      }
      pendingTopicChanges = true;
      updateExportBarVisibility();
      setStatus(`Concepts & Formulas PDF attached to "${subtopic.name}". Turn the switch on and Publish to make it visible to students.`, 'ok');
      verifyDetail.dataset.openFor = subtopic.id;
      renderSubtopicDetailContents(subtopic, subjectName);
    } catch (err) {
      setStatus('Could not attach PDF: ' + err.message, 'error');
    }
    pdfInput.value = '';
  };
  pdfControlsRow.appendChild(pdfUploadBtn);
  pdfControlsRow.appendChild(pdfInput);

  if (subtopic.conceptsPdfUrl) {
    const pdfRemoveBtn = document.createElement('button');
    pdfRemoveBtn.className = 'remove-q';
    pdfRemoveBtn.style.fontSize = '12px';
    pdfRemoveBtn.textContent = 'Remove';
    pdfRemoveBtn.onclick = () => {
      subtopic.conceptsPdfUrl = null;
      subtopic.conceptsPdfVisible = false;
      pendingTopicChanges = true;
      updateExportBarVisibility();
      setStatus(`Concepts & Formulas PDF removed from "${subtopic.name}".`, 'ok');
      verifyDetail.dataset.openFor = subtopic.id;
      renderSubtopicDetailContents(subtopic, subjectName);
    };
    pdfControlsRow.appendChild(pdfRemoveBtn);

    // The on/off switch - this, not just having a file attached, is what
    // actually controls student visibility for this one topic's PDF.
    const switchLabel = document.createElement('label');
    switchLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;white-space:nowrap;margin-left:auto;';
    const switchCheckbox = document.createElement('input');
    switchCheckbox.type = 'checkbox';
    switchCheckbox.checked = !!subtopic.conceptsPdfVisible;
    switchCheckbox.style.cssText = 'width:18px;height:18px;cursor:pointer;';
    switchCheckbox.onchange = () => {
      subtopic.conceptsPdfVisible = switchCheckbox.checked;
      pendingTopicChanges = true;
      updateExportBarVisibility();
      setStatus(`Concepts & Formulas PDF for "${subtopic.name}" is now ${switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students'}. Publish to make this live.`, 'ok');
      switchText.textContent = switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students';
    };
    const switchText = document.createElement('span');
    switchText.textContent = switchCheckbox.checked ? 'ON - visible to students' : 'OFF - hidden from students';
    switchLabel.appendChild(switchCheckbox);
    switchLabel.appendChild(switchText);
    pdfControlsRow.appendChild(switchLabel);
  }
  pdfBox.appendChild(pdfControlsRow);
  verifyDetail.appendChild(pdfBox);
  verifyDetail.appendChild(buildConceptsTextBox(subtopic));

  // ---- Teacher-only exports for this topic ----
  const exportRow = document.createElement('div');
  exportRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;';
  const pptBtn = document.createElement('button');
  pptBtn.className = 'btn btn-secondary';
  pptBtn.style.fontSize = '13px';
  pptBtn.textContent = '📊 Download PPT (Q + Answers)';
  pptBtn.onclick = () => downloadTopicPPTX(subtopic, subjectName || '');
  const vidBtn = document.createElement('button');
  vidBtn.className = 'btn btn-secondary';
  vidBtn.style.fontSize = '13px';
  vidBtn.textContent = '🎬 Download Video Link List (CSV)';
  vidBtn.onclick = () => downloadVideoListCSV(subtopic, subjectName || '');
  exportRow.appendChild(pptBtn);
  exportRow.appendChild(vidBtn);
  verifyDetail.appendChild(exportRow);
  const exportHint = document.createElement('div');
  exportHint.className = 'progress-note';
  exportHint.style.marginBottom = '14px';
  exportHint.textContent = 'Both exports cover this topic only, both levels. Teacher-only - not visible or available to students.';
  verifyDetail.appendChild(exportHint);

  const savedIndicator = document.createElement('div');
  savedIndicator.style.cssText = 'display:none;background:#fff3e0;color:#e65100;font-weight:700;font-size:13px;padding:10px 14px;border-radius:8px;margin-bottom:12px;';
  savedIndicator.textContent = '✓ Changes ready - Download or Publish to GitHub at the bottom of the screen to make them live.';
  verifyDetail.appendChild(savedIndicator);

  ['1','2','conventional'].forEach(level => {
    const qs = subtopic.levels[level] || [];
    const isConventional = level === 'conventional';
    qs.forEach((q, i) => {
      const levelLabel = isConventional ? 'Conventional' : `Level ${level}`;
      const card = buildQuestionCard(q, {
        label: `${levelLabel}, Question ${i + 1} (editing existing content)`,
        removeLabel: 'Delete this question permanently',
        forceConventional: isConventional,
        onRemove: () => {
          if (!window.confirm('Delete this question permanently? This can\'t be undone once published.')) return;
          subtopic.levels[level].splice(i, 1);
          pendingTopicChanges = true;
          updateExportBarVisibility();
          renderVerifyTab(); // refresh the counts above (this also clears verifyDetail)
          verifyDetail.dataset.openFor = subtopic.id;
          renderSubtopicDetailContents(subtopic, subjectName); // rebuild the now-updated list, keeping it open
        },
        onChange: () => { pendingTopicChanges = true; updateExportBarVisibility(); savedIndicator.style.display = 'block'; }
      });

      // Move this question between Level 1 and Level 2 - useful when a
      // question turns out easier/harder than where it was first placed.
      // Not offered for Conventional questions, since moving into an MCQ
      // level would need a type change too, not just a level change.
      if (!isConventional) {
        const otherLevel = level === '1' ? '2' : '1';
        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn btn-secondary';
        moveBtn.style.cssText = 'font-size:13px;margin-top:6px;width:100%;';
        moveBtn.textContent = `↕ Move this question to Level ${otherLevel}`;
        moveBtn.onclick = () => {
          const idx = subtopic.levels[level].indexOf(q);
          if (idx === -1) return;
          subtopic.levels[level].splice(idx, 1);
          if (!subtopic.levels[otherLevel]) subtopic.levels[otherLevel] = [];
          subtopic.levels[otherLevel].push(q);
          pendingTopicChanges = true;
          updateExportBarVisibility();
          setStatus(`Moved to Level ${otherLevel}. Use Download or Publish to make this live.`, 'ok');
          renderVerifyTab();
          verifyDetail.dataset.openFor = subtopic.id;
          renderSubtopicDetailContents(subtopic, subjectName);
        };
        card.appendChild(moveBtn);
      }

      // V101 NEW: change this question's position (it moves together with its answer / explanation),
      // or move it to another chapter (same level).
      const posRow = document.createElement('div');
      posRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #d6dbe8;';
      const arr = subtopic.levels[level];
      const reload = () => {
        pendingTopicChanges = true; updateExportBarVisibility();
        renderVerifyTab(); verifyDetail.dataset.openFor = subtopic.id;
        renderSubtopicDetailContents(subtopic, subjectName);
      };
      const moveWithin = to => {
        const from = arr.indexOf(q);
        if (from < 0 || to < 0 || to >= arr.length || to === from) return;
        arr.splice(from, 1); arr.splice(to, 0, q);
        setStatus('Question moved to position ' + (to + 1) + '. Publish to GitHub to make it live.', 'ok');
        reload();
      };
      const pcss = 'border:1px solid #d6dbe8;background:#fff;border-radius:8px;padding:6px 10px;font-size:14px;';
      const lbl = document.createElement('span'); lbl.textContent = 'Position ' + (i + 1) + ' of ' + qs.length; lbl.style.cssText = 'font-size:12px;font-weight:700;flex:1;min-width:110px;';
      const upB = document.createElement('button'); upB.textContent = '▲'; upB.style.cssText = pcss; upB.disabled = i === 0; upB.onclick = () => moveWithin(i - 1);
      const dnB = document.createElement('button'); dnB.textContent = '▼'; dnB.style.cssText = pcss; dnB.disabled = i === qs.length - 1; dnB.onclick = () => moveWithin(i + 1);
      const toSel = document.createElement('select'); toSel.style.cssText = 'width:70px;padding:6px;font-size:13px;';
      toSel.innerHTML = '<option value="">to #</option>' + qs.map((_, k) => '<option value="' + k + '">' + (k + 1) + '</option>').join('');
      toSel.onchange = () => { if (toSel.value !== '') moveWithin(Number(toSel.value)); };
      posRow.append(lbl, upB, dnB, toSel);
      const chRow = document.createElement('div');
      chRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
      const chSel = document.createElement('select'); chSel.style.cssText = 'flex:1;min-width:0;padding:6px;font-size:13px;';
      chSel.innerHTML = '<option value="">Move to another chapter...</option>' + DATA.subjects.map(sj => sj.subtopics.filter(t => t !== subtopic).map(t => '<option value="' + sj.id + '|' + t.id + '">' + (sj.name + ' › ' + t.name).replace(/</g, '&lt;') + '</option>').join('')).join('');
      const chBtn = document.createElement('button'); chBtn.textContent = 'Move'; chBtn.style.cssText = pcss;
      chBtn.onclick = () => {
        if (!chSel.value) return;
        const [sid, tid] = chSel.value.split('|');
        const tgt = DATA.subjects.find(s => s.id === sid).subtopics.find(t => t.id === tid);
        const from = arr.indexOf(q); if (from < 0) return;
        if (!window.confirm('Move this question (with its answer) to "' + tgt.name + '" (' + levelLabel + ')?')) return;
        arr.splice(from, 1);
        if (!tgt.levels) tgt.levels = {};
        if (!tgt.levels[level]) tgt.levels[level] = [];
        tgt.levels[level].push(q);
        setStatus('Moved to "' + tgt.name + '". Publish to GitHub to make it live.', 'ok');
        reload();
      };
      chRow.append(chSel, chBtn);
      card.appendChild(posRow); card.appendChild(chRow);

      verifyDetail.appendChild(card);
    });
  });
  if (qsEmpty(subtopic)) {
    const emptyNote = document.createElement('div');
    emptyNote.className = 'progress-note';
    emptyNote.textContent = 'No questions in this subtopic yet.';
    verifyDetail.appendChild(emptyNote);
  }
}
function qsEmpty(subtopic){
  return (subtopic.levels['1'] || []).length === 0 && (subtopic.levels['2'] || []).length === 0 && (subtopic.levels['conventional'] || []).length === 0;
}

// ---------- Full question-bank export (Word + PDF), chapter-wise ----------
// Both libraries (docx, jsPDF) are loaded on demand, only when the teacher
// actually taps one of these buttons - keeps the app's normal load light
// for everyone who never uses this feature.
function loadScriptOnce(src){
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

// Converts a question/explanation image (either a local data: URI or a
// remote Firebase/Cloudinary URL) into a data URI ready to embed in a
// document. Remote URLs are fetched and converted; failures return null
// rather than breaking the whole export.
// Converts a question/explanation image (either a local data: URI or a
// remote Firebase/Cloudinary URL) into a data URI ready to embed in a
// document. Remote URLs are fetched and converted; failures return null
// rather than breaking the whole export. A 10-second timeout is critical
// here - without one, a single slow or unreachable image would freeze
// the ENTIRE export forever with no error and no completion message,
// since this runs in a sequential loop over every question's images.
async function imageToDataUriSafe(url){
  if (!url) return null;
  try {
    if (url.startsWith('data:')) return url;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Could not fetch image for export (skipped, export continues):', err);
    return null;
  }
}

function dataUriToUint8Array(dataUri){
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageFormatFromDataUri(dataUri){
  const match = dataUri.match(/^data:image\/(\w+);/);
  if (!match) return 'JPEG';
  const ext = match[1].toLowerCase();
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WEBP';
  return 'JPEG';
}

// docx's ImageRun requires an explicit type ("jpg"/"png"/"gif"/"bmp") -
// without it, the embedded image gets a bare/undefined extension inside
// the file and won't display correctly. Anything not in that exact list
// (e.g. webp) is treated as jpg, which most viewers still render fine
// since it's really about the container extension docx writes, not a
// strict re-encode.
function docxImageType(dataUri){
  const match = dataUri.match(/^data:image\/(\w+);/);
  const ext = match ? match[1].toLowerCase() : '';
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return 'jpg';
}

// Builds one flat, ordered list covering every subject/subtopic/level/
// question in the whole question bank - the same structure both the
// Word and PDF generators consume, so the reading order is identical
// either way. Images are pre-fetched here so neither generator has to
// deal with the async fetching itself.
async function buildFullExportBlocks(onProgress){
  const blocks = [];
  let imgCount = 0, imgDone = 0;
  for (const subj of DATA.subjects) {
    for (const subt of subj.subtopics) {
      for (const lvl of ['1', '2', 'conventional']) {
        for (const q of (subt.levels[lvl] || [])) {
          if (q.questionImage) imgCount++;
          if (q.explanationImage) imgCount++;
        }
      }
    }
  }
  if (onProgress) onProgress(0, imgCount); // report the total immediately, before fetching starts, so there's visible feedback even before the first image finishes (or times out)

  for (const subj of DATA.subjects) {
    blocks.push({ type: 'subject', text: subj.name });
    for (const subt of subj.subtopics) {
      const l1 = subt.levels['1'] || [];
      const l2 = subt.levels['2'] || [];
      const lc = subt.levels['conventional'] || [];
      if (l1.length + l2.length + lc.length === 0) continue; // skip empty subtopics
      blocks.push({ type: 'subtopic', text: subt.name });
      for (const lvl of ['1', '2', 'conventional']) {
        const qs = subt.levels[lvl] || [];
        if (!qs.length) continue;
        blocks.push({ type: 'level', text: lvl === 'conventional' ? 'Conventional (Long Answer)' : `Level ${lvl}` });
        let qNum = 1;
        for (const q of qs) {
          let qImg = null, explImg = null, qImgFailed = false, explImgFailed = false;
          if (q.questionImage) {
            qImg = await imageToDataUriSafe(q.questionImage);
            if (!qImg) qImgFailed = true; // an image was attached but couldn't be fetched in time
            imgDone++; if (onProgress) onProgress(imgDone, imgCount);
          }
          if (q.explanationImage) {
            explImg = await imageToDataUriSafe(q.explanationImage);
            if (!explImg) explImgFailed = true;
            imgDone++; if (onProgress) onProgress(imgDone, imgCount);
          }
          blocks.push({
            type: 'question',
            number: qNum++,
            question: q.question || '(see attached figure)',
            questionImage: qImg,
            questionImageFailed: qImgFailed,
            isConventional: q.type === 'conventional',
            isMcq: (q.type || 'mcq') !== 'fill',
            options: q.options || [],
            correctIndex: q.correctIndex,
            correctAnswer: q.correctAnswer || '',
            explanation: q.explanation || '',
            explanationImage: explImg,
            explanationImageFailed: explImgFailed
          });
        }
      }
    }
  }
  return blocks;
}

async function downloadFullBankDocx(){
  setStatus('Preparing Word document - loading tools...');
  try {
    await loadScriptOnce('libs/docx/docx.iife.js');
    if (!window.docx || !window.docx.Document) {
      throw new Error('The docx library loaded but did not set up correctly. This usually means libs/docx/docx.iife.js is missing, corrupted, or at the wrong path in your GitHub repo - check that file exists exactly at that path.');
    }
    const blocks = await buildFullExportBlocks((done, total) => {
      if (total > 0) setStatus(`Preparing Word document - fetching images (${done}/${total}). A slow or unreachable image waits at most 10s before being skipped, so this always finishes.`);
    });
    setStatus('Preparing Word document - assembling pages...');

    const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } = window.docx;
    const children = [];
    for (const b of blocks) {
      if (b.type === 'subject') {
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 100 } }));
      } else if (b.type === 'subtopic') {
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));
      } else if (b.type === 'level') {
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 60 } }));
      } else if (b.type === 'question') {
        children.push(new Paragraph({
          children: [new TextRun({ text: `Q${b.number}. ${b.question}`, bold: true })],
          spacing: { before: 200 }
        }));
        if (b.questionImage) {
          try {
            children.push(new Paragraph({
              children: [new ImageRun({ data: dataUriToUint8Array(b.questionImage), type: docxImageType(b.questionImage), transformation: { width: 380, height: 240 } })],
              spacing: { before: 60, after: 60 }
            }));
          } catch { children.push(new Paragraph({ text: '[Figure could not be embedded - view in app]', italics: true })); }
        } else if (b.questionImageFailed) {
          children.push(new Paragraph({ text: '[Figure could not be fetched in time - view in app]', italics: true }));
        }
        if (b.isConventional) {
          // No options/correct-answer for a long-answer question - the
          // Explanation block right below IS the full model answer.
        } else if (b.isMcq) {
          const letters = ['A', 'B', 'C', 'D'];
          b.options.forEach((opt, idx) => {
            const isCorrect = idx === b.correctIndex;
            children.push(new Paragraph({
              children: [new TextRun({ text: `${letters[idx]}) ${opt}${isCorrect ? '   ✓ CORRECT' : ''}`, bold: isCorrect, color: isCorrect ? '2F9E52' : undefined })]
            }));
          });
        } else {
          children.push(new Paragraph({ children: [new TextRun({ text: `Correct Answer: ${b.correctAnswer}`, bold: true, color: '2F9E52' })] }));
        }
        if (b.explanation) {
          children.push(new Paragraph({ children: [new TextRun({ text: (b.isConventional ? 'Model Answer: ' : 'Explanation: ') + b.explanation })], spacing: { before: 60 } }));
        }
        if (b.explanationImage) {
          try {
            children.push(new Paragraph({
              children: [new ImageRun({ data: dataUriToUint8Array(b.explanationImage), type: docxImageType(b.explanationImage), transformation: { width: 380, height: 240 } })],
              spacing: { before: 60, after: 60 }
            }));
          } catch { children.push(new Paragraph({ text: '[Explanation image could not be embedded - view in app]', italics: true })); }
        } else if (b.explanationImageFailed) {
          children.push(new Paragraph({ text: '[Explanation image could not be fetched in time - view in app]', italics: true }));
        }
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EEE_Practice_Full_Question_Bank.docx';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Word document downloaded - every subject, subtopic, and level, in order.', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Could not generate Word document: ' + err.message, 'error');
  }
}

async function downloadFullBankPdf(){
  setStatus('Preparing PDF - loading tools...');
  try {
    await loadScriptOnce('libs/jspdf/jspdf.umd.min.js');
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('The jsPDF library loaded but did not set up correctly. This usually means libs/jspdf/jspdf.umd.min.js is missing, corrupted, or at the wrong path in your GitHub repo - check that file exists exactly at that path.');
    }
    const blocks = await buildFullExportBlocks((done, total) => {
      if (total > 0) setStatus(`Preparing PDF - fetching images (${done}/${total}). A slow or unreachable image waits at most 10s before being skipped, so this always finishes.`);
    });
    setStatus('Preparing PDF - laying out pages...');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    function ensureSpace(neededHeight){
      if (y + neededHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }
    function addText(text, size, style, color){
      doc.setFontSize(size);
      doc.setFont(undefined, style || 'normal');
      doc.setTextColor(...(color || [0, 0, 0]));
      const lines = doc.splitTextToSize(text, maxWidth);
      lines.forEach(line => {
        ensureSpace(size * 1.4);
        doc.text(line, margin, y);
        y += size * 1.4;
      });
    }
    function addImage(dataUri){
      try {
        const props = doc.getImageProperties(dataUri);
        const imgWidth = Math.min(maxWidth, 300);
        const imgHeight = (props.height / props.width) * imgWidth;
        ensureSpace(imgHeight + 10);
        doc.addImage(dataUri, imageFormatFromDataUri(dataUri), margin, y, imgWidth, imgHeight);
        y += imgHeight + 10;
      } catch {
        addText('[Image could not be embedded - view in app]', 10, 'italic', [150, 150, 150]);
      }
    }

    for (const b of blocks) {
      if (b.type === 'subject') { y += 10; addText(b.text, 18, 'bold'); y += 6; }
      else if (b.type === 'subtopic') { addText(b.text, 15, 'bold'); y += 4; }
      else if (b.type === 'level') { addText(b.text, 12, 'bold'); y += 2; }
      else if (b.type === 'question') {
        y += 6;
        addText(`Q${b.number}. ${b.question}`, 11, 'bold');
        if (b.questionImage) addImage(b.questionImage);
        else if (b.questionImageFailed) addText('[Figure could not be fetched in time - view in app]', 10, 'italic', [150, 150, 150]);
        if (b.isConventional) {
          // No options/correct-answer for a long-answer question.
        } else if (b.isMcq) {
          const letters = ['A', 'B', 'C', 'D'];
          b.options.forEach((opt, idx) => {
            const isCorrect = idx === b.correctIndex;
            addText(`${letters[idx]}) ${opt}${isCorrect ? '  [CORRECT]' : ''}`, 10, isCorrect ? 'bold' : 'normal', isCorrect ? [47, 158, 82] : [0, 0, 0]);
          });
        } else {
          addText(`Correct Answer: ${b.correctAnswer}`, 10, 'bold', [47, 158, 82]);
        }
        if (b.explanation) addText((b.isConventional ? 'Model Answer: ' : 'Explanation: ') + b.explanation, 10, 'normal');
        if (b.explanationImage) addImage(b.explanationImage);
        else if (b.explanationImageFailed) addText('[Explanation image could not be fetched in time - view in app]', 10, 'italic', [150, 150, 150]);
      }
    }

    doc.save('EEE_Practice_Full_Question_Bank.pdf');
    setStatus('PDF downloaded - every subject, subtopic, and level, in order.', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('Could not generate PDF: ' + err.message, 'error');
  }
}

// ---------- Teacher-only exports: PPT (questions + answers) and video link CSV ----------
// Both cover one topic (subtopic) at a time, both levels combined, and are
// reachable only from inside Teacher Upload - never exposed to students.

function safeFileName(s){
  return (s || 'export').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
function hasVideoSource(q){
  return !!(q.videoFile || (q.videoUrl && q.videoUrl !== 'PASTE_VIDEO_LINK_HERE'));
}

function downloadTopicPPTX(subtopic, subjectName){
  if (typeof PptxGenJS === 'undefined') {
    setStatus('PPT library did not load - try refreshing the page.', 'error');
    return;
  }
  const allQs = [...(subtopic.levels['1'] || []).map(q => ({ ...q, level: 1 })),
                 ...(subtopic.levels['2'] || []).map(q => ({ ...q, level: 2 }))];
  if (allQs.length === 0) {
    setStatus('No questions in this topic yet - nothing to export.', 'error');
    return;
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'A4', width: 10, height: 7.5 });
  pptx.layout = 'A4';

  const title = pptx.addSlide();
  title.background = { color: '16274A' };
  title.addText(subtopic.name, { x: 0.5, y: 2.6, w: 9, h: 1, fontSize: 28, bold: true, color: 'FFFFFF', align: 'center' });
  title.addText(subjectName, { x: 0.5, y: 3.5, w: 9, h: 0.6, fontSize: 16, color: 'E8A33D', align: 'center' });
  title.addText(`${allQs.length} question(s) - with answers, for teacher reference`, { x: 0.5, y: 4.2, w: 9, h: 0.5, fontSize: 12, color: 'C7D2E0', align: 'center' });

  const letters = ['A','B','C','D'];
  allQs.forEach((q, i) => {
    const slide = pptx.addSlide();
    slide.addText(`Q${i + 1}  (Level ${q.level})`, { x: 0.4, y: 0.25, w: 9, h: 0.4, fontSize: 13, bold: true, color: '16274A' });
    slide.addText(q.question, { x: 0.4, y: 0.65, w: 9.2, h: 1.3, fontSize: 16, color: '16213A', wrap: true });

    let y = 2.1;
    if (q.questionImage) {
      try {
        slide.addImage({ data: q.questionImage, x: 0.4, y, w: 3.2, h: 2.2, sizing: { type: 'contain', w: 3.2, h: 2.2 } });
      } catch (e) { /* skip image if it fails to embed */ }
    }
    const textX = q.questionImage ? 3.9 : 0.4;
    const textW = q.questionImage ? 5.7 : 9.2;

    if (q.type === 'fill') {
      slide.addText('Correct Answer: ' + (q.correctAnswer || ''), {
        x: textX, y, w: textW, h: 0.5, fontSize: 15, bold: true, color: '2F9E52'
      });
      y += 0.6;
    } else {
      (q.options || []).forEach((opt, idx) => {
        const isCorrect = idx === q.correctIndex;
        slide.addText(`${letters[idx]}. ${opt}`, {
          x: textX, y, w: textW, h: 0.4, fontSize: 14,
          color: isCorrect ? '2F9E52' : '16213A', bold: isCorrect
        });
        y += 0.42;
      });
    }

    if (q.explanation) {
      slide.addText('Explanation: ' + q.explanation.replace(/\$/g, ''), {
        x: 0.4, y: Math.max(y, 4.6), w: 9.2, h: 1.6, fontSize: 11, color: '64748B', wrap: true
      });
    }
    if (q.videoUrl && q.videoUrl !== 'PASTE_VIDEO_LINK_HERE') {
      slide.addText('Video: ' + q.videoUrl, { x: 0.4, y: 6.9, w: 9.2, h: 0.4, fontSize: 10, color: 'C97A2B' });
    } else if (q.videoFile) {
      slide.addText('Video: uploaded clip (not shown in PPT - open the app to view)', { x: 0.4, y: 6.9, w: 9.2, h: 0.4, fontSize: 10, color: 'C97A2B' });
    }
  });

  pptx.writeFile({ fileName: `${safeFileName(subtopic.name)}_questions_with_answers.pptx` });
  setStatus(`PPT downloaded: ${allQs.length} question(s) from "${subtopic.name}".`, 'ok');
}

function downloadVideoListCSV(subtopic, subjectName){
  const allQs = [...(subtopic.levels['1'] || []).map(q => ({ ...q, level: 1 })),
                 ...(subtopic.levels['2'] || []).map(q => ({ ...q, level: 2 }))];
  if (allQs.length === 0) {
    setStatus('No questions in this topic yet - nothing to export.', 'error');
    return;
  }
  const esc = s => '"' + String(s || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  const rows = [['#', 'Level', 'Question', 'Correct Answer', 'Video Link', 'Uploaded Video File', 'Visible to Students', 'Has Explanation', 'Has Question Figure']];
  allQs.forEach((q, i) => {
    const correct = q.type === 'fill' ? q.correctAnswer : (q.options || [])[q.correctIndex] || '';
    const hasVideoLink = q.videoUrl && q.videoUrl !== 'PASTE_VIDEO_LINK_HERE' ? q.videoUrl : '(none)';
    rows.push([
      i + 1, q.level, q.question, correct, hasVideoLink,
      q.videoFile ? 'Yes' : 'No',
      q.videoReady ? 'Yes' : 'No - text solution only',
      q.explanation ? 'Yes' : 'No',
      q.questionImage ? 'Yes' : 'No'
    ]);
  });
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(subtopic.name)}_video_links.csv`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Video link list downloaded: ${allQs.length} question(s) from "${subtopic.name}". Open in Excel/Sheets to review and update.`, 'ok');
}

let parsedQuestions = [];
let accumulatedText = '';
let pendingSourceImages = []; // {dataUrl, name} for every photo taken/chosen this session

// ---------- Safety-net draft (protects against a failed Publish, an
// accidental reload, or closing the tab before saving) ----------
const DRAFT_KEY = 'eeeTeacherDraft';
let draftSaveTimer = null;

function saveDraft(){
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      const draft = {
        data: DATA,
        parsedQuestions,
        accumulatedText,
        subject: subjectSelect.value,
        subtopic: subtopicSelect.value,
        level: levelSelect.value,
        ts: Date.now()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      // localStorage can fail if a large video pushes the draft over the
      // browser's quota (~5-10 MB) - not fatal, just means no local backup
      // for this particular session; Download/Publish still work normally.
    }
  }, 400); // debounced so rapid typing doesn't hammer localStorage
}

function clearDraft(){
  clearTimeout(draftSaveTimer);
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function offerDraftRestore(){
  let draft;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    draft = JSON.parse(raw);
  } catch (e) { return; }
  if (!draft || (!draft.parsedQuestions?.length && !draft.accumulatedText)) return;

  const when = new Date(draft.ts).toLocaleString();
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#fff3e0;border:2px solid #e65100;border-radius:10px;padding:14px;margin-bottom:14px;';
  banner.innerHTML = `
    <div style="font-weight:700;color:#e65100;margin-bottom:6px;">Unsaved work found from ${when}</div>
    <div style="font-size:13px;color:var(--text);margin-bottom:10px;">
      This looks like work that wasn't successfully published or downloaded last time
      (${draft.parsedQuestions?.length || 0} question(s) in progress). Restore it, or discard and start fresh.
    </div>
    <div style="display:flex;gap:8px;">
      <button id="restoreDraftBtn" class="btn btn-primary" style="flex:1;">Restore</button>
      <button id="discardDraftBtn" class="btn btn-secondary" style="flex:1;">Discard</button>
    </div>
  `;
  tab1Panel.insertBefore(banner, tab1Panel.firstChild);

  banner.querySelector('#restoreDraftBtn').onclick = () => {
    DATA = draft.data || DATA;
    parsedQuestions = draft.parsedQuestions || [];
    accumulatedText = draft.accumulatedText || '';
    rawText.value = accumulatedText;
    if (accumulatedText) rawSection.classList.remove('hidden');
    populateSubjects();
    if (draft.subject) subjectSelect.value = draft.subject;
    populateSubtopics();
    if (draft.subtopic) subtopicSelect.value = draft.subtopic;
    if (draft.level) levelSelect.value = draft.level;
    renderQuestionBlocks();
    pendingTopicChanges = true;
    banner.remove();
    setStatus('Restored your unsaved work. Review it below, then Download or Publish.', 'ok');
  };
  banner.querySelector('#discardDraftBtn').onclick = () => {
    clearDraft();
    banner.remove();
  };
}

// ---------- Publish settings (stored only on this device) ----------
const SETTINGS_KEY = 'eeePracticePublishSettings';

function loadSettings(){
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveSettings(s){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
function applySettingsToForm(s){
  if (!s) return;
  ghUser.value = s.user || '';
  ghRepo.value = s.repo || '';
  ghBranch.value = s.branch || 'main';
  ghPath.value = s.path || 'data/questions.json';
  // Token intentionally not re-displayed in the field for a small privacy margin;
  // it's still stored and used, just shown blank until re-entered or left as-is.
}
function updateConnBadge(){
  const s = loadSettings();
  const connected = s && s.user && s.repo && s.token;
  connBadge.textContent = connected ? `Connected to ${s.user}/${s.repo}` : 'Not connected';
  connBadge.className = 'publish-status-badge ' + (connected ? 'connected' : 'not-connected');
}

const existing = loadSettings();
applySettingsToForm(existing);
updateConnBadge();

settingsToggle.addEventListener('click', () => {
  settingsBody.classList.toggle('open');
  settingsChev.textContent = settingsBody.classList.contains('open') ? '▲' : '▼';
});

saveSettingsBtn.addEventListener('click', () => {
  const prev = loadSettings() || {};
  const s = {
    user: ghUser.value.trim(),
    repo: ghRepo.value.trim(),
    branch: ghBranch.value.trim() || 'main',
    path: ghPath.value.trim() || 'data/questions.json',
    token: ghToken.value.trim() || prev.token || ''
  };
  saveSettings(s);
  ghToken.value = '';
  updateConnBadge();
  setStatus('Publish settings saved on this device.', 'ok');
});

// ---------- Firebase Media Storage settings (stored only on this device) ----------
const FB_SETTINGS_KEY = 'eeePracticeFirebaseSettings';

function loadFirebaseSettings(){
  try {
    const raw = localStorage.getItem(FB_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveFirebaseSettings(s){
  localStorage.setItem(FB_SETTINGS_KEY, JSON.stringify(s));
}
function applyFirebaseSettingsToForm(s){
  if (!s) return;
  fbApiKey.value = s.apiKey || '';
  fbAuthDomain.value = s.authDomain || '';
  fbProjectId.value = s.projectId || '';
  fbStorageBucket.value = s.storageBucket || '';
  fbSenderId.value = s.messagingSenderId || '';
  fbAppId.value = s.appId || '';
  fbEmail.value = s.email || '';
  // Password intentionally not re-displayed, same privacy margin as the GitHub token.
}
function updateFbBadge(text, connected){
  fbBadge.textContent = text;
  fbBadge.className = 'publish-status-badge ' + (connected ? 'connected' : 'not-connected');
}

async function initFirebaseAndSignIn(s, silent){
  try {
    const fb = await loadFirebaseSDK();
    firebaseApp = fb.initializeApp({
      apiKey: s.apiKey,
      authDomain: s.authDomain,
      projectId: s.projectId,
      storageBucket: s.storageBucket,
      messagingSenderId: s.messagingSenderId,
      appId: s.appId
    });
    firebaseAuth = fb.getAuth(firebaseApp);
    firebaseStorage = fb.getStorage(firebaseApp);
    await fb.signInWithEmailAndPassword(firebaseAuth, s.email, s.password);
    firebaseSignedIn = true;
    updateFbBadge(`Connected as ${s.email}`, true);
    if (!silent) setStatus('Media Storage connected - video/audio/image uploads will now go here instead of being embedded.', 'ok');
  } catch (err) {
    firebaseSignedIn = false;
    updateFbBadge('Not connected', false);
    if (!silent) setStatus('Media Storage sign-in failed: ' + err.message, 'error');
  }
}

const existingFb = loadFirebaseSettings();
applyFirebaseSettingsToForm(existingFb);
if (existingFb && existingFb.password) {
  initFirebaseAndSignIn(existingFb, true); // quietly reconnect using the saved password
} else {
  updateFbBadge('Not connected', false);
}

// ---------- Cloudinary Media Storage (alternative to Firebase - no credit
// card ever needed, uses an "unsigned upload preset" so no secret key has
// to live in this client-side code) ----------
const CLD_SETTINGS_KEY = 'eeePracticeCloudinarySettings';
let cloudinaryConfigured = false;
let cloudinaryCloudName = '';
let cloudinaryPreset = '';

function loadCloudinarySettings(){
  try {
    const raw = localStorage.getItem(CLD_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCloudinarySettings(s){
  localStorage.setItem(CLD_SETTINGS_KEY, JSON.stringify(s));
}
function updateCldBadge(text, connected){
  cldBadge.textContent = text;
  cldBadge.className = 'publish-status-badge ' + (connected ? 'connected' : 'not-connected');
}

const existingCld = loadCloudinarySettings();
if (existingCld && existingCld.cloudName && existingCld.preset) {
  cldCloudName.value = existingCld.cloudName;
  cldPreset.value = existingCld.preset;
  cloudinaryCloudName = existingCld.cloudName;
  cloudinaryPreset = existingCld.preset;
  cloudinaryConfigured = true;
  updateCldBadge(`Connected (${existingCld.cloudName})`, true);
} else {
  updateCldBadge('Not connected', false);
}

saveCloudinaryBtn.addEventListener('click', () => {
  const cloudName = cldCloudName.value.trim();
  const preset = cldPreset.value.trim();
  if (!cloudName || !preset) {
    setStatus('Fill in both Cloud Name and Upload Preset before saving.', 'error');
    return;
  }
  saveCloudinarySettings({ cloudName, preset });
  cloudinaryCloudName = cloudName;
  cloudinaryPreset = preset;
  cloudinaryConfigured = true;
  updateCldBadge(`Connected (${cloudName})`, true);
  setStatus('Cloudinary connected - video/audio/image uploads will now go here (checked before Firebase).', 'ok');
});

// Uploads a File or Blob to Cloudinary via a plain unsigned upload request -
// no SDK, no login, no secret key in this code. Returns the resulting
// public URL, same shape as uploadToFirebase, so callers don't need to
// know which service actually handled it.
async function uploadToCloudinary(blob, filename){
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('upload_preset', cloudinaryPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/auto/upload`, {
    method: 'POST',
    body: form
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cloudinary upload failed (HTTP ${res.status}). ${errBody.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.secure_url;
}

// Single entry point every media-attach handler calls - tries Cloudinary
// first (if connected), then Firebase (if signed in), then returns null so
// the caller falls back to embedding the file locally as before.
async function uploadMedia(blob, folder, filename){
  if (cloudinaryConfigured) {
    return await uploadToCloudinary(blob, filename);
  }
  if (firebaseSignedIn) {
    return await uploadToFirebase(blob, folder, filename);
  }
  return null;
}

saveFirebaseBtn.addEventListener('click', async () => {
  const prev = loadFirebaseSettings() || {};
  const s = {
    apiKey: fbApiKey.value.trim(),
    authDomain: fbAuthDomain.value.trim(),
    projectId: fbProjectId.value.trim(),
    storageBucket: fbStorageBucket.value.trim(),
    messagingSenderId: fbSenderId.value.trim(),
    appId: fbAppId.value.trim(),
    email: fbEmail.value.trim(),
    password: fbPassword.value.trim() || prev.password || ''
  };
  if (!s.apiKey || !s.projectId || !s.storageBucket || !s.email || !s.password) {
    setStatus('Fill in all Media Storage fields (API Key, Project ID, Storage Bucket, Email, Password) before saving.', 'error');
    return;
  }
  saveFirebaseSettings(s);
  fbPassword.value = '';
  updateFbBadge('Connecting...', false);
  await initFirebaseAndSignIn(s, false);
});

// Uploads a File (or a Blob, for recorded audio) to Firebase Storage and
// returns its public download URL. Used by every "attach media" control
// once Media Storage is connected - falls back to local embedding (the
// old behavior) if it isn't.
async function uploadToFirebase(blob, folder, filename){
  const fb = await loadFirebaseSDK();
  const path = `${folder}/${Date.now()}_${filename.replace(/[^a-z0-9._-]/gi, '_')}`;
  const storageRef = fb.ref(firebaseStorage, path);
  await fb.uploadBytes(storageRef, blob);
  return await fb.getDownloadURL(storageRef);
}

// ---------- Load existing question bank ----------
fetch('data/questions.json')
  .then(r => r.json())
  .then(json => { DATA = json; populateSubjects(); offerDraftRestore(); });

function populateSubjects(){
  subjectSelect.innerHTML = '';
  DATA.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    subjectSelect.appendChild(opt);
  });
  populateSubtopics();
}
function populateSubtopics(){
  const subj = DATA.subjects.find(s => s.id === subjectSelect.value) || DATA.subjects[0];
  subtopicSelect.innerHTML = '';
  subj.subtopics.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id; opt.textContent = st.name;
    subtopicSelect.appendChild(opt);
  });
}
subjectSelect.addEventListener('change', populateSubtopics);

// ---------- Add New Subject (with Save) ----------
const addSubjectToggle = document.getElementById('addSubjectToggle');
const addSubjectBody = document.getElementById('addSubjectBody');
const newSubjectInput = document.getElementById('newSubjectInput');
const saveSubjectBtn = document.getElementById('saveSubjectBtn');
const newSubjectStatus = document.getElementById('newSubjectStatus');

addSubjectToggle.addEventListener('click', () => {
  addSubjectBody.classList.toggle('open');
  newSubjectInput.focus();
});

saveSubjectBtn.addEventListener('click', () => {
  const name = newSubjectInput.value.trim();
  if (!name) {
    newSubjectStatus.textContent = 'Type a subject name first.';
    newSubjectStatus.className = 'status-line error';
    return;
  }
  const id = slugify(name);
  if (DATA.subjects.some(s => s.id === id || s.name.toLowerCase() === name.toLowerCase())) {
    newSubjectStatus.textContent = 'That subject already exists.';
    newSubjectStatus.className = 'status-line error';
    return;
  }
  // A new subject starts with every feature the existing ones have -
  // visible by default, no topics yet, no Class Work Book PDFs yet - all
  // added the same way as Power Systems / Measurements already are.
  DATA.subjects.push({ id, name, visible: true, subtopics: [] });
  populateSubjects();
  subjectSelect.value = id;
  populateSubtopics();
  newSubjectInput.value = '';
  pendingTopicChanges = true;
  updateExportBarVisibility();
  newSubjectStatus.textContent = `Added "${name}" as a new subject. Use "Manage Topics" above to add its first topic, then Download or Publish to GitHub to make it visible to students.`;
  newSubjectStatus.className = 'status-line ok';
});

const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');
const deleteSubjectStatus = document.getElementById('deleteSubjectStatus');

deleteSubjectBtn.addEventListener('click', () => {
  const subj = DATA.subjects.find(s => s.id === subjectSelect.value);
  if (!subj) {
    deleteSubjectStatus.textContent = 'No subject selected.';
    deleteSubjectStatus.className = 'status-line error';
    return;
  }
  if (DATA.subjects.length <= 1) {
    deleteSubjectStatus.textContent = 'Cannot delete the only remaining subject.';
    deleteSubjectStatus.className = 'status-line error';
    return;
  }
  let qCount = 0;
  subj.subtopics.forEach(st => {
    qCount += (st.levels['1'] || []).length + (st.levels['2'] || []).length + (st.levels['conventional'] || []).length;
  });
  const confirmMsg = `Delete the entire subject "${subj.name}"? This permanently removes all ${subj.subtopics.length} topic(s) and ${qCount} question(s) inside it, plus its Class Work Book PDFs. This can't be undone once published.`;
  if (!window.confirm(confirmMsg)) return;

  DATA.subjects = DATA.subjects.filter(s => s.id !== subj.id);
  populateSubjects();
  pendingTopicChanges = true;
  updateExportBarVisibility();
  deleteSubjectStatus.textContent = `Deleted "${subj.name}" and everything in it. Use Download or Publish to GitHub below to make this permanent for students.`;
  deleteSubjectStatus.className = 'status-line ok';
});

// ---------- Add New Topic (with Save) ----------
const addTopicToggle = document.getElementById('addTopicToggle');
const addTopicBody = document.getElementById('addTopicBody');
const newTopicInput = document.getElementById('newTopicInput');
const saveTopicBtn = document.getElementById('saveTopicBtn');
const newTopicStatus = document.getElementById('newTopicStatus');

addTopicToggle.addEventListener('click', () => {
  addTopicBody.classList.toggle('open');
  newTopicInput.focus();
});

function slugify(name){
  return name.toLowerCase()
    .replace(/[(),\/]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

saveTopicBtn.addEventListener('click', () => {
  const name = newTopicInput.value.trim();
  if (!name) {
    newTopicStatus.textContent = 'Type a topic name first.';
    newTopicStatus.className = 'status-line error';
    return;
  }
  const subj = DATA.subjects.find(s => s.id === subjectSelect.value);
  const id = slugify(name);
  if (subj.subtopics.some(st => st.id === id || st.name.toLowerCase() === name.toLowerCase())) {
    newTopicStatus.textContent = 'That topic already exists in ' + subj.name + '.';
    newTopicStatus.className = 'status-line error';
    return;
  }
  subj.subtopics.push({ id, name, levels: { "1": [], "2": [] } });
  populateSubtopics();
  subtopicSelect.value = id;
  newTopicInput.value = '';
  pendingTopicChanges = true;
  updateExportBarVisibility();
  newTopicStatus.textContent = `Added "${name}" to ${subj.name}. It's in the dropdown now - use Download or Publish to GitHub below to make it visible to students.`;
  newTopicStatus.className = 'status-line ok';
});

const deleteTopicBtn = document.getElementById('deleteTopicBtn');
const deleteTopicStatus = document.getElementById('deleteTopicStatus');

deleteTopicBtn.addEventListener('click', () => {
  const subj = DATA.subjects.find(s => s.id === subjectSelect.value);
  const subt = subj.subtopics.find(s => s.id === subtopicSelect.value);
  if (!subt) {
    deleteTopicStatus.textContent = 'No topic selected.';
    deleteTopicStatus.className = 'status-line error';
    return;
  }
  const qCount = (subt.levels['1'] || []).length + (subt.levels['2'] || []).length;
  const confirmMsg = qCount > 0
    ? `Delete "${subt.name}"? This permanently removes all ${qCount} question(s) in it. This can't be undone once published.`
    : `Delete "${subt.name}"? It has no questions yet, but this can't be undone once published.`;
  if (!window.confirm(confirmMsg)) return;

  subj.subtopics = subj.subtopics.filter(s => s.id !== subt.id);
  populateSubtopics();
  pendingTopicChanges = true;
  updateExportBarVisibility();
  deleteTopicStatus.textContent = `Deleted "${subt.name}" and its ${qCount} question(s). Use Download or Publish to GitHub below to make this permanent for students.`;
  deleteTopicStatus.className = 'status-line ok';
});

// ---------- V98 NEW: change order of subjects / chapters ----------
(function(){
  const $ = id => document.getElementById(id);
  const body = $('orderBody'), subSel = $('orderSubjectSel'), st = $('orderStatus');
  $('orderToggle').addEventListener('click', () => { body.classList.toggle('open'); if (body.classList.contains('open')) refresh(); });
  subSel.addEventListener('change', drawTopics);
  const rowCss = 'display:flex;align-items:center;gap:6px;padding:8px 4px;border-bottom:1px solid #e4e9f5;';
  const btnCss = 'border:1px solid #d6dbe8;background:#fff;border-radius:8px;padding:6px 10px;font-size:14px;';

  function move(arr, from, to){
    if (to < 0 || to >= arr.length || to === from) return;
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    // keep the main dropdowns on the same selection after the rebuild
    const keepS = subjectSelect.value, keepT = subtopicSelect.value;
    populateSubjects();
    if ([...subjectSelect.options].some(o => o.value === keepS)) { subjectSelect.value = keepS; populateSubtopics(); }
    if ([...subtopicSelect.options].some(o => o.value === keepT)) subtopicSelect.value = keepT;
    pendingTopicChanges = true;
    updateExportBarVisibility();
    st.textContent = 'Order changed. Use Publish to GitHub (bottom) to show it to students.';
    st.className = 'status-line ok';
    refresh(true);
  }
  function drawList(el, arr, label){
    el.innerHTML = '';
    arr.forEach((it, i) => {
      const r = document.createElement('div'); r.style.cssText = rowCss;
      const n = document.createElement('span'); n.textContent = (i + 1) + '.'; n.style.cssText = 'width:26px;font-weight:700;color:var(--primary);';
      const t = document.createElement('span'); t.textContent = it.name; t.style.cssText = 'flex:1;font-size:13px;';
      const up = document.createElement('button'); up.textContent = '▲'; up.style.cssText = btnCss; up.disabled = i === 0; up.onclick = () => move(arr, i, i - 1);
      const dn = document.createElement('button'); dn.textContent = '▼'; dn.style.cssText = btnCss; dn.disabled = i === arr.length - 1; dn.onclick = () => move(arr, i, i + 1);
      const sel = document.createElement('select'); sel.style.cssText = 'width:64px;padding:6px;font-size:13px;';
      sel.title = 'Move to position';
      sel.innerHTML = '<option value="">to #</option>' + arr.map((_, k) => '<option value="' + k + '">' + (k + 1) + '</option>').join('');
      sel.onchange = () => { if (sel.value !== '') move(arr, i, Number(sel.value)); };
      r.append(n, t, up, dn, sel);
      if (label === 'chapter') {   // V100 NEW: Show/Hide switch for students
        const lab = document.createElement('label'); lab.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:12px;white-space:nowrap;';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.visible !== false;
        const tx = document.createElement('span'); tx.textContent = cb.checked ? 'ON' : 'OFF'; tx.style.cssText = 'font-weight:700;color:' + (cb.checked ? '#1b8a3a' : '#c0392b') + ';';
        cb.onchange = () => {
          it.visible = cb.checked;
          tx.textContent = cb.checked ? 'ON' : 'OFF'; tx.style.color = cb.checked ? '#1b8a3a' : '#c0392b';
          t.style.opacity = cb.checked ? '1' : '.45';
          pendingTopicChanges = true; updateExportBarVisibility();
          st.textContent = '"' + it.name + '" is now ' + (cb.checked ? 'ON - visible to' : 'OFF - hidden from') + ' students. Publish to GitHub to make it live.';
          st.className = 'status-line ok';
        };
        t.style.opacity = cb.checked ? '1' : '.45';
        lab.append(cb, tx); r.appendChild(lab);
      }
      el.appendChild(r);
    });
  }
  function drawTopics(){
    const subj = DATA.subjects.find(s => s.id === subSel.value);
    drawList($('orderTopicList'), subj ? subj.subtopics : [], 'chapter');
  }
  function refresh(keep){
    const cur = subSel.value;
    subSel.innerHTML = DATA.subjects.map(s => '<option value="' + s.id + '">' + s.name.replace(/</g, '&lt;') + '</option>').join('');
    subSel.value = keep && DATA.subjects.some(s => s.id === cur) ? cur : (DATA.subjects.some(s => s.id === subjectSelect.value) ? subjectSelect.value : DATA.subjects[0].id);
    drawTopics();
    drawList($('orderSubjectList'), DATA.subjects, 'subject');
  }
})();

// ---------- V102 NEW: Mixed Topics Tests (Teacher) ----------
(function(){
  const $ = id => document.getElementById(id);
  const st = $('mixedStatus');
  $('mixedToggle').addEventListener('click', () => { $('mixedBody').classList.toggle('open'); draw(); });
  const allIds = () => { const s = new Set(); DATA.subjects.forEach(sj => sj.subtopics.forEach(t => Object.values(t.levels || {}).forEach(a => (a || []).forEach(q => s.add(q.id))))); return s; };
  const msg = (t, k) => { st.textContent = t; st.className = 'status-line ' + (k || 'ok'); };
  const touch = () => { pendingTopicChanges = true; updateExportBarVisibility(); };
  function draw(){
    const box = $('mixedList'); box.innerHTML = '';
    const tests = DATA.mixedTests || [];
    if (!tests.length) { box.innerHTML = '<div class="hint">No mixed test yet. Use "Import" below.</div>'; return; }
    const ids = allIds();
    tests.forEach((t, i) => {
      const live = (t.questionIds || []).filter(id => ids.has(id)).length;
      const row = document.createElement('div');
      row.style.cssText = 'padding:8px 4px;border-bottom:1px solid #e4e9f5;';
      const title = document.createElement('input'); title.type = 'text'; title.value = t.title; title.style.cssText = 'width:100%;padding:8px;border:1px solid #d6dbe8;border-radius:8px;font-size:13px;font-weight:700;';
      title.onchange = () => { t.title = title.value.trim() || t.title; touch(); msg('Test name changed. Publish to GitHub to make it live.'); };
      const info = document.createElement('div'); info.className = 'hint'; info.style.margin = '4px 0'; info.textContent = live + ' of ' + (t.questionIds || []).length + ' questions found' + (t.durationMin ? ' · suggested ' + t.durationMin + ' min' : '');
      const ctl = document.createElement('div'); ctl.style.cssText = 'display:flex;align-items:center;gap:10px;';
      const lab = document.createElement('label'); lab.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;flex:1;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.visible === true;
      const tx = document.createElement('span'); tx.style.fontWeight = '700';
      const paint = () => { tx.textContent = cb.checked ? 'ON - visible to students' : 'OFF - hidden from students'; tx.style.color = cb.checked ? '#1b8a3a' : '#c0392b'; };
      paint(); cb.onchange = () => { t.visible = cb.checked; paint(); touch(); msg('"' + t.title + '" is now ' + (cb.checked ? 'ON' : 'OFF') + '. Publish to GitHub to make it live.'); };
      lab.append(cb, tx);
      const del = document.createElement('button'); del.textContent = 'Remove test'; del.className = 'btn btn-secondary'; del.style.cssText = 'font-size:12px;color:var(--wrong);';
      del.onclick = () => { if (!window.confirm('Remove the test card "' + t.title + '"? Its questions stay in their chapters.')) return; DATA.mixedTests.splice(i, 1); touch(); draw(); msg('Test removed. Publish to GitHub to make it live.'); };
      ctl.append(lab, del);
      // V104 NEW: edit the questions inside this test
      const ed = document.createElement('button'); ed.textContent = 'Edit questions'; ed.className = 'btn btn-secondary'; ed.style.cssText = 'font-size:12px;margin-top:6px;';
      const edBox = document.createElement('div'); edBox.style.cssText = 'display:none;margin-top:6px;';
      ed.onclick = () => { edBox.style.display = edBox.style.display === 'none' ? 'block' : 'none'; if (edBox.style.display === 'block') drawEd(); };
      const qText = id => { let r = null; DATA.subjects.forEach(sj => sj.subtopics.forEach(tp => Object.values(tp.levels || {}).forEach(a => (a || []).forEach(q => { if (q.id === id) r = { q, tp }; })))); return r; };
      function drawEd(){
        edBox.innerHTML = '';
        const dur = document.createElement('div'); dur.style.cssText = 'margin-bottom:6px;font-size:12px;';
        dur.innerHTML = 'Suggested minutes: ';
        const di = document.createElement('input'); di.type = 'number'; di.min = 1; di.value = t.durationMin || ''; di.style.cssText = 'width:70px;padding:5px;border:1px solid #d6dbe8;border-radius:6px;';
        di.onchange = () => { t.durationMin = Number(di.value) || 0; touch(); msg('Duration saved. Publish to GitHub to make it live.'); };
        dur.appendChild(di); edBox.appendChild(dur);
        // V107 NEW: every question shown in FULL, with Edit (question, options, correct answer, solution), move up/down, remove
        const inp = (el, extra) => { el.style.cssText = 'width:100%;padding:8px;border:1px solid #d6dbe8;border-radius:8px;font-size:13px;margin:3px 0;box-sizing:border-box;' + (extra || ''); return el; };
        (t.questionIds || []).forEach((id, k) => {
          const f = qText(id);
          const card = document.createElement('div'); card.style.cssText = 'border:1px solid #d6dbe8;border-radius:10px;padding:8px;margin:8px 0;background:#fff;';
          const head = document.createElement('div'); head.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;';
          const num = document.createElement('b'); num.style.cssText = 'color:#E8710A;font-size:13px;'; num.textContent = 'Q' + (k + 1) + (f ? '  [' + f.tp.name + ']' : '');
          const sp = document.createElement('span'); sp.style.flex = '1';
          const mkb = (txt, fn, col) => { const b2 = document.createElement('button'); b2.textContent = txt; b2.className = 'btn btn-secondary'; b2.style.cssText = 'padding:3px 9px;font-size:12px;' + (col ? 'color:' + col + ';' : ''); b2.onclick = fn; return b2; };
          const move = d => () => { const a = t.questionIds, n = k + d; if (n < 0 || n >= a.length) return; [a[k], a[n]] = [a[n], a[k]]; touch(); drawEd(); };
          head.append(num, sp, mkb('▲', move(-1)), mkb('▼', move(1)), mkb('✕', () => { if (!confirm('Remove Q' + (k + 1) + ' from this test? (It stays in its chapter.)')) return; t.questionIds.splice(k, 1); touch(); drawEd(); info.textContent = t.questionIds.length + ' questions'; msg('Removed from this test only. Publish to GitHub.'); }, 'var(--wrong)'));
          card.appendChild(head);
          if (!f) { const nf = document.createElement('div'); nf.style.color = '#c0392b'; nf.textContent = id + ' - question not found'; card.appendChild(nf); edBox.appendChild(card); return; }
          const q = f.q;
          const changed = () => { touch(); msg('Question edited. Publish to GitHub to make it live.'); };
          const qt = inp(document.createElement('textarea'), 'min-height:90px;'); qt.value = q.question || ''; qt.oninput = () => { q.question = qt.value; changed(); };
          card.appendChild(qt); setTimeout(() => { qt.style.height = Math.max(90, qt.scrollHeight + 4) + 'px'; }, 0); qt.addEventListener('input', () => { qt.style.height = 'auto'; qt.style.height = (qt.scrollHeight + 4) + 'px'; });
          if (q.type !== 'fill' && q.type !== 'conventional') {
            const letters = 'abcdefgh';
            (q.options || []).forEach((o, n) => {
              const r = document.createElement('label'); r.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:12px;';
              const rd = document.createElement('input'); rd.type = 'radio'; rd.name = 'ans_' + id; rd.checked = q.correctIndex === n;
              rd.onchange = () => { q.correctIndex = n; changed(); };
              const oi = inp(document.createElement('input'), 'flex:1;width:auto;'); oi.type = 'text'; oi.value = o; oi.oninput = () => { q.options[n] = oi.value; changed(); };
              r.append(letters[n] + ')', rd, oi); card.appendChild(r);
            });
            const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Round button = correct answer.'; card.appendChild(hint);
          }
          const el = document.createElement('div'); el.className = 'hint'; el.style.fontWeight = '700'; el.textContent = 'Solution / explanation'; card.appendChild(el);
          const ex = inp(document.createElement('textarea'), 'min-height:120px;'); ex.value = q.explanation || ''; ex.oninput = () => { q.explanation = ex.value; changed(); };
          card.appendChild(ex); setTimeout(() => { ex.style.height = Math.max(120, ex.scrollHeight + 4) + 'px'; }, 0); ex.addEventListener('input', () => { ex.style.height = 'auto'; ex.style.height = (ex.scrollHeight + 4) + 'px'; });
          edBox.appendChild(card);
        });
        // V107 NEW: write a brand-new question straight into this test
        const nb = document.createElement('button'); nb.className = 'btn btn-secondary'; nb.style.cssText = 'font-size:12px;margin:6px 0;'; nb.textContent = '+ Write a NEW question for this test';
        nb.onclick = () => {
          const tp0 = (() => { let r = null; DATA.subjects.forEach(sj => sj.subtopics.forEach(tp => { if (!r) r = tp; })); const cur = (t.questionIds || []).map(qText).filter(Boolean)[0]; return cur ? cur.tp : r; })();
          if (!tp0) return;
          if (!tp0.levels) tp0.levels = {}; if (!tp0.levels['2']) tp0.levels['2'] = [];
          const nid = 'mixed_new_' + Date.now();
          tp0.levels['2'].push({ id: nid, type: 'mcq', question: 'Type the question here', questionImage: null, options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0, correctAnswer: '', videoUrl: '', videoFile: null, videoReady: false, audioFile: null, explanation: '' });
          (t.questionIds = t.questionIds || []).push(nid); touch(); drawEd(); info.textContent = t.questionIds.length + ' questions';
          msg('New question added at the end (saved in chapter "' + tp0.name + '", Level 2). Edit it below, then Publish to GitHub.');
        };
        edBox.appendChild(nb);
        const add = document.createElement('div'); add.style.cssText = 'margin-top:8px;display:grid;gap:6px;';
        const sTp = document.createElement('select'), sQ = document.createElement('select');
        [sTp, sQ].forEach(s => s.style.cssText = 'padding:7px;border:1px solid #d6dbe8;border-radius:8px;font-size:12px;width:100%;');
        const topics = []; DATA.subjects.forEach(sj => sj.subtopics.forEach(tp => topics.push({ sj, tp })));
        sTp.innerHTML = topics.map((o, n) => '<option value="' + n + '">' + (o.sj.name + ' - ' + o.tp.name).replace(/</g, '&lt;') + '</option>').join('');
        const fill = () => { const o = topics[sTp.value]; const opts = []; ['1', '2'].forEach(l => ((o && o.tp.levels && o.tp.levels[l]) || []).forEach((q, n) => { if (q.type !== 'conventional' && !(t.questionIds || []).includes(q.id)) opts.push('<option value="' + q.id + '">L' + l + ' Q' + (n + 1) + ': ' + (q.question || '').slice(0, 70).replace(/</g, '&lt;') + '</option>'); })); sQ.innerHTML = opts.join('') || '<option value="">(none left)</option>'; };
        sTp.onchange = fill; fill();
        const ab = document.createElement('button'); ab.textContent = '+ Add this question to the test'; ab.className = 'btn btn-primary';
        ab.onclick = () => { if (!sQ.value) return; (t.questionIds = t.questionIds || []).push(sQ.value); touch(); drawEd(); info.textContent = t.questionIds.length + ' questions'; msg('Question added. Publish to GitHub to make it live.'); };
        add.append(sTp, sQ, ab); edBox.appendChild(add);
      }
      row.append(title, info, ctl, ed, edBox); box.appendChild(row);
    });
  }
  $('mixedImportBtn').addEventListener('click', async () => {
    try {
      const r = await fetch('data/mixed_test_1_seed.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('seed file missing - upload data/mixed_test_1_seed.json to GitHub first');
      const seed = await r.json();
      const ids = allIds(); let added = 0, skipped = 0;
      Object.keys(seed.topics).forEach(tid => {
        let topic = null;
        DATA.subjects.forEach(sj => sj.subtopics.forEach(t => { if (t.id === tid) topic = t; }));
        if (!topic) { skipped += seed.topics[tid].length; return; }
        if (!topic.levels) topic.levels = {};
        if (!topic.levels['2']) topic.levels['2'] = [];
        seed.topics[tid].forEach(q => { if (ids.has(q.id)) return; topic.levels['2'].push(q); ids.add(q.id); added++; });
      });
      if (!DATA.mixedTests) DATA.mixedTests = [];
      const mt = seed.mixedTest, ex = DATA.mixedTests.find(t => t.id === mt.id);
      if (!ex) { mt.visible = false; DATA.mixedTests.push(mt); }
      touch(); populateSubtopics(); draw();
      msg('Imported ' + added + ' new question(s)' + (skipped ? ' (' + skipped + ' skipped: topic not found)' : '') + (ex ? '; test card already existed.' : ' and created the test (it is OFF - switch it ON when ready).') + ' Now tap Publish to GitHub.', skipped ? 'error' : 'ok');
    } catch (err) { msg('Import failed: ' + err.message, 'error'); }
  });
})();

// ---------- Source buttons ----------
// If the Level is changed after questions were already split (e.g. switching
// to Conventional), re-render the existing cards so they immediately reflect
// the right editor (options hidden, Model Answer label shown, etc).
levelSelect.addEventListener('change', () => {
  if (parsedQuestions.length > 0) renderQuestionBlocks();
});

cameraBtn.addEventListener('click', () => cameraInput.click());
filesBtn.addEventListener('click', () => filesInput.click());

// ---------- Voice to Text (dictate a question by speaking) ----------
// Uses the browser's built-in speech recognition - unlike OCR/PDF reading,
// this needs an internet connection (it's not a bundled offline library).
// Typing and photo/file upload both still work exactly as before regardless.
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isDictating = false;

if (!SpeechRecognitionAPI) {
  dictateBtn.addEventListener('click', () => {
    setStatus('Voice-to-text isn\'t supported on this browser/device. Try Chrome on Android or a desktop, or just type the question directly below.', 'error');
  });
} else {
  dictateBtn.addEventListener('click', () => {
    if (isDictating) {
      recognizer.stop();
      return;
    }
    recognizer = new SpeechRecognitionAPI();
    recognizer.lang = 'en-IN';
    recognizer.continuous = true;
    recognizer.interimResults = false;

    recognizer.onstart = () => {
      isDictating = true;
      dictateBtnLabel.textContent = '⏹ Stop Dictating';
      dictateBtn.style.background = '#FBEAEA';
      rawSection.classList.remove('hidden');
      setStatus('Listening... speak the question, options, and answer clearly. Tap "Stop Dictating" when done.', 'ok');
    };

    recognizer.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
      }
      if (finalText.trim()) {
        accumulatedText += (accumulatedText ? '\n' : '') + finalText.trim();
        rawText.value = accumulatedText;
      }
    };

    recognizer.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setStatus('Microphone access denied - check your browser/device permissions and try again.', 'error');
      } else if (event.error !== 'no-speech') {
        setStatus('Voice-to-text error: ' + event.error, 'error');
      }
    };

    recognizer.onend = () => {
      isDictating = false;
      dictateBtnLabel.textContent = 'Dictate a Question';
      dictateBtn.style.background = '';
      if (accumulatedText) {
        setStatus('Dictation stopped. Review the text below, edit anything misheard, then tap "Split into Questions".', 'ok');
      }
    };

    recognizer.start();
  });
}

cameraInput.addEventListener('change', () => {
  if (cameraInput.files.length) handleFile(cameraInput.files[0]);
  cameraInput.value = '';
});
filesInput.addEventListener('change', () => {
  if (filesInput.files.length) handleFile(filesInput.files[0]);
  filesInput.value = '';
});

// ---------- Photo as Question: skips OCR entirely - the photo itself
// becomes the question's figure immediately, with an empty question card
// ready for the teacher to type/dictate the question text (if any) and
// fill in the options. Built for exactly the case OCR handles worst:
// questions where a diagram is central and any surrounding printed text
// would be lossy or wrong if force-extracted through OCR. ----------
photoAsQuestionBtn.addEventListener('click', () => photoAsQuestionInput.click());
photoAsQuestionInput.addEventListener('change', async () => {
  const file = photoAsQuestionInput.files[0];
  if (!file) return;
  photoAsQuestionInput.value = '';

  const newQ = {
    type: 'mcq',
    question: '',
    options: ['', '', '', ''],
    correctIndex: null,
    correctAnswer: '',
    questionImage: null,
    videoUrl: '',
    videoFile: null,
    videoReady: false,
    audioFile: null,
    explanation: '',
    explanationImage: null
  };

  try {
    if (cloudinaryConfigured || firebaseSignedIn) {
      setStatus('Uploading photo to Media Storage...');
      newQ.questionImage = await uploadMedia(file, 'question-figures', file.name);
    } else {
      newQ.questionImage = await fileToDataUrl(file);
    }
    parsedQuestions.push(newQ);
    rawSection.classList.remove('hidden'); // keep the panel visible/consistent with the rest of Tab 1
    renderQuestionBlocks();
    updateExportBarVisibility();
    setStatus('Photo attached as a new question - type the question text (optional) and fill in the options below.', 'ok');
    // Scroll to the newly added card so it's immediately visible to edit.
    const cards = questionsSection.querySelectorAll('.qblock');
    if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus('Could not attach photo: ' + err.message, 'error');
  }
});

function setStatus(msg, type){
  statusLine.textContent = msg;
  statusLine.className = 'status-line' + (type ? ' ' + type : '');
}

// A publish failure is easy to miss as a small colored status line,
// especially on mobile after scrolling - so it also shows as a blocking
// modal that has to be dismissed, never just silent/easy-to-scroll-past text.
function showPublishError(msg){
  setStatus(msg, 'error');
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="border-top:3px solid var(--wrong);max-width:420px;">
      <h2 style="color:var(--wrong);">Publish Failed</h2>
      <p style="white-space:pre-line;color:var(--text);font-size:14px;line-height:1.5;">${msg}</p>
      <button class="btn btn-primary full-width" id="dismissPublishError">Got it</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#dismissPublishError').onclick = () => overlay.remove();
}

// V87 NEW: full-screen progress box so Publish never looks "dead" on a phone
// (status messages at the top of the page are out of sight after scrolling).
let publishProgressEl = null;
function showPublishProgress(text){
  if (!publishProgressEl) {
    publishProgressEl = document.createElement('div');
    publishProgressEl.className = 'modal';
    publishProgressEl.style.zIndex = '200';
    publishProgressEl.innerHTML = '<div class="modal-box" style="max-width:380px;text-align:center;"><h2 style="margin-bottom:10px;">Publishing to GitHub...</h2><p id="publishProgressText" style="font-size:15px;line-height:1.5;"></p><p style="font-size:12px;color:var(--muted);margin-top:10px;">Please wait and keep this page open. A 4 MB file can take up to a minute on mobile data.</p></div>';
    document.body.appendChild(publishProgressEl);
  }
  publishProgressEl.querySelector('#publishProgressText').textContent = text;
  setStatus(text);
}
function hidePublishProgress(){ if (publishProgressEl) { publishProgressEl.remove(); publishProgressEl = null; } }

async function handleFile(file){
  const ext = file.name.split('.').pop().toLowerCase();
  setStatus('Reading ' + file.name + ' ...');
  try {
    let text = '';
    let ocrConfidence = null;
    const isImage = ['jpg','jpeg','png'].includes(ext) || file.type.startsWith('image/');
    if (ext === 'txt') {
      text = await file.text();
    } else if (ext === 'docx') {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      text = result.value;
    } else if (ext === 'pdf') {
      text = await extractPdfText(file);
    } else if (isImage) {
      const ocrResult = await extractImageText(file);
      text = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
    } else {
      setStatus('Unsupported file type: .' + ext, 'error');
      return;
    }
    if (isImage) {
      const dataUrl = await fileToDataUrl(file);
      pendingSourceImages.push({ dataUrl, name: file.name });
    }
    accumulatedText += (accumulatedText ? '\n\n' : '') + text.trim();
    rawText.value = accumulatedText;
    rawSection.classList.remove('hidden');
    // Low OCR confidence almost always means handwriting, a skewed photo,
    // or poor lighting - none of which this technology can reliably read.
    // Say so clearly rather than letting garbled text look like it worked.
    if (isImage && ocrConfidence !== null && ocrConfidence < 35) {
      setStatus(`Added ${text.length} characters from ${file.name}, but OCR confidence was low (${Math.round(ocrConfidence)}%) - this usually means handwriting or an unclear photo, which this tool can't read reliably. Please check the text below carefully, retype it, or use "Dictate a Question" instead.`, 'error');
    } else {
      setStatus(`Added ${text.length} characters from ${file.name}. Take/choose another page, or review and split below.`, 'ok');
    }
  } catch (err) {
    console.error(err);
    setStatus('Extraction failed: ' + err.message, 'error');
  }
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let full = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    setStatus(`Reading PDF page ${i} of ${pdf.numPages} ...`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    full += content.items.map(it => it.str).join(' ') + '\n\n';
  }
  return full;
}

async function extractImageText(file){
  setStatus('Running OCR on photo - this can take 15-30 seconds on a phone...');
  const result = await Tesseract.recognize(file, 'eng', {
    workerPath: 'libs/tesseract/worker.min.js',
    corePath: 'libs/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: 'libs/tesseract',
    gzip: true,
    logger: m => {
      if (m.status && typeof m.progress === 'number') {
        setStatus(`OCR: ${m.status} (${Math.round(m.progress * 100)}%)`);
      }
    }
  });
  // Tesseract's own confidence score (0-100) - low confidence almost
  // always means handwriting, a skewed photo, or poor lighting, none of
  // which OCR can reliably read. Callers use this to decide whether to
  // trust the text or warn the teacher instead of silently inserting
  // garbage.
  return { text: result.data.text, confidence: result.data.confidence };
}

rawText.addEventListener('input', () => { accumulatedText = rawText.value; });

// ---------- Splitting ----------
splitBtn.addEventListener('click', () => {
  const text = rawText.value;
  const blocks = splitIntoBlocks(text);
  parsedQuestions = blocks.map(parseBlock);
  // NOTE: the source photo is no longer auto-attached as the question's
  // figure by default (even in the single-photo/single-question case).
  // Attaching it made sense for genuine diagrams, but for a plain-text
  // photographed question it just duplicated the same content twice -
  // once as an image, once as the typed-out text. Teachers can still
  // attach it with one tap via the quick-attach thumbnail when there
  // really is a diagram worth keeping.
  renderQuestionBlocks();
  updateExportBarVisibility();
});

function splitIntoBlocks(text){
  const lines = text.split('\n');
  const blocks = [];
  let current = [];
  const startPattern = /^\s*(Q\.?\s*)?\d{1,3}[\.\)]\s+/;
  lines.forEach(line => {
    if (startPattern.test(line) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  });
  if (current.length) blocks.push(current.join('\n'));
  if (blocks.length <= 1) {
    return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  }
  return blocks.map(b => b.trim()).filter(Boolean);
}

function parseBlock(block){
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const optRe = /^\(?([A-Da-d])[\)\.]\s*(.+)$/;
  const ansRe = /^(ans(wer)?|correct)[:\-\s]*\(?([A-Da-d0-9.\-]+)\)?/i;

  let questionLines = [];
  const options = { A: '', B: '', C: '', D: '' };
  let correctRaw = '';

  lines.forEach(line => {
    const ansMatch = line.match(ansRe);
    const optMatch = line.match(optRe);
    if (ansMatch) {
      correctRaw = ansMatch[3].toUpperCase();
    } else if (optMatch) {
      options[optMatch[1].toUpperCase()] = optMatch[2].trim();
    } else if (Object.values(options).every(v => v === '')) {
      questionLines.push(line.replace(/^\s*(Q\.?\s*)?\d{1,3}[\.\)]\s*/, ''));
    }
  });

  const hasOptions = Object.values(options).some(v => v !== '');
  // Heuristic: no A/B/C/D option lines detected at all -> most likely a
  // fill-in-the-blank / numeric-answer question, common in GATE/ESE style
  // banks (e.g. "...the corona loss per km of line is ____ kW"). Teacher
  // can always override the type manually in the review screen either way.
  const type = hasOptions ? 'mcq' : 'fill';
  const correctIndex = { A: 0, B: 1, C: 2, D: 3 }[correctRaw];

  return {
    type,
    question: questionLines.join(' ').trim(),
    options: [options.A, options.B, options.C, options.D],
    correctIndex: correctIndex !== undefined ? correctIndex : null,
    correctAnswer: (!hasOptions && correctRaw) ? correctRaw : '',
    questionImage: null, // base64 data URI - the figure/diagram belonging to the question itself
    videoUrl: '',
    videoFile: null, // base64 data URI of an uploaded video clip, alternative to a link
    audioFile: null, // base64 data URI of a recorded/uploaded audio explanation
    videoReady: false, // teacher must explicitly tick this before students see any video prompt/link
    explanation: '',
    explanationImage: null // base64 data URI, set via the attach-file control below
  };
}

// ---------- Review UI ----------
// ---------- Shared symbol/equation toolbar ----------
// Tracks whichever text field was last focused (question, any option,
// correct-answer, or explanation) so ONE toolbar per question can insert
// into any of them, instead of duplicating a toolbar per field.
let lastFocusedField = null;
function trackFocus(el){ el.addEventListener('focus', () => { lastFocusedField = el; }); }

function insertAtCursor(el, text){
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const val = el.value;
  el.value = val.slice(0, start) + text + val.slice(end);
  el.dispatchEvent(new Event('input'));
  el.focus();
  el.selectionStart = el.selectionEnd = start + text.length;
}

function buildSymbolToolbar(){
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:6px 0;';
  const symbols = ['ω','Ω','θ','δ','α','β','μ','π','Σ','Δ','√','±','≤','≥','≈','∞','∫','→','°','²','³','½'];
  symbols.forEach(sym => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sym;
    b.style.cssText = 'width:28px;height:28px;border:1px solid #e0e4f0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;';
    b.onclick = () => insertAtCursor(lastFocusedField, sym);
    row.appendChild(b);
  });
  const eqBtn = document.createElement('button');
  eqBtn.type = 'button';
  eqBtn.textContent = 'Insert equation template';
  eqBtn.style.cssText = 'height:28px;padding:0 10px;border:1px solid #e0e4f0;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;';
  eqBtn.onclick = () => insertAtCursor(lastFocusedField, '$\\frac{a}{b} = \\sqrt{c}$');
  row.appendChild(eqBtn);
  const hint = document.createElement('div');
  hint.className = 'progress-note';
  hint.style.cssText = 'width:100%;margin:2px 0 0;';
  hint.textContent = 'Tap into the question, an option, the answer, or the explanation first, then tap a symbol above to insert it there.';
  row.appendChild(hint);
  return row;
}

function renderMathPreviewInto(box, text){
  box.textContent = text || '(nothing typed yet)';
  box.style.whiteSpace = 'pre-wrap'; // V94 NEW: keep line breaks in preview
  box.style.display = 'block';
  if (window.renderMathInElement) {
    try {
      renderMathInElement(box, {
        delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],
        throwOnError: false
      });
    } catch (e) { /* leave as plain text */ }
  }
}

// ---------- Reusable question editor card ----------
// Builds one fully-editable question card, used both for freshly-split
// questions (Tab 1) and for editing already-published questions (Tab 2).
// Mutates `q` directly - callers decide when/how those mutations get saved.
function buildQuestionCard(q, opts){
  opts = opts || {};
  q.type = q.type || 'mcq';
  const box = document.createElement('div');
  box.className = 'qblock';

  if (opts.label) {
    const qLabel = document.createElement('span');
    qLabel.className = 'row-label';
    qLabel.textContent = opts.label;
    box.appendChild(qLabel);
  }

  const qTextArea = document.createElement('textarea');
  qTextArea.value = q.question;
  qTextArea.oninput = () => { q.question = qTextArea.value; if (opts.onChange) opts.onChange(); };
  trackFocus(qTextArea);
  box.appendChild(qTextArea);

  // ---- Question figure ----
  const qImageRow = document.createElement('div');
  qImageRow.style.marginBottom = '10px';
  if (pendingSourceImages.length > 0) {
    const quickLabel = document.createElement('div');
    quickLabel.className = 'row-label';
    quickLabel.textContent = pendingSourceImages.length === 1
      ? 'Use the photo you just uploaded as this question\'s figure:'
      : 'Use one of your recent photos as this question\'s figure:';
    qImageRow.appendChild(quickLabel);
    const thumbRow = document.createElement('div');
    thumbRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
    pendingSourceImages.forEach(src => {
      const thumb = document.createElement('img');
      thumb.src = src.dataUrl;
      thumb.title = 'Tap to use as this question\'s figure';
      thumb.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:8px;border:2px solid #e0e4f0;cursor:pointer;';
      thumb.onclick = () => { q.questionImage = src.dataUrl; renderQImagePreview(); if (opts.onChange) opts.onChange(); };
      thumbRow.appendChild(thumb);
    });
    qImageRow.appendChild(thumbRow);
  }
  const qImageBtn = document.createElement('button');
  qImageBtn.type = 'button';
  qImageBtn.className = 'btn btn-secondary';
  qImageBtn.style.fontSize = '13px';
  qImageBtn.style.padding = '8px 12px';
  qImageBtn.textContent = pendingSourceImages.length > 0 ? '🖼 Or Browse for a Figure / PDF' : '🖼 Attach Figure/Diagram/PDF to Question';
  const qImageInput = document.createElement('input');
  qImageInput.type = 'file';
  qImageInput.accept = '.jpg,.jpeg,.png,.pdf';
  qImageInput.style.display = 'none';
  const qImagePreview = document.createElement('div');
  qImagePreview.style.marginTop = '8px';
  function renderQImagePreview(){
    qImagePreview.innerHTML = '';
    if (q.questionImage) {
      const img = document.createElement('img');
      img.src = q.questionImage;
      img.style.cssText = 'max-width:160px;border-radius:8px;display:block;margin-bottom:6px;';
      qImagePreview.appendChild(img);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-q';
      rm.textContent = 'Remove figure';
      rm.onclick = () => { q.questionImage = null; renderQImagePreview(); if (opts.onChange) opts.onChange(); };
      qImagePreview.appendChild(rm);
    }
  }
  renderQImagePreview();
  qImageBtn.onclick = () => qImageInput.click();
  qImageInput.onchange = async () => {
    const file = qImageInput.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const isPdf = ext === 'pdf';

    // Auto-extract text so the teacher doesn't have to retype the question
    // by hand - only fills the Question box if it's currently empty, so it
    // never overwrites something already typed. For images, only trusted
    // when OCR confidence is reasonable - handwriting and unclear photos
    // produce garbled text that looks like it worked but isn't real, so
    // that gets flagged instead of silently inserted.
    if (!q.question || !q.question.trim()) {
      try {
        setStatus(isPdf ? 'Reading PDF text...' : 'Reading text from image...');
        if (isPdf) {
          const extractedText = await extractPdfText(file);
          if (extractedText && extractedText.trim()) {
            q.question = extractedText.trim();
            qTextArea.value = q.question;
            setStatus('Question text filled in automatically - please check it over for any extraction mistakes.', 'ok');
          }
        } else {
          const ocrResult = await extractImageText(file);
          const extractedText = ocrResult.text;
          if (ocrResult.confidence < 35) {
            // Don't silently fill garbled text - leave the box empty and
            // say clearly why, so it's obvious something needs typing.
            setStatus(`OCR confidence was too low (${Math.round(ocrResult.confidence)}%) to trust automatically - this usually means handwriting or an unclear photo. The figure is still attached below, but please type the question yourself, or try "Dictate a Question" on the main screen instead.`, 'error');
          } else if (extractedText && extractedText.trim()) {
            q.question = extractedText.trim();
            qTextArea.value = q.question;
            setStatus('Question text filled in automatically - please check it over for any OCR mistakes.', 'ok');
          }
        }
      } catch (err) {
        // OCR/PDF-read failing shouldn't block attaching the figure itself
        console.error('Auto-extract failed:', err);
      }
    }

    if (isPdf) {
      // A PDF isn't something an <img> tag can display as a figure - the
      // text extraction above is the useful part; nothing to attach visually.
      qImageInput.value = '';
      return;
    }

    if (cloudinaryConfigured || firebaseSignedIn) {
      setStatus('Uploading figure to Media Storage...');
      try {
        q.questionImage = await uploadMedia(file, 'question-figures', file.name);
        renderQImagePreview();
        if (opts.onChange) opts.onChange();
        setStatus('Figure uploaded.', 'ok');
      } catch (err) {
        setStatus('Upload failed: ' + err.message, 'error');
      }
    } else {
      const reader = new FileReader();
      reader.onload = () => { q.questionImage = reader.result; renderQImagePreview(); if (opts.onChange) opts.onChange(); };
      reader.readAsDataURL(file);
    }
    qImageInput.value = '';
  };
  qImageRow.appendChild(qImageBtn);
  qImageRow.appendChild(qImageInput);
  qImageRow.appendChild(qImagePreview);
  box.appendChild(qImageRow);

  // ---- Question Type switch: MCQ vs Fill in the Blank ----
  // Skipped entirely for Conventional (long-answer) questions - there's
  // no correct option to pick, the written Explanation field below IS
  // the answer.
  const answerArea = document.createElement('div');
  if (!opts.forceConventional) {
  const typeRow = document.createElement('div');
  typeRow.style.marginBottom = '10px';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'row-label';
  typeLabel.textContent = 'Question Type';
  const typeSelect = document.createElement('select');
  ['mcq', 'fill'].forEach(t => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t === 'mcq' ? 'Multiple Choice (A/B/C/D)' : 'Fill in the Blank / Numeric Answer';
    typeSelect.appendChild(o);
  });
  typeSelect.value = q.type;
  typeRow.appendChild(typeLabel);
  typeRow.appendChild(typeSelect);
  box.appendChild(typeRow);

  // ---- Answer area ----
  box.appendChild(answerArea);
  function renderAnswerArea(){
    answerArea.innerHTML = '';
    if (typeSelect.value === 'mcq') {
      const optGrid = document.createElement('div');
      optGrid.className = 'opt-grid';
      q.options = q.options && q.options.length === 4 ? q.options : ['', '', '', ''];
      ['A','B','C','D'].forEach((letter, idx) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Option ' + letter + ' (equations supported, e.g. $\\sqrt{3}$)';
        input.value = q.options[idx] || '';
        input.oninput = () => { q.options[idx] = input.value; if (opts.onChange) opts.onChange(); };
        trackFocus(input);
        optGrid.appendChild(input);
      });
      answerArea.appendChild(optGrid);

      const correctSelect = document.createElement('select');
      ['', 'A', 'B', 'C', 'D'].forEach(letter => {
        const o = document.createElement('option');
        o.value = letter; o.textContent = letter ? 'Correct: ' + letter : 'Select correct option';
        correctSelect.appendChild(o);
      });
      correctSelect.value = q.correctIndex !== null && q.correctIndex !== undefined ? ['A','B','C','D'][q.correctIndex] : '';
      correctSelect.onchange = () => {
        q.correctIndex = correctSelect.value ? ['A','B','C','D'].indexOf(correctSelect.value) : null;
        if (opts.onChange) opts.onChange();
      };
      answerArea.appendChild(correctSelect);
    } else {
      const ansInput = document.createElement('input');
      ansInput.type = 'text';
      ansInput.placeholder = 'Correct answer (e.g. 1.13 or a short phrase)';
      ansInput.value = q.correctAnswer || '';
      ansInput.oninput = () => { q.correctAnswer = ansInput.value; if (opts.onChange) opts.onChange(); };
      trackFocus(ansInput);
      answerArea.appendChild(ansInput);
      const hint = document.createElement('div');
      hint.className = 'progress-note';
      hint.style.marginBottom = '10px';
      hint.textContent = 'Numeric answers accept a small tolerance automatically (rounding); text answers match loosely (case/spacing insensitive).';
      answerArea.appendChild(hint);
    }
  }
  renderAnswerArea();
  typeSelect.onchange = () => { q.type = typeSelect.value; renderAnswerArea(); if (opts.onChange) opts.onChange(); };
  } else {
    // Conventional question: a plain note pointing to the Explanation
    // field below, which serves as the full written model answer.
    const convNote = document.createElement('div');
    convNote.className = 'progress-note';
    convNote.style.marginBottom = '10px';
    convNote.innerHTML = '<strong>Conventional (Long Answer) question</strong> - no options needed. Write the full model answer / solution in the "Model Answer" field below.';
    box.appendChild(convNote);
    box.appendChild(answerArea); // stays empty for conventional questions, kept for downstream .querySelector calls
  }

  const videoLabel = document.createElement('label');
  videoLabel.className = 'row-label';
  videoLabel.style.marginTop = '10px';
  videoLabel.textContent = 'Video Solution - use a link OR upload a short clip directly';
  box.appendChild(videoLabel);

  const videoInput = document.createElement('input');
  videoInput.type = 'text';
  videoInput.placeholder = 'Video link (e.g. YouTube/Drive) - best for longer videos';
  videoInput.value = (q.videoUrl && q.videoUrl !== 'PASTE_VIDEO_LINK_HERE') ? q.videoUrl : '';
  videoInput.oninput = () => { q.videoUrl = videoInput.value; if (opts.onChange) opts.onChange(); };
  box.appendChild(videoInput);

  const videoOrLabel = document.createElement('div');
  videoOrLabel.className = 'progress-note';
  videoOrLabel.style.cssText = 'text-align:center;margin:6px 0;';
  videoOrLabel.textContent = '— or —';
  box.appendChild(videoOrLabel);

  const videoFileBtn = document.createElement('button');
  videoFileBtn.type = 'button';
  videoFileBtn.className = 'btn btn-secondary';
  videoFileBtn.style.cssText = 'font-size:13px;padding:8px 12px;width:100%;';
  videoFileBtn.textContent = (cloudinaryConfigured || firebaseSignedIn)
    ? '🎬 Upload Video File (up to 200 MB - Media Storage connected)'
    : '🎬 Upload Video File (short clips, under 15 MB)';
  const videoFileInput = document.createElement('input');
  videoFileInput.type = 'file';
  videoFileInput.accept = 'video/*';
  videoFileInput.style.display = 'none';
  const videoFilePreview = document.createElement('div');
  videoFilePreview.style.marginTop = '8px';
  function renderVideoFilePreview(){
    videoFilePreview.innerHTML = '';
    if (q.videoFile) {
      const vid = document.createElement('video');
      vid.src = q.videoFile;
      vid.controls = true;
      vid.style.cssText = 'width:100%;max-width:260px;border-radius:8px;display:block;margin-bottom:6px;';
      videoFilePreview.appendChild(vid);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-q';
      rm.textContent = 'Remove uploaded video';
      rm.onclick = () => { q.videoFile = null; renderVideoFilePreview(); if (opts.onChange) opts.onChange(); };
      videoFilePreview.appendChild(rm);
    }
  }
  renderVideoFilePreview();
  videoFileBtn.onclick = () => videoFileInput.click();
  videoFileInput.onchange = async () => {
    const file = videoFileInput.files[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);

    if (cloudinaryConfigured || firebaseSignedIn) {
      // Media Storage removes the size pressure entirely - a generous cap
      // just to keep individual uploads reasonable.
      if (sizeMB > 200) {
        setStatus(`That video is ${sizeMB.toFixed(1)} MB - please keep individual uploads under 200 MB even with Media Storage connected.`, 'error');
        videoFileInput.value = '';
        return;
      }
      setStatus(`Uploading video (${sizeMB.toFixed(1)} MB) to Media Storage...`);
      try {
        q.videoFile = await uploadMedia(file, 'videos', file.name);
        renderVideoFilePreview();
        if (opts.onChange) opts.onChange();
        setStatus('Video uploaded to Media Storage - questions.json only stores a small link to it.', 'ok');
      } catch (err) {
        setStatus('Upload failed: ' + err.message, 'error');
      }
      videoFileInput.value = '';
      return;
    }

    if (sizeMB > 15) {
      setStatus(`That video is ${sizeMB.toFixed(1)} MB - too large to embed directly (limit ~15 MB, since every student re-downloads this with the question bank). Connect Media Storage above (Publish Settings) for larger videos, or use a Video Link (YouTube/Drive) for anything longer than a minute or two.`, 'error');
      videoFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      q.videoFile = reader.result;
      renderVideoFilePreview();
      if (opts.onChange) opts.onChange();
      setStatus(`Video attached (${sizeMB.toFixed(1)} MB). Remember: this size gets added to questions.json for every student to download.`, 'ok');
    };
    reader.readAsDataURL(file);
    videoFileInput.value = '';
  };
  box.appendChild(videoFileBtn);
  box.appendChild(videoFileInput);
  box.appendChild(videoFilePreview);

  // ---- Video Ready toggle: students only ever see the video prompt/link
  // once this is explicitly ticked, regardless of whether a link or an
  // uploaded file is already attached above. Lets a teacher publish the
  // question + text explanation right away and add the tick later, from
  // anywhere, once the video (link or file) is actually ready. ----
  const videoReadyRow = document.createElement('label');
  videoReadyRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--text);cursor:pointer;';
  const videoReadyCheckbox = document.createElement('input');
  videoReadyCheckbox.type = 'checkbox';
  videoReadyCheckbox.checked = !!q.videoReady;
  videoReadyCheckbox.style.cssText = 'width:18px;height:18px;cursor:pointer;';
  videoReadyCheckbox.onchange = () => { q.videoReady = videoReadyCheckbox.checked; if (opts.onChange) opts.onChange(); };
  videoReadyRow.appendChild(videoReadyCheckbox);
  const videoReadyText = document.createElement('span');
  videoReadyText.textContent = '✓ Video is ready - show it to students (Watch Now / Watch Video Solution)';
  videoReadyRow.appendChild(videoReadyText);
  box.appendChild(videoReadyRow);
  const videoReadyHint = document.createElement('div');
  videoReadyHint.className = 'progress-note';
  videoReadyHint.style.marginBottom = '10px';
  videoReadyHint.textContent = 'Leave unticked to publish now with just the text explanation - students see no video option at all, in any case, until you come back and tick this.';
  box.appendChild(videoReadyHint);

  // ---- Audio explanation: record your voice directly, or upload a clip.
  // Unlike video, there's no separate "ready" tick - once recorded/attached,
  // it's immediately visible to students, since recording happens live and
  // doesn't need a separate production step the way video often does. ----
  const audioLabel = document.createElement('label');
  audioLabel.className = 'row-label';
  audioLabel.style.marginTop = '10px';
  audioLabel.textContent = 'Audio Explanation (optional) - record your voice, or upload a clip';
  box.appendChild(audioLabel);

  const audioControlsRow = document.createElement('div');
  audioControlsRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';

  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'btn btn-secondary';
  recordBtn.style.fontSize = '13px';
  recordBtn.textContent = '🎙 Record Audio';

  const audioFileBtn = document.createElement('button');
  audioFileBtn.type = 'button';
  audioFileBtn.className = 'btn btn-secondary';
  audioFileBtn.style.fontSize = '13px';
  audioFileBtn.textContent = '📁 Upload Audio File';
  const audioFileInput = document.createElement('input');
  audioFileInput.type = 'file';
  audioFileInput.accept = 'audio/*';
  audioFileInput.style.display = 'none';

  audioControlsRow.appendChild(recordBtn);
  audioControlsRow.appendChild(audioFileBtn);
  audioControlsRow.appendChild(audioFileInput);
  box.appendChild(audioControlsRow);

  const audioPreview = document.createElement('div');
  audioPreview.style.marginTop = '4px';
  function renderAudioPreview(){
    audioPreview.innerHTML = '';
    if (q.audioFile) {
      const aud = document.createElement('audio');
      aud.src = q.audioFile;
      aud.controls = true;
      aud.style.cssText = 'width:100%;max-width:280px;display:block;margin-bottom:6px;';
      audioPreview.appendChild(aud);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-q';
      rm.textContent = 'Remove audio explanation';
      rm.onclick = () => { q.audioFile = null; renderAudioPreview(); if (opts.onChange) opts.onChange(); };
      audioPreview.appendChild(rm);
    }
  }
  renderAudioPreview();
  box.appendChild(audioPreview);

  audioFileBtn.onclick = () => audioFileInput.click();
  audioFileInput.onchange = async () => {
    const file = audioFileInput.files[0];
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);

    if (cloudinaryConfigured || firebaseSignedIn) {
      if (sizeMB > 50) {
        setStatus(`That audio clip is ${sizeMB.toFixed(1)} MB - please keep individual uploads under 50 MB even with Media Storage connected.`, 'error');
        audioFileInput.value = '';
        return;
      }
      setStatus(`Uploading audio (${sizeMB.toFixed(1)} MB) to Media Storage...`);
      try {
        q.audioFile = await uploadMedia(file, 'audio', file.name);
        renderAudioPreview();
        if (opts.onChange) opts.onChange();
        setStatus('Audio uploaded to Media Storage.', 'ok');
      } catch (err) {
        setStatus('Upload failed: ' + err.message, 'error');
      }
      audioFileInput.value = '';
      return;
    }

    if (sizeMB > 5) {
      setStatus(`That audio clip is ${sizeMB.toFixed(1)} MB - please keep audio explanations under 5 MB (a few minutes of compressed voice is usually well under this), or connect Media Storage above for larger clips.`, 'error');
      audioFileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      q.audioFile = reader.result;
      renderAudioPreview();
      if (opts.onChange) opts.onChange();
    };
    reader.readAsDataURL(file);
    audioFileInput.value = '';
  };

  // Live in-app recording via the microphone, using MediaRecorder.
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordStartTime = null;
  let recordTimerInterval = null;
  recordBtn.onclick = async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        clearInterval(recordTimerInterval);
        recordBtn.textContent = '🎙 Record Audio';
        recordBtn.style.background = '';
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const sizeMB = blob.size / (1024 * 1024);

        if (cloudinaryConfigured || firebaseSignedIn) {
          if (sizeMB > 50) {
            setStatus(`That recording is ${sizeMB.toFixed(1)} MB - please keep individual recordings under 50 MB even with Media Storage connected.`, 'error');
            return;
          }
          setStatus(`Uploading recording (${sizeMB.toFixed(1)} MB) to Media Storage...`);
          try {
            q.audioFile = await uploadMedia(blob, 'audio', `recording_${q.id || 'new'}.webm`);
            renderAudioPreview();
            if (opts.onChange) opts.onChange();
            setStatus('Audio recorded and uploaded to Media Storage.', 'ok');
          } catch (err) {
            setStatus('Upload failed: ' + err.message, 'error');
          }
          return;
        }

        if (sizeMB > 5) {
          setStatus(`That recording is ${sizeMB.toFixed(1)} MB - a bit long. Please keep audio explanations under 5 MB (try recording a shorter explanation, or connect Media Storage above for longer recordings).`, 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          q.audioFile = reader.result;
          renderAudioPreview();
          if (opts.onChange) opts.onChange();
          setStatus('Audio explanation recorded.', 'ok');
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      recordStartTime = Date.now();
      recordBtn.style.background = 'var(--wrong)';
      recordBtn.style.color = '#fff';
      recordTimerInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - recordStartTime) / 1000);
        recordBtn.textContent = `⏹ Stop Recording (${secs}s)`;
      }, 500);
    } catch (err) {
      setStatus('Could not access microphone - check your browser/device permissions.', 'error');
    }
  };

  // ---- Explanation (descriptive correct-answer reasoning, shown to
  // students whether they got the question right OR wrong) ----
  const explLabel = document.createElement('label');
  explLabel.className = 'row-label';
  explLabel.style.marginTop = '10px';
  explLabel.textContent = opts.forceConventional
    ? 'Model Answer / Solution - the full written answer shown to students'
    : 'Explanation - the descriptive correct answer shown to students either way';
  box.appendChild(explLabel);

  box.appendChild(buildSymbolToolbar());

  // V94 NEW: bigger auto-growing box, and the "Why the other options?"
  // part is split into one editable box per option (a)(b)(c)(d).
  const WHY_MARK = '\n\nWhy the other options?\n';
  const explTextarea = document.createElement('textarea');
  explTextarea.placeholder = "Explanation, e.g. Corona loss varies with frequency: P = k(f + 25)(V-V0)^2 ... For proper equation typesetting, wrap LaTeX in $ $, e.g. $\\omega C V^2 \\cos\\delta$";
  explTextarea.style.cssText = 'min-height:120px;resize:vertical;';
  trackFocus(explTextarea);
  box.appendChild(explTextarea);

  const whyBox = document.createElement('div');
  whyBox.style.cssText = 'margin-top:8px;';
  box.appendChild(whyBox);
  let whyInputs = null; // null = this question has no "Why the other options?" part

  function autosize(t){
    t.style.height = 'auto';
    if (t.scrollHeight > 0) t.style.height = Math.min(t.scrollHeight + 2, 700) + 'px';
  }
  function splitExpl(s){
    const k = s.indexOf(WHY_MARK);
    if (k < 0) return { main: s, notes: null };
    const notes = [];
    s.slice(k + WHY_MARK.length).split('\n').forEach(line => {
      const m = line.match(/^\(([a-z])\)\s?(.*)$/i);
      if (m) notes.push(m[2]);
      else if (notes.length) notes[notes.length - 1] += '\n' + line;
    });
    return { main: s.slice(0, k), notes };
  }
  function joinExpl(){
    if (!whyInputs) return explTextarea.value;
    const letters = 'abcdefghij';
    return explTextarea.value + WHY_MARK + whyInputs.map((t, n) => '(' + letters[n] + ') ' + t.value).join('\n');
  }
  function onExplEdit(){ q.explanation = joinExpl(); if (opts.onChange) opts.onChange(); }
  function buildWhyInputs(notes){
    whyBox.innerHTML = '';
    whyInputs = null;
    const isMcq = !opts.forceConventional && q.type !== 'conventional' && Array.isArray(q.options) && q.options.length > 1;
    if (!isMcq) return;
    if (!notes) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-secondary';
      add.style.cssText = 'font-size:12px;padding:6px 10px;';
      add.textContent = "➕ Add 'Why the other options?' boxes";
      add.onclick = () => { q.explanation = explTextarea.value + WHY_MARK + q.options.map((o, n) => '(' + 'abcdefghij'[n] + ') ').join('\n'); refreshExplFields(); if (opts.onChange) opts.onChange(); };
      whyBox.appendChild(add);
      return;
    }
    const head = document.createElement('div');
    head.className = 'row-label';
    head.textContent = 'Why the other options? - one box for each option (✘ = wrong, ✔ = correct)';
    whyBox.appendChild(head);
    whyInputs = [];
    const count = Math.max(notes.length, q.options.length);
    for (let n = 0; n < count; n++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin-bottom:6px;';
      const lab = document.createElement('div');
      lab.textContent = '(' + 'abcdefghij'[n] + ')';
      lab.style.cssText = 'font-weight:700;padding-top:10px;min-width:26px;';
      const t = document.createElement('textarea');
      t.value = notes[n] || '';
      t.style.cssText = 'flex:1;min-height:48px;resize:vertical;';
      t.oninput = () => { autosize(t); onExplEdit(); };
      trackFocus(t);
      row.appendChild(lab); row.appendChild(t);
      whyBox.appendChild(row);
      whyInputs.push(t);
      setTimeout(() => autosize(t), 0);
    }
  }
  function refreshExplFields(){
    const p = splitExpl(q.explanation || '');
    explTextarea.value = p.main;
    buildWhyInputs(p.notes);
    setTimeout(() => autosize(explTextarea), 0);
  }
  explTextarea.oninput = () => { autosize(explTextarea); onExplEdit(); };
  refreshExplFields();

  const previewToggle = document.createElement('button');
  previewToggle.type = 'button';
  previewToggle.className = 'btn btn-secondary';
  previewToggle.style.cssText = 'font-size:12px;padding:6px 10px;margin-top:6px;';
  previewToggle.textContent = '👁 Preview how students will see this';
  const previewBox = document.createElement('div');
  previewBox.style.cssText = 'display:none;background:#f4f6fb;border-radius:8px;padding:10px 12px;margin-top:8px;font-size:14px;';
  previewToggle.onclick = () => {
    if (previewBox.style.display === 'block') { previewBox.style.display = 'none'; }
    else { renderMathPreviewInto(previewBox, joinExpl()); }
  };
  box.appendChild(previewToggle);
  box.appendChild(previewBox);

  // ---- Attach a photo, PDF, or text file to this explanation ----
  const attachRow = document.createElement('div');
  attachRow.style.marginTop = '8px';
  const attachBtn = document.createElement('button');
  attachBtn.type = 'button';
  attachBtn.className = 'btn btn-secondary';
  attachBtn.style.fontSize = '13px';
  attachBtn.style.padding = '8px 12px';
  attachBtn.textContent = '📎 Attach photo / PDF / text to explanation';
  const attachInput = document.createElement('input');
  attachInput.type = 'file';
  attachInput.accept = '.pdf,.txt,.jpg,.jpeg,.png';
  attachInput.style.display = 'none';
  const attachPreview = document.createElement('div');
  attachPreview.style.marginTop = '8px';
  function renderAttachPreview(){
    attachPreview.innerHTML = '';
    if (q.explanationImage) {
      const img = document.createElement('img');
      img.src = q.explanationImage;
      img.style.cssText = 'max-width:160px;border-radius:8px;display:block;margin-bottom:6px;';
      attachPreview.appendChild(img);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-q';
      rm.textContent = 'Remove attached image';
      rm.onclick = () => { q.explanationImage = null; renderAttachPreview(); if (opts.onChange) opts.onChange(); };
      attachPreview.appendChild(rm);
    }
  }
  renderAttachPreview();
  attachBtn.onclick = () => attachInput.click();
  attachInput.onchange = async () => {
    const file = attachInput.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'txt') {
        const text = await file.text();
        q.explanation = (q.explanation ? q.explanation + '\n' : '') + text.trim();
        refreshExplFields();
      } else if (ext === 'pdf') {
        setStatus('Reading PDF for explanation...');
        const text = await extractPdfText(file);
        q.explanation = (q.explanation ? q.explanation + '\n' : '') + text.trim();
        refreshExplFields();
        setStatus('Explanation text added from PDF.', 'ok');
      } else if (['jpg','jpeg','png'].includes(ext) || file.type.startsWith('image/')) {
        if (cloudinaryConfigured || firebaseSignedIn) {
          setStatus('Uploading image to Media Storage...');
          q.explanationImage = await uploadMedia(file, 'explanation-images', file.name);
          renderAttachPreview();
        } else {
          const reader = new FileReader();
          reader.onload = () => { q.explanationImage = reader.result; renderAttachPreview(); if (opts.onChange) opts.onChange(); };
          reader.readAsDataURL(file);
        }
      }
      if (opts.onChange) opts.onChange();
    } catch (err) {
      setStatus('Attachment failed: ' + err.message, 'error');
    }
    attachInput.value = '';
  };
  attachRow.appendChild(attachBtn);
  attachRow.appendChild(attachInput);
  attachRow.appendChild(attachPreview);
  box.appendChild(attachRow);

  if (opts.onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-q';
    removeBtn.textContent = opts.removeLabel || 'Remove this question';
    removeBtn.onclick = opts.onRemove;
    box.appendChild(removeBtn);
  }

  // ---- Validation: checks the CURRENT live DOM state (so it stays correct
  // even after the MCQ/Fill-in type toggle rebuilds the answer fields),
  // highlights exactly which field is the problem, and returns a plain-
  // English description of each issue found for this question. ----
  box.validate = function(labelText){
    const issues = [];
    box.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));

    // A question is allowed to have no typed text ONLY if a figure is
    // attached instead - the photo itself is the question in that case
    // ("Photo as Question"). If there's neither text nor a figure, that's
    // a genuinely empty question.
    if ((!q.question || !q.question.trim()) && !q.questionImage) {
      qTextArea.classList.add('field-error');
      issues.push(`${labelText}: the question text is empty (add text, or attach a figure/photo instead)`);
    }

    if (opts.forceConventional) {
      if (!q.explanation || !q.explanation.trim()) {
        issues.push(`${labelText}: the Model Answer is empty - write the full answer/solution`);
      }
    } else if (q.type === 'mcq') {
      const optInputs = answerArea.querySelectorAll('.opt-grid input');
      const letters = ['A', 'B', 'C', 'D'];
      optInputs.forEach((inp, idx) => {
        if (!inp.value.trim()) {
          inp.classList.add('field-error');
          issues.push(`${labelText}: Option ${letters[idx]} is empty`);
        }
      });
      const correctSel = answerArea.querySelector('select');
      if (correctSel && (q.correctIndex === null || q.correctIndex === undefined)) {
        correctSel.classList.add('field-error');
        issues.push(`${labelText}: no correct option selected`);
      }
    } else {
      const ansInp = answerArea.querySelector('input');
      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        if (ansInp) ansInp.classList.add('field-error');
        issues.push(`${labelText}: correct answer is empty`);
      }
    }

    return issues;
  };

  return box;
}

function renderQuestionBlocks(){
  questionsSection.innerHTML = '';
  const forceConventional = levelSelect.value === 'conventional';
  parsedQuestions.forEach((q, i) => {
    const card = buildQuestionCard(q, {
      label: `Question ${i + 1}`,
      forceConventional,
      onRemove: () => { parsedQuestions.splice(i, 1); renderQuestionBlocks(); },
      onChange: () => saveDraft()
    });
    questionsSection.appendChild(card);
  });

  const note = document.createElement('div');
  note.className = 'progress-note';
  note.textContent = `${parsedQuestions.length} question(s) detected. Check each one - automatic splitting isn't perfect, especially for photos/scans.`;
  questionsSection.appendChild(note);
}

// ---------- Merge parsed questions into DATA, shared by both export paths ----------
function mergeIntoData(){
  const subjId = subjectSelect.value;
  const subtId = subtopicSelect.value;
  const level = levelSelect.value;

  const subj = DATA.subjects.find(s => s.id === subjId);
  const subt = subj.subtopics.find(s => s.id === subtId);
  if (!subt.levels[level]) subt.levels[level] = [];

  let addedCount = 0;
  parsedQuestions.forEach((q, i) => {
    // A question is valid with no typed text as long as a figure/photo is
    // attached instead - matches the "Photo as Question" flow and the
    // same rule box.validate() already enforces in the UI.
    if (!q.question && !q.questionImage) return;
    const isConventional = level === 'conventional';
    if (isConventional) {
      if (!q.explanation || !q.explanation.trim()) return; // a conventional question needs its written answer
    } else {
      const isMcq = (q.type || 'mcq') === 'mcq';
      if (isMcq && (q.options.some(o => !o) || q.correctIndex === null)) return; // MCQ needs all 4 options + a correct one marked
      if (!isMcq && !q.correctAnswer) return; // Fill-in needs a correct answer typed in
    }
    const isMcq = (q.type || 'mcq') === 'mcq';
    const id = subtId + '_l' + level + '_new' + Date.now() + '_' + i;
    subt.levels[level].push({
      id,
      type: isConventional ? 'conventional' : (isMcq ? 'mcq' : 'fill'),
      question: q.question,
      questionImage: q.questionImage || null,
      options: (!isConventional && isMcq) ? q.options : [],
      correctIndex: (!isConventional && isMcq) ? q.correctIndex : null,
      correctAnswer: (!isConventional && !isMcq) ? q.correctAnswer : '',
      videoUrl: q.videoUrl || 'PASTE_VIDEO_LINK_HERE',
      videoFile: q.videoFile || null,
      videoReady: !!q.videoReady,
      audioFile: q.audioFile || null,
      explanation: q.explanation || '',
      explanationImage: q.explanationImage || null
    });
    addedCount++;
  });
  return { addedCount, subtopicName: subt.name, level };
}

// ---------- Download (offline fallback, same as v5) ----------
// Runs validate() on every currently-visible freshly-parsed question card
// (Tab 1) before Download/Publish proceeds. Highlights every bad field in
// place and shows exactly what's wrong, per question, in one popup -
// instead of silently skipping incomplete questions or a vague error.
function validateAllQuestionCards(){
  const cards = questionsSection.querySelectorAll('.qblock');
  const allIssues = [];
  let firstBadCard = null;
  cards.forEach((card, i) => {
    if (typeof card.validate !== 'function') return;
    const issues = card.validate(`Question ${i + 1}`);
    if (issues.length) {
      allIssues.push(...issues);
      if (!firstBadCard) firstBadCard = card;
    }
  });
  if (allIssues.length) {
    if (firstBadCard) firstBadCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showPublishError(
      `Found ${allIssues.length} issue(s) before publishing - the exact field(s) are now outlined in red below:\n\n` +
      allIssues.map(i => '• ' + i).join('\n')
    );
    return false;
  }
  return true;
}

function countAllQuestions(data){
  let total = 0;
  data.subjects.forEach(subj => subj.subtopics.forEach(subt => {
    total += (subt.levels['1'] || []).length + (subt.levels['2'] || []).length + (subt.levels['conventional'] || []).length;
  }));
  return total;
}

function countSubtopicQuestions(subj, subtopicName){
  const subt = subj.subtopics.find(s => s.name === subtopicName);
  if (!subt) return 0;
  return (subt.levels['1'] || []).length + (subt.levels['2'] || []).length + (subt.levels['conventional'] || []).length;
}

downloadBtn.addEventListener('click', () => {
  if (!validateAllQuestionCards()) return;
  const { addedCount, subtopicName, level } = mergeIntoData();
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'questions.json';
  a.click();
  URL.revokeObjectURL(url);
  const topicNote = pendingTopicChanges ? ' New topic(s) included.' : '';
  pendingTopicChanges = false;
  showQuestionCountSummary(addedCount, subtopicName, level, 'Downloaded');
  setStatus(`Added ${addedCount} question(s) to ${subtopicName} (Level ${level}).${topicNote} Downloaded questions.json - replace the file in data/ manually via GitHub.`, 'ok');
});

// A clear, hard-to-miss confirmation of exactly how many questions were
// just added, what position they now hold in the topic, and the running
// totals for the topic and the whole question bank.
function showQuestionCountSummary(addedCount, subtopicName, level, actionLabel){
  const grandTotal = countAllQuestions(DATA);

  if (addedCount === 0) {
    // A topic-level-only change (kill switch, subject visibility, Add/Delete
    // Topic) with no new questions still deserves a clear, hard-to-miss
    // confirmation - previously this case showed nothing but a small status
    // line, easy to miss entirely.
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-box" style="border-top:3px solid var(--correct);max-width:420px;">
        <h2 style="color:var(--correct);">${actionLabel}!</h2>
        <p style="color:var(--text);font-size:15px;line-height:1.6;">
          Your changes (settings, topic, or visibility updates) are saved.${actionLabel === 'Published' ? ' Students will see this after GitHub Pages rebuilds (usually 1-2 minutes).' : ''}<br><br>
          Your question bank currently has <strong>${grandTotal}</strong> question(s) across all topics.
        </p>
        <button class="btn btn-primary full-width" id="dismissCountSummary">Got it</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#dismissCountSummary').onclick = () => overlay.remove();
    return;
  }

  const subj = DATA.subjects.find(s => s.subtopics.some(st => st.name === subtopicName));
  const topicTotal = subj ? countSubtopicQuestions(subj, subtopicName) : null;
  const firstNum = topicTotal !== null ? topicTotal - addedCount + 1 : null;
  const rangeText = addedCount === 1
    ? (firstNum !== null ? `now question #${firstNum}` : '')
    : (firstNum !== null ? `now questions #${firstNum}-#${firstNum + addedCount - 1}` : '');

  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="border-top:3px solid var(--correct);max-width:420px;">
      <h2 style="color:var(--correct);">${actionLabel}!</h2>
      <p style="color:var(--text);font-size:15px;line-height:1.6;">
        <strong>${addedCount}</strong> new question(s) added${rangeText ? ' (' + rangeText + ' in Level ' + level + ')' : ''}.${actionLabel === 'Published' ? ' Students will see this after GitHub Pages rebuilds (usually 1-2 minutes).' : ''}<br><br>
        <strong>${subtopicName}</strong> now has <strong>${topicTotal ?? '?'}</strong> question(s) total.<br>
        Your whole question bank now has <strong>${grandTotal}</strong> question(s) across all topics.
      </p>
      <button class="btn btn-primary full-width" id="dismissCountSummary">Got it</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#dismissCountSummary').onclick = () => overlay.remove();
}

// ---------- Publish directly to GitHub ----------
publishBtn.addEventListener('click', async () => {
  const s = loadSettings();
  if (!s || !s.user || !s.repo || !s.token) {
    showPublishError('Fill in Publish Settings (username, repo, token) first, then tap Save Settings before Publishing.');
    settingsBody.classList.add('open');
    settingsChev.textContent = '▲';
    return;
  }

  if (!validateAllQuestionCards()) return;

  let merged;
  try { merged = mergeIntoData(); }
  catch (e) { console.error(e); showPublishError('Could not prepare the data: ' + e.message + '\n\nOpen "1. Upload" and choose the Subject, Topic and Level, then tap Publish again.'); return; }
  const { addedCount, subtopicName, level } = merged;
  // V87 NEW: edits made to EXISTING questions (Verify tab) change DATA directly and add
  // no new question, so they must still publish - never end silently.

  // GitHub's Contents API (what Publish uses) fails on writes over roughly
  // 1 MB - a much stricter limit than the 100 MB normal Git push allows.
  // Videos/images embedded in questions push this file's size up fast, so
  // check BEFORE attempting the network call, rather than let it silently
  // fail after a long wait.
  const contentStr = JSON.stringify(DATA, null, 2);
  const sizeBytes = new Blob([contentStr]).size;
  const sizeMB = sizeBytes / (1024 * 1024);
  if (sizeBytes > 20000000) { // V83 NEW: was 900000 (Contents API); now Git Data API
    const websiteNote = sizeMB > 25
      ? `Your file is ${sizeMB.toFixed(2)} MB, which is also too big for GitHub's website upload (25 MB limit) - you'll need to shrink it first using the Storage Report before either option below will work.`
      : `1) Tap "Download File" below, then on github.com go to your repo → data folder → click questions.json → the pencil (edit) icon → replace the content → Commit. GitHub's website accepts files up to 25 MB this way.`;
    showPublishError(
      `Can't publish automatically - your question bank is now ${sizeMB.toFixed(2)} MB, over the 20 MB safe limit for Publish.\n\n` +
      `This is almost always caused by an uploaded video file or several images.\n\n` +
      `Fastest fix: go to "2. Verify Uploaded Data" → tap "🔍 Show Storage Report" - it lists your heaviest questions first, with a one-tap button to remove each uploaded video/image. Removing the biggest one or two usually solves this immediately.\n\n` +
      `${websiteNote}\n\n` +
      `Either way, replace uploaded videos with a YouTube/Drive Link where you can - a link barely adds any size at all.`
    );
    return;
  }

  publishBtn.disabled = true;
  showPublishProgress('Connecting to GitHub...');

  // V83 NEW: publish through the Git Data API (blob -> tree -> commit -> ref).
  // The old Contents API refused files over ~1 MB; blobs accept up to 100 MB.
  const repoBase = `https://api.github.com/repos/${s.user}/${s.repo}`;
  const headers = {
    'Authorization': 'Bearer ' + s.token,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
  const gh = async (url, opts, what) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 240000); // V87 NEW: never hang forever
    let r;
    try { r = await fetch(url, { ...opts, signal: ctl.signal }); }
    catch (e) { throw new Error(`${what} did not finish (${e.name === 'AbortError' ? 'timed out after 4 minutes' : 'network problem: ' + e.message}). Check your internet and try again.`); }
    finally { clearTimeout(timer); }
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`${what} failed (HTTP ${r.status}). ${errBody.slice(0,300)}`);
    }
    return r.json();
  };

  try {
    const branch = encodeURIComponent(s.branch);
    showPublishProgress('Step 1 of 5: reading the latest version from GitHub...');
    const ref = await gh(`${repoBase}/git/ref/heads/${branch}`, { headers }, 'Reading branch (check username/repo/branch/token)');
    const parentSha = ref.object.sha;
    const parent = await gh(`${repoBase}/git/commits/${parentSha}`, { headers }, 'Reading last commit');

    showPublishProgress(`Step 2 of 5: uploading the question bank (${sizeMB.toFixed(2)} MB)...`);
    const base64Content = btoa(unescape(encodeURIComponent(contentStr)));
    const blob = await gh(`${repoBase}/git/blobs`, {
      method: 'POST', headers,
      body: JSON.stringify({ content: base64Content, encoding: 'base64' })
    }, 'Uploading file');

    showPublishProgress('Step 3 of 5: preparing the commit...');
    const tree = await gh(`${repoBase}/git/trees`, {
      method: 'POST', headers,
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: [{ path: s.path, mode: '100644', type: 'blob', sha: blob.sha }] })
    }, 'Creating tree');

    showPublishProgress('Step 4 of 5: saving the commit...');
    const commit = await gh(`${repoBase}/git/commits`, {
      method: 'POST', headers,
      body: JSON.stringify({
        message: addedCount ? `Add ${addedCount} question(s) to ${subtopicName} (Level ${level}) via Teacher Upload` : 'Update question bank (edits) via Teacher Upload',
        tree: tree.sha, parents: [parentSha]
      })
    }, 'Creating commit');

    showPublishProgress('Step 5 of 5: publishing...');
    await gh(`${repoBase}/git/refs/heads/${branch}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ sha: commit.sha })
    }, 'Updating branch');

    hidePublishProgress();
    const topicNote = pendingTopicChanges ? ' New topic(s) published too.' : '';
    setStatus(`Published! ${addedCount ? 'Added ' + addedCount + ' question(s) to ' + subtopicName + ' (Level ' + level + ').' : 'Your edits are saved to GitHub.'}${topicNote} Students will see it after GitHub Pages rebuilds (~1-2 min).`, 'ok');
    showQuestionCountSummary(addedCount, subtopicName, level, 'Published');
    clearDraft(); // successfully published - no need to keep the local safety-net copy
    parsedQuestions = [];
    questionsSection.innerHTML = '';
    pendingTopicChanges = false;
    rawSection.classList.add('hidden');
    accumulatedText = '';
    rawText.value = '';
    pendingSourceImages = [];
  } catch (err) {
    console.error(err);
    hidePublishProgress();
    showPublishError('Publish error: ' + err.message);
  } finally {
    hidePublishProgress();
    publishBtn.disabled = false;
  }
});

// ---------- V96 NEW: Students count (numbers only, auto-loaded) + Excel / Sheet download ----------
(function(){
  const KEY = 'eeeStudentsSheetSettings';
  const $ = id => document.getElementById(id);
  const url = $('stuUrl'), key = $('stuKey'), msg = $('stuMsg');
  let info = { sheetId: '', sheetUrl: '' };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { url.value = s.url || ''; key.value = s.key || ''; info.sheetId = s.sheetId || ''; info.sheetUrl = s.sheetUrl || ''; } } catch {}

  // count tile on the Upload Questions page (next to Draw Diagram)
  const grid = document.querySelector('.source-grid');
  const tile = document.createElement('div');
  tile.className = 'source-btn'; tile.id = 'stuCountTile';
  tile.innerHTML = '<span class="icon">&#128101;</span><span id="stuTileNum" style="font-size:24px;font-weight:800;color:var(--primary);display:block;line-height:1;">-</span>Students<span class="sub" id="stuTileSub">tap to refresh</span>';
  if (grid) grid.appendChild(tile);

  function show(total, today, peak, peakDate){
    $('stuTotal').textContent = total; $('stuToday').textContent = today; $('stuPeak').textContent = peak; $('stuPeakDate').textContent = peakDate || '';
    $('stuTileNum').textContent = total;
    $('stuTileSub').textContent = 'Today ' + today + ' · Max/day ' + peak;
  }
  async function load(showMsg){
    const u = url.value.trim(), k = key.value.trim();
    if (!u || !k) { $('stuTileSub').textContent = 'set URL in Menu 5'; if (showMsg) msg.textContent = 'Enter the Web App URL and the secret key.'; return; }
    $('stuTileSub').textContent = 'loading...';
    if (showMsg) msg.textContent = 'Loading...';
    try {
      const base = u + (u.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k) + '&action=';
      let j = await (await fetch(base + 'count')).json();
      if (j && j.ok && j.total == null) j = null;            // old script: ignores 'count'
      if (!j || (!j.ok && j.error !== 'key')) {              // fall back to the old 'list' action
        const l = await (await fetch(base + 'list')).json();
        if (!l.ok) throw new Error(l.error || 'x');
        j = { ok: true, total: (l.students || []).length, todayCount: l.todayCount || 0, peak: l.peak || {} };
      }
      if (!j.ok) { $('stuTileSub').textContent = 'wrong key'; if (showMsg) msg.textContent = 'Wrong secret key.'; return; }
      if (j.sheetId) { info.sheetId = j.sheetId; info.sheetUrl = j.sheetUrl || ''; }
      try { localStorage.setItem(KEY, JSON.stringify({ url: u, key: k, sheetId: info.sheetId, sheetUrl: info.sheetUrl })); } catch {}
      show(j.total, j.todayCount || 0, (j.peak && j.peak.count) || 0, j.peak && j.peak.date);
      if (showMsg) msg.textContent = 'Updated.';
    } catch (err) {
      $('stuTileSub').textContent = 'offline / error';
      if (showMsg) msg.textContent = 'Could not reach the sheet. Check the URL, that the web app is deployed for "Anyone", and your internet.';
    }
  }
  tile.addEventListener('click', () => load(false));
  $('stuLoadBtn').addEventListener('click', () => load(true));
  $('stuXlsBtn').addEventListener('click', () => {
    if (!info.sheetId) { msg.textContent = 'Redeploy the updated Code.gs (README step 1), then tap Save & Refresh Count once.'; return; }
    window.open('https://docs.google.com/spreadsheets/d/' + info.sheetId + '/export?format=xlsx', '_blank');
  });
  $('stuSheetBtn').addEventListener('click', () => {
    const t = info.sheetUrl || (info.sheetId ? 'https://docs.google.com/spreadsheets/d/' + info.sheetId + '/edit' : '');
    if (!t) { msg.textContent = 'Redeploy the updated Code.gs (README step 1), then tap Save & Refresh Count once.'; return; }
    window.open(t, '_blank');
  });
  load(false);                               // automatic on page open
  setInterval(() => { if (!document.hidden) load(false); }, 120000);   // and every 2 minutes
})();


// ---------- V95 NEW: editable Concepts & Formulas (per topic) ----------
let conceptsSeedCache = null;
async function loadConceptsSeed(){
  if (conceptsSeedCache) return conceptsSeedCache;
  const r = await fetch('data/concepts_seed.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('seed missing');
  conceptsSeedCache = await r.json();
  return conceptsSeedCache;
}

function buildConceptsTextBox(subtopic){
  const box = document.createElement('div');
  box.className = 'settings-panel';
  box.style.background = '#FFF8EE';
  const touch = () => { pendingTopicChanges = true; updateExportBarVisibility(); };
  const head = document.createElement('h3');
  head.style.margin = '0 0 6px 0';
  head.textContent = '✏ Editable Concepts & Formulas (text)';
  box.appendChild(head);
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;color:var(--muted);margin-bottom:8px;';
  hint.textContent = 'Students see this as a page inside the app (the PDF above stays as a download). Formula = LaTeX, e.g. \\frac{a}{b}. Notes can use $ $ for maths.';
  box.appendChild(hint);

  const body = document.createElement('div');
  box.appendChild(body);

  function latexInto(el, latex){
    el.textContent = '$$' + (latex || '') + '$$';
    if (window.renderMathInElement) {
      try { renderMathInElement(el, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError: false }); } catch (e) {}
    }
  }
  function mini(label, fn){
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:4px 8px;border:1px solid #d6dbe8;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;';
    b.onclick = fn;
    return b;
  }
  function render(){
    body.innerHTML = '';
    const items = subtopic.conceptsItems || [];
    const status = document.createElement('div');
    status.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:8px;';
    status.textContent = items.length ? (items.filter(i => i.h === undefined).length + ' formulas, ' + items.filter(i => i.h !== undefined).length + ' headings.') : 'No editable concepts for this topic yet.';
    body.appendChild(status);

    if (!items.length) {
      body.appendChild(mini('Load ready-made concepts for this topic', async () => {
        try {
          const seed = await loadConceptsSeed();
          if (!seed[subtopic.id]) { setStatus('No ready-made concepts for "' + subtopic.name + '" - use + Heading / + Formula to write your own.', 'error'); return; }
          subtopic.conceptsItems = JSON.parse(JSON.stringify(seed[subtopic.id].items));
          subtopic.conceptsTextVisible = !!subtopic.conceptsPdfVisible;
          touch(); render();
        } catch (err) { setStatus('Could not load data/concepts_seed.json - upload it into the data folder first.', 'error'); }
      }));
      body.appendChild(document.createTextNode(' '));
    }

    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid #e4e9f5;border-radius:8px;padding:8px;margin:6px 0;background:#fff;';
      const top = document.createElement('div');
      top.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;';
      const tag = document.createElement('span');
      tag.style.cssText = 'font-size:12px;font-weight:700;color:#e65100;';
      tag.textContent = it.h !== undefined ? 'HEADING' : 'FORMULA';
      top.appendChild(tag);
      top.appendChild(mini('↑', () => { if (i > 0) { items.splice(i - 1, 0, items.splice(i, 1)[0]); touch(); render(); } }));
      top.appendChild(mini('↓', () => { if (i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); touch(); render(); } }));
      top.appendChild(mini('✕ Delete', () => { if (window.confirm('Delete this row?')) { items.splice(i, 1); touch(); render(); } }));
      row.appendChild(top);
      if (it.h !== undefined) {
        const t = document.createElement('input');
        t.type = 'text'; t.value = it.h;
        t.style.cssText = 'width:100%;padding:8px;border:1px solid #d6dbe8;border-radius:6px;font-weight:700;';
        t.oninput = () => { it.h = t.value; touch(); };
        trackFocus(t);
        row.appendChild(t);
      } else {
        const f = document.createElement('textarea');
        f.value = it.f || '';
        f.style.cssText = 'width:100%;min-height:56px;font-family:monospace;font-size:13px;resize:vertical;';
        const pv = document.createElement('div');
        pv.style.cssText = 'background:#f4f6fb;border-radius:6px;padding:4px 8px;margin:6px 0;overflow-x:auto;';
        latexInto(pv, it.f);
        f.oninput = () => { it.f = f.value; touch(); latexInto(pv, f.value); };
        trackFocus(f);
        const n = document.createElement('textarea');
        n.value = it.n || '';
        n.placeholder = 'Note: meaning of each symbol, units, when to use';
        n.style.cssText = 'width:100%;min-height:48px;resize:vertical;';
        n.oninput = () => { it.n = n.value; touch(); };
        trackFocus(n);
        row.appendChild(f); row.appendChild(pv); row.appendChild(n);
      }
      body.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
    addRow.appendChild(mini('+ Heading', () => { (subtopic.conceptsItems = subtopic.conceptsItems || []).push({ h: 'New heading' }); touch(); render(); }));
    addRow.appendChild(mini('+ Formula', () => { (subtopic.conceptsItems = subtopic.conceptsItems || []).push({ f: 'a=b+c', n: '' }); touch(); render(); }));
    body.appendChild(addRow);

    const sw = document.createElement('label');
    sw.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-top:10px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!subtopic.conceptsTextVisible;
    cb.style.cssText = 'width:18px;height:18px;';
    const tx = document.createElement('span');
    tx.textContent = cb.checked ? 'ON - students see this page' : 'OFF - hidden (students see the PDF, if on)';
    cb.onchange = () => {
      subtopic.conceptsTextVisible = cb.checked;
      tx.textContent = cb.checked ? 'ON - students see this page' : 'OFF - hidden (students see the PDF, if on)';
      touch();
      setStatus('Editable concepts for "' + subtopic.name + '" are now ' + (cb.checked ? 'ON' : 'OFF') + '. Publish to make this live.', 'ok');
    };
    sw.appendChild(cb); sw.appendChild(tx);
    body.appendChild(sw);
  }
  render();
  return box;
}


// ---------- V104 NEW: Full Subject Tests (Teacher) ----------
(function(){
  const $ = id => document.getElementById(id);
  const st = $('fullStatus');
  $('fullToggle').addEventListener('click', () => { $('fullBody').classList.toggle('open'); draw(); });
  const msg = (t, k) => { st.textContent = t; st.className = 'status-line ' + (k || 'ok'); };
  const touch = () => { pendingTopicChanges = true; updateExportBarVisibility(); };
  function cfgFor(sub){
    if (!DATA.fullTests) DATA.fullTests = [];
    let c = DATA.fullTests.find(x => x.subjectId === sub.id);
    if (!c) { c = { subjectId: sub.id, title: 'Full Subject Test - ' + sub.name, count: 30, durationMin: 60, levels: { '1': true, '2': true }, visible: false }; DATA.fullTests.push(c); }
    if (!c.levels) c.levels = { '1': true, '2': true };
    return c;
  }
  function draw(){
    const box = $('fullList'); box.innerHTML = '';
    DATA.subjects.forEach(sub => {
      const c = (DATA.fullTests || []).find(x => x.subjectId === sub.id) || { title: 'Full Subject Test - ' + sub.name, count: 30, durationMin: 60, levels: { '1': true, '2': true }, visible: false };
      let avail = 0; sub.subtopics.forEach(tp => ['1', '2'].forEach(l => { if (c.levels[l]) avail += ((tp.levels || {})[l] || []).filter(q => q.type !== 'conventional').length; }));
      const row = document.createElement('div'); row.style.cssText = 'padding:8px 4px;border-bottom:1px solid #e4e9f5;font-size:12px;';
      const mk = (label, el) => { const w = document.createElement('label'); w.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin:3px 10px 3px 0;'; w.append(label + ' ', el); return w; };
      const title = document.createElement('input'); title.type = 'text'; title.value = c.title; title.style.cssText = 'width:100%;padding:8px;border:1px solid #d6dbe8;border-radius:8px;font-size:13px;font-weight:700;';
      title.onchange = () => { const k = cfgFor(sub); k.title = title.value.trim() || k.title; touch(); msg('Saved. Publish to GitHub to make it live.'); };
      const num = (v, fn) => { const i = document.createElement('input'); i.type = 'number'; i.min = 1; i.value = v; i.style.cssText = 'width:64px;padding:5px;border:1px solid #d6dbe8;border-radius:6px;'; i.onchange = () => { fn(Number(i.value) || 1); touch(); draw(); msg('Saved. Publish to GitHub to make it live.'); }; return i; };
      const chk = (v, fn) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = v; i.onchange = () => { fn(i.checked); touch(); draw(); msg('Saved. Publish to GitHub to make it live.'); }; return i; };
      const on = document.createElement('div'); on.style.cssText = 'font-weight:700;margin:4px 0;color:' + (c.visible === true ? '#1b8a3a' : '#c0392b');
      on.textContent = c.visible === true ? 'ON - visible to students' : 'OFF - hidden from students';
      const info = document.createElement('div'); info.className = 'hint'; info.textContent = avail + ' questions available · students get ' + Math.min(c.count, avail) + ' (balanced across topics, new mix each attempt)';
      const ctl = document.createElement('div');
      ctl.append(
        mk('ON', chk(c.visible === true, v => { cfgFor(sub).visible = v; })),
        mk('Questions', num(c.count, v => { cfgFor(sub).count = v; })),
        mk('Minutes', num(c.durationMin, v => { cfgFor(sub).durationMin = v; })),
        mk('Level 1', chk(!!c.levels['1'], v => { cfgFor(sub).levels['1'] = v; })),
        mk('Level 2', chk(!!c.levels['2'], v => { cfgFor(sub).levels['2'] = v; }))
      );
      const rs = document.createElement('button'); rs.textContent = 'Reset to automatic defaults'; rs.className = 'btn btn-secondary'; rs.style.cssText = 'font-size:12px;margin-top:4px;';
      rs.onclick = () => { DATA.fullTests = (DATA.fullTests || []).filter(x => x.subjectId !== sub.id); touch(); draw(); msg('Reset. Publish to GitHub to make it live.'); };
      const head = document.createElement('div'); head.style.cssText = 'font-weight:700;color:#2E6FE0;margin-bottom:3px;'; head.textContent = sub.name;
      row.append(head, title, on, info, ctl, rs); box.appendChild(row);
    });
  }
})();


// ---------- V110 NEW: drop-down that holds Manage Subjects / Manage Topics / Change Order / Full Subject Tests / Mixed Topics Tests ----------
(function(){
  const t = document.getElementById('manageGroupToggle'), b = document.getElementById('manageGroupBody'), c = document.getElementById('manageGroupChev');
  if (!t || !b) return;
  t.addEventListener('click', () => { const o = b.classList.toggle('open'); if (c) c.innerHTML = o ? '&#9652;' : '&#9662;'; });
})();


// ---------- V113 NEW: Class Notes show / hide (Teacher) ----------
(function(){
  const $ = id => document.getElementById(id);
  const st = $('notesStatus');
  const msg = (t, k) => { st.textContent = t; st.className = 'status-line ' + (k || 'ok'); };
  const touch = () => { pendingTopicChanges = true; updateExportBarVisibility(); };
  let NOTEMAP = null;
  async function load(){
    if (NOTEMAP) return NOTEMAP;
    try { const r = await fetch('data/notes.json', { cache: 'no-store' }); const j = await r.json(); NOTEMAP = j.topics || {}; }
    catch (e) { NOTEMAP = {}; }
    return NOTEMAP;
  }
  async function draw(){
    const map = await load();
    const master = $('notesMaster');
    master.checked = DATA.classNotesEnabled !== false;
    const paintMaster = () => { $('notesMasterTxt').textContent = master.checked ? 'ALL Class Notes: ON (visible to students)' : 'ALL Class Notes: OFF (hidden from students)'; $('notesMasterTxt').style.color = master.checked ? '#1b8a3a' : '#c0392b'; };
    paintMaster();
    master.onchange = () => { DATA.classNotesEnabled = master.checked; paintMaster(); touch(); msg('Saved. Tap Publish to GitHub to make it live.'); };
    const box = $('notesList'); box.innerHTML = '';
    let any = false;
    DATA.subjects.forEach(sj => sj.subtopics.forEach((tp, i) => {
      const nt = map[tp.id]; if (!nt) return; any = true;
      const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid #e4e9f5;font-size:13px;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = tp.notesVisible !== false;
      const tx = document.createElement('span'); tx.style.flex = '1'; tx.textContent = (i + 1) + '. ' + tp.name + '  (' + nt.pages + ' pages)';
      const state = document.createElement('b'); state.style.fontSize = '12px';
      const paint = () => { state.textContent = cb.checked ? 'ON' : 'OFF'; state.style.color = cb.checked ? '#1b8a3a' : '#c0392b'; };
      paint();
      cb.onchange = () => { tp.notesVisible = cb.checked; paint(); touch(); msg('"' + tp.name + '" notes ' + (cb.checked ? 'ON' : 'OFF') + '. Tap Publish to GitHub.'); };
      row.append(cb, tx, state); box.appendChild(row);
    }));
    if (!any) box.innerHTML = '<div class="hint">No notes files found yet (data/notes.json). Upload the notes pack first.</div>';
  }
  $('notesToggle').addEventListener('click', () => { $('notesBody').classList.toggle('open'); draw(); });
})();


// ---------- V115 NEW: bulk replace Concepts PDFs ----------
(function(){
  const pick=document.getElementById('bulkConceptsPick'), inp=document.getElementById('bulkConceptsInput'),
        list=document.getElementById('bulkConceptsList'), go=document.getElementById('bulkConceptsGo');
  if(!pick) return;
  let matches=[];
  const norm=s=>String(s).toLowerCase().replace(/\.pdf$/,'').replace(/_?concepts_?formulas(_?\d+)?$/,'').replace(/[^a-z0-9]+/g,'');
  function allSubtopics(){
    const out=[]; (DATA&&DATA.subjects||[]).forEach(s=>(s.subtopics||s.topics||[]).forEach(t=>out.push(t))); return out;
  }
  pick.onclick=()=>inp.click();
  inp.onchange=()=>{
    if(!DATA){ setStatus('Question bank not loaded yet - try again in a moment.','error'); return; }
    const subs=allSubtopics(); matches=[]; list.innerHTML='';
    Array.from(inp.files).forEach(f=>{
      const n=norm(f.name);
      const t=subs.find(x=>norm(x.id)===n)||subs.find(x=>norm(x.name)===n);
      const row=document.createElement('div');
      row.textContent=(t?'\u2705 ':'\u274C ')+f.name+(t?'  \u2192  '+t.name:'  (no matching topic - skipped)');
      list.appendChild(row);
      if(t) matches.push({f,t});
    });
    go.style.display=matches.length?'inline-block':'none';
    go.textContent='Upload '+matches.length+' matched PDF'+(matches.length===1?'':'s');
  };
  go.onclick=async()=>{
    go.disabled=true; let ok=0, fail=0;
    for(let i=0;i<matches.length;i++){
      const {f,t}=matches[i];
      try{
        setStatus('Uploading '+(i+1)+' of '+matches.length+': '+f.name+' ...');
        t.conceptsPdfUrl=(cloudinaryConfigured||firebaseSignedIn)?await uploadMedia(f,'concepts-pdfs',f.name):await fileToDataUrl(f);
        t.conceptsPdfVisible=true; ok++;
      }catch(e){ fail++; setStatus('Failed '+f.name+': '+e.message,'error'); }
    }
    pendingTopicChanges=true; updateExportBarVisibility();
    setStatus('Bulk upload done: '+ok+' attached'+(fail?', '+fail+' failed':'')+'. Now Publish to make them live.', fail?'error':'ok');
    go.disabled=false; go.style.display='none'; inp.value=''; matches=[];
  };
})();
