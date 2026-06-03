import { RESERVED_SLUGS } from './slugify.js';

/** Canonical origin for shared profile links (no www). */
export const PROFILE_ORIGIN = 'https://kr-net.work';

const ROOT_FILE_SEGMENTS = new Set([
  'index.html',
  'welcome.html',
  'profile.html',
  'collab.html',
  'robots.txt',
  'sitemap.xml',
  '404.html'
]);

const ROOT_DIR_SEGMENTS = new Set(['static', 'other', 'krcity', 'docs']);

function decodeSegment(seg) {
  try {
    return decodeURIComponent(seg);
  } catch (_) {
    return seg;
  }
}

function normalizeSlugCandidate(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || RESERVED_SLUGS.has(s)) return '';
  return s;
}

/**
 * Profile slug from pathname, e.g. /charlienewton-john → charlienewton-john.
 * @param {string} [pathname]
 * @returns {string}
 */
export function parseProfileSlugFromPathname(pathname = '') {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 1) return '';
  const seg = decodeSegment(segments[0]);
  const lower = seg.toLowerCase();
  if (ROOT_FILE_SEGMENTS.has(lower)) return '';
  if (ROOT_DIR_SEGMENTS.has(lower)) return '';
  if (/\./.test(seg)) return '';
  return normalizeSlugCandidate(seg);
}

/**
 * Legacy ?link=slug and bare ?slug (no =).
 * @param {string} [search]
 * @returns {string}
 */
export function parseLegacyProfileSlugFromSearch(search = '') {
  const params = new URLSearchParams(search || '');
  const linkParam = params.get('link');
  if (linkParam) return normalizeSlugCandidate(linkParam);

  const raw = String(search || '').replace(/^\?/, '').trim();
  if (!raw || raw.includes('&')) return '';
  if (raw.includes('=')) {
    const entries = [...params.entries()];
    if (entries.length === 1 && entries[0][1] === '') {
      return normalizeSlugCandidate(entries[0][0]);
    }
    return '';
  }
  return normalizeSlugCandidate(decodeSegment(raw));
}

/**
 * Slug from current or given location (path first, then legacy query).
 * @param {Location} [loc]
 * @returns {string}
 */
export function parseProfileSlugFromLocation(loc = window.location) {
  const fromPath = parseProfileSlugFromPathname(loc.pathname);
  if (fromPath) return fromPath;
  return parseLegacyProfileSlugFromSearch(loc.search);
}

/** @param {string} slug */
export function profilePathForSlug(slug) {
  const s = normalizeSlugCandidate(slug);
  if (!s) return '/';
  return `/${encodeURIComponent(s)}`;
}

/** @param {string} slug */
export function buildProfileUrl(slug) {
  return `${PROFILE_ORIGIN}${profilePathForSlug(slug)}`;
}

/** @param {Location} [loc] */
export function isLikelyProfileDeepLink(loc = window.location) {
  return !!parseProfileSlugFromLocation(loc);
}

/**
 * Redirect ?link=slug and bare ?slug to /slug. Returns true if a redirect was started.
 * @param {Location} [loc]
 */
export function redirectLegacyProfileUrls(loc = window.location) {
  const search = loc.search || '';
  if (!search) return false;

  const hasLinkParam = /(?:^|[?&])link=/.test(search);
  const legacySlug = parseLegacyProfileSlugFromSearch(search);
  if (!legacySlug) return false;

  const bareOnly =
    !hasLinkParam &&
    !search.slice(1).includes('&') &&
    (!search.slice(1).includes('=') || new URLSearchParams(search).toString() === `${legacySlug}=`);

  if (!hasLinkParam && !bareOnly) return false;

  const targetPath = profilePathForSlug(legacySlug);
  const alreadyOnPath =
    loc.pathname === targetPath || loc.pathname === targetPath.replace(/\/$/, '');
  if (alreadyOnPath && !search) return false;

  const next = `${targetPath}${loc.hash || ''}`;
  window.location.replace(next);
  return true;
}

/**
 * Parse slug from an arbitrary stored notification / embed URL.
 * @param {string} raw
 * @returns {string}
 */
export function parseProfileSlugFromUrlString(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw, PROFILE_ORIGIN);
    const fromPath = parseProfileSlugFromPathname(u.pathname);
    if (fromPath) return fromPath;
    const legacy = parseLegacyProfileSlugFromSearch(u.search);
    if (legacy) return legacy;
    const profileVal = new URLSearchParams(u.search).get('profile');
    if (profileVal) return normalizeSlugCandidate(profileVal);
  } catch (_) {
    const mLink = String(raw).match(/(?:\?|&)link=([^&]+)/i);
    if (mLink) return normalizeSlugCandidate(decodeSegment(mLink[1]));
    const mPath = String(raw).match(/kr-net\.work\/([^/?#]+)/i);
    if (mPath) return normalizeSlugCandidate(decodeSegment(mPath[1]));
    const mProfile = String(raw).match(/(?:\?|&)profile=([^&]+)/i);
    if (mProfile) return normalizeSlugCandidate(decodeSegment(mProfile[1]));
  }
  return '';
}
