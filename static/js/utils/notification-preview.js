/**
 * Pure helpers to preview what a user sees in the network notification bell.
 * Mirrors logic in network-app.js (computed requests + Firestore inbox).
 */

export function getCollaborationRequestBlockTitle(block, collaboratorEmail = '') {
  const directTitle = (block?.title || '').trim();
  if (directTitle) return directTitle;

  if (block?.type === 'carousel' && Array.isArray(block.slides)) {
    const matchingSlideTitle = block.slides.find(slide =>
      Array.isArray(slide?.collaborators) &&
      slide.collaborators.includes(collaboratorEmail) &&
      (slide.title || '').trim()
    )?.title;
    if ((matchingSlideTitle || '').trim()) return matchingSlideTitle.trim();

    const firstSlideTitle = block.slides.find(slide => (slide?.title || '').trim())?.title;
    if ((firstSlideTitle || '').trim()) return firstSlideTitle.trim();
  }

  return '(untitled block)';
}

export function computePendingConnectionRequestsForUser(targetEmail, allUsers, targetProfile) {
  if (!targetEmail) return [];

  const myConnections = Array.isArray(targetProfile?.connections) ? targetProfile.connections : [];
  const dismissed = Array.isArray(targetProfile?.dismissedConnectionRequests)
    ? targetProfile.dismissedConnectionRequests
    : [];

  return (allUsers || []).filter(u => {
    if (u.email === targetEmail) return false;
    const theirConnections = Array.isArray(u.connections) ? u.connections : [];
    return theirConnections.includes(targetEmail)
      && !myConnections.includes(u.email)
      && !dismissed.includes(u.email);
  });
}

export function computePendingCollaborationRequestsForUser(targetEmail, allUsers, targetProfile) {
  if (!targetEmail) return [];

  const myCollaborations = Array.isArray(targetProfile?.collaborations) ? targetProfile.collaborations : [];
  const dismissed = Array.isArray(targetProfile?.dismissedCollaborationRequests)
    ? targetProfile.dismissedCollaborationRequests
    : [];

  const pending = [];
  for (const owner of allUsers || []) {
    if (owner.email === targetEmail) continue;
    const ownerBlocks = Array.isArray(owner.blocks) ? owner.blocks : [];
    for (const block of ownerBlocks) {
      const collab = Array.isArray(block.collaborators) ? block.collaborators : [];
      if (!collab.includes(targetEmail)) continue;
      const gid = block.globalId || null;
      if (gid && myCollaborations.includes(gid)) continue;
      if (gid && dismissed.includes(gid)) continue;
      pending.push({ owner, block, globalId: gid });
    }
  }
  return pending;
}

export function formatNotificationTimestamp(ts) {
  if (!ts) return 'N/A';
  try {
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (typeof ts === 'object' && 'seconds' in ts) {
      return new Date(ts.seconds * 1000).toLocaleString();
    }
    return new Date(ts).toLocaleString();
  } catch (_) {
    return 'N/A';
  }
}

export function getNotificationCategoryIcon(category) {
  switch (category) {
    case 'KR News': return 'static/img/KRICON.png';
    case 'Connection Request': return 'static/img/community.svg';
    case 'Collaboration': return 'static/img/community.svg';
    case 'Update': return 'static/img/notification.svg';
    default: return 'static/img/notification.svg';
  }
}

/** Returns log ids that exist in sentNotifications (for stale inbox hints). */
export function buildSentLogIdSet(sentNotifications) {
  const set = new Set();
  (sentNotifications || []).forEach(n => {
    if (n?.id) set.add(n.id);
  });
  return set;
}
