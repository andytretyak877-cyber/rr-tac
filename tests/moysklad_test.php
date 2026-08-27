<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/assets/php/moysklad.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

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

$meta = static fn(string $type): array => [
    'href' => 'https://api.moysklad.ru/api/remap/1.2/entity/' . $type . '/00000000-0000-0000-0000-000000000000',
    'type' => $type,
    'mediaType' => 'application/json',
];
$order['items'][0]['assortment_meta'] = $meta('product');
$order['items'][1]['assortment_meta'] = $meta('product');
$order['order_name'] = 'rrtac-20260823-120000-0123456789abcdef';
$payload = rr_build_customer_order_payload($order, [
    'organization' => $meta('organization'),
    'store' => $meta('store'),
    'state' => $meta('state'),
    'sales_channel' => $meta('saleschannel'),
], $meta('counterparty'));

check($payload['name'] === $order['order_name'], 'Explicit order name is missing');
check($order['email'] === 'customer@example.com', 'Validated order email is missing');
check($order['items'][0]['id'] === 'rr-100', 'Browser product id was not preserved');
check($order['items'][0]['article'] === '100', 'MoySklad article was not taken from products.json sku');
check($payload['positions'][0]['price'] === 12345, 'Rubles were not converted to kopecks');
check($payload['positions'][0]['reserve'] === 2, 'In-stock position was not fully reserved');
check($payload['positions'][1]['reserve'] === 0, 'Backorder position must not be reserved');
check($payload['salesChannel']['meta'] === $meta('saleschannel'), 'RR-Tac sales channel meta is missing');
check($payload['shipmentAddress'] === 'Москва, улица, 1', 'Delivery address is not separate');
check($payload['description'] === 'Позвонить заранее', 'Comment is not separate');

try {
    rr_validate_order([
        'name' => 'Иван Иванов',
        'phone' => '+7 (999) 123-45-67',
        'email' => 'customer@example.com',
        'items' => [['id' => 'missing', 'quantity' => 1]],
    ], $products);
    throw new RuntimeException('Missing site product was accepted');
} catch (InvalidArgumentException $expected) {
}

try {
    rr_validate_order([
        'name' => 'Иван Иванов',
        'phone' => '+7 (999) 123-45-67',
        'email' => 'customer@example.com',
        'items' => [['id' => 'rr-100', 'quantity' => 0]],
    ], $products);
    throw new RuntimeException('Zero quantity was accepted');
} catch (InvalidArgumentException $expected) {
}

foreach (['', 'not-an-email'] as $invalidEmail) {
    try {
        rr_validate_order([
            'name' => 'Иван Иванов',
            'phone' => '+7 (999) 123-45-67',
            'email' => $invalidEmail,
            'items' => [['id' => 'rr-100', 'quantity' => 1]],
        ], $products);
        throw new RuntimeException('Missing or invalid email was accepted');
    } catch (InvalidArgumentException $expected) {
    }
}

check(strpos(rr_make_order_name(), 'rrtac-') === 0, 'Order prefix is invalid');
echo "MoySklad integration tests passed.\n";
