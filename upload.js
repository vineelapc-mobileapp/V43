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

    const table = document.createElement('div');
    table.style.fontSize = '13px';

    subj.subtopics.forEach(st => {
      const l1 = (st.levels['1'] || []);
      const l2 = (st.levels['2'] || []);
      const count = l1.length + l2.length;
      totalQuestions += count;

      [...l1, ...l2].forEach(q => {
        if (!hasVideoSource(q)) missingVideo++;
        if (!q.explanation) missingExplanation++;
      });

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #f0f2fa;cursor:pointer;';
      const flagBits = [];
      const noVideoCount = [...l1, ...l2].filter(q => !hasVideoSource(q)).length;
      const noExplCount = [...l1, ...l2].filter(q => !q.explanation).length;
      if (count === 0) flagBits.push('<span style="color:var(--wrong);">empty</span>');
      if (noVideoCount > 0) flagBits.push(`<span style="color:#e65100;">${noVideoCount} missing video</span>`);
      if (noExplCount > 0) flagBits.push(`<span style="color:var(--muted);">${noExplCount} missing explanation</span>`);
      row.innerHTML = `
        <span>${st.name}</span>
        <span style="text-align:right;">
          <strong>${count}</strong> Qs (L1: ${l1.length}, L2: ${l2.length})
          ${flagBits.length ? '<br><span style="font-size:11px;">' + flagBits.join(' &middot; ') + '</span>' : ''}
        </span>
      `;
      row.onclick = () => toggleSubtopicDetail(st, row, subj.name);
      table.appendChild(row);
    });

    subjBox.appendChild(table);
    verifySummary.appendChild(subjBox);
  });

  const overview = document.createElement('div');
  overview.className = 'settings-panel';
  overview.style.background = '#eef1fb';
  const sizeBytes = new Blob([JSON.stringify(DATA)]).size;
  const sizeMB = sizeBytes / (1024 * 1024);
  const sizeColor = sizeBytes > 900000 ? 'var(--wrong)' : (sizeBytes > 600000 ? '#e65100' : 'var(--correct)');
  const sizeWarning = sizeBytes > 900000
    ? '<br><span style="color:var(--wrong);font-weight:700;">⚠ Over GitHub\'s ~1 MB Publish limit - Publish to GitHub will be blocked until this is smaller (remove a heavy uploaded video, or use a Link instead).</span>'
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
  verifySummary.insertBefore(overview, verifySummary.firstChild);
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

  ['1','2'].forEach(level => {
    const qs = subtopic.levels[level] || [];
    qs.forEach((q, i) => {
      const card = buildQuestionCard(q, {
        label: `Level ${level}, Question ${i + 1} (editing existing content)`,
        removeLabel: 'Delete this question permanently',
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
      verifyDetail.appendChild(card);
    });
  });
  if (qsEmpty(subtopic)) {
    verifyDetail.innerHTML += '<div class="progress-note">No questions in this subtopic yet.</div>';
  }
}
function qsEmpty(subtopic){
  return (subtopic.levels['1'] || []).length === 0 && (subtopic.levels['2'] || []).length === 0;
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

// ---------- Source buttons ----------
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

async function handleFile(file){
  const ext = file.name.split('.').pop().toLowerCase();
  setStatus('Reading ' + file.name + ' ...');
  try {
    let text = '';
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
      text = await extractImageText(file);
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
    setStatus(`Added ${text.length} characters from ${file.name}. Take/choose another page, or review and split below.`, 'ok');
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
  return result.data.text;
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
    // never overwrites something already typed.
    if (!q.question || !q.question.trim()) {
      try {
        setStatus(isPdf ? 'Reading PDF text...' : 'Reading text from image...');
        const extractedText = isPdf ? await extractPdfText(file) : await extractImageText(file);
        if (extractedText && extractedText.trim()) {
          q.question = extractedText.trim();
          qTextArea.value = q.question;
          setStatus('Question text filled in automatically - please check it over for any OCR mistakes.', 'ok');
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
  const answerArea = document.createElement('div');
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
  explLabel.textContent = 'Explanation - the descriptive correct answer shown to students either way';
  box.appendChild(explLabel);

  box.appendChild(buildSymbolToolbar());

  const explTextarea = document.createElement('textarea');
  explTextarea.placeholder = "Explanation, e.g. Corona loss varies with frequency: P = k(f + 25)(V-V0)^2 ... For proper equation typesetting, wrap LaTeX in $ $, e.g. $\\omega C V^2 \\cos\\delta$";
  explTextarea.style.minHeight = '70px';
  explTextarea.value = q.explanation || '';
  explTextarea.oninput = () => { q.explanation = explTextarea.value; if (opts.onChange) opts.onChange(); };
  trackFocus(explTextarea);
  box.appendChild(explTextarea);

  const previewToggle = document.createElement('button');
  previewToggle.type = 'button';
  previewToggle.className = 'btn btn-secondary';
  previewToggle.style.cssText = 'font-size:12px;padding:6px 10px;margin-top:6px;';
  previewToggle.textContent = '👁 Preview how students will see this';
  const previewBox = document.createElement('div');
  previewBox.style.cssText = 'display:none;background:#f4f6fb;border-radius:8px;padding:10px 12px;margin-top:8px;font-size:14px;';
  previewToggle.onclick = () => {
    if (previewBox.style.display === 'block') { previewBox.style.display = 'none'; }
    else { renderMathPreviewInto(previewBox, explTextarea.value); }
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
        explTextarea.value = q.explanation;
      } else if (ext === 'pdf') {
        setStatus('Reading PDF for explanation...');
        const text = await extractPdfText(file);
        q.explanation = (q.explanation ? q.explanation + '\n' : '') + text.trim();
        explTextarea.value = q.explanation;
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

    if (!q.question || !q.question.trim()) {
      qTextArea.classList.add('field-error');
      issues.push(`${labelText}: the question text is empty`);
    }

    if (q.type === 'mcq') {
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
  parsedQuestions.forEach((q, i) => {
    const card = buildQuestionCard(q, {
      label: `Question ${i + 1}`,
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
    if (!q.question) return;
    const isMcq = (q.type || 'mcq') === 'mcq';
    if (isMcq && (q.options.some(o => !o) || q.correctIndex === null)) return; // MCQ needs all 4 options + a correct one marked
    if (!isMcq && !q.correctAnswer) return; // Fill-in needs a correct answer typed in
    const id = subtId + '_l' + level + '_new' + Date.now() + '_' + i;
    subt.levels[level].push({
      id,
      type: isMcq ? 'mcq' : 'fill',
      question: q.question,
      questionImage: q.questionImage || null,
      options: isMcq ? q.options : [],
      correctIndex: isMcq ? q.correctIndex : null,
      correctAnswer: isMcq ? '' : q.correctAnswer,
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
    total += (subt.levels['1'] || []).length + (subt.levels['2'] || []).length;
  }));
  return total;
}

function countSubtopicQuestions(subj, subtopicName){
  const subt = subj.subtopics.find(s => s.name === subtopicName);
  if (!subt) return 0;
  return (subt.levels['1'] || []).length + (subt.levels['2'] || []).length;
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
  if (addedCount === 0) return; // nothing new was added (e.g. only a topic edit) - no count to show
  const subj = DATA.subjects.find(s => s.subtopics.some(st => st.name === subtopicName));
  const topicTotal = subj ? countSubtopicQuestions(subj, subtopicName) : null;
  const grandTotal = countAllQuestions(DATA);
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
        <strong>${addedCount}</strong> new question(s) added${rangeText ? ' (' + rangeText + ' in Level ' + level + ')' : ''}.<br><br>
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
    setStatus('Fill in Publish Settings (username, repo, token) first, then Save Settings.', 'error');
    settingsBody.classList.add('open');
    settingsChev.textContent = '▲';
    return;
  }

  if (!validateAllQuestionCards()) return;

  const { addedCount, subtopicName, level } = mergeIntoData();
  if (addedCount === 0 && !pendingTopicChanges) {
    setStatus('No complete questions to publish - fill in all options and mark a correct answer first.', 'error');
    return;
  }

  // GitHub's Contents API (what Publish uses) fails on writes over roughly
  // 1 MB - a much stricter limit than the 100 MB normal Git push allows.
  // Videos/images embedded in questions push this file's size up fast, so
  // check BEFORE attempting the network call, rather than let it silently
  // fail after a long wait.
  const contentStr = JSON.stringify(DATA, null, 2);
  const sizeBytes = new Blob([contentStr]).size;
  const sizeMB = sizeBytes / (1024 * 1024);
  if (sizeBytes > 900000) {
    const websiteNote = sizeMB > 25
      ? `Your file is ${sizeMB.toFixed(2)} MB, which is also too big for GitHub's website upload (25 MB limit) - you'll need to shrink it first using the Storage Report before either option below will work.`
      : `1) Tap "Download File" below, then on github.com go to your repo → data folder → click questions.json → the pencil (edit) icon → replace the content → Commit. GitHub's website accepts files up to 25 MB this way.`;
    showPublishError(
      `Can't publish automatically - your question bank is now ${sizeMB.toFixed(2)} MB, over GitHub's ~1 MB limit for this kind of update (this is a GitHub limit, not an app bug).\n\n` +
      `This is almost always caused by an uploaded video file or several images.\n\n` +
      `Fastest fix: go to "2. Verify Uploaded Data" → tap "🔍 Show Storage Report" - it lists your heaviest questions first, with a one-tap button to remove each uploaded video/image. Removing the biggest one or two usually solves this immediately.\n\n` +
      `${websiteNote}\n\n` +
      `Either way, replace uploaded videos with a YouTube/Drive Link where you can - a link barely adds any size at all.`
    );
    return;
  }

  publishBtn.disabled = true;
  setStatus('Connecting to GitHub...');

  const apiBase = `https://api.github.com/repos/${s.user}/${s.repo}/contents/${s.path}`;
  const headers = {
    'Authorization': 'Bearer ' + s.token,
    'Accept': 'application/vnd.github+json'
  };

  try {
    // 1. Get current file SHA (required by GitHub to update an existing file)
    setStatus('Fetching current file from GitHub...');
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(s.branch)}`, { headers });
    if (!getRes.ok) {
      const errBody = await getRes.text();
      throw new Error(`Could not read current file (HTTP ${getRes.status}). Check username/repo/path/token. ${errBody.slice(0,300)}`);
    }
    const getJson = await getRes.json();
    const sha = getJson.sha;

    // 2. Push updated content
    setStatus('Publishing update to GitHub...');
    const base64Content = btoa(unescape(encodeURIComponent(contentStr)));

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add ${addedCount} question(s) to ${subtopicName} (Level ${level}) via Teacher Upload`,
        content: base64Content,
        sha,
        branch: s.branch
      })
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`Publish failed (HTTP ${putRes.status}). ${errBody.slice(0,300)}`);
    }

    const topicNote = pendingTopicChanges ? ' New topic(s) published too.' : '';
    setStatus(`Published! Added ${addedCount} question(s) to ${subtopicName} (Level ${level}).${topicNote} Students will see it after GitHub Pages rebuilds (~1-2 min).`, 'ok');
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
    showPublishError('Publish error: ' + err.message);
  } finally {
    publishBtn.disabled = false;
  }
});
