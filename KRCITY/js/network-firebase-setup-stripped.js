// network-firebase-setup-stripped.js — fork for indexstripped.html (no UI coupling to main index)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWYRLFIudpqYdxCZXjiT7nGoJScKcwPv0",
  authDomain: "kr-net-23.firebaseapp.com",
  projectId: "kr-net-23",
  storageBucket: "kr-net-23.firebasestorage.app",
  messagingSenderId: "466657657759",
  appId: "1:466657657759:web:83c5c245d1736b48eab3aa",
  measurementId: "G-Z0XEDT1G9P"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const debugLoad = typeof window !== 'undefined' && typeof window.__krLoadDebug === 'function'
  ? window.__krLoadDebug
  : function(stage, details) {
      if (details !== undefined) {
        console.log('[KR LOAD]', stage, details);
      } else {
        console.log('[KR LOAD]', stage);
      }
    };

debugLoad('firebase_setup_stripped_module_evaluated');

let currentUser = null;
let authStateResolved = false;

onAuthStateChanged(auth, async (user) => {
  debugLoad('firebase_stripped_auth_state_changed', {
    hasUser: !!user,
    email: user && user.email ? user.email : null
  });
  currentUser = user;
  authStateResolved = true;
  window.dispatchEvent(new CustomEvent('kr_network_auth_ready', {
    detail: { user }
  }));
});

function generateGlobalBlockId(ownerEmail, createdAt) {
  const safeEmail = String(ownerEmail || '').replace(/[^a-zA-Z0-9]/g, '_');
  const ts = (createdAt && !isNaN(new Date(createdAt).getTime())) ? new Date(createdAt).getTime() : Date.now();
  return `${safeEmail}_${ts}`;
}

async function ensureBlockHasGlobalId(ownerEmail, block, blocksArray) {
  if (block.globalId) return block.globalId;
  const gid = generateGlobalBlockId(ownerEmail, block.createdAt);
  const idx = blocksArray.findIndex(b => b === block || (
    b.createdAt === block.createdAt && b.title === block.title && (b.link || '') === (block.link || '')
  ));
  if (idx >= 0) {
    const updated = [...blocksArray];
    updated[idx] = { ...updated[idx], globalId: gid };
    const userRef = doc(db, 'users', ownerEmail);
    await updateDoc(userRef, { blocks: updated });
    block.globalId = gid;
  }
  return gid;
}

async function fetchAllUsers() {
  debugLoad('firebase_stripped_fetch_all_users_enter');
  try {
    const cached = sessionStorage.getItem('kr_users_cache');
    const cachedTime = sessionStorage.getItem('kr_users_cache_time');
    if (cached && cachedTime) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < 5 * 60 * 1000) {
        return JSON.parse(cached);
      }
    }
  } catch (e) {
    debugLoad('firebase_stripped_cache_read_failed', { message: e && e.message ? e.message : String(e) });
  }
  const snapshot = await getDocs(collection(db, 'users'));
  const users = snapshot.docs.map(d => ({
    email: d.id,
    ...d.data()
  }));
  try {
    sessionStorage.setItem('kr_users_cache', JSON.stringify(users));
    sessionStorage.setItem('kr_users_cache_time', String(Date.now()));
  } catch (e) { /* ignore */ }
  return users;
}

async function getUserProfile(email) {
  const docRef = doc(db, 'users', email);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { email: docSnap.id, ...docSnap.data() } : null;
}

function getMutualConnections(user, allUsers) {
  if (!user || !user.connections) return [];
  return allUsers.filter(otherUser => {
    if (otherUser.email === user.email) return false;
    const theirConnections = otherUser.connections || [];
    return user.connections.includes(otherUser.email) &&
           theirConnections.includes(user.email);
  });
}

window.networkFirebaseUtils = {
  get currentUser() {
    return currentUser;
  },
  get authStateResolved() {
    return authStateResolved;
  },
  fetchAllUsers,
  getUserProfile,
  ensureBlockHasGlobalId,
  getMutualConnections,
  db
};
