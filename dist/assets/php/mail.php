<?php

declare(strict_types=1);

require_once __DIR__ . '/mailer.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function rr_mail_respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    rr_mail_respond(405, ['success' => false, 'message' => 'Метод не поддерживается']);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) {
    rr_mail_respond(413, ['success' => false, 'message' => 'Запрос слишком большой']);
}

if (!empty($_POST['botcheck']) || rr_mail_limit_text($_POST['website'] ?? '', 200) !== '') {
    rr_mail_respond(200, ['success' => true]);
}

$name = rr_mail_limit_text($_POST['name'] ?? '', 120);
$phone = rr_mail_limit_text($_POST['phone'] ?? '', 40);
$email = rr_mail_limit_text($_POST['email'] ?? '', 254);
$product = rr_mail_limit_text($_POST['product'] ?? '', 500);
$quantity = rr_mail_limit_text($_POST['quantity'] ?? '', 20);
$comment = rr_mail_limit_text($_POST['message'] ?? '', 4096);
$subject = rr_mail_limit_text($_POST['subject'] ?? 'Заявка с сайта rr-tac.ru', 200);
$referer = rr_mail_limit_text($_SERVER['HTTP_REFERER'] ?? '', 1000);
$phoneDigits = preg_replace('/\D+/', '', $phone) ?: '';

if ($name === '' || strlen($phoneDigits) !== 11) {
    rr_mail_respond(400, ['success' => false, 'message' => 'Укажите имя и полный номер телефона']);
}

$lines = [
    'Новая заявка с сайта rr-tac.ru',
    '',
    'Имя: ' . $name,
    'Телефон: ' . $phone,
];
if ($email !== '') $lines[] = 'Email: ' . $email;
if ($product !== '') $lines[] = 'Товар: ' . $product;
if ($quantity !== '') $lines[] = 'Количество: ' . $quantity;
if ($comment !== '') $lines[] = 'Комментарий: ' . $comment;
if ($referer !== '') $lines[] = 'Страница: ' . $referer;

try {
    $config = rr_load_mail_config();
} catch (Throwable $error) {
    error_log('RR-TAC SMTP configuration unavailable');
    rr_mail_respond(503, ['success' => false, 'message' => 'Не удалось отправить заявку']);
}

$sent = rr_send_smtp_message($config, [
    'subject' => $subject,
    'body' => implode("\n", $lines),
    'reply_to' => $email,
]);

if (!$sent) {
    rr_mail_respond(502, ['success' => false, 'message' => 'Не удалось отправить заявку']);
}

rr_mail_respond(200, ['success' => true]);
