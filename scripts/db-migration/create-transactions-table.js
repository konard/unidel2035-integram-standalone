#!/usr/bin/env node
/**
 * Migration: Create _transactions table for Palantir Foundry-style versioning.
 *
 * Usage: node scripts/db-migration/create-transactions-table.js
 * Env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE
 */
import mysql from 'mysql2/promise';

const SQL = `CREATE TABLE IF NOT EXISTS _transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(255) DEFAULT NULL,
  action ENUM('CREATE','UPDATE','DELETE') NOT NULL,
  target_id INT NOT NULL,
  target_type INT DEFAULT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  session_id VARCHAR(64) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target_id (target_id),
  INDEX idx_target_version (target_id, version),
  INDEX idx_session_id (session_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'integram',
  });
  try {
    await conn.query(SQL);
    console.log('_transactions table created/verified.');
    const [cols] = await conn.query('DESCRIBE _transactions');
    cols.forEach(c => console.log(`  ${c.Field.padEnd(15)} ${c.Type}`));
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}
main();
