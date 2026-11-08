/**
 * REG.RU server update. Keep this script and source files outside the web root.
 * Run as www-root:
 *   node /var/www/www-root/data/app/rr-tac/update-reg-ru.js
 * By default rebuilds the saved products.json without fetching the feed.
 * To deliberately synchronize the feed first, add --sync.
 * Explicitly skip feed synchronization: add --no-sync.
 * Build/verify without publication: add --check.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_ROOT = '/var/www/www-root/data/app/rr-tac';
const DEFAULT_LIVE = '/var/www/www-root/data/www/rr-tac.ru';
const SERVICE_FILES = new Set([
  'update-site.js', 'sync-products.js', 'csv-to-json.js',
  'generate-site.js', 'verify-build.js',
]);
const PUBLIC_FILES = new Set([
  'assets', 'about', 'cart', 'catalog', 'contacts', 'delivery',
  'payment', 'privacy', 'offer', 'product', 'index.html', 'favicon.ico',
  'robots.txt', 'sitemap.xml',
]);

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function plainDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected a real directory: ${directory}`);
  if (path.resolve(fs.realpathSync(directory)) !== path.resolve(directory)) {
    throw new Error(`Directory has a symlinked parent: ${directory}`);
  }
}

function validateTree(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error('Refusing to publish a symbolic link');
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) {
      if (name.startsWith('.') || name.toLowerCase() === 'config') {
        throw new Error('Refusing to publish hidden files or a configuration directory');
      }
      validateTree(path.join(target, name));
    }
  } else if (!stat.isFile()) {
    throw new Error('Refusing to publish a special filesystem object');
  }
}

function publicPermissions(target) {
  const stat = fs.lstatSync(target);
  fs.chmodSync(target, stat.isDirectory() ? 0o755 : 0o644);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) publicPermissions(path.join(target, name));
  }
}

function publish(root, live) {
  root = path.resolve(root);
  live = path.resolve(live);
  plainDirectory(root);
  plainDirectory(live);
  if (inside(root, live) || inside(live, root)) throw new Error('Source and public directories must be separate');
  const dist = path.join(root, 'dist');
  plainDirectory(dist);
  const names = fs.readdirSync(dist);
  for (const name of names) {
    if (!PUBLIC_FILES.has(name) && !SERVICE_FILES.has(name)) {
      throw new Error(`Unexpected build entry: ${name}`);
    }
    if (PUBLIC_FILES.has(name)) validateTree(path.join(dist, name));
  }
  if (!fs.statSync(path.join(dist, 'index.html')).isFile()) throw new Error('Build has no index.html');
  if (!fs.statSync(path.join(live, '.htaccess')).isFile() || fs.lstatSync(path.join(live, '.htaccess')).isSymbolicLink()) {
    throw new Error('Live .htaccess must exist as a regular file');
  }

  const suffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const staging = path.join(path.dirname(live), `.${path.basename(live)}.next-${suffix}`);
  const backups = path.join(root, '.published-backups');
  fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
  plainDirectory(backups);
  fs.chmodSync(backups, 0o700);
  const backup = path.join(backups, suffix);
  fs.mkdirSync(staging, { mode: 0o755 });

  // All potentially slow copying finishes before the live directory is moved.
  for (const name of names) {
    if (PUBLIC_FILES.has(name)) {
      fs.cpSync(path.join(dist, name), path.join(staging, name), { recursive: true, errorOnExist: true, force: false });
    }
  }
  fs.copyFileSync(path.join(live, '.htaccess'), path.join(staging, '.htaccess'));
  const wellKnown = path.join(live, '.well-known');
  if (fs.existsSync(wellKnown)) {
    validateTree(wellKnown);
    fs.cpSync(wellKnown, path.join(staging, '.well-known'), { recursive: true });
  }
  publicPermissions(staging);
  if (fs.statSync(live).dev !== fs.statSync(backups).dev || fs.statSync(live).dev !== fs.statSync(staging).dev) {
    throw new Error('Live, staging and backup must be on the same filesystem');
  }

  // Two renames with rollback; this is not a single atomic directory exchange.
  fs.renameSync(live, backup);
  try {
    fs.renameSync(staging, live);
  } catch (error) {
    fs.renameSync(backup, live);
    throw error;
  }
  console.log(`Published: ${live}`);
  console.log(`Previous publication retained privately: ${backup}`);
  return backup;
}

function run(root, script, args = []) {
  console.log(`> node ${script}`);
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root, env: process.env, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed; public files have not been changed`);
}

function main(args = process.argv.slice(2)) {
  for (const arg of args) {
    if (!['--no-sync', '--sync', '--check'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.includes('--sync') && args.includes('--no-sync')) throw new Error('Choose either --sync or --no-sync');
  if (process.platform !== 'win32' && process.getuid && process.getuid() === 0) {
    throw new Error('Run this updater as www-root to preserve file ownership');
  }
  const root = path.resolve(process.env.RR_TAC_SOURCE_DIR || DEFAULT_ROOT);
  const live = path.resolve(process.env.RR_TAC_PUBLISH_DIR || DEFAULT_LIVE);
  plainDirectory(root);
  plainDirectory(live);
  if (inside(root, live) || inside(live, root)) throw new Error('Source and public directories must be separate');
  const lock = path.join(root, '.update-reg-ru.lock');
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Update lock exists; check for a running update before removing it');
    throw error;
  }
  fs.writeFileSync(lockFd, `${process.pid}\n`);
  try {
    if (args.includes('--sync')) {
      run(root, 'sync-products.js', process.env.FEED_FILE ? ['--file', process.env.FEED_FILE] : []);
    } else console.log('Feed synchronization skipped; using saved products.json');
    run(root, 'generate-site.js');
    run(root, 'verify-build.js');
    if (args.includes('--check')) console.log('Build verified; publication skipped (--check)');
    else publish(root, live);
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`REG.RU UPDATE FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, publish };
