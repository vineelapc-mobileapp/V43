// ---------- State ----------
let DATA = null;
let CONFIG = { teacherWhatsapp: '', teacherEmail: '' };
let state = {
  view: 'subjects',
  subject: null,
  subtopic: null,
  level: null,
  questions: [],
  qIndex: 0,
  status: {},      // qid -> 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked'
  answers: {},     // qid -> {selectedIndex, isCorrect, reviewPending}
  pendingVideoQ: null,
  reviewMode: false,
  doubtContext: null, // the question (or null) a doubt was opened from
  finalElapsedMs: 0 // captured from the optional stopwatch when a test is submitted, 0 if never used
};

const app = document.getElementById('app');
const headerTitle = document.getElementById('headerTitle');
const backBtn = document.getElementById('backBtn');
const paletteToggleBtn = document.getElementById('paletteToggleBtn');
const examStrip = document.getElementById('examStrip');
const examProgressText = document.getElementById('examProgressText');
const stopwatchDisplay = document.getElementById('stopwatchDisplay');
const calcToggleBtn = document.getElementById('calcToggleBtn');
const calcDrawer = document.getElementById('calcDrawer');
const calcDisplay = document.getElementById('calcDisplay');
const calcAngleModeBtn = document.getElementById('calcAngleModeBtn');
const calcCloseBtn = document.getElementById('calcCloseBtn');
const examActionBar = document.getElementById('examActionBar');
const markReviewBtn = document.getElementById('markReviewBtn');
const saveNextBtn = document.getElementById('saveNextBtn');
const paletteOverlay = document.getElementById('paletteOverlay');
const paletteGrid = document.getElementById('paletteGrid');
const closePaletteBtn = document.getElementById('closePaletteBtn');
const submitTestBtn = document.getElementById('submitTestBtn');
const submitConfirmModal = document.getElementById('submitConfirmModal');
const submitSummary = document.getElementById('submitSummary');
const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');

// ---------- Boot ----------
fetch('data/questions.json')
  .then(r => r.json())
  .then(json => { DATA = json; render(); });

fetch('data/config.json')
  .then(r => r.json())
  .then(json => { CONFIG = json; })
  .catch(() => {});

// ---------- Student Profile ----------
const PROFILE_KEY = 'eeeStudentProfile';
function loadProfile(){
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); }
  catch { return null; }
}
function saveProfile(p){
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}
let studentProfile = loadProfile();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
}

backBtn.addEventListener('click', goBack);
paletteToggleBtn.addEventListener('click', openPalette);
closePaletteBtn.addEventListener('click', () => paletteOverlay.classList.add('hidden'));
submitTestBtn.addEventListener('click', openSubmitConfirm);
cancelSubmitBtn.addEventListener('click', () => submitConfirmModal.classList.add('hidden'));
confirmSubmitBtn.addEventListener('click', finishTest);
markReviewBtn.addEventListener('click', () => advance('marked'));
saveNextBtn.addEventListener('click', () => advance('save'));

function goBack(){
  if (state.view === 'subtopics') state.view = 'subjects';
  else if (state.view === 'levels') state.view = 'subtopics';
  else if (state.view === 'quiz') state.view = 'levels';
  else if (state.view === 'results') state.view = 'levels';
  else if (state.view === 'history') state.view = 'subjects';
  else if (state.view === 'doubt') state.view = state.doubtReturnView || 'subjects';
  else if (state.view === 'profile') state.view = state.profileReturnView || 'subjects';
  render();
}

// ---------- Render router ----------
function render(){
  // First-ever launch: nothing is usable until Name/Email/College is filled in.
  if (!studentProfile && state.view !== 'profile') {
    state.view = 'profile';
    state.profileFirstRun = true;
  }

  // Subject color theme: Power Systems keeps the default blueprint navy/copper;
  // Measurements switches to a teal/cyan "instrument panel" theme. Applies
  // whenever a subject is open (subtopics through results), reverts to
  // default on the Subject-selection screen and other subject-agnostic views.
  const themedViews = ['subtopics', 'levels', 'quiz', 'results', 'doubt'];
  if (themedViews.includes(state.view) && state.subject) {
    document.body.classList.toggle('theme-measurements', state.subject.id === 'eem');
  } else {
    document.body.classList.remove('theme-measurements');
  }

  app.innerHTML = '';
  const inQuiz = state.view === 'quiz';
  backBtn.classList.toggle('hidden', state.view === 'subjects' || state.profileFirstRun);
  paletteToggleBtn.classList.toggle('hidden', !inQuiz);
  examStrip.classList.toggle('hidden', !inQuiz);
  examActionBar.classList.toggle('hidden', !inQuiz);

  if (state.view === 'subjects') renderSubjects();
  else if (state.view === 'subtopics') renderSubtopics();
  else if (state.view === 'levels') renderLevels();
  else if (state.view === 'quiz') renderQuiz();
  else if (state.view === 'results') renderResults();
  else if (state.view === 'history') renderHistory();
  else if (state.view === 'doubt') renderDoubtComposer();
  else if (state.view === 'profile') renderProfile();
}

function renderProfile(){
  headerTitle.textContent = state.profileFirstRun ? 'Welcome!' : 'My Profile';

  const card = document.createElement('div');
  card.className = 'question-card';

  if (state.profileFirstRun) {
    const intro = document.createElement('div');
    intro.className = 'question-text';
    intro.style.fontSize = '15px';
    intro.textContent = 'Before you start, tell us a bit about yourself. This helps your teacher know who\'s asking when you send a doubt.';
    card.appendChild(intro);
  }

  const existing = studentProfile || { name: '', email: '', college: '' };

  const nameLabel = document.createElement('label');
  nameLabel.className = 'row-label';
  nameLabel.textContent = 'Full Name';
  card.appendChild(nameLabel);
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = existing.name;
  nameInput.placeholder = 'e.g. Priya Sharma';
  nameInput.style.cssText = 'width:100%;padding:12px;border-radius:8px;border:1px solid #d6dbe8;font-size:15px;margin-bottom:14px;';
  card.appendChild(nameInput);

  const emailLabel = document.createElement('label');
  emailLabel.className = 'row-label';
  emailLabel.textContent = 'Email';
  card.appendChild(emailLabel);
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.value = existing.email;
  emailInput.placeholder = 'e.g. priya@example.com';
  emailInput.style.cssText = 'width:100%;padding:12px;border-radius:8px;border:1px solid #d6dbe8;font-size:15px;margin-bottom:14px;';
  card.appendChild(emailInput);

  const collegeLabel = document.createElement('label');
  collegeLabel.className = 'row-label';
  collegeLabel.textContent = 'College Name';
  card.appendChild(collegeLabel);
  const collegeInput = document.createElement('input');
  collegeInput.type = 'text';
  collegeInput.value = existing.college;
  collegeInput.placeholder = 'e.g. JNTU College of Engineering';
  collegeInput.style.cssText = 'width:100%;padding:12px;border-radius:8px;border:1px solid #d6dbe8;font-size:15px;margin-bottom:6px;';
  card.appendChild(collegeInput);

  const errorLine = document.createElement('div');
  errorLine.style.cssText = 'color:var(--wrong);font-size:13px;margin-bottom:10px;min-height:16px;';
  card.appendChild(errorLine);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary full-width';
  saveBtn.textContent = state.profileFirstRun ? 'Continue' : 'Save Changes';
  saveBtn.onclick = () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const college = collegeInput.value.trim();
    if (!name || !email || !college) {
      errorLine.textContent = 'Please fill in all three fields.';
      return;
    }
    studentProfile = { name, email, college };
    saveProfile(studentProfile);
    const wasFirstRun = state.profileFirstRun;
    state.profileFirstRun = false;
    state.view = wasFirstRun ? 'subjects' : (state.profileReturnView || 'subjects');
    render();
  };
  card.appendChild(saveBtn);

  app.appendChild(card);
}

// ---------- Subjects / Subtopics / Levels ----------
function renderSubjects(){
  headerTitle.textContent = 'Choose Subject';

  const profileBtn = document.createElement('div');
  profileBtn.className = 'list-card';
  profileBtn.style.background = '#f4f6fb';
  profileBtn.innerHTML = `<div><div>&#128100; ${studentProfile ? studentProfile.name : 'My Profile'}</div><div class="meta">${studentProfile ? studentProfile.college : 'Set up your details'}</div></div><div>&#8250;</div>`;
  profileBtn.onclick = () => { state.profileReturnView = 'subjects'; state.view = 'profile'; render(); };
  app.appendChild(profileBtn);

  const historyBtn = document.createElement('div');
  historyBtn.className = 'list-card';
  historyBtn.style.background = '#eef1fb';
  historyBtn.innerHTML = `<div><div>&#128202; My Test History</div><div class="meta">See your past scores and dates</div></div><div>&#8250;</div>`;
  historyBtn.onclick = () => { state.view = 'history'; render(); };
  app.appendChild(historyBtn);

  // "Ask a Doubt" entry point intentionally hidden for now (see note near
  // openDoubtComposer below) - re-enable once students are onboarded.

  DATA.subjects.filter(sub => sub.visible !== false).forEach(sub => {
    const card = document.createElement('div');
    const themeClass = sub.id === 'eem' ? 'subject-measurements' : 'subject-power';
    card.className = 'list-card ' + themeClass;
    card.innerHTML = `<div><div>${sub.name}</div><div class="meta">${sub.subtopics.length} subtopics</div></div><div>&#8250;</div>`;
    card.onclick = () => { state.subject = sub; state.view = 'subtopics'; render(); };
    app.appendChild(card);
  });
}

function renderSubtopics(){
  headerTitle.textContent = state.subject.name;
  state.subject.subtopics.forEach(st => {
    const l1 = (st.levels['1'] || []).length;
    const l2 = (st.levels['2'] || []).length;
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `<div><div>${st.name}</div><div class="meta">Level-1: ${l1} &nbsp;|&nbsp; Level-2: ${l2}</div></div><div>&#8250;</div>`;
    card.onclick = () => { state.subtopic = st; state.view = 'levels'; render(); };
    app.appendChild(card);
  });
}

function renderLevels(){
  headerTitle.textContent = state.subtopic.name;
  const wrap = document.createElement('div');
  wrap.className = 'question-card';
  wrap.innerHTML = `<div class="question-text">Select difficulty level</div>`;
  ['1','2'].forEach(lvl => {
    const qs = state.subtopic.levels[lvl] || [];
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (qs.length === 0 ? ' disabled' : '');
    btn.textContent = `Level-${lvl} (${qs.length} Qs)`;
    if (qs.length > 0) btn.onclick = () => startQuiz(lvl, qs);
    wrap.appendChild(btn);
  });
  app.appendChild(wrap);
}

function startQuiz(level, qs){
  state.level = level;
  state.questions = qs;
  state.qIndex = 0;
  state.status = {};
  state.answers = {};
  qs.forEach(q => { state.status[q.id] = 'not-visited'; });
  state.status[qs[0].id] = 'not-answered';
  state.view = 'quiz';
  resetStopwatch(); // fresh test, fresh timer - previous test's time never carries over
  render();
}

// ---------- Optional Stopwatch ----------
// Purely informational for the student - never enforced, never limits the
// test. Starts at 0, tap to start/pause, resets automatically on a new test.
// ---------- Scientific calculator (opens as a bottom drawer, doesn't cover
// the question - #app gets extra bottom padding while it's open so nothing
// ends up hidden behind it, and the question stays scrollable/visible). ----------
let calcExpr = '';
let calcAngleMode = 'deg'; // 'deg' or 'rad'
let calcOpen = false;

function calcToggleOpen(){
  calcOpen = !calcOpen;
  calcDrawer.classList.toggle('calc-closed', !calcOpen);
  calcToggleBtn.classList.toggle('active', calcOpen);
  app.classList.toggle('calc-open', calcOpen);
}
calcToggleBtn.addEventListener('click', calcToggleOpen);
calcCloseBtn.addEventListener('click', calcToggleOpen);

calcAngleModeBtn.addEventListener('click', () => {
  calcAngleMode = calcAngleMode === 'deg' ? 'rad' : 'deg';
  calcAngleModeBtn.textContent = calcAngleMode.toUpperCase();
  calcAngleModeBtn.classList.toggle('rad', calcAngleMode === 'rad');
});

function calcUpdateDisplay(){
  calcDisplay.textContent = calcExpr || '0';
}

// Evaluates the expression safely - only ever runs Math functions and plain
// arithmetic the student typed via the calculator buttons, nothing else
// reaches this (no free-text input field exists), so this cannot execute
// arbitrary code from anywhere else in the page.
function calcEvaluate(expr){
  const toRad = deg => deg * Math.PI / 180;
  const wrapTrig = (fn, inverse) => (x) => {
    if (calcAngleMode === 'deg' && !inverse) return fn(toRad(x));
    if (calcAngleMode === 'deg' && inverse) return fn(x) * 180 / Math.PI;
    return fn(x);
  };
  const scope = {
    sin: wrapTrig(Math.sin), cos: wrapTrig(Math.cos), tan: wrapTrig(Math.tan),
    log: Math.log10 || (x => Math.log(x) / Math.LN10),
    ln: Math.log,
    sqrt: Math.sqrt,
    pi: Math.PI, e: Math.E,
    abs: Math.abs
  };
  // Translate calculator syntax into real JS math before evaluating:
  // ^ -> ** (power), and bare function names get explicit () calls.
  let jsExpr = expr.replace(/\^/g, '**');
  jsExpr = jsExpr.replace(/√/g, 'sqrt');
  const fn = new Function(...Object.keys(scope), `"use strict"; return (${jsExpr});`);
  const result = fn(...Object.values(scope));
  if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid result');
  return result;
}

calcDrawer.addEventListener('click', (e) => {
  const btn = e.target.closest('.calc-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const fnName = btn.dataset.fn;
  const val = btn.dataset.val;

  if (action === 'clear') {
    calcExpr = '';
  } else if (action === 'back') {
    calcExpr = calcExpr.slice(0, -1);
  } else if (action === 'equals') {
    try {
      const result = calcEvaluate(calcExpr);
      calcExpr = String(Math.round(result * 1e10) / 1e10);
    } catch (err) {
      calcExpr = 'Error';
      calcUpdateDisplay();
      setTimeout(() => { calcExpr = ''; calcUpdateDisplay(); }, 900);
      return;
    }
  } else if (fnName) {
    calcExpr += fnName + '(';
  } else if (val === 'pi') {
    calcExpr += 'pi';
  } else if (val !== undefined) {
    calcExpr += val;
  }
  calcUpdateDisplay();
});

let stopwatch = { running: false, elapsedMs: 0, startedAt: null, intervalId: null };

function formatStopwatch(ms){
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}
function updateStopwatchDisplay(){
  const current = stopwatch.elapsedMs + (stopwatch.running ? Date.now() - stopwatch.startedAt : 0);
  stopwatchDisplay.textContent = '\u23F1 ' + formatStopwatch(current);
  stopwatchDisplay.classList.toggle('running', stopwatch.running);
}
function toggleStopwatch(){
  if (stopwatch.running) {
    stopwatch.elapsedMs += Date.now() - stopwatch.startedAt;
    stopwatch.running = false;
    clearInterval(stopwatch.intervalId);
  } else {
    stopwatch.startedAt = Date.now();
    stopwatch.running = true;
    stopwatch.intervalId = setInterval(updateStopwatchDisplay, 1000);
  }
  updateStopwatchDisplay();
}
function resetStopwatch(){
  clearInterval(stopwatch.intervalId);
  stopwatch = { running: false, elapsedMs: 0, startedAt: null, intervalId: null };
  if (stopwatchDisplay) updateStopwatchDisplay();
}
function getStopwatchElapsedMs(){
  return stopwatch.elapsedMs + (stopwatch.running ? Date.now() - stopwatch.startedAt : 0);
}
if (stopwatchDisplay) {
  stopwatchDisplay.addEventListener('click', toggleStopwatch);
}

// ---------- Quiz (exam-hall view) ----------
function renderQuiz(){
  const q = state.questions[state.qIndex];
  headerTitle.textContent = `${state.subtopic.name} - L${state.level}`;
  examProgressText.textContent = `Question ${state.qIndex + 1} of ${state.questions.length}`;

  if (state.status[q.id] === 'not-visited') state.status[q.id] = 'not-answered';

  const card = document.createElement('div');
  card.className = 'question-card';
  const qText = document.createElement('div');
  qText.className = 'question-text';
  qText.textContent = q.question && q.question.trim()
    ? `Q${state.qIndex + 1}. ${q.question}`
    : `Q${state.qIndex + 1}.`; // no text - the figure below is the question itself
  card.appendChild(qText);
  renderMathIn(qText);

  if (q.questionImage) {
    const qImg = document.createElement('img');
    qImg.src = q.questionImage;
    qImg.className = 'question-image';
    qImg.alt = 'Figure for this question';
    card.appendChild(qImg);
  }

  const existing = state.answers[q.id];
  const isFill = q.type === 'fill';

  if (isFill) {
    renderFillAnswerArea(q, card, existing);
  } else {
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      let letterContent = letters[idx];
      if (existing) {
        if (idx === existing.selectedIndex && !existing.isCorrect) letterContent = '&#10007;';
        else if (idx === q.correctIndex) letterContent = '&#10003;';
      }
      btn.innerHTML = `<span class="opt-letter">${letterContent}</span><span class="opt-text">${opt}</span>`;
      if (existing) {
        btn.disabled = true;
        if (idx === existing.selectedIndex && !existing.isCorrect) btn.classList.add('wrong');
        if (idx === q.correctIndex) btn.classList.add('correct');
      } else {
        btn.onclick = () => handleAnswer(q, idx, card);
      }
      card.appendChild(btn);
      renderMathIn(btn.querySelector('.opt-text'));
    });
  }

  app.appendChild(card);

  // Redrawing an already-answered question (e.g. jumped to via the palette) -
  // reshow whichever explanation panel applies, same as the moment it was answered.
  if (existing) {
    if (existing.isCorrect) renderCorrectAnswerPanel(q, card);
    else renderWrongAnswerPanel(q, card);
  }

  // "Ask a doubt about this question" link intentionally hidden for now -
  // re-enable once students are onboarded (see openDoubtComposer below,
  // which is kept fully intact and ready to reconnect).
}

// ---------- Fill in the Blank / Numeric answer questions ----------
function renderFillAnswerArea(q, cardEl, existing){
  const wrap = document.createElement('div');
  wrap.className = 'fill-answer-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fill-answer-input';
  input.placeholder = 'Type your answer';
  input.inputMode = 'decimal';

  if (existing) {
    input.value = existing.typedAnswer || '';
    input.disabled = true;
    input.classList.add(existing.isCorrect ? 'correct' : 'wrong');
  } else {
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Submit Answer';
    submitBtn.onclick = () => {
      if (!input.value.trim()) return;
      handleFillAnswer(q, input.value.trim(), cardEl, input);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitBtn.click(); });
    wrap.appendChild(input);
    wrap.appendChild(submitBtn);
    cardEl.appendChild(wrap);
    return;
  }
  wrap.appendChild(input);
  if (!existing.isCorrect) {
    const correctLine = document.createElement('div');
    correctLine.className = 'fill-correct-line';
    correctLine.textContent = 'Correct answer: ' + q.correctAnswer;
    wrap.appendChild(correctLine);
  }
  cardEl.appendChild(wrap);
}

// Numeric answers accept a small tolerance (rounding-friendly); text answers
// match loosely - trimmed, case-insensitive, extra spaces ignored.
function checkFillAnswer(typed, correct){
  const typedNum = parseFloat(typed);
  const correctNum = parseFloat(correct);
  if (!isNaN(typedNum) && !isNaN(correctNum)) {
    const tolerance = Math.max(Math.abs(correctNum) * 0.02, 0.01); // ~2% or a small fixed margin
    return Math.abs(typedNum - correctNum) <= tolerance;
  }
  const norm = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(typed) === norm(correct);
}

function handleFillAnswer(q, typedAnswer, cardEl, inputEl){
  const isCorrect = checkFillAnswer(typedAnswer, q.correctAnswer);
  inputEl.disabled = true;
  inputEl.classList.add(isCorrect ? 'correct' : 'wrong');
  const submitBtn = cardEl.querySelector('.fill-answer-wrap .btn-primary');
  if (submitBtn) submitBtn.remove();

  if (!isCorrect) {
    const correctLine = document.createElement('div');
    correctLine.className = 'fill-correct-line';
    correctLine.textContent = 'Correct answer: ' + q.correctAnswer;
    cardEl.querySelector('.fill-answer-wrap').appendChild(correctLine);
  }

  const wasMarked = state.status[q.id] === 'marked' || state.status[q.id] === 'answered-marked';
  state.status[q.id] = wasMarked ? 'answered-marked' : 'answered';
  state.answers[q.id] = { typedAnswer, isCorrect, reviewPending: false };

  if (!isCorrect) {
    state.pendingVideoQ = q;
    renderWrongAnswerPanel(q, cardEl);
    if (hasVideo(q)) {
      setTimeout(() => videoPromptModal.classList.remove('hidden'), 400);
    }
  } else {
    renderCorrectAnswerPanel(q, cardEl);
  }
}

function handleAnswer(q, selectedIndex, cardEl){
  const allOpts = cardEl.querySelectorAll('.option');
  allOpts.forEach(o => o.disabled = true);

  const isCorrect = selectedIndex === q.correctIndex;
  allOpts[selectedIndex].classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) allOpts[q.correctIndex].classList.add('correct');

  // Swap the A/B/C/D letter for a tick/cross once answered, on top of the
  // existing green/red coloring - makes right vs. wrong unambiguous at a glance.
  const selectedLetter = allOpts[selectedIndex].querySelector('.opt-letter');
  if (selectedLetter) selectedLetter.innerHTML = isCorrect ? '&#10003;' : '&#10007;';
  if (!isCorrect) {
    const correctLetter = allOpts[q.correctIndex].querySelector('.opt-letter');
    if (correctLetter) correctLetter.innerHTML = '&#10003;';
  }

  const wasMarked = state.status[q.id] === 'marked' || state.status[q.id] === 'answered-marked';
  state.status[q.id] = wasMarked ? 'answered-marked' : 'answered';
  state.answers[q.id] = { selectedIndex, isCorrect, reviewPending: false };

  if (!isCorrect) {
    state.pendingVideoQ = q;
    renderWrongAnswerPanel(q, cardEl); // shown immediately, doesn't wait on the popup choice
    if (hasVideo(q)) {
      setTimeout(() => videoPromptModal.classList.remove('hidden'), 400);
    }
  } else {
    renderCorrectAnswerPanel(q, cardEl);
  }
}

// Shown immediately below the options on a wrong answer - unlike the correct-
// answer panel, this one isn't collapsed, since the student specifically
// needs the reason right now. The Watch Now / After Test popup still appears
// separately on top; this stays on the page either way so the reason is
// never lost even if they dismiss the popup with "After Test".
function renderWrongAnswerPanel(q, cardEl){
  const hasContent = !!(q.explanation || q.explanationImage || q.audioFile || hasVideo(q));
  if (!hasContent) return; // nothing to show - the correct answer is already marked on the options themselves
  const panel = document.createElement('div');
  panel.className = 'wrong-panel';
  const imageHtml = q.explanationImage
    ? `<img src="${q.explanationImage}" alt="Explanation" class="explanation-image">`
    : '';
  const videoLinkHtml = hasVideo(q) ? '<span class="video-link">Watch Video Solution</span>' : '';
  const audioHtml = q.audioFile ? `<audio controls class="audio-explanation" src="${q.audioFile}"></audio>` : '';
  const explanationHtml = q.explanation ? `<p class="explanation-text">${q.explanation}</p>` : '';
  panel.innerHTML = `
    <div class="wrong-panel-label">&#10007; Not quite - here's why the correct answer is right</div>
    ${imageHtml}
    ${explanationHtml}
    ${audioHtml}
    ${videoLinkHtml}
  `;
  const videoLinkEl = panel.querySelector('.video-link');
  if (videoLinkEl) videoLinkEl.onclick = () => playVideo(q, 'quiz');
  cardEl.appendChild(panel);
  renderMathIn(panel.querySelector('.explanation-text'));
}

// Renders any $...$ / $$...$$ LaTeX inside an explanation as typeset math.
// Falls back silently to plain text if KaTeX isn't loaded or nothing to render.
// A question's video is only ever shown if BOTH the teacher ticked "Video
// is ready" AND there's actually a video source (uploaded file or link).
function hasVideo(q){
  return !!(q.videoReady && (q.videoFile || q.videoUrl));
}

function renderMathIn(el){
  if (!el || typeof window.renderMathInElement !== 'function') return;
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  } catch (e) { /* leave as plain text */ }
}

// Non-blocking "why is this correct" panel — shown only on correct answers.
// Unlike the wrong-answer flow, this never interrupts progress: no popup,
// no forced action. Save & Next works regardless of whether it's opened.
function renderCorrectAnswerPanel(q, cardEl){
  const hasContent = !!(q.explanation || q.explanationImage || q.audioFile || hasVideo(q));
  if (!hasContent) return; // nothing to show - the correct-answer tick already confirms it

  const panel = document.createElement('div');
  panel.className = 'correct-panel';

  const label = document.createElement('div');
  label.className = 'correct-panel-label';
  label.innerHTML = '&#10003; Correct! Here\'s the full explanation:';
  panel.appendChild(label);

  const body = document.createElement('div');
  body.className = 'correct-panel-body';
  const imageHtml = q.explanationImage
    ? `<img src="${q.explanationImage}" alt="Explanation" class="explanation-image">`
    : '';
  const explanationHtml = q.explanation ? `<p class="explanation-text">${q.explanation}</p>` : '';
  body.innerHTML = `
    ${imageHtml}
    ${explanationHtml}
    ${q.audioFile ? `<audio controls class="audio-explanation" src="${q.audioFile}"></audio>` : ''}
    ${hasVideo(q) ? '<span class="video-link">Watch Video Solution</span>' : ''}
  `;
  const videoLinkEl = body.querySelector('.video-link');
  if (videoLinkEl) videoLinkEl.onclick = () => playVideo(q, 'quiz');
  renderMathIn(body.querySelector('.explanation-text'));

  panel.appendChild(body);
  cardEl.appendChild(panel);
}

// ---------- Save & Next / Mark for Review ----------
function advance(mode){
  const q = state.questions[state.qIndex];
  if (mode === 'marked') {
    const answered = !!state.answers[q.id];
    state.status[q.id] = answered ? 'answered-marked' : 'marked';
  }
  if (state.qIndex + 1 < state.questions.length) {
    state.qIndex++;
    render();
  } else {
    openSubmitConfirm();
  }
}

function jumpTo(index){
  state.qIndex = index;
  paletteOverlay.classList.add('hidden');
  render();
}

// ---------- Palette ----------
function openPalette(){
  paletteGrid.innerHTML = '';
  state.questions.forEach((q, i) => {
    const btn = document.createElement('button');
    const st = state.status[q.id] || 'not-visited';
    btn.className = 'palette-num ' + st + (i === state.qIndex ? ' current' : '');
    btn.textContent = i + 1;
    btn.onclick = () => jumpTo(i);
    paletteGrid.appendChild(btn);
  });
  paletteOverlay.classList.remove('hidden');
}

// ---------- Submit ----------
function openSubmitConfirm(){
  let answered = 0, notAnswered = 0, marked = 0;
  state.questions.forEach(q => {
    const st = state.status[q.id];
    if (st === 'answered' || st === 'answered-marked') answered++;
    else notAnswered++;
    if (st === 'marked' || st === 'answered-marked') marked++;
  });
  submitSummary.innerHTML = `
    <div><span class="num">${answered}</span>Answered</div>
    <div><span class="num">${notAnswered}</span>Not Answered</div>
    <div><span class="num">${marked}</span>Marked for Review</div>
    <div><span class="num">${state.questions.length}</span>Total Questions</div>
  `;
  paletteOverlay.classList.add('hidden');
  submitConfirmModal.classList.remove('hidden');
}

function finishTest(){
  submitConfirmModal.classList.add('hidden');
  state.completedAt = new Date().toISOString();
  state.finalElapsedMs = getStopwatchElapsedMs(); // captured before the timer stops, only meaningful if the student actually used it
  if (stopwatch.running) toggleStopwatch(); // stop ticking, no point running in the background on Results
  recordTestHistory();
  state.view = 'results';
  render();
}

// ---------- Test History (stored on this device) ----------
const HISTORY_KEY = 'eeeTestHistory';

function loadHistory(){
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function recordTestHistory(){
  let correct = 0;
  state.questions.forEach(q => {
    const a = state.answers[q.id];
    if (a && a.isCorrect) correct++;
  });
  const entry = {
    studentName: studentProfile ? studentProfile.name : '',
    subject: state.subject.name,
    subtopic: state.subtopic.name,
    level: state.level,
    correct,
    total: state.questions.length,
    dateISO: state.completedAt,
    elapsedMs: state.finalElapsedMs || 0
  };
  const history = loadHistory();
  history.unshift(entry);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}
function formatDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}
// ---------- Ask a Doubt ----------
// No backend exists yet (see Teacher app's Student Doubts tab), so this routes
// the doubt straight to the teacher via WhatsApp or Email - channels that
// already work today, rather than a fake in-app inbox nobody would see.
let doubtVoiceFile = null;
let doubtAttachFile = null;
let mediaRecorder = null;
let recordedChunks = [];

function openDoubtComposer(question){
  state.doubtContext = question; // null = general doubt, not tied to a specific question
  state.doubtReturnView = state.view;
  doubtVoiceFile = null;
  doubtAttachFile = null;
  state.view = 'doubt';
  render();
}

function renderDoubtComposer(){
  headerTitle.textContent = 'Ask a Doubt';
  const q = state.doubtContext;

  const card = document.createElement('div');
  card.className = 'question-card';

  const contextBox = document.createElement('div');
  contextBox.style.cssText = 'background:#fff3e0;border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;';
  if (q) {
    contextBox.innerHTML = `
      <strong>Question:</strong> ${q.question}<br>
      <span style="color:var(--muted);">${state.subject.name} &middot; ${state.subtopic.name} &middot; Level ${state.level}</span>
    `;
  } else if (state.subject && state.subtopic) {
    contextBox.innerHTML = `
      <strong>Topic:</strong> ${state.subtopic.name}<br>
      <span style="color:var(--muted);">${state.subject.name}${state.level ? ' &middot; Level ' + state.level : ''}</span>
    `;
  } else {
    contextBox.innerHTML = `<span style="color:var(--muted);">General doubt - not tied to a specific topic. Please mention the subject/topic in your message.</span>`;
  }
  card.appendChild(contextBox);

  const label1 = document.createElement('label');
  label1.className = 'row-label';
  label1.textContent = 'Your message';
  card.appendChild(label1);

  const msgBox = document.createElement('textarea');
  msgBox.className = 'raw-text';
  msgBox.style.minHeight = '90px';
  msgBox.placeholder = 'Type your doubt here - be specific about which part is confusing...';
  card.appendChild(msgBox);

  // ---- Voice recording ----
  const voiceRow = document.createElement('div');
  voiceRow.style.marginBottom = '12px';
  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'btn btn-secondary';
  recordBtn.textContent = '🎤 Record Voice Note';
  const voiceStatus = document.createElement('div');
  voiceStatus.style.cssText = 'font-size:12px;color:var(--muted);margin-top:6px;';

  let isRecording = false;
  recordBtn.onclick = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          doubtVoiceFile = new File([blob], 'doubt-voice.webm', { type: 'audio/webm' });
          voiceStatus.textContent = 'Voice note recorded (' + Math.round(blob.size / 1024) + ' KB). Tap Record again to re-record.';
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        recordBtn.textContent = '⏹ Stop Recording';
        voiceStatus.textContent = 'Recording...';
      } catch (err) {
        voiceStatus.textContent = 'Could not access microphone: ' + err.message;
      }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      recordBtn.textContent = '🎤 Record Voice Note';
    }
  };
  voiceRow.appendChild(recordBtn);
  voiceRow.appendChild(voiceStatus);
  card.appendChild(voiceRow);

  // ---- Attach photo/PDF ----
  const attachRow = document.createElement('div');
  attachRow.style.marginBottom = '14px';
  const attachBtn = document.createElement('button');
  attachBtn.type = 'button';
  attachBtn.className = 'btn btn-secondary';
  attachBtn.textContent = '📎 Attach Photo or PDF';
  const attachInput = document.createElement('input');
  attachInput.type = 'file';
  attachInput.accept = '.pdf,.jpg,.jpeg,.png';
  attachInput.style.display = 'none';
  const attachStatus = document.createElement('div');
  attachStatus.style.cssText = 'font-size:12px;color:var(--muted);margin-top:6px;';

  attachBtn.onclick = () => attachInput.click();
  attachInput.onchange = () => {
    if (attachInput.files.length) {
      doubtAttachFile = attachInput.files[0];
      attachStatus.textContent = 'Attached: ' + doubtAttachFile.name;
    }
  };
  attachRow.appendChild(attachBtn);
  attachRow.appendChild(attachInput);
  attachRow.appendChild(attachStatus);
  card.appendChild(attachRow);

  const sendStatus = document.createElement('div');
  sendStatus.style.cssText = 'font-size:13px;margin-bottom:10px;min-height:18px;';
  card.appendChild(sendStatus);

  function buildContextText(){
    const who = studentProfile
      ? `From: ${studentProfile.name} (${studentProfile.email}) - ${studentProfile.college}`
      : 'From: (profile not set)';
    let ctx = q
      ? `Doubt about a question:\n"${q.question}"\n(${state.subject.name} - ${state.subtopic.name} - Level ${state.level})`
      : (state.subject && state.subtopic
          ? `Doubt about topic: ${state.subtopic.name} (${state.subject.name})`
          : 'General doubt');
    return who + '\n\n' + ctx + '\n\nMessage: ' + (msgBox.value.trim() || '(no message typed - see attachment)');
  }

  async function sendDoubt(channel){
    const text = buildContextText();
    const files = [doubtVoiceFile, doubtAttachFile].filter(Boolean);

    // Best path on mobile: native share sheet, lets the student pick WhatsApp,
    // email, or anything else, with files attached directly.
    if (navigator.canShare && files.length > 0 && navigator.canShare({ files })) {
      try {
        await navigator.share({ title: 'Student Doubt', text, files });
        sendStatus.textContent = 'Shared! Choose your app from the share menu to finish sending.';
        return;
      } catch (err) {
        // user cancelled the share sheet - fall through to link-based fallback
      }
    }

    // Fallback: open WhatsApp/Email with the message pre-filled; attachments
    // (if any) are downloaded so the student can attach them manually, since
    // wa.me/mailto links cannot carry files themselves.
    if (channel === 'whatsapp') {
      if (!CONFIG.teacherWhatsapp) {
        sendStatus.textContent = 'Teacher WhatsApp number not set up yet - ask your teacher to configure data/config.json.';
        return;
      }
      window.open(`https://wa.me/${CONFIG.teacherWhatsapp}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      if (!CONFIG.teacherEmail) {
        sendStatus.textContent = 'Teacher email not set up yet - ask your teacher to configure data/config.json.';
        return;
      }
      window.location.href = `mailto:${CONFIG.teacherEmail}?subject=${encodeURIComponent('Student Doubt')}&body=${encodeURIComponent(text)}`;
    }

    files.forEach(f => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      URL.revokeObjectURL(url);
    });
    if (files.length > 0) {
      sendStatus.textContent = 'Message opened - please attach the downloaded file(s) manually before sending.';
    } else {
      sendStatus.textContent = 'Message opened in your app - just hit send there.';
    }
  }

  const waBtn = document.createElement('button');
  waBtn.className = 'btn btn-primary full-width';
  waBtn.style.background = '#25D366';
  waBtn.textContent = 'Send via WhatsApp';
  waBtn.onclick = () => sendDoubt('whatsapp');
  card.appendChild(waBtn);

  const emailBtn = document.createElement('button');
  emailBtn.className = 'btn btn-secondary full-width';
  emailBtn.style.marginTop = '10px';
  emailBtn.textContent = 'Send via Email';
  emailBtn.onclick = () => sendDoubt('email');
  card.appendChild(emailBtn);

  app.appendChild(card);
}

function renderHistory(){
  headerTitle.textContent = 'My Test History';
  const history = loadHistory();
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'question-card';
    empty.innerHTML = '<div class="question-text">No tests completed yet on this device.</div>';
    app.appendChild(empty);
    return;
  }
  history.forEach(h => {
    const pct = Math.round((h.correct / h.total) * 100);
    const row = document.createElement('div');
    row.className = 'result-row';
    const timeLine = h.elapsedMs > 0
      ? `<div class="ans-line" style="color:var(--muted);font-family:var(--mono);">&#9201; ${formatStopwatch(h.elapsedMs)}</div>`
      : '';
    row.innerHTML = `
      <div class="q">${h.subtopic} - Level ${h.level}</div>
      <div class="ans-line">${h.subject}</div>
      <div class="ans-line correct-ans">Score: ${h.correct} / ${h.total} (${pct}%)</div>
      <div class="ans-line" style="color:var(--muted);">Completed: ${formatDate(h.dateISO)}</div>
      ${timeLine}
    `;
    app.appendChild(row);
  });
}

// ---------- Video Prompt ----------
const videoPromptModal = document.getElementById('videoPromptModal');
const videoPlayerModal = document.getElementById('videoPlayerModal');
const videoFrame = document.getElementById('videoFrame');
const videoFileEl = document.getElementById('videoFileEl');
const watchNowBtn = document.getElementById('watchNowBtn');
const watchAfterBtn = document.getElementById('watchAfterBtn');
const closeVideoBtn = document.getElementById('closeVideoBtn');

watchNowBtn.onclick = () => {
  videoPromptModal.classList.add('hidden');
  playVideo(state.pendingVideoQ, 'quiz');
};

watchAfterBtn.onclick = () => {
  videoPromptModal.classList.add('hidden');
  const a = state.answers[state.pendingVideoQ.id];
  if (a) a.reviewPending = true;
};

closeVideoBtn.onclick = () => {
  videoPlayerModal.classList.add('hidden');
  videoFrame.src = '';
  videoFileEl.pause();
  videoFileEl.src = '';
  if (state.reviewMode) {
    state.reviewMode = false;
    state.view = 'results';
    render();
  }
};

// Plays whichever source the question has - an uploaded video file takes
// priority (native <video> playback) over a pasted link (embedded iframe).
function playVideo(q, context){
  if (q.videoFile) {
    videoFrame.classList.add('hidden');
    videoFrame.src = '';
    videoFileEl.classList.remove('hidden');
    videoFileEl.src = q.videoFile;
  } else {
    videoFileEl.classList.add('hidden');
    videoFileEl.src = '';
    videoFrame.classList.remove('hidden');
    videoFrame.src = q.videoUrl;
  }
  videoPlayerModal.classList.remove('hidden');
  state.reviewMode = (context === 'results');
}

// ---------- Results ----------
function renderResults(){
  headerTitle.textContent = 'Results';
  paletteToggleBtn.classList.add('hidden');
  examStrip.classList.add('hidden');
  examActionBar.classList.add('hidden');

  let correct = 0, attempted = 0;
  state.questions.forEach(q => {
    const a = state.answers[q.id];
    if (a) { attempted++; if (a.isCorrect) correct++; }
  });

  const summary = document.createElement('div');
  summary.className = 'score-summary';
  const dateLine = state.completedAt
    ? `<div style="font-size:12px;opacity:0.85;margin-top:4px;">Completed: ${formatDate(state.completedAt)}</div>`
    : '';
  const timeLine = state.finalElapsedMs > 0
    ? `<div style="font-size:12px;opacity:0.85;margin-top:2px;font-family:var(--mono);">&#9201; Time taken: ${formatStopwatch(state.finalElapsedMs)}</div>`
    : '';
  summary.innerHTML = `<div class="big">${correct} / ${state.questions.length}</div><div>${state.subtopic.name} - Level ${state.level} &nbsp;(${attempted} attempted)</div>${dateLine}${timeLine}`;
  app.appendChild(summary);

  state.questions.forEach((q, i) => {
    const a = state.answers[q.id];
    const row = document.createElement('div');
    row.className = 'result-row';
    const isFill = q.type === 'fill';
    const correctDisplay = isFill ? q.correctAnswer : q.options[q.correctIndex];
    let body;
    if (!a) {
      body = `<div class="ans-line not-attempted">Not attempted</div>
              <div class="ans-line correct-ans">Correct answer: ${correctDisplay}</div>`;
    } else {
      const yourAns = isFill ? a.typedAnswer : q.options[a.selectedIndex];
      body = `<div class="ans-line ${a.isCorrect ? 'correct-ans' : 'wrong-ans'}">Your answer: ${yourAns}</div>
              ${a.isCorrect ? '' : `<div class="ans-line correct-ans">Correct answer: ${correctDisplay}</div>`}`;
    }
    row.innerHTML = `<div class="q">Q${i + 1}. ${q.question}</div>${body}${hasVideo(q) ? '<span class="video-link">Watch Video Solution</span>' : ''}`;
    const videoLinkEl = row.querySelector('.video-link');
    if (videoLinkEl) videoLinkEl.onclick = () => playVideo(q, 'results');
    app.appendChild(row);
  });

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-primary full-width';
  retryBtn.textContent = 'Back to Levels';
  retryBtn.onclick = () => { state.view = 'levels'; render(); };
  app.appendChild(retryBtn);
}
