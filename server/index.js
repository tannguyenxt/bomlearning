const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── DB CONFIG ────────────────────────────────────────────────────────────────
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vioquiz',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool = null;
let useDatabase = false;

async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    await pool.query('SELECT 1');
    console.log('✅ MySQL connected');
    await createTables();
    await seedFromJSON();
    useDatabase = true;
  } catch (err) {
    console.warn('⚠️  MySQL not available, falling back to JSON file:', err.message);
    useDatabase = false;
  }
}

async function createTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        name_en VARCHAR(200),
        icon VARCHAR(10),
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id VARCHAR(100) PRIMARY KEY,
        subject_id VARCHAR(100) NOT NULL,
        name VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(100) PRIMARY KEY,
        topic_id VARCHAR(100) NOT NULL,
        text TEXT NOT NULL,
        options JSON NOT NULL,
        answer INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Tables created');
  } finally {
    conn.release();
  }
}

async function seedFromJSON() {
  const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM subjects');
  if (rows[0].cnt > 0) return; // Already seeded

  const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
  const data = JSON.parse(raw);
  const conn = await pool.getConnection();
  try {
    for (const subj of data.subjects) {
      await conn.query(
        'INSERT IGNORE INTO subjects (id, name, name_en, icon, color) VALUES (?,?,?,?,?)',
        [subj.id, subj.name, subj.name_en, subj.icon, subj.color]
      );
      for (const topic of subj.topics) {
        await conn.query(
          'INSERT IGNORE INTO topics (id, subject_id, name) VALUES (?,?,?)',
          [topic.id, subj.id, topic.name]
        );
        for (const q of topic.questions) {
          await conn.query(
            'INSERT IGNORE INTO questions (id, topic_id, text, options, answer) VALUES (?,?,?,?,?)',
            [q.id, topic.id, q.text, JSON.stringify(q.options), q.answer]
          );
        }
      }
    }
    console.log('✅ DB seeded from JSON');
  } finally {
    conn.release();
  }
}

// ─── DATA ACCESS HELPERS ──────────────────────────────────────────────────────
async function getAllData() {
  if (useDatabase) {
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name');
    const [topics] = await pool.query('SELECT * FROM topics ORDER BY subject_id, name');
    const [questions] = await pool.query('SELECT * FROM questions');
    
    return subjects.map(subj => ({
      ...subj,
      topics: topics
        .filter(t => t.subject_id === subj.id)
        .map(topic => ({
          ...topic,
          questions: questions
            .filter(q => q.topic_id === topic.id)
            .map(q => ({
              ...q,
              options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
            }))
        }))
    }));
  } else {
    const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
    return JSON.parse(raw).subjects;
  }
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// GET all questions (for quiz generation)
app.get('/api/questions', async (req, res) => {
  try {
    const subjects = await getAllData();
    res.json({ subjects, source: useDatabase ? 'mysql' : 'json' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUBJECTS ──
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await getAllData();
    res.json(subjects.map(s => ({ id: s.id, name: s.name, name_en: s.name_en, icon: s.icon, color: s.color })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subjects', async (req, res) => {
  const { id, name, name_en, icon, color } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  try {
    if (useDatabase) {
      await pool.query('INSERT INTO subjects (id,name,name_en,icon,color) VALUES (?,?,?,?,?)', [id, name, name_en, icon, color]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      data.subjects.push({ id, name, name_en, icon, color, topics: [] });
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/subjects/:id', async (req, res) => {
  const { name, name_en, icon, color } = req.body;
  try {
    if (useDatabase) {
      await pool.query('UPDATE subjects SET name=?,name_en=?,icon=?,color=? WHERE id=?', [name, name_en, icon, color, req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      const s = data.subjects.find(s => s.id === req.params.id);
      if (s) Object.assign(s, { name, name_en, icon, color });
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:id', async (req, res) => {
  try {
    if (useDatabase) {
      await pool.query('DELETE FROM subjects WHERE id=?', [req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      data.subjects = data.subjects.filter(s => s.id !== req.params.id);
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TOPICS ──
app.post('/api/topics', async (req, res) => {
  const { id, subject_id, name } = req.body;
  if (!id || !subject_id || !name) return res.status(400).json({ error: 'id, subject_id and name required' });
  try {
    if (useDatabase) {
      await pool.query('INSERT INTO topics (id, subject_id, name) VALUES (?,?,?)', [id, subject_id, name]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      const subj = data.subjects.find(s => s.id === subject_id);
      if (!subj) return res.status(404).json({ error: 'Subject not found' });
      subj.topics.push({ id, name, questions: [] });
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/topics/:id', async (req, res) => {
  const { name } = req.body;
  try {
    if (useDatabase) {
      await pool.query('UPDATE topics SET name=? WHERE id=?', [name, req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      for (const s of data.subjects) {
        const t = s.topics.find(t => t.id === req.params.id);
        if (t) { t.name = name; break; }
      }
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/topics/:id', async (req, res) => {
  try {
    if (useDatabase) {
      await pool.query('DELETE FROM topics WHERE id=?', [req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      for (const s of data.subjects) {
        s.topics = s.topics.filter(t => t.id !== req.params.id);
      }
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── QUESTIONS ──
app.post('/api/questions', async (req, res) => {
  const { id, topic_id, text, options, answer } = req.body;
  if (!id || !topic_id || !text || !options || answer === undefined)
    return res.status(400).json({ error: 'All fields required' });
  try {
    if (useDatabase) {
      await pool.query('INSERT INTO questions (id, topic_id, text, options, answer) VALUES (?,?,?,?,?)',
        [id, topic_id, text, JSON.stringify(options), answer]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      for (const s of data.subjects) {
        const topic = s.topics.find(t => t.id === topic_id);
        if (topic) { topic.questions.push({ id, text, options, answer }); break; }
      }
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/questions/:id', async (req, res) => {
  const { text, options, answer } = req.body;
  try {
    if (useDatabase) {
      await pool.query('UPDATE questions SET text=?, options=?, answer=? WHERE id=?',
        [text, JSON.stringify(options), answer, req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      for (const s of data.subjects) {
        for (const t of s.topics) {
          const q = t.questions.find(q => q.id === req.params.id);
          if (q) { Object.assign(q, { text, options, answer }); break; }
        }
      }
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/questions/:id', async (req, res) => {
  try {
    if (useDatabase) {
      await pool.query('DELETE FROM questions WHERE id=?', [req.params.id]);
    } else {
      const raw = await fs.readFile(path.join(__dirname, '../data/questions.json'), 'utf-8');
      const data = JSON.parse(raw);
      for (const s of data.subjects) {
        for (const t of s.topics) {
          t.questions = t.questions.filter(q => q.id !== req.params.id);
        }
      }
      await fs.writeFile(path.join(__dirname, '../data/questions.json'), JSON.stringify(data, null, 2));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DB status
app.get('/api/status', (req, res) => {
  res.json({ database: useDatabase ? 'mysql' : 'json', version: '1.0.0' });
});

// SPA fallback
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 VioQuiz running at http://localhost:${PORT}`));
});
