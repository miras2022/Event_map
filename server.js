// server.js (fixed)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: 'http://localhost:3000' })); // Restrict to frontend origin
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./db.sqlite');
const SECRET = process.env.JWT_SECRET || 'SECRET_KEY'; // Use env var

/* ===== DB ===== */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      verification_status TEXT DEFAULT 'unverified'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS business_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      company_name TEXT,
      bin TEXT,
      phone TEXT,
      address TEXT,
      website TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      lat REAL,
      lng REAL,
      date TEXT,
      creator_id INTEGER
    )
  `);
});

/* ===== RATE LIMITING ===== */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/register', limiter);
app.use('/login', limiter);

/* ===== AUTH ===== */
const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.sendStatus(401);
  try {
    req.user = jwt.verify(h.split(' ')[1], SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
};

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.sendStatus(400);
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users(email,password) VALUES(?,?)`,
      [email, hash],
      err => err ? res.sendStatus(400) : res.send('ok')
    );
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email=?`, [email], async (e, u) => {
    if (!u || !(await bcrypt.compare(password, u.password))) {
      return res.sendStatus(401);
    }
    res.json({
      token: jwt.sign({
        id: u.id,
        role: u.role,
        verification_status: u.verification_status
      }, SECRET, { expiresIn: '1h' }) // Add expiration
    });
  });
});

/* ===== ADMIN CREATION (ONE-TIME) ===== */
app.post('/admin/create', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.sendStatus(400);

  db.get('SELECT COUNT(*) as count FROM users WHERE role="admin"', (err, row) => {
    if (err) return res.sendStatus(500);
    if (row.count > 0) return res.sendStatus(403); // Admin already exists

    bcrypt.hash(password, 10).then(hash => {
      db.run(
        'INSERT INTO users(email, password, role, verification_status) VALUES(?, ?, "admin", "verified")',
        [email, hash],
        err => err ? res.sendStatus(500) : res.send('admin created')
      );
    });
  });
});

/* ===== BUSINESS ===== */
app.post('/business-request', auth, (req, res) => {
  const { company_name, bin, phone, address, website } = req.body;
  if (!company_name || !bin) return res.sendStatus(400); // Added basic validation
  db.run(`
    INSERT INTO business_requests
    (user_id, company_name, bin, phone, address, website)
    VALUES (?,?,?,?,?,?)
  `,
  [req.user.id, company_name, bin, phone, address, website],
  err => err ? res.sendStatus(500) : res.send('sent'));
});

app.get('/business-status', auth, (req, res) => {
  if (req.user.role !== 'user') return res.json({status: 'none'});
  db.get(`SELECT status FROM business_requests WHERE user_id=? ORDER BY id DESC LIMIT 1`, [req.user.id], (e, row) => {
    if (e || !row) return res.json({status: 'none'});
    res.json({status: row.status});
  });
});

/* ===== ADMIN ===== */
app.get('/admin/requests', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.all(`SELECT * FROM business_requests WHERE status='pending'`, [], (e, r) => {
    if (e) return res.sendStatus(500);
    res.json(r);
  });
});

app.post('/admin/approve/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.get(`SELECT user_id FROM business_requests WHERE id=?`, [req.params.id], (e, row) => {
    if (e || !row) return res.sendStatus(404);
    db.run(`UPDATE users SET role='business', verification_status='verified' WHERE id=?`, [row.user_id]);
    db.run(`UPDATE business_requests SET status='approved' WHERE id=?`, [req.params.id]);
    res.send('approved');
  });
});

app.post('/admin/reject/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  db.run(`UPDATE business_requests SET status='rejected' WHERE id=?`, [req.params.id], err => {
    if (err) return res.sendStatus(500);
    res.send('rejected');
  });
});

/* ===== EVENTS ===== */
app.get('/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  db.all(`SELECT * FROM events LIMIT ? OFFSET ?`, [limit, offset], (e, r) => {
    if (e) return res.sendStatus(500);
    res.json(r);
  });
});

app.post('/events', auth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.verification_status !== 'verified') return res.sendStatus(403);
  const { title, description, lat, lng, date } = req.body;
  if (!title || !date || typeof lat !== 'number' || typeof lng !== 'number') return res.sendStatus(400); // Added validation to return 400 if invalid input
  db.run(`
    INSERT INTO events(title,description,lat,lng,date,creator_id)
    VALUES (?,?,?,?,?,?)
  `,
  [title, description, lat, lng, date, req.user.id],
  function(err) {
    if (err) {
      console.error(err);
      return res.sendStatus(500);
    }
    res.json({ message: 'created', id: this.lastID }); // Fixed to send JSON
  });
});

app.delete('/events/:id', auth, (req, res) => {
  db.get(`SELECT creator_id FROM events WHERE id=?`, [req.params.id], (e, row) => {
    if (e || !row) return res.sendStatus(404);
    if (row.creator_id !== req.user.id && req.user.role !== 'admin') return res.sendStatus(403);
    db.run(`DELETE FROM events WHERE id=?`, [req.params.id], err => {
      if (err) return res.sendStatus(500);
      res.send('deleted');
    });
  });
});

app.delete('/events', auth, (req, res) => {
  if (req.user.role === 'admin') {
    db.run(`DELETE FROM events`, err => {
      if (err) return res.sendStatus(500);
      res.send('all deleted');
    });
  } else {
    db.run(`DELETE FROM events WHERE creator_id=?`, [req.user.id], err => {
      if (err) return res.sendStatus(500);
      res.send('own deleted');
    });
  }
});

// Ignore favicon requests to avoid 404 logs
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

app.listen(3000, () => console.log('http://localhost:3000'));