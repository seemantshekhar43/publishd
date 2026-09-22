#!/usr/bin/env node
/**
 * Link checker over the built site - see docs/PRD.md section 5 and issue
 * #28. Runs after `astro build`, against `dist/client/**\/*.html`.
 *
 * - A broken internal link (or a same-page anchor with no matching id)
 *   fails the build.
 * - A broken external link only warns - a third-party outage must never
 *   block a deploy.
 * - Deliberately out of scope: the contents of an HTML `page` artifact
 *   (docs/content-schema.md section 2) - it owns its own content, and its
 *   build output has no `.html` extension (it's a plain API route file,
 *   `dist/client/p/<slug>`), so the `*.html` glob below already excludes
 *   it without special-casing. A link *to* `/p/<slug>` from elsewhere is
 *   still checked like any other internal link.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSiteConfig } from '../../../dist/site.config.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(SCRIPT_DIR, '..', 'dist', 'client');

// Hosts known to reject automated HEAD/GET requests (bot detection, rate
// limiting) independent of whether the link is actually broken. Add a host
// here only when it's produced a real false-positive - not preemptively.
const EXTERNAL_ALLOWLIST = new Set([]);

const EXTERNAL_TIMEOUT_MS = 5000;
const EXTERNAL_CONCURRENCY = 10;

const HREF_PATTERN = /\s(?:href|src)=["']([^"'#][^"']*|#[^"']+)["']/gi;
const ID_PATTERN = /\sid=["']([^"']+)["']/gi;

async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function classifyLink(rawHref, pageUrl, siteOrigin) {
  if (
    rawHref.startsWith('mailto:') ||
    rawHref.startsWith('tel:') ||
    rawHref.startsWith('javascript:') ||
    rawHref.startsWith('data:')
  ) {
    return { kind: 'skip' };
  }

  let resolved;
  try {
    resolved = new URL(rawHref, pageUrl);
  } catch {
    return { kind: 'skip' };
  }

  if (resolved.origin !== siteOrigin) {
    return { kind: 'external', url: resolved.toString() };
  }

  return { kind: 'internal', pathname: resolved.pathname, hash: resolved.hash.slice(1) };
}

/** Astro's static output for a route with no extension of its own is
 * `<route>/index.html`; a route that already names a file (rss.xml,
 * favicon.ico, a page artifact) is written as that literal path. Try both
 * shapes rather than assuming one. */
function resolveInternalPath(distDir, pathname) {
  const clean = pathname.replace(/^\/+/, '');
  const candidates = clean.length === 0 ? ['index.html'] : [`${clean}/index.html`, clean];
  for (const candidate of candidates) {
    const full = join(distDir, candidate);
    if (existsSync(full)) {
      return full;
    }
  }
  return undefined;
}

async function hasAnchor(filePath, anchor) {
  const html = await readFile(filePath, 'utf-8');
  for (const match of html.matchAll(ID_PATTERN)) {
    if (match[1] === anchor) {
      return true;
    }
  }
  return false;
}

async function checkExternal(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    let response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    // Some servers don't implement HEAD correctly (405, or a 200 that lies).
    if (!response.ok) {
      response = await fetch(url, { method: 'GET', signal: controller.signal });
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkExternalLinks(urls) {
  const broken = [];
  const queue = [...urls];
  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (url === undefined || EXTERNAL_ALLOWLIST.has(new URL(url).host)) {
        continue;
      }
      const ok = await checkExternal(url);
      if (!ok) {
        broken.push(url);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(EXTERNAL_CONCURRENCY, urls.length) }, worker),
  );
  return broken;
}

export async function checkLinks(
  distDir = DIST_DIR,
  siteOrigin = new URL(getSiteConfig().url).origin,
) {
  const files = await collectHtmlFiles(distDir);
  const brokenInternal = [];
  const brokenAnchors = [];
  const externalUrls = new Set();

  for (const file of files) {
    const relativePath = `/${file.slice(distDir.length + 1)}`;
    const pageUrl = `${siteOrigin}${relativePath}`;
    const html = await readFile(file, 'utf-8');

    for (const match of html.matchAll(HREF_PATTERN)) {
      const href = match[1] ?? '';
      const link = classifyLink(href, pageUrl, siteOrigin);

      if (link.kind === 'external') {
        externalUrls.add(link.url);
        continue;
      }
      if (link.kind !== 'internal') {
        continue;
      }

      // A same-page anchor with an empty pathname (`#section`) - the file
      // itself is the target.
      const targetIsSelf = link.pathname === new URL(pageUrl).pathname;
      const targetPath = targetIsSelf
        ? file
        : resolveInternalPath(distDir, link.pathname);

      if (!targetPath) {
        brokenInternal.push({ file: relativePath, href });
        continue;
      }
      if (link.hash && !(await hasAnchor(targetPath, link.hash))) {
        brokenAnchors.push({ file: relativePath, href });
      }
    }
  }

  const brokenExternal =
    externalUrls.size > 0 ? await checkExternalLinks([...externalUrls]) : [];

  return { brokenInternal, brokenAnchors, brokenExternal };
}

async function main() {
  const { brokenInternal, brokenAnchors, brokenExternal } = await checkLinks();

  for (const url of brokenExternal) {
    console.warn(`::warning::broken external link: ${url}`);
  }

  if (brokenInternal.length === 0 && brokenAnchors.length === 0) {
    console.log(
      `Link check passed (${brokenExternal.length} broken external link(s), warned only).`,
    );
    return;
  }

  for (const { file, href } of brokenInternal) {
    console.error(`::error::${file}: broken internal link "${href}"`);
  }
  for (const { file, href } of brokenAnchors) {
    console.error(`::error::${file}: broken anchor "${href}"`);
  }
  process.exitCode = 1;
}

// Only run when invoked directly - importing this module for its
// `checkLinks` export (tests) must stay side-effect free.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
