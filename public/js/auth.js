// ── VioQuiz Auth & Profile ─────────────────────────────────────────────────

let currentUser = null;
let provincesCache = null;
let wardsCache = {};

// ── TOKEN STORAGE ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('vq_token'); }
function setToken(t) { localStorage.setItem('vq_token', t); }
function clearToken() { localStorage.removeItem('vq_token'); }

// ── BOOT AUTH ─────────────────────────────────────────────────────────────────
async function initAuth() {
  const token = getToken();
  if (!token) { renderGuestHeader(); return; }
  try {
    const res  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    currentUser = await res.json();
    renderUserHeader();
    prefillStudentName();
  } catch {
    clearToken();
    renderGuestHeader();
  }
}

function prefillStudentName() {
  if (currentUser?.full_name) {
    const el = document.getElementById('student-name');
    if (el && !el.value) el.value = currentUser.full_name;
  }
}

// ── HEADER RENDER ─────────────────────────────────────────────────────────────
function renderGuestHeader() {
  document.getElementById('header-right').innerHTML = `
    <button class="btn-header-login" onclick="openAuth('login')">Đăng nhập</button>
    <button class="btn-header-login" style="background:var(--primary);color:#fff;border-color:var(--primary)" onclick="openAuth('register')">Đăng ký</button>
  `;
}

function renderUserHeader() {
  const u = currentUser;
  const initials = (u.full_name || u.email || 'U').charAt(0).toUpperCase();
  const avatarHTML = u.has_avatar
    ? `<img src="/api/profile/avatar/${u.id}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    : initials;

  document.getElementById('header-right').innerHTML = `
    <div class="user-chip" onclick="toggleDropdown()">
      <div class="chip-avatar" id="chip-avatar">${avatarHTML}</div>
      <span class="chip-name">${u.full_name || u.email}</span>
      <span style="font-size:.7rem;color:var(--text-muted)">▾</span>
    </div>
  `;
}

let dropdownOpen = false;
function toggleDropdown() {
  if (dropdownOpen) { closeDropdown(); return; }
  dropdownOpen = true;
  const u = currentUser;
  const el = document.createElement('div');
  el.className = 'user-dropdown';
  el.id = 'user-dropdown';
  el.innerHTML = `
    <div class="dropdown-header">
      <div class="dropdown-name">${u.full_name || 'Học sinh'}</div>
      <div class="dropdown-email">${u.email}</div>
    </div>
    <button class="dropdown-item" onclick="openProfile()">👤 Hồ sơ cá nhân</button>
    ${u.is_admin ? `<button class="dropdown-item" onclick="window.location='/admin'">⚙️ Quản trị admin</button>` : ''}
    <div class="dropdown-divider"></div>
    <button class="dropdown-item danger" onclick="doLogout()">🚪 Đăng xuất</button>
  `;
  document.getElementById('app-header').style.position = 'fixed';
  document.getElementById('app-header').appendChild(el);
  setTimeout(() => document.addEventListener('click', outsideClick), 10);
}

function closeDropdown() {
  document.getElementById('user-dropdown')?.remove();
  document.removeEventListener('click', outsideClick);
  dropdownOpen = false;
}
function outsideClick(e) {
  if (!document.getElementById('user-dropdown')?.contains(e.target)) closeDropdown();
}

// ── AUTH MODAL ────────────────────────────────────────────────────────────────
function openAuth(tab = 'login') {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchTab(tab);
  clearAuthMsg();
}
function closeAuth() { document.getElementById('auth-modal').classList.add('hidden'); }
function handleModalClick(e) { if (e.target.id === 'auth-modal') closeAuth(); }

function switchTab(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  clearAuthMsg();
}

function showAuthMsg(msg, type = 'error') {
  const el = document.getElementById('auth-message');
  el.innerHTML = `<div class="auth-${type}">${msg}</div>`;
}
function clearAuthMsg() { document.getElementById('auth-message').innerHTML = ''; }

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthMsg('Vui lòng điền đầy đủ thông tin'); return; }
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    currentUser = data.user;
    closeAuth();
    renderUserHeader();
    prefillStudentName();
    showToast(`Chào mừng ${data.user.full_name || data.user.email}! 👋`);
  } catch (err) { showAuthMsg(err.message); }
}

async function doRegister() {
  const full_name = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  if (!email || !password) { showAuthMsg('Vui lòng điền email và mật khẩu'); return; }
  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setToken(data.token);
    currentUser = data.user;
    closeAuth();
    renderUserHeader();
    prefillStudentName();
    showAuthMsg('Đăng ký thành công! Hãy cập nhật hồ sơ của bạn.', 'success');
    showToast(`Chào mừng ${data.user.full_name || data.user.email}! 🎉`);
    setTimeout(openProfile, 1500);
  } catch (err) { showAuthMsg(err.message); }
}

function doLogout() {
  clearToken();
  currentUser = null;
  closeDropdown();
  renderGuestHeader();
  showToast('Đã đăng xuất 👋');
  goHome();
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
async function openProfile() {
  closeDropdown();
  if (!currentUser) { openAuth('login'); return; }
  showScreen('profile');
  await loadProfileData();
}

async function loadProfileData() {
  const u = currentUser;
  document.getElementById('p-fullname').value = u.full_name  || '';
  document.getElementById('p-email').value    = u.email      || '';
  document.getElementById('p-phone').value    = u.phone      || '';
  document.getElementById('p-class').value    = u.class_name || '';
  document.getElementById('p-school').value   = u.school     || '';

  // Avatar
  const img      = document.getElementById('avatar-img');
  const initials = document.getElementById('avatar-initials');
  if (u.has_avatar) {
    img.src = `/api/profile/avatar/${u.id}?t=${Date.now()}`;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.style.display = 'none';
    initials.textContent = (u.full_name || u.email || 'U').charAt(0).toUpperCase();
    initials.style.display = '';
  }

  // Load provinces
  await loadProvinces();
  if (u.province_code) {
    document.getElementById('p-province').value = u.province_code;
    await loadWards(u.ward_code);
  }
}

// ── PROVINCES / WARDS ────────────────────────────────────────────────────────
// Nguồn 1: huynhminhvangit.github.io/vn-region-api  (GitHub Pages → trả HTML)
// Nguồn 2: provinces.open-api.vn  (fallback JSON thuần)
// Nguồn 3: PROVINCE_FALLBACK hardcode (offline)

const VN_API_1 = 'https://huynhminhvangit.github.io/vn-region-api';
const VN_API_2 = 'https://provinces.open-api.vn/api';

// Parse JSON từ HTML trả về bởi GitHub Pages API
// Dữ liệu nằm trong <pre>...</pre> hoặc <pre class="...">...</pre>
function extractJsonFromHtml(html) {
  // Thử <pre>...</pre> trước (đây là format của vn-region-api)
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    try { return JSON.parse(preMatch[1].trim()); } catch {}
  }
  // Thử tìm array JSON lớn nhất trong trang (greedy match)
  const arrMatch = html.match(/(\[[\s\S]+\])/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[1]); } catch {}
  }
  return null;
}

async function loadProvinces() {
  if (provincesCache) { renderProvinceSelect(provincesCache); return; }
  try {
    // Nguồn 1: provinces.json trả về JSON thuần
    const res  = await fetch(`${VN_API_1}/data/provinces.json`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }           // JSON thuần
    catch { data = extractJsonFromHtml(text); } // HTML wrapper
    if (!data || !data.length) throw new Error('empty');
    provincesCache = data.map(p => ({ code: String(p.code), name: p.name }));
  } catch {
    try {
      // Nguồn 2: open-api.vn
      const res2 = await fetch(`${VN_API_2}/?depth=1`);
      const data2 = await res2.json();
      provincesCache = (Array.isArray(data2) ? data2 : [])
        .map(p => ({ code: String(p.code), name: p.name }));
    } catch {
      // Nguồn 3: hardcode fallback
      console.warn('Dùng danh sách tỉnh/thành offline');
      provincesCache = PROVINCE_FALLBACK;
    }
  }
  renderProvinceSelect(provincesCache);
}

function renderProvinceSelect(provinces) {
  const sel = document.getElementById('p-province');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Chọn tỉnh/thành phố --</option>' +
    provinces.map(p => `<option value="${p.code}">${p.name}</option>`).join('');
  if (cur) sel.value = cur;
}

async function loadWards(preselect = null) {
  const provinceCode = document.getElementById('p-province').value;
  const wardSel      = document.getElementById('p-ward');

  if (!provinceCode) {
    wardSel.innerHTML = '<option value="">-- Chọn tỉnh trước --</option>';
    wardSel.disabled  = true;
    return;
  }

  wardSel.disabled  = true;
  wardSel.innerHTML = '<option>⏳ Đang tải phường/xã...</option>';

  try {
    if (!wardsCache[provinceCode]) {
      let wards = null;

      // ── Nguồn 1: vn-region-api (GitHub Pages, trả HTML) ──────────────────
      try {
        const res  = await fetch(`${VN_API_1}/api/wards.html?province_code=${provinceCode}`);
        const text = await res.text();
        // GitHub Pages API nhúng JSON trong <pre>...</pre>
        const parsed = extractJsonFromHtml(text);
        if (Array.isArray(parsed) && parsed.length > 0) wards = parsed;
      } catch {}

      // ── Nguồn 2: open-api.vn (JSON thuần, depth=2 lấy wards) ─────────────
      if (!wards || wards.length === 0) {
        try {
          const res2  = await fetch(`${VN_API_2}/p/${provinceCode}?depth=2`);
          const data2 = await res2.json();
          // Cấu trúc: { districts: [{ wards: [...] }] }
          const allWards = [];
          (data2.districts || []).forEach(d => {
            (d.wards || []).forEach(w => allWards.push({ code: String(w.code), name: w.name }));
          });
          if (allWards.length > 0) wards = allWards;
        } catch {}
      }

      wardsCache[provinceCode] = (wards || []).map(w => ({
        code: String(w.code || w.ward_code || ''),
        name: w.name || w.ward_name || '',
      })).filter(w => w.name);
    }

    const wards = wardsCache[provinceCode];
    if (!wards.length) throw new Error('Không có dữ liệu phường/xã');

    wardSel.innerHTML = '<option value="">-- Chọn phường/xã --</option>' +
      wards.map(w => `<option value="${w.code}">${w.name}</option>`).join('');
    wardSel.disabled = false;
    if (preselect) wardSel.value = preselect;

  } catch (err) {
    wardSel.innerHTML = '<option value="">-- Không tải được, thử lại --</option>';
    wardSel.disabled  = false;
    // Xóa cache để lần sau thử lại
    delete wardsCache[provinceCode];
    console.warn('Ward load error:', err.message);
  }
}

async function saveProfile() {
  const provinceCode = document.getElementById('p-province').value;
  const provinceName = document.getElementById('p-province').selectedOptions[0]?.text || '';
  const wardCode     = document.getElementById('p-ward').value;
  const wardName     = document.getElementById('p-ward').selectedOptions[0]?.text || '';

  const body = {
    full_name:     document.getElementById('p-fullname').value.trim(),
    phone:         document.getElementById('p-phone').value.trim(),
    class_name:    document.getElementById('p-class').value.trim(),
    school:        document.getElementById('p-school').value.trim(),
    province_code: provinceCode,
    province_name: provinceName === '-- Chọn tỉnh/thành phố --' ? '' : provinceName,
    ward_code:     wardCode,
    ward_name:     wardName === '-- Chọn phường/xã --' ? '' : wardName,
  };

  try {
    const res  = await fetch('/api/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    Object.assign(currentUser, body);
    renderUserHeader();
    profileMsg('✅ Đã lưu thông tin thành công!', 'success');
    if (body.full_name) prefillStudentName();
  } catch (err) { profileMsg('❌ ' + err.message, 'error'); }
}

function profileMsg(msg, type) {
  const el = document.getElementById('profile-msg');
  el.innerHTML = `<div class="auth-${type}">${msg}</div>`;
  setTimeout(() => el.innerHTML = '', 4000);
}

async function changePassword() {
  const cur = document.getElementById('p-cur-pwd').value;
  const nw  = document.getElementById('p-new-pwd').value;
  if (!cur || !nw) { pwdMsg('Vui lòng điền đầy đủ', 'error'); return; }
  try {
    const res  = await fetch('/api/profile/password', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ current_password: cur, new_password: nw })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    document.getElementById('p-cur-pwd').value = '';
    document.getElementById('p-new-pwd').value = '';
    pwdMsg('✅ Đổi mật khẩu thành công!', 'success');
  } catch (err) { pwdMsg('❌ ' + err.message, 'error'); }
}
function pwdMsg(msg, type) {
  const el = document.getElementById('pwd-msg');
  el.innerHTML = `<div class="auth-${type}">${msg}</div>`;
  setTimeout(() => el.innerHTML = '', 4000);
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const avatarMsg = document.getElementById('avatar-msg');
  if (file.size > 20 * 1024) {
    avatarMsg.innerHTML = '<div class="auth-error">❌ File quá lớn! Giới hạn 20KB</div>';
    return;
  }
  const fd = new FormData();
  fd.append('avatar', file);
  try {
    const res  = await fetch('/api/profile/avatar', {
      method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    currentUser.has_avatar = true;
    // Update preview immediately
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('avatar-img').src = e.target.result;
      document.getElementById('avatar-img').style.display = 'block';
      document.getElementById('avatar-initials').style.display = 'none';
    };
    reader.readAsDataURL(file);
    renderUserHeader();
    avatarMsg.innerHTML = '<div class="auth-success">✅ Cập nhật ảnh đại diện thành công!</div>';
    setTimeout(() => avatarMsg.innerHTML = '', 3000);
  } catch (err) {
    avatarMsg.innerHTML = `<div class="auth-error">❌ ${err.message}</div>`;
  }
}

// ── FALLBACK province list (34 tỉnh, nếu API không load được) ─────────────────
const PROVINCE_FALLBACK = [
  {code:'01',name:'Thành phố Hà Nội'},{code:'02',name:'Tỉnh Hà Giang'},
  {code:'04',name:'Tỉnh Cao Bằng'},{code:'06',name:'Tỉnh Bắc Kạn'},
  {code:'08',name:'Tỉnh Tuyên Quang'},{code:'10',name:'Tỉnh Lào Cai'},
  {code:'11',name:'Tỉnh Điện Biên'},{code:'12',name:'Tỉnh Lai Châu'},
  {code:'14',name:'Tỉnh Sơn La'},{code:'15',name:'Tỉnh Yên Bái'},
  {code:'17',name:'Tỉnh Hoà Bình'},{code:'19',name:'Tỉnh Thái Nguyên'},
  {code:'20',name:'Tỉnh Lạng Sơn'},{code:'22',name:'Tỉnh Quảng Ninh'},
  {code:'24',name:'Tỉnh Bắc Giang'},{code:'25',name:'Tỉnh Phú Thọ'},
  {code:'26',name:'Tỉnh Vĩnh Phúc'},{code:'27',name:'Tỉnh Bắc Ninh'},
  {code:'30',name:'Tỉnh Hưng Yên'},{code:'31',name:'Tỉnh Hải Dương'},
  {code:'32',name:'Thành phố Hải Phòng'},{code:'33',name:'Tỉnh Nam Định'},
  {code:'34',name:'Tỉnh Thái Bình'},{code:'35',name:'Tỉnh Hà Nam'},
  {code:'36',name:'Tỉnh Ninh Bình'},{code:'37',name:'Tỉnh Thanh Hóa'},
  {code:'38',name:'Tỉnh Nghệ An'},{code:'40',name:'Tỉnh Hà Tĩnh'},
  {code:'42',name:'Tỉnh Quảng Bình'},{code:'44',name:'Tỉnh Quảng Trị'},
  {code:'45',name:'Thành phố Huế'},{code:'48',name:'Thành phố Đà Nẵng'},
  {code:'49',name:'Tỉnh Quảng Nam'},{code:'51',name:'Tỉnh Quảng Ngãi'},
  {code:'52',name:'Tỉnh Bình Định'},{code:'54',name:'Tỉnh Phú Yên'},
  {code:'56',name:'Tỉnh Khánh Hòa'},{code:'58',name:'Tỉnh Ninh Thuận'},
  {code:'60',name:'Tỉnh Bình Thuận'},{code:'62',name:'Tỉnh Kon Tum'},
  {code:'64',name:'Tỉnh Gia Lai'},{code:'66',name:'Tỉnh Đắk Lắk'},
  {code:'67',name:'Tỉnh Đắk Nông'},{code:'68',name:'Tỉnh Lâm Đồng'},
  {code:'70',name:'Tỉnh Bình Phước'},{code:'72',name:'Tỉnh Tây Ninh'},
  {code:'74',name:'Tỉnh Bình Dương'},{code:'75',name:'Tỉnh Đồng Nai'},
  {code:'77',name:'Tỉnh Bà Rịa - Vũng Tàu'},{code:'79',name:'Thành phố Hồ Chí Minh'},
  {code:'80',name:'Tỉnh Long An'},{code:'82',name:'Tỉnh Tiền Giang'},
  {code:'83',name:'Tỉnh Bến Tre'},{code:'84',name:'Tỉnh Trà Vinh'},
  {code:'86',name:'Tỉnh Vĩnh Long'},{code:'87',name:'Tỉnh Đồng Tháp'},
  {code:'89',name:'Tỉnh An Giang'},{code:'91',name:'Tỉnh Kiên Giang'},
  {code:'92',name:'Thành phố Cần Thơ'},{code:'93',name:'Tỉnh Hậu Giang'},
  {code:'94',name:'Tỉnh Sóc Trăng'},{code:'95',name:'Tỉnh Bạc Liêu'},
  {code:'96',name:'Tỉnh Cà Mau'}
];

// Boot
initAuth();
