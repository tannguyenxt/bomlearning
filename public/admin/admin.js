// ── VioQuiz Admin ─────────────────────────────────────────────────────────────
const API = '';
let subjects = [];
let editingId = null;
let editingType = null;

async function init() {
  await checkStatus();
  await loadData();
}

async function checkStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const data = await res.json();
    document.getElementById('db-dot').className = `db-dot ${data.database === 'mysql' ? '' : 'offline'}`;
    document.getElementById('db-label').textContent = data.database === 'mysql' ? 'MySQL kết nối' : 'Dùng JSON file';
  } catch {
    document.getElementById('db-dot').className = 'db-dot offline';
    document.getElementById('db-label').textContent = 'Offline';
  }
}

async function loadData() {
  try {
    const res = await fetch(`${API}/api/questions`);
    const data = await res.json();
    subjects = data.subjects;
    renderAll();
  } catch (err) {
    toast('Không thể tải dữ liệu: ' + err.message, 'error');
  }
}

function renderAll() {
  renderStats();
  renderDashSubjects();
  renderSubjectsList();
  renderTopicsTable();
  renderQuestionsTable();
  populateFilters();
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function renderStats() {
  let topics = 0, questions = 0;
  subjects.forEach(s => { topics += s.topics.length; s.topics.forEach(t => questions += t.questions.length); });
  document.getElementById('stat-subj').textContent = subjects.length;
  document.getElementById('stat-topic').textContent = topics;
  document.getElementById('stat-q').textContent = questions;
}

function renderDashSubjects() {
  document.getElementById('dash-subjects').innerHTML = subjects.map(s => {
    let total = s.topics.reduce((a, t) => a + t.questions.length, 0);
    return `<div style="background:#fff;border-radius:12px;padding:1rem 1.25rem;margin-bottom:0.75rem;box-shadow:var(--shadow);display:flex;align-items:center;gap:1rem;">
      <span style="font-size:2rem">${s.icon}</span>
      <div style="flex:1"><strong style="color:var(--primary)">${s.name}</strong><br><span style="font-size:0.8rem;color:var(--muted)">${s.topics.length} chủ đề • ${total} câu hỏi</span></div>
      <div style="background:#EDE8FF;border-radius:8px;padding:0.4rem 0.8rem;font-weight:800;color:var(--primary)">${total}</div>
    </div>`;
  }).join('');
}

// ── SUBJECTS ─────────────────────────────────────────────────────────────────
function renderSubjectsList() {
  document.getElementById('subjects-list').innerHTML = subjects.map(s => `
    <div class="subj-admin-card" style="border-left-color:${s.color || 'var(--primary)'}">
      <div class="s-icon">${s.icon}</div>
      <div class="s-name">${s.name}</div>
      <div class="s-meta">${s.name_en} • ${s.topics.length} chủ đề</div>
      <div class="s-actions">
        <button class="btn btn-warning btn-sm" onclick="openSubjectModal('${s.id}')">✏️ Sửa</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSubject('${s.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openSubjectModal(id = null) {
  editingId = id;
  editingType = 'subject';
  if (id) {
    const s = subjects.find(x => x.id === id);
    document.getElementById('modal-subj-title').textContent = '✏️ Sửa môn học';
    document.getElementById('f-subj-id').value = s.id;
    document.getElementById('f-subj-id').disabled = true;
    document.getElementById('f-subj-name').value = s.name;
    document.getElementById('f-subj-name-en').value = s.name_en || '';
    document.getElementById('f-subj-icon').value = s.icon || '';
    document.getElementById('f-subj-color').value = s.color || '#6C3CE1';
  } else {
    document.getElementById('modal-subj-title').textContent = '➕ Thêm môn học';
    document.getElementById('f-subj-id').value = '';
    document.getElementById('f-subj-id').disabled = false;
    document.getElementById('f-subj-name').value = '';
    document.getElementById('f-subj-name-en').value = '';
    document.getElementById('f-subj-icon').value = '';
    document.getElementById('f-subj-color').value = '#6C3CE1';
  }
  showModal('modal-subject');
}

async function saveSubject() {
  const id = document.getElementById('f-subj-id').value.trim();
  const name = document.getElementById('f-subj-name').value.trim();
  const name_en = document.getElementById('f-subj-name-en').value.trim();
  const icon = document.getElementById('f-subj-icon').value.trim();
  const color = document.getElementById('f-subj-color').value;
  if (!id || !name) { toast('Vui lòng điền ID và Tên môn học'); return; }
  try {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${API}/api/subjects/${editingId}` : `${API}/api/subjects`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, name_en, icon, color }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-subject');
    await loadData();
    toast(editingId ? 'Đã cập nhật môn học!' : 'Đã thêm môn học!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

async function deleteSubject(id) {
  if (!confirm(`Xóa môn học "${id}"? Tất cả chủ đề và câu hỏi trong môn này sẽ bị xóa!`)) return;
  try {
    await fetch(`${API}/api/subjects/${id}`, { method: 'DELETE' });
    await loadData();
    toast('Đã xóa môn học!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

// ── TOPICS ────────────────────────────────────────────────────────────────────
function renderTopicsTable() {
  const tbody = document.getElementById('topics-body');
  let rows = '';
  subjects.forEach(s => {
    s.topics.forEach(t => {
      rows += `<tr>
        <td>${t.name}</td>
        <td><span class="tag tag-subj">${s.icon} ${s.name}</span></td>
        <td>${t.questions.length}</td>
        <td class="actions">
          <button class="btn btn-warning btn-sm" onclick="openTopicModal('${t.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTopic('${t.id}')">🗑️</button>
        </td>
      </tr>`;
    });
  });
  tbody.innerHTML = rows || `<tr class="empty-row"><td colspan="4">Chưa có chủ đề nào</td></tr>`;
}

function openTopicModal(id = null) {
  editingId = id;
  editingType = 'topic';
  const sel = document.getElementById('f-topic-subj');
  sel.innerHTML = subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');

  if (id) {
    let found, foundSubj;
    subjects.forEach(s => { const t = s.topics.find(x => x.id === id); if (t) { found = t; foundSubj = s; } });
    document.getElementById('modal-topic-title').textContent = '✏️ Sửa chủ đề';
    document.getElementById('f-topic-id').value = found.id;
    document.getElementById('f-topic-id').disabled = true;
    document.getElementById('f-topic-name').value = found.name;
    sel.value = foundSubj.id;
  } else {
    document.getElementById('modal-topic-title').textContent = '➕ Thêm chủ đề';
    document.getElementById('f-topic-id').value = '';
    document.getElementById('f-topic-id').disabled = false;
    document.getElementById('f-topic-name').value = '';
  }
  showModal('modal-topic');
}

async function saveTopic() {
  const id = document.getElementById('f-topic-id').value.trim();
  const name = document.getElementById('f-topic-name').value.trim();
  const subject_id = document.getElementById('f-topic-subj').value;
  if (!id || !name) { toast('Vui lòng điền đầy đủ thông tin'); return; }
  try {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${API}/api/topics/${editingId}` : `${API}/api/topics`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, subject_id }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-topic');
    await loadData();
    toast(editingId ? 'Đã cập nhật chủ đề!' : 'Đã thêm chủ đề!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

async function deleteTopic(id) {
  if (!confirm('Xóa chủ đề này? Tất cả câu hỏi thuộc chủ đề sẽ bị xóa!')) return;
  try {
    await fetch(`${API}/api/topics/${id}`, { method: 'DELETE' });
    await loadData();
    toast('Đã xóa chủ đề!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
let filteredQuestions = [];

function getAllQuestions() {
  const all = [];
  subjects.forEach(s => s.topics.forEach(t => t.questions.forEach(q => {
    all.push({ ...q, subjectId: s.id, subjectName: s.name, subjectIcon: s.icon, topicId: t.id, topicName: t.name });
  })));
  return all;
}

function renderQuestionsTable(list = null) {
  if (!list) list = getAllQuestions();
  filteredQuestions = list;
  const labels = ['A', 'B', 'C', 'D'];
  const tbody = document.getElementById('questions-body');
  tbody.innerHTML = list.length === 0
    ? `<tr class="empty-row"><td colspan="6">Không tìm thấy câu hỏi nào</td></tr>`
    : list.map((q, i) => `<tr>
        <td>${i + 1}</td>
        <td><div class="q-text" title="${q.text}">${q.text}</div></td>
        <td><span class="tag tag-subj">${q.subjectIcon} ${q.subjectName}</span></td>
        <td><span class="tag tag-topic">${q.topicName}</span></td>
        <td><strong>${labels[q.answer]}</strong></td>
        <td class="actions">
          <button class="btn btn-warning btn-sm" onclick="openQuestionModal('${q.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q.id}')">🗑️</button>
        </td>
      </tr>`).join('');
}

function filterQuestions() {
  const search = document.getElementById('q-search').value.toLowerCase();
  const subj = document.getElementById('filter-subject').value;
  const topic = document.getElementById('filter-topic').value;
  let list = getAllQuestions();
  if (search) list = list.filter(q => q.text.toLowerCase().includes(search) || q.options.some(o => o.toLowerCase().includes(search)));
  if (subj) list = list.filter(q => q.subjectId === subj);
  if (topic) list = list.filter(q => q.topicId === topic);
  renderQuestionsTable(list);
}

function populateFilters() {
  const subjSel = document.getElementById('filter-subject');
  const topicSel = document.getElementById('filter-topic');
  const curSubj = subjSel.value, curTopic = topicSel.value;
  subjSel.innerHTML = `<option value="">Tất cả môn</option>` + subjects.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');
  subjSel.value = curSubj;
  topicSel.innerHTML = `<option value="">Tất cả chủ đề</option>` + subjects.flatMap(s => s.topics.map(t => `<option value="${t.id}">${s.icon} ${t.name}</option>`)).join('');
  topicSel.value = curTopic;
}

function openQuestionModal(id = null) {
  editingId = id;
  editingType = 'question';
  const allTopics = subjects.flatMap(s => s.topics.map(t => ({ ...t, subjName: s.name, subjIcon: s.icon })));
  document.getElementById('f-q-topic').innerHTML = allTopics.map(t => `<option value="${t.id}">${t.subjIcon} ${t.name}</option>`).join('');

  if (id) {
    const q = getAllQuestions().find(x => x.id === id);
    document.getElementById('modal-q-title').textContent = '✏️ Sửa câu hỏi';
    document.getElementById('f-q-topic').value = q.topicId;
    document.getElementById('f-q-text').value = q.text;
    ['0','1','2','3'].forEach(i => document.getElementById(`f-opt-${i}`).value = q.options[i] || '');
    document.getElementById(`ans-${q.answer}`).checked = true;
  } else {
    document.getElementById('modal-q-title').textContent = '➕ Thêm câu hỏi';
    document.getElementById('f-q-text').value = '';
    ['0','1','2','3'].forEach(i => document.getElementById(`f-opt-${i}`).value = '');
    document.querySelectorAll('.answer-radio').forEach(r => r.checked = false);
  }
  showModal('modal-question');
}

async function saveQuestion() {
  const topic_id = document.getElementById('f-q-topic').value;
  const text = document.getElementById('f-q-text').value.trim();
  const options = ['0','1','2','3'].map(i => document.getElementById(`f-opt-${i}`).value.trim());
  const answerEl = document.querySelector('.answer-radio:checked');
  if (!text || options.some(o => !o) || !answerEl) { toast('Vui lòng điền đầy đủ thông tin'); return; }
  const answer = parseInt(answerEl.value);
  const id = editingId || `q_${Date.now()}`;

  try {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${API}/api/questions/${editingId}` : `${API}/api/questions`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, topic_id, text, options, answer }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-question');
    await loadData();
    toast(editingId ? 'Đã cập nhật câu hỏi!' : 'Đã thêm câu hỏi!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

async function deleteQuestion(id) {
  if (!confirm('Xóa câu hỏi này?')) return;
  try {
    await fetch(`${API}/api/questions/${id}`, { method: 'DELETE' });
    await loadData();
    toast('Đã xóa câu hỏi!', 'success');
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); editingId = null; }

document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); });
});

let toastT;
function toast(msg, type = 'info') {
  clearTimeout(toastT);
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  if (type === 'error') el.style.background = '#FF6B6B';
  if (type === 'success') el.style.background = '#6BCB77';
  document.body.appendChild(el);
  toastT = setTimeout(() => el.remove(), 3000);
}

init();
