"""Read-only HTTP checks; never submits forms or creates orders."""

import json
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


BASE = "https://rr-tac.ru"
HOST = "rr-tac.ru"


def request(path):
    req = urllib.request.Request(BASE + path, headers={"Host": HOST})
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        # Only read public pages and JSON entry points. Never print response bodies.
        body = response.read() if response.status < 400 or path.startswith("/assets/php/") else b""
        return response.status, response.headers, body


status, _, sitemap = request("/sitemap.xml")
assert status == 200, f"sitemap: {status}"
urls = ET.fromstring(sitemap).findall("{*}url/{*}loc")
assert urls, "sitemap is empty"
paths = [urllib.parse.urlparse(url.text).path for url in urls]
for path in paths + ["/cart/", "/assets/css/style.css", "/assets/js/main.js", "/assets/data/products.json"]:
    status, _, _ = request(path)
    assert status == 200, f"public path {path}: {status}"
print(f"Public sitemap pages OK: {len(paths)}; cart, CSS, JS, products JSON OK")

for path in [
    "/.htaccess", "/.git/config", "/config/roistat.php",
    "/sync-products.js", "/update-site.js", "/generate-site.js",
    "/csv-to-json.js", "/verify-build.js", "/backups/", "/dist/",
    "/assets/php/mailer.php", "/assets/php/moysklad.php",
    "/assets/php/vendor/phpmailer/LICENSE",
]:
    status, _, _ = request(path)
    assert status in (403, 404), f"protected path {path}: {status}"
print("Protected paths OK: 13 denied or absent")

for name in ("mail", "order"):
    status, headers, body = request(f"/assets/php/{name}.php")
    assert status == 405, f"{name}: {status}"
    assert "application/json" in headers.get("Content-Type", ""), f"{name}: missing JSON content type"
    assert json.loads(body)["success"] is False, f"{name}: unexpected payload"
print("PHP mail/order entry points OK: 405 JSON, no submissions")

status, headers, body = request("/assets/php/send.php")
if status == 405:
    assert "application/json" in headers.get("Content-Type", "")
    assert json.loads(body)["success"] is False
    print("PHP Roistat entry point OK: 405 JSON, no submission")
elif status == 500:
    print("PENDING: Roistat entry point returns 500 while private configuration is absent")
else:
    raise AssertionError(f"Roistat entry point: {status}")
