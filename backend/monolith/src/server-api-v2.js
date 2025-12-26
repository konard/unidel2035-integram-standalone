// Минимальный сервер только для API v2
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiV2Router from './api/v2/index.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_V2_PORT || 3001;

app.use(cors());
// Парсить как JSON и application/vnd.api+json
app.use(express.json({ type: ['application/json', 'application/vnd.api+json'] }));

// Статические файлы из public (для песочницы)
app.use('/public', express.static(path.join(__dirname, '../public')));

// Redirect для удобного доступа к песочнице
app.get('/sandbox', (req, res) => {
  res.redirect('/public/api-v2-sandbox.html');
});

app.use('/api/v2', apiV2Router);

app.listen(PORT, () => {
  console.log(`✅ API v2 server listening on port ${PORT}`);
});
