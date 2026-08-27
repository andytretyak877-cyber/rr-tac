<?php

declare(strict_types=1);

require_once __DIR__ . '/moysklad.php';
require_once __DIR__ . '/mailer.php';

const RR_RATE_WINDOW_SECONDS = 600;
const RR_RATE_MAX_REQUESTS = 5;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function rr_order_respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rr_guard_directory(): string
{
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'rrtac-order-guard';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Order guard directory is unavailable');
    }
    return $directory;
}

function rr_rate_limit(string $clientKey): bool
{
    $path = rr_guard_directory() . DIRECTORY_SEPARATOR . 'rate-' . hash('sha256', $clientKey) . '.json';
    $handle = fopen($path, 'c+');
    if ($handle === false) throw new RuntimeException('Rate limit storage is unavailable');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('Rate limit lock is unavailable');
        $raw = stream_get_contents($handle);
        $timestamps = json_decode($raw ?: '[]', true);
        if (!is_array($timestamps)) $timestamps = [];
        $now = time();
        $timestamps = array_values(array_filter($timestamps, static fn($time): bool =>
            is_int($time) && $time > $now - RR_RATE_WINDOW_SECONDS
        ));
        if (count($timestamps) >= RR_RATE_MAX_REQUESTS) return false;
        $timestamps[] = $now;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($timestamps));
        fflush($handle);
        return true;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function rr_submission_path(string $submissionId): string
{
    return rr_guard_directory() . DIRECTORY_SEPARATOR . 'submission-' . hash('sha256', $submissionId) . '.json';
}

function rr_claim_submission(string $submissionId): ?array
{
    $path = rr_submission_path($submissionId);
    $handle = fopen($path, 'c+');
    if ($handle === false) throw new RuntimeException('Submission storage is unavailable');
    try {
        if (!flock($handle, LOCK_EX)) throw new RuntimeException('Submission lock is unavailable');
        $raw = stream_get_contents($handle);
        $saved = json_decode($raw ?: 'null', true);
        if (is_array($saved) && ($saved['state'] ?? '') === 'done' && is_array($saved['response'] ?? null)) {
            return $saved['response'];
        }
        $now = time();
        if (is_array($saved) && ($saved['state'] ?? '') === 'processing' && (int) ($saved['time'] ?? 0) > $now - 900) {
            return ['success' => false, 'processing' => true, 'message' => 'Заказ уже обрабатывается'];
        }
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode(['state' => 'processing', 'time' => $now]));
        fflush($handle);
        return null;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function rr_complete_submission(string $submissionId, array $response): void
{
    $path = rr_submission_path($submissionId);
    $handle = fopen($path, 'c+');
    if ($handle === false) return;
    try {
        if (!flock($handle, LOCK_EX)) return;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode(['state' => 'done', 'time' => time(), 'response' => $response], JSON_UNESCAPED_UNICODE));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function rr_manager_items_text(array $items): string
{
    $lines = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $productId = rr_limit_text($item['id'] ?? '', 64);
        $article = rr_limit_text($item['article'] ?? '', 64);
        $name = rr_limit_text($item['name'] ?? '', 255);
        $quantity = (int) ($item['quantity'] ?? 0);
        $price = isset($item['price_kopecks']) ? number_format($item['price_kopecks'] / 100, 2, ',', ' ') . ' руб.' : 'не проверена';
        $identity = $article !== '' ? 'арт. ' . $article : 'ID ' . $productId;
        $lines[] = sprintf('%s (%s) — %d шт., цена %s', $name !== '' ? $name : 'Товар', $identity, $quantity, $price);
    }
    return $lines ? implode("\n", $lines) : 'Позиции не удалось проверить.';
}

function rr_send_manager_order_email(array $order, bool $created, string $orderName, string $failureNote): bool
{
    $status = $created
        ? 'Заказ в МойСклад создан: ' . $orderName
        : 'Заказ в МойСклад НЕ создан';
    $message = $status . "\n\n";
    if (!$created && $failureNote !== '') $message .= 'Причина для менеджера: ' . $failureNote . "\n\n";
    $message .= "ТОВАРЫ:\n" . rr_manager_items_text($order['items'] ?? []) . "\n\n";
    $message .= 'Адрес доставки: ' . (($order['address'] ?? '') !== '' ? $order['address'] : 'не указан') . "\n";
    $message .= 'Комментарий: ' . (($order['comment'] ?? '') !== '' ? $order['comment'] : 'нет');

    $mail = [
        'subject' => $created ? 'Новый заказ сайта RR-TAC — ' . $orderName : 'ВНИМАНИЕ: заказ RR-TAC не создан в МойСклад',
        'body' => "Имя: " . ($order['name'] ?? '') . "\n"
            . "Телефон: " . ($order['phone'] ?? '') . "\n"
            . "Email: " . ($order['email'] ?? '') . "\n\n"
            . $message,
    ];

    try {
        $config = rr_load_mail_config();
    } catch (Throwable $error) {
        error_log('RR-TAC order email configuration unavailable');
        return false;
    }

    return rr_send_smtp_message($config, $mail);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    rr_order_respond(405, ['success' => false, 'message' => 'Метод не поддерживается']);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 32768) rr_order_respond(413, ['success' => false, 'message' => 'Запрос слишком большой']);
$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) rr_order_respond(400, ['success' => false, 'message' => 'Не удалось обработать заказ']);

if (rr_limit_text($payload['website'] ?? '', 200) !== '') {
    rr_order_respond(200, ['success' => true, 'order_created' => false, 'message' => 'Спасибо!']);
}

$submissionId = strtolower(trim((string) ($payload['submission_id'] ?? '')));
if (!preg_match('/^[a-f0-9-]{20,64}$/', $submissionId)) {
    rr_order_respond(400, ['success' => false, 'message' => 'Не удалось обработать заказ']);
}

try {
    $cached = rr_claim_submission($submissionId);
    if ($cached !== null) rr_order_respond(($cached['processing'] ?? false) ? 409 : 200, $cached);
    $clientKey = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if (!rr_rate_limit($clientKey)) {
        $response = ['success' => false, 'message' => 'Слишком много попыток. Попробуйте немного позже.'];
        rr_complete_submission($submissionId, $response);
        rr_order_respond(429, $response);
    }
} catch (Throwable $error) {
    error_log('RR-TAC order guard failed');
    rr_order_respond(503, ['success' => false, 'message' => 'Не удалось обработать заказ. Позвоните нам, пожалуйста.']);
}

$order = [
    'name' => rr_limit_text($payload['name'] ?? '', 120),
    'phone' => rr_limit_text($payload['phone'] ?? '', 40),
    'email' => rr_limit_text($payload['email'] ?? '', 255),
    'address' => rr_limit_text($payload['address'] ?? '', 500),
    'comment' => rr_limit_text($payload['comment'] ?? '', 2000),
    'items' => is_array($payload['items'] ?? null) ? $payload['items'] : [],
];
$orderCreated = false;
$orderName = '';
$failureNote = '';
$validationFailed = false;
$counterpartyCreated = false;

try {
    $order = rr_validate_order($payload, rr_load_site_products());
    $config = rr_load_moysklad_config();
    $client = new RrMoySkladClient($config['token']);

    // Validate every MoySklad product and all required metadata before creating the counterparty.
    $context = $client->resolveOrderContext(
        'ИП Дадаева Евгения Алексеевна',
        'Склад магазина',
        'Новый'
    );
    $order['items'] = $client->resolveProducts($order['items']);

    $counterpartyMeta = $client->createIndividualCounterparty($order['name'], $order['phone'], $order['email']);
    $counterpartyCreated = true;
    $orderName = rr_make_order_name();
    $order['order_name'] = $orderName;
    $created = $client->createCustomerOrder($order, $context, $counterpartyMeta);
    if (($created['name'] ?? null) !== $orderName) throw new RrMoySkladException('MoySklad did not confirm the order name');
    $orderCreated = true;
} catch (InvalidArgumentException $error) {
    $validationFailed = true;
    $failureNote = $error->getMessage();
} catch (Throwable $error) {
    $failureNote = $error instanceof RrMoySkladException
        ? $error->getMessage()
        : 'Внутренняя ошибка интеграции';
    error_log('RR-TAC order integration failed: ' . get_class($error));
}

if ($counterpartyCreated && !$orderCreated) {
    $counterpartyNote = 'Контрагент создан, но создание заказа не подтверждено. Автоматическое удаление контрагента не выполнялось.';
    $failureNote = trim($failureNote . ' ' . $counterpartyNote);
    error_log('RR-TAC MoySklad: counterparty was created but customer order was not confirmed; no rollback attempted');
}

$managerMailSent = false;
$phoneDigits = preg_replace('/\D+/', '', $order['phone'] ?? '') ?: '';
if (($order['name'] ?? '') !== '' && strlen($phoneDigits) === 11) {
    $managerMailSent = rr_send_manager_order_email($order, $orderCreated, $orderName, $failureNote);
}

if ($orderCreated) {
    $response = [
        'success' => true,
        'order_created' => true,
        'message' => 'Заказ оформлен. Менеджер свяжется с вами в ближайшее время.',
    ];
    rr_complete_submission($submissionId, $response);
    rr_order_respond(200, $response);
}

$response = [
    'success' => false,
    'order_created' => false,
    'message' => $validationFailed
        ? 'Проверьте данные заказа и попробуйте ещё раз.'
        : ($managerMailSent
            ? 'Заказ не создан. Менеджер уведомлён и свяжется с вами.'
            : 'Не удалось оформить заказ. Позвоните нам, пожалуйста.'),
];
rr_complete_submission($submissionId, $response);
rr_order_respond($validationFailed ? 422 : 503, $response);
