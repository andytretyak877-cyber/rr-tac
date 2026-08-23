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
if ((mainJs.match(/reachGoal/g) || []).length !== 1 || !mainJs.includes("const LEAD_GOAL = 'qleads'")) {
  fail('assets/js/main.js: lead goal must be declared and sent exactly once');
}
const roistatKey = sendPhp.match(/define\('ROISTAT_INTEGRATION_KEY',\s*'([^']+)'\)/)?.[1];
if (!roistatKey) {
  fail('assets/php/send.php: Roistat integration key is missing');
} else if (mainJs.includes(roistatKey)) {
  fail('assets/js/main.js: Roistat integration key must not be exposed to browsers');
}
if (!sendPhp.includes('ROISTAT_INTEGRATION_KEY') || /test\.txt|file_put_contents/.test(sendPhp)) {
  fail('assets/php/send.php: unsafe or incomplete Roistat handler');
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

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Verified ${products.length} products and ${categories.length} categories.`);
