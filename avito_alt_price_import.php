<?php

/**
 * Импорт альтернативных цен для Avito из Google Sheets.
 *
 * Источник: Google-таблица, лист gid=0.
 *
 * Колонки таблицы:
 * - ID — ID товара в 1С-Битрикс;
 * - новая Цена для ИП — основная цена;
 * - править в ручном режиме — ручная цена с приоритетом.
 *
 * Если ручная колонка заполнена, используется её значение. В противном
 * случае используется «новая Цена для ИП». Пустые, некорректные и нулевые
 * цены пропускаются и не очищают ранее записанное значение.
 *
 * Файл предназначен только для ручного запуска администратором из раздела
 * «Командная PHP-строка» внутри 1С-Битрикс.
 */

if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die('Запуск разрешён только внутри 1С-Битрикс.');
}

global $USER;

if (!is_object($USER) || !$USER->IsAdmin()) {
    die('Для запуска требуются права администратора.');
}

set_time_limit(0);

if (!\Bitrix\Main\Loader::includeModule('iblock')) {
    die('Ошибка: модуль iblock не подключён.');
}

$url = 'https://docs.google.com/spreadsheets/d/1JNHGGDIH2NpGUNNRsv_kkeWK-DHDITbtdv0Li7S6MgA/export?format=csv&gid=0';

$http = new \Bitrix\Main\Web\HttpClient(array(
    'socketTimeout' => 30,
    'streamTimeout' => 60,
    'redirect' => true,
    'redirectMax' => 5,
));

$csv = $http->get($url);

if ($csv === false || $http->getStatus() !== 200 || trim($csv) === '') {
    die('Ошибка загрузки Google-таблицы. HTTP: '.$http->getStatus());
}

if (stripos(ltrim($csv), '<!doctype html') === 0) {
    die('Google запросил авторизацию. Откройте таблице доступ по ссылке.');
}

$stream = fopen('php://temp', 'r+');

if ($stream === false) {
    die('Не удалось создать временный поток для CSV.');
}

fwrite($stream, $csv);
rewind($stream);

$headers = fgetcsv($stream, 0, ',');

if (!$headers) {
    fclose($stream);
    die('Не удалось прочитать заголовки таблицы.');
}

$idColumn = false;
$priceColumn = false;
$manualColumn = false;

foreach ($headers as $index => $header) {
    $header = preg_replace('/^\xEF\xBB\xBF/', '', trim($header));
    $header = mb_strtolower($header);

    if ($header === 'id') {
        $idColumn = $index;
    }

    if ($header === mb_strtolower('новая Цена для ИП')) {
        $priceColumn = $index;
    }

    if ($header === mb_strtolower('править в ручном режиме')) {
        $manualColumn = $index;
    }
}

if ($idColumn === false || $priceColumn === false || $manualColumn === false) {
    fclose($stream);
    die('Не найдены колонки ID, «новая Цена для ИП» или «править в ручном режиме».');
}

$normalizePrice = static function ($value) {
    return str_replace(
        array("\xC2\xA0", ' ', ','),
        array('', '', '.'),
        trim($value)
    );
};

$updated = 0;
$manualUsed = 0;
$automaticUsed = 0;
$zeroSkipped = 0;
$notFound = 0;
$invalid = 0;
$noProperty = 0;
$propertyCache = array();

while (($row = fgetcsv($stream, 0, ',')) !== false) {
    $elementId = isset($row[$idColumn]) ? (int)trim($row[$idColumn]) : 0;
    $automaticPrice = isset($row[$priceColumn])
        ? $normalizePrice($row[$priceColumn])
        : '';
    $manualPrice = isset($row[$manualColumn])
        ? $normalizePrice($row[$manualColumn])
        : '';

    if ($elementId <= 0) {
        $invalid++;
        continue;
    }

    if ($manualPrice !== '') {
        $rawPrice = $manualPrice;
        $priceSource = 'manual';
    } else {
        $rawPrice = $automaticPrice;
        $priceSource = 'automatic';
    }

    if ($rawPrice === '' || !is_numeric($rawPrice)) {
        $invalid++;
        continue;
    }

    $newPrice = (float)$rawPrice;

    if ($newPrice <= 0) {
        $zeroSkipped++;
        continue;
    }

    $element = CIBlockElement::GetList(
        array(),
        array('ID' => $elementId),
        false,
        false,
        array('ID', 'IBLOCK_ID')
    )->Fetch();

    if (!$element) {
        $notFound++;
        continue;
    }

    $iblockId = (int)$element['IBLOCK_ID'];

    if (!isset($propertyCache[$iblockId])) {
        $propertyCache[$iblockId] = (bool)CIBlockProperty::GetList(
            array(),
            array(
                'IBLOCK_ID' => $iblockId,
                'CODE' => 'AVITO_ALT_PRICE',
            )
        )->Fetch();
    }

    if (!$propertyCache[$iblockId]) {
        $noProperty++;
        continue;
    }

    $value = rtrim(rtrim(number_format($newPrice, 2, '.', ''), '0'), '.');

    CIBlockElement::SetPropertyValuesEx(
        $elementId,
        $iblockId,
        array('AVITO_ALT_PRICE' => $value)
    );

    $updated++;

    if ($priceSource === 'manual') {
        $manualUsed++;
    } else {
        $automaticUsed++;
    }
}

fclose($stream);

echo 'Готово<br>';
echo 'Обновлено: '.$updated.'<br>';
echo 'Взято из ручной колонки: '.$manualUsed.'<br>';
echo 'Взято из «новая Цена для ИП»: '.$automaticUsed.'<br>';
echo 'Пропущено с ценой 0: '.$zeroSkipped.'<br>';
echo 'Товар не найден: '.$notFound.'<br>';
echo 'Некорректных строк: '.$invalid.'<br>';
echo 'Нет свойства AVITO_ALT_PRICE: '.$noProperty;
