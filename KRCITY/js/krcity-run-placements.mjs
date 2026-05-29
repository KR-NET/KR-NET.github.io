/**
 * ESM entry: runs after the main game script has registered window hooks.
 * (Dynamic import() from a classic script is unreliable in some browsers / CSP setups.)
 */
import { buildPlacementsFromFirestore } from './krcity-network-placements.mjs';

if (typeof window.krcityGetPlacementContext === 'function' && typeof window.krcitySetPlacements === 'function') {
  buildPlacementsFromFirestore(window.krcityGetPlacementContext())
    .then((result) => {
      const pl = result && result.placements != null ? result.placements : result;
      const arr = Array.isArray(pl) ? pl : [];
      window.krcitySetPlacements(arr);
      console.log('[KRCITY] Network building labels ready:', arr.length);
    })
    .catch((e) => {
      console.warn('[KRCITY] network placements failed', e);
    });
} else {
  console.warn('[KRCITY] krcity run-placements: game hooks not registered');
}
