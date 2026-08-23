/**
 * Static site generator for Rhino Rescue.
 *
 * Usage:
 *   node generate-site.js
 *   SITE_URL=https://example.ru node generate-site.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://rr-tac.ru').replace(/\/$/, '');
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/products.json'), 'utf8'));
const buildHash = crypto.createHash('sha1');
buildHash.update(fs.readFileSync(path.join(ROOT, 'assets/css/style.css')));
for (const file of fs.readdirSync(path.join(ROOT, 'assets/js')).sort()) {
  buildHash.update(fs.readFileSync(path.join(ROOT, 'assets/js', file)));
}
const BUILD_VERSION = buildHash.digest('hex').slice(0, 10);
const YANDEX_METRIKA_ID = '110756263';
const YANDEX_VERIFICATION = '44db7686715943ea';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, max = 160) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function write(relativePath, content) {
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function readTemplate(sourceName, publishedPath) {
  const sourcePath = path.join(ROOT, sourceName);
  if (fs.existsSync(sourcePath)) return fs.readFileSync(sourcePath, 'utf8');

  const livePath = path.join(ROOT, publishedPath);
  if (fs.existsSync(livePath)) return fs.readFileSync(livePath, 'utf8');

  throw new Error(`Template not found: ${sourceName} or ${publishedPath}`);
}

function readProductTemplate() {
  const sourcePath = path.join(ROOT, 'product.html');
  if (fs.existsSync(sourcePath)) return fs.readFileSync(sourcePath, 'utf8');

  const productRoot = path.join(ROOT, 'product');
  if (fs.existsSync(productRoot)) {
    for (const entry of fs.readdirSync(productRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(productRoot, entry.name, 'index.html');
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
    }
  }

  throw new Error('Product template not found: product.html or product/*/index.html');
}

function absoluteAssets(html) {
  return injectSiteAnalytics(html)
    .replace(/info@rhino-rescue\.ru/g, 'info@rr-tac.ru')
    .replace(/https:\/\/t\.me\/rhinorescueru/g, 'https://t.me/rr_tac')
    .replace(/@rhinorescueru/g, '@rr_tac')
    .replace(/г\. Москва, ул\. Примерная, д\. 1,\s*(?:<br\s*\/?>\s*)?офис 100/gi, 'г. Москва, набережная Академика Туполева, 3')
    .replace(/href="catalog\.html\?cat=([^"&]+)"/g, 'href="/catalog/$1/"')
    .replace(/href="product\.html\?id=([^"&]+)"/g, 'href="/product/$1/"')
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/url\(['"]?assets\//g, "url('/assets/")
    .replace(/href="index\.html(?:#[^"]*)?"/g, match => match.replace('index.html', '/'))
    .replace(/href="catalog\.html"/g, 'href="/catalog/"')
    .replace(/href="cart\.html"/g, 'href="/cart/"')
    .replace(/href="delivery\.html"/g, 'href="/delivery/"')
    .replace(/href="payment\.html"/g, 'href="/payment/"')
    .replace(/href="about\.html"/g, 'href="/about/"')
    .replace(/href="contacts\.html"/g, 'href="/contacts/"')
    .replace(/href="privacy\.html"/g, 'href="/privacy/"')
    .replace(/((?:href|src)="\/assets\/(?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^"#]*)?"/g, `$1?v=${BUILD_VERSION}"`);
}

function yandexMetrikaHead() {
  return `<!-- rr-tac:yandex-metrika:start -->
  <script>
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');
    ym(${YANDEX_METRIKA_ID}, 'init', {ssr:true, clickmap:true, ecommerce:'dataLayer', referrer:document.referrer, url:location.href, accurateTrackBounce:true, trackLinks:true});
  </script>
  <!-- rr-tac:yandex-metrika:end -->`;
}

function roistatHead() {
  return `<!-- rr-tac:roistat:start -->
  <script>
    (function(w, d, s, h, id) {
      w.roistatProjectId = id;
      w.roistatHost = h;
      w.roistatPage = d.location.href;
      w.roistatReferrer = d.referrer;
      var protocol = d.location.protocol === 'https:' ? 'https://' : 'http://';
      var path = /^.*roistat_visit=[^;]+(.*)?$/.test(d.cookie)
        ? '/dist/module.js'
        : '/api/site/1.0/' + id + '/init?referrer=' + encodeURIComponent(d.location.href);
      var script = d.createElement(s);
      var firstScript = d.getElementsByTagName(s)[0];
      script.charset = 'UTF-8';
      script.async = true;
      script.src = protocol + h + path;
      firstScript.parentNode.insertBefore(script, firstScript);
    })(window, document, 'script', 'cloud.roistat.com', 'e5a9937f40bc108389d85675efc963a6');
  </script>
  <!-- rr-tac:roistat:end -->`;
}

function yandexMetrikaNoscript() {
  return `<!-- rr-tac:yandex-metrika-noscript:start -->
  <noscript><div><img src="https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}" style="position:absolute;left:-9999px" alt=""></div></noscript>
  <!-- rr-tac:yandex-metrika-noscript:end -->`;
}

function stripSiteAnalytics(html) {
  return html
    .replace(/\s*<!-- rr-tac:yandex-metrika:start -->[\s\S]*?<!-- rr-tac:yandex-metrika:end -->/g, '')
    .replace(/\s*<!-- rr-tac:yandex-metrika-noscript:start -->[\s\S]*?<!-- rr-tac:yandex-metrika-noscript:end -->/g, '')
    .replace(/\s*<!-- rr-tac:roistat:start -->[\s\S]*?<!-- rr-tac:roistat:end -->/g, '')
    .replace(/\s*<!-- Roistat Counter Start -->[\s\S]*?<!-- Roistat Counter End -->/gi, '')
    .replace(/\s*<script\b[^>]*(?:src=["'][^"']*@tadashi\/mask[^"']*["']|type=["']module["'])[^>]*>[\s\S]*?@tadashi\/mask[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<script\b[^>]*src=["'][^"']*@tadashi\/mask[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

function injectSiteAnalytics(html) {
  return html
    .replace(/\s*<!-- rr-tac:yandex-metrika-noscript:start -->[\s\S]*?<!-- rr-tac:yandex-metrika-noscript:end -->/g, '')
    .replace(/<body([^>]*)>/i, match => `${match}\n${yandexMetrikaNoscript()}`);
}

function headSeo({ title, description, canonical, image, type = 'website', jsonLd, robots = 'index, follow' }) {
  const imageUrl = image ? `${SITE_URL}/${image.replace(/^\//, '')}` : `${SITE_URL}/assets/img/hero-product.png`;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${SITE_URL}${canonical}">`,
    `<meta name="yandex-verification" content="${YANDEX_VERIFICATION}">`,
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">',
    '<meta property="og:locale" content="ru_RU">',
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${SITE_URL}${canonical}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    yandexMetrikaHead(),
    roistatHead(),
    jsonLd ? `<script type="application/ld+json">${jsonForHtml(jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n  ');
}

function replaceHeadSeo(html, seo) {
  return stripSiteAnalytics(html)
    .replace(/\s*<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<meta\s+name="description"[^>]*>/i, '')
    .replace(/\s*<meta\s+name="robots"[^>]*>/i, '')
    .replace(/\s*<meta\s+name="yandex-verification"[^>]*>/i, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/i, '')
    .replace(/\s*<link\s+rel="icon"[^>]*>/gi, '')
    .replace(/\s*<meta\s+property="og:(?:locale|type|title|description|url|image)"[^>]*>/gi, '')
    .replace(/\s*<meta\s+name="twitter:card"[^>]*>/i, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, seo);
}

function withBrand(name) {
  return /rhino\s*rescue/i.test(name) ? name : `${name} Rhino Rescue`;
}

function seoTitle(value, suffix, max = 105, uniqueTag = '') {
  const full = `${value}${suffix}`;
  if (full.length <= max) return full;
  const uniquePart = uniqueTag ? ` — ${uniqueTag}` : '';
  const available = Math.max(30, max - suffix.length - uniquePart.length - 1);
  return `${value.slice(0, available).replace(/\s+\S*$/, '')}…${uniquePart}${suffix}`;
}

const CATEGORY_SEO_NAMES = {
  'aptechki-takticheskie': 'Тактические аптечки',
  'raznoe': 'Другие товары',
  'dyhatelnaya-reanimatsiya': 'Средства для дыхательной реанимации',
  'nozhnitsy-markery-i-nakladki': 'Медицинские ножницы, маркеры и накладки',
  'shiny-immobilizatsionnye': 'Иммобилизационные шины',
};

function productImages(product) {
  return [...new Set([product.image, ...(product.images || [])].filter(Boolean))];
}

function productCard(product, index = 0) {
  const revealDelay = index < 5 ? ` reveal-delay-${index + 1}` : '';
  return `
    <article class="product-card reveal${revealDelay}" data-id="${escapeHtml(product.id)}" data-stock="${product.inStock ? 'true' : 'false'}">
      <a href="/product/${encodeURIComponent(product.id)}/" class="product-card__img">
        <img src="/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        <span class="product-card__badge${product.inStock ? '' : ' no-stock'}">${product.inStock ? 'В наличии' : 'Под заказ'}</span>
      </a>
      <div class="product-card__body">
        <span class="product-card__category">${escapeHtml(product.categoryName)}</span>
        <h2 class="product-card__name"><a href="/product/${encodeURIComponent(product.id)}/">${escapeHtml(product.name)}</a></h2>
        <span class="product-card__sku">Арт. ${escapeHtml(product.sku)}</span>
        <div class="product-card__price">
          <div class="product-card__price-retail">
            <span class="product-card__price-label">Розница</span>
            <span class="product-card__price-value">${Number(product.priceRetail).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div class="product-card__price-wholesale">Оптовые цены: <span>по запросу</span></div>
        </div>
      </div>
      <div class="product-card__footer">
        <a href="/product/${encodeURIComponent(product.id)}/" class="btn btn-secondary btn-sm">Подробнее</a>
        <button class="btn btn-primary btn-sm" data-modal="order" data-product="${escapeHtml(product.name)}">Заявка</button>
      </div>
    </article>`;
}

function productMarkup(product, related) {
  const images = productImages(product);
  const features = (product.features || []).map(item => `<span class="product-feature-tag">${escapeHtml(item)}</span>`).join('');
  const thumbs = images.length > 1 ? `<div class="gallery__thumbs-shell" id="galleryThumbsShell">
    <button class="gallery__thumb-scroll gallery__thumb-scroll--prev" type="button" data-thumb-scroll="-1" aria-label="Прокрутить миниатюры назад">&#8249;</button>
    <div class="gallery__thumbs" id="galleryThumbs">${images.map((image, index) => `
      <button class="gallery__thumb${index === 0 ? ' active' : ''}" type="button" data-index="${index}" data-src="/${escapeHtml(image)}" aria-label="Фото ${index + 1}">
        <img src="/${escapeHtml(image)}" alt="${escapeHtml(product.name)}, фото ${index + 1}" loading="lazy">
      </button>`).join('')}</div>
    <button class="gallery__thumb-scroll gallery__thumb-scroll--next" type="button" data-thumb-scroll="1" aria-label="Прокрутить миниатюры вперёд">&#8250;</button>
  </div>` : '';
  const arrows = images.length > 1 ? `
    <button class="gallery__arrow gallery__arrow--prev" id="galleryPrev" type="button" aria-label="Предыдущее фото">&#8249;</button>
    <button class="gallery__arrow gallery__arrow--next" id="galleryNext" type="button" aria-label="Следующее фото">&#8250;</button>` : '';

  return `
    <nav class="product-breadcrumb reveal" aria-label="Хлебные крошки">
      <a href="/">Главная</a><span>/</span>
      <a href="/catalog/">Каталог</a><span>/</span>
      <a href="/catalog/${encodeURIComponent(product.category)}/">${escapeHtml(product.categoryName)}</a><span>/</span>
      <strong>${escapeHtml(product.name)}</strong>
    </nav>
    <div class="product-layout">
      <div class="gallery reveal-left">
        <div class="gallery__main" id="galleryMain">
          <img class="gallery__main-img" id="mainImg" src="/${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}">
          ${arrows}
          <div class="gallery__badge"><span class="product-card__badge${product.inStock ? '' : ' no-stock'}">${product.inStock ? 'В наличии' : 'Под заказ'}</span></div>
        </div>
        ${thumbs}
      </div>
      <div class="product-info reveal-right">
        <a class="product-category-link" href="/catalog/${encodeURIComponent(product.category)}/">← ${escapeHtml(product.categoryName)}</a>
        <h1 class="product-title">${escapeHtml(product.name)}</h1>
        <div class="product-meta">
          <span class="product-sku">Арт. ${escapeHtml(product.sku)}</span>
          <span class="product-stock ${product.inStock ? 'in' : 'out'}">${product.inStock ? 'В наличии' : 'Под заказ'}</span>
        </div>
        ${product.description ? `<p class="product-desc">${escapeHtml(product.description)}</p>` : ''}
        ${features ? `<div class="product-features">${features}</div>` : ''}
        <div class="product-price-block">
          <div class="product-price-label">Розничная цена</div>
          <div class="product-price-value">${Number(product.priceRetail).toLocaleString('ru-RU')} ₽</div>
          <div class="product-wholesale-note">
            <span class="product-wholesale-icon" aria-hidden="true">🏢</span>
            <div><strong>Оптовые цены — по запросу.</strong> <button class="product-wholesale-action" type="button" data-modal="order" data-product="${escapeHtml(product.name)}">Оставьте заявку</button> или напишите на <a href="mailto:info@rr-tac.ru">info@rr-tac.ru</a>.</div>
          </div>
        </div>
        <div class="product-qty-wrapper">
          <span>Количество:</span>
          <div class="product-qty">
            <button type="button" data-qty-change="-1" aria-label="Уменьшить количество">−</button>
            <input type="number" id="productQtyInput" value="1" min="1" aria-label="Количество">
            <button type="button" data-qty-change="1" aria-label="Увеличить количество">+</button>
          </div>
        </div>
        <div class="product-cta">
          <button class="btn btn-primary btn-lg" id="addProductToCart" type="button">В корзину</button>
          <button class="btn btn-secondary btn-lg" data-modal="order" data-product="${escapeHtml(product.name)}" type="button">Оставить заявку</button>
        </div>
        <div class="product-specs">
          <div class="product-specs__title">Характеристики</div>
          <table><tbody>
            <tr><td>Артикул</td><td>${escapeHtml(product.sku)}</td></tr>
            <tr><td>Категория</td><td><a href="/catalog/${encodeURIComponent(product.category)}/">${escapeHtml(product.categoryName)}</a></td></tr>
            <tr><td>Наличие</td><td>${product.inStock ? 'В наличии' : 'Под заказ'}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>
    ${product.description_full ? `<section class="product-full-desc reveal"><h2 class="product-full-desc__title">Подробное описание</h2><div class="product-full-desc__body">${product.description_full}</div></section>` : ''}
    ${related.length ? `<section class="related-section reveal"><span class="section-label">Из той же категории</span><h2 class="section-title">Похожие товары</h2><div class="products-grid">${related.map(productCard).join('')}</div></section>` : ''}
    <script type="application/json" id="productData">${jsonForHtml(product)}</script>`;
}

function buildProductPages() {
  const template = readProductTemplate();
  for (const product of products) {
    const canonical = `/product/${encodeURIComponent(product.id)}/`;
    const productSeoName = withBrand(product.name);
    const action = product.inStock ? 'Купить' : 'Заказать';
    const price = Number(product.priceRetail).toLocaleString('ru-RU');
    const descriptionName = truncate(productSeoName, 72);
    const description = `${action} ${descriptionName} в RR-TAC. Цена ${price} ₽, арт. ${product.sku}. Характеристики и фото. Доставка по Москве и России.`;
    const images = productImages(product).map(image => `${SITE_URL}/${image}`);
    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: String(product.sku || ''),
      brand: { '@type': 'Brand', name: 'Rhino Rescue' },
      image: images,
      description,
      category: product.categoryName,
      offers: {
        '@type': 'Offer',
        url: `${SITE_URL}${canonical}`,
        priceCurrency: 'RUB',
        price: product.priceRetail,
        availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: 'RR-TAC', url: SITE_URL },
      },
    };
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE_URL}/catalog/` },
        { '@type': 'ListItem', position: 3, name: product.categoryName, item: `${SITE_URL}/catalog/${product.category}/` },
        { '@type': 'ListItem', position: 4, name: product.name, item: `${SITE_URL}${canonical}` },
      ],
    };
    const seo = headSeo({
      title: seoTitle(productSeoName, ` — ${product.inStock ? 'купить, цена' : 'заказать'} | RR-TAC`, 105, `арт. ${product.sku}`),
      description,
      canonical,
      image: product.image,
      type: 'product',
      jsonLd: [productSchema, breadcrumbs],
    });
    let html = replaceHeadSeo(template, seo);
    html = html.replace(/<div class="container" id="productContainer">[\s\S]*?<\/div>\s*<\/main>/, `<div class="container" id="productContainer">${productMarkup(product, products.filter(item => item.id !== product.id && item.category === product.category).slice(0, 4))}</div>\n</main>`);
    html = html.replace(/<script>\s*\/\*[\s\S]*?Product page logic[\s\S]*?<\/script>/, '<script src="/assets/js/product.js"></script>');
    html = absoluteAssets(html);
    write(path.join('product', product.id, 'index.html'), html);
  }
}

function sidebarMarkup(categories, active) {
  return [{ id: 'all', name: 'Все категории', count: products.length }, ...categories].map(category => `
    <a class="sidebar-cat${category.id === active ? ' active' : ''}" data-cat="${escapeHtml(category.id)}" href="${category.id === 'all' ? '/catalog/' : `/catalog/${encodeURIComponent(category.id)}/`}">
      <span>${escapeHtml(category.name)}</span><span class="sidebar-cat__count">${category.count}</span>
    </a>`).join('');
}

function buildCategoryPages() {
  const template = readTemplate('catalog.html', path.join('catalog', 'index.html'));
  const categoryMap = new Map();
  for (const product of products) {
    if (!categoryMap.has(product.category)) categoryMap.set(product.category, { id: product.category, name: product.categoryName, count: 0 });
    categoryMap.get(product.category).count += 1;
  }
  const categories = [...categoryMap.values()];
  const pages = [{ id: 'all', name: 'Каталог товаров', items: products }, ...categories.map(category => ({ ...category, items: products.filter(product => product.category === category.id) }))];

  for (const page of pages) {
    const isAll = page.id === 'all';
    const canonical = isAll ? '/catalog/' : `/catalog/${encodeURIComponent(page.id)}/`;
    const categoryName = isAll ? 'Каталог товаров' : (CATEGORY_SEO_NAMES[page.id] || page.name);
    const brandedName = withBrand(categoryName);
    const description = isAll
      ? `Каталог товаров Rhino Rescue для тактической медицины и первой помощи — ${products.length} товаров в ${categories.length} категориях. Цены, наличие, розница и опт. Доставка по России.`
      : `${brandedName} в интернет-магазине тактической медицины RR-TAC — ${page.items.length} товаров. Цены, наличие и характеристики. Доставка по Москве и всей России.`;
    const collectionSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: brandedName,
      url: `${SITE_URL}${canonical}`,
      mainEntity: { '@type': 'ItemList', numberOfItems: page.items.length, itemListElement: page.items.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${SITE_URL}/product/${product.id}/` })) },
    };
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: isAll
        ? [{ '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE_URL}/catalog/` }]
        : [{ '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE_URL}/` }, { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE_URL}/catalog/` }, { '@type': 'ListItem', position: 3, name: brandedName, item: `${SITE_URL}${canonical}` }],
    };
    const title = isAll ? 'Каталог товаров Rhino Rescue — цены | RR-TAC' : `${brandedName} — купить, цены | RR-TAC`;
    const seo = headSeo({ title, description: truncate(description), canonical, jsonLd: [collectionSchema, breadcrumbs] });
    let html = replaceHeadSeo(template, seo);
    html = html.replace(/<h1 class="section-title"[^>]*>[\s\S]*?<\/h1>/, `<h1 class="section-title" style="margin-bottom:.5rem">${escapeHtml(brandedName)}</h1>`);
    html = html.replace(/<p class="section-subtitle">[\s\S]*?<\/p>/, `<p class="section-subtitle">${escapeHtml(description)}</p>`);
    html = html.replace(/<div class="sidebar-categories" id="catList"[\s\S]*?<\/div>/, `<div class="sidebar-categories" id="catList" role="navigation" aria-label="Категории товаров">${sidebarMarkup(categories, page.id)}</div>`);
    html = html.replace(/<span id="catalogCountNum">[^<]*<\/span>/, `<span id="catalogCountNum">${page.items.length}</span>`);
    html = html.replace(/<div class="products-grid" id="catalogGrid">[\s\S]*?<\/div>\s*<div class="no-results"/, `<div class="products-grid" id="catalogGrid">${page.items.map(productCard).join('')}</div>\n\n        <div class="no-results"`);
    html = absoluteAssets(html);
    write(isAll ? path.join('catalog', 'index.html') : path.join('catalog', page.id, 'index.html'), html);
  }
}

function copyStaticPages() {
  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'favicon.ico'), path.join(DIST, 'favicon.ico'));
  const pageMap = {
    'index.html': {
      destination: 'index.html',
      seo: {
        title: 'Rhino Rescue — интернет-магазин тактической медицины | RR-TAC',
        description: 'Товары Rhino Rescue для тактической и первой помощи: аптечки, турникеты, бандажи, кровоостанавливающие и эвакуационные средства. Розница и опт, доставка по России.',
        canonical: '/',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'RR-TAC',
          alternateName: 'Rhino Rescue — тактическая медицина',
          url: `${SITE_URL}/`,
          publisher: { '@type': 'Organization', name: 'RR-TAC', url: SITE_URL, email: 'info@rr-tac.ru' },
        },
      },
    },
    'cart.html': {
      destination: 'cart/index.html',
      seo: { title: 'Корзина | RR-TAC', description: 'Корзина товаров Rhino Rescue в интернет-магазине тактической медицины RR-TAC.', canonical: '/cart/', robots: 'noindex, follow' },
    },
    'delivery.html': {
      destination: 'delivery/index.html',
      seo: { title: 'Доставка товаров Rhino Rescue по России | RR-TAC', description: 'Доставка товаров Rhino Rescue для тактической медицины по Москве и всей России. Транспортные компании, пункты выдачи и самовывоз.', canonical: '/delivery/' },
    },
    'payment.html': {
      destination: 'payment/index.html',
      seo: { title: 'Оплата товаров Rhino Rescue — розница и опт | RR-TAC', description: 'Способы оплаты товаров Rhino Rescue в магазине RR-TAC: карта, СБП и безналичный расчёт. Условия розничных и оптовых заказов.', canonical: '/payment/' },
    },
    'about.html': {
      destination: 'about/index.html',
      seo: { title: 'О магазине тактической медицины RR-TAC', description: 'О магазине RR-TAC и товарах Rhino Rescue для тактической медицины и первой помощи. Розничные и оптовые поставки с доставкой по России.', canonical: '/about/' },
    },
    'contacts.html': {
      destination: 'contacts/index.html',
      seo: { title: 'Контакты интернет-магазина RR-TAC — Москва', description: 'Контакты магазина тактической медицины RR-TAC: info@rr-tac.ru, Telegram и адрес в Москве — набережная Академика Туполева, 3.', canonical: '/contacts/' },
    },
    'privacy.html': {
      destination: 'privacy/index.html',
      seo: {
        title: 'Обработка персональных данных | RR-TAC',
        description: 'Политика обработки персональных данных и согласие посетителей интернет-магазина RR-TAC.',
        canonical: '/privacy/',
        robots: 'noindex, follow',
      },
    },
  };
  for (const [source, page] of Object.entries(pageMap)) {
    const html = replaceHeadSeo(readTemplate(source, page.destination), headSeo(page.seo));
    write(page.destination, absoluteAssets(html));
  }
}

function copyServerUpdater() {
  const updaterFiles = [
    'update-site.js',
    'sync-products.js',
    'csv-to-json.js',
    'generate-site.js',
    'verify-build.js',
  ];
  for (const file of updaterFiles) {
    const source = path.join(ROOT, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(DIST, file));
  }
}

function buildSitemap() {
  const paths = ['/', '/catalog/', '/cart/', '/delivery/', '/payment/', '/about/', '/contacts/'];
  const categories = [...new Set(products.map(product => product.category))];
  paths.push(...categories.map(category => `/catalog/${category}/`));
  paths.push(...products.map(product => `/product/${product.id}/`));
  const urls = paths.map(url => `  <url><loc>${SITE_URL}${url}</loc></url>`).join('\n');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyStaticPages();
buildProductPages();
buildCategoryPages();
buildSitemap();
copyServerUpdater();

console.log(`Generated ${products.length} product pages in ${DIST}`);
