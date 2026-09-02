import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const robots = readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
const sitemap = readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const ogImage = readFileSync(path.join(root, 'public/og-image.png'));

const TITLE = '三聯式統一發票試算｜手開發票含稅未稅與 5% 營業稅計算';
const CANONICAL = 'https://invoice.ii-wa.com/';
const OG_IMAGE = 'https://invoice.ii-wa.com/og-image.png';

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function metaTags(htmlSource) {
  return [...htmlSource.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
}

function metaBy(htmlSource, key) {
  return metaTags(htmlSource).filter((tag) => attr(tag, 'name') === key || attr(tag, 'property') === key);
}

function metaContent(htmlSource, key) {
  const tags = metaBy(htmlSource, key);
  assert.equal(tags.length, 1, `expected one meta ${key}`);
  const content = attr(tags[0], 'content');
  assert.ok(content, `meta ${key} should have content`);
  return content;
}

function visibleBody(htmlSource) {
  const body = htmlSource.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
}

function collectIds(value, ids = new Set()) {
  if (!value || typeof value !== 'object') return ids;
  if (typeof value['@id'] === 'string') ids.add(value['@id']);
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) item.forEach((entry) => collectIds(entry, ids));
    else collectIds(item, ids);
  }
  return ids;
}

test('單一 title、h1 與 canonical', () => {
  assert.equal([...html.matchAll(/<title>/g)].length, 1);
  assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1);
  assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
  assert.match(html, /<title>三聯式統一發票試算｜手開發票含稅未稅與 5% 營業稅計算<\/title>/);
  assert.match(html, /<h1>三聯式統一發票試算<\/h1>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/invoice\.ii-wa\.com\/" \/>/);
});

test('title 為核准字串，description 與 robots 齊備且無 keywords', () => {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  assert.equal(title, TITLE);
  const description = metaContent(html, 'description');
  assert.ok(description.trim().length > 0);
  assert.equal(
    metaContent(html, 'robots'),
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  );
  assert.equal(metaBy(html, 'keywords').length, 0);
});

test('Open Graph 與 Twitter 卡片一致', () => {
  const description = metaContent(html, 'description');
  assert.equal(metaContent(html, 'og:type'), 'website');
  assert.equal(metaContent(html, 'og:locale'), 'zh_TW');
  assert.equal(metaContent(html, 'og:url'), CANONICAL);
  assert.equal(metaContent(html, 'og:title'), TITLE);
  assert.equal(metaContent(html, 'og:description'), description);
  assert.equal(metaContent(html, 'og:image'), OG_IMAGE);
  assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent(html, 'twitter:title'), TITLE);
  assert.equal(metaContent(html, 'twitter:description'), description);
  assert.equal(metaContent(html, 'twitter:image'), OG_IMAGE);
});

test('JSON-LD 為互連的 WebSite、WebPage、WebApplication，且無 FAQ／評分', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const data = JSON.parse(blocks[0][1]);
  assert.ok(Array.isArray(data['@graph']));
  const types = data['@graph'].map((node) => node['@type']);
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('WebPage'));
  assert.ok(types.includes('WebApplication'));
  assert.ok(!types.includes('FAQPage'));

  const byId = Object.fromEntries(data['@graph'].map((node) => [node['@id'], node]));
  const website = byId['https://invoice.ii-wa.com/#website'];
  const webpage = byId['https://invoice.ii-wa.com/#webpage'];
  const app = byId['https://invoice.ii-wa.com/#app'];
  assert.ok(website);
  assert.ok(webpage);
  assert.ok(app);
  assert.equal(website.inLanguage, 'zh-Hant-TW');
  assert.equal(webpage.inLanguage, 'zh-Hant-TW');
  assert.equal(app.inLanguage, 'zh-Hant-TW');
  assert.equal(webpage.isPartOf['@id'], 'https://invoice.ii-wa.com/#website');
  assert.equal(webpage.mainEntity['@id'], 'https://invoice.ii-wa.com/#app');
  assert.equal(website.mainEntity['@id'], 'https://invoice.ii-wa.com/#webpage');

  const refs = collectIds(data);
  assert.ok(refs.has('https://invoice.ii-wa.com/#website'));
  assert.ok(refs.has('https://invoice.ii-wa.com/#webpage'));
  assert.ok(refs.has('https://invoice.ii-wa.com/#app'));

  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /aggregateRating/);
  assert.doesNotMatch(serialized, /"@type"\s*:\s*"Review"/);
  assert.doesNotMatch(serialized, /"review"\s*:/);
});

test('可見內文含稅額關鍵字，且核心公式不只藏在關閉的 FAQ', () => {
  const visible = visibleBody(html);
  for (const token of ['含稅', '未稅', '中文大寫', '統編', '非正式']) {
    assert.match(visible, new RegExp(token));
  }
  assert.match(visible, /(?:×\s*)?5\s*÷\s*105/);

  const openFormula = /<details\s+open\b[\s\S]*?(?:×\s*)?5\s*÷\s*105/.test(html);
  const rulesFormula = /5%\s*營業稅計算規則[\s\S]*?(?:×\s*)?5\s*÷\s*105/.test(html);
  assert.ok(openFormula || rulesFormula, 'formula should stay visible outside closed details');
});

test('robots.txt 允許收錄並指向 sitemap', () => {
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Allow:\s*\//);
  assert.match(robots, /Sitemap:\s*https:\/\/invoice\.ii-wa\.com\/sitemap\.xml/);
});

test('sitemap 只列正式首頁，不含 priority／changefreq／lastmod', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locs, [CANONICAL]);
  assert.doesNotMatch(sitemap, /priority|changefreq|lastmod/i);
});

test('OG 圖 IHDR 為 1200×630', () => {
  assert.equal(ogImage.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(ogImage.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(ogImage.readUInt32BE(16), 1200);
  assert.equal(ogImage.readUInt32BE(20), 630);
});
