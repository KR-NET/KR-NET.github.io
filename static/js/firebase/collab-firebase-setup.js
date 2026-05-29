// collab-firebase-setup.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  limit
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
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
const db = getFirestore(app);
const storage = getStorage(app);

const PRACTICES = [
    "3D", "Architecture", "Community Engagement", "Computing", "Graphic Design",
    "Fashion", "Film", "Fine Art", "Image", "Jewelry", "Music", "Performance Arts",
    "Photography", "Printing", "Product Design", "Publication", "Set Design", "Sound", "Writing"
].sort();

const KEYWORDS = ["COLLABORATION", "CREDIT", "PAID"];

let currentUser = null;
let currentUserProfile = null;

async function getUserProfile(email) {
  if (!email) return null;
  const docRef = doc(db, 'users', email);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { email: docSnap.id, ...docSnap.data() } : null;
}

async function uploadImage(file, path) {
    const imageStorageRef = storageRef(storage, path);
    await uploadBytes(imageStorageRef, file);
    return await getDownloadURL(imageStorageRef);
}

async function deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('https://firebasestorage.googleapis.com')) {
        return; // Not a Firebase Storage URL
    }
    try {
        const imageRef = storageRef(storage, imageUrl);
        await deleteObject(imageRef);
    } catch (error) {
        if (error.code !== 'storage/object-not-found') {
            console.error("Error deleting image by URL:", error);
        }
    }
}

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

  if (user) {
    currentUserProfile = await getUserProfile(user.email);
    const avatarSrc = currentUserProfile?.avatar || 'static/img/default-avatar.png';
    const displayText = `<strong>${currentUserProfile?.title || user.email.split('@')[0]}</strong><br>Edit your profile`;
    
    // Update desktop version
    if (userStatusDiv && userAvatarImg && userTextSpan) {
      userAvatarImg.src = avatarSrc;
      userTextSpan.innerHTML = displayText;
      userStatusDiv.style.display = 'flex';
    }
    
    // Update mobile version
    if (mobileUserStatusDiv && mobileUserAvatarImg && mobileUserTextSpan) {
      mobileUserAvatarImg.src = avatarSrc;
      mobileUserTextSpan.innerHTML = displayText;
      mobileUserStatusDiv.style.display = 'flex';
    }
    
    if (joinKRButton) {
      joinKRButton.style.display = 'none';
    }
  } else {
    currentUserProfile = null;
    const avatarSrc = 'static/img/default-avatar.png';
    const displayText = 'Log in /<br><strong>Create an Account</strong>';
    
    // Update desktop version
    if (userStatusDiv && userAvatarImg && userTextSpan) {
      userAvatarImg.src = avatarSrc;
      userTextSpan.innerHTML = displayText;
      userStatusDiv.style.display = 'flex';
    }
    
    // Update mobile version
    if (mobileUserStatusDiv && mobileUserAvatarImg && mobileUserTextSpan) {
      mobileUserAvatarImg.src = avatarSrc;
      mobileUserTextSpan.innerHTML = displayText;
      mobileUserStatusDiv.style.display = 'flex';
    }
    
    if (joinKRButton) {
      joinKRButton.style.display = 'flex';
    }
  }
  
  // Notify other scripts that authentication state is now known
  const event = new CustomEvent('auth-ready', { detail: { user: currentUser } });
  document.dispatchEvent(event);
  updateNavbarForAuth(); // Call the function to update the navbar
});

async function saveCollabPost(postData, imageFile) {
  if (!currentUser) {
    throw new Error("User must be logged in to save a post.");
  }
  if (!currentUserProfile || typeof currentUserProfile.id === 'undefined') {
    throw new Error("User profile with numeric ID not found.");
  }

  const completePostData = {
    ...postData,
    authorEmail: currentUser.email,
    authorId: currentUserProfile.id,
    authorDisplayName: currentUserProfile.title || currentUser.email.split('@')[0],
    authorAvatar: currentUserProfile.avatar || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const postCollectionRef = collection(db, "collabPosts");
  const newPostRef = doc(postCollectionRef);
  completePostData.id = newPostRef.id;

  if (imageFile) {
    const imagePath = `collabPostImages/${newPostRef.id}/${imageFile.name}`;
    const imageStorageRef = storageRef(storage, imagePath);
    await uploadBytes(imageStorageRef, imageFile);
    completePostData.imageUrl = await getDownloadURL(imageStorageRef);
    completePostData.imagePath = imagePath;
  }

  await setDoc(newPostRef, completePostData);
  return completePostData;
}

async function getCollabPosts() {
  const postsColRef = collection(db, "collabPosts");
  // Order by createdAt and get unique posts
  const q = query(postsColRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  const posts = [];
  const seenIds = new Set(); // Track seen post IDs

  snapshot.forEach(doc => {
    const postData = { id: doc.id, ...doc.data() };
    // Only add if we haven't seen this post ID before
    if (!seenIds.has(postData.id)) {
      seenIds.add(postData.id);
      posts.push(postData);
    }
  });
  return posts;
}

async function getAllUsers() {
    const usersColRef = collection(db, "users");
    const snapshot = await getDocs(usersColRef);
    const users = [];
    snapshot.forEach(doc => {
        users.push({ ...doc.data(), email: doc.id });
    });
    return users;
}

async function updateUserData(userId, data) {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, data);
}

function isAdmin() {
    return currentUser && currentUser.email === 'symonds.george@gmail.com';
}

async function sendNotifications(targets, notificationData) {
    if (!isAdmin()) {
        throw new Error("Insufficient permissions.");
    }

    // First, store a single entry in the global log
    const sentNotificationsLogRef = collection(db, "sentNotifications");
    const newLogEntryRef = await addDoc(sentNotificationsLogRef, {
        ...notificationData,
        target: targets, // 'all' or an array of emails
        sentAt: serverTimestamp(),
    });

    const isToAll = targets === 'all';
    let finalTargetEmails = [];

    if (isToAll) {
        const allUsers = await getAllUsers();
        finalTargetEmails = allUsers.map(u => u.email);
    } else {
        finalTargetEmails = targets;
    }

    // Now fan-out to each user in batches
    const BATCH_SIZE = 499;
    for (let i = 0; i < finalTargetEmails.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const emailChunk = finalTargetEmails.slice(i, i + BATCH_SIZE);

        emailChunk.forEach(email => {
            const notificationRef = doc(collection(db, "users", email, "notifications"));
            batch.set(notificationRef, {
                ...notificationData,
                timestamp: serverTimestamp(),
                read: false,
                logId: newLogEntryRef.id // Link back to the central log entry
            });
        });

        console.log(`Sending notifications to batch of ${emailChunk.length} users...`);
        await batch.commit();
    }

    console.log("Finished sending notifications.");
    return newLogEntryRef.id;
}

async function getAllSentNotifications() {
    if (!isAdmin()) {
        throw new Error("Insufficient permissions.");
    }
    const notificationsColRef = collection(db, "sentNotifications");
    const q = query(notificationsColRef, orderBy("sentAt", "desc"));
    const snapshot = await getDocs(q);
    const notifications = [];
    snapshot.forEach(doc => {
        notifications.push({ id: doc.id, ...doc.data() });
    });
    return notifications;
}

async function updateSentNotification(notificationId, notificationData) {
    if (!isAdmin()) {
        throw new Error("Insufficient permissions.");
    }
    const notificationRef = doc(db, "sentNotifications", notificationId);
    await updateDoc(notificationRef, {
        ...notificationData,
        updatedAt: serverTimestamp()
    });
}

async function deleteSentNotification(notificationId) {
    if (!isAdmin()) {
        throw new Error("Insufficient permissions.");
    }
    const notificationRef = doc(db, "sentNotifications", notificationId);
    await deleteDoc(notificationRef);
    // Note: This does not remove the notification from individual user inboxes.
}

async function deleteUserAndData(userEmailToDelete) {
    if (!isAdmin()) {
        throw new Error("Insufficient permissions to delete a user.");
    }
    console.log(`Starting deletion process for ${userEmailToDelete}`);

    const db = getFirestore();
    const userRef = doc(db, "users", userEmailToDelete);

    console.log('Step 1: Reading user document...');
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        console.warn(`User document for ${userEmailToDelete} not found. Cleaning up posts anyway.`);
    } else {
        const userData = userDoc.data();
        console.log('Step 2: Deleting user storage files (avatar, blocks)...');
        if (userData.avatar) {
            await deleteImage(userData.avatar);
        }
        if (userData.blocks && Array.isArray(userData.blocks)) {
            for (const block of userData.blocks) {
                if (block.type === 'carousel' && block.slides) {
                    for (const slide of block.slides) {
                        if(slide.icon) await deleteImage(slide.icon);
                    }
                } else if (block.icon) {
                    await deleteImage(block.icon);
                }
            }
        }
        console.log('Storage file deletion complete.');
    }

    console.log("Step 3: Deleting user's collab posts...");
    const postsQuery = query(collection(db, "collabPosts"), where("authorEmail", "==", userEmailToDelete));
    const postsSnapshot = await getDocs(postsQuery);
    for (const postDoc of postsSnapshot.docs) {
        await deleteCollabPost(postDoc.id, postDoc.data().imagePath);
    }
    console.log("Collab post deletion complete.");

    console.log("Step 4: Removing user from other users' connections...");
    const allUsersQuery = query(collection(db, "users"));
    const allUsersSnapshot = await getDocs(allUsersQuery);
    for (const otherUserDoc of allUsersSnapshot.docs) {
        const otherUserData = otherUserDoc.data();
        if (otherUserData.connections && otherUserData.connections.includes(userEmailToDelete)) {
            console.log(`Removing ${userEmailToDelete} from connections of ${otherUserDoc.id}`);
            const updatedConnections = otherUserData.connections.filter(email => email !== userEmailToDelete);
            await updateDoc(otherUserDoc.ref, { connections: updatedConnections });
        }
    }
    console.log("Connections cleanup complete.");

    console.log("Step 5: Deleting the user document itself...");
    if(userDoc.exists()) {
       await deleteDoc(userRef);
    }
    console.log('User document deletion complete.');
    
    console.log(`Deletion process for ${userEmailToDelete} completed.`);
    // NOTE: The Firebase Auth user must be deleted manually from the Firebase Console.
}

async function updateCollabPost(postId, updatedData, oldImagePath, newImageFile) {
  if (!currentUser) {
    throw new Error("User must be logged in to update a post.");
  }

  const postRef = doc(db, "collabPosts", postId);
  const postDoc = await getDoc(postRef);
  
  if (!postDoc.exists()) {
    throw new Error("Post not found.");
  }

  const postData = postDoc.data();
  if (postData.authorEmail !== currentUser.email && currentUser.email !== 'symonds.george@gmail.com') {
    throw new Error("You can only edit your own posts.");
  }

  // Create update data object with only the fields that should be updated
  const updateData = {
    title: updatedData.title,
    info: updatedData.info,
    keywords: updatedData.keywords,
    practices: updatedData.practices,
    date: updatedData.date,
    time: updatedData.time,
    updatedAt: serverTimestamp()
  };

  // Handle image updates
  if (newImageFile) {
    // Delete old image if it exists
    if (oldImagePath) {
      const oldImageRef = storageRef(storage, oldImagePath);
      try {
        await deleteImage(oldImageRef);
      } catch (error) {
        console.error("Error deleting old image:", error);
      }
    }

    // Upload new image
    const imagePath = `collabPostImages/${postId}/${newImageFile.name}`;
    const imageStorageRef = storageRef(storage, imagePath);
    await uploadBytes(imageStorageRef, newImageFile);
    updateData.imageUrl = await getDownloadURL(imageStorageRef);
    updateData.imagePath = imagePath;
  }

  // Use updateDoc instead of setDoc to ensure we're only updating fields
  await updateDoc(postRef, updateData);
  
  // Return the updated post data
  return {
    id: postId,
    ...postData,
    ...updateData
  };
}

async function deleteCollabPost(postId, imagePath) {
  if (!currentUser) {
    throw new Error("User must be logged in to delete a post.");
  }

  const postRef = doc(db, "collabPosts", postId);
  const postDoc = await getDoc(postRef);
  
  if (!postDoc.exists()) {
    throw new Error("Post not found.");
  }

  const postData = postDoc.data();
  if (postData.authorEmail !== currentUser.email && currentUser.email !== 'symonds.george@gmail.com') {
    throw new Error("You can only delete your own posts.");
  }

  // Delete image if it exists
  if (imagePath) {
    const imageRef = storageRef(storage, imagePath);
    try {
      await deleteImage(imageRef);
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  }

  await deleteDoc(postRef);
  return true;
}

async function getCollabPostById(postId) {
    if (!postId) return null;
    const postRef = doc(db, "collabPosts", postId);
    const docSnap = await getDoc(postRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        console.error("No such document!");
        return null;
    }
}

async function getGlobalBlocks(limitVal = 25, startAfterDoc = null) {
  const blocksCol = collection(db, 'globalBlocks');
  let q = query(blocksCol, orderBy('createdAt', 'desc'), limit(limitVal));
  if (startAfterDoc) {
    const { startAfter } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    q = query(blocksCol, orderBy('createdAt','desc'), startAfter(startAfterDoc), limit(limitVal));
  }
  return await getDocs(q);
}

async function updateGlobalBlock(blockId, data) {
  if (!isAdmin()) throw new Error('Admin only');
  const refDoc = doc(db,'globalBlocks', blockId);
  await updateDoc(refDoc, data);
}

async function deleteGlobalBlockCascade(blockId) {
  if (!isAdmin()) throw new Error('Admin only');
  const blockRef = doc(db,'globalBlocks',blockId);
  const blockSnap = await getDoc(blockRef);
  if (!blockSnap.exists()) return;
  const blk = blockSnap.data();
  await deleteDoc(blockRef);
  // remove from owner's blocks array
  if (blk.owner) {
    const ownerRef = doc(db,'users', blk.owner);
    try {
      const ownerSnap = await getDoc(ownerRef);
      if (ownerSnap.exists()) {
        const arr = ownerSnap.data().blocks || [];
        const filtered = arr.filter(b => b.globalId !== blockId);
        await updateDoc(ownerRef,{ blocks: filtered });
      }
    }catch(e){console.error('owner update',e);}  }
  // delete images
  if (blk.icon) await deleteImage(blk.icon);
  if (blk.type==='carousel' && Array.isArray(blk.slides)) {
    for (const s of blk.slides){ if (s.icon) await deleteImage(s.icon);} }
}

async function getBlockComments(blockId, limitVal=50){
  const commentsCol = collection(db,'globalBlocks',blockId,'comments');
  const q = query(commentsCol, orderBy('timestamp','desc'), limit(limitVal));
  return await getDocs(q);
}

async function deleteBlockComment(blockId, commentId){
  if(!isAdmin()) throw new Error('Admin only');
  await deleteDoc(doc(db,'globalBlocks',blockId,'comments',commentId));
}

window.collabFirebaseUtils = {
  auth,
  onAuthStateChanged,
  get currentUser() {
    return currentUser;
  },
  get currentUserProfile() {
    return currentUserProfile;
  },
  db,
  storage,
  getUserProfile,
  saveCollabPost,
  getCollabPosts,
  updateCollabPost,
  deleteCollabPost,
  getAllUsers,
  PRACTICES,
  KEYWORDS,
  updateUserData,
  deleteUserAndData,
  sendNotifications,
  getAllSentNotifications,
  updateSentNotification,
  deleteSentNotification,
  uploadImage,
  deleteImage,
  getCollabPostById,
  getGlobalBlocks,
  updateGlobalBlock,
  deleteGlobalBlockCascade,
  getBlockComments,
  deleteBlockComment
}; 