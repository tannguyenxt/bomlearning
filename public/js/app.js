// ── VioQuiz App ─────────────────────────────────────────────────────────────
const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? '' : '';  // Same origin

let allSubjects = [];
let selectedSubject = 'all';
let quizQuestions = [];
let currentIdx = 0;
let userAnswers = [];
let timerInterval = null;
let timeLeft = 0;
let startTime = null;

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadSubjects();
  renderLeaderboard();
}

async function loadSubjects() {
  try {
    const res = await fetch(`${API}/api/questions`);
    const data = await res.json();
    allSubjects = data.subjects;
    renderSubjectGrid();
  } catch (err) {
    // Fallback: load JSON directly (for GitHub Pages)
    try {
      const res = await fetch('/data/questions.json');
      const data = await res.json();
      allSubjects = data.subjects;
      renderSubjectGrid();
    } catch {
      showToast('Không thể tải câu hỏi!', 'error');
    }
  }
}

function renderSubjectGrid() {
  const grid = document.getElementById('subject-grid');
  let totalQ = 0;
  allSubjects.forEach(s => s.topics.forEach(t => totalQ += t.questions.length));

  grid.innerHTML = `
    <div class="subject-card subject-all selected" data-id="all" onclick="selectSubject('all')">
      <div class="subj-icon">🎯</div>
      <div class="subj-name">Tất cả môn</div>
      <div class="subj-count">${totalQ} câu hỏi</div>
    </div>
    ${allSubjects.map(s => {
      let qCount = s.topics.reduce((a, t) => a + t.questions.length, 0);
      return `
        <div class="subject-card" data-id="${s.id}" onclick="selectSubject('${s.id}')"
             style="border-color: transparent;">
          <div class="subj-icon">${s.icon}</div>
          <div class="subj-name">${s.name}</div>
          <div class="subj-count">${qCount} câu hỏi</div>
        </div>`;
    }).join('')}
  `;
}

function selectSubject(id) {
  selectedSubject = id;
  document.querySelectorAll('.subject-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

// ── QUIZ GENERATION ──────────────────────────────────────────────────────────
function startQuiz() {
  const nameInput = document.getElementById('student-name').value.trim();
  if (!nameInput) { showToast('Em hãy nhập tên trước nhé! 😊'); return; }

  const count = parseInt(document.getElementById('question-count').value);

  // Collect questions from selected subject(s)
  let pool = [];
  const subjects = selectedSubject === 'all' ? allSubjects : allSubjects.filter(s => s.id === selectedSubject);
  subjects.forEach(subj => {
    subj.topics.forEach(topic => {
      topic.questions.forEach(q => {
        pool.push({ ...q, subjectName: subj.name, subjectIcon: subj.icon, topicName: topic.name });
      });
    });
  });

  if (pool.length < 5) { showToast('Không đủ câu hỏi! Hãy chọn nhiều môn hơn.'); return; }

  // Shuffle and pick
  pool = shuffle(pool);
  quizQuestions = pool.slice(0, Math.min(count, pool.length));

  // Shuffle options for each question
  quizQuestions = quizQuestions.map(q => {
    const optionsWithIndex = q.options.map((opt, i) => ({ opt, isCorrect: i === q.answer }));
    const shuffled = shuffle(optionsWithIndex);
    return {
      ...q,
      displayOptions: shuffled.map(o => o.opt),
      correctDisplayIndex: shuffled.findIndex(o => o.isCorrect)
    };
  });

  userAnswers = new Array(quizQuestions.length).fill(-1);
  currentIdx = 0;
  startTime = Date.now();

  // Timer
  clearInterval(timerInterval);
  const timeSetting = parseInt(document.getElementById('time-limit').value);
  timeLeft = timeSetting;
  if (timeLeft > 0) {
    updateTimerDisplay();
    timerInterval = setInterval(tickTimer, 1000);
    document.getElementById('timer-display').style.display = 'flex';
  } else {
    document.getElementById('timer-display').style.display = 'none';
  }

  showScreen('quiz');
  renderQuizHeader();
  renderQuestion();
  renderNavDots();
}

function tickTimer() {
  timeLeft--;
  updateTimerDisplay();
  if (timeLeft <= 0) { clearInterval(timerInterval); submitQuiz(); }
  const timerEl = document.getElementById('timer-display');
  if (timeLeft <= 60) timerEl.className = 'timer-display danger';
  else if (timeLeft <= 180) timerEl.className = 'timer-display warning';
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-text').textContent = `${m}:${s}`;
}

function renderQuizHeader() {
  document.getElementById('q-total').textContent = quizQuestions.length;
  updateProgress();
}

function updateProgress() {
  document.getElementById('q-current').textContent = currentIdx + 1;
  const pct = ((currentIdx + 1) / quizQuestions.length) * 100;
  document.getElementById('progress-bar').style.width = pct + '%';
}

function renderQuestion() {
  const q = quizQuestions[currentIdx];
  document.getElementById('question-number').textContent = `Câu ${currentIdx + 1} • ${q.subjectIcon} ${q.subjectName} – ${q.topicName}`;
  document.getElementById('question-text').textContent = q.text;

  const labels = ['A', 'B', 'C', 'D'];
  const grid = document.getElementById('options-grid');
  grid.innerHTML = q.displayOptions.map((opt, i) => `
    <button class="option-btn ${userAnswers[currentIdx] === i ? 'selected' : ''}"
            onclick="selectAnswer(${i})">
      <span class="opt-label">${labels[i]}</span>
      <span class="opt-text">${opt}</span>
    </button>
  `).join('');

  document.getElementById('question-card').style.animation = 'none';
  setTimeout(() => document.getElementById('question-card').style.animation = 'slideIn 0.3s ease', 10);

  document.getElementById('btn-prev').disabled = currentIdx === 0;
  document.getElementById('btn-next').disabled = currentIdx === quizQuestions.length - 1;

  const isLast = currentIdx === quizQuestions.length - 1;
  document.getElementById('btn-submit').style.display = isLast ? 'block' : 'none';

  updateProgress();
  updateNavDots();

  const subj = quizQuestions[currentIdx];
  document.getElementById('quiz-subject-label').textContent = `${subj.subjectIcon} ${subj.subjectName}`;
}

function selectAnswer(idx) {
  userAnswers[currentIdx] = idx;
  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === idx);
  });
  updateNavDots();

  // Auto-advance after short delay if not last
  if (currentIdx < quizQuestions.length - 1) {
    setTimeout(nextQuestion, 600);
  }
}

function renderNavDots() {
  const container = document.getElementById('nav-dots');
  container.innerHTML = quizQuestions.map((_, i) => `
    <div class="nav-dot ${i === currentIdx ? 'current' : ''} ${userAnswers[i] !== -1 ? 'answered' : ''}"
         onclick="goToQuestion(${i})" title="Câu ${i + 1}"></div>
  `).join('');
}

function updateNavDots() {
  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    dot.className = `nav-dot ${i === currentIdx ? 'current' : ''} ${userAnswers[i] !== -1 ? 'answered' : ''}`;
  });
}

function nextQuestion() {
  if (currentIdx < quizQuestions.length - 1) { currentIdx++; renderQuestion(); }
}
function prevQuestion() {
  if (currentIdx > 0) { currentIdx--; renderQuestion(); }
}
function goToQuestion(idx) { currentIdx = idx; renderQuestion(); }

// ── SUBMIT & RESULTS ─────────────────────────────────────────────────────────
function submitQuiz() {
  clearInterval(timerInterval);
  const unanswered = userAnswers.filter(a => a === -1).length;
  if (unanswered > 0) {
    const confirmed = confirm(`Em còn ${unanswered} câu chưa trả lời. Vẫn nộp bài không?`);
    if (!confirmed) return;
  }

  const correct = quizQuestions.filter((q, i) => userAnswers[i] === q.correctDisplayIndex).length;
  const total = quizQuestions.length;
  const pct = Math.round((correct / total) * 100);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const name = document.getElementById('student-name').value.trim();

  // Trophy & title
  let trophy = '🥉', title = 'Cố gắng thêm nhé!';
  if (pct >= 90) { trophy = '🏆'; title = 'Xuất sắc! Em học rất giỏi!'; }
  else if (pct >= 75) { trophy = '🥇'; title = 'Giỏi lắm! Tiếp tục cố gắng!'; }
  else if (pct >= 60) { trophy = '🥈'; title = 'Khá tốt! Em có thể làm tốt hơn!'; }

  document.getElementById('result-trophy').textContent = trophy;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-score').innerHTML = `
    <div class="score-number">${correct}/${total}</div>
    <div class="score-label">Đúng ${pct}% • Thời gian: ${formatTime(elapsed)}</div>
  `;
  const subjectLabel = selectedSubject === 'all' ? 'Tất cả môn' : allSubjects.find(s => s.id === selectedSubject)?.name;
  document.getElementById('result-meta').textContent = `Môn: ${subjectLabel} • ${name}`;
  document.getElementById('result-bar').style.width = '0%';

  showScreen('result');
  setTimeout(() => {
    document.getElementById('result-bar').style.width = pct + '%';
  }, 100);

  // Save to leaderboard
  saveScore(name, correct, total, pct, elapsed);
  document.getElementById('review-panel').style.display = 'none';
}

function showReview() {
  const panel = document.getElementById('review-panel');
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  const labels = ['A', 'B', 'C', 'D'];
  panel.innerHTML = quizQuestions.map((q, i) => {
    const chosen = userAnswers[i];
    const correct = q.correctDisplayIndex;
    const isCorrect = chosen === correct;
    return `
      <div class="review-item ${isCorrect ? 'correct' : 'incorrect'}">
        <span class="review-badge">${isCorrect ? '✅' : '❌'}</span>
        <div class="review-q">Câu ${i + 1}: ${q.text}</div>
        ${!isCorrect ? `<div class="review-answer your">Em chọn: ${chosen === -1 ? 'Chưa trả lời' : labels[chosen] + '. ' + q.displayOptions[chosen]}</div>` : ''}
        <div class="review-answer correct-ans">Đáp án đúng: ${labels[correct]}. ${q.displayOptions[correct]}</div>
      </div>`;
  }).join('');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });
}

function retryQuiz() { startQuiz(); }
function goHome() { clearInterval(timerInterval); showScreen('home'); renderLeaderboard(); }

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
function saveScore(name, correct, total, pct, elapsed) {
  const lb = JSON.parse(localStorage.getItem('vioQuizLB') || '[]');
  lb.push({ name, correct, total, pct, elapsed, date: new Date().toLocaleDateString('vi-VN') });
  lb.sort((a, b) => b.pct - a.pct || a.elapsed - b.elapsed);
  localStorage.setItem('vioQuizLB', JSON.stringify(lb.slice(0, 20)));
}

function renderLeaderboard() {
  const lb = JSON.parse(localStorage.getItem('vioQuizLB') || '[]').slice(0, 5);
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const container = document.getElementById('leaderboard-list');
  if (lb.length === 0) {
    container.innerHTML = '<div class="lb-empty">Chưa có kết quả nào. Hãy là người đầu tiên! 🚀</div>';
    return;
  }
  container.innerHTML = lb.map((e, i) => `
    <div class="lb-entry">
      <span class="lb-rank">${medals[i]}</span>
      <span class="lb-name">${e.name}</span>
      <span class="lb-score">${e.correct}/${e.total} (${e.pct}%)</span>
    </div>
  `).join('');
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

let toastTimeout;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimeout);
  let existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  if (type === 'error') toast.style.background = '#FF6B6B';
  document.body.appendChild(toast);
  toastTimeout = setTimeout(() => toast.remove(), 3000);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();
