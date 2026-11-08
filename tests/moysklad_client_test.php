<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/assets/php/moysklad.php';

$products = [
    ['id' => 'rr-100', 'sku' => '100', 'name' => 'В наличии', 'priceRetail' => 123.45, 'inStock' => true],
    ['id' => 'rr-200', 'sku' => '200', 'name' => 'Под заказ', 'priceRetail' => 50, 'inStock' => false],
];
$order = rr_validate_order([
    'name' => 'Иван Иванов',
    'phone' => '+7 (999) 123-45-67',
    'email' => 'customer@example.com',
    'address' => 'Москва, улица, 1',
    'comment' => 'Позвонить заранее',
    'items' => [
        ['id' => 'rr-100', 'quantity' => 2],
        ['id' => 'rr-200', 'quantity' => 3],
    ],
], $products);

$client = new RrMoySkladClient('test-token', 'http://127.0.0.1:8766/api/remap/1.2');
$context = $client->resolveOrderContext('ИП Дадаева Евгения Алексеевна', 'Склад магазина', 'Новый');
$order['items'] = $client->resolveProducts($order['items']);
$counterparty = $client->createIndividualCounterparty($order['name'], $order['phone'], $order['email']);
$order['order_name'] = rr_make_order_name();
$created = $client->createCustomerOrder($order, $context, $counterparty);

if (($created['name'] ?? '') !== $order['order_name']) throw new RuntimeException('Fake API did not confirm the order');
if (($created['shipmentAddressFull']['comment'] ?? '') !== $order['comment']) throw new RuntimeException('Fake API did not receive the order comment');

foreach (['missing-token', 'ambiguous-token', 'mismatch-token'] as $token) {
    try {
        $failingClient = new RrMoySkladClient($token, 'http://127.0.0.1:8766/api/remap/1.2');
        $failingClient->resolveOrderContext('ИП Дадаева Евгения Алексеевна', 'Склад магазина', 'Новый');
        throw new RuntimeException('Invalid RR-Tac sales channel result was accepted: ' . $token);
    } catch (RrMoySkladException $expected) {
    }
}

echo "MoySklad client contract test passed.\n";
