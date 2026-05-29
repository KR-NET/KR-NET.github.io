/**
 * KR Network → city map: prefer three users per building; up to four only when a 4-node cluster is
 * densely linked. Pipeline: d3 force layout → partition (chunks of 3; dense-4 exception) →
 * Hungarian matches K groups to m ≥ K buildings (min. squared distance after uniform scale + rotation).
 * Mutual connections only.
 */
import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

const firebaseConfig = {
  apiKey: 'AIzaSyBWYRLFIudpqYdxCZXjiT7nGoJScKcwPv0',
  authDomain: 'kr-net-23.firebaseapp.com',
  projectId: 'kr-net-23',
  storageBucket: 'kr-net-23.firebasestorage.app',
  messagingSenderId: '466657657759',
  appId: '1:466657657759:web:83c5c245d1736b48eab3aa',
  measurementId: 'G-Z0XEDT1G9P'
};

const KRCITY_FB_APP = 'krcity-network-labels';

function getDb() {
  try {
    return getFirestore(getApp(KRCITY_FB_APP));
  } catch (_) {
    return getFirestore(initializeApp(firebaseConfig, KRCITY_FB_APP));
  }
}

const ANGLE_STEPS = 72;
const HUNGARIAN_INF = 1e18;

/** Target group size when splitting large mutual-link components (radial slices). */
const GROUP_CHUNK = 3;
/** For exactly four users in one component: keep one building of four only if induced edges ≥ this (max 6). */
const DENSE_FOUR_MIN_EDGES = 5;

/**
 * Four pin positions inside the 6×6 building footprint (local tile coords from macro origin; .5 = tile centre).
 * SW / SE / NW / NE interior corners — off pavement, on T_BUILDING roof plane for labels.
 */
const KR_BUILDING_CORNER_LOCAL = [
  { lox: 3.5, loy: 3.5 },
  { lox: 8.5, loy: 3.5 },
  { lox: 3.5, loy: 8.5 },
  { lox: 8.5, loy: 8.5 }
];

/**
 * T_BUILDING @ macro centre tile (bx*10+5, by*10+5) is the same test used in drawBuildingWalls.
 */
function collectBuildingSlots(map, ctx) {
  const { COLS, ROWS, T_BUILDING, TILE } = ctx;
  const MACRO_W = Math.floor(COLS / 10);
  const MACRO_H = Math.floor(ROWS / 10);
  const cBx = (MACRO_W - 1) / 2;
  const cBy = (MACRO_H - 1) / 2;
  const slots = [];
  for (let by = 0; by < MACRO_H; by++) {
    for (let bx = 0; bx < MACRO_W; bx++) {
      const cxT = bx * 10 + 5;
      const cyT = by * 10 + 5;
      if (cyT >= ROWS || cxT >= COLS) continue;
      if (map[cyT][cxT] !== T_BUILDING) continue;
      const ring = Math.max(Math.abs(bx - cBx), Math.abs(by - cBy));
      const ang = Math.atan2(by - cBy, bx - cBx);
      slots.push({ bx, by, ring, ang });
    }
  }
  slots.sort((a, b) => a.ring - b.ring || a.ang - b.ang || a.by - b.by || a.bx - b.bx);
  return slots;
}

function linkEndpoints(l) {
  const s = typeof l.source === 'object' && l.source && l.source.id != null ? l.source.id : l.source;
  const t = typeof l.target === 'object' && l.target && l.target.id != null ? l.target.id : l.target;
  return { s, t };
}

function countInternalEdges(compNodes, adj) {
  const ids = compNodes.map((n) => n.id);
  const set = new Set(ids);
  let e = 0;
  for (const id of ids) {
    for (const nb of adj.get(id) || []) {
      if (set.has(nb) && id < nb) e++;
    }
  }
  return e;
}

function sortCompRadial(comp) {
  const mx = comp.reduce((s, n) => s + n.x, 0) / comp.length;
  const my = comp.reduce((s, n) => s + n.y, 0) / comp.length;
  return [...comp].sort((a, b) => {
    const aa = Math.atan2(a.y - my, a.x - mx);
    const bb = Math.atan2(b.y - my, b.x - mx);
    return aa - bb || (a.id < b.id ? -1 : 1);
  });
}

/**
 * Groups for building assignment: connected components, prefer ≤3 per block.
 * Components of 4 split into 3+1 unless the four are densely interconnected (≥5 internal edges).
 * Larger components split radially into chunks of 3.
 */
function partitionNodesIntoSmallGroups(nodes, activeLinks) {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of activeLinks) {
    const { s, t } = linkEndpoints(l);
    if (!idToNode.has(s) || !idToNode.has(t)) continue;
    adj.get(s).push(t);
    adj.get(t).push(s);
  }
  const visited = new Set();
  const components = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp = [];
    const stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      const id = stack.pop();
      comp.push(idToNode.get(id));
      for (const nb of adj.get(id) || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp);
  }
  const groups = [];
  for (const comp of components) {
    if (comp.length <= 3) {
      groups.push(comp);
      continue;
    }
    if (comp.length === 4) {
      if (countInternalEdges(comp, adj) >= DENSE_FOUR_MIN_EDGES) {
        groups.push(comp);
        continue;
      }
      const sorted = sortCompRadial(comp);
      groups.push(sorted.slice(0, 3));
      groups.push(sorted.slice(3, 4));
      continue;
    }
    const sorted = sortCompRadial(comp);
    for (let i = 0; i < sorted.length; i += GROUP_CHUNK) {
      groups.push(sorted.slice(i, i + GROUP_CHUNK));
    }
  }
  return groups;
}

/** Sort members by angle in sim space; assign interior corners 0..n-1 in that order. */
function placeGroupOnBuilding(group, bx, by, TILE) {
  if (group.length > KR_BUILDING_CORNER_LOCAL.length) return [];
  const mx = group.reduce((s, n) => s + n.x, 0) / group.length;
  const my = group.reduce((s, n) => s + n.y, 0) / group.length;
  const sorted = [...group].sort((a, b) => {
    const aa = Math.atan2(a.y - my, a.x - mx);
    const bb = Math.atan2(b.y - my, b.x - mx);
    return aa - bb || (a.id < b.id ? -1 : 1);
  });
  const out = [];
  for (let idx = 0; idx < sorted.length; idx++) {
    const user = sorted[idx];
    const { lox, loy } = KR_BUILDING_CORNER_LOCAL[idx];
    const wx = (bx * 10 + lox) * TILE;
    const wy = (by * 10 + loy) * TILE;
    out.push({
      id: user.id,
      title: user.title,
      wx,
      wy,
      bx,
      by,
      corner: idx
    });
  }
  return out;
}

/** Min-weight assignment, n workers × m jobs, n <= m, each row → distinct column, minimize sum a[i][j]. */
function hungarianMin(a) {
  const n = a.length;
  const m = a[0].length;
  if (n > m) throw new Error('hungarianMin: n must be <= m');
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(HUNGARIAN_INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = HUNGARIAN_INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array(n);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  }
  return rowToCol;
}

/**
 * @param {object} ctx — { map, COLS, ROWS, T_BUILDING, TILE, WORLD_W?, WORLD_H? } (map centre = (WORLD_W/2, WORLD_H/2) in world px)
 * @returns {{ placements: Array<...> }}
 */
export async function buildPlacementsFromFirestore(ctx) {
  const { map, TILE, COLS, ROWS } = ctx;
  const worldW = typeof ctx.WORLD_W === 'number' ? ctx.WORLD_W : COLS * TILE;
  const worldH = typeof ctx.WORLD_H === 'number' ? ctx.WORLD_H : ROWS * TILE;
  const mapCx = worldW * 0.5;
  const mapCy = worldH * 0.5;
  const buildingSlots = collectBuildingSlots(map, ctx);
  if (buildingSlots.length === 0) return { placements: [] };

  const db = getDb();
  const snap = await getDocs(collection(db, 'users'));
  const users = snap.docs.map((doc) => ({ email: doc.id, ...doc.data() }));
  if (users.length === 0) return { placements: [] };

  const emailSet = new Set(users.map((u) => u.email));

  const links = [];
  const seen = new Set();
  for (const u of users) {
    const id = u.email;
    if (!id || !Array.isArray(u.connections)) continue;
    for (const targetEmail of u.connections) {
      if (!emailSet.has(targetEmail)) continue;
      const v = users.find((x) => x.email === targetEmail);
      if (!v || !Array.isArray(v.connections) || !v.connections.includes(id)) continue;
      const a = id < targetEmail ? id : targetEmail;
      const b = id < targetEmail ? targetEmail : id;
      const k = `${a}||${b}`;
      if (seen.has(k)) continue;
      seen.add(k);
      links.push({ source: a, target: b });
    }
  }

  const nodes = users.map((u) => {
    const id = u.email;
    const title = typeof u.title === 'string' && u.title.length ? u.title : id.split('@')[0] || id;
    return { id, title };
  });

  for (const n of nodes) {
    n.x = (Math.random() - 0.5) * 20;
    n.y = (Math.random() - 0.5) * 20;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const activeLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  const linkForce = d3
    .forceLink(activeLinks)
    .id((d) => d.id)
    .distance(52)
    .strength(0.55);

  const sim = d3
    .forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(-140))
    .force('center', d3.forceCenter(0, 0).strength(0.12))
    .force('collide', d3.forceCollide(14));

  for (let i = 0; i < 450; i++) sim.tick();
  sim.stop();

  const meanX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const meanY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  const deg = new Map();
  for (const n of nodes) deg.set(n.id, 0);
  for (const l of activeLinks) {
    const { s, t } = linkEndpoints(l);
    if (deg.has(s)) deg.set(s, (deg.get(s) || 0) + 1);
    if (deg.has(t)) deg.set(t, (deg.get(t) || 0) + 1);
  }
  const centralityScore = (n) => {
    const d = Math.hypot(n.x - meanX, n.y - meanY);
    const close = 1000 / (1 + d);
    return close + (deg.get(n.id) || 0) * 3;
  };
  const groupScore = (group) => Math.max(...group.map((n) => centralityScore(n)));

  const groups = partitionNodesIntoSmallGroups(nodes, activeLinks);
  groups.sort((a, b) => {
    const c = groupScore(b) - groupScore(a);
    if (c !== 0) return c;
    const aid = [...a].map((n) => n.id).sort()[0];
    const bid = [...b].map((n) => n.id).sort()[0];
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });

  const m = buildingSlots.length;
  if (groups.length > m) {
    const dropped = groups.slice(m);
    const droppedIds = dropped.flatMap((g) => g.map((n) => n.id));
    console.warn(
      '[KRCITY] More network groups than building cells; lowest-priority groups not placed.',
      m,
      'of',
      groups.length,
      'groups. Unplaced user ids:',
      droppedIds
    );
  }

  const selectedGroups = groups.slice(0, Math.min(groups.length, m));
  const K = selectedGroups.length;
  if (K === 0) return { placements: [] };

  // Slot centres relative to map origin; subtract slot-cloud mean so it matches the zero-mean group
  // centroid cloud (same as centering both point sets for Procrustes without moving the actual map).
  const qx = new Float64Array(m);
  const qy = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const { bx, by } = buildingSlots[j];
    const wxc = (bx * 10 + 5.5) * TILE;
    const wyc = (by * 10 + 5.5) * TILE;
    qx[j] = wxc - mapCx;
    qy[j] = wyc - mapCy;
  }
  let qMx = 0;
  let qMy = 0;
  for (let j = 0; j < m; j++) {
    qMx += qx[j];
    qMy += qy[j];
  }
  qMx /= m;
  qMy /= m;
  for (let j = 0; j < m; j++) {
    qx[j] -= qMx;
    qy[j] -= qMy;
  }
  let sumRq = 0;
  for (let j = 0; j < m; j++) {
    sumRq += Math.hypot(qx[j], qy[j]);
  }
  const rq = m > 0 ? sumRq / m : 1;

  // Only *placed* groups: centroids from d3 positions, subtract their mean (translation invariance).
  // Do not use the full-graph mean — dropped groups would skew the frame and distort assignments.
  const rawDx = new Float64Array(K);
  const rawDy = new Float64Array(K);
  for (let i = 0; i < K; i++) {
    const g = selectedGroups[i];
    rawDx[i] = g.reduce((s, n) => s + n.x, 0) / g.length;
    rawDy[i] = g.reduce((s, n) => s + n.y, 0) / g.length;
  }
  let dMx = 0;
  let dMy = 0;
  for (let i = 0; i < K; i++) {
    dMx += rawDx[i];
    dMy += rawDy[i];
  }
  dMx /= K;
  dMy /= K;
  for (let i = 0; i < K; i++) {
    rawDx[i] -= dMx;
    rawDy[i] -= dMy;
  }
  let sumRd = 0;
  for (let i = 0; i < K; i++) {
    sumRd += Math.hypot(rawDx[i], rawDy[i]);
  }
  const rd = K > 0 && sumRd > 1e-9 ? sumRd / K : 1;
  const sScale = rq / (rd + 1e-12);
  for (let i = 0; i < K; i++) {
    rawDx[i] *= sScale;
    rawDy[i] *= sScale;
  }
  const cost = Array.from({ length: K }, () => new Float64Array(m));
  const px = new Float64Array(K);
  const py = new Float64Array(K);
  let bestSum = HUNGARIAN_INF;
  let bestCols = null;

  for (let step = 0; step < ANGLE_STEPS; step++) {
    const th = (step / ANGLE_STEPS) * 2 * Math.PI;
    const co = Math.cos(th);
    const sn = Math.sin(th);
    for (let i = 0; i < K; i++) {
      const x = rawDx[i];
      const y = rawDy[i];
      px[i] = co * x - sn * y;
      py[i] = sn * x + co * y;
    }
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < m; j++) {
        const dx = px[i] - qx[j];
        const dy = py[i] - qy[j];
        cost[i][j] = dx * dx + dy * dy;
      }
    }
    const col = hungarianMin(cost);
    let sum = 0;
    for (let i = 0; i < K; i++) {
      const j = col[i];
      sum += cost[i][j];
    }
    if (sum < bestSum) {
      bestSum = sum;
      bestCols = col.slice();
    }
  }

  if (!bestCols) {
    return { placements: [] };
  }
  const out = [];
  for (let i = 0; i < K; i++) {
    const group = selectedGroups[i];
    const j = bestCols[i];
    const { bx, by } = buildingSlots[j];
    out.push(...placeGroupOnBuilding(group, bx, by, TILE));
  }
  return { placements: out };
}
