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
  testFinished: false, // true once Submit is confirmed - locks answers and enables question-by-question review from Results
  reviewEntryIndex: null, // set only when "Review Ques" is tapped from Results - shows "Move to Results Page" on that one question only
  doubtContext: null, // the question (or null) a doubt was opened from
  finalElapsedMs: 0, // captured from the optional stopwatch when a test is submitted, 0 if never used
  activeTab: 'subjects', // which of the 5 primary tabs is highlighted - Subjects and Tests lead to the same place but light up differently depending on which was tapped
  conceptsMode: false, // true when browsing via the Concepts tab - tapping a topic opens its Concepts PDF directly instead of Levels
  conceptsView: 'all' // Concepts tab layout: 'all' = every Quick Revision topic on one page, 'subjects' = browse subject by subject
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
const bottomNav = document.getElementById('bottomNav');
const saveBtn = document.getElementById('saveBtn');
const saveBtnLabel = document.getElementById('saveBtnLabel');
const toastEl = document.getElementById('toast');
let toastTimer = null;
let saveFlashTimer = null;
const paletteOverlay = document.getElementById('paletteOverlay');
const paletteGrid = document.getElementById('paletteGrid');
const closePaletteBtn = document.getElementById('closePaletteBtn');
const submitTestBtn = document.getElementById('submitTestBtn');
const submitConfirmModal = document.getElementById('submitConfirmModal');
const submitSummary = document.getElementById('submitSummary');
const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');

// ---------- Boot ----------
// A student can jump straight into a section from the launcher's own tab
// bar (?tab=profile/subjects/concepts/tests/performance) - applied once,
// here, before the very first render, then the URL is cleaned up so
// Back/Forward and reloads behave normally afterwards.
function applyLaunchTabParam(){
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const subjectId = params.get('subject');
  const subtopicId = params.get('subtopic');

  if (tab) {
    if (tab === 'profile-direct') { state.profileReturnView = 'subjects'; state.view = 'profile'; }
    else if (tab === 'subjects') { state.activeTab = 'subjects'; state.conceptsMode = false; state.view = 'subjects'; }
    else if (tab === 'tests') { state.activeTab = 'tests'; state.conceptsMode = false; state.view = 'subjects'; }
    else if (tab === 'concepts') { state.activeTab = 'concepts'; state.conceptsMode = true; state.conceptsView = 'all'; state.view = 'subjects'; }
    else if (tab === 'performance') { state.activeTab = 'performance'; state.view = 'history'; }
  } else if (subjectId) {
    // Came from the launcher's search box - jump straight to a specific
    // subject, or straight into a specific topic's Levels screen if a
    // topic was what matched the search.
    const subj = DATA.subjects.find(s => s.id === subjectId);
    if (subj) {
      state.activeTab = 'subjects';
      state.subject = subj;
      if (subtopicId) {
        const subt = subj.subtopics.find(s => s.id === subtopicId);
        if (subt) { state.subtopic = subt; state.view = 'levels'; }
        else { state.view = 'subtopics'; } // topic id didn't match (stale/edited data) - fall back to the topic list rather than breaking
      } else {
        state.view = 'subtopics';
      }
    }
  }

  if (tab || subjectId) history.replaceState(null, '', window.location.pathname);
}

fetch('data/questions.json')
  .then(r => r.json())
  .then(json => {
    DATA = json;
    // Defensive: if anything here ever throws (a malformed URL, an
    // older/unusual browser, anything), the app must still open normally
    // rather than getting stuck on the static placeholder - a failure in
    // this one optional convenience must never be able to block the
    // actual app from starting.
    try { applyLaunchTabParam(); } catch (err) { console.error('applyLaunchTabParam failed, continuing normally:', err); }
    render();
    window.__EEE_APP_BOOTED = true; // tells index.html's safety net that the app really started
  })
  .catch(err => {
    window.__EEE_APP_BOOTED = true; // this handler shows its own message
    console.error('Could not load question data:', err);
    headerTitle.textContent = 'Could not load';
    app.innerHTML = '<div class="question-card"><div class="question-text">Could not load the question data. Please check your connection and reopen the app.</div></div>';
  });

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

const fwdBtn = document.getElementById('fwdBtn');
const topicsBtn = document.getElementById('topicsBtn');
const headerBackBtn = document.getElementById('headerBackBtn');
const primaryTabBar = document.getElementById('primaryTabBar');
const tabHome = document.getElementById('tabHome');
const tabSubjects = document.getElementById('tabSubjects');
const tabConcepts = document.getElementById('tabConcepts');
const tabTests = document.getElementById('tabTests');
const tabPerformance = document.getElementById('tabPerformance');
const headerProfileBtn = document.getElementById('headerProfileBtn');

headerBackBtn.addEventListener('click', () => {
  // Back from Results goes to the LAST question of that test (locked review) -
  // not to whatever stale page snapshot the browser history holds.
  if (state.view === 'results' && state.questions && state.questions.length) {
    state.reviewEntryIndex = null;
    reviewQuestion(state.questions.length - 1);
  } else {
    history.back();
  }
});
// Profile moved to a top-right header icon, always reachable regardless
// of which screen a student is on - no longer one of the 5 bottom tabs.
headerProfileBtn.addEventListener('click', () => {
  state.profileReturnView = state.view === 'quiz' ? 'subjects' : state.view;
  state.view = 'profile';
  render();
});

// ---------- Primary tab bar: Home / Subjects / Concepts / Tests / Performance ----------
// Subjects and Tests both lead to the identical Subjects -> Topics ->
// Levels -> Quiz flow - in this app every subject interaction IS test
// practice, there's no separate "browse-only" content - so the two tabs
// are intentionally two doors to the same room, distinguished only by
// which one lights up as active.
// Home leaves index.html entirely and goes back to the Power Pulse
// launcher - same destination as the header logo, just also reachable
// from the bottom bar now, matching how "Home" normally behaves in any
// app with a tab bar.
tabHome.addEventListener('click', () => { window.location.href = 'home.html'; });

tabSubjects.addEventListener('click', () => {
  state.activeTab = 'subjects';
  state.conceptsMode = false;
  state.view = 'subjects';
  render();
});
tabTests.addEventListener('click', () => {
  state.activeTab = 'tests';
  state.conceptsMode = false;
  state.view = 'subjects';
  render();
});
tabConcepts.addEventListener('click', () => {
  state.activeTab = 'concepts';
  state.conceptsMode = true;
  state.conceptsView = 'all';
  state.view = 'subjects';
  render();
});
tabPerformance.addEventListener('click', () => {
  state.activeTab = 'performance';
  state.view = 'history';
  render();
});

function updatePrimaryTabHighlight(){
  // Home isn't tracked here - tapping it immediately leaves index.html
  // for the launcher, so there's no "staying on this screen with Home
  // highlighted" state to represent.
  [tabSubjects, tabConcepts, tabTests, tabPerformance].forEach(b => b.classList.remove('active'));
  const map = { subjects: tabSubjects, concepts: tabConcepts, tests: tabTests, performance: tabPerformance };
  const el = map[state.activeTab];
  if (el) el.classList.add('active');
}
backBtn.addEventListener('click', () => {
  if (state.view === 'quiz') goToPrevious();
  else if (state.view === 'results') { state.reviewEntryIndex = null; reviewQuestion(state.questions.length - 1); }
  else history.back();
});
fwdBtn.addEventListener('click', () => {
  if (state.view === 'quiz') advance('save');
  else history.forward();
});
// Jumps straight to the Topics (Subtopics) list for whichever subject the
// student is currently in - lets them pick a different topic to continue
// with, without backing out of the current one step by step first.
topicsBtn.addEventListener('click', () => {
  if (state.subject) {
    state.view = 'subtopics';
    render();
  }
});
paletteToggleBtn.addEventListener('click', openPalette);
closePaletteBtn.addEventListener('click', () => paletteOverlay.classList.add('hidden'));
submitTestBtn.addEventListener('click', openSubmitConfirm);
cancelSubmitBtn.addEventListener('click', () => submitConfirmModal.classList.add('hidden'));
confirmSubmitBtn.addEventListener('click', finishTest);
saveBtn.addEventListener('click', () => handleSave());

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1700);
}

function resetSaveBtn(){
  clearTimeout(saveFlashTimer);
  saveBtn.classList.remove('saved');
  saveBtnLabel.textContent = 'Save';
}

// Save: an answer is recorded the instant it's chosen, so this confirms it
// visibly ("Saved"). For a typed (fill-in) answer that's been entered but
// not submitted yet, Save submits it - same as its own Submit button.
function handleSave(){
  if (state.view !== 'quiz') return;
  const q = state.questions[state.qIndex];
  let hasAnswer = !!state.answers[q.id];
  if (!hasAnswer) {
    const typedInput = app.querySelector('.fill-answer-wrap input');
    const typedSubmit = app.querySelector('.fill-answer-wrap .btn-primary');
    if (typedInput && typedSubmit && typedInput.value.trim()) {
      typedSubmit.click();
      hasAnswer = !!state.answers[q.id];
    }
  }
  if (!hasAnswer) { showToast('Choose an answer first, then tap Save'); return; }
  saveBtn.classList.add('saved');
  saveBtnLabel.textContent = 'Saved';
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(resetSaveBtn, 1400);
}

// ---------- Page-level navigation history (Back / Forward, top of screen) ----------
// Uses the browser's real History API so the phone's own hardware back
// button/gesture does the exact same thing as the on-screen Back button -
// stepping through the app's own pages (Subjects -> Topics -> Levels ->
// Quiz -> Results, etc.) - rather than leaving the page entirely. Forward
// works the same way in reverse. The Home icon (top-left) is the only way
// to jump straight back to the launcher; it's a plain page link, untouched
// by any of this and unaffected by how deep the student has navigated.
//
// Stepping between individual QUESTIONS within one quiz (via the
// dedicated Previous/Save & Next buttons) does NOT create Back/Forward
// history entries here - those buttons already handle that directly.
// This history is for whole-PAGE navigation only.
let navHistoryIndex = 0;
let navMaxReachedIndex = 0;
let isRestoringNavState = false;
let lastPushedViewKey = null;

function currentViewKey(){
  // Distinguishes "different pages" even when state.view repeats later in
  // the session (e.g., 'quiz' for Level-1 now, 'quiz' again for Level-2
  // after visiting other screens in between) by including what the page
  // is actually showing, not just its view name.
  return [state.view, state.subject && state.subject.id, state.subtopic && state.subtopic.id, state.level, state.conceptsMode, state.conceptsMode ? state.conceptsView : ''].join('|');
}

function pushNavStateIfNewPage(){
  const key = currentViewKey();
  if (isRestoringNavState) { isRestoringNavState = false; lastPushedViewKey = key; return; }
  if (key === lastPushedViewKey) return; // same page re-rendering (e.g., an answer selected) - not a new page
  navHistoryIndex++;
  navMaxReachedIndex = navHistoryIndex;
  history.pushState({ snapshot: { ...state }, idx: navHistoryIndex }, '', '');
  lastPushedViewKey = key;
}

window.addEventListener('popstate', (event) => {
  if (!event.state) return; // exhausted the app's own history - let the browser fall through naturally (e.g., back to the launcher)
  const cameFromResults = state.view === 'results';
  isRestoringNavState = true;
  navHistoryIndex = event.state.idx;
  for (const k in state) delete state[k];
  Object.assign(state, event.state.snapshot);
  // Phone/hardware Back from Results: the saved quiz snapshot is from when the
  // test STARTED (question 1, unlocked). Land on the last question, locked.
  if (cameFromResults && state.view === 'quiz' && state.questions && state.questions.length) {
    state.testFinished = true;
    state.qIndex = state.questions.length - 1;
    state.reviewEntryIndex = null;
  }
  render();
});

function goBack(){
  history.back();
}

// ---------- Render router ----------
function render(){
  // Teacher's master kill-switch: if disabled, show this and nothing else,
  // regardless of what the student was trying to do. Checked first, before
  // any other view logic, so there's no path around it.
  if (DATA.studentAccessEnabled === false) {
    document.body.classList.remove('theme-measurements');
    // backBtn/fwdBtn stay simple and always clickable - nothing to disable here.
    paletteToggleBtn.classList.add('hidden');
    topicsBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    examStrip.classList.add('hidden');
    headerTitle.textContent = 'Power Pulse';
    app.innerHTML = `
      <div class="question-card" style="text-align:center;">
        <div style="font-size:40px;margin-bottom:10px;">⏸</div>
        <div class="question-text" style="margin-bottom:8px;">This app is temporarily unavailable</div>
        <p style="color:var(--muted);font-size:14px;">Please check back later, or contact your teacher.</p>
      </div>
    `;
    return;
  }

  // First-ever launch: nothing is usable until Name/Email/College is filled in.
  if (!studentProfile && state.view !== 'profile') {
    state.view = 'profile';
    state.profileFirstRun = true;
  }

  pushNavStateIfNewPage();

  // Subject color theme: Power Systems keeps the default blueprint navy/copper;
  // Measurements switches to a teal/cyan "instrument panel" theme. Applies
  // whenever a subject is open (subtopics through results), reverts to
  // default on the Subject-selection screen and other subject-agnostic views.
  const themedViews = ['subtopics', 'levels', 'quiz', 'results', 'doubt', 'conventional'];
  if (themedViews.includes(state.view) && state.subject) {
    document.body.classList.toggle('theme-measurements', state.subject.id === 'eem');
  } else {
    document.body.classList.remove('theme-measurements');
  }

  app.innerHTML = '';
  const inQuiz = state.view === 'quiz';
  // Back/Forward stay always visible and always clickable - no disabled
  // state to manage. Outside a quiz, clicking with nothing to go back/
  // forward to simply does nothing (harmless).
  paletteToggleBtn.classList.toggle('hidden', !inQuiz);
  examStrip.classList.toggle('hidden', !inQuiz);
  saveBtn.classList.toggle('hidden', !inQuiz || state.testFinished);

  // Two different bottom bars, never shown together: the quiz screen gets
  // its own specialised Home/Topics/Back/Save/Forward bar (question-by-
  // question navigation); every other screen gets the main Profile/
  // Subjects/Concepts/Tests/Performance tab bar. Neither shows on the
  // very first "Welcome" form - nothing to navigate to yet.
  bottomNav.classList.toggle('hidden', !inQuiz || !!state.profileFirstRun);
  primaryTabBar.classList.toggle('hidden', inQuiz || !!state.profileFirstRun);
  updatePrimaryTabHighlight();

  // Header Back - shown on "drill-down" screens reached from a tab root
  // (Topics, Levels, Results, etc.), hidden on the five tab-root screens
  // themselves (Subjects/Profile/Performance, where switching tabs is how
  // you'd navigate instead) and during an active quiz (which has its own
  // Back control in its dedicated bottom bar).
  const tabRootViews = ['subjects', 'profile', 'history'];
  headerBackBtn.classList.toggle('hidden', tabRootViews.includes(state.view) || inQuiz || !!state.profileFirstRun);
  // "Topics" jump-shortcut - only makes sense once a subject is chosen
  // (nothing to switch between otherwise), and not on the Subtopics list
  // itself, since that's already where it would take you.
  topicsBtn.classList.toggle('hidden', !state.subject || state.view === 'subtopics');

  if (state.view === 'subjects') renderSubjects();
  else if (state.view === 'subtopics') renderSubtopics();
  else if (state.view === 'levels') renderLevels();
  else if (state.view === 'quiz') renderQuiz();
  else if (state.view === 'conventional') renderConventional();
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
// ---------- Icon badges: small coloured icon tiles used on list rows
// throughout the Subjects/Topics/Profile/Test-History screens - purely a
// visual treatment, the navigation and data underneath is unchanged. ----------
const ICONS = {
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  gauge: '<path d="M12 12 16 8"/><path d="M4 13a8 8 0 1 1 16 0"/><path d="M4 13h1.5M18.5 13H20M7 6.5l1 1M17 6.5l-1 1"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22"/><path d="M4 5.5v14A2.5 2.5 0 0 0 6.5 22"/>',
  doc: '<path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M15 2v5h5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  stack: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
};
function iconBadge(iconKey, bg, fg, size){
  return `<div class="icon-badge${size === 'sm' ? ' sm' : ''}" style="background:${bg};">
    <svg viewBox="0 0 24 24" style="stroke:${fg};">${ICONS[iconKey] || ICONS.doc}</svg>
  </div>`;
}
// One consistent colour identity per subject - Power Systems keeps its
// established copper, Measurements its established teal; any subject a
// teacher adds gets a calm default so a new subject never looks broken.
function subjectIconFor(subj, size){
  if (subj.id === 'eem') return iconBadge('gauge', '#E3F7FA', '#0E8A9C', size);
  if (subj.id === 'power_systems') return iconBadge('bolt', '#FCEEDD', '#B9661C', size);
  return iconBadge('book', '#ECEAFB', '#5B4FC4', size);
}

// Concepts tab: switch between every Quick Revision topic on ONE page, and the
// original subject-by-subject browsing (unchanged).
function renderConceptsToggle(){
  const bar = document.createElement('div');
  bar.className = 'seg';
  [['all', 'All Topics'], ['subjects', 'By Subject']].forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (state.conceptsView === key ? ' active' : '');
    b.textContent = label;
    b.onclick = () => { if (state.conceptsView !== key) { state.conceptsView = key; render(); } };
    bar.appendChild(b);
  });
  app.appendChild(bar);
}

// One page: every topic that has a Quick Revision sheet switched on, grouped
// by subject. Hidden subjects and switched-off sheets never appear.
function renderAllConcepts(){
  let available = 0, missing = 0;
  const sections = [];
  DATA.subjects.filter(sub => sub.visible !== false).forEach(sub => {
    const withPdf = sub.subtopics.filter(st => st.conceptsPdfUrl && st.conceptsPdfVisible);
    available += withPdf.length;
    missing += sub.subtopics.length - withPdf.length;
    if (withPdf.length) sections.push({ sub, withPdf });
  });

  if (available === 0) {
    const empty = document.createElement('div');
    empty.className = 'question-card';
    empty.innerHTML = '<div class="question-text">No Quick Revision concepts have been added yet.</div><div class="meta" style="margin-top:6px;">Please check back soon.</div>';
    app.appendChild(empty);
    return;
  }

  const intro = document.createElement('div');
  intro.className = 'concepts-intro';
  intro.textContent = `${available} Quick Revision sheet${available === 1 ? '' : 's'} - tap a topic to open it`;
  app.appendChild(intro);

  sections.forEach(({ sub, withPdf }) => {
    const title = document.createElement('div');
    title.className = 'concepts-section-title';
    title.innerHTML = `${subjectIconFor(sub, 'sm')}<span>${sub.name}</span><span class="count">${withPdf.length} topic${withPdf.length === 1 ? '' : 's'}</span>`;
    app.appendChild(title);
    withPdf.forEach(st => {
      const card = document.createElement('div');
      card.className = 'list-card concept-row';
      card.innerHTML = `<div class="list-card-main">${iconBadge('doc', '#E6F8EE', '#1F9D55', 'sm')}<div><div>${st.name}</div><div class="meta">Quick Revision - Concepts &amp; Formulas</div></div></div><div>&#8250;</div>`;
      card.onclick = () => downloadConceptsPdf(st);
      app.appendChild(card);
    });
  });

  if (missing > 0) {
    const note = document.createElement('div');
    note.className = 'concepts-note';
    note.textContent = `${missing} more topic${missing === 1 ? '' : 's'} will be added soon.`;
    app.appendChild(note);
  }
}

function renderSubjects(){
  // Profile and My Test History live on their own tabs, so this screen is
  // just the subject list (or, on the Concepts tab, the one-page concepts view).
  headerTitle.textContent = state.conceptsMode ? 'Concepts & Formulas' : 'Choose Subject';

  if (state.conceptsMode) {
    renderConceptsToggle();
    if (state.conceptsView === 'all') { renderAllConcepts(); return; }
  }

  // "Ask a Doubt" entry point intentionally hidden for now (see note near
  // openDoubtComposer below) - re-enable once students are onboarded.

  DATA.subjects.filter(sub => sub.visible !== false).forEach(sub => {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `<div class="list-card-main">${subjectIconFor(sub)}<div><div>${sub.name}</div><div class="meta">${sub.subtopics.length} subtopics</div></div></div><div>&#8250;</div>`;
    card.onclick = () => { state.subject = sub; state.view = 'subtopics'; render(); };
    app.appendChild(card);
  });
}

function renderSubtopics(){
  headerTitle.textContent = state.subject.name;

  // Class Work Book Solution (Part 1 / Part 2) - subject-wide, shown here
  // before the topic list, only for whichever parts the teacher has both
  // uploaded AND explicitly switched on.
  const subj = state.subject;
  [1, 2].forEach(part => {
    const url = part === 1 ? subj.classworkPart1Url : subj.classworkPart2Url;
    const visible = part === 1 ? subj.classworkPart1Visible : subj.classworkPart2Visible;
    if (url && visible) {
      const card = document.createElement('div');
      card.className = 'list-card';
      card.innerHTML = `<div class="list-card-main">${iconBadge('stack', '#FCEEDD', '#B9661C')}<div><div>Class Work Book Solution - Part ${part}</div><div class="meta">Tap to view or download</div></div></div><div>&#8250;</div>`;
      card.onclick = () => downloadClassworkPdf(subj, part);
      app.appendChild(card);
    }
  });

  state.subject.subtopics.forEach(st => {
    const card = document.createElement('div');
    card.className = 'list-card';
    if (state.conceptsMode) {
      // Reached via the Concepts tab - tapping a topic opens its
      // Concepts & Formulas PDF directly, skipping Levels/Quiz entirely,
      // since the student's intent here is revision, not testing.
      const hasPdf = st.conceptsPdfUrl && st.conceptsPdfVisible;
      card.innerHTML = `<div class="list-card-main">${iconBadge('doc', hasPdf ? '#E6F8EE' : '#F1F2F6', hasPdf ? '#1F9D55' : '#9AA3B5', 'sm')}<div><div>${st.name}</div><div class="meta">${hasPdf ? 'Concepts & Formulas available' : 'Not uploaded yet'}</div></div></div><div>&#8250;</div>`;
      card.onclick = () => {
        if (hasPdf) downloadConceptsPdf(st);
        else showToast('Concepts & Formulas not yet uploaded for this topic');
      };
    } else {
      const l1 = (st.levels['1'] || []).length;
      const l2 = (st.levels['2'] || []).length;
      card.innerHTML = `<div class="list-card-main">${iconBadge('doc', '#EEF1FB', '#4C5C8C', 'sm')}<div><div>${st.name}</div><div class="meta">Level-1: ${l1} &nbsp;|&nbsp; Level-2: ${l2}</div></div></div><div>&#8250;</div>`;
      card.onclick = () => { state.subtopic = st; state.view = 'levels'; render(); };
    }
    app.appendChild(card);
  });
}

// Concepts & Formulas PDF is the one thing students CAN download directly -
// the full question bank/answers stays teacher-only. A data: URI triggers
// a real file download; a hosted link (Firebase/Cloudinary) opens in a new
// tab, where the browser's own PDF viewer offers view/save.
async function downloadConceptsPdf(subtopic){
  const url = subtopic.conceptsPdfUrl;
  if (!url) return;
  const filename = subtopic.name.replace(/[^a-z0-9]/gi, '_') + '_Concepts_Formulas.pdf';
  await downloadPdfSafely(url, filename);
}

async function downloadClassworkPdf(subject, part){
  const url = part === 1 ? subject.classworkPart1Url : subject.classworkPart2Url;
  if (!url) return;
  const filename = subject.name.replace(/[^a-z0-9]/gi, '_') + `_Classwork_Part${part}.pdf`;
  await downloadPdfSafely(url, filename);
}

// Shared by every PDF download in the app - fetches the file itself
// rather than navigating the browser straight to it, so a student never
// sees the actual storage URL (address bar or a raw browser error page),
// and any failure is handled cleanly in-app instead of an ugly,
// unbranded "site can't be reached" screen.
async function downloadPdfSafely(url, filename){
  if (url.startsWith('data:')) {
    // Already local - nothing to fetch, nothing to fail.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    return;
  }

  showPdfMessage('Loading...', false);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error('not ok');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
    hidePdfMessage();
  } catch (err) {
    showPdfMessage('Service not available. Please contact your teacher.', true);
  }
}

// A small, unbranded overlay for the PDF load/error state - deliberately
// says nothing about where the file is hosted or what technically failed.
function showPdfMessage(text, isError){
  hidePdfMessage();
  const overlay = document.createElement('div');
  overlay.id = 'pdfMsgOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;z-index:60;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;max-width:280px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.2);">
      <div style="font-size:32px;margin-bottom:10px;">${isError ? '⚠️' : '⏳'}</div>
      <div style="font-size:14px;color:${isError ? '#D64545' : '#16213A'};font-weight:600;margin-bottom:${isError ? '14px' : '0'};">${text}</div>
      ${isError ? '<button id="pdfMsgDismiss" style="background:#16274A;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;">OK</button>' : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  if (isError) {
    document.getElementById('pdfMsgDismiss').onclick = hidePdfMessage;
  }
}
function hidePdfMessage(){
  const existing = document.getElementById('pdfMsgOverlay');
  if (existing) existing.remove();
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
  const convQs = state.subtopic.levels['conventional'] || [];
  const convBtn = document.createElement('button');
  convBtn.className = 'level-btn' + (convQs.length === 0 ? ' disabled' : '');
  convBtn.textContent = `Conventional - Long Answer (${convQs.length} Qs)`;
  if (convQs.length > 0) convBtn.onclick = () => { state.view = 'conventional'; render(); };
  wrap.appendChild(convBtn);
  app.appendChild(wrap);

  // Concepts & Formulas PDF - only shown if the teacher has both attached
  // one AND explicitly switched it on for this specific topic.
  if (state.subtopic.conceptsPdfUrl && state.subtopic.conceptsPdfVisible) {
    const pdfCard = document.createElement('div');
    pdfCard.className = 'list-card';
    pdfCard.style.cssText = 'margin-top:14px;';
    pdfCard.innerHTML = `<div class="list-card-main">${iconBadge('doc', '#E6F8EE', '#1F9D55', 'sm')}<div><div>Quick Revision - Concepts &amp; Formulas</div><div class="meta">Tap to view or download</div></div></div><div>&#8250;</div>`;
    pdfCard.onclick = () => downloadConceptsPdf(state.subtopic);
    app.appendChild(pdfCard);
  }
}

// Conventional (long-answer) study mode: a plain scrollable list of
// question/model-answer cards, tap to reveal - no scoring, no timer, no
// palette, since these aren't machine-gradable multiple-choice questions.
function renderConventional(){
  headerTitle.textContent = state.subtopic.name + ' - Conventional';
  const qs = state.subtopic.levels['conventional'] || [];
  qs.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    const qImgHtml = q.questionImage ? `<img src="${q.questionImage}" alt="Figure" class="explanation-image">` : '';
    card.innerHTML = `
      <div class="question-text">Q${i + 1}. ${q.question || ''}</div>
      ${qImgHtml}
      <button class="btn btn-secondary full-width reveal-answer-btn" style="margin-top:10px;">Show Model Answer</button>
      <div class="conv-answer hidden" style="margin-top:12px;"></div>
    `;
    const revealBtn = card.querySelector('.reveal-answer-btn');
    const answerDiv = card.querySelector('.conv-answer');
    revealBtn.onclick = () => {
      const isHidden = answerDiv.classList.contains('hidden');
      if (isHidden) {
        const explImgHtml = q.explanationImage ? `<img src="${q.explanationImage}" alt="Explanation" class="explanation-image">` : '';
        const audioHtml = q.audioFile ? `<audio controls class="audio-explanation" src="${q.audioFile}"></audio>` : '';
        const videoHtml = hasVideo(q) ? '<span class="video-link">Watch Video Solution</span>' : '';
        answerDiv.innerHTML = `
          <p class="explanation-text">${q.explanation || 'No model answer provided yet.'}</p>
          ${explImgHtml}
          ${audioHtml}
          ${videoHtml}
        `;
        renderMathIn(answerDiv.querySelector('.explanation-text'));
        const videoLinkEl = answerDiv.querySelector('.video-link');
        if (videoLinkEl) videoLinkEl.onclick = () => playVideo(q, 'quiz');
        answerDiv.classList.remove('hidden');
        revealBtn.textContent = 'Hide Model Answer';
      } else {
        answerDiv.classList.add('hidden');
        revealBtn.textContent = 'Show Model Answer';
      }
    };
    app.appendChild(card);
  });
}

function startQuiz(level, qs){
  state.level = level;
  state.questions = qs;
  state.qIndex = 0;
  state.status = {};
  state.answers = {};
  state.testFinished = false;
  state.reviewEntryIndex = null;
  state.conceptsMode = false; // defensive - concepts mode never actually reaches a quiz, but keep this clean
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
  resetSaveBtn();

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
    // Reviewing a finished test, a question left unattempted: show it
    // locked with the correct option highlighted, same as the Results
    // list already says ("Not attempted / Correct answer: ...") - just
    // in the full question-card view instead of the compact one.
    const lockedUnattempted = state.testFinished && !existing;
    const revealed = !!existing && (state.testFinished || !!existing.solutionShown);
    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      let letterContent = letters[idx];
      if (existing && revealed) {
        if (idx === existing.selectedIndex && !existing.isCorrect) letterContent = '&#10007;';
        else if (idx === q.correctIndex) letterContent = '&#10003;';
      } else if (lockedUnattempted && idx === q.correctIndex) {
        letterContent = '&#10003;';
      }
      btn.innerHTML = `<span class="opt-letter">${letterContent}</span><span class="opt-text">${opt}</span>`;
      if (existing) {
        btn.disabled = true;
        if (revealed) {
          if (idx === existing.selectedIndex && !existing.isCorrect) btn.classList.add('wrong');
          if (idx === q.correctIndex) btn.classList.add('correct');
        } else if (idx === existing.selectedIndex) {
          btn.classList.add('chosen'); // their pick, verdict still hidden
        }
      } else if (lockedUnattempted) {
        btn.disabled = true;
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
    if (state.testFinished || existing.solutionShown) {
      if (existing.isCorrect) renderCorrectAnswerPanel(q, card);
      else renderWrongAnswerPanel(q, card);
    } else {
      renderSolutionGate(q, card);
    }
  } else if (state.testFinished) {
    // Left unattempted, now reviewing - show the explanation neutrally,
    // without implying it was answered correctly.
    renderUnattemptedExplanationPanel(q, card);
  }

  // Shown only on the exact question opened via a "Review Ques" tap from
  // Results - a quick way back without stepping through every question
  // in between. Moving to any other question (Forward/Back/Topics) drops
  // this, since reviewEntryIndex no longer matches state.qIndex.
  if (state.testFinished && state.reviewEntryIndex === state.qIndex) {
    const toResultsBtn = document.createElement('button');
    toResultsBtn.className = 'btn btn-secondary full-width';
    toResultsBtn.style.marginTop = '14px';
    toResultsBtn.textContent = 'Move to Results Page';
    toResultsBtn.onclick = () => {
      state.reviewEntryIndex = null;
      state.view = 'results';
      render();
    };
    card.appendChild(toResultsBtn);
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

  const revealed = !!existing && (state.testFinished || !!existing.solutionShown);
  if (existing) {
    input.value = existing.typedAnswer || '';
    input.disabled = true;
    input.classList.add(revealed ? (existing.isCorrect ? 'correct' : 'wrong') : 'chosen');
  } else if (state.testFinished) {
    // Reviewing a finished test, left unattempted - show it locked with
    // the correct answer, no way to submit one after the fact.
    input.placeholder = 'Not attempted';
    input.disabled = true;
    wrap.appendChild(input);
    const correctLine = document.createElement('div');
    correctLine.className = 'fill-correct-line';
    correctLine.textContent = 'Correct answer: ' + q.correctAnswer;
    wrap.appendChild(correctLine);
    cardEl.appendChild(wrap);
    return;
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
  if (revealed && !existing.isCorrect) {
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
  if (state.testFinished) return; // reviewing - answers are locked
  const isCorrect = checkFillAnswer(typedAnswer, q.correctAnswer);
  inputEl.disabled = true;
  inputEl.classList.add('chosen'); // neutral - no right/wrong yet
  const submitBtn = cardEl.querySelector('.fill-answer-wrap .btn-primary');
  if (submitBtn) submitBtn.remove();

  const wasMarked = state.status[q.id] === 'marked' || state.status[q.id] === 'answered-marked';
  state.status[q.id] = wasMarked ? 'answered-marked' : 'answered';
  state.answers[q.id] = { typedAnswer, isCorrect, reviewPending: false, solutionShown: false };
  renderSolutionGate(q, cardEl);
}

// "Show Solution" gate: after a student answers, only THEIR choice is shown
// (neutral highlight). Right/wrong marking, the correct answer, the written/
// audio/video solution - all of it - appears only when they press the button.
function renderSolutionGate(q, cardEl){
  const btn = document.createElement('button');
  btn.className = 'show-solution-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"/></svg><span>Show Solution</span>';
  btn.onclick = () => revealSolution(q);
  cardEl.appendChild(btn);
}

function revealSolution(q){
  const a = state.answers[q.id];
  if (!a || a.solutionShown) return;
  a.solutionShown = true; // remembered per question, so going away and coming back keeps it open
  render();
  const panel = app.querySelector('.correct-panel, .wrong-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (!a.isCorrect && hasVideo(q)) {
    // the "watch the video solution?" prompt now appears here, when the student
    // asks for the solution - not the instant they answer (which would give away
    // that the answer was wrong)
    state.pendingVideoQ = q;
    setTimeout(() => videoPromptModal.classList.remove('hidden'), 400);
  }
}

function handleAnswer(q, selectedIndex, cardEl){
  if (state.testFinished) return; // reviewing - answers are locked
  const allOpts = cardEl.querySelectorAll('.option');
  allOpts.forEach(o => o.disabled = true);
  allOpts[selectedIndex].classList.add('chosen'); // neutral - no right/wrong yet

  const isCorrect = selectedIndex === q.correctIndex;
  const wasMarked = state.status[q.id] === 'marked' || state.status[q.id] === 'answered-marked';
  state.status[q.id] = wasMarked ? 'answered-marked' : 'answered';
  state.answers[q.id] = { selectedIndex, isCorrect, reviewPending: false, solutionShown: false };
  renderSolutionGate(q, cardEl);
}

// Shown immediately below the options on a wrong answer - unlike the correct-
// answer panel, this one isn't collapsed, since the student specifically
// needs the reason right now. The Watch Now / After Test popup still appears
// separately on top; this stays on the page either way so the reason is
// never lost even if they dismiss the popup with "After Test".
function renderUnattemptedExplanationPanel(q, cardEl){
  const hasContent = !!(q.explanation || q.explanationImage || q.audioFile || hasVideo(q));
  if (!hasContent) return;
  const panel = document.createElement('div');
  panel.className = 'correct-panel';
  const label = document.createElement('div');
  label.className = 'correct-panel-label';
  label.style.color = 'var(--muted)';
  label.textContent = 'Not attempted - here\'s the explanation:';
  panel.appendChild(label);
  const body = document.createElement('div');
  body.className = 'correct-panel-body';
  const imageHtml = q.explanationImage ? `<img src="${q.explanationImage}" alt="Explanation" class="explanation-image">` : '';
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
  } else if (state.testFinished) {
    // Reviewing a finished test, Forward on the last question - nothing
    // left to submit, so just return to Results instead.
    state.view = 'results';
    render();
  } else {
    openSubmitConfirm();
  }
}

// Jumps straight to one specific question, in review mode if the test is
// already finished - used by the Results screen's "Review Ques" buttons
// and by Back-from-Results (see below).
function reviewQuestion(index){
  state.qIndex = index;
  state.view = 'quiz';
  render();
}

function goToPrevious(){
  if (state.qIndex > 0) {
    state.qIndex--;
    render();
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
  let answered = 0, notAnswered = 0;
  state.questions.forEach(q => {
    const st = state.status[q.id];
    if (st === 'answered' || st === 'answered-marked') answered++;
    else notAnswered++;
  });
  submitSummary.innerHTML = `
    <div><span class="num">${answered}</span>Answered</div>
    <div><span class="num">${notAnswered}</span>Not Answered</div>
    <div><span class="num">${state.questions.length}</span>Total</div>
  `;
  paletteOverlay.classList.add('hidden');
  submitConfirmModal.classList.remove('hidden');
}

function finishTest(){
  submitConfirmModal.classList.add('hidden');
  state.testFinished = true;
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
    row.innerHTML = `<div class="q">Q${i + 1}. ${q.question}</div>${body}${hasVideo(q) ? '<span class="video-link">Watch Video Solution</span>' : ''}
      <button class="btn btn-secondary review-ques-btn">&#8599; Review Ques</button>`;
    const videoLinkEl = row.querySelector('.video-link');
    if (videoLinkEl) videoLinkEl.onclick = () => playVideo(q, 'results');
    row.querySelector('.review-ques-btn').onclick = () => { state.reviewEntryIndex = i; reviewQuestion(i); };
    app.appendChild(row);
  });

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn btn-primary full-width';
  retryBtn.textContent = 'Back to Levels';
  retryBtn.onclick = () => { state.view = 'levels'; render(); };
  app.appendChild(retryBtn);
}
