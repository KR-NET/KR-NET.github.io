import {
  doc,
  getDoc,
  deleteDoc,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import { validateDisplayTitle } from '../utils/slugify.js';

export const TITLE_REGISTRY_COLLECTION = 'titleRegistry';

function registryRef(db, slug) {
  return doc(db, TITLE_REGISTRY_COLLECTION, slug);
}

export async function checkDisplayNameAvailable(db, title, ownerEmail) {
  const validation = validateDisplayTitle(title);
  if (!validation.ok) {
    return { available: false, reason: validation.error, slug: validation.slug };
  }
  const snap = await getDoc(registryRef(db, validation.slug));
  if (!snap.exists()) {
    return { available: true, slug: validation.slug };
  }
  if (snap.data().email === ownerEmail) {
    return { available: true, slug: validation.slug };
  }
  return { available: false, reason: 'That name is already on the network.', slug: validation.slug };
}

export async function claimDisplayName(db, email, title) {
  const validation = validateDisplayTitle(title);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const newSlug = validation.slug;
  const trimmedTitle = validation.trimmed;

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, 'users', email);
    const userSnap = await tx.get(userRef);
    const oldSlug = userSnap.exists() ? (userSnap.data().titleSlug || null) : null;

    const newRegistryRef = registryRef(db, newSlug);
    const newRegistrySnap = await tx.get(newRegistryRef);

    if (newRegistrySnap.exists() && newRegistrySnap.data().email !== email) {
      throw new Error('That name is already on the network.');
    }

    if (oldSlug && oldSlug !== newSlug) {
      const oldRegistryRef = registryRef(db, oldSlug);
      const oldRegistrySnap = await tx.get(oldRegistryRef);
      if (oldRegistrySnap.exists() && oldRegistrySnap.data().email === email) {
        tx.delete(oldRegistryRef);
      }
    }

    const claimedAt = (newRegistrySnap.exists() && newRegistrySnap.data().email === email && newRegistrySnap.data().claimedAt)
      ? newRegistrySnap.data().claimedAt
      : new Date().toISOString();

    tx.set(newRegistryRef, {
      email,
      title: trimmedTitle,
      claimedAt,
    });
    tx.set(userRef, { title: trimmedTitle, titleSlug: newSlug }, { merge: true });
  });
}
