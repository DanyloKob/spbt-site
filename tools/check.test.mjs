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

/* The two language twins, and the document language each one must declare.
   Written out rather than derived from the path: a third language added by
   copy-paste has to be listed here, which is the moment to check that its
   hreflang links and its sitemap entry came with it. */
const LANG_OF = { 'index.html': 'uk', 'en/index.html': 'en', '404.html': 'uk' };

/* The pages that carry the slide layout — one per language. 404.html is an
   ordinary short document and is deliberately not one of them. */
const SLIDE_PAGES = ['index.html', 'en/index.html'];

/* A page's public URL. `/en/index.html` is served as `/en/`, so the mapping
   cannot be a plain `${ORIGIN}/${page}` — that string is what canonical,
   og:url and the sitemap all have to agree on. */
function pageUrl(page) {
  if (page === 'index.html') return `${ORIGIN}/`;
  if (page.endsWith('/index.html')) return `${ORIGIN}/${page.slice(0, -'index.html'.length)}`;
  return `${ORIGIN}/${page}`;
}

const css = (name) => readFileSync(join(ROOT, 'assets/css', name), 'utf8');
const bundle = () => CSS_FILES.map(css).join('\n');

test('the site has the pages it is supposed to have', () => {
  assert.deepEqual(PAGES.sort(), ['404.html', 'en/index.html', 'index.html']);
});

test('every page declares charset, viewport, language and a title', () => {
  for (const page of PAGES) {
    const html = readHtml(page, ROOT);
    assert.match(html, /^<!doctype html>/i, `${page}: missing doctype`);
    const lang = LANG_OF[page];
    assert.ok(lang, `${page}: no expected document language recorded`);
    assert.match(html, new RegExp(`<html lang="${lang}"`), `${page}: missing lang="${lang}"`);
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
    const want = pageUrl(page);
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

test('the snap layout is scoped to the slide pages only', () => {
  assert.match(readHtml('index.html', ROOT), /<html lang="uk" class="slides">/);
  assert.match(readHtml('en/index.html', ROOT), /<html lang="en" class="slides">/);
  assert.ok(
    !readHtml('404.html', ROOT).includes('class="slides"'),
    '404.html must not inherit mandatory snapping',
  );
});

test('the project track has one snap anchor and one dot per panel', () => {
  for (const page of SLIDE_PAGES) {
    const html = readHtml(page, ROOT);
    const panels = countClass(html, 'pjslide');
    assert.ok(panels >= 2, `${page}: expected at least two panels, found ${panels}`);
    assert.equal(countClass(html, 'pjtrack__anchor'), panels, `${page}: anchor count must match panels`);
    const dots = html.match(/<div class="pjtrack__dots"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(dots, `${page}: the track has no dots container`);
    assert.equal((dots[1].match(/<span/g) ?? []).length, panels, `${page}: dot count must match panels`);
  }
});

/* ─── The two language twins ────────────────────────────────────────────────
   Everything below guards the pair, not a page. The failure these catch is
   always the same shape: one twin is edited, the other is not, and nothing
   visibly breaks — the pages simply stop being the same page in two
   languages, which is what every hreflang annotation on them claims. */

test('both language twins annotate the whole set with hreflang', () => {
  for (const page of SLIDE_PAGES) {
    const html = readHtml(page, ROOT);
    assert.ok(html.includes(`rel="canonical" href="${pageUrl(page)}"`), `${page}: canonical must be ${pageUrl(page)}`);
    assert.match(html, /hreflang="uk" href="https:\/\/spbt\.pp\.ua\/"/, `${page}: uk alternate`);
    assert.match(html, /hreflang="en" href="https:\/\/spbt\.pp\.ua\/en\/"/, `${page}: en alternate`);
    /* x-default is the Ukrainian page: it is what a visitor with no matching
       language gets, and what the router below falls back to. */
    assert.match(html, /hreflang="x-default" href="https:\/\/spbt\.pp\.ua\/"/, `${page}: x-default alternate`);
  }
});

test('both twins carry the same anchors, so either can be linked to', () => {
  const uk = ids(readHtml('index.html', ROOT));
  const en = ids(readHtml('en/index.html', ROOT));
  assert.deepEqual(en, uk, 'the English page must carry exactly the Ukrainian ids');
});

test('the language capsule offers both languages and marks the current one', () => {
  for (const page of SLIDE_PAGES) {
    const html = readHtml(page, ROOT);
    const capsule = /<div class="lang[^"]*"[\s\S]*?<\/div>/.exec(html);
    assert.ok(capsule, `${page}: no language capsule in the bar`);
    const markup = capsule[0];
    assert.match(markup, /href="\/" data-lang="uk"/, `${page}: no link to the Ukrainian page`);
    assert.match(markup, /href="\/en\/" data-lang="en"/, `${page}: no link to the English page`);
    /* `.lang--en` is what slides the pill indicator across; without it the
       English page highlights UA while showing English. */
    const wantsSlide = LANG_OF[page] === 'en';
    assert.equal(markup.includes('lang--en'), wantsSlide, `${page}: pill indicator on the wrong option`);
    assert.equal((markup.match(/is-on/g) ?? []).length, 1, `${page}: exactly one option is current`);
  }
});

/* The router is a redirect, and a redirect that runs on both twins is an
   infinite loop. It belongs to the Ukrainian page alone — /en/ is a URL people
   share, and it has to open in English on a Ukrainian browser. */
test('only the Ukrainian page redirects, and it remembers an explicit choice', () => {
  const uk = readHtml('index.html', ROOT);
  assert.match(uk, /location\.replace\('\/en\/'/, 'index.html: no language routing');
  assert.match(uk, /localStorage/, 'index.html: the choice is not remembered');
  assert.ok(
    !readHtml('en/index.html', ROOT).includes('location.replace'),
    'en/index.html must never redirect: it is the page that shared links point at',
  );
  /* Inline in the head, not in the deferred module: site.js is type="module",
     so a redirect from there would paint the wrong language first. */
  assert.ok(
    !readSource('assets/js/site.js', ROOT).includes('spbt-lang'),
    'language routing must stay inline in the head, not move into the deferred module',
  );
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
  const expected = indexable.map(pageUrl);
  assert.deepEqual(locs.sort(), expected.sort());

  /* A sitemap that lists both languages but annotates neither is worse than
     one that lists only the apex: it invites the crawler to treat the twins as
     two competing pages. Every <url> block carries the full alternate set. */
  const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.equal(blocks.length, expected.length, 'sitemap block count');
  for (const block of blocks) {
    for (const hl of ['uk', 'en', 'x-default']) {
      assert.ok(block.includes(`hreflang="${hl}"`), `sitemap: a <url> block is missing hreflang="${hl}"`);
    }
  }
});

test('the canonical URL of the Ukrainian page is the apex origin', () => {
  assert.ok(readHtml('index.html', ROOT).includes(`rel="canonical" href="${ORIGIN}/"`));
});
