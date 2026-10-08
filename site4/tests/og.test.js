// Link previews: every page (not the redirect stubs) carries Open Graph + Twitter tags, and each preview
// image exists in img/og/ as a 1200x630 PNG -- the size LinkedIn, Discord and X show as a large card.
const fs = require('fs'), path = require('path');
const { check, SITE } = require('./cdp');
const ORIGIN = 'https://woundwort.xyz/';
const pages = fs.readdirSync(SITE).filter(f => f.endsWith('.html') && !/^manual-\d+\.html$/.test(f));
const meta = (html, attr, key) => { const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)); return m && m[1]; };
for (const pg of pages) {
  const html = fs.readFileSync(path.join(SITE, pg), 'utf8');
  const title = meta(html, 'property', 'og:title'), desc = meta(html, 'property', 'og:description');
  const img = meta(html, 'property', 'og:image'), url = meta(html, 'property', 'og:url');
  check(`${pg} has og:title and og:description`, !!title && !!desc && desc.length > 20, `${title} / ${desc}`);
  check(`${pg} has a meta description`, !!meta(html, 'name', 'description'));
  check(`${pg} og:url is its clean address`, url === ORIGIN + (pg === 'index.html' ? '' : pg.replace(/\.html$/, '')), url);
  check(`${pg} twitter:card is a large image`, meta(html, 'name', 'twitter:card') === 'summary_large_image');
  const local = img && img.startsWith(ORIGIN) && path.join(SITE, img.slice(ORIGIN.length));
  const ok = local && fs.existsSync(local);
  const png = ok && fs.readFileSync(local);
  check(`${pg} preview image is a 1200x630 PNG`, !!png && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, img);
}
