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
import compression from 'compression';
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

app.use(compression());
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

// ── API v2 auth endpoint (handles POST /api/v2/auth) ────────────────────────
// Mounted BEFORE legacy router to prevent /:db/auth from intercepting v2 paths.
// Proxies auth to legacy /:db/auth?JSON internally.

app.post('/api/v2/auth', async (req, res) => {
  try {
    // Accept both JSON:API format and simple {login, password, database} format
    let login, password, database;

    if (req.body?.data?.type === 'auth') {
      // JSON:API format
      ({ login, password, database } = req.body.data.attributes || {});
    } else {
      // Simple format
      ({ login, password, database } = req.body || {});
    }

    database = database || 'my';

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'login and password are required' }
      });
    }

    // Use internal fetch to legacy auth endpoint
    const legacyUrl = `http://127.0.0.1:${PORT}/${database}/auth?JSON`;
    const formData = new URLSearchParams({ login, pwd: password });

    const response = await fetch(legacyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const data = await response.json();

    // Legacy auth returns {token, id, _xsrf, msg} on success
    // or [{error: "..."}] on failure
    if (Array.isArray(data) && data[0]?.error) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: data[0].error }
      });
    }

    if (data.token) {
      return res.json({
        success: true,
        data: {
          type: 'auth-session',
          id: data.token,
          attributes: {
            token: data.token,
            userId: data.id,
            database,
            xsrf: data._xsrf
          }
        },
        meta: { timestamp: new Date().toISOString() }
      });
    }

    // Unexpected response
    return res.status(500).json({
      success: false,
      error: { code: 'UNEXPECTED', message: 'Unexpected auth response' },
      meta: { legacy: data }
    });

  } catch (err) {
    console.error('[V2 Auth] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: err.message }
    });
  }
});

console.log('   API v2 auth: POST /api/v2/auth');

// ── V2 Data Layer (Schema, Search, Batch, Objects, Query, Stats) ──────────────

try {
  const { DatabaseService, ConnectionManager } = await import('../../../packages/@integram/database/index.js');
  const { CoreDataService } = await import('../../../services/core-data-service/src/index.js');

  const cm = new ConnectionManager({
    host: process.env.INTEGRAM_DB_HOST || 'localhost',
    port: parseInt(process.env.INTEGRAM_DB_PORT || '3306'),
    user: process.env.INTEGRAM_DB_USER || 'root',
    password: process.env.INTEGRAM_DB_PASSWORD || '',
    database: process.env.INTEGRAM_DB_NAME || 'integram',
  });

  const mysql2 = await import('mysql2/promise');
  await cm.initialize(mysql2.default || mysql2);

  const dbService = new DatabaseService(cm);
  const coreData = new CoreDataService(dbService);
  const v2Router = coreData.createRouter({ enableLegacy: false });

  app.use('/api', v2Router);
  console.log('   V2 API (AI Data Layer): /api/v2/databases/:db/*');
} catch (e) {
  console.warn('⚠  V2 API not loaded:', e.message);
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

import { createServer as createHttpsServer } from 'https';

const SSL_KEY    = process.env.SSL_KEY;
const SSL_CERT   = process.env.SSL_CERT;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);

const dbInfo = () =>
  `${process.env.INTEGRAM_DB_USER || 'root'}@${process.env.INTEGRAM_DB_HOST || 'localhost'}:${process.env.INTEGRAM_DB_PORT || 3306}/${process.env.INTEGRAM_DB_NAME || 'integram'}`;

if (SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
  const ssl = { key: fs.readFileSync(SSL_KEY), cert: fs.readFileSync(SSL_CERT) };
  createHttpsServer(ssl, app).listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`
✅ Integram HTTPS :${HTTPS_PORT} (direct TLS — no nginx)`);
    console.log(`   DB: ${dbInfo()}
`);
  });
} else {
  console.warn('⚠  SSL_KEY/SSL_CERT not set — HTTPS disabled');
}

// HTTP (internal fallback — nginx proxy → 8081, or local dev)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`   HTTP: http://127.0.0.1:${PORT} (internal)`);
});
