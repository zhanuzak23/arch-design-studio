/* ============================================================
   ARCH design · studio — serverless-функция приёма заявок.
   Работает как:
     • Vercel      →  положить в  /api/lead.js
     • Netlify     →  /netlify/functions/lead.js  (экспорт ниже)
     • Cloudflare  →  /functions/api/lead.js      (см. onRequestPost)

   Переменные окружения (задаются в панели хостинга, НЕ в коде):
     TG_BOT_TOKEN  — токен от @BotFather
     TG_CHAT_ID    — id чата менеджеров
     ALLOWED_ORIGIN — https://arch-design.kz
   ============================================================ */

const clean = (v, max = 400) =>
  String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max);

function buildText(d) {
  const L = ['<b>Новая заявка с сайта</b>', ''];
  L.push(`<b>Источник:</b> ${clean(d.source, 64) || 'Сайт'}`);
  if (d.name)  L.push(`<b>Имя:</b> ${clean(d.name, 120)}`);
  L.push(`<b>Телефон:</b> ${clean(d.phone, 32)}`);
  if (d.type)  L.push(`<b>Объект:</b> ${clean(d.type, 64)}`);
  if (d.msg)   L.push(`<b>Комментарий:</b> ${clean(d.msg, 1000)}`);
  if (Array.isArray(d.calc) && d.calc.length) {
    L.push('', '<b>Расчёт калькулятора</b>');
    d.calc.forEach(r => Array.isArray(r) && r.length >= 2 &&
      L.push(`• ${clean(r[0], 60)}: ${clean(r[1], 120)}`));
  }
  L.push('', `<i>${new Date().toLocaleString('ru-RU')} · ${clean(d.page, 200)}</i>`);
  return L.join('\n');
}

async function toTelegram(data) {
  const token = process.env.TG_BOT_TOKEN;
  const chat  = process.env.TG_CHAT_ID;
  if (!token || !chat) throw new Error('TG_BOT_TOKEN / TG_CHAT_ID не заданы');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: buildText(data), parse_mode: 'HTML' })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || 'Telegram error');
  return json;
}

function cors(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? origin : allowed),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

/* ---------- Vercel (Node runtime) ---------- */
module.exports = async function handler(req, res) {
  const h = cors(req.headers.origin);
  Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'method' });

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!String(data.phone || '').replace(/\D/g, '')) {
      return res.status(422).json({ ok: false, error: 'no_phone' });
    }
    await toTelegram(data);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};

/* ---------- Netlify Functions ---------- */
module.exports.handler = async (event) => {
  const h = cors(event.headers && event.headers.origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: h, body: '{"ok":false}' };
  try {
    const data = JSON.parse(event.body || '{}');
    if (!String(data.phone || '').replace(/\D/g, '')) {
      return { statusCode: 422, headers: h, body: '{"ok":false,"error":"no_phone"}' };
    }
    await toTelegram(data);
    return { statusCode: 200, headers: h, body: '{"ok":true}' };
  } catch (e) {
    return { statusCode: 502, headers: h, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
  }
};

/* ---------- Cloudflare Pages Functions ---------- */
module.exports.onRequestPost = async ({ request, env }) => {
  Object.assign(process.env, env);
  const data = await request.json().catch(() => ({}));
  const h = cors(request.headers.get('origin'));
  try {
    if (!String(data.phone || '').replace(/\D/g, '')) {
      return new Response('{"ok":false,"error":"no_phone"}', { status: 422, headers: h });
    }
    await toTelegram(data);
    return new Response('{"ok":true}', { status: 200, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), { status: 502, headers: h });
  }
};
