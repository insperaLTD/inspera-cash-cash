require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function updateAdmin() {
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'מנהל ראשי';

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured before updating the manager account');
  }
  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must both be configured');
  }
  if (password.length < 6) {
    throw new Error('ADMIN_PASSWORD must be at least 6 characters');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, username, role FROM users WHERE username = ANY($1::text[]) FOR UPDATE',
      [[username, 'admin']]
    );

    if (rows.length > 1) {
      throw new Error('Both the target username and admin already exist; resolve the duplicate accounts first');
    }

    if (rows.length === 1) {
      if (rows[0].role !== 'manager') {
        throw new Error(`Account "${rows[0].username}" is not a manager; refusing to change it`);
      }
      await client.query(
        'UPDATE users SET username=$1, password_hash=$2, display_name=$3, active=true WHERE id=$4',
        [username, passwordHash, displayName, rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name)
         VALUES ($1, $2, 'manager', $3)`,
        [username, passwordHash, displayName]
      );
    }

    await client.query('COMMIT');
    console.log(`Manager account "${username}" updated successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

updateAdmin()
  .catch((error) => {
    console.error('Manager account update failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
