/**
 * Build KR Network → city map: one building slot per profile user, placement driven by graph layout.
 * Mutual connections only; collab block nodes are not part of the city sim (matches network “user” graph).
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

const ANGLE_STEPS = 24;
const HUNGARIAN_INF = 1e18;

/**
 * T_BUILDING @ macro centre tile (bx*10+5, by*10+5) is the same test used in drawBuildingWalls.
 * Slot “pin” in world space matches the macro-centre used for d3–map matching (TILE * (macro 6) = 6/10 in block + half tile).
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
      const wx = (bx * 10 + 6) * TILE;
      const wy = (by * 10 + 6) * TILE;
      slots.push({ bx, by, ring, ang, wx, wy });
    }
  }
  slots.sort((a, b) => a.ring - b.ring || a.ang - b.ang || a.by - b.by || a.bx - b.bx);
  return slots;
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
  const slots = collectBuildingSlots(map, ctx);
  if (slots.length === 0) return { placements: [] };

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
    const s = typeof l.source === 'object' && l.source && l.source.id != null ? l.source.id : l.source;
    const t = typeof l.target === 'object' && l.target && l.target.id != null ? l.target.id : l.target;
    if (deg.has(s)) deg.set(s, (deg.get(s) || 0) + 1);
    if (deg.has(t)) deg.set(t, (deg.get(t) || 0) + 1);
  }
  const centralityScore = (n) => {
    const d = Math.hypot(n.x - meanX, n.y - meanY);
    const close = 1000 / (1 + d);
    return close + (deg.get(n.id) || 0) * 3;
  };
  const byCentrality = [...nodes].sort((a, b) => {
    const c = centralityScore(b) - centralityScore(a);
    if (c !== 0) return c;
    return a.id < b.id ? -1 : 1;
  });

  const m = slots.length;
  const nPlace = Math.min(m, byCentrality.length);
  if (byCentrality.length > m) {
    const dropped = byCentrality.slice(nPlace);
    const droppedList = dropped.map((n) => n.id);
    console.warn(
      '[KRCITY] More profiles than building slots; assigning highest-centrality only.',
      nPlace,
      'of',
      byCentrality.length,
      'placed. Dropped (lowest centrality):',
      droppedList
    );
  }

  if (nPlace === 0) {
    return { placements: [] };
  }
  const selected = byCentrality.slice(0, nPlace);
  const qx = new Float64Array(m);
  const qy = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    qx[j] = slots[j].wx - mapCx;
    qy[j] = slots[j].wy - mapCy;
  }
  let sumRq = 0;
  for (let j = 0; j < m; j++) {
    sumRq += Math.hypot(qx[j], qy[j]);
  }
  const rq = m > 0 ? sumRq / m : 1;

  const dMx = selected.reduce((s, n) => s + n.x, 0) / nPlace;
  const dMy = selected.reduce((s, n) => s + n.y, 0) / nPlace;
  const rawDx = new Float64Array(nPlace);
  const rawDy = new Float64Array(nPlace);
  for (let i = 0; i < nPlace; i++) {
    rawDx[i] = selected[i].x - dMx;
    rawDy[i] = selected[i].y - dMy;
  }
  let sumRd = 0;
  for (let i = 0; i < nPlace; i++) {
    sumRd += Math.hypot(rawDx[i], rawDy[i]);
  }
  const rd = nPlace > 0 && sumRd > 1e-9 ? sumRd / nPlace : 1;
  const sScale = rq / (rd + 1e-12);
  for (let i = 0; i < nPlace; i++) {
    rawDx[i] *= sScale;
    rawDy[i] *= sScale;
  }

  const K = nPlace;
  const cost = Array.from({ length: K }, () => new Float64Array(m));
  const px = new Float64Array(K);
  const py = new Float64Array(K);
  let bestSum = HUNGARIAN_INF;
  let bestCols = null;

  for (let step = 0; step < ANGLE_STEPS; step++) {
    const th = (step / ANGLE_STEPS) * 2 * Math.PI;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    for (let i = 0; i < K; i++) {
      const x = rawDx[i];
      const y = rawDy[i];
      px[i] = c * x - sn * y;
      py[i] = sn * x + c * y;
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
    const user = selected[i];
    const j = bestCols[i];
    const { bx, by } = slots[j];
    const X0 = (bx * 10 + 3) * TILE;
    const Y0 = (by * 10 + 3) * TILE;
    const X1 = (bx * 10 + 9) * TILE;
    const midX = (X0 + X1) * 0.5;
    const textY = Y0 - 10;
    out.push({
      id: user.id,
      title: user.title,
      wx: midX,
      wy: textY,
      bx,
      by
    });
  }
  return { placements: out };
}
