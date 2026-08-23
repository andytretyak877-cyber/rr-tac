<?php
/**
 * Records a successfully submitted site form in Roistat.
 * The integration key stays on the server and is never sent to the browser.
 */

$roistatConfigDirectory = __DIR__;
$roistatConfigPath = '';
for ($depth = 0; $depth < 8; $depth++) {
    $candidate = $roistatConfigDirectory . '/config/roistat.php';
    if (is_file($candidate)) {
        $roistatConfigPath = $candidate;
        break;
    }
    $parent = dirname($roistatConfigDirectory);
    if ($parent === $roistatConfigDirectory) break;
    $roistatConfigDirectory = $parent;
}

if ($roistatConfigPath === '') {
    http_response_code(500);
    exit;
}

$roistatConfig = require $roistatConfigPath;
define('ROISTAT_INTEGRATION_KEY', (string) ($roistatConfig['integration_key'] ?? ''));
define('ROISTAT_ENDPOINT', 'https://cloud.roistat.com/api/proxy/1.0/leads/add');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

if (!empty($_POST['botcheck'])) {
    respond(200, ['success' => true]);
}

function clean_value($value, int $maxLength = 1024): string {
    if (!is_scalar($value)) return '';
    $cleaned = trim(strip_tags((string) $value));
    return function_exists('mb_substr')
        ? mb_substr($cleaned, 0, $maxLength, 'UTF-8')
        : substr($cleaned, 0, $maxLength);
}

$name = clean_value($_POST['name'] ?? '');
$phone = clean_value($_POST['phone'] ?? '');
$email = clean_value($_POST['email'] ?? '');
$product = clean_value($_POST['product'] ?? '');
$quantity = clean_value($_POST['quantity'] ?? '');
$comment = clean_value($_POST['message'] ?? '', 4096);
$subject = clean_value($_POST['subject'] ?? 'Заявка с сайта rr-tac.ru');

$phoneDigits = preg_replace('/\D+/', '', $phone);
if ($name === '' || strlen($phoneDigits) !== 11) {
    respond(400, ['success' => false, 'message' => 'Укажите имя и полный номер телефона']);
}

$roistatData = [
    'roistat' => clean_value($_COOKIE['roistat_visit'] ?? 'nocookie'),
    'key' => ROISTAT_INTEGRATION_KEY,
    'title' => $subject ?: 'Заявка с сайта rr-tac.ru',
    'comment' => $comment,
    'name' => $name,
    'email' => $email,
    'phone' => $phone,
    'order_creation_method' => 'Форма сайта rr-tac.ru',
    'is_need_check_order_in_processing' => '1',
    'is_need_check_order_in_processing_append' => '1',
    'is_skip_sending' => '1',
    'fields' => [
        'product' => $product,
        'quantity' => $quantity,
        'comment' => $comment,
        'page' => clean_value($_SERVER['HTTP_REFERER'] ?? ''),
    ],
];

$url = ROISTAT_ENDPOINT . '?' . http_build_query($roistatData);
$responseBody = false;
$httpStatus = 0;

if (function_exists('curl_init')) {
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $responseBody = curl_exec($curl);
    $httpStatus = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
} else {
    $context = stream_context_create([
        'http' => ['method' => 'GET', 'timeout' => 10, 'ignore_errors' => true],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $responseBody = @file_get_contents($url, false, $context);
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) {
        $httpStatus = (int) $match[1];
    }
}

if ($responseBody === false || $httpStatus < 200 || $httpStatus >= 300) {
    respond(502, ['success' => false, 'message' => 'Roistat temporarily unavailable']);
}

respond(200, ['success' => true]);
