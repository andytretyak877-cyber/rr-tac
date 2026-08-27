/**
 * One-command manual catalog update for the Ubuntu server.
 *
 * Run as root from the project directory:
 *   node update-site.js
 *
 * Optional custom Nginx directory:
 *   PUBLISH_DIR=/some/path node update-site.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const PUBLISH_DIR = process.env.PUBLISH_DIR || '/var/www/html';

function run(script, args = []) {
  console.log(`\n> node ${script} ${args.join(' ')}`.trim());
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} stopped with exit code ${result.status}`);
  }
}

function main() {
  if (process.platform === 'win32' && !process.env.PUBLISH_DIR) {
    throw new Error('This publishing command is intended for Ubuntu. Set PUBLISH_DIR explicitly for a test.');
  }

  const syncArgs = process.env.FEED_FILE ? ['--file', process.env.FEED_FILE] : [];
  run('sync-products.js', syncArgs);
  run('generate-site.js');
  run('verify-build.js');

  const forbiddenConfigs = ['moysklad.php', 'mail.php'].map(file => path.join(DIST, 'config', file));
  if (forbiddenConfigs.some(file => fs.existsSync(file))) {
    throw new Error('Refusing to publish: server configuration was found in dist');
  }

  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  for (const entry of fs.readdirSync(DIST)) {
    fs.cpSync(path.join(DIST, entry), path.join(PUBLISH_DIR, entry), {
      recursive: true,
      force: true,
    });
  }

  console.log(`\nSite updated successfully: ${PUBLISH_DIR}`);
}

try {
  main();
} catch (error) {
  console.error(`\nUPDATE FAILED: ${error.message}`);
  console.error('The live site was not replaced unless all checks completed successfully.');
  process.exit(1);
}
