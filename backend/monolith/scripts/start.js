#!/usr/bin/env node
/**
 * Integram standalone server
 * Serves legacy HTML + PHP-compatible API via Node.js
 *
 * Usage:
 *   node scripts/start.js
 *   npm run start:standalone
 *
 * Environment (.env):
 *   PORT                 - listen port (default: 8081)
 *   INTEGRAM_DB_HOST     - MySQL host (default: localhost)
 *   INTEGRAM_DB_PORT     - MySQL port (default: 3306)
 *   INTEGRAM_DB_USER     - MySQL user (default: root)
 *   INTEGRAM_DB_PASSWORD - MySQL password
 *   INTEGRAM_DB_NAME     - MySQL database name (default: integram)
 *   INTEGRAM_PHP_SALT    - PHP SALT constant (default: DronedocSalt2025)
 */

import '../src/config/env.js';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || process.env.LEGACY_PORT || '8081', 10);
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_PATH = path.resolve(__dirname, '../../../integram-server');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: '*', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request log
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  next();
});

// ── Static files from integram-server/ ───────────────────────────────────────

if (!fs.existsSync(STATIC_PATH)) {
  console.warn(`⚠  Static dir not found: ${STATIC_PATH}`);
} else {
  const staticOpts = { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
  for (const dir of ['css', 'js', 'i', 'fonts', 'ace', 'app', 'img', 'templates']) {
    const p = path.join(STATIC_PATH, dir);
    if (fs.existsSync(p)) app.use(`/${dir}`, express.static(p, staticOpts));
  }
  for (const file of ['favicon.ico', 'favicon.svg', 'robots.txt', 'manifest.json']) {
    const p = path.join(STATIC_PATH, file);
    if (fs.existsSync(p)) app.get(`/${file}`, (_req, res) => res.sendFile(p));
  }
}

// ── Node.js-native App UI (/app) ──────────────────────────────────────────────

const PUBLIC_PATH = path.resolve(__dirname, '../public');
if (fs.existsSync(PUBLIC_PATH)) {
  const appStaticOpts = { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
  app.use('/app', express.static(PUBLIC_PATH, appStaticOpts));
  console.log(`   App UI: http://localhost:${PORT}/app/templates/login.html`);
}

// ── Legacy PHP-compatible API + page routing ──────────────────────────────────

const { default: legacyRouter } = await import('../src/api/routes/legacy-compat.js');
app.use('/', legacyRouter);
// Also handle /api/:db/... prefix used by myform.html save() and app.js ig.newApi()
app.use('/api', legacyRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path, method: req.method });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`\n✅ Integram running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`   Static: ${STATIC_PATH}`);
  console.log(`   DB:     ${process.env.INTEGRAM_DB_USER || 'root'}@${process.env.INTEGRAM_DB_HOST || 'localhost'}:${process.env.INTEGRAM_DB_PORT || 3306}/${process.env.INTEGRAM_DB_NAME || 'integram'}\n`);
});
