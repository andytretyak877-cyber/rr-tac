const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return [target];
  });
}

const sendPhp = read('assets/php/send.php');
const sendHash = crypto.createHash('sha256').update(sendPhp).digest('hex');
check(sendHash === '6cab14049cee755490752ebf68d0027af43eef6835fa3c71de65e9fbf5bccda5', 'Roistat send.php changed from the approved baseline');

const mainJs = read('assets/js/main.js');
check(/Promise\.allSettled\(\[\s*sendLeadToEmail\(new FormData\(form\)\),\s*sendLeadToRoistat\(new FormData\(form\)\)\s*\]\)/.test(mainJs), 'Lead transport order must remain email first, Roistat second');
check(/Promise\.allSettled\(\[\s*sendOrderToBackend\(form, items\),\s*sendLeadToRoistat\(roistatData\)\s*\]\)/.test(mainJs), 'Order transport order must remain backend first, Roistat second');
check(mainJs.includes("email: form.elements.email?.value || ''"), 'Order JSON does not include email');
check(mainJs.includes("const roistatData = new FormData(form);\n  roistatData.delete('email');"), 'Order email must be removed from the Roistat FormData copy');
check(/<input[^>]*type="email"[^>]*id="orderEmail"[^>]*name="email"[^>]*disabled/.test(mainJs), 'One-click email input must start disabled for ordinary leads');
check(mainJs.includes('emailInput.disabled = !productId;') && mainJs.includes('emailInput.required = Boolean(productId);'), 'One-click email must only be required in product order mode');
check(mainJs.includes("const LEAD_GOAL = 'qleads'"), 'Lead goal changed');
check((mainJs.match(/reachGoal/g) || []).length === 1, 'Lead goal must be sent exactly once');
check(mainJs.includes('if (!emailAccepted && !roistatAccepted)'), 'Lead success must require SMTP or Roistat');

const orderPhp = read('assets/php/order.php');
const mailAttempt = orderPhp.indexOf('$managerMailSent = rr_send_manager_order_email');
const orderSuccess = orderPhp.indexOf('if ($orderCreated)', mailAttempt);
check(mailAttempt !== -1 && orderSuccess > mailAttempt, 'Manager email must be attempted before the final MoySklad result');
check(orderPhp.includes("'success' => true,\n        'order_created' => true"), 'Confirmed MoySklad order success response changed');
check(!orderPhp.includes('if ($orderCreated || $managerMailSent)'), 'SMTP success must not replace a confirmed MoySklad order');
check(orderPhp.includes('. "Email: " . ($order[\'email\'] ?? \'\') . "\\n\\n"'), 'Manager order email does not contain customer email');

const moyskladPhp = read('assets/php/moysklad.php');
check(moyskladPhp.includes('createIndividualCounterparty(string $name, string $phone, string $email)'), 'MoySklad counterparty method does not accept email');
check(moyskladPhp.includes("'email' => $email"), 'MoySklad counterparty payload does not contain email');

const cartHtml = read('cart.html');
check(/<input[^>]*type="email"[^>]*id="cartEmail"[^>]*name="email"[^>]*required/.test(cartHtml), 'Cart email must be required');

const forbiddenProvider = ['web3', 'forms'].join('');
const forbiddenKey = ['access', 'key'].join('_');
const scanRoots = ['assets', 'config', 'dist'];
const scanFiles = scanRoots.flatMap(relativePath => {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? walk(target) : [];
}).concat([
  path.join(root, 'cart.html'),
  path.join(root, 'contacts.html'),
  path.join(root, 'PROJECT_CONTEXT.md'),
]);

for (const file of scanFiles) {
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString('utf8').toLowerCase();
  check(!text.includes(forbiddenProvider), `${path.relative(root, file)}: removed email provider remains`);
  check(!text.includes(forbiddenKey), `${path.relative(root, file)}: removed form key remains`);
}

check(fs.existsSync(path.join(root, 'assets/php/mail.php')), 'SMTP endpoint is missing');
check(fs.existsSync(path.join(root, 'assets/php/vendor/phpmailer/src/PHPMailer.php')), 'PHPMailer is missing');
check(!fs.existsSync(path.join(root, 'dist/config/mail.php')), 'Real SMTP configuration must not enter dist');

console.log('SMTP/Roistat/MoySklad integration contract tests passed.');
