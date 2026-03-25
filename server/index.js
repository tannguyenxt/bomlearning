const express   = require('express');
const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs').promises;
const cors      = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const JWT_SECRET   = process.env.JWT_SECRET || 'vioquiz-secret-change-in-prod-2025';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || 'admin@vioquiz.vn';

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ─── MULTER (avatar, store in memory, validate before saving) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 }, // 20KB hard limit
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file JPG hoặc PNG'));
  },
});

// ─── MIDDLEWARE: Verify JWT ───────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Không có quyền admin' });
    next();
  });
}

// ─── DB INIT ─────────────────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(200) UNIQUE NOT NULL,
        password_hash VARCHAR(200) NOT NULL,
        full_name     VARCHAR(200),
        phone         VARCHAR(20),
        class_name    VARCHAR(50),
        school        VARCHAR(200),
        province_code VARCHAR(10),
        province_name VARCHAR(200),
        ward_code     VARCHAR(10),
        ward_name     VARCHAR(200),
        avatar_data   TEXT,
        avatar_mime   VARCHAR(20),
        is_admin      BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id         VARCHAR(100) PRIMARY KEY,
        name       VARCHAR(200) NOT NULL,
        name_en    VARCHAR(200),
        icon       VARCHAR(20),
        color      VARCHAR(20),
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS topics (
        id         VARCHAR(100) PRIMARY KEY,
        subject_id VARCHAR(100) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        name       VARCHAR(200) NOT NULL,
        sort_order INT DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS questions (
        id        VARCHAR(100) PRIMARY KEY,
        topic_id  VARCHAR(100) NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        text      TEXT NOT NULL,
        options   JSONB NOT NULL,
        answer    INT  NOT NULL CHECK (answer >= 0 AND answer <= 3)
      );
    `);

    // Seed admin account if not exists
    const { rows: admins } = await client.query("SELECT id FROM users WHERE email=$1", [ADMIN_EMAIL]);
    if (admins.length === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
      await client.query(
        "INSERT INTO users (email, password_hash, full_name, is_admin) VALUES ($1,$2,'Administrator',TRUE)",
        [ADMIN_EMAIL, hash]
      );
      console.log(`Admin created: ${ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
    }

    // Seed questions from JSON if empty
    const { rows } = await client.query('SELECT COUNT(*) AS cnt FROM subjects');
    if (parseInt(rows[0].cnt) === 0) await seedDatabase(client);

    console.log('DB ready');
  } finally {
    client.release();
  }
}

async function seedDatabase(client) {
  const raw  = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
  const data = JSON.parse(raw);
  for (let si = 0; si < data.subjects.length; si++) {
    const s = data.subjects[si];
    await client.query('INSERT INTO subjects (id,name,name_en,icon,color,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [s.id, s.name, s.name_en, s.icon, s.color, si]);
    for (let ti = 0; ti < s.topics.length; ti++) {
      const t = s.topics[ti];
      await client.query('INSERT INTO topics (id,subject_id,name,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [t.id, s.id, t.name, ti]);
      for (const q of t.questions) {
        await client.query('INSERT INTO questions (id,topic_id,text,options,answer) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
          [q.id, t.id, q.text, JSON.stringify(q.options), q.answer]);
      }
    }
  }
  console.log('Questions seeded');
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING id, email, full_name, is_admin',
      [email.toLowerCase().trim(), hash, full_name?.trim() || null]
    );
    const user  = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, is_admin: user.is_admin } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email đã được sử dụng' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    const token = jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, full_name: user.full_name,
        phone: user.phone, class_name: user.class_name, school: user.school,
        province_code: user.province_code, province_name: user.province_name,
        ward_code: user.ward_code, ward_name: user.ward_name,
        has_avatar: !!user.avatar_data, is_admin: user.is_admin,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/auth/me
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,email,full_name,phone,class_name,school,province_code,province_name,ward_code,ward_name,is_admin,avatar_data IS NOT NULL AS has_avatar FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User không tồn tại' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// PUT /api/profile  – cập nhật thông tin
app.put('/api/profile', authRequired, async (req, res) => {
  const { full_name, phone, class_name, school, province_code, province_name, ward_code, ward_name } = req.body;
  try {
    await pool.query(`
      UPDATE users SET
        full_name=$1, phone=$2, class_name=$3, school=$4,
        province_code=$5, province_name=$6, ward_code=$7, ward_name=$8,
        updated_at=NOW()
      WHERE id=$9`,
      [full_name, phone, class_name, school, province_code, province_name, ward_code, ward_name, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/profile/password
app.put('/api/profile/password', authRequired, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/profile/avatar  – upload avatar (max 20KB, JPG/PNG)
app.post('/api/profile/avatar', authRequired, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file nào được tải lên' });
  try {
    const b64  = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;
    await pool.query('UPDATE users SET avatar_data=$1, avatar_mime=$2, updated_at=NOW() WHERE id=$3',
      [b64, mime, req.user.id]);
    res.json({ success: true, avatar_url: `/api/profile/avatar/${req.user.id}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/profile/avatar/:id  – phục vụ avatar
app.get('/api/profile/avatar/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT avatar_data, avatar_mime FROM users WHERE id=$1', [req.params.id]);
    if (!rows[0]?.avatar_data) return res.status(404).send('No avatar');
    const buf = Buffer.from(rows[0].avatar_data, 'base64');
    res.set('Content-Type', rows[0].avatar_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) { res.status(500).send(err.message); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUIZ ROUTES (public)
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/questions', async (req, res) => {
  try {
    const { rows: subjects }  = await pool.query('SELECT * FROM subjects ORDER BY sort_order, name');
    const { rows: topics }    = await pool.query('SELECT * FROM topics ORDER BY sort_order, name');
    const { rows: questions } = await pool.query('SELECT * FROM questions');
    const data = subjects.map(s => ({
      ...s,
      topics: topics.filter(t => t.subject_id === s.id).map(t => ({
        ...t,
        questions: questions.filter(q => q.topic_id === t.id)
      }))
    }));
    res.json({ subjects: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES (require admin token)
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/status', adminRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT (SELECT COUNT(*) FROM subjects)  AS subjects,
             (SELECT COUNT(*) FROM topics)    AS topics,
             (SELECT COUNT(*) FROM questions) AS questions,
             (SELECT COUNT(*) FROM users)     AS users
    `);
    res.json({ database: 'postgresql', status: 'connected', stats: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Users list (admin)
app.get('/api/admin/users', adminRequired, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT id,email,full_name,phone,class_name,school,province_name,ward_name,is_admin,created_at FROM users WHERE 1=1';
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (email ILIKE $1 OR full_name ILIKE $1)`; }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id/toggle-admin', adminRequired, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_admin = NOT is_admin WHERE id=$1 AND email != $2',
      [req.params.id, ADMIN_EMAIL]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SUBJECTS
app.get('/api/subjects', adminRequired, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM subjects ORDER BY sort_order, name');
  res.json(rows);
});
app.post('/api/subjects', adminRequired, async (req, res) => {
  const { id, name, name_en, icon, color } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id và name là bắt buộc' });
  try {
    await pool.query('INSERT INTO subjects (id,name,name_en,icon,color) VALUES ($1,$2,$3,$4,$5)',
      [id.trim(), name.trim(), name_en, icon, color]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/subjects/:id', adminRequired, async (req, res) => {
  const { name, name_en, icon, color } = req.body;
  await pool.query('UPDATE subjects SET name=$1,name_en=$2,icon=$3,color=$4 WHERE id=$5',
    [name, name_en, icon, color, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/subjects/:id', adminRequired, async (req, res) => {
  await pool.query('DELETE FROM subjects WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// TOPICS
app.get('/api/topics', adminRequired, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT t.*, s.name AS subject_name, s.icon AS subject_icon FROM topics t JOIN subjects s ON s.id=t.subject_id ORDER BY s.sort_order, t.sort_order, t.name');
  res.json(rows);
});
app.post('/api/topics', adminRequired, async (req, res) => {
  const { id, subject_id, name } = req.body;
  if (!id || !subject_id || !name) return res.status(400).json({ error: 'Thiếu thông tin' });
  try {
    await pool.query('INSERT INTO topics (id,subject_id,name) VALUES ($1,$2,$3)', [id.trim(), subject_id, name.trim()]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID chủ đề đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/topics/:id', adminRequired, async (req, res) => {
  const { name, subject_id } = req.body;
  await pool.query('UPDATE topics SET name=$1, subject_id=COALESCE($2,subject_id) WHERE id=$3',
    [name, subject_id || null, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/topics/:id', adminRequired, async (req, res) => {
  await pool.query('DELETE FROM topics WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// QUESTIONS
app.get('/api/questions-list', adminRequired, async (req, res) => {
  const { subject, topic, search } = req.query;
  let sql = `SELECT q.*, t.name AS topic_name, t.subject_id, s.name AS subject_name, s.icon AS subject_icon
             FROM questions q JOIN topics t ON t.id=q.topic_id JOIN subjects s ON s.id=t.subject_id WHERE 1=1`;
  const params = [];
  if (subject) { params.push(subject); sql += ` AND s.id=$${params.length}`; }
  if (topic)   { params.push(topic);   sql += ` AND t.id=$${params.length}`; }
  if (search)  { params.push(`%${search}%`); sql += ` AND q.text ILIKE $${params.length}`; }
  sql += ' ORDER BY s.sort_order, t.sort_order, q.id LIMIT 500';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});
app.post('/api/questions', adminRequired, async (req, res) => {
  const { id, topic_id, text, options, answer } = req.body;
  if (!topic_id || !text || !Array.isArray(options) || options.length !== 4 || answer === undefined)
    return res.status(400).json({ error: 'Thiếu hoặc sai thông tin' });
  const qid = (id || `q_${Date.now()}`).trim();
  try {
    await pool.query('INSERT INTO questions (id,topic_id,text,options,answer) VALUES ($1,$2,$3,$4,$5)',
      [qid, topic_id, text.trim(), JSON.stringify(options), parseInt(answer)]);
    res.json({ success: true, id: qid });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID câu hỏi đã tồn tại' });
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/questions/:id', adminRequired, async (req, res) => {
  const { text, options, answer, topic_id } = req.body;
  if (!Array.isArray(options) || options.length !== 4)
    return res.status(400).json({ error: 'Cần đúng 4 đáp án' });
  await pool.query('UPDATE questions SET text=$1,options=$2,answer=$3,topic_id=COALESCE($4,topic_id) WHERE id=$5',
    [text.trim(), JSON.stringify(options), parseInt(answer), topic_id || null, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/questions/:id', adminRequired, async (req, res) => {
  await pool.query('DELETE FROM questions WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File quá lớn! Giới hạn 20KB' });
  if (err.message) return res.status(400).json({ error: err.message });
  next(err);
});

// SPA Fallback
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('*',       (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`VioQuiz v3 running on port ${PORT}`)))
  .catch(err => { console.error('Startup error:', err); process.exit(1); });
