export const TITLE_MIN_LENGTH = 2;
export const TITLE_MAX_LENGTH = 50;

export const RESERVED_SLUGS = new Set(['admin', 'kr', 'network', 'profile']);

/** URL-friendly profile slug: lowercase, spaces removed. */
export function slugifyTitle(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * Validate a display name before registry lookup / claim.
 * @returns {{ ok: boolean, error?: string, slug: string, trimmed: string }}
 */
export function validateDisplayTitle(title) {
  const trimmed = String(title || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Add your display name to continue.', slug: '', trimmed: '' };
  }
  if (trimmed.length < TITLE_MIN_LENGTH) {
    return { ok: false, error: `Display name must be at least ${TITLE_MIN_LENGTH} characters.`, slug: '', trimmed };
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return { ok: false, error: `Display name must be ${TITLE_MAX_LENGTH} characters or fewer.`, slug: '', trimmed };
  }
  if (!/^[\p{L}\p{N}\s'.-]+$/u.test(trimmed)) {
    return { ok: false, error: "Display name can only contain letters, numbers, spaces, and . ' -", slug: '', trimmed };
  }
  const slug = slugifyTitle(trimmed);
  if (!slug) {
    return { ok: false, error: 'Choose a name with at least one letter or number.', slug: '', trimmed };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: 'That name is not available.', slug, trimmed };
  }
  return { ok: true, slug, trimmed };
}
