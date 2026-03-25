// ── VioQuiz Admin v3 – JWT Auth + PostgreSQL ──────────────────────────────────
const API = '';
let subjects  = [];
let allTopics = [];
let editingId = null;
let adminUser = null;

// ── TOKEN ─────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('vq_admin_token') || localStorage.getItem('vq_token'); }
function setToken(t) { localStorage.setItem('vq_admin_token', t); }
function clearToken() { localStorage.removeItem('vq_admin_token'); }

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
async function boot() {
  const token = getToken();
  if (token) {
    try {
      const res  = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const user = await res.json();
      if (res.ok && user.is_admin) {
        adminUser = user;
        showAdminScreen();
        return;
      }
    } catch {}
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('admin-screen').classList.remove('active');
}

function showAdminScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-screen').classList.add('active');
  document.getElementById('adm-name').textContent    = adminUser.full_name || 'Admin';
  document.getElementById('adm-email-label').textContent = adminUser.email;
  initAdminPanel();
}

async function adminLogin() {
  const email    = document.getElementById('adm-email').value.trim();
  const password = document.getElementById('adm-password').value;
  if (!email || !password) { showLoginError('Vui lòng điền email và mật khẩu'); return; }
  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (!data.user.is_admin) throw new Error('Tài khoản này không có quyền admin');
    setToken(data.token);
    adminUser = data.user;
    showAdminScreen();
  } catch (err) { showLoginError(err.message); }
}

function showLoginError(msg) {
  document.getElementById('login-error').innerHTML = `<div class="login-error">❌ ${msg}</div>`;
}

function adminLogout() {
  clearToken();
  adminUser = null;
  showLoginScreen();
}

// ── ADMIN PANEL INIT ──────────────────────────────────────────────────────────
async function initAdminPanel() {
  await checkStatus();
  await loadSubjects();
  await loadTopicsFlat();
  renderAll();
  await loadQuestions();
}

async function checkStatus() {
  try {
    const res  = await fetch(`${API}/api/status`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error();
    document.getElementById('db-dot').className   = 'db-dot';
    document.getElementById('db-label').textContent = `PostgreSQL ✓`;
    if (data.stats) {
      document.getElementById('stat-subj').textContent  = data.stats.subjects;
      document.getElementById('stat-topic').textContent = data.stats.topics;
      document.getElementById('stat-q').textContent     = data.stats.questions;
      document.getElementById('stat-users').textContent = data.stats.users;
    }
  } catch {
    document.getElementById('db-dot').className   = 'db-dot offline';
    document.getElementById('db-label').textContent = 'Lỗi kết nối';
  }
}

async function loadSubjects() {
  const res = await fetch(`${API}/api/subjects`, { headers: authHeaders() });
  subjects  = await res.json();
}

async function loadTopicsFlat() {
  const res = await fetch(`${API}/api/topics`, { headers: authHeaders() });
  allTopics = await res.json();
}

function renderAll() {
  renderDashSubjects();
  renderSubjectsList();
  renderTopicsTable();
  populateFilters();
}

function renderDashSubjects() {
  const bySubj = {};
  allTopics.forEach(t => bySubj[t.subject_id] = (bySubj[t.subject_id] || 0) + 1);
  document.getElementById('dash-subjects').innerHTML = subjects.map(s => `
    <div style="background:#fff;border-radius:12px;padding:1rem 1.25rem;margin-bottom:.75rem;
                box-shadow:var(--shadow);display:flex;align-items:center;gap:1rem;border-left:4px solid ${s.color||'var(--primary)'}">
      <span style="font-size:2rem">${s.icon||'📚'}</span>
      <div style="flex:1"><strong style="color:var(--primary)">${s.name}</strong><br>
        <span style="font-size:.8rem;color:var(--muted)">${s.name_en||''} • ${bySubj[s.id]||0} chủ đề</span></div>
      <span style="background:#EDE8FF;border-radius:8px;padding:.3rem .8rem;font-weight:800;color:var(--primary);font-size:.85rem">${s.id}</span>
    </div>`).join('');
}

// ── SUBJECTS ──────────────────────────────────────────────────────────────────
function renderSubjectsList() {
  document.getElementById('subjects-list').innerHTML = subjects.map(s => `
    <div class="subj-admin-card" style="border-left-color:${s.color||'var(--primary)'}">
      <div class="s-icon">${s.icon||'📚'}</div>
      <div class="s-name">${s.name}</div>
      <div class="s-meta">${s.name_en||''} • ${allTopics.filter(t=>t.subject_id===s.id).length} chủ đề</div>
      <div class="s-actions">
        <button class="btn btn-warning btn-sm" onclick="openSubjectModal('${s.id}')">✏️ Sửa</button>
        <button class="btn btn-danger  btn-sm" onclick="deleteSubject('${s.id}')">🗑️</button>
      </div>
    </div>`).join('') || '<p style="color:var(--muted)">Chưa có môn học nào.</p>';
}

function openSubjectModal(id = null) {
  editingId = id;
  if (id) {
    const s = subjects.find(x => x.id === id);
    document.getElementById('modal-subj-title').textContent = '✏️ Sửa môn học';
    document.getElementById('f-subj-id').value      = s.id; document.getElementById('f-subj-id').disabled = true;
    document.getElementById('f-subj-name').value    = s.name;
    document.getElementById('f-subj-name-en').value = s.name_en||'';
    document.getElementById('f-subj-icon').value    = s.icon||'';
    document.getElementById('f-subj-color').value   = s.color||'#6C3CE1';
  } else {
    document.getElementById('modal-subj-title').textContent = '➕ Thêm môn học';
    ['f-subj-id','f-subj-name','f-subj-name-en','f-subj-icon'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('f-subj-id').disabled = false;
    document.getElementById('f-subj-color').value = '#6C3CE1';
  }
  showModal('modal-subject');
}

async function saveSubject() {
  const id=document.getElementById('f-subj-id').value.trim(), name=document.getElementById('f-subj-name').value.trim();
  const name_en=document.getElementById('f-subj-name-en').value.trim(), icon=document.getElementById('f-subj-icon').value.trim();
  const color=document.getElementById('f-subj-color').value;
  if(!id||!name){toast('Vui lòng điền ID và Tên môn học');return;}
  try {
    const method=editingId?'PUT':'POST', url=editingId?`${API}/api/subjects/${editingId}`:`${API}/api/subjects`;
    const res=await fetch(url,{method,headers:authHeaders(),body:JSON.stringify({id,name,name_en,icon,color})});
    const data=await res.json();
    if(!data.success) throw new Error(data.error);
    closeModal('modal-subject'); await reload();
    toast(editingId?'Đã cập nhật môn học!':'Đã thêm môn học!','success');
  } catch(err){toast('Lỗi: '+err.message,'error');}
}

async function deleteSubject(id) {
  if(!confirm(`Xóa môn học "${id}"? Tất cả chủ đề và câu hỏi sẽ bị xóa!`)) return;
  await fetch(`${API}/api/subjects/${id}`,{method:'DELETE',headers:authHeaders()});
  await reload(); toast('Đã xóa môn học!','success');
}

// ── TOPICS ────────────────────────────────────────────────────────────────────
function renderTopicsTable() {
  document.getElementById('topics-body').innerHTML = allTopics.length===0
    ?`<tr class="empty-row"><td colspan="3">Chưa có chủ đề nào</td></tr>`
    :allTopics.map(t=>`<tr>
        <td>${t.name}</td>
        <td><span class="tag tag-subj">${t.subject_icon||''} ${t.subject_name}</span></td>
        <td class="actions">
          <button class="btn btn-warning btn-sm" onclick="openTopicModal('${t.id}')">✏️</button>
          <button class="btn btn-danger  btn-sm" onclick="deleteTopic('${t.id}')">🗑️</button>
        </td></tr>`).join('');
}

function openTopicModal(id=null) {
  editingId=id;
  const sel=document.getElementById('f-topic-subj');
  sel.innerHTML=subjects.map(s=>`<option value="${s.id}">${s.icon||''} ${s.name}</option>`).join('');
  if(id) {
    const t=allTopics.find(x=>x.id===id);
    document.getElementById('modal-topic-title').textContent='✏️ Sửa chủ đề';
    document.getElementById('f-topic-id').value=t.id; document.getElementById('f-topic-id').disabled=true;
    document.getElementById('f-topic-name').value=t.name; sel.value=t.subject_id;
  } else {
    document.getElementById('modal-topic-title').textContent='➕ Thêm chủ đề';
    document.getElementById('f-topic-id').value=''; document.getElementById('f-topic-id').disabled=false;
    document.getElementById('f-topic-name').value='';
  }
  showModal('modal-topic');
}

async function saveTopic() {
  const id=document.getElementById('f-topic-id').value.trim(), name=document.getElementById('f-topic-name').value.trim();
  const subject_id=document.getElementById('f-topic-subj').value;
  if(!id||!name){toast('Vui lòng điền đầy đủ thông tin');return;}
  try {
    const method=editingId?'PUT':'POST', url=editingId?`${API}/api/topics/${editingId}`:`${API}/api/topics`;
    const res=await fetch(url,{method,headers:authHeaders(),body:JSON.stringify({id,name,subject_id})});
    const data=await res.json();
    if(!data.success) throw new Error(data.error);
    closeModal('modal-topic'); await reload();
    toast(editingId?'Đã cập nhật chủ đề!':'Đã thêm chủ đề!','success');
  } catch(err){toast('Lỗi: '+err.message,'error');}
}

async function deleteTopic(id) {
  if(!confirm('Xóa chủ đề? Tất cả câu hỏi sẽ bị xóa!')) return;
  await fetch(`${API}/api/topics/${id}`,{method:'DELETE',headers:authHeaders()});
  await reload(); toast('Đã xóa chủ đề!','success');
}

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
let currentQuestions=[];

async function loadQuestions(params={}) {
  const qs=new URLSearchParams();
  if(params.subject) qs.set('subject',params.subject);
  if(params.topic)   qs.set('topic',params.topic);
  if(params.search)  qs.set('search',params.search);
  const res=await fetch(`${API}/api/questions-list?${qs}`,{headers:authHeaders()});
  currentQuestions=await res.json();
  renderQuestionsTable(currentQuestions);
}

function renderQuestionsTable(rows) {
  const labels=['A','B','C','D'];
  document.getElementById('q-count-label').textContent=`${rows.length} câu hỏi`;
  document.getElementById('questions-body').innerHTML=rows.length===0
    ?`<tr class="empty-row"><td colspan="6">Không tìm thấy câu hỏi nào</td></tr>`
    :rows.map((q,i)=>`<tr>
        <td style="color:var(--muted);font-size:.8rem">${i+1}</td>
        <td><div class="q-text" title="${esc(q.text)}">${esc(q.text)}</div></td>
        <td><span class="tag tag-subj">${q.subject_icon||''} ${q.subject_name}</span></td>
        <td><span class="tag tag-topic">${q.topic_name}</span></td>
        <td><strong style="color:var(--primary)">${labels[q.answer]}</strong></td>
        <td class="actions">
          <button class="btn btn-warning btn-sm" onclick="openQuestionModal('${q.id}')">✏️</button>
          <button class="btn btn-danger  btn-sm" onclick="deleteQuestion('${q.id}')">🗑️</button>
        </td></tr>`).join('');
}

function populateFilters() {
  const fS=document.getElementById('filter-subject'), fT=document.getElementById('filter-topic');
  const pS=fS.value, pT=fT.value;
  fS.innerHTML=`<option value="">Tất cả môn</option>`+subjects.map(s=>`<option value="${s.id}">${s.icon||''} ${s.name}</option>`).join('');
  fT.innerHTML=`<option value="">Tất cả chủ đề</option>`+allTopics.map(t=>`<option value="${t.id}">${t.subject_icon||''} ${t.name}</option>`).join('');
  fS.value=pS; fT.value=pT;
  const mqt=document.getElementById('f-q-topic');
  if(mqt) mqt.innerHTML=allTopics.map(t=>`<option value="${t.id}">${t.subject_icon||''} ${t.subject_name} – ${t.name}</option>`).join('');
}

function applyFilters() {
  loadQuestions({
    subject: document.getElementById('filter-subject').value,
    topic:   document.getElementById('filter-topic').value,
    search:  document.getElementById('q-search').value.trim(),
  });
}

function openQuestionModal(id=null) {
  editingId=id; populateFilters();
  if(id) {
    const q=currentQuestions.find(x=>x.id===id);
    document.getElementById('modal-q-title').textContent='✏️ Sửa câu hỏi';
    document.getElementById('f-q-topic').value=q.topic_id;
    document.getElementById('f-q-text').value=q.text;
    const opts=Array.isArray(q.options)?q.options:JSON.parse(q.options);
    opts.forEach((o,i)=>document.getElementById(`f-opt-${i}`).value=o);
    const r=document.getElementById(`ans-${q.answer}`); if(r) r.checked=true;
  } else {
    document.getElementById('modal-q-title').textContent='➕ Thêm câu hỏi';
    document.getElementById('f-q-text').value='';
    [0,1,2,3].forEach(i=>document.getElementById(`f-opt-${i}`).value='');
    document.querySelectorAll('.answer-radio').forEach(r=>r.checked=false);
  }
  showModal('modal-question');
}

async function saveQuestion() {
  const topic_id=document.getElementById('f-q-topic').value;
  const text=document.getElementById('f-q-text').value.trim();
  const options=[0,1,2,3].map(i=>document.getElementById(`f-opt-${i}`).value.trim());
  const answerEl=document.querySelector('.answer-radio:checked');
  if(!topic_id||!text||options.some(o=>!o)||!answerEl){toast('Vui lòng điền đầy đủ và chọn đáp án đúng');return;}
  const answer=parseInt(answerEl.value);
  try {
    const method=editingId?'PUT':'POST', url=editingId?`${API}/api/questions/${editingId}`:`${API}/api/questions`;
    const res=await fetch(url,{method,headers:authHeaders(),body:JSON.stringify({topic_id,text,options,answer})});
    const data=await res.json();
    if(!data.success) throw new Error(data.error);
    closeModal('modal-question'); await checkStatus(); applyFilters();
    toast(editingId?'Đã cập nhật câu hỏi!':'Đã thêm câu hỏi!','success');
  } catch(err){toast('Lỗi: '+err.message,'error');}
}

async function deleteQuestion(id) {
  if(!confirm('Xóa câu hỏi này?')) return;
  await fetch(`${API}/api/questions/${id}`,{method:'DELETE',headers:authHeaders()});
  await checkStatus(); applyFilters(); toast('Đã xóa câu hỏi!','success');
}

// ── USERS ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const search=document.getElementById('user-search').value.trim();
  const qs=search?`?search=${encodeURIComponent(search)}`:'';
  const res=await fetch(`${API}/api/admin/users${qs}`,{headers:authHeaders()});
  const rows=await res.json();
  document.getElementById('users-body').innerHTML=rows.length===0
    ?`<tr class="empty-row"><td colspan="7">Không tìm thấy người dùng</td></tr>`
    :rows.map((u,i)=>`<tr>
        <td style="color:var(--muted);font-size:.8rem">${i+1}</td>
        <td><strong>${esc(u.full_name||'—')}</strong></td>
        <td style="font-size:.85rem">${esc(u.email)}</td>
        <td style="font-size:.8rem">${esc(u.class_name||'—')} / ${esc(u.school||'—')}</td>
        <td style="font-size:.8rem">${esc(u.province_name||'—')}<br><span style="color:var(--muted)">${esc(u.ward_name||'')}</span></td>
        <td style="font-size:.8rem">${new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
        <td>
          <span class="tag ${u.is_admin?'tag-admin':'tag-topic'}">${u.is_admin?'Admin':'Học sinh'}</span>
        </td></tr>`).join('');
}

// ── RELOAD ────────────────────────────────────────────────────────────────────
async function reload() {
  await loadSubjects(); await loadTopicsFlat();
  renderAll(); applyFilters(); await checkStatus();
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function showPage(name,btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelectorAll('.sidebar-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(name==='users') loadUsers();
}

function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); editingId=null; }
document.querySelectorAll && document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)closeModal(el.id);}));
});

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let toastT;
function toast(msg,type='info') {
  clearTimeout(toastT);
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
  if(type==='error')   el.style.background='#FF6B6B';
  if(type==='success') el.style.background='#6BCB77';
  document.body.appendChild(el);
  toastT=setTimeout(()=>el.remove(),3500);
}

boot();
