import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Hosts the site is allowed to point at. Anything else is a bug. */
export const ALLOWED_HOSTS = [
  'discord.com',
  't.me',
  'tano.pp.ua',
  'taiyo.is-a.dev',
  'spbt.pp.ua',
  /* ftl.if.ua is deliberately absent, exactly as on the portfolio. The lyceum
     site is not launched, so no page may link to it — the site is shown here as
     a blurred teaser and the only clickable target is the case study on
     taiyo.is-a.dev. Dropping the host makes that a rule the suite enforces
     instead of a decision a future edit can quietly undo. Add it on launch. */
  'www.w3.org',   /* only if an inline SVG ever needs an explicit xmlns */
];

/** The closed palette from the design spec — shared with the portfolio. */
export const PALETTE = [
  '#050807',
  '#07110C',
  '#E8F2EC',
  '#8FA398',
  '#57C75C',
  '#6EE787',
];

/** Не сторінки сайту: службові теки й чернетки. */
const SKIP = new Set(['.git', 'node_modules', 'docs', 'tools', 'scratch', '.superpowers']);

export function htmlFiles(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(root, full, out);
    else if (name.endsWith('.html')) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export function readHtml(file, root) {
  return readFileSync(join(root, file), 'utf8');
}

/** Every file that ships and could carry a URL: pages plus CSS and JS.
    Checking only the HTML was a real hole — a background-image in spbt.css or a
    window.open in site.js could point anywhere, including at the lyceum site
    that must not be linked yet, and the suite would have stayed green. */
export function sourceFiles(root) {
  const out = htmlFiles(root);
  for (const dir of ['assets/css', 'assets/js']) {
    for (const name of readdirSync(join(root, dir))) {
      if (/\.(css|js|mjs)$/.test(name)) out.push(`${dir}/${name}`);
    }
  }
  return out;
}

export function readSource(file, root) {
  return readFileSync(join(root, file), 'utf8');
}

/** Absolute http(s) URLs anywhere in a file, not just in href/src/content. */
export function urlsIn(text) {
  return [...text.matchAll(/https?:\/\/[^\s"'()<>,;]+/gi)].map((m) => m[0]);
}

const REF = /(?:href|src|content)\s*=\s*"([^"]+)"/g;

function refs(html) {
  return [...html.matchAll(REF)].map((m) => m[1]);
}

/** Root-absolute site paths, with hash and query stripped. */
export function localRefs(html) {
  return refs(html)
    .filter((r) => r.startsWith('/') && !r.startsWith('//'))
    .map((r) => r.split('#')[0].split('?')[0])
    .filter(Boolean);
}

export function externalRefs(html) {
  return refs(html).filter((r) => /^https?:\/\//i.test(r));
}

/** In-page anchors (`#id`), which must resolve to an element on the same page.
    Reads `href` alone, unlike the helpers above: `refs()` also collects
    `content`, and `<meta name="theme-color" content="#050807">` is a colour,
    not a link. */
export function hashRefs(html) {
  return [...html.matchAll(/href\s*=\s*"#([^"]+)"/g)].map((m) => m[1]);
}

export function ids(html) {
  return [...html.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
}

export function cssDeclaredVars(css) {
  return [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

export function cssUsedVars(css) {
  return [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
}

export function hexLiterals(css) {
  return [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toUpperCase());
}

/** How many times a class appears as a whole word in a class attribute. */
export function countClass(html, cls) {
  return [...html.matchAll(new RegExp(`class="[^"]*\\b${cls}\\b`, 'g'))].length;
}
