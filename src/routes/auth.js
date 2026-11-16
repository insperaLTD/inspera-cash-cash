const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { signToken, requireAuth, requireManager } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'חסרים שם משתמש או סיסמה' });

    const normalizedUsername = String(username).toLowerCase().trim();
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND active = true',
      [normalizedUsername]
    );
    const user = rows[0];

    if (!user) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// GET /api/auth/me — verify token + return user info
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/users — create user (manager only)
router.post('/users', requireManager, async (req, res) => {
  try {
    const { username, password, role, display_name } = req.body;
    if (!username || !password || !role || !display_name)
      return res.status(400).json({ error: 'חסרים שדות' });
    if (!['manager','employee'].includes(role))
      return res.status(400).json({ error: 'תפקיד לא תקין' });
    if (password.length < 6)
      return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 6 תווים' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES ($1,$2,$3,$4) RETURNING id, username, role, display_name',
      [username.toLowerCase().trim(), hash, role, display_name]
    );
    res.status(201).json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'שם משתמש כבר קיים' });
    console.error(e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// GET /api/auth/users — list users (manager only)
router.get('/users', requireManager, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, role, display_name, active, created_at FROM users ORDER BY created_at'
    );
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// PATCH /api/auth/users/:id — update user (manager only)
router.patch('/users/:id', requireManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, display_name, active } = req.body;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 6 תווים' });
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
    }
    if (display_name !== undefined)
      await pool.query('UPDATE users SET display_name=$1 WHERE id=$2', [display_name, id]);
    if (active !== undefined)
      await pool.query('UPDATE users SET active=$1 WHERE id=$2', [active, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// DELETE /api/auth/users/:id (manager only, cannot delete self)
router.delete('/users/:id', requireManager, async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
    await pool.query('UPDATE users SET active=false WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
