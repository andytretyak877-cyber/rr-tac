<?php

/**
 * Copy this file to /var/www/config/mail.php on the server.
 * Keep the real password outside the published web root, Git, and dist.
 */
return [
    'host' => 'smtp.beget.com',
    'port' => 465,
    'encryption' => 'smtps',
    'username' => 'info@rr-tac.ru',
    'password' => '',
    'from_email' => 'info@rr-tac.ru',
    'from_name' => 'RR-TAC',
    'to_email' => 'info@rr-tac.ru',
    'to_name' => 'RR-TAC',
];
