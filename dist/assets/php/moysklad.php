<?php

declare(strict_types=1);

final class RrMoySkladException extends RuntimeException
{
}

function rr_limit_text($value, int $maxLength): string
{
    if (!is_scalar($value)) return '';
    $text = trim(strip_tags((string) $value));
    return function_exists('mb_substr')
        ? mb_substr($text, 0, $maxLength, 'UTF-8')
        : substr($text, 0, $maxLength);
}

function rr_find_server_config(string $filename): string
{
    $directory = __DIR__;
    for ($depth = 0; $depth < 8; $depth++) {
        $candidate = $directory . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . $filename;
        if (is_file($candidate)) return $candidate;
        $parent = dirname($directory);
        if ($parent === $directory) break;
        $directory = $parent;
    }
    return '';
}

function rr_load_moysklad_config(): array
{
    $path = rr_find_server_config('moysklad.php');
    if ($path === '') throw new RrMoySkladException('MoySklad configuration is unavailable');
    if (!is_readable($path)) throw new RrMoySkladException('MoySklad configuration is unavailable');
    $config = @require $path;
    $token = is_array($config) ? trim((string) ($config['token'] ?? '')) : '';
    if ($token === '' || $token === 'replace-with-a-real-moysklad-token') {
        throw new RrMoySkladException('MoySklad token is not configured');
    }
    return ['token' => $token];
}

function rr_load_site_products(?string $path = null): array
{
    $productsPath = $path ?: dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'products.json';
    $json = @file_get_contents($productsPath);
    $products = $json === false ? null : json_decode($json, true);
    if (!is_array($products)) throw new RrMoySkladException('Site catalog is unavailable');
    return $products;
}

function rr_validate_order(array $payload, array $products): array
{
    $name = rr_limit_text($payload['name'] ?? '', 120);
    $phone = rr_limit_text($payload['phone'] ?? '', 40);
    $phoneDigits = preg_replace('/\D+/', '', $phone) ?: '';
    if ($name === '' || strlen($name) < 2 || strlen($phoneDigits) !== 11) {
        throw new InvalidArgumentException('Укажите имя и полный номер телефона');
    }

    $address = rr_limit_text($payload['address'] ?? '', 500);
    $comment = rr_limit_text($payload['comment'] ?? '', 2000);
    $items = $payload['items'] ?? null;
    if (!is_array($items) || count($items) < 1 || count($items) > 100) {
        throw new InvalidArgumentException('Корзина пуста или содержит слишком много позиций');
    }

    $byId = [];
    foreach ($products as $product) {
        if (!is_array($product)) continue;
        $id = trim((string) ($product['id'] ?? ''));
        if ($id === '') continue;
        if (isset($byId[$id])) throw new RrMoySkladException('Site catalog contains duplicate product ids');
        $byId[$id] = $product;
    }

    $validated = [];
    $seen = [];
    $totalQuantity = 0;
    foreach ($items as $item) {
        if (!is_array($item)) throw new InvalidArgumentException('Некорректная позиция заказа');
        $id = trim((string) ($item['id'] ?? ''));
        $rawQuantity = $item['quantity'] ?? null;
        if (!preg_match('/^[A-Za-z0-9._-]{1,64}$/', $id)) {
            throw new InvalidArgumentException('Некорректный идентификатор товара');
        }
        if (isset($seen[$id])) throw new InvalidArgumentException('Позиция товара повторяется');
        $seen[$id] = true;

        if (is_int($rawQuantity)) {
            $quantity = $rawQuantity;
        } elseif (is_string($rawQuantity) && preg_match('/^[1-9]\d{0,3}$/', $rawQuantity)) {
            $quantity = (int) $rawQuantity;
        } else {
            throw new InvalidArgumentException('Некорректное количество товара');
        }
        if ($quantity < 1 || $quantity > 9999) throw new InvalidArgumentException('Некорректное количество товара');
        $totalQuantity += $quantity;
        if ($totalQuantity > 10000) throw new InvalidArgumentException('Слишком большое количество товара');

        if (!isset($byId[$id])) {
            throw new InvalidArgumentException('Товар отсутствует в каталоге сайта');
        }
        $product = $byId[$id];
        $article = trim((string) ($product['sku'] ?? ''));
        if ($article === '' || !preg_match('/^[A-Za-z0-9._-]{1,64}$/', $article)) {
            throw new RrMoySkladException('Site catalog contains an invalid article');
        }
        $priceRubles = $product['priceRetail'] ?? null;
        if (!is_int($priceRubles) && !is_float($priceRubles)) {
            throw new RrMoySkladException('Site catalog contains an invalid price');
        }
        $priceKopecks = (int) round(((float) $priceRubles) * 100);
        if ($priceKopecks <= 0) throw new RrMoySkladException('Site catalog contains an invalid price');

        $validated[] = [
            'id' => $id,
            'article' => $article,
            'name' => rr_limit_text($product['name'] ?? '', 255),
            'quantity' => $quantity,
            'price_kopecks' => $priceKopecks,
            'in_stock' => ($product['inStock'] ?? false) === true,
        ];
    }

    return [
        'name' => $name,
        'phone' => $phone,
        'address' => $address,
        'comment' => $comment,
        'items' => $validated,
    ];
}

final class RrMoySkladClient
{
    private string $token;
    private string $baseUrl;

    public function __construct(string $token, string $baseUrl = 'https://api.moysklad.ru/api/remap/1.2')
    {
        $this->token = $token;
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function resolveOrderContext(string $organizationName, string $storeName, string $stateName): array
    {
        $organization = $this->uniqueRow('/entity/organization', ['filter' => 'name=' . $organizationName, 'limit' => 2], $organizationName);
        $store = $this->uniqueRow('/entity/store', ['filter' => 'name=' . $storeName, 'limit' => 2], $storeName);
        $metadata = $this->request('GET', '/entity/customerorder/metadata');
        $states = is_array($metadata['states'] ?? null) ? $metadata['states'] : [];
        $matches = array_values(array_filter($states, static fn($state): bool =>
            is_array($state) && (($state['name'] ?? null) === $stateName)
        ));
        if (count($matches) !== 1) throw new RrMoySkladException('Required customer order state is not unique');

        return [
            'organization' => $this->meta($organization),
            'store' => $this->meta($store),
            'state' => $this->meta($matches[0]),
        ];
    }

    public function resolveProducts(array $items): array
    {
        $resolved = [];
        foreach ($items as $item) {
            $row = $this->uniqueRow('/entity/product', [
                'filter' => 'article=' . $item['article'],
                'limit' => 2,
            ], $item['article']);
            if (($row['article'] ?? null) !== $item['article']) {
                throw new RrMoySkladException('MoySklad article did not match exactly');
            }
            $item['assortment_meta'] = $this->meta($row);
            $resolved[] = $item;
        }
        return $resolved;
    }

    public function createIndividualCounterparty(string $name, string $phone): array
    {
        $counterparty = $this->request('POST', '/entity/counterparty', [], [
            'name' => $name,
            'phone' => $phone,
            'companyType' => 'individual',
        ]);
        return $this->meta($counterparty);
    }

    public function createCustomerOrder(array $order, array $context, array $counterpartyMeta): array
    {
        return $this->request('POST', '/entity/customerorder', [], rr_build_customer_order_payload($order, $context, $counterpartyMeta));
    }

    private function uniqueRow(string $path, array $query, string $label): array
    {
        $result = $this->request('GET', $path, $query);
        $rows = is_array($result['rows'] ?? null) ? $result['rows'] : [];
        if (count($rows) !== 1 || !is_array($rows[0])) {
            throw new RrMoySkladException('Required MoySklad entity is missing or not unique: ' . $label);
        }
        return $rows[0];
    }

    private function meta(array $entity): array
    {
        $meta = $entity['meta'] ?? null;
        if (!is_array($meta) || !isset($meta['href'], $meta['type'], $meta['mediaType'])) {
            throw new RrMoySkladException('MoySklad returned invalid metadata');
        }
        return [
            'href' => (string) $meta['href'],
            'type' => (string) $meta['type'],
            'mediaType' => (string) $meta['mediaType'],
        ];
    }

    private function request(string $method, string $path, array $query = [], ?array $payload = null): array
    {
        $url = $this->baseUrl . $path;
        if ($query) $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        $body = $payload === null ? null : json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($body === false) throw new RrMoySkladException('Failed to encode MoySklad request');

        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Accept: application/json;charset=utf-8',
            'Accept-Encoding: gzip',
            'User-Agent: rr-tac.ru order integration/1.0',
        ];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        $responseBody = false;
        $status = 0;

        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_ENCODING => 'gzip',
                CURLOPT_HTTPHEADER => $headers,
            ]);
            if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
            $responseBody = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            curl_close($curl);
        } else {
            $httpOptions = [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'timeout' => 20,
                'ignore_errors' => true,
            ];
            if ($body !== null) $httpOptions['content'] = $body;
            $context = stream_context_create([
                'http' => $httpOptions,
                'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
            ]);
            $responseBody = @file_get_contents($url, false, $context);
            if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) {
                $status = (int) $match[1];
            }
            $isGzipResponse = false;
            foreach ($http_response_header ?? [] as $responseHeader) {
                if (preg_match('/^Content-Encoding:\s*gzip\s*$/i', trim($responseHeader))) {
                    $isGzipResponse = true;
                    break;
                }
            }
            if ($responseBody !== false && $isGzipResponse) {
                if (!function_exists('gzdecode')) {
                    throw new RrMoySkladException('Gzip response is unsupported');
                }
                $decodedBody = @gzdecode($responseBody);
                if ($decodedBody === false) {
                    throw new RrMoySkladException('Failed to decode MoySklad response');
                }
                $responseBody = $decodedBody;
            }
        }

        if ($responseBody === false || $status < 200 || $status >= 300) {
            error_log(sprintf('RR-TAC MoySklad request failed: %s %s HTTP %d', $method, $path, $status));
            throw new RrMoySkladException('MoySklad request failed');
        }
        $decoded = json_decode((string) $responseBody, true);
        if (!is_array($decoded)) throw new RrMoySkladException('MoySklad returned invalid JSON');
        return $decoded;
    }
}

function rr_build_customer_order_payload(array $order, array $context, array $counterpartyMeta): array
{
    $name = (string) $order['order_name'];
    $positions = array_map(static function (array $item): array {
        return [
            'quantity' => $item['quantity'],
            'price' => $item['price_kopecks'],
            'reserve' => $item['in_stock'] ? $item['quantity'] : 0,
            'assortment' => ['meta' => $item['assortment_meta']],
        ];
    }, $order['items']);

    $payload = [
        'name' => $name,
        'externalCode' => $name,
        'organization' => ['meta' => $context['organization']],
        'store' => ['meta' => $context['store']],
        'state' => ['meta' => $context['state']],
        'agent' => ['meta' => $counterpartyMeta],
        'positions' => $positions,
    ];
    if (($order['address'] ?? '') !== '') $payload['shipmentAddress'] = $order['address'];
    if (($order['comment'] ?? '') !== '') $payload['description'] = $order['comment'];
    return $payload;
}

function rr_make_order_name(): string
{
    return 'rrtac-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8));
}
