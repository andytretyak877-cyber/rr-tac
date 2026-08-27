<?php

declare(strict_types=1);

function fake_meta(string $type, string $id): array
{
    return [
        'href' => 'http://127.0.0.1:8766/api/remap/1.2/entity/' . $type . '/' . $id,
        'type' => $type,
        'mediaType' => 'application/json',
    ];
}

function fake_respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (trim((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '')) === 'gzip') {
        header('Content-Encoding: gzip');
        echo gzencode($body);
    } else {
        echo $body;
    }
    exit;
}

function fake_fail(string $message): void
{
    fake_respond(422, ['errors' => [['error' => $message]]]);
}

$authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$allowedTokens = ['Bearer test-token', 'Bearer missing-token', 'Bearer ambiguous-token', 'Bearer mismatch-token'];
if (!in_array($authorization, $allowedTokens, true)) fake_fail('Bearer token is missing');
$acceptEncoding = trim((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''));
if ($acceptEncoding !== 'gzip') fake_fail('Accept-Encoding: gzip is required');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$contentType = trim((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if ($method === 'GET' && $contentType !== '') fake_fail('GET must not contain Content-Type');
if ($method === 'POST' && $contentType !== 'application/json') fake_fail('JSON POST must contain Content-Type: application/json');
$query = [];
parse_str((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY), $query);
$payload = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($payload)) $payload = [];

if ($method === 'GET' && $path === '/api/remap/1.2/entity/organization') {
    if (($query['filter'] ?? '') !== 'name=ИП Дадаева Евгения Алексеевна') fake_fail('Organization filter is wrong');
    fake_respond(200, ['rows' => [['name' => 'ИП Дадаева Евгения Алексеевна', 'meta' => fake_meta('organization', 'org')]]]);
}
if ($method === 'GET' && $path === '/api/remap/1.2/entity/store') {
    if (($query['filter'] ?? '') !== 'name=Склад магазина') fake_fail('Store filter is wrong');
    fake_respond(200, ['rows' => [['name' => 'Склад магазина', 'meta' => fake_meta('store', 'store')]]]);
}
if ($method === 'GET' && $path === '/api/remap/1.2/entity/customerorder/metadata') {
    fake_respond(200, ['states' => [['name' => 'Новый', 'meta' => fake_meta('state', 'new')]]]);
}
if ($method === 'GET' && $path === '/api/remap/1.2/entity/saleschannel') {
    if (($query['filter'] ?? '') !== 'name=RR-Tac') fake_fail('Sales channel filter is wrong');
    if (($query['limit'] ?? '') !== '2') fake_fail('Sales channel ambiguity limit is wrong');
    if ($authorization === 'Bearer missing-token') fake_respond(200, ['rows' => []]);
    if ($authorization === 'Bearer ambiguous-token') {
        fake_respond(200, ['rows' => [
            ['name' => 'RR-Tac', 'meta' => fake_meta('saleschannel', 'rr-tac-1')],
            ['name' => 'RR-Tac', 'meta' => fake_meta('saleschannel', 'rr-tac-2')],
        ]]);
    }
    if ($authorization === 'Bearer mismatch-token') {
        fake_respond(200, ['rows' => [['name' => 'RR-TAC', 'meta' => fake_meta('saleschannel', 'wrong-case')]]]);
    }
    fake_respond(200, ['rows' => [['name' => 'RR-Tac', 'meta' => fake_meta('saleschannel', 'rr-tac')]]]);
}
if ($method === 'GET' && $path === '/api/remap/1.2/entity/product') {
    $filter = (string) ($query['filter'] ?? '');
    if (!preg_match('/^article=(100|200)$/', $filter, $match)) fake_fail('Product must be searched by products.json sku');
    $article = $match[1];
    fake_respond(200, ['rows' => [['article' => $article, 'meta' => fake_meta('product', 'product-' . $article)]]]);
}
if ($method === 'POST' && $path === '/api/remap/1.2/entity/counterparty') {
    if (($payload['name'] ?? '') !== 'Иван Иванов') fake_fail('Counterparty name is wrong');
    if (($payload['phone'] ?? '') !== '+7 (999) 123-45-67') fake_fail('Counterparty phone is wrong');
    if (($payload['companyType'] ?? '') !== 'individual') fake_fail('Counterparty is not an individual');
    fake_respond(200, ['name' => $payload['name'], 'meta' => fake_meta('counterparty', 'buyer')]);
}
if ($method === 'POST' && $path === '/api/remap/1.2/entity/customerorder') {
    if (!str_starts_with((string) ($payload['name'] ?? ''), 'rrtac-')) fake_fail('Order prefix is wrong');
    if (($payload['externalCode'] ?? '') !== $payload['name']) fake_fail('External code is not collision-safe order name');
    if (($payload['shipmentAddress'] ?? '') !== 'Москва, улица, 1') fake_fail('Shipment address is wrong');
    if (($payload['description'] ?? '') !== 'Позвонить заранее') fake_fail('Description is wrong');
    if (($payload['organization']['meta']['type'] ?? '') !== 'organization') fake_fail('Organization meta is missing');
    if (($payload['store']['meta']['type'] ?? '') !== 'store') fake_fail('Store meta is missing');
    if (($payload['state']['meta']['type'] ?? '') !== 'state') fake_fail('State meta is missing');
    if (($payload['salesChannel']['meta']['href'] ?? '') !== fake_meta('saleschannel', 'rr-tac')['href']) {
        fake_fail('RR-Tac sales channel meta is missing');
    }
    if (($payload['agent']['meta']['type'] ?? '') !== 'counterparty') fake_fail('Counterparty meta is missing');
    if (($payload['positions'][0]['price'] ?? null) !== 12345 || ($payload['positions'][0]['reserve'] ?? null) !== 2) {
        fake_fail('In-stock price or reserve is wrong');
    }
    if (($payload['positions'][1]['price'] ?? null) !== 5000 || ($payload['positions'][1]['reserve'] ?? null) !== 0) {
        fake_fail('Backorder price or reserve is wrong');
    }
    fake_respond(200, ['name' => $payload['name'], 'meta' => fake_meta('customerorder', 'order')]);
}

fake_respond(404, ['errors' => [['error' => 'Unknown fake endpoint']]]);
