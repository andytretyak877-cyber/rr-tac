/**
 * csv-to-json.js
 * Читает products.csv, скачивает фото, генерирует products.json
 * Запуск: node csv-to-json.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ─── Пути ────────────────────────────────────────────────────────────────────────────────
const CSV_PATH    = path.join(__dirname, 'products_with_descr_images.csv');
const OUT_JSON    = path.join(__dirname, 'assets/data/products.json');
const IMG_DIR     = path.join(__dirname, 'assets/img/products');

// ─── Функция транслитерации ───────────────────────────────────────────────────
function translit(str) {
  const ru = 'А-а-Б-б-В-в-Г-г-Д-д-Е-е-Ё-ё-Ж-ж-З-з-И-и-Й-й-К-к-Л-л-М-м-Н-н-О-о-П-п-Р-р-С-с-Т-т-У-у-Ф-ф-Х-х-Ц-ц-Ч-ч-Ш-ш-Щ-щ-Ъ-ъ-Ы-ы-Ь-ь-Э-э-Ю-ю-Я-я'.split('-');
  const en = 'A-a-B-b-V-v-G-g-D-d-E-e-E-e-ZH-zh-Z-z-I-i-Y-y-K-k-L-l-M-m-N-n-O-o-P-p-R-r-S-s-T-t-U-u-F-f-H-h-TS-ts-CH-ch-SH-sh-SCH-sch---Y-y---E-e-YU-yu-YA-ya'.split('-');
  let res = '';
  for (let i = 0, l = str.length; i < l; i++) {
    const s = str.charAt(i), n = ru.indexOf(s);
    if (n >= 0) { res += en[n]; } else { res += s; }
  }
  return res.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── Генератор features ────────────────────────────────────────────────────────
function makeFeatures(name, catSlug) {
  const n = name.toLowerCase();
  const features = [];

  if (catSlug === 'tourniquets') {
    features.push('Стандарт TCCC/TECC');
    if (n.includes('металл')) features.push('Металлический зажим');
    else if (n.includes('пластик')) features.push('Пластиковый зажим');
    features.push('Быстрое наложение');
    features.push('Подходит для конечностей');
  } else if (catSlug === 'hemostatics') {
    features.push('Ускоряет свёртывание крови');
    features.push('Для тяжёлых ранений');
    if (n.includes('зажим') || n.includes('clamp')) {
      features.push('Храповой механизм');
      features.push('Применяется в TCCC');
    } else {
      features.push('Растворимый / биосовместимый');
      features.push('Стандарт TCCC');
    }
  } else if (catSlug === 'dressings') {
    if (n.includes('компресс') || n.includes('бандаж')) {
      features.push('Аппликатор давления');
      features.push('Надёжная фиксация');
      if (n.includes('4')) features.push('Ширина 4 дюйма');
      else if (n.includes('6')) features.push('Ширина 6 дюймов');
      else if (n.includes('8')) features.push('Ширина 8 дюймов');
    } else if (n.includes('окклюзи') || n.includes('chest seal')) {
      features.push('Герметизация грудной клетки');
      features.push('Предотвращает пневмоторакс');
      if (n.includes('twin') || n.includes('пара')) features.push('Комплект 2 шт.');
      if (n.includes('невентил')) features.push('Невентилируемый');
    } else if (n.includes('абдомин')) {
      features.push('Для ранений брюшной полости');
      features.push('Высокая впитываемость');
      features.push('Стерильный');
    } else if (n.includes('косынк') || n.includes('треугольн')) {
      features.push('Универсальная косыночная повязка');
      features.push('Фиксация конечностей');
      features.push('Многоразового использования');
    } else if (n.includes('ожог') || n.includes('burn')) {
      features.push('Охлаждающий эффект');
      features.push('Обезболивание');
      features.push('Влажная среда заживления');
    } else if (n.includes('эластич') || n.includes('бинт')) {
      features.push('Эластичная фиксация');
      features.push('Многоразовое использование');
      features.push('Для суставов и повязок');
    } else {
      features.push('Стерильный');
      features.push('Быстрое применение');
    }
  } else if (catSlug === 'kits') {
    if (n.includes('рюкзак') && n.includes('40')) {
      features.push('Объём 40 литров');
      features.push('Камуфляж мультикам');
      features.push('Полное снаряжение TCCC');
      features.push('Система Molle');
    } else if (n.includes('рюкзак') && n.includes('20')) {
      features.push('Объём 20 литров');
      features.push('Ткань 1000D');
      features.push('Камуфляж мультикам');
      features.push('Система Molle');
    } else if (n.includes('refill') || n.includes('вложение')) {
      features.push('17 предметов в наборе');
      features.push('Дозаправка IFAK');
      features.push('Совместим со стандартными аптечками');
    } else if (n.includes('ifak mini') || n.includes('hwjb0071')) {
      features.push('Компактный формат');
      features.push('Крепление Molle');
      features.push('Быстрый доступ');
    } else if (n.includes('quick pulling') || n.includes('hwjb0076')) {
      features.push('Система быстрого извлечения');
      features.push('Организованные отсеки');
      features.push('Крепление Molle');
    } else if (n.includes('подсумок')) {
      features.push('Система крепления Molle');
      features.push('Быстрый доступ к содержимому');
      features.push('Компактный формат');
    } else {
      features.push('Крепление Molle');
      features.push('Для полевых условий');
      features.push('Продуманные отсеки');
    }
  } else if (catSlug === 'stretchers') {
    features.push('Складная конструкция');
    features.push('Многоразовое использование');
    features.push('Для эвакуации пострадавшего');
    if (n.includes('зелен')) features.push('Цвет: зелёный');
    else if (n.includes('черн')) features.push('Цвет: чёрный');
  } else if (catSlug === 'airway') {
    if (n.includes('коникотом')) {
      features.push('Экстренная коникотомия');
      features.push('Быстрый доступ к дыхательным путям');
      features.push('Полный набор инструментов');
    } else if (n.includes('воздуховод') || n.includes('назофаринг')) {
      features.push('Поддержание проходимости ДП');
      features.push('Для пострадавших без сознания');
      features.push('Быстрая установка');
    } else {
      features.push('Применение в экстренной медицине');
      features.push('Стандарт TCCC');
    }
  } else if (catSlug === 'tools') {
    if (n.includes('мультитул') || n.includes('6в1')) {
      features.push('6 функций в 1 инструменте');
      features.push('Разрезание одежды и снаряжения');
      features.push('Компактный корпус');
    } else if (n.includes('ножниц')) {
      features.push('Быстрое разрезание');
      if (n.includes('карабин')) features.push('Карабин для крепления');
      features.push('Прочная сталь');
    } else if (n.includes('накладка') || n.includes('глаз')) {
      features.push('Защита глаза');
      features.push('Атравматичный материал');
      features.push('Лёгкая фиксация');
    } else if (n.includes('скотч')) {
      features.push('Надёжная фиксация');
      features.push('Ремонт снаряжения');
      features.push('Прочный армированный материал');
    }
  } else if (catSlug === 'splints') {
    features.push('Моделируется по форме конечности');
    features.push('Фиксация переломов и вывихов');
    if (n.includes('9')) features.push('Длина 9 дюймов');
    else if (n.includes('18')) features.push('Длина 18 дюймов');
    else if (n.includes('36')) features.push('Длина 36 дюймов');
    features.push('Гибкая конструкция');
  } else if (catSlug === 'other') {
    if (n.includes('ожог') || n.includes('burn')) {
      features.push('Охлаждение ожоговой поверхности');
      features.push('Обезболивание');
    }
    features.push('Rhino Rescue Original');
  } else if (catSlug === 'apparel') {
    features.push('Тактическое снаряжение');
    features.push('Удобная посадка');
    if (n.includes('мультикам')) features.push('Цвет: Мультикам');
    else if (n.includes('черн')) features.push('Цвет: Чёрный');
  }

  // Подсумки для турникетов
  if (n.includes('подсумок') && (n.includes('турникет') || catSlug === 'tourniquets')) {
    return [
      'Система крепления Molle',
      'Быстрое извлечение',
      'Защита от загрязнения',
      'Совместим с большинством турникетов',
    ];
  }

  return features.length ? features : ['Оригинальный Rhino Rescue', 'Для тактической медицины'];
}

// ─── Оптовые цены (по розничной) ──────────────────────────────────────────────
function makeWholesale(retail) {
  const r = parseFloat(retail) || 0;
  if (r < 100) return []; // слишком дёшево для оптовых скидок
  return [
    { from: 10,  price: Math.round(r * 0.90) },
    { from: 50,  price: Math.round(r * 0.82) },
    { from: 100, price: Math.round(r * 0.75) },
  ];
}

// ─── Парсинг CSV (разделитель ;, поддержка многострочных "кавычек") ─────────
function parseCSV(raw) {
  // Normalise line endings
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Character-by-character parser — handles quoted fields with embedded newlines
  const allRows = [];
  let cells = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQ) {
      if (ch === '"') {
        // Check for escaped double-quote ""
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ';') {
        cells.push(cur);
        cur = '';
      } else if (ch === '\n') {
        cells.push(cur);
        cur = '';
        if (cells.some(c => c.trim())) allRows.push(cells);
        cells = [];
      } else {
        cur += ch;
      }
    }
  }
  // Last cell / row
  cells.push(cur);
  if (cells.some(c => c.trim())) allRows.push(cells);

  if (!allRows.length) return [];

  const headers = allRows[0].map(h => h.trim());
  return allRows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (row[idx] || '').trim(); });
    return obj;
  }).filter(r => r.id && r.name);
}


// ─── Скачать файл ─────────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest);
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', e => { fs.unlink(dest, () => {}); reject(e); });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

// ─── Главная функция ──────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  const raw  = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);

  console.log(`Найдено товаров: ${rows.length}`);

  // Определяем featured: первые по 2 штуки из самых частых категорий
  const catCount = {};
  rows.forEach(r => {
    const cat = r.category.trim();
    catCount[cat] = (catCount[cat] || 0) + 1;
  });
  const featuredSet = new Set();
  const catPick = {};
  for (const r of rows) {
    const cat = r.category.trim();
    catPick[cat] = catPick[cat] || 0;
    if (catPick[cat] < 1 && featuredSet.size < 6) {
      featuredSet.add(r.id);
      catPick[cat]++;
    }
  }

  const products = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const csvId    = row.id;
    const jsonId   = `rr-${csvId}`;
    const imgUrl   = row.image;
    let catRaw   = row.category.trim();
    if (!catRaw) catRaw = 'Разное';
    catRaw = catRaw.replace(/Rhino Rescue\s*/gi, '').trim();
    
    // Fallbacks if empty after cleaning
    if (!catRaw) catRaw = 'Разное';
    if (catRaw === 'Аптечки') catRaw = 'Аптечки тактические';

    let catSlug  = translit(catRaw);
    let catInfo = { slug: catSlug, name: catRaw };

    // Расширение файла из URL
    const urlPath = imgUrl.split('?')[0];
    const ext = path.extname(urlPath).replace(/^\./, '').toLowerCase() || 'jpg';
    const imgFilename = `rr-${csvId}.${ext}`;
    const imgLocalPath = `assets/img/products/${imgFilename}`;
    const imgDest = path.join(IMG_DIR, imgFilename);

    // Скачиваем
    process.stdout.write(`[${i+1}/${rows.length}] Скачиваю ${imgFilename} ... `);
    try {
      if (!fs.existsSync(imgDest)) {
        await download(imgUrl, imgDest);
        console.log('✓');
      } else {
        console.log('(уже есть)');
      }
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }

    const retail = parseFloat(row.price) || 0;

    // ── Gallery images: CSV field "images" = semicolon-separated URLs (inside quotes) ───
    const extraImages = [];
    if (row.images) {
      const imgUrls = row.images.split(';').map(u => u.trim()).filter(Boolean);
      for (let k = 0; k < imgUrls.length; k++) {
        const exUrl = imgUrls[k];
        const exPath = exUrl.split('?')[0];
        const exExt  = path.extname(exPath).replace(/^\./, '').toLowerCase() || 'jpg';
        const exFilename = `rr-${csvId}-${k+1}.${exExt}`;
        const exLocal    = `assets/img/products/${exFilename}`;
        const exDest     = path.join(IMG_DIR, exFilename);
        try {
          if (!fs.existsSync(exDest)) {
            await download(exUrl, exDest);
          }
          extraImages.push(exLocal);
        } catch (e) {
          console.log(`  ✗ Доп. фото ${k+1}: ${e.message}`);
        }
      }
    }

    // Strip leading <h2>...</h2> from description_full (it duplicates the product title)
    let descFull = (row.description_full || '').trim();
    descFull = descFull.replace(/^\s*<h2>[^<]*<\/h2>\s*/i, '');
    // Also remove trailing <br/> artifacts
    descFull = descFull.replace(/<br\s*\/?>/gi, '').trim();

    products.push({
      id:              jsonId,
      name:            row.name.replace(/\s+/g, ' ').trim(),
      category:        catInfo.slug,
      categoryName:    catInfo.name,
      image:           imgLocalPath,
      images:          extraImages,
      description:     row.description || '',
      description_full: descFull,
      features:        makeFeatures(row.name, catInfo.slug),
      priceRetail:     retail,
      priceWholesale:  makeWholesale(retail),
      sku:             row.article || csvId,
      inStock:         parseInt(row.stock || '0', 10) > 0,
      featured:        featuredSet.has(csvId),
    });
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(products, null, 2), 'utf8');
  console.log(`\n✅ Готово! products.json содержит ${products.length} товаров.`);
  console.log(`   Файл: ${OUT_JSON}`);
}

module.exports = {
  download,
  makeFeatures,
  makeWholesale,
  parseCSV,
  translit,
};

if (require.main === module) {
  main().catch(e => { console.error('ОШИБКА:', e); process.exit(1); });
}
