<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

require_once __DIR__ . '/vendor/phpmailer/src/Exception.php';
require_once __DIR__ . '/vendor/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/vendor/phpmailer/src/SMTP.php';

const RR_MAIL_CONFIG_PATH = '/var/www/config/mail.php';

function rr_mail_limit_text($value, int $maxLength = 1024): string
{
    if (!is_scalar($value)) return '';
    $cleaned = trim(strip_tags((string) $value));
    return function_exists('mb_substr')
        ? mb_substr($cleaned, 0, $maxLength, 'UTF-8')
        : substr($cleaned, 0, $maxLength);
}

function rr_validate_mail_config(array $config): array
{
    $required = ['host', 'username', 'password', 'from_email', 'to_email'];
    foreach ($required as $key) {
        if (!isset($config[$key]) || !is_scalar($config[$key]) || trim((string) $config[$key]) === '') {
            throw new RuntimeException('SMTP configuration is incomplete');
        }
    }

    $port = filter_var($config['port'] ?? null, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => 65535],
    ]);
    if ($port === false) throw new RuntimeException('SMTP port is invalid');
    if (!filter_var((string) $config['from_email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('SMTP sender is invalid');
    }
    if (!filter_var((string) $config['to_email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('SMTP recipient is invalid');
    }

    $encryption = strtolower(trim((string) ($config['encryption'] ?? 'smtps')));
    if (!in_array($encryption, ['ssl', 'smtps'], true)) {
        throw new RuntimeException('SMTP encryption is invalid');
    }

    return [
        'host' => trim((string) $config['host']),
        'port' => (int) $port,
        'encryption' => 'smtps',
        'username' => trim((string) $config['username']),
        'password' => (string) $config['password'],
        'from_email' => trim((string) $config['from_email']),
        'from_name' => rr_mail_limit_text($config['from_name'] ?? 'RR-TAC', 120),
        'to_email' => trim((string) $config['to_email']),
        'to_name' => rr_mail_limit_text($config['to_name'] ?? 'RR-TAC', 120),
    ];
}

function rr_load_mail_config(string $path = RR_MAIL_CONFIG_PATH): array
{
    if (!is_file($path)) throw new RuntimeException('SMTP configuration is unavailable');
    $config = require $path;
    if (!is_array($config)) throw new RuntimeException('SMTP configuration is invalid');
    return rr_validate_mail_config($config);
}

function rr_send_smtp_message(array $config, array $message, ?callable $mailerFactory = null): bool
{
    try {
        $config = rr_validate_mail_config($config);
        $mailer = $mailerFactory ? $mailerFactory() : new PHPMailer(true);
        $mailer->SMTPDebug = SMTP::DEBUG_OFF;
        $mailer->isSMTP();
        $mailer->Host = $config['host'];
        $mailer->Port = $config['port'];
        $mailer->SMTPAuth = true;
        $mailer->Username = $config['username'];
        $mailer->Password = $config['password'];
        $mailer->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        $mailer->Timeout = 12;
        $mailer->Timelimit = 20;
        $mailer->SMTPOptions = [
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
            ],
        ];
        $mailer->CharSet = PHPMailer::CHARSET_UTF8;
        $mailer->Encoding = PHPMailer::ENCODING_BASE64;
        $mailer->setFrom($config['from_email'], $config['from_name']);
        $mailer->addAddress($config['to_email'], $config['to_name']);

        $replyTo = trim((string) ($message['reply_to'] ?? ''));
        if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $mailer->addReplyTo($replyTo);
        }

        $subject = preg_replace('/[\r\n]+/', ' ', rr_mail_limit_text($message['subject'] ?? 'Заявка с сайта rr-tac.ru', 200));
        $mailer->Subject = $subject !== '' ? $subject : 'Заявка с сайта rr-tac.ru';
        $mailer->Body = (string) ($message['body'] ?? '');
        $mailer->isHTML(false);
        return $mailer->send();
    } catch (Throwable $error) {
        error_log('RR-TAC SMTP delivery failed');
        return false;
    }
}
