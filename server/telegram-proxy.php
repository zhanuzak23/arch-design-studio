<?php
/* ============================================================
   ARCH design · studio — приём заявок и отправка в Telegram.
   Кладётся на любой хостинг с PHP (Beget, ps.kz, hoster.kz…).
   В config.js укажите:  crm.endpoint = 'https://ваш-домен/api/lead.php'
   ============================================================ */

// ---------- 1. НАСТРОЙКИ ----------
$BOT_TOKEN = getenv('TG_BOT_TOKEN') ?: '';   // токен от @BotFather
$CHAT_ID   = getenv('TG_CHAT_ID')   ?: '';   // id чата/группы менеджеров
$ALLOWED   = ['https://arch-design.kz'];     // домены, с которых принимаем заявки
$LOG_FILE  = __DIR__ . '/leads.csv';         // дублируем заявки в файл (можно отключить)

// ---------- 2. CORS ----------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['ok' => false, 'error' => 'method']); exit;
}

// ---------- 3. Простая защита от спама: не чаще 1 заявки в 20 секунд с IP ----------
$ip    = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$stamp = sys_get_temp_dir() . '/arch_lead_' . md5($ip);
if (file_exists($stamp) && (time() - filemtime($stamp)) < 20) {
    http_response_code(429); echo json_encode(['ok' => false, 'error' => 'too_many']); exit;
}
touch($stamp);

// ---------- 4. Разбор данных ----------
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400); echo json_encode(['ok' => false, 'error' => 'bad_json']); exit;
}

function clean($v, $max = 400) {
    $v = is_string($v) ? $v : '';
    $v = strip_tags(trim($v));
    return mb_substr($v, 0, $max);
}

$name  = clean($data['name']  ?? '');
$phone = clean($data['phone'] ?? '', 32);
$type  = clean($data['type']  ?? '', 64);
$msg   = clean($data['msg']   ?? '', 1000);
$src   = clean($data['source'] ?? 'Сайт', 64);
$page  = clean($data['page']  ?? '', 300);

if (preg_replace('/\D/', '', $phone) === '') {
    http_response_code(422); echo json_encode(['ok' => false, 'error' => 'no_phone']); exit;
}

// ---------- 5. Сообщение ----------
$lines = ["<b>Новая заявка с сайта</b>", ""];
$lines[] = "<b>Источник:</b> " . htmlspecialchars($src);
if ($name)  $lines[] = "<b>Имя:</b> " . htmlspecialchars($name);
$lines[]    = "<b>Телефон:</b> " . htmlspecialchars($phone);
if ($type)  $lines[] = "<b>Объект:</b> " . htmlspecialchars($type);
if ($msg)   $lines[] = "<b>Комментарий:</b> " . htmlspecialchars($msg);

if (!empty($data['calc']) && is_array($data['calc'])) {
    $lines[] = "";
    $lines[] = "<b>Расчёт калькулятора</b>";
    foreach ($data['calc'] as $row) {
        if (is_array($row) && count($row) >= 2) {
            $lines[] = "• " . htmlspecialchars(clean($row[0], 60)) . ": " . htmlspecialchars(clean($row[1], 120));
        }
    }
}
$lines[] = "";
$lines[] = "<i>" . date('d.m.Y H:i') . " · " . htmlspecialchars($page) . "</i>";
$text = implode("\n", $lines);

// ---------- 6. Отправка в Telegram ----------
$ch = curl_init("https://api.telegram.org/bot{$BOT_TOKEN}/sendMessage");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_TIMEOUT        => 12,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode([
        'chat_id'    => $CHAT_ID,
        'text'       => $text,
        'parse_mode' => 'HTML',
        'reply_markup' => [
            'inline_keyboard' => [[
                ['text' => '📞 Позвонить', 'url' => 'tel:' . preg_replace('/\D/', '', $phone)]
            ]]
        ]
    ], JSON_UNESCAPED_UNICODE),
]);
$resp = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// ---------- 7. Дублируем в CSV ----------
if ($LOG_FILE) {
    $fh = @fopen($LOG_FILE, 'a');
    if ($fh) {
        @fputcsv($fh, [date('c'), $src, $name, $phone, $type, $msg, $ip]);
        @fclose($fh);
    }
}

if ($code === 200) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'telegram', 'detail' => $resp]);
}
