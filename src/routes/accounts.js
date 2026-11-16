const router = require('express').Router();
const pool = require('../db/pool');
const { requireAuth, requireManager } = require('../middleware/auth');

// GET /api/accounts
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accounts ORDER BY created_at');
    res.json({ accounts: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// POST /api/accounts (manager only)
router.post('/', requireManager, async (req, res) => {
  try {
    const { name, bank, balance, color } = req.body;
    if (!name) return res.status(400).json({ error: 'שם חשבון חסר' });
    const { rows } = await pool.query(
      'INSERT INTO accounts (name, bank, balance, color) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, bank || '', parseFloat(balance) || 0, color || '#2563eb']
    );
    res.status(201).json({ account: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// PATCH /api/accounts/:id (manager only)
router.patch('/:id', requireManager, async (req, res) => {
  try {
    const { name, bank, balance, color } = req.body;
    const fields = [], vals = [];
    if (name !== undefined)    { fields.push(`name=$${fields.length+1}`);    vals.push(name); }
    if (bank !== undefined)    { fields.push(`bank=$${fields.length+1}`);    vals.push(bank); }
    if (balance !== undefined) { fields.push(`balance=$${fields.length+1}`); vals.push(parseFloat(balance)); }
    if (color !== undefined)   { fields.push(`color=$${fields.length+1}`);   vals.push(color); }
    if (!fields.length) return res.status(400).json({ error: 'אין מה לעדכן' });
    vals.push(req.params.id);
    await pool.query(`UPDATE accounts SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// DELETE /api/accounts/:id (manager only)
router.delete('/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

module.exports = router;
