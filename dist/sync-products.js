/**
 * Safe incremental synchronization of the static catalog with a Bitrix CSV feed.
 *
 * Feed presence is the availability signal:
 * - present in a valid feed => inStock: true;
 * - missing from a valid feed => retained in the catalog with inStock: false;
 * - new id => appended to the catalog.
 *
 * Usage:
 *   BITRIX_CSV_URL="https://..." node sync-products.js
 *   node sync-products.js --file products_with_descr_images.csv
 *   node sync-products.js --file feed.csv --dry-run
 *   node sync-products.js --file feed.csv --allow-large-drop
 *   node sync-products.js --file feed.csv --refresh-images
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const {
  download,
  makeFeatures,
  makeWholesale,
  parseCSV,
  translit,
} = require('./csv-to-json');

const ROOT = __dirname;
const PRODUCTS_PATH = path.join(ROOT, 'assets/data/products.json');
const IMAGE_DIR = path.join(ROOT, 'assets/img/products');
const BACKUP_DIR = path.join(ROOT, 'backups');
const DEFAULT_LOCAL_FEED = path.join(ROOT, 'products_with_descr_images.csv');
const DEFAULT_FEED_URL = 'https://bready.ru/upload/export_321786247.csv';
const MIN_FEED_PRODUCTS = Number(process.env.MIN_FEED_PRODUCTS || 1);
const MAX_MISSING_RATIO = Number(process.env.MAX_MISSING_RATIO || 0.5);

function parseArgs(argv) {
  const options = {
    allowLargeDrop: false,
    dryRun: false,
    refreshImages: false,
    file: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-large-drop') options.allowLargeDrop = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--refresh-images') options.refreshImages = true;
    else if (arg === '--file') options.file = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, {
      headers: {
        Accept: 'text/csv,text/plain,*/*',
        'User-Agent': 'RR-TAC catalog sync/1.0',
      },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!redirectsLeft || !response.headers.location) {
          reject(new Error('Too many feed redirects'));
          return;
        }
        const redirected = new URL(response.headers.location, url).toString();
        fetchText(redirected, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Feed returned HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 50 * 1024 * 1024) {
          request.destroy(new Error('Feed is larger than 50 MB'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });

    request.setTimeout(30000, () => request.destroy(new Error('Feed download timeout')));
    request.on('error', reject);
  });
}

function cleanCategory(value) {
  let name = String(value || '').replace(/Rhino Rescue\s*/gi, '').trim();
  if (!name) name = 'Разное';
  if (name === 'Аптечки') name = 'Аптечки тактические';
  return name;
}

function cleanDescription(value) {
  return String(value || '')
    .trim()
    .replace(/^\s*<h2>[^<]*<\/h2>\s*/i, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/\b(href|src)\s*=\s*(["'])\/upload\//gi, '$1=$2https://bready.ru/upload/')
    .replace(/\b(href|src)\s*=\s*\/upload\//gi, '$1=https://bready.ru/upload/')
    .trim();
}

function parsePrice(value) {
  const normalized = String(value || '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  return Number(normalized);
}

function imageInfo(url, id, suffix = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return null;
  let extension = 'jpg';
  try {
    extension = path.extname(new URL(cleanUrl).pathname).slice(1).toLowerCase() || 'jpg';
  } catch {
    return null;
  }
  if (!/^(?:jpe?g|png|webp|gif)$/i.test(extension)) extension = 'jpg';
  const filename = `rr-${id}${suffix}.${extension}`;
  return {
    remote: cleanUrl,
    publicPath: `assets/img/products/${filename}`,
    destination: path.join(IMAGE_DIR, filename),
  };
}

async function syncImage(info, refresh) {
  if (!info) return false;
  if (!refresh && fs.existsSync(info.destination)) return true;
  const temporary = `${info.destination}.download`;
  try {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    await download(info.remote, temporary);
    fs.renameSync(temporary, info.destination);
    return true;
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    console.warn(`  Image skipped: ${error.message}`);
    return fs.existsSync(info.destination);
  }
}

function validateRows(rows, previousProducts, allowLargeDrop) {
  if (rows.length < MIN_FEED_PRODUCTS) {
    throw new Error(`Feed contains ${rows.length} products; minimum is ${MIN_FEED_PRODUCTS}`);
  }

  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (!row.id || !row.name || !row.price) {
      throw new Error(`Row ${rowNumber}: id, name and price are required`);
    }
    if (ids.has(row.id)) throw new Error(`Row ${rowNumber}: duplicate id ${row.id}`);
    ids.add(row.id);
    const price = parsePrice(row.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Row ${rowNumber}: invalid price for id ${row.id}`);
    }
  }

  const feedIds = new Set(rows.map(row => `rr-${String(row.id).trim()}`));
  const previouslyAvailable = previousProducts.filter(product => product.inStock);
  if (!allowLargeDrop && previouslyAvailable.length > 0) {
    const missingKnown = previouslyAvailable.filter(product => !feedIds.has(product.id)).length;
    const missingRatio = missingKnown / previouslyAvailable.length;
    if (missingRatio > MAX_MISSING_RATIO) {
      throw new Error(
        `Feed is missing ${missingKnown} of ${previouslyAvailable.length} previously available products ` +
        `(${Math.round(missingRatio * 100)}%). Use --allow-large-drop only after checking the feed.`
      );
    }
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function productFromRow(row, previous, options) {
  const id = String(row.id).trim();
  const categoryName = cleanCategory(row.category);
  const category = translit(categoryName) || 'raznoe';
  const name = String(row.name).replace(/\s+/g, ' ').trim();
  const priceRetail = parsePrice(row.price);
  const mainImage = imageInfo(row.image, id);

  let image = previous?.image || '';
  if (mainImage) {
    const available = options.dryRun || await syncImage(mainImage, options.refreshImages);
    if (available) image = mainImage.publicPath;
  }
  if (!image) throw new Error(`Product ${id} has no usable main image`);

  const extraImages = [];
  const imageUrls = String(row.images || '').split(';').map(value => value.trim()).filter(Boolean);
  for (let index = 0; index < imageUrls.length; index += 1) {
    const info = imageInfo(imageUrls[index], id, `-${index + 1}`);
    if (!info) continue;
    const available = options.dryRun || await syncImage(info, options.refreshImages);
    if (available) extraImages.push(info.publicPath);
  }

  return {
    id: `rr-${id}`,
    name,
    category,
    categoryName,
    image,
    images: extraImages.length ? extraImages : (previous?.images || []),
    description: String(row.description || '').trim() || previous?.description || '',
    description_full: cleanDescription(row.description_full) || previous?.description_full || '',
    features: makeFeatures(name, category),
    priceRetail,
    priceWholesale: makeWholesale(priceRetail),
    sku: String(row.article || id).trim(),
    inStock: true,
    featured: previous?.featured || false,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(PRODUCTS_PATH)) throw new Error(`Missing ${PRODUCTS_PATH}`);
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const previousProducts = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
  const feedUrl = process.env.BITRIX_CSV_URL || DEFAULT_FEED_URL;
  const localFeed = options.file ? path.resolve(options.file) : DEFAULT_LOCAL_FEED;
  let csv;

  if (feedUrl && !options.file) {
    console.log(`Downloading feed from ${new URL(feedUrl).origin} ...`);
    csv = await fetchText(feedUrl);
  } else {
    if (!fs.existsSync(localFeed)) {
      throw new Error('Set BITRIX_CSV_URL or pass --file path/to/feed.csv');
    }
    console.log(`Reading feed: ${localFeed}`);
    csv = fs.readFileSync(localFeed, 'utf8');
  }

  const rows = parseCSV(csv.replace(/^\uFEFF/, ''));
  validateRows(rows, previousProducts, options.allowLargeDrop);

  const previousById = new Map(previousProducts.map(product => [product.id, product]));
  const nextById = new Map(previousProducts.map(product => [product.id, { ...product, inStock: false }]));
  let added = 0;
  let updated = 0;
  const addedIds = [];
  const reactivatedIds = [];
  const priceChanges = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const productId = `rr-${String(row.id).trim()}`;
    const previous = previousById.get(productId);
    process.stdout.write(`[${index + 1}/${rows.length}] ${productId} `);
    const product = await productFromRow(row, previous, options);
    nextById.set(productId, product);
    if (previous) {
      updated += 1;
      if (!previous.inStock) reactivatedIds.push(productId);
      if (Number(previous.priceRetail) !== Number(product.priceRetail)) {
        priceChanges.push({ id: productId, from: previous.priceRetail, to: product.priceRetail });
      }
      console.log('updated');
    } else {
      added += 1;
      addedIds.push(productId);
      console.log('added');
    }
  }

  const nextProducts = [...nextById.values()];
  const preorder = nextProducts.filter(product => !product.inStock).length;
  const becamePreorderIds = previousProducts
    .filter(product => product.inStock && !nextById.get(product.id)?.inStock)
    .map(product => product.id);
  const report = {
    feed: rows.length,
    total: nextProducts.length,
    updated,
    added,
    preorder,
    addedIds,
    becamePreorderIds,
    reactivatedIds,
    priceChanges,
  };

  if (options.dryRun) {
    console.log('\nDRY RUN: products.json was not changed.');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `products-${timestamp()}.json`);
  fs.copyFileSync(PRODUCTS_PATH, backupPath);
  const temporary = `${PRODUCTS_PATH}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(nextProducts, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(temporary, 'utf8'));
  fs.renameSync(temporary, PRODUCTS_PATH);

  console.log('\nSynchronization complete.');
  console.log(JSON.stringify(report, null, 2));
  console.log(`Backup: ${backupPath}`);
}

module.exports = {
  cleanCategory,
  cleanDescription,
  imageInfo,
  parsePrice,
  productFromRow,
  validateRows,
};

if (require.main === module) {
  main().catch(error => {
    console.error(`SYNC FAILED: ${error.message}`);
    process.exit(1);
  });
}
