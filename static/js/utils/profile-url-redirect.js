/**
 * Runs synchronously in <head> before paint. Keep parse/redirect rules in sync with profile-url.js.
 */
(function () {
  var GH_PAGES_KEY = '__krGhPagesPath';

  function decodeSegment(seg) {
    try {
      return decodeURIComponent(seg);
    } catch (e) {
      return seg;
    }
  }

  function normalizeSlug(raw) {
    var s = String(raw || '').trim().toLowerCase();
    return s || '';
  }

  function parseSlugFromPathname(pathname) {
    var path = String(pathname || '/').replace(/\/+$/, '') || '/';
    var segments = path.split('/').filter(Boolean);
    if (segments.length !== 1) return '';
    var seg = decodeSegment(segments[0]);
    var lower = seg.toLowerCase();
    if (
      lower === 'index.html' ||
      lower === 'welcome.html' ||
      lower === 'profile.html' ||
      lower === 'collab.html' ||
      lower === 'robots.txt' ||
      lower === 'sitemap.xml' ||
      lower === '404.html' ||
      lower === 'static' ||
      lower === 'other' ||
      lower === 'krcity' ||
      lower === 'docs'
    ) {
      return '';
    }
    if (/\./.test(seg)) return '';
    return normalizeSlug(seg);
  }

  function parseLegacySlugFromSearch(search) {
    var params = new URLSearchParams(search || '');
    var linkParam = params.get('link');
    if (linkParam) return normalizeSlug(linkParam);

    var raw = String(search || '').replace(/^\?/, '').trim();
    if (!raw || raw.indexOf('&') !== -1) return '';
    if (raw.indexOf('=') !== -1) {
      var entries = [];
      params.forEach(function (value, key) {
        entries.push([key, value]);
      });
      if (entries.length === 1 && entries[0][1] === '') {
        return normalizeSlug(entries[0][0]);
      }
      return '';
    }
    return normalizeSlug(decodeSegment(raw));
  }

  function profilePathForSlug(slug) {
    var s = normalizeSlug(slug);
    return s ? '/' + encodeURIComponent(s) : '/';
  }

  function redirectLegacyQuery(loc) {
    var search = loc.search || '';
    if (!search) return false;
    var hasLinkParam = /(?:^|[?&])link=/.test(search);
    var legacySlug = parseLegacySlugFromSearch(search);
    if (!legacySlug) return false;

    var bareOnly =
      !hasLinkParam &&
      search.slice(1).indexOf('&') === -1 &&
      (search.slice(1).indexOf('=') === -1 ||
        new URLSearchParams(search).toString() === legacySlug + '=');

    if (!hasLinkParam && !bareOnly) return false;

    var targetPath = profilePathForSlug(legacySlug);
    var next = targetPath + (loc.hash || '');
    window.location.replace(next);
    return true;
  }

  var loc = window.location;

  try {
    var stored = sessionStorage.getItem(GH_PAGES_KEY);
    if (stored) {
      sessionStorage.removeItem(GH_PAGES_KEY);
      if (loc.pathname === '/index.html' || loc.pathname === '/') {
        history.replaceState(null, '', stored);
        loc = window.location;
      }
    }
  } catch (e) { /* ignore */ }

  if (redirectLegacyQuery(loc)) return;

  var slug = parseSlugFromPathname(loc.pathname);
  if (!slug) slug = parseLegacySlugFromSearch(loc.search);
  window.__krProfileSlugCandidate = slug || '';
})();
