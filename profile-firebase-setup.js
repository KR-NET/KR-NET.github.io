// firebase-setup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  runTransaction,
  onSnapshot,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

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
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfo = document.getElementById("user-info");
const welcomePopup = document.getElementById('welcome-popup');
const welcomeJoinBtn = document.getElementById('welcome-join-btn');
const previewBtn = document.getElementById('preview-page-btn');

let currentUser = null;
let unsubscribeFromUserData = null;

// Function to update the navbar link
function updateNavbarForAuth() {
  const profileLink = document.querySelector('.kr-navbar a[href="profile.html"], .kr-mobile-navbar a[href="profile.html"]');
  if (!profileLink) return;

  const isLoggedIn = auth.currentUser;
  
  if (isLoggedIn) {
    if (profileLink.matches('.kr-navbar a')) {
        profileLink.textContent = 'YOUR PROFILE';
    } else { // Mobile navbar
        const span = profileLink.querySelector('span');
        if (span) span.textContent = 'PROFILE';
    }
  } else {
    if (profileLink.matches('.kr-navbar a')) {
        profileLink.textContent = 'JOIN';
    } else { // Mobile navbar
        const span = profileLink.querySelector('span');
        if (span) span.textContent = 'PROFILE';
    }
  }
}

loginBtn.onclick = async () => {
    console.log("btn clicked")
  const result = await signInWithPopup(auth, provider);
};

logoutBtn.onclick = () => {
  signOut(auth);
};

// Helper function to get the next user ID using a transaction
async function getNextUserId() {
  const counterRef = doc(db, "metadata", "userCounter");
  try {
    const newId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextId = 1;
      if (counterDoc.exists()) {
        nextId = counterDoc.data().lastId + 1;
      }
      transaction.set(counterRef, { lastId: nextId }, { merge: true });
      return nextId;
    });
    return newId;
  } catch (e) {
    console.error("Transaction failed: ", e);
    throw e; // Re-throw to handle it in the calling function
  }
}

onAuthStateChanged(auth, async (user) => {
  const addBlockBtn = document.getElementById("add-block");
  const profileProgressSection = document.getElementById("profileProgressSection");
  
  // If we have an active listener, unsubscribe from it before proceeding
  if (unsubscribeFromUserData) {
    unsubscribeFromUserData();
    unsubscribeFromUserData = null;
  }

  window.startLoading();
  try {
    if (user) {
      currentUser = user;
      if (previewBtn) {
        previewBtn.style.display = 'inline-flex';
        previewBtn.disabled = true;
      }
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      if (welcomePopup) welcomePopup.style.display = 'none';

      const userDocRef = doc(db, "users", user.email);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        try {
          const newUserId = await getNextUserId();
          await setDoc(userDocRef, { id: newUserId, email: user.email, createdAt: new Date().toISOString() }, { merge: true });
          console.log(`New user created with ID: ${newUserId}`);
        } catch (error) {
          console.error("Failed to create new user with ID:", error);
          signOut(auth);
          window.stopLoading();
          return;
        }
      }
      
      // Set up the real-time listener for user data
      setupUserDataListener(user.email);
      
      addBlockBtn.classList.remove("disabled-btn");
      
      if (window.refreshConnectionsOnLoad) {
        await window.refreshConnectionsOnLoad();
      }
    } else {
      currentUser = null;
      if (previewBtn) {
        previewBtn.style.display = 'none';
      }
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      if (welcomePopup) welcomePopup.style.display = 'flex';
      document.getElementById("profile-title").value = "";
      document.getElementById("bio").value = "";
      document.getElementById("instagram").value = "";
      document.getElementById("youtube").value = "";
      document.getElementById("tiktok").value = "";
      document.getElementById("avatar-preview").src = "static/img/default-avatar.png"; // Corrected default avatar
      if (window.renderBlocks) window.renderBlocks([]);
      document.getElementById("profile-title-display").textContent = "Please log in to view your profile";
      addBlockBtn.classList.add("disabled-btn");
      
      if (window.renderConnectionsList) {
        window.renderConnectionsList();
      }
      // Reset progress bar on logout
      if (window.updateProfileProgress) window.updateProfileProgress(false, false, false);
      if (profileProgressSection) profileProgressSection.style.display = 'block';
    }
    updateNavbarForAuth(); // Update navbar on auth state change
  } finally {
    window.stopLoading();
  }
});

// Event listener for the JOIN button inside the welcome popup
if (welcomeJoinBtn && loginBtn) {
  welcomeJoinBtn.onclick = () => {
    loginBtn.click();
  };
}

// --- Help Button Event Listeners ---
const helpModal = document.getElementById('help-modal');
const helpModalTitle = document.getElementById('help-modal-title');
const helpModalText = document.getElementById('help-modal-text');
const helpModalClose = document.getElementById('help-modal-close');

const helpContent = {
    'profile-help-btn': {
        title: 'PROFILE HELP',
        text: "This section is for your personal details.<br><br>" +
              "<b>- Title:</b> Your name or creative handle.<br>" +
              "<b>- Bio:</b> A short description of yourself and your work.<br>" +
              "<b>- Links:</b> Your social media handles.<br>" +
              "<b>- Avatar:</b> Upload a profile picture."
    },
    'connections-help-btn': {
        title: 'CONNECTIONS HELP',
        text: "This section shows the other creatives you have connected with.<br><br>" +
              "You can connect with others from the NETWORK page. When you connect with someone, they will also see you in their connections list."
    },
    'blocks-help-btn': {
        title: 'BLOCKS HELP',
        text: "Blocks are the building blocks of your profile. They showcase your skills, projects, or interests.<br><br>" +
              "<b>- Add Block:</b> Click to create a new block.<br>" +
              "<b>- Block Types:</b> Choose from different types like images, text, or links.<br>" +
              "<b>- Rearrange:</b> Drag and drop blocks to reorder them."
    }
};

document.addEventListener('click', (e) => {
    const helpBanner = e.target.closest('.help-banner');
    if (helpBanner) {
        const helpKey = helpBanner.dataset.help;
        const content = helpContent[helpKey];
        if (content && helpModal) {
            helpModalTitle.textContent = content.title;
            helpModalText.innerHTML = content.text;
            helpModal.style.display = 'flex';
        }
    }
});

if (helpModalClose) {
    helpModalClose.onclick = () => {
        helpModal.style.display = 'none';
    };
}

window.onclick = (event) => {
    if (event.target == helpModal) {
        helpModal.style.display = 'none';
    }
};

function setupUserDataListener(email) {
  console.log('Setting up real-time listener for user data:', email);
  const docRef = doc(db, "users", email);

  unsubscribeFromUserData = onSnapshot(docRef, (docSnap) => {
    console.log("User data updated in real-time.");
    const profileProgressSection = document.getElementById("profileProgressSection");
    const previewBtn = document.getElementById('preview-page-btn');

    let hasProfileDetails = false;
    let hasConnections = false;
    let hasBlocks = false;
    let data = {};

    if (docSnap.exists()) {
      data = docSnap.data();
      if (window.firebaseUtils) {
        window.firebaseUtils.currentUserDoc = data;
      }

      if (previewBtn && data.id) {
        previewBtn.disabled = false;
      } else if (previewBtn) {
        previewBtn.disabled = true;
      }
      
      // Update form fields, but avoid interrupting the user if they are typing
      if (document.activeElement.id !== "profile-title") {
        document.getElementById("profile-title").value = data.title || "";
      }
      if (document.activeElement.id !== "bio") {
        document.getElementById("bio").value = data.bio || "";
      }
      if (document.activeElement.id !== "instagram") {
        document.getElementById("instagram").value = data.instagram || "";
      }
      if (document.activeElement.id !== "youtube") {
        document.getElementById("youtube").value = data.youtube || "";
      }
      if (document.activeElement.id !== "tiktok") {
        document.getElementById("tiktok").value = data.tiktok || "";
      }

      if (data.avatar) {
        document.getElementById("avatar-preview").src = data.avatar;
      }
      document.getElementById("profile-title-display").textContent = data.title || "";

      // Check for profile details
      const hasSocialLink = data.instagram || data.youtube || data.tiktok;
      const hasPractices = Array.isArray(data.practices) && data.practices.length > 0;
      if (data.avatar && data.title && data.bio && hasSocialLink && hasPractices) {
          hasProfileDetails = true;
      }

      // Check for connections
      if (Array.isArray(data.connections) && data.connections.length > 0) {
          hasConnections = true;
      }

      // Check for blocks
      if (Array.isArray(data.blocks) && data.blocks.length > 0) {
          hasBlocks = true;
          if (window.renderBlocks) window.renderBlocks(data.blocks);
      } else {
          if (window.renderBlocks) window.renderBlocks([]);
      }
      
      // Load practices
      if (window.renderPracticePills) {
        window.renderPracticePills(Array.isArray(data.practices) ? data.practices : []);
      }
    } else {
      console.log("No such user document!");
      if (window.firebaseUtils) {
        window.firebaseUtils.currentUserDoc = {}; // Clear data on error/logout
      }
      if (previewBtn) {
        previewBtn.disabled = true;
      }
      if (window.renderPracticePills) window.renderPracticePills([]);
      if (window.renderBlocks) window.renderBlocks([]);
    }

    // Update the progress bar
    if (window.updateProfileProgress) {
      window.updateProfileProgress(hasProfileDetails, hasConnections, hasBlocks);
    }

    // Initialize collapsible sections
    if (window.initializeCollapsibleSections) {
      window.initializeCollapsibleSections(data);
    }

    // Control visibility of the profile progress section
    if (profileProgressSection) {
      if (hasProfileDetails && hasConnections && hasBlocks) {
        profileProgressSection.style.display = 'none';
      } else {
        profileProgressSection.style.display = 'block';
      }
    }
  });
}

async function saveUserData(email, profileData) {
  try {
    if (!auth.currentUser) {
      console.error('No authenticated user');
      return;
    }
    
    const docRef = doc(db, "users", email);
    // Ensure the 'id' field is not overwritten if it exists
    const userDocSnap = await getDoc(docRef);
    if (userDocSnap.exists() && userDocSnap.data().id !== undefined) {
      if (profileData.id !== undefined) {
        delete profileData.id; // Prevent overwriting existing id
      }
    }
    await setDoc(docRef, profileData, { merge: true });
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error; // Re-throw to handle in the calling function
  }
}

async function uploadImage(file, path) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

async function deleteImage(url) {
  try {
    // Extract the path from the URL
    const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error("Error deleting image:", error);
  }
}

// --- CONNECTIONS HELPERS ---

async function getAllUsers() {
  return await getDocs(collection(db, 'users'));
}

function getUserDocRef(email) {
  return doc(db, 'users', email);
}

async function updateConnections(docRef, connections) {
  await updateDoc(docRef, { connections });
}

// === Global Blocks Helpers ===
function generateGlobalBlockId(ownerEmail, createdAt) {
  // Replace disallowed chars in email and combine with timestamp for uniqueness
  const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
  return `${safeEmail}_${new Date(createdAt).getTime()}`;
}

async function upsertGlobalBlock(ownerEmail, block) {
  if (!block) return;
  const id = block.globalId || generateGlobalBlockId(ownerEmail, block.createdAt || Date.now());
  block.globalId = id; // ensure stored in user doc as well

  const blockDocRef = doc(db, 'globalBlocks', id);
  const payload = {
    owner: ownerEmail,
    createdAt: block.createdAt || new Date().toISOString(),
    title: block.title || '',
    desc: block.desc || '',
    link: block.link || '',
    icon: block.icon || '',
    type: block.type || 'default',
    slides: block.slides || [],
    upvotes: block.upvotes || 0,
    downvotes: block.downvotes || 0,
    score: (block.upvotes || 0) - (block.downvotes || 0),
  };
  await setDoc(blockDocRef, payload, { merge: true });
  return id;
}

async function deleteGlobalBlock(globalId) {
  if (!globalId) return;
  try {
    await deleteDoc(doc(db, 'globalBlocks', globalId));
  } catch (err) {
    console.error('Error deleting global block', err);
  }
}

window.firebaseUtils = {
  get currentUser() {
    return currentUser;
  },
  saveUserData,
  uploadImage,
  deleteImage,
  getAllUsers,
  getUserDocRef,
  updateConnections,
  db,
  upsertGlobalBlock,
  deleteGlobalBlock,
};
