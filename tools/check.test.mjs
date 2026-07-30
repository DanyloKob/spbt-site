/**
 * Zero-dependency guard rails for spbt.pp.ua. Run with:
 *   node --test tools/check.test.mjs
 *
 * Each test encodes a decision that was expensive to make or easy to undo by
 * accident — the closed palette, self-hosted fonts, the unlaunched lyceum site
 * that must not be linked, and the fact that the horizontal track's snap
 * anchors have to stay in step with its panels.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_HOSTS, PALETTE, htmlFiles, readHtml, localRefs, externalRefs,
  hashRefs, ids, cssDeclaredVars, cssUsedVars, hexLiterals, countClass,
  sourceFiles, readSource, urlsIn,
} from './check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = htmlFiles(ROOT);
const CSS_FILES = ['base.css', 'layout.css', 'components.css', 'spbt.css'];
const ORIGIN = 'https://spbt.pp.ua';

const css = (name) => readFileSync(join(ROOT, 'assets/css', name), 'utf8');
const bundle = () => CSS_FILES.map(css).join('\n');

test('the site has the pages it is supposed to have', () => {
  assert.deepEqual(PAGES.sort(), ['404.html', 'index.html']);
});

test('every page declares charset, viewport, language and a title', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    assert.match(html, /^<!doctype html>/i, `${page}: missing doctype`);
    assert.match(html, /<html lang="uk"/, `${page}: missing lang="uk"`);
    assert.match(html, /<meta charset="utf-8">/, `${page}: missing charset`);
    assert.match(html, /name="viewport"/, `${page}: missing viewport`);
    assert.match(html, /<title>[^<]+<\/title>/, `${page}: missing title`);
    assert.match(html, /name="description" content="[^"]{40,}"/, `${page}: thin description`);
    // Present-tense assertions, not a loop over whatever happens to be there:
    // a head that loses its preview tags must fail, not pass quietly.
    assert.match(html, /property="og:image" content="[^"]+"/, `${page}: no og:image`);
    assert.match(html, /name="twitter:image" content="[^"]+"/, `${page}: no twitter:image`);
    assert.match(html, /name="twitter:card"/, `${page}: no twitter:card`);
    assert.match(html, /rel="icon"/, `${page}: no favicon`);
  }
});

/* The identity tags are the ones a copy-paste from the portfolio silently
   breaks: taiyo.is-a.dev is an allowed host and og:url is not the canonical
   tag, so a stale value passed every other check while every shared link
   unfurled as somebody else's site. */
test('the page identifies itself as SPBT, not as the portfolio', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    const want = page === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${page}`;
    assert.equal(/property="og:url" content="([^"]+)"/.exec(html)?.[1], want, `${page}: og:url`);
    assert.equal(/property="og:site_name" content="([^"]+)"/.exec(html)?.[1], 'SPBT', `${page}: og:site_name`);
    for (const m of html.matchAll(/(?:og|twitter):(?:image|url)" content="([^"]+)"/g)) {
      assert.ok(m[1].startsWith(`${ORIGIN}/`), `${page}: ${m[1]} points off-origin`);
    }
  }
});

/* Without this the page can be reduced to a nav bar and nothing else: 47
   elements are hidden by `.js [data-reveal]` and only the inline failsafe plus
   `.js-stalled` bring them back if the module never boots. */
test('a JS failure cannot blank the page', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    assert.match(html, /classList\.add\('js'\)/, `${page}: missing the inline js flag`);
    assert.match(html, /__spbtFailsafe/, `${page}: missing the reveal failsafe`);
  }
  const comp = css('components.css');
  assert.match(comp, /\.js \[data-reveal\]\{\s*opacity:0/, 'reveal must hide only under .js');
  assert.match(comp, /\.js-stalled \[data-reveal\]/, 'missing the .js-stalled escape hatch');
  const layout = css('layout.css');
  assert.match(layout, /body\.cursor-fx[\s\S]{0,80}cursor:none/, 'cursor:none must require .cursor-fx');
});

test('counters ship their final value in markup', () => {
  for (const page of PAGES) {
    for (const tag of readHtml(page, ROOT).match(/<dd data-counter="\d+">\d+<\/dd>/g) ?? []) {
      const [, attr, text] = /data-counter="(\d+)">(\d+)</.exec(tag);
      assert.equal(text, attr, `${page}: ${tag} must render ${attr} without JS`);
    }
  }
});

test('every page has exactly one h1', () => {
  for (const page of PAGES) {
    const count = [...readHtml(page, ROOT).matchAll(/<h1[\s>]/g)].length;
    assert.equal(count, 1, `${page}: found ${count} h1 elements`);
  }
});

test('every page loads all four stylesheets and the module', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    for (const name of CSS_FILES) {
      assert.ok(html.includes(`/assets/css/${name}`), `${page}: does not load ${name}`);
    }
    assert.ok(
      html.includes('type="module" src="/assets/js/site.js"'),
      `${page}: does not load site.js as a module`,
    );
  }
});

test('every root-absolute reference resolves to a file on disk', () => {
  for (const page of PAGES) {
    for (const ref of localRefs(readHtml(page, ROOT))) {
      const target = ref.endsWith('/') ? join(ROOT, ref, 'index.html') : join(ROOT, ref);
      assert.ok(existsSync(target), `${page}: dead reference ${ref}`);
    }
  }
});

test('every in-page anchor points at an element that exists', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    const known = new Set(ids(html));
    for (const hash of hashRefs(html)) {
      assert.ok(known.has(hash), `${page}: href="#${hash}" has no matching id`);
    }
  }
});

/* Over every shipped source file, not only the HTML. A url() in spbt.css or a
   window.open in site.js reaches the network just as surely as an href. */
test('every external host is on the allow list', () => {
  for (const page of PAGES) {
    for (const ref of externalRefs(readHtml(page, ROOT))) {
      const { host } = new URL(ref);
      assert.ok(ALLOWED_HOSTS.includes(host), `${page}: unexpected host ${host} (${ref})`);
    }
  }
  for (const file of sourceFiles(ROOT)) {
    for (const url of urlsIn(readSource(file, ROOT))) {
      const host = (() => { try { return new URL(url).host; } catch { return null; } })();
      if (!host) continue;
      assert.ok(ALLOWED_HOSTS.includes(host), `${file}: unexpected host ${host} (${url})`);
    }
  }
});

test('the unlaunched lyceum site is not linked anywhere', () => {
  for (const file of sourceFiles(ROOT)) {
    assert.ok(
      !readSource(file, ROOT).includes('ftl.if.ua'),
      `${file}: mentions ftl.if.ua, which is not launched yet`,
    );
  }
});

test('every new tab is opened with rel="noopener"', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    for (const tag of html.match(/<a\b[^>]*>/g) ?? []) {
      if (!tag.includes('target="_blank"')) continue;
      assert.match(tag, /rel="noopener"/, `${page}: ${tag}`);
    }
  }
});

test('social preview images exist on disk', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    for (const m of html.matchAll(/(?:og:image|twitter:image)" content="([^"]+)"/g)) {
      assert.ok(m[1].startsWith(`${ORIGIN}/`), `${page}: ${m[1]} is not on this origin`);
      const target = join(ROOT, m[1].slice(ORIGIN.length));
      assert.ok(existsSync(target), `${page}: preview image ${m[1]} does not exist`);
    }
  }
});

test('CSS uses only the closed palette', () => {
  const allowed = new Set(PALETTE.map((c) => c.toUpperCase()));
  for (const name of CSS_FILES) {
    for (const hex of hexLiterals(css(name))) {
      assert.ok(allowed.has(hex), `${name}: ${hex} is outside the palette`);
    }
  }
});

test('every custom property used in CSS is declared somewhere', () => {
  const all = bundle();
  const declared = new Set(cssDeclaredVars(all));
  for (const used of new Set(cssUsedVars(all))) {
    assert.ok(declared.has(used), `${used} is used but never declared`);
  }
});

test('fonts are self-hosted', () => {
  const all = bundle() + PAGES.map((p) => readHtml(p, ROOT)).join('\n');
  for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit']) {
    assert.ok(!all.includes(host), `${host} must not be referenced`);
  }
  const files = readdirSync(join(ROOT, 'assets/fonts'));
  assert.ok(files.length >= 14, `expected the full woff2 set, found ${files.length}`);
  assert.ok(files.every((f) => f.endsWith('.woff2')), 'only woff2 belongs in assets/fonts');
});

test('images stay inside their budget', () => {
  const dir = join(ROOT, 'assets/img');
  let total = 0;
  for (const name of readdirSync(dir)) {
    const bytes = statSync(join(dir, name)).size;
    total += bytes;
    assert.ok(bytes <= 300_000, `${name} is ${Math.round(bytes / 1024)}KB (cap 300KB)`);
  }
  assert.ok(total <= 800_000, `images total ${Math.round(total / 1024)}KB (cap 800KB)`);
});

test('the snap layout is scoped to the slide page only', () => {
  assert.match(readHtml('index.html', ROOT), /<html lang="uk" class="slides">/);
  assert.ok(
    !readHtml('404.html', ROOT).includes('class="slides"'),
    '404.html must not inherit mandatory snapping',
  );
});

test('the project track has one snap anchor and one dot per panel', () => {
  const html = readHtml('index.html', ROOT);
  const panels = countClass(html, 'pjslide');
  assert.ok(panels >= 2, `expected at least two panels, found ${panels}`);
  assert.equal(countClass(html, 'pjtrack__anchor'), panels, 'anchor count must match panels');
  const dots = html.match(/<div class="pjtrack__dots"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(dots, 'the track has no dots container');
  assert.equal((dots[1].match(/<span/g) ?? []).length, panels, 'dot count must match panels');
});

/* Byte-level, not `.trim()`. The committed CNAME really did start with a UTF-8
   BOM (EF BB BF), and the trimmed comparison passed anyway because U+FEFF
   counts as whitespace in ECMAScript — so the one test meant to guard the
   custom domain was blind to a corrupt custom domain. */
test('CNAME is exactly the domain, with no BOM', () => {
  assert.deepEqual(readFileSync(join(ROOT, 'CNAME')), Buffer.from('spbt.pp.ua\n', 'utf8'));
});

test('the crawler files agree with the pages that exist', () => {
  assert.ok(existsSync(join(ROOT, '.nojekyll')), '.nojekyll must exist for GitHub Pages');
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  assert.ok(robots.includes(`${ORIGIN}/sitemap.xml`), 'robots.txt must point at the sitemap');

  /* Inventory in both directions. Containment alone let a sitemap pasted from
     the portfolio advertise /en/, /tano/, /ftl/ and /decks/ — four URLs that
     return the 404 page here, one of them a path for the site that must not be
     promoted at all — while still passing. */
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const indexable = PAGES.filter((p) => !readHtml(p, ROOT).includes('name="robots" content="noindex"'));
  const expected = indexable.map((p) => (p === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${p}`));
  assert.deepEqual(locs.sort(), expected.sort());
});

test('the canonical URL is the apex origin', () => {
  assert.ok(readHtml('index.html', ROOT).includes(`rel="canonical" href="${ORIGIN}/"`));
});
