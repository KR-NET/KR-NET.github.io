/** Shared sessionStorage cache for bulk user fetches (index / welcome). */

export function invalidateUsersSessionCache() {
  try {
    sessionStorage.removeItem('kr_users_cache');
    sessionStorage.removeItem('kr_users_cache_time');
    sessionStorage.setItem('kr_users_cache_dirty', '1');
  } catch (_) { /* ignore */ }
}

export function consumeUsersCacheDirtyFlag() {
  try {
    const dirty = sessionStorage.getItem('kr_users_cache_dirty') === '1';
    if (dirty) sessionStorage.removeItem('kr_users_cache_dirty');
    return dirty;
  } catch (_) {
    return false;
  }
}
