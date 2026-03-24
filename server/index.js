const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── PostgreSQL Pool (Neon hoặc bất kỳ Postgres nào) ────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ─── KHỞI TẠO DATABASE ───────────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
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

    const { rows } = await client.query('SELECT COUNT(*) AS cnt FROM subjects');
    if (parseInt(rows[0].cnt) === 0) {
      console.log('Seeding database...');
      await seedDatabase(client);
    }
    console.log('Database san sang');
  } finally {
    client.release();
  }
}

async function seedDatabase(client) {
  const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
  const data = JSON.parse(raw);
  for (let si = 0; si < data.subjects.length; si++) {
    const s = data.subjects[si];
    await client.query(
      'INSERT INTO subjects (id,name,name_en,icon,color,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
      [s.id, s.name, s.name_en, s.icon, s.color, si]
    );
    for (let ti = 0; ti < s.topics.length; ti++) {
      const t = s.topics[ti];
      await client.query(
        'INSERT INTO topics (id,subject_id,name,sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
        [t.id, s.id, t.name, ti]
      );
      for (const q of t.questions) {
        await client.query(
          'INSERT INTO questions (id,topic_id,text,options,answer) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
          [q.id, t.id, q.text, JSON.stringify(q.options), q.answer]
        );
      }
    }
  }
}

async function getAllData() {
  const { rows: subjects }  = await pool.query('SELECT * FROM subjects ORDER BY sort_order, name');
  const { rows: topics }    = await pool.query('SELECT * FROM topics ORDER BY sort_order, name');
  const { rows: questions } = await pool.query('SELECT * FROM questions');
  return subjects.map(s => ({
    ...s,
    topics: topics
      .filter(t => t.subject_id === s.id)
      .map(t => ({
        ...t,
        questions: questions.filter(q => q.topic_id === t.id)
      }))
  }));
}

// ═══ API ═════════════════════════════════════════════════════════════════════

app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM subjects)  AS subjects,
        (SELECT COUNT(*) FROM topics)    AS topics,
        (SELECT COUNT(*) FROM questions) AS questions
    `);
    res.json({ database: 'postgresql', status: 'connected', stats: rows[0] });
  } catch (err) {
    res.status(500).json({ database: 'error', error: err.message });
  }
});

// Lấy toàn bộ (cho quiz)
app.get('/api/questions', async (req, res) => {
  try {
    res.json({ subjects: await getAllData() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SUBJECTS
app.get('/api/subjects', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM subjects ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subjects', async (req, res) => {
  const { id, name, name_en, icon, color } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id va name la bat buoc' });
  try {
    await pool.query('INSERT INTO subjects (id,name,name_en,icon,color) VALUES ($1,$2,$3,$4,$5)',
      [id.trim(), name.trim(), name_en, icon, color]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID da ton tai' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/subjects/:id', async (req, res) => {
  const { name, name_en, icon, color } = req.body;
  try {
    await pool.query('UPDATE subjects SET name=$1,name_en=$2,icon=$3,color=$4 WHERE id=$5',
      [name, name_en, icon, color, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM subjects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// TOPICS
app.get('/api/topics', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, s.name AS subject_name, s.icon AS subject_icon
      FROM topics t JOIN subjects s ON s.id = t.subject_id
      ORDER BY s.sort_order, t.sort_order, t.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/topics', async (req, res) => {
  const { id, subject_id, name } = req.body;
  if (!id || !subject_id || !name) return res.status(400).json({ error: 'Thieu thong tin' });
  try {
    await pool.query('INSERT INTO topics (id,subject_id,name) VALUES ($1,$2,$3)',
      [id.trim(), subject_id, name.trim()]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID chu de da ton tai' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/topics/:id', async (req, res) => {
  const { name, subject_id } = req.body;
  try {
    await pool.query('UPDATE topics SET name=$1,subject_id=COALESCE($2,subject_id) WHERE id=$3',
      [name, subject_id || null, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/topics/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM topics WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// QUESTIONS
app.get('/api/questions-list', async (req, res) => {
  try {
    const { subject, topic, search } = req.query;
    let sql = `
      SELECT q.*, t.name AS topic_name, t.subject_id,
             s.name AS subject_name, s.icon AS subject_icon
      FROM questions q
      JOIN topics t ON t.id = q.topic_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE 1=1
    `;
    const params = [];
    if (subject) { params.push(subject); sql += ` AND s.id = $${params.length}`; }
    if (topic)   { params.push(topic);   sql += ` AND t.id = $${params.length}`; }
    if (search)  { params.push(`%${search}%`); sql += ` AND q.text ILIKE $${params.length}`; }
    sql += ' ORDER BY s.sort_order, t.sort_order, q.id LIMIT 500';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/questions', async (req, res) => {
  const { id, topic_id, text, options, answer } = req.body;
  if (!topic_id || !text || !options || answer === undefined)
    return res.status(400).json({ error: 'Thieu thong tin bat buoc' });
  if (!Array.isArray(options) || options.length !== 4)
    return res.status(400).json({ error: 'Can dung 4 dap an' });
  const qid = (id || `q_${Date.now()}`).trim();
  try {
    await pool.query('INSERT INTO questions (id,topic_id,text,options,answer) VALUES ($1,$2,$3,$4,$5)',
      [qid, topic_id, text.trim(), JSON.stringify(options), parseInt(answer)]);
    res.json({ success: true, id: qid });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ID cau hoi da ton tai' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', async (req, res) => {
  const { text, options, answer, topic_id } = req.body;
  if (!Array.isArray(options) || options.length !== 4)
    return res.status(400).json({ error: 'Can dung 4 dap an' });
  try {
    await pool.query(
      'UPDATE questions SET text=$1,options=$2,answer=$3,topic_id=COALESCE($4,topic_id) WHERE id=$5',
      [text.trim(), JSON.stringify(options), parseInt(answer), topic_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM questions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('*',       (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`VioQuiz chay tai http://localhost:${PORT}`)))
  .catch(err => { console.error('Loi khoi dong:', err); process.exit(1); });
