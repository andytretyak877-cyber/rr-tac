<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/assets/php/mailer.php';

function check_mail(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

final class FakeMailer
{
    public int $SMTPDebug = -1;
    public string $Host = '';
    public int $Port = 0;
    public bool $SMTPAuth = false;
    public string $Username = '';
    public string $Password = '';
    public string $SMTPSecure = '';
    public int $Timeout = 0;
    public int $Timelimit = 0;
    public array $SMTPOptions = [];
    public string $CharSet = '';
    public string $Encoding = '';
    public string $Subject = '';
    public string $Body = '';
    public bool $smtpEnabled = false;
    public bool $htmlEnabled = true;
    public array $from = [];
    public array $recipients = [];
    public array $replyTo = [];
    public bool $shouldThrow = false;

    public function isSMTP(): void
    {
        $this->smtpEnabled = true;
    }

    public function setFrom(string $email, string $name = ''): bool
    {
        $this->from = [$email, $name];
        return true;
    }

    public function addAddress(string $email, string $name = ''): bool
    {
        $this->recipients[] = [$email, $name];
        return true;
    }

    public function addReplyTo(string $email, string $name = ''): bool
    {
        $this->replyTo[] = [$email, $name];
        return true;
    }

    public function isHTML(bool $enabled = true): void
    {
        $this->htmlEnabled = $enabled;
    }

    public function send(): bool
    {
        if ($this->shouldThrow) {
            throw new RuntimeException('secret-marker smtp.beget.com info@rr-tac.ru');
        }
        return true;
    }
}

$config = [
    'host' => 'smtp.beget.com',
    'port' => 465,
    'encryption' => 'smtps',
    'username' => 'info@rr-tac.ru',
    'password' => 'test-only-password',
    'from_email' => 'info@rr-tac.ru',
    'from_name' => 'RR-TAC',
    'to_email' => 'info@rr-tac.ru',
    'to_name' => 'RR-TAC',
];

$fake = new FakeMailer();
$sent = rr_send_smtp_message($config, [
    'subject' => "Тестовая заявка\r\nInjected",
    'body' => 'Тело тестовой заявки',
    'reply_to' => 'customer@example.com',
], static fn(): FakeMailer => $fake);

check_mail($sent, 'SMTP success was not returned');
check_mail($fake->smtpEnabled, 'SMTP mode was not enabled');
check_mail($fake->SMTPDebug === 0, 'SMTP debug must stay disabled');
check_mail($fake->Host === 'smtp.beget.com', 'SMTP host mismatch');
check_mail($fake->Port === 465, 'SMTP port mismatch');
check_mail($fake->SMTPAuth === true, 'SMTP authentication must be enabled');
check_mail($fake->SMTPSecure === 'ssl', 'Implicit TLS/SMTPS must be enabled');
check_mail($fake->from === ['info@rr-tac.ru', 'RR-TAC'], 'Sender mismatch');
check_mail($fake->recipients === [['info@rr-tac.ru', 'RR-TAC']], 'Recipient mismatch');
check_mail($fake->replyTo === [['customer@example.com', '']], 'Reply-To mismatch');
check_mail(!str_contains($fake->Subject, "\r") && !str_contains($fake->Subject, "\n"), 'Subject header injection was not removed');
check_mail($fake->htmlEnabled === false, 'Manager email must be plain text');

$failed = new FakeMailer();
$failed->shouldThrow = true;
$logPath = tempnam(sys_get_temp_dir(), 'rrtac-mail-test-');
if ($logPath === false) throw new RuntimeException('Could not create temporary log');
$previousLog = ini_get('error_log');
ini_set('log_errors', '1');
ini_set('error_log', $logPath);
$failureReturned = rr_send_smtp_message($config, ['subject' => 'Test', 'body' => 'Test'], static fn(): FakeMailer => $failed);
$log = file_get_contents($logPath) ?: '';
ini_set('error_log', is_string($previousLog) ? $previousLog : '');
unlink($logPath);

check_mail($failureReturned === false, 'SMTP exception must return false');
check_mail(str_contains($log, 'RR-TAC SMTP delivery failed'), 'Generic SMTP failure was not logged');
check_mail(!str_contains($log, 'secret-marker'), 'SMTP exception details leaked into logs');
check_mail(!str_contains($log, 'test-only-password'), 'SMTP password leaked into logs');

$invalidConfigRejected = false;
try {
    rr_validate_mail_config(array_merge($config, ['password' => '']));
} catch (RuntimeException $error) {
    $invalidConfigRejected = true;
}
check_mail($invalidConfigRejected, 'Empty SMTP password must be rejected');

echo "SMTP transport tests passed.\n";
