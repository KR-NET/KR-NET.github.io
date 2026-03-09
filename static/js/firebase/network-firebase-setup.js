// network-firebase-setup.js
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
  query,
  orderBy,
  writeBatch,
  updateDoc,
  arrayUnion
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

debugLoad('firebase_setup_module_evaluated');

let currentUser = null;

// Function to update the navbar link based on auth state
function updateNavbarForAuth() {
  const profileLinkDesktop = document.querySelector('.kr-navbar a[href="profile.html"]');
  const profileLinkMobile = document.querySelector('.kr-mobile-navbar a[href="profile.html"]');
  
  const isLoggedIn = auth.currentUser;

  if (profileLinkDesktop) {
    profileLinkDesktop.textContent = isLoggedIn ? 'YOUR PROFILE' : 'JOIN';
  }
  if (profileLinkMobile) {
    const span = profileLinkMobile.querySelector('span');
    if (span) span.textContent = 'PROFILE';
  }
}

// Flag to indicate auth state has been determined
let authStateResolved = false;

onAuthStateChanged(auth, async (user) => {
  debugLoad('firebase_auth_state_changed', {
    hasUser: !!user,
    email: user && user.email ? user.email : null
  });
  currentUser = user;
  authStateResolved = true; // Mark that auth state is now known
  
  const userStatusDiv = document.getElementById('logged-in-user-status');
  const userAvatarImg = document.getElementById('logged-in-user-avatar');
  const userTextSpan = document.getElementById('logged-in-user-text');
  const mobileUserStatusDiv = document.getElementById('mobile-logged-in-user-status');
  const mobileUserAvatarImg = document.getElementById('mobile-logged-in-user-avatar');
  const mobileUserTextSpan = document.getElementById('mobile-logged-in-user-text');
  const joinKRButton = document.getElementById('join-kr-button-fixed');

  if (joinKRButton) {
    joinKRButton.style.display = 'flex'; // Always show the button
    setTimeout(() => {
      joinKRButton.classList.add('visible');
    }, 500); // Short delay for fade-in
  }

  if (user) {
    // User is signed in, get their profile data
    debugLoad('firebase_auth_fetch_profile_start', {
      email: user.email
    });
    const userProfile = await getUserProfile(user.email);
    debugLoad('firebase_auth_fetch_profile_done', {
      email: user.email,
      found: !!userProfile
    });
    const avatarSrc = userProfile?.avatar || 'static/img/default-avatar.png';
    const displayText = `<strong>${userProfile?.title || user.email.split('@')[0]}</strong><br>Edit your profile`;
    
    // Update desktop version
    if (userStatusDiv && userAvatarImg && userTextSpan) {
      userAvatarImg.src = avatarSrc;
      userTextSpan.innerHTML = displayText;
      userStatusDiv.style.display = 'flex'; // Show the div
    }
    
    // Update mobile version
    if (mobileUserStatusDiv && mobileUserAvatarImg && mobileUserTextSpan) {
      mobileUserAvatarImg.src = avatarSrc;
      mobileUserTextSpan.innerHTML = displayText;
      mobileUserStatusDiv.style.display = 'flex'; // Show the div
    }
    
    await loadInitialData(user);

    // Show locate-me button for logged-in users; visibility may still be
    // further controlled by network-app.js depending on node presence.
    const locateBtn = document.getElementById('locate-me-btn');
    if (locateBtn) locateBtn.style.display = 'flex';
  } else {
    // User is signed out
    const avatarSrc = 'static/img/default-avatar.png';
    const displayText = 'Log in / Join!<br><strong>Create an Account</strong>';
    
    // Update desktop version
    if (userStatusDiv && userAvatarImg && userTextSpan) {
      userAvatarImg.src = avatarSrc;
      userTextSpan.innerHTML = displayText;
      userStatusDiv.style.display = 'flex'; // Show the div
    }
    
    // Update mobile version
    if (mobileUserStatusDiv && mobileUserAvatarImg && mobileUserTextSpan) {
      mobileUserAvatarImg.src = avatarSrc;
      mobileUserTextSpan.innerHTML = displayText;
      mobileUserStatusDiv.style.display = 'flex'; // Show the div
    }
    // You might want to clear the graph or show a "logged out" state
    const locateBtn = document.getElementById('locate-me-btn');
    if (locateBtn) locateBtn.style.display = 'none';
  }
  updateNavbarForAuth(); // Update navbar on auth state change
});

// Generate globalId for blocks that lack it (migration for legacy blocks)
function generateGlobalBlockId(ownerEmail, createdAt) {
  const safeEmail = String(ownerEmail || '').replace(/[^a-zA-Z0-9]/g, '_');
  const ts = (createdAt && !isNaN(new Date(createdAt).getTime())) ? new Date(createdAt).getTime() : Date.now();
  return `${safeEmail}_${ts}`;
}

/**
 * Ensures a block has globalId; if missing, generates and persists to Firestore.
 * Returns the globalId. Used for legacy blocks created before globalId existed.
 */
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
    block.globalId = gid; // mutate so caller sees it
  }
  return gid;
}

// Helper: Fetch all users from Firestore
async function fetchAllUsers() {
  debugLoad('firebase_fetch_all_users_enter');
  // Use sessionStorage cache from welcome.html if fresh (< 5 min)
  try {
    const cached = sessionStorage.getItem('kr_users_cache');
    const cachedTime = sessionStorage.getItem('kr_users_cache_time');
    if (cached && cachedTime) {
      const age = Date.now() - parseInt(cachedTime, 10);
      debugLoad('firebase_fetch_all_users_cache_check', {
        hasCached: true,
        ageMs: age
      });
      if (age < 5 * 60 * 1000) {
        const users = JSON.parse(cached);
        const blocksWithCollab = [];
        users.forEach(u => {
          (u.blocks || []).forEach(b => {
            if ((b.collaborators || []).length > 0) blocksWithCollab.push({ owner: u.email, title: b.title, collaborators: b.collaborators, globalId: b.globalId });
          });
        });
        console.log('[fetchAllUsers] USING CACHE: age', Math.round(age / 1000) + 's', '| users:', users.length, '| blocks with collaborators:', blocksWithCollab.length, blocksWithCollab);
        debugLoad('firebase_fetch_all_users_cache_hit', {
          count: users.length
        });
        return users;
      }
    }
  } catch (e) {
    debugLoad('firebase_fetch_all_users_cache_read_failed', {
      message: e && e.message ? e.message : String(e)
    });
  }
  debugLoad('firebase_fetch_all_users_firestore_start');
  const snapshot = await getDocs(collection(db, 'users'));
  const users = snapshot.docs.map(doc => ({
    email: doc.id,
    ...doc.data()
  }));
  const blocksWithCollab = [];
  users.forEach(u => {
    (u.blocks || []).forEach(b => {
      if ((b.collaborators || []).length > 0) blocksWithCollab.push({ owner: u.email, title: b.title, collaborators: b.collaborators, globalId: b.globalId });
    });
  });
  console.log('[fetchAllUsers] FRESH FETCH: users:', users.length, '| blocks with collaborators:', blocksWithCollab.length, blocksWithCollab);
  debugLoad('firebase_fetch_all_users_firestore_done', {
    count: users.length
  });
  return users;
}

// Helper: Get user's full profile data
async function getUserProfile(email) {
  debugLoad('firebase_get_user_profile_start', {
    email
  });
  const docRef = doc(db, 'users', email);
  const docSnap = await getDoc(docRef);
  const result = docSnap.exists() ? { email: docSnap.id, ...docSnap.data() } : null;
  debugLoad('firebase_get_user_profile_done', {
    email,
    found: !!result
  });
  return result;
}

// Helper: Get mutual connections for a user
function getMutualConnections(user, allUsers) {
  if (!user || !user.connections) return [];
  return allUsers.filter(otherUser => {
    if (otherUser.email === user.email) return false;
    const theirConnections = otherUser.connections || [];
    return user.connections.includes(otherUser.email) && 
           theirConnections.includes(user.email);
  });
}

async function getUserNotifications(userEmail) {
    debugLoad('firebase_get_user_notifications_start', {
      userEmail
    });
    if (!userEmail) return [];
    const notificationsColRef = collection(db, "users", userEmail, "notifications");
    const q = query(notificationsColRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    debugLoad('firebase_get_user_notifications_done', {
      userEmail,
      count: notifications.length
    });
    return notifications;
}

async function markNotificationsAsRead(userEmail, notificationIds) {
    if (!userEmail || !notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) return;
    const batch = writeBatch(db);
    notificationIds.forEach(id => {
        const notifRef = doc(db, "users", userEmail, "notifications", id);
        batch.update(notifRef, { read: true });
    });
    await batch.commit();
}

async function loadInitialData(user) {
    const loggedInUserStatus = document.getElementById('logged-in-user-status');
    // ... existing code ...
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
  db,
  getUserNotifications,
  markNotificationsAsRead,
  /**
   * Adds a connection atomically for the current user.
   */
  async addConnectionForCurrentUser(targetEmail) {
    if (!currentUser || !targetEmail) return;
    const userRef = doc(db, 'users', currentUser.email);
    await updateDoc(userRef, {
      connections: arrayUnion(targetEmail)
    });
  },
  /**
   * Persists a dismissed inbound connection request so it won't be shown again.
   */
  async dismissConnectionRequestForCurrentUser(targetEmail) {
    if (!currentUser || !targetEmail) return;
    const userRef = doc(db, 'users', currentUser.email);
    await updateDoc(userRef, {
      dismissedConnectionRequests: arrayUnion(targetEmail)
    });
  },
  /**
   * Adds a block's globalId to the current user's collaborations (accept collaboration).
   */
  async addCollaborationForCurrentUser(blockGlobalId) {
    if (!currentUser || !blockGlobalId) return;
    const userRef = doc(db, 'users', currentUser.email);
    await updateDoc(userRef, {
      collaborations: arrayUnion(blockGlobalId)
    });
  },
  /**
   * Persists a dismissed collaboration request so it won't be shown again.
   */
  async dismissCollaborationRequestForCurrentUser(blockGlobalId) {
    if (!currentUser || !blockGlobalId) return;
    const userRef = doc(db, 'users', currentUser.email);
    await updateDoc(userRef, {
      dismissedCollaborationRequests: arrayUnion(blockGlobalId)
    });
  }
}; 