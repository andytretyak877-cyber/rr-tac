# Настройка интеграции МойСклад

## Конфигурация сервера

Файл с реальным токеном не должен находиться в Git, `dist` или document root Nginx.
При стандартном document root `/var/www/html` используйте путь:

```text
/var/www/config/moysklad.php
```

Скопируйте структуру из `config/moysklad.example.php`, подставьте реальный токен и
ограничьте чтение пользователем PHP-FPM, например:

```bash
sudo chown root:www-data /var/www/config/moysklad.php
sudo chmod 640 /var/www/config/moysklad.php
```

PHP-обработчик ищет `config/moysklad.php` вверх от своего каталога. Поэтому файл
`/var/www/config/moysklad.php` доступен для опубликованного обработчика
`/var/www/html/assets/php/order.php`, но не доступен посетителю сайта.

## Сопоставление товаров

1. Браузер отправляет только `products.json[].id` и количество.
2. Backend повторно открывает серверный `assets/data/products.json` и находит объект по `id`.
3. Из проверенного объекта backend берёт `sku`, цену `priceRetail`, название и `inStock`.
4. Товар МойСклад ищется по точному фильтру `article=<sku>`.

Цена из `products.json` переводится из рублей в копейки. Поле позиции `reserve`
равно заказанному количеству при `inStock: true` и `0` при `inStock: false`.

## Обновление сайта

`generate-site.js` пересоздаёт только локальный `dist`. `update-site.js` копирует
содержимое `dist` в document root и отдельно запрещает публикацию, если в `dist`
обнаружится `config/moysklad.php`. Внешний `/var/www/config/moysklad.php` эти
операции не удаляют и не перезаписывают.
