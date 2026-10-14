/**
 * Shared GeoJSON cache for welcome.html and index.html globes.
 * Uses in-memory + sessionStorage so index.html benefits when user comes from welcome.
 */
const STORAGE_KEY = 'kr_geojson_cache';
let _cache = null;

export async function getGeoJson() {
  if (_cache) return _cache;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      _cache = JSON.parse(stored);
      return _cache;
    }
  } catch (e) { /* ignore */ }
  const response = await fetch('./static/data/ne_110m_land.json');
  const text = await response.text();
  _cache = JSON.parse(text);
  try {
    sessionStorage.setItem(STORAGE_KEY, text);
  } catch (e) { /* ignore */ }
  return _cache;
}
