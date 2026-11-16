/**
 * All data routes for a specific account.
 * Routes: /api/accounts/:accountId/...
 *
 * Employees can: POST (add records), GET (read for entry forms)
 * Employees CANNOT: DELETE, see summaries/stats
 * Managers can: everything
 */
const router = require('express').Router({ mergeParams: true });
const pool = require('../db/pool');
const { requireAuth, requireManager } = require('../middleware/auth');

// Helper: verify account exists
async function getAccount(id) {
  const { rows } = await pool.query('SELECT id FROM accounts WHERE id=$1', [id]);
  return rows[0] || null;
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// ═══════════════════════════════════════════════════════════════
// EXPENSES (הוצאות)
// ═══════════════════════════════════════════════════════════════
router.get('/expenses', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM expenses WHERE account_id=$1 ORDER BY date DESC',
      [req.params.accountId]
    );
    res.json({ expenses: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/expenses', requireAuth, async (req, res) => {
  try {
    const { name, amount, date, category, notes, day_of_month, frequency_months, end_date } = req.body;
    if (!name || !amount || !date) return res.status(400).json({ error: 'חסרים שדות' });
    const day = day_of_month === undefined ? parseInt(date.slice(8, 10), 10) : parseInt(day_of_month, 10);
    const frequency = frequency_months === undefined ? 1 : parseInt(frequency_months, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31)
      return res.status(400).json({ error: 'יום בחודש לא תקין' });
    if (![1, 2, 3].includes(frequency))
      return res.status(400).json({ error: 'תדירות לא תקינה' });
    if (end_date && end_date < date)
      return res.status(400).json({ error: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה' });
    const { rows } = await pool.query(
      'INSERT INTO expenses (account_id, name, amount, date, day_of_month, frequency_months, end_date, category, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [req.params.accountId, name, parseFloat(amount), date, day, frequency, end_date || null, category || null, notes || null, req.user.id]
    );
    res.status(201).json({ expense: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/expenses/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// CHECKS (צ'קים)
// ═══════════════════════════════════════════════════════════════
router.get('/checks', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      `SELECT id, account_id, name, amount, date, check_number, created_at,
        CASE WHEN NULLIF(BTRIM(check_number), '') IS NOT NULL
          THEN COUNT(*) OVER (PARTITION BY account_id, LOWER(REGEXP_REPLACE(BTRIM(check_number), '[[:space:]]+', '', 'g'))) > 1
          ELSE false
        END AS is_duplicate
       FROM checks WHERE account_id=$1 ORDER BY date DESC`,
      [req.params.accountId]
    );
    res.json({ checks: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/checks', requireAuth, async (req, res) => {
  try {
    const { name, amount, date, image_data } = req.body;
    const checkNumber = typeof req.body.check_number === 'string' ? req.body.check_number.trim() : '';
    if (!name || !amount || !date) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      'INSERT INTO checks (account_id, name, amount, date, check_number, image_data, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, account_id, name, amount, date, check_number, created_at',
      [req.params.accountId, name, parseFloat(amount), date, checkNumber || null, image_data || null, req.user.id]
    );
    let duplicate = false;
    if (checkNumber) {
      const { rows: duplicateRows } = await pool.query(
        `SELECT COUNT(*) > 1 AS is_duplicate FROM checks
         WHERE account_id=$1
           AND NULLIF(BTRIM(check_number), '') IS NOT NULL
           AND LOWER(REGEXP_REPLACE(BTRIM(check_number), '[[:space:]]+', '', 'g')) =
               LOWER(REGEXP_REPLACE(BTRIM($2), '[[:space:]]+', '', 'g'))`,
        [req.params.accountId, checkNumber]
      );
      duplicate = duplicateRows[0].is_duplicate;
    }
    res.status(201).json({ check: rows[0], duplicate });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/checks/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM checks WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// SUPPLIERS (ספקים קבועים)
// ═══════════════════════════════════════════════════════════════
router.get('/suppliers', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM suppliers WHERE account_id=$1 ORDER BY name',
      [req.params.accountId]
    );
    res.json({ suppliers: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/suppliers', requireManager, async (req, res) => {
  try {
    const { name, amount, day_of_month, notes } = req.body;
    if (!name || !amount) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      'INSERT INTO suppliers (account_id, name, amount, day_of_month, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.accountId, name, parseFloat(amount), parseInt(day_of_month) || null, notes || null]
    );
    res.status(201).json({ supplier: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/suppliers/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// Known supplier names
router.get('/known-suppliers', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM known_suppliers WHERE account_id=$1 ORDER BY name', [req.params.accountId]);
    res.json({ known_suppliers: rows.map(r => r.name) });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/known-suppliers', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'חסר שם' });
    await pool.query(
      'INSERT INTO known_suppliers (account_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.accountId, name.trim()]
    );
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// INVOICES (חשבוניות)
// ═══════════════════════════════════════════════════════════════
router.get('/invoices', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM invoices WHERE account_id=$1 ORDER BY date DESC',
      [req.params.accountId]
    );
    res.json({ invoices: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/invoices', requireAuth, async (req, res) => {
  try {
    const { supplier, amount, date, invoice_number, notes } = req.body;
    if (!supplier || !amount || !date) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      'INSERT INTO invoices (account_id, supplier, amount, date, invoice_number, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.accountId, supplier, parseFloat(amount), date, invoice_number || null, notes || null, req.user.id]
    );
    res.status(201).json({ invoice: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/invoices/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// CREDIT CARDS (כרטיסי אשראי)
// ═══════════════════════════════════════════════════════════════
router.get('/credit-cards', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query('SELECT * FROM credit_cards WHERE account_id=$1 ORDER BY name', [req.params.accountId]);
    res.json({ credit_cards: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/credit-cards', requireManager, async (req, res) => {
  try {
    const { name, last4, monthly_amount, billing_day } = req.body;
    if (!name || !monthly_amount || !billing_day) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      'INSERT INTO credit_cards (account_id, name, last4, monthly_amount, billing_day) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.accountId, name, last4 || null, parseFloat(monthly_amount), parseInt(billing_day)]
    );
    res.status(201).json({ credit_card: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.patch('/credit-cards/:id', requireManager, async (req, res) => {
  try {
    const { monthly_amount, billing_day } = req.body;
    const fields = [], vals = [];
    if (monthly_amount !== undefined) { fields.push(`monthly_amount=$${fields.length+1}`); vals.push(parseFloat(monthly_amount)); }
    if (billing_day !== undefined)    { fields.push(`billing_day=$${fields.length+1}`);    vals.push(parseInt(billing_day)); }
    if (!fields.length) return res.status(400).json({ error: 'אין מה לעדכן' });
    vals.push(req.params.id, req.params.accountId);
    await pool.query(`UPDATE credit_cards SET ${fields.join(',')} WHERE id=$${vals.length-1} AND account_id=$${vals.length}`, vals);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/credit-cards/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM credit_cards WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES (עובדים)
// ═══════════════════════════════════════════════════════════════
router.get('/employees', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows: emps } = await pool.query('SELECT * FROM employees WHERE account_id=$1 ORDER BY name', [req.params.accountId]);
    const { rows: bonuses } = await pool.query(
      'SELECT * FROM employee_bonuses WHERE employee_id = ANY($1)',
      [emps.map(e => e.id)]
    );
    const bonusMap = {};
    bonuses.forEach(b => {
      if (!bonusMap[b.employee_id]) bonusMap[b.employee_id] = {};
      bonusMap[b.employee_id][b.month] = parseFloat(b.amount);
    });
    const result = emps.map(e => ({ ...e, bonuses: bonusMap[e.id] || {} }));
    res.json({ employees: result });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/employees', requireManager, async (req, res) => {
  try {
    const { name, base_salary, pay_day } = req.body;
    const start_date = req.body.start_date || new Date().toISOString().slice(0, 10);
    if (!name || !base_salary) return res.status(400).json({ error: 'חסרים שדות' });
    if (!isValidDateOnly(start_date)) return res.status(400).json({ error: 'תאריך תחילת עבודה לא תקין' });
    const { rows } = await pool.query(
      'INSERT INTO employees (account_id, name, base_salary, pay_day, start_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.accountId, name, parseFloat(base_salary), parseInt(pay_day) || 10, start_date]
    );
    res.status(201).json({ employee: { ...rows[0], bonuses: {} } });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/employees/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// PATCH bonus for employee
router.patch('/employees/:id/bonus', requireManager, async (req, res) => {
  try {
    const { month, amount } = req.body;
    if (!month) return res.status(400).json({ error: 'חסר חודש' });
    if (!amount || parseFloat(amount) === 0) {
      await pool.query('DELETE FROM employee_bonuses WHERE employee_id=$1 AND month=$2', [req.params.id, month]);
    } else {
      await pool.query(
        'INSERT INTO employee_bonuses (employee_id, month, amount) VALUES ($1,$2,$3) ON CONFLICT (employee_id, month) DO UPDATE SET amount=$3',
        [req.params.id, month, parseFloat(amount)]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// TAX PAYMENTS (מיסים)
// ═══════════════════════════════════════════════════════════════
router.get('/taxes', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tax_payments WHERE account_id=$1 ORDER BY date DESC',
      [req.params.accountId]
    );
    res.json({ taxes: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/taxes', requireManager, async (req, res) => {
  try {
    const { authority, amount, date, month } = req.body;
    if (!authority || !amount || !date) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      'INSERT INTO tax_payments (account_id, authority, amount, date, month, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.accountId, authority, parseFloat(amount), date, month || date.slice(0,7), req.user.id]
    );
    res.status(201).json({ tax: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/taxes/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM tax_payments WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// PENDING INCOME (הכנסות לקבל)
// ═══════════════════════════════════════════════════════════════
router.get('/pending-income', requireAuth, async (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'אין הרשאה' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pending_income WHERE account_id=$1 ORDER BY added_date DESC',
      [req.params.accountId]
    );
    res.json({ pending_income: rows });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.post('/pending-income', requireAuth, async (req, res) => {
  try {
    const { name, amount, type, added_date, check_date, forecast_date } = req.body;
    if (!name || !amount || !type) return res.status(400).json({ error: 'חסרים שדות' });
    const { rows } = await pool.query(
      `INSERT INTO pending_income (account_id, name, amount, type, added_date, check_date, forecast_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.accountId, name, parseFloat(amount), type, added_date || new Date().toISOString().slice(0,10),
       check_date || null, forecast_date || null, req.user.id]
    );
    res.status(201).json({ income: rows[0] });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// Confirm pending income
router.patch('/pending-income/:id/confirm', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    await pool.query(
      'UPDATE pending_income SET confirmed=true, confirmed_date=$1 WHERE id=$2 AND account_id=$3',
      [today, req.params.id, req.params.accountId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

router.delete('/pending-income/:id', requireManager, async (req, res) => {
  try {
    await pool.query('DELETE FROM pending_income WHERE id=$1 AND account_id=$2', [req.params.id, req.params.accountId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ═══════════════════════════════════════════════════════════════
// FULL STATE (manager only — loads everything for one account)
// ═══════════════════════════════════════════════════════════════
router.get('/state', requireManager, async (req, res) => {
  try {
    const aid = req.params.accountId;
    const [acc, exp, chk, sup, ks, inv, cc, emps, bonuses, taxes, pending] = await Promise.all([
      pool.query('SELECT * FROM accounts WHERE id=$1', [aid]),
      pool.query('SELECT * FROM expenses WHERE account_id=$1 ORDER BY date DESC', [aid]),
      pool.query(
        `SELECT id,account_id,name,amount,date,check_number,created_at,
          CASE WHEN NULLIF(BTRIM(check_number), '') IS NOT NULL
            THEN COUNT(*) OVER (PARTITION BY account_id, LOWER(REGEXP_REPLACE(BTRIM(check_number), '[[:space:]]+', '', 'g'))) > 1
            ELSE false
          END AS is_duplicate
         FROM checks WHERE account_id=$1 ORDER BY date DESC`,
        [aid]
      ),
      pool.query('SELECT * FROM suppliers WHERE account_id=$1 ORDER BY name', [aid]),
      pool.query('SELECT name FROM known_suppliers WHERE account_id=$1 ORDER BY name', [aid]),
      pool.query('SELECT * FROM invoices WHERE account_id=$1 ORDER BY date DESC', [aid]),
      pool.query('SELECT * FROM credit_cards WHERE account_id=$1 ORDER BY name', [aid]),
      pool.query('SELECT * FROM employees WHERE account_id=$1 ORDER BY name', [aid]),
      pool.query('SELECT * FROM employee_bonuses WHERE employee_id = ANY($1)', [emps.rows.map(e=>e.id)]),
      pool.query('SELECT * FROM tax_payments WHERE account_id=$1 ORDER BY date DESC', [aid]),
      pool.query('SELECT * FROM pending_income WHERE account_id=$1 ORDER BY added_date DESC', [aid]),
    ]);
    const bonusMap = {};
    bonuses.rows.forEach(b => {
      if (!bonusMap[b.employee_id]) bonusMap[b.employee_id] = {};
      bonusMap[b.employee_id][b.month] = parseFloat(b.amount);
    });
    res.json({
      account: acc.rows[0],
      expenses: exp.rows,
      checks: chk.rows,
      suppliers: sup.rows,
      knownSuppliers: ks.rows.map(r => r.name),
      invoices: inv.rows,
      creditCards: cc.rows,
      employees: emps.rows.map(e => ({ ...e, bonuses: bonusMap[e.id] || {} })),
      taxes: taxes.rows,
      pendingIncome: pending.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'שגיאת שרת' }); }
});

module.exports = router;
