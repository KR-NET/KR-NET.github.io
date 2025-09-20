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

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
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
    const userProfile = await getUserProfile(user.email);
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
  }
  updateNavbarForAuth(); // Update navbar on auth state change
});

// Helper: Fetch all users from Firestore
async function fetchAllUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(doc => ({
    email: doc.id,
    ...doc.data()
  }));
}

// Helper: Get user's full profile data
async function getUserProfile(email) {
  const docRef = doc(db, 'users', email);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { email: docSnap.id, ...docSnap.data() } : null;
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
    if (!userEmail) return [];
    const notificationsColRef = collection(db, "users", userEmail, "notifications");
    const q = query(notificationsColRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  fetchAllUsers,
  getUserProfile,
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
  }
}; 