const http = require('http');
const fs = require('fs');
const path = require('path');

// =============================================
// НАСТРОЙКИ — заполни свои данные
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const PORT = process.env.PORT || 3000;
// =============================================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

async function sendToTelegram(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram не настроен, анкета сохранена только локально');
    return false;
  }

  const name = data.meta?.client || 'Без имени';
  const contact = data.meta?.contact || '—';
  const service = data.meta?.service || '—';
  const trigger = data.intake?.trigger || data.intake?.trigger_tags || '—';
  const goal = data.intake?.goal || '—';
  const budget = data.lifestyle?.budget || '—';
  const desired = data.psychology?.desired_image || '—';
  const bodyScore = data.psychology?.body_score || '—';
  const tags = (data.profile_tags || []).join(', ') || '—';
  const notes = data.profile_notes || '—';

  const text = `📋 *Новая анкета!*

👤 *${name}*
📞 ${contact}

*Услуга:* ${service}
*Запрос:* ${trigger}
*Цель:* ${goal}
*Бюджет:* ${budget}
*Желаемый образ:* ${desired}
*Отношение к телу:* ${bodyScore}/10

🏷 *Профиль:* ${tags}
📝 *Контекст:* ${notes}`;

  try {
    // Отправляем текстовое сообщение
    const msgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
      }),
    });

    // Отправляем JSON-файл
    const boundary = '----FormBoundary' + Date.now();
    const jsonStr = JSON.stringify(data, null, 2);
    const fileName = `anketa-${(name || 'client').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;

    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="chat_id"`,
      '',
      TELEGRAM_CHAT_ID,
      `--${boundary}`,
      `Content-Disposition: form-data; name="caption"`,
      '',
      `📎 Полная анкета: ${name}`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="document"; filename="${fileName}"`,
      'Content-Type: application/json',
      '',
      jsonStr,
      `--${boundary}--`,
    ].join('\r\n');

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body,
    });

    console.log(`✅ Анкета от ${name} отправлена в Telegram`);
    return true;
  } catch (e) {
    console.error('Ошибка отправки в Telegram:', e.message);
    return false;
  }
}

// Сохраняем анкеты локально
function saveLocally(data) {
  const dir = path.join(__dirname, 'ankety');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = (data.meta?.client || 'noname').replace(/\s+/g, '-').toLowerCase();
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${name}_${date}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Анкета сохранена: ${file}`);
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: приём анкеты
  if (req.method === 'POST' && req.url === '/api/submit') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        saveLocally(data);
        const sent = await sendToTelegram(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, telegram: sent }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Статика: клиентская анкета
  if (req.method === 'GET') {
    let filePath;
    if (req.url === '/' || req.url === '/anketa' || req.url === '/anketa/') {
      filePath = path.join(__dirname, 'client-form', 'index.html');
    } else if (req.url.startsWith('/editor')) {
      const p = req.url === '/editor' || req.url === '/editor/' ? '/editor/index.html' : req.url;
      filePath = path.join(__dirname, p);
    } else if (req.url.startsWith('/questionnaire')) {
      const p = req.url === '/questionnaire' || req.url === '/questionnaire/' ? '/questionnaire/index.html' : req.url;
      filePath = path.join(__dirname, p);
    } else {
      filePath = path.join(__dirname, req.url);
    }
    serveFile(res, filePath);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`
🚀 Сервер запущен на порту ${PORT}

📋 Анкета для клиентов: http://localhost:${PORT}/anketa
🎨 Редактор карты стиля: http://localhost:${PORT}/editor
📊 Анкета стилиста:      http://localhost:${PORT}/questionnaire

${TELEGRAM_BOT_TOKEN ? '✅ Telegram подключён' : '⚠️  Telegram НЕ настроен — задай TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID'}
  `);
});
