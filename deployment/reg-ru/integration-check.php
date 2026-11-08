<?php

declare(strict_types=1);

/** Private CLI diagnostics: only MoySklad GETs and SMTP authentication, never send/create. */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

ini_set('display_errors', '0');
set_error_handler(static function (int $severity): bool {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException('Diagnostic runtime warning', 0, $severity);
});
// Discard accidental output from configuration files or third-party libraries.
ob_start();

$live = '/var/www/www-root/data/www/rr-tac.ru';
$report = [];

function diagnostic_failure(Throwable $error, string $fallback): array
{
    $message = $error->getMessage();
    $category = $fallback;
    if (str_contains($message, 'configuration') || str_contains($message, 'not configured')) {
        $category = 'configuration_unavailable_or_invalid';
    } elseif (str_contains($message, 'missing or not unique') || str_contains($message, 'state is not unique')) {
        $category = 'required_entity_missing_or_nonunique';
    } elseif (str_contains($message, 'authenticate') || str_contains($message, 'Authentication')) {
        $category = 'authentication_failed';
    } elseif (str_contains($message, 'request failed')) {
        $category = 'api_request_failed';
    } elseif (str_contains($message, 'metadata') || str_contains($message, 'invalid JSON')) {
        $category = 'invalid_api_response';
    }
    return ['ok' => false, 'class' => get_class($error), 'category' => $category];
}

try {
    require_once $live . '/assets/php/moysklad.php';
    require_once $live . '/assets/php/mailer.php';
    $report['runtime'] = ['ok' => true];
} catch (Throwable $error) {
    $report['runtime'] = diagnostic_failure($error, 'live_code_load_failed');
    ob_end_clean();
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit(1);
}

$moysklad = null;
try {
    $moysklad = rr_load_moysklad_config();
    $report['moysklad_config'] = ['ok' => true];
} catch (Throwable $error) {
    $report['moysklad_config'] = diagnostic_failure($error, 'configuration_validation_failed');
}

if ($moysklad !== null) {
    $client = new RrMoySkladClient($moysklad['token']);
    try {
        $client->resolveOrderContext('ИП Дадаева Евгения Алексеевна', 'Склад магазина', 'Новый');
        $report['moysklad_context_get'] = ['ok' => true];
    } catch (Throwable $error) {
        $report['moysklad_context_get'] = diagnostic_failure($error, 'context_lookup_failed');
    }
    try {
        // Validation is local. resolveProducts only performs GET article lookups.
        $validated = rr_validate_order([
            'name' => 'Read-only integration check',
            'phone' => '+70000000000',
            'email' => 'diagnostic@example.invalid',
            'items' => [['id' => 'rr-55208', 'quantity' => 1]],
        ], rr_load_site_products());
        $client->resolveProducts($validated['items']);
        $report['moysklad_product_get'] = ['ok' => true];
    } catch (Throwable $error) {
        $report['moysklad_product_get'] = diagnostic_failure($error, 'product_lookup_failed');
    }
}

$mail = null;
try {
    $mail = rr_load_mail_config();
    $report['smtp_config'] = ['ok' => true];
} catch (Throwable $error) {
    $report['smtp_config'] = diagnostic_failure($error, 'configuration_validation_failed');
}

if ($mail !== null) {
    $mailer = null;
    try {
        $mailer = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mailer->SMTPDebug = \PHPMailer\PHPMailer\SMTP::DEBUG_OFF;
        $mailer->isSMTP();
        $mailer->Host = $mail['host'];
        $mailer->Port = $mail['port'];
        $mailer->SMTPAuth = true;
        $mailer->Username = $mail['username'];
        $mailer->Password = $mail['password'];
        $mailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        $mailer->Timeout = 12;
        $mailer->Timelimit = 20;
        $mailer->SMTPOptions = [
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
            ],
        ];
        $connected = $mailer->smtpConnect();
        if (!$connected) throw new RuntimeException('SMTP connection failed');
        $report['smtp_auth_no_send'] = ['ok' => true];
    } catch (Throwable $error) {
        $report['smtp_auth_no_send'] = diagnostic_failure($error, 'smtp_connection_failed');
    } finally {
        if ($mailer !== null) {
            try {
                $mailer->smtpClose();
            } catch (Throwable $error) {
                $report['smtp_close'] = diagnostic_failure($error, 'smtp_close_failed');
            }
        }
    }
}

ob_end_clean();
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
$failed = array_filter($report, static fn(array $result): bool => !($result['ok'] ?? false));
exit($failed ? 1 : 0);
