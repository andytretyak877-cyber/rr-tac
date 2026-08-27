/** Basic integrity checks for the generated dist directory. */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
const products = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/products.json'), 'utf8'));
const failures = [];
const seenTitles = new Map();
const seenDescriptions = new Map();
const seenCanonicals = new Map();

const productIds = products.map(product => String(product.id || ''));
if (productIds.some(id => !id)) fail('products.json: every product must have an id');
if (new Set(productIds).size !== productIds.length) fail('products.json: ids must be unique');
const articles = products.map(product => String(product.sku || ''));
if (articles.some(article => !article)) fail('products.json: every product must have a sku/article');
if (new Set(articles).size !== articles.length) fail('products.json: sku/articles must be unique');

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const target = path.join(dist, relativePath);
  if (!fs.existsSync(target)) {
    fail(`Missing file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function localTargetExists(url, htmlFile) {
  const cleanUrl = url.split('#')[0].split('?')[0];
  if (!cleanUrl) return true;
  let target;
  if (cleanUrl.startsWith('/')) {
    target = path.join(dist, decodeURIComponent(cleanUrl));
  } else {
    target = path.resolve(path.dirname(htmlFile), decodeURIComponent(cleanUrl));
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  return fs.existsSync(path.join(target, 'index.html'));
}

for (const product of products) {
  const relativePath = path.join('product', product.id, 'index.html');
  const html = read(relativePath);
  if (!html.includes('<link rel="canonical"')) fail(`${relativePath}: canonical is missing`);
  if (!html.includes('<meta name="description"')) fail(`${relativePath}: description is missing`);
  if (!html.includes('application/ld+json')) fail(`${relativePath}: JSON-LD is missing`);
  if (!html.includes(`id="productData"`)) fail(`${relativePath}: product data is missing`);
  if (!html.includes(`<h1 class="product-title">`)) fail(`${relativePath}: H1 is missing`);
  if (!html.includes(`data-order-product-id="${product.id}"`)) {
    fail(`${relativePath}: one-click order must submit products.json id`);
  }
}

const categories = [...new Set(products.map(product => product.category))];
for (const category of categories) {
  const relativePath = path.join('catalog', category, 'index.html');
  const html = read(relativePath);
  if (!html.includes('<link rel="canonical"')) fail(`${relativePath}: canonical is missing`);
  if (!html.includes('<meta name="description"')) fail(`${relativePath}: description is missing`);
  if (!html.includes('class="product-card')) fail(`${relativePath}: product cards are missing`);
}

read(path.join('catalog', 'index.html'));
const privacyHtml = read(path.join('privacy', 'index.html'));
if (!privacyHtml.includes('324508100648215') || !privacyHtml.includes('081405121944')) {
  fail('privacy/index.html: operator details are missing');
}
read('sitemap.xml');
read('robots.txt');
read('favicon.ico');

const mainJs = read(path.join('assets', 'js', 'main.js'));
const sendPhp = read(path.join('assets', 'php', 'send.php'));
const orderPhp = read(path.join('assets', 'php', 'order.php'));
const moyskladPhp = read(path.join('assets', 'php', 'moysklad.php'));
const mailPhp = read(path.join('assets', 'php', 'mail.php'));
const mailerPhp = read(path.join('assets', 'php', 'mailer.php'));
if ((mainJs.match(/reachGoal/g) || []).length !== 1 || !mainJs.includes("const LEAD_GOAL = 'qleads'")) {
  fail('assets/js/main.js: lead goal must be declared and sent exactly once');
}
if (!sendPhp.includes("rr_find") && !sendPhp.includes('$roistatConfigPath')) {
  fail('assets/php/send.php: server-side Roistat configuration lookup is missing');
}
if (!sendPhp.includes('ROISTAT_INTEGRATION_KEY') || /test\.txt|file_put_contents/.test(sendPhp)) {
  fail('assets/php/send.php: unsafe or incomplete Roistat handler');
}
if (!mainJs.includes('/assets/php/order.php') || !mainJs.includes('submitMoySkladOrder')) {
  fail('assets/js/main.js: MoySklad order submission is missing');
}
if (!mainJs.includes('/assets/php/mail.php') || !mainJs.includes('sendLeadToEmail')) {
  fail('assets/js/main.js: SMTP form submission is missing');
}
if (!/Promise\.allSettled\(\[\s*sendLeadToEmail\(new FormData\(form\)\),\s*sendLeadToRoistat\(new FormData\(form\)\)\s*\]\)/.test(mainJs)) {
  fail('assets/js/main.js: lead transports must remain email first and Roistat second');
}
if (!/Promise\.allSettled\(\[\s*sendOrderToBackend\(form, items\),\s*sendLeadToRoistat\(new FormData\(form\)\)\s*\]\)/.test(mainJs)) {
  fail('assets/js/main.js: order backend and Roistat call order changed');
}
if (!mainJs.includes('if (!emailAccepted && !roistatAccepted)')) {
  fail('assets/js/main.js: SMTP-or-Roistat success semantics changed');
}
if (!mailPhp.includes("require_once __DIR__ . '/mailer.php'") || !mailerPhp.includes('RR_MAIL_CONFIG_PATH')) {
  fail('assets/php: isolated SMTP endpoint or external configuration lookup is missing');
}
if (!mailerPhp.includes('PHPMailer::ENCRYPTION_SMTPS') || !mailerPhp.includes('$mailer->Port = $config')) {
  fail('assets/php/mailer.php: PHPMailer SMTPS configuration is incomplete');
}
if (!orderPhp.includes('Заказ в МойСклад НЕ создан') || !orderPhp.includes('rr_rate_limit')) {
  fail('assets/php/order.php: manager notification or backend rate limit is missing');
}
if (!orderPhp.includes('if ($orderCreated)') || orderPhp.includes('if ($orderCreated || $managerMailSent)')) {
  fail('assets/php/order.php: buyer success must require a confirmed MoySklad order');
}
if (!moyskladPhp.includes("'reserve'") || !moyskladPhp.includes("'price'")) {
  fail('assets/php/moysklad.php: position price or reserve is missing');
}
if (!moyskladPhp.includes("$product['id']") || !moyskladPhp.includes("$product['sku']") || !moyskladPhp.includes("'filter' => 'article=' . $item['article']")) {
  fail('assets/php/moysklad.php: id-to-sku-to-MoySklad mapping is incomplete');
}
if (fs.existsSync(path.join(dist, 'config', 'moysklad.php'))) {
  fail('dist must not contain config/moysklad.php');
}
if (fs.existsSync(path.join(dist, 'config', 'mail.php'))) {
  fail('dist must not contain config/mail.php');
}
if (!fs.existsSync(path.join(dist, 'assets', 'php', 'vendor', 'phpmailer', 'src', 'PHPMailer.php'))) {
  fail('dist must contain the PHPMailer runtime');
}
const cartHtml = read(path.join('cart', 'index.html'));
if (!cartHtml.includes('name="address"') || !cartHtml.includes('id="cartComment"')) {
  fail('cart/index.html: delivery address and comment must be separate');
}

for (const htmlFile of walk(dist).filter(file => file.endsWith('.html'))) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const relativePath = path.relative(dist, htmlFile);
  const titles = [...html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map(match => match[1].trim());
  const descriptions = [...html.matchAll(/<meta\s+name="description"\s+content="([^"]*)"/gi)].map(match => match[1].trim());
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/gi)].map(match => match[1].trim());
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  const metrikaCount = (html.match(/<!-- rr-tac:yandex-metrika:start -->/g) || []).length;
  const roistatCount = (html.match(/<!-- rr-tac:roistat:start -->/g) || []).length;
  const jsonLdCount = (html.match(/<script\b[^>]*type=["']application\/ld\+json["']/gi) || []).length;
  if (titles.length !== 1) fail(`${relativePath}: expected one title, found ${titles.length}`);
  if (descriptions.length !== 1) fail(`${relativePath}: expected one description, found ${descriptions.length}`);
  if (canonicals.length !== 1) fail(`${relativePath}: expected one canonical, found ${canonicals.length}`);
  if (h1Count !== 1) fail(`${relativePath}: expected one H1, found ${h1Count}`);
  if (metrikaCount !== 1) fail(`${relativePath}: expected one Yandex Metrika counter, found ${metrikaCount}`);
  if (roistatCount !== 1) fail(`${relativePath}: expected one Roistat counter, found ${roistatCount}`);
  if (jsonLdCount > 1) fail(`${relativePath}: expected at most one JSON-LD block, found ${jsonLdCount}`);
  if (/<!-- Roistat Counter Start -->|@tadashi\/mask/i.test(html)) {
    fail(`${relativePath}: legacy tracking or mask code remains`);
  }
  if (!html.includes('href="/favicon.ico"')) fail(`${relativePath}: favicon link is missing`);
  for (const [value, map, label] of [[titles[0], seenTitles, 'title'], [descriptions[0], seenDescriptions, 'description'], [canonicals[0], seenCanonicals, 'canonical']]) {
    if (!value) continue;
    if (map.has(value)) fail(`${relativePath}: duplicate ${label} also used in ${map.get(value)}`);
    else map.set(value, relativePath);
  }
  if (/catalog\.html\?cat=|product\.html\?id=/.test(html)) {
    fail(`${relativePath}: legacy dynamic link remains`);
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const url = match[1];
    if (!url || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(url)) continue;
    if (!localTargetExists(url, htmlFile)) fail(`${relativePath}: broken local link ${url}`);
  }
}

for (const file of walk(dist).filter(file => /\.(?:php|js|json|html)$/i.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(dist, file);
  const removedProvider = ['web3', 'forms'].join('');
  const removedKey = ['access', 'key'].join('_');
  if (content.toLowerCase().includes(removedProvider) || content.toLowerCase().includes(removedKey)) {
    fail(`${relativePath}: removed email transport remains`);
  }
  if (/Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i.test(content)) {
    fail(`${relativePath}: embedded Bearer token detected`);
  }
  if (/['"]token['"]\s*=>\s*['"][A-Za-z0-9._-]{20,}['"]/i.test(content)) {
    fail(`${relativePath}: embedded configuration token detected`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Verified ${products.length} products and ${categories.length} categories.`);
