-- Inspera Cashflow — Database Schema
-- Run once on a fresh PostgreSQL database

-- Users table (manager / employee roles)
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('manager','employee')),
  display_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  active      BOOLEAN DEFAULT true
);

-- Bank accounts
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  bank        TEXT,
  balance     NUMERIC(15,2) DEFAULT 0,
  color       TEXT DEFAULT '#2563eb',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Expenses (הוצאות)
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  date        DATE NOT NULL,
  day_of_month SMALLINT,
  frequency_months SMALLINT NOT NULL DEFAULT 1,
  end_date    DATE,
  category    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES users(id)
);

-- Checks (צ'קים)
CREATE TABLE IF NOT EXISTS checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  date        DATE NOT NULL,
  check_number TEXT,
  image_data  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES users(id)
);

-- Recurrence and check-number fields for existing installations
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS day_of_month SMALLINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS frequency_months SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE checks ADD COLUMN IF NOT EXISTS check_number TEXT;

-- Suppliers (ספקים)
CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  day_of_month INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Known supplier names list (per account)
CREATE TABLE IF NOT EXISTS known_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  UNIQUE(account_id, name)
);

-- Invoices (חשבוניות)
CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  supplier    TEXT NOT NULL,
  amount      NUMERIC(15,2) NOT NULL,
  date        DATE NOT NULL,
  invoice_number TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES users(id)
);

-- Credit cards (כרטיסי אשראי)
CREATE TABLE IF NOT EXISTS credit_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  last4       TEXT,
  monthly_amount NUMERIC(15,2) NOT NULL,
  billing_day INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Employees (עובדים)
CREATE TABLE IF NOT EXISTS employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  base_salary NUMERIC(15,2) NOT NULL,
  pay_day     INTEGER DEFAULT 10,
  start_date  DATE NOT NULL DEFAULT DATE '2000-01-01',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT DATE '2000-01-01';

-- Employee bonuses (בונוסים חודשיים)
CREATE TABLE IF NOT EXISTS employee_bonuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,  -- format: YYYY-MM
  amount      NUMERIC(15,2) NOT NULL,
  UNIQUE(employee_id, month)
);

-- Tax payments (תשלומי מס)
CREATE TABLE IF NOT EXISTS tax_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  authority   TEXT NOT NULL CHECK (authority IN ('vat','bituach_leumi','bituach_leumi_workers','income_tax','company_tax')),
  amount      NUMERIC(15,2) NOT NULL,
  date        DATE NOT NULL,
  month       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES users(id)
);

-- Pending income (הכנסות לקבל)
CREATE TABLE IF NOT EXISTS pending_income (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('transfer','check')),
  confirmed     BOOLEAN DEFAULT false,
  added_date    DATE NOT NULL,
  check_date    DATE,
  forecast_date DATE,
  confirmed_date DATE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID REFERENCES users(id)
);

-- Audit log (אופציונלי — רישום פעולות)
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
