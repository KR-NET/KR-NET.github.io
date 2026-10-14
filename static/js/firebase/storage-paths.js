/**
 * Central Firebase Storage path helpers.
 * Storage paths use Firebase Auth uid — never email — so download URLs stay private
 * and Storage rules can authorize with request.auth.uid (no Firestore lookup needed).
 * Numeric user.id is still used for globalBlock document ids (see generateGlobalBlockId).
 */

export function normalizeAuthUid(authUid) {
  const uid = authUid != null && typeof authUid === 'object'
    ? (authUid.authUid ?? authUid.uid)
    : authUid;
  if (!uid || typeof uid !== 'string') {
    throw new Error('Firebase Auth uid is required for storage paths');
  }
  return uid;
}

export function avatarStoragePath(authUid, filename) {
  const uid = normalizeAuthUid(authUid);
  const name = filename || `${Date.now()}.jpg`;
  return `avatars/${uid}/${name}`;
}

export function blockStoragePath(authUid, filename) {
  const uid = normalizeAuthUid(authUid);
  const name = filename != null ? String(filename) : String(Date.now());
  return `blocks/${uid}/${name}`;
}

export function blockCarouselStoragePath(authUid, slideIndex, filename) {
  const uid = normalizeAuthUid(authUid);
  const name = filename || `${Date.now()}_${slideIndex}.jpg`;
  return `blocks/${uid}/carousel/${name}`;
}

export function normalizeUserId(userId) {
  const id = userId != null && typeof userId === 'object' ? userId.id : userId;
  if (id == null || id === '') {
    throw new Error('User id is required');
  }
  return String(id);
}

export function generateGlobalBlockId(userId, createdAt) {
  const id = normalizeUserId(userId);
  const ts = (createdAt && !isNaN(new Date(createdAt).getTime()))
    ? new Date(createdAt).getTime()
    : Date.now();
  return `${id}_${ts}`;
}

/** Pre-migration global block ids (email-based). Used for legacy delete lookups only. */
export function generateLegacyGlobalBlockId(ownerEmail, createdAt) {
  const safeEmail = String(ownerEmail || '').replace(/[^a-zA-Z0-9]/g, '_');
  const ts = (createdAt && !isNaN(new Date(createdAt).getTime()))
    ? new Date(createdAt).getTime()
    : Date.now();
  return `${safeEmail}_${ts}`;
}

export function resolveGlobalBlockIdForDelete(block, { userId, ownerEmail } = {}) {
  if (block?.globalId) return block.globalId;
  if (!block?.createdAt) return null;
  if (userId != null) return generateGlobalBlockId(userId, block.createdAt);
  if (ownerEmail) return generateLegacyGlobalBlockId(ownerEmail, block.createdAt);
  return null;
}

export function generateGlobalBlockIdForOwner(owner, createdAt) {
  if (owner?.id != null) return generateGlobalBlockId(owner.id, createdAt);
  if (typeof owner === 'string') return generateLegacyGlobalBlockId(owner, createdAt);
  if (owner?.email) return generateLegacyGlobalBlockId(owner.email, createdAt);
  throw new Error('Owner id or email required to generate global block id');
}

export function resolveStorageAuthUid(user, currentAuthUser) {
  if (user?.authUid) return user.authUid;
  if (user?.uid) return user.uid;
  if (currentAuthUser?.uid) return currentAuthUser.uid;
  throw new Error('Auth uid is required for storage uploads');
}
