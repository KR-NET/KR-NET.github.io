document.addEventListener('DOMContentLoaded', () => {
    const authorizedEmail = 'symonds.george@gmail.com';

    if (!window.collabFirebaseUtils) {
        console.error("Firebase utils not loaded!");
        alert("A critical component is missing. Please refresh and try again.");
        return;
    }

    const {
        auth,
        onAuthStateChanged,
        getAllUsers,
        deleteUserAndData,
        getCollabPosts,
        deleteCollabPost,
        sendNotifications,
        getAllSentNotifications,
        updateSentNotification,
        deleteSentNotification
    } = window.collabFirebaseUtils;

    let allUsers = [];
    let allPosts = [];
    let allSentNotifications = [];
    let currentlyEditingNotificationId = null;
    let isUserFormDirty = false;

    // --- State for User Block Editor ---
    let currentlyEditingUser = null;
    let currentlyEditingUserBlocks = [];
    let editingBlockIndex = null;
    let currentBlockType = 'default';
    let carouselSlides = [];
    const DEFAULT_ICON = 'static/img/default-icon.png';
    let currentEmbed = null; // { provider: 'youtube'|'spotify', embedUrl: string }

    const adminContent = document.getElementById('admin-content');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loginPrompt = document.getElementById('login-prompt');
    const userListDiv = document.getElementById('user-list');
    const searchInput = document.getElementById('search-input');
    const postsListDiv = document.getElementById('posts-list');
    const sendNotificationForm = document.getElementById('send-notification-form');
    const notificationUserSelect = document.getElementById('notification-user-select');
    const notificationCategoryInput = document.getElementById('notification-category');
    const notificationTitleInput = document.getElementById('notification-title');
    const notificationMessageInput = document.getElementById('notification-message');
    const notificationImageUrlInput = document.getElementById('notification-image-url');
    const notificationLinkInput = document.getElementById('notification-link');
    const sendNotificationBtn = document.getElementById('send-notification-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const notificationSearchInput = document.getElementById('notification-search-input');
    const notificationUserFilterInput = document.getElementById('notification-user-filter-input');
    const clearNotificationFiltersBtn = document.getElementById('clear-notification-filters-btn');
    const sentNotificationsList = document.getElementById('sent-notifications-list');

    let allBlocks = [];
    let lastBlockDoc = null;

    const setUIState = (state) => {
        loadingIndicator.style.display = state === 'loading' ? 'block' : 'none';
        loginPrompt.style.display = state === 'login' ? 'block' : 'none';
        adminContent.style.display = state === 'content' ? 'block' : 'none';
    };

    onAuthStateChanged(auth, async (user) => {
        if (user && user.email === authorizedEmail) {
            setUIState('loading');
            await loadInitialData();
            setUIState('content');
        } else {
            setUIState('login');
        }
    });

    async function loadInitialData() {
        await Promise.all([loadUsers(), loadPosts(), loadSentNotifications(), loadBlocks()]);
    }

    async function loadUsers() {
        try {
            allUsers = await getAllUsers();
            renderUsers();
            populateUserSelect();
        } catch (e) {
            userListDiv.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    async function loadPosts() {
        try {
            allPosts = await getCollabPosts();
            renderPosts();
        } catch (e) {
            postsListDiv.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    async function loadSentNotifications() {
        try {
            allSentNotifications = await getAllSentNotifications();
            renderSentNotifications();
        } catch (e) {
            sentNotificationsList.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    async function loadBlocks(reset=false){
        if(reset){ allBlocks=[]; lastBlockDoc=null; document.getElementById('blocks-list').innerHTML=''; }
        const snap = await window.collabFirebaseUtils.getGlobalBlocks(25,lastBlockDoc);
        if(snap.docs.length===0) return;
        lastBlockDoc = snap.docs[snap.docs.length-1];
        snap.forEach(ds=>{ allBlocks.push({id:ds.id,...ds.data()}); });
        renderBlocks();
    }

    function esc(text){
        const t = (text == null) ? '' : String(text);
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function renderUsers() {
        const term = searchInput.value.toLowerCase();
        const filtered = allUsers.filter(u => (u.title || u.email).toLowerCase().includes(term));
        userListDiv.innerHTML = `<ul>${filtered.map((u, index) => `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0;">
                <span>${esc(u.title || u.email)}</span>
                    <div>
                        <button class="admin-edit-btn" data-type="user" data-index="${index}">Edit</button>
                    <button class="admin-delete-btn" data-type="user" data-email="${u.email}">Delete</button>
                    </div>
            </li>`).join('') || '<li>No users found.</li>'}</ul>`;
    }

    function renderPosts() {
        postsListDiv.innerHTML = `<ul>${allPosts.map(p => `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0;">
                <span>${esc(p.title)} (by ${esc(p.authorDisplayName)})</span>
                <button class="admin-delete-btn" data-type="post" data-id="${p.id}" data-image-path="${p.imagePath || ''}">Delete</button>
            </li>`).join('') || '<li>No posts found.</li>'}</ul>`;
    }

    function renderSentNotifications() {
        const keyword = notificationSearchInput.value.toLowerCase();
        const userFilter = notificationUserFilterInput.value.toLowerCase();
        const filtered = allSentNotifications.filter(n => {
            const matchesKeyword = (n.title || '').toLowerCase().includes(keyword) || (n.body || '').toLowerCase().includes(keyword);
            const target = n.target || [];
            let matchesUser = !userFilter || (target === 'all' && 'all'.includes(userFilter));
            if (userFilter && Array.isArray(target)) {
                matchesUser = target.some(email => email.toLowerCase().includes(userFilter));
            }
            return matchesKeyword && matchesUser;
        });

        sentNotificationsList.innerHTML = filtered.map(n => {
            const sentDate = n.sentAt ? new Date(n.sentAt.seconds * 1000).toLocaleString() : 'N/A';
            const categoryHTML = n.category ? `<span class="notification-category-tag">${esc(n.category)}</span>` : '';
            const imageHTML = n.imageUrl ? `<img src="${n.imageUrl}" style="max-width: 100px; max-height: 100px; object-fit: cover; margin-top: 10px; border-radius: 4px;">` : '';
            const linkHTML = n.link ? `<a href="${n.link}" target="_blank" rel="noopener noreferrer" class="notification-link">View More</a>` : '';

            return `<div class="notification-item">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h4>${esc(n.title || 'No Title')}</h4>
                    ${categoryHTML}
                </div>
                <p>${esc(n.body || 'No Message')}</p>
                ${imageHTML}
                <small>To: ${Array.isArray(n.target) ? n.target.map(esc).join(', ') : esc(n.target)}</small><br>
                <small>Sent: ${sentDate}</small>
                <div class="notification-actions">
                    ${linkHTML}
                    <button class="edit-notification-btn" data-id="${n.id}">Edit</button>
                    <button class="delete-notification-btn" data-id="${n.id}">Delete</button>
                </div>
            </div>`;
        }).join('') || '<p>No notifications found.</p>';
    }

    function renderBlocks(){
        const listDiv = document.getElementById('blocks-list');
        if(!listDiv) return;
        const term = (document.getElementById('blocks-search-input').value||'').toLowerCase();
        const sortVal = document.getElementById('gb-sort-select') ? document.getElementById('gb-sort-select').value : 'recent';
        const filtered = allBlocks.filter(b=> (b.title||'').toLowerCase().includes(term) || (b.owner||'').toLowerCase().includes(term));

        const relevanceScore = (blk)=>{
            const score = (blk.up||0) - (blk.down||0);
            const comments = blk.commentCount || 0;
            let recency = 0;
            if(blk.createdAt){
               let ts = 0;
               const c = blk.createdAt;
               if(typeof c === 'object' && typeof c.toDate === 'function') ts = c.toDate().getTime();
               else if(typeof c === 'object' && 'seconds' in c) ts = c.seconds*1000;
               else ts = new Date(c).getTime();
               const hoursOld = (Date.now() - ts)/3600000;
               if(hoursOld < 72){ recency = 36 - (hoursOld/72)*36; }
            }
            return score + comments + recency;
        };

        let sorted = [...filtered];
        if(sortVal==='votes'){
            sorted.sort((a,b)=> ((b.up||0)-(b.down||0)) - ((a.up||0)-(a.down||0)) );
        }else if(sortVal==='relevant'){
            sorted.sort((a,b)=> relevanceScore(b) - relevanceScore(a));
        }else{ // recent
            sorted.sort((a,b)=>{
              const getTime = (blk)=>{
                const c = blk.createdAt;
                if(!c) return 0;
                if(typeof c === 'object' && typeof c.toDate === 'function') return c.toDate().getTime();
                if(typeof c === 'object' && 'seconds' in c) return c.seconds*1000;
                return new Date(c).getTime();
              };
              return getTime(b) - getTime(a);
            });
        }

        listDiv.innerHTML = `<ul>${sorted.map(b => `
             <li style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
               <span>${esc(b.title || '(no title)')} <small>(${esc(b.owner)})</small></span>
               <div>
                 <button class="admin-edit-btn" data-type="gblock" data-id="${b.id}">Edit</button>
                 <button class="admin-delete-btn" data-type="gblock" data-id="${b.id}">Delete</button>
               </div>
             </li>`).join('') || '<li>No blocks found.</li>'}</ul>`;
    }

    function populateUserSelect() {
        notificationUserSelect.innerHTML = '<option value="all">All Users</option>' + 
            allUsers.map(u => `<option value="${u.email}">${esc(u.title || u.email)}</option>`).join('');
    }

    function resetNotificationForm() {
        sendNotificationForm.reset();
        currentlyEditingNotificationId = null;
        sendNotificationBtn.textContent = 'Send Notification';
        cancelEditBtn.style.display = 'none';
        notificationUserSelect.value = 'all';
    }
    
    searchInput.addEventListener('input', renderUsers);
    clearNotificationFiltersBtn.addEventListener('click', () => {
        notificationSearchInput.value = '';
        notificationUserFilterInput.value = '';
        renderSentNotifications();
    });
    notificationSearchInput.addEventListener('input', renderSentNotifications);
    notificationUserFilterInput.addEventListener('input', renderSentNotifications);
    cancelEditBtn.addEventListener('click', resetNotificationForm);

    document.addEventListener('click', async (e) => {
        const button = e.target;
        const id = button.dataset.id;
        
        if (button.matches('.admin-delete-btn')) {
            const type = button.dataset.type;
            if (type === 'user') {
                const email = button.dataset.email;
                if (confirm(`Delete user ${email}?`)) {
                    button.disabled = true;
                    await deleteUserAndData(email).catch(err => alert(`Error: ${err.message}`));
                    await loadUsers();
                }
            } else if (type === 'post') {
                const imagePath = button.dataset.imagePath;
                if (confirm(`Delete post ${id}?`)) {
                    button.disabled = true;
                    await deleteCollabPost(id, imagePath).catch(err => alert(`Error: ${err.message}`));
                    await loadPosts();
                }
            } else if (type === 'gblock') {
                if (confirm(`Delete block ${id}?`)) {
                    button.disabled = true;
                    await window.collabFirebaseUtils.deleteGlobalBlockCascade(id).catch(err => alert(`Error: ${err.message}`));
                    await loadBlocks(true);
                }
            }
        } else if (button.matches('.edit-notification-btn')) {
            const notif = allSentNotifications.find(n => n.id === id);
            if (notif) {
                notificationTitleInput.value = notif.title;
                notificationMessageInput.value = notif.body;
                notificationCategoryInput.value = notif.category || 'KR News';
                notificationImageUrlInput.value = notif.imageUrl || '';
                notificationLinkInput.value = notif.link || '';
                Array.from(notificationUserSelect.options).forEach(opt => {
                    opt.selected = (notif.target === 'all' && opt.value === 'all') || 
                                 (Array.isArray(notif.target) && notif.target.includes(opt.value));
                });
                currentlyEditingNotificationId = id;
                sendNotificationBtn.textContent = 'Update Notification';
                cancelEditBtn.style.display = 'inline-block';
                sendNotificationForm.scrollIntoView({ behavior: 'smooth' });
            }
        } else if (button.matches('.delete-notification-btn')) {
            if (confirm(`Delete notification ${id}?`)) {
                button.disabled = true;
                await deleteSentNotification(id).catch(err => alert(`Error: ${err.message}`));
                await loadSentNotifications();
            }
        } else if (button.matches('.admin-edit-btn[data-type="user"]')) {
            const index = button.dataset.index;
            openEditUserModal(allUsers[index]);
        } else if (button.matches('.admin-edit-btn[data-type="gblock"]')) {
            openEditBlockModal(allBlocks.find(b => b.id === id));
        }
    });

    sendNotificationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = notificationTitleInput.value.trim();
        const body = notificationMessageInput.value.trim();
        const category = notificationCategoryInput.value;
        const imageUrl = notificationImageUrlInput.value.trim();
        const link = notificationLinkInput.value.trim();
        let target = Array.from(notificationUserSelect.selectedOptions).map(opt => opt.value);

        if (!title || !body || target.length === 0) {
            return alert("All fields are required.");
        }
        if (target.includes('all')) target = 'all';

        sendNotificationBtn.disabled = true;
        const data = { 
            title, 
            body, 
            target, 
            category,
            imageUrl: imageUrl || null,
            link: link || null
        };

        try {
            if (currentlyEditingNotificationId) {
                await updateSentNotification(currentlyEditingNotificationId, data);
            } else {
                const { target: notificationTarget, ...notificationData } = data;
                await sendNotifications(notificationTarget, notificationData);
            }
            resetNotificationForm();
            await loadSentNotifications();
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            sendNotificationBtn.disabled = false;
        }
    });

    // --- User Edit Modal & Block Editor Logic (Ported from app.js) ---

    // Recursively finds the correct modal, even if nested.
    function findParentModal(element) {
        if (!element) return null;
        if (element.classList.contains('modal')) return element;
        return findParentModal(element.parentElement);
    }

    function getUserFormHTML(user = {}, allUsers = []) {
        const userConnections = user.connections || [];
        const userPractices = user.practices || [];
        const { PRACTICES } = window.collabFirebaseUtils;

        const otherUsers = allUsers.filter(u => u.email !== user.email);

        const connectionsCheckboxesHTML = otherUsers.map(otherUser => {
            const isConnected = userConnections.includes(otherUser.email);
            return `
                <div style="display: block; margin-bottom: 5px;">
                    <label style="cursor: pointer; display: flex; align-items: center;">
                        <input type="checkbox" class="user-connection-checkbox" value="${otherUser.email}" ${isConnected ? 'checked' : ''} style="margin-right: 8px;">
                        ${otherUser.title || otherUser.email}
                    </label>
                </div>`;
        }).join('');
        
        const practicesHTML = PRACTICES.map(p => {
            const isSelected = userPractices.includes(p);
            return `<button type="button" class="practice-pill ${isSelected ? 'selected' : ''}" data-practice="${p}">${p}</button>`;
        }).join('');

        // Format createdAt date
        let createdAtFormatted = 'N/A';
        if (user.createdAt) {
            try {
                let dateObj;
                if (typeof user.createdAt === 'object' && typeof user.createdAt.toDate === 'function') {
                    dateObj = user.createdAt.toDate();
                } else if (typeof user.createdAt === 'object' && 'seconds' in user.createdAt) {
                    dateObj = new Date(user.createdAt.seconds * 1000);
                } else {
                    dateObj = new Date(user.createdAt);
                }
                createdAtFormatted = dateObj.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                console.error('Error formatting date:', e);
            }
        }

        return `
            <!-- Read-only User Information Card -->
            <div class="user-info-card">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px; font-weight: 600; border-bottom: 2px solid #0000ff; padding-bottom: 8px;">User Information</h3>
                <div class="user-info-grid">
                    <div class="user-info-item">
                        <span class="user-info-label">User ID</span>
                        <span class="user-info-value">${esc(user.email || 'N/A')}</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Email Address</span>
                        <span class="user-info-value">${esc(user.email || 'N/A')}</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Account Created</span>
                        <span class="user-info-value">${createdAtFormatted}</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Connections</span>
                        <span class="user-info-value">${userConnections.length} connection${userConnections.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Practices</span>
                        <span class="user-info-value">${userPractices.length} practice${userPractices.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="user-info-item">
                        <span class="user-info-label">Blocks</span>
                        <span class="user-info-value">${(user.blocks || []).length} block${(user.blocks || []).length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            </div>

            <form id="admin-edit-user-form">
                <input type="hidden" id="edit-user-id" value="${user.email || ''}">
                <div class="form-field">
                    <label>Title</label>
                    <input type="text" id="edit-user-title" class="input-feild" value="${user.title || ''}">
                </div>
                <div class="form-field">
                    <label>Avatar</label>
                    <div class="avatar-upload-section">
                        <div class="avatar-preview-container">
                            <img id="admin-avatar-preview" src="${user.avatar || 'static/img/default-avatar.png'}" alt="Avatar Preview" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; border: 2px solid #ccc; margin-bottom: 10px;">
                        </div>
                        <div class="file-upload-wrapper">
                            <button type="button" class="file-upload-button">Upload New Avatar</button>
                            <span class="file-upload-name"></span>
                            <input type="file" id="admin-avatar-upload" accept="image/*" class="file-upload-input">
                        </div>
                        <button type="button" id="admin-clear-avatar" class="secondary-btn" style="margin-top: 5px; ${user.avatar ? '' : 'display: none;'}">Clear Avatar</button>
                    </div>
                </div>
                <div class="form-field">
                    <label>Bio</label>
                    <textarea id="edit-user-bio" class="input-feild" rows="4">${user.bio || ''}</textarea>
                </div>
                <div class="form-field">
                    <label>Social Links</label>
                    <input type="text" id="edit-user-instagram" class="input-feild" placeholder="Instagram URL" value="${user.instagram || ''}">
                    <input type="text" id="edit-user-youtube" class="input-feild" placeholder="YouTube URL" value="${user.youtube || ''}" style="margin-top:5px;">
                    <input type="text" id="edit-user-tiktok" class="input-feild" placeholder="TikTok URL" value="${user.tiktok || ''}" style="margin-top:5px;">
                </div>
                <div class="form-field">
                    <label>Practices</label>
                    <div id="edit-user-practices" style="margin-top: 5px; border: 1px solid #ccc; padding: 10px; border-radius: 4px; background: #f9f9f9;">
                        ${practicesHTML}
                    </div>
                </div>
                <div class="form-field">
                    <label>Connections</label>
                    <div style="height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; border-radius: 4px; background: #f9f9f9;">
                       ${connectionsCheckboxesHTML || '<p>No other users to connect to.</p>'}
                    </div>
                </div>
                <div class="form-field">
                    <label>Blocks</label>
                    <div id="admin-user-blocks-container" style="margin-top: 10px; padding: 10px; border: 1px solid #444; border-radius: 4px;">
                        <!-- Blocks will be rendered here by renderAdminUserBlocks -->
                    </div>
                    <div class="form-actions" style="text-align: left; padding: 0; margin-top: 10px;">
                        <button type="button" id="admin-add-block-btn" class="primary-btn">+ Add Block</button>
                    </div>
                </div>
                <hr style="margin: 20px 0;">
                <div class="form-actions" style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <button type="submit" class="view-community-btn primary-btn">Update User</button>
                    <button type="button" id="admin-modal-delete-user-btn" class="admin-modal-delete-btn" data-email="${user.email || ''}">Delete User</button>
                </div>
            </form>
        `;
    }

    async function openEditUserModal(user) {
        if (!user) return alert('Error: User not found.');
        
        isUserFormDirty = false; // Reset dirty flag when modal opens
        currentlyEditingUser = user;
        currentlyEditingUserBlocks = JSON.parse(JSON.stringify(user.blocks || [])); // Deep copy

        const modal = document.getElementById('edit-user-modal');
        const formContainer = document.getElementById('edit-user-form-container');
        
        formContainer.innerHTML = getUserFormHTML(user, allUsers);
        modal.style.display = 'block';

        renderAdminUserBlocks(); // Render the user's blocks

        const closeBtn = modal.querySelector('.close-button');
        closeBtn.onclick = () => {
            if (isUserFormDirty) {
                if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
                    modal.style.display = 'none';
                }
            } else {
                modal.style.display = 'none';
            }
        };

        const practicesContainer = formContainer.querySelector('#edit-user-practices');
        if (practicesContainer) {
            practicesContainer.addEventListener('click', (e) => {
                if (e.target.matches('.practice-pill')) {
                    e.target.classList.toggle('selected');
                    isUserFormDirty = true;
                }
            });
        }

        const form = formContainer.querySelector('#admin-edit-user-form');
        form.addEventListener('input', () => { isUserFormDirty = true; });
        form.addEventListener('change', () => { isUserFormDirty = true; }); // For checkboxes
        form.addEventListener('submit', handleUserUpdate);

        const addBlockBtn = document.getElementById('admin-add-block-btn');
        addBlockBtn.addEventListener('click', () => {
            editingBlockIndex = null;
            openAdminBlockModal();
        });

        // Add delete button handler
        const modalDeleteBtn = document.getElementById('admin-modal-delete-user-btn');
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener('click', async () => {
                const email = modalDeleteBtn.dataset.email;
                if (confirm(`Are you sure you want to delete user ${email}?\n\nThis action cannot be undone and will delete all their data including posts, connections, and blocks.`)) {
                    modalDeleteBtn.disabled = true;
                    modalDeleteBtn.textContent = 'Deleting...';
                    try {
                        await deleteUserAndData(email);
                        alert('User deleted successfully!');
                        modal.style.display = 'none';
                        await loadUsers();
                    } catch (err) {
                        alert(`Error deleting user: ${err.message}`);
                        modalDeleteBtn.disabled = false;
                        modalDeleteBtn.textContent = 'Delete User';
                    }
                }
            });
        }

        // Initialize avatar upload functionality
        initializeAvatarUpload();
    }

    async function handleUserUpdate(e) {
        e.preventDefault();
        const form = e.target;
        const userId = form.querySelector('#edit-user-id').value;
        const submitButton = form.querySelector('button[type="submit"]');

        const checkedBoxes = form.querySelectorAll('.user-connection-checkbox:checked');
        const connections = Array.from(checkedBoxes).map(cb => cb.value);

        const selectedPracticePills = form.querySelectorAll('.practice-pill.selected');
        const practices = Array.from(selectedPracticePills).map(pill => pill.dataset.practice);
        
        // Get avatar URL from preview image
        const avatarPreview = document.getElementById('admin-avatar-preview');
        const avatarUrl = avatarPreview ? avatarPreview.src : '';
        
        const updatedData = {
            title: form.querySelector('#edit-user-title').value,
            avatar: avatarUrl,
            bio: form.querySelector('#edit-user-bio').value,
            instagram: form.querySelector('#edit-user-instagram').value,
            youtube: form.querySelector('#edit-user-youtube').value,
            tiktok: form.querySelector('#edit-user-tiktok').value,
            practices,
            connections,
            blocks: currentlyEditingUserBlocks
        };

        submitButton.disabled = true;
        try {
            await window.collabFirebaseUtils.updateUserData(userId, updatedData);
            alert('User updated successfully!');
            isUserFormDirty = false;
            document.getElementById('edit-user-modal').style.display = 'none';
            await loadUsers();
        } catch (error) {
            alert('Error updating user: ' + error.message);
        } finally {
            submitButton.disabled = false;
        }
    }

    function renderAdminUserBlocks() {
        const container = document.getElementById('admin-user-blocks-container');
        if (!container) return;
        
        container.innerHTML = "";
        currentlyEditingUserBlocks.forEach((block, index) => {
            const blockDiv = document.createElement('div');
            blockDiv.className = 'block';
            
            let blockHTML = '';
            // Simplified view for the admin list
            if (!block.type || block.type === 'default') {
                blockHTML = `<strong>${block.title}</strong> (Default Link)`;
            } else if (block.type === 'large-image') {
                blockHTML = `<strong>${block.title}</strong> (Large Image)`;
            } else if (block.type === 'carousel') {
                 blockHTML = `<strong>Carousel</strong> (${block.slides.length} slides)`;
            } else if (block.type === 'embed') {
                const prov = (block.provider || '').toUpperCase();
                blockHTML = `<strong>${block.title || ''}</strong> (Embed: ${prov || 'Unknown'})`;
            }

            blockDiv.innerHTML = `
                <div class="block-content">
                    <div class="drag-handle" draggable="true" data-index="${index}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9h8M8 15h8"/></svg>
                    </div>
                    <img src="${block.icon || (block.slides && block.slides[0] ? block.slides[0].icon : '') || DEFAULT_ICON}" alt="icon" style="height: 32px; width: 32px;">
                    <div class="block-text">${blockHTML}</div>
                </div>
                <div class="block-actions">
                    <button type="button" class="admin-edit-btn" onclick="window.editAdminBlock(${index})">Edit</button>
                    <button type="button" class="admin-delete-btn" onclick="window.deleteAdminBlock(${index})">Delete</button>
                </div>
            `;
            container.appendChild(blockDiv);
        });

        // Add drag-and-drop listeners after rendering
        const dragHandles = container.querySelectorAll('.drag-handle');
        dragHandles.forEach(handle => {
            handle.addEventListener('dragstart', handleDragStart);
            handle.addEventListener('dragend', handleDragEnd);
        });
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
    }
    
    // --- Block Modal Functions ---
    
    function openAdminBlockModal() {
        const modal = document.getElementById('admin-edit-block-modal');
        modal.style.display = 'flex';
        
        if (editingBlockIndex !== null) {
            // Editing existing block
            const block = currentlyEditingUserBlocks[editingBlockIndex];
            setBlockType(block.type || 'default', false);
            if (block.type === 'carousel') {
                carouselSlides = JSON.parse(JSON.stringify(block.slides || []));
                renderCarouselSlidesFields();
            } else if (block.type === 'embed') {
                currentEmbed = { provider: block.provider, embedUrl: block.embedUrl };
                const typeCards = document.getElementById('admin-block-type-select');
                if (typeCards) typeCards.style.display = 'none';
                document.getElementById('admin-block-title').value = block.title || '';
                document.getElementById('admin-block-description').value = block.desc || '';
                document.getElementById('admin-block-link').value = block.link || '';
                document.getElementById('admin-block-img').value = '';
                const details = document.getElementById('admin-block-details-container');
                if (details) details.style.display = 'block';
                setBlockType('embed', false);
            } else {
                document.getElementById('admin-block-title').value = block.title || '';
                document.getElementById('admin-block-description').value = block.desc || '';
                document.getElementById('admin-block-link').value = block.link || '';
                document.getElementById('admin-block-img').value = '';
                document.getElementById('admin-block-img').dataset.icon = block.icon || '';
                document.getElementById('admin-block-details-container').style.display = 'block';
            }
        } else {
            // Adding new block
            setBlockType('default', true);
        }
        renderBlockLivePreview();
    }
    
    // Make these global to be accessible from inline onclick
    window.editAdminBlock = (index) => {
        editingBlockIndex = index;
        openAdminBlockModal();
    };

    window.deleteAdminBlock = async (index) => {
        if (!confirm('Are you sure you want to delete this block?')) return;
        
        const { deleteImage } = window.collabFirebaseUtils;
        const blockToDelete = currentlyEditingUserBlocks[index];

        // Delete associated images from storage
        if ((!blockToDelete.type || blockToDelete.type === 'default' || blockToDelete.type === 'large-image') && blockToDelete.icon && !blockToDelete.icon.includes('default-icon')) {
            await deleteImage(blockToDelete.icon);
        }
        if (blockToDelete.type === 'carousel' && Array.isArray(blockToDelete.slides)) {
            for (const slide of blockToDelete.slides) {
                if (slide.icon && !slide.icon.includes('default-icon')) {
                    await deleteImage(slide.icon);
                }
            }
        }

        currentlyEditingUserBlocks.splice(index, 1);
        renderAdminUserBlocks();
        isUserFormDirty = true;
    };

    // --- Drag and Drop Logic ---
    let dragStartIndex;
    function handleDragStart(e) {
        dragStartIndex = +this.dataset.index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.parentNode.parentNode.innerHTML);
    }
    function handleDragEnd(e) { /* Clean up styles if any */ }
    function handleDragOver(e) { e.preventDefault(); return false; }
    function handleDrop(e) {
        const dropTarget = e.target.closest('.block');
        if (!dropTarget) return;
        const dropIndex = +dropTarget.querySelector('.drag-handle').dataset.index;
        const draggedItem = currentlyEditingUserBlocks[dragStartIndex];
        currentlyEditingUserBlocks.splice(dragStartIndex, 1);
        currentlyEditingUserBlocks.splice(dropIndex, 0, draggedItem);
        renderAdminUserBlocks();
    }


    // This function sets up all the event listeners for the block modal
    function initializeBlockEditor() {
        const modal = document.getElementById('admin-edit-block-modal');
        if (!modal) return;

        // Close button
        const closeBtn = modal.querySelector('.close-button');
        closeBtn.onclick = () => modal.style.display = 'none';

        // Cancel button
        document.getElementById('admin-cancel-block').onclick = () => modal.style.display = 'none';

        // Block type selection
        document.getElementById('admin-block-type-select').addEventListener('click', (e) => {
            const card = e.target.closest('.block-type-card');
            if (card) setBlockType(card.dataset.type, false);
        });

        // Live preview listeners and metadata fetching
        const blockLinkInput = document.getElementById('admin-block-link');
        const embedOptionsDiv = document.getElementById('admin-embed-options');
        const embedYoutubeBtn = document.getElementById('admin-embed-youtube-btn');
        const embedSpotifyBtn = document.getElementById('admin-embed-spotify-btn');

        blockLinkInput.addEventListener('input', (e) => {
            renderBlockLivePreview();
            const url = e.target.value.trim();
            const y = parseYoutubeEmbed(url);
            const s = parseSpotifyEmbed(url);
            if (embedYoutubeBtn) {
                embedYoutubeBtn.disabled = !y;
                embedYoutubeBtn.style.display = y ? 'inline-block' : 'none';
            }
            if (embedSpotifyBtn) {
                embedSpotifyBtn.disabled = !s;
                embedSpotifyBtn.style.display = s ? 'inline-block' : 'none';
            }
            if (embedOptionsDiv) embedOptionsDiv.style.display = (y || s) ? 'block' : 'none';

            if (currentBlockType === 'embed' && currentEmbed) {
                const next = currentEmbed.provider === 'youtube' ? parseYoutubeEmbed(url) : parseSpotifyEmbed(url);
                currentEmbed = next ? { provider: currentEmbed.provider, embedUrl: next } : null;
                renderBlockLivePreview();
            }
        });
        blockLinkInput.addEventListener('change', (e) => {
            const url = e.target.value.trim();
            const y = parseYoutubeEmbed(url);
            const s = parseSpotifyEmbed(url);
            if (embedYoutubeBtn) {
                embedYoutubeBtn.disabled = !y;
                embedYoutubeBtn.style.display = y ? 'inline-block' : 'none';
            }
            if (embedSpotifyBtn) {
                embedSpotifyBtn.disabled = !s;
                embedSpotifyBtn.style.display = s ? 'inline-block' : 'none';
            }
            if (embedOptionsDiv) embedOptionsDiv.style.display = (y || s) ? 'block' : 'none';
            fetchMetadataForInput(e.target, 'default');
        });

        if (embedYoutubeBtn) {
            embedYoutubeBtn.addEventListener('click', () => {
                const url = blockLinkInput.value.trim();
                const embedUrl = parseYoutubeEmbed(url);
                if (!embedUrl) {
                    alert('Please paste a valid YouTube URL first.');
                    blockLinkInput.focus();
                    return;
                }
                currentEmbed = { provider: 'youtube', embedUrl };
                setBlockType('embed', false);
                const details = document.getElementById('admin-block-details-container');
                if (details) details.style.display = 'block';
                const imagePreviewDiv = document.getElementById('admin-image-preview');
                const loadingIndicatorContainer = document.getElementById('admin-url-loading-indicator');
                if (!document.getElementById('admin-block-title').value && !document.getElementById('admin-block-description').value) {
                    fetchLinkMetadata(url, imagePreviewDiv, loadingIndicatorContainer)
                        .catch(() => {})
                        .finally(() => renderBlockLivePreview());
                } else {
                    renderBlockLivePreview();
                }
            });
        }
        if (embedSpotifyBtn) {
            embedSpotifyBtn.addEventListener('click', () => {
                const url = blockLinkInput.value.trim();
                const embedUrl = parseSpotifyEmbed(url);
                if (!embedUrl) {
                    alert('Please paste a valid Spotify URL first.');
                    blockLinkInput.focus();
                    return;
                }
                currentEmbed = { provider: 'spotify', embedUrl };
                setBlockType('embed', false);
                const details = document.getElementById('admin-block-details-container');
                if (details) details.style.display = 'block';
                const imagePreviewDiv = document.getElementById('admin-image-preview');
                const loadingIndicatorContainer = document.getElementById('admin-url-loading-indicator');
                if (!document.getElementById('admin-block-title').value && !document.getElementById('admin-block-description').value) {
                    fetchLinkMetadata(url, imagePreviewDiv, loadingIndicatorContainer)
                        .catch(() => {})
                        .finally(() => renderBlockLivePreview());
                } else {
                    renderBlockLivePreview();
                }
            });
        }

        ['admin-block-title', 'admin-block-description'].forEach(id => {
            document.getElementById(id).addEventListener('input', renderBlockLivePreview);
        });
        document.getElementById('admin-block-img').addEventListener('change', renderBlockLivePreview);

        // Save block
        document.getElementById('admin-save-block').addEventListener('click', onSaveBlock);
        
        // Add carousel slide
        document.getElementById('admin-add-carousel-slide').addEventListener('click', () => {
            if (carouselSlides.length < 10) {
                carouselSlides.push({ title: '', desc: '', link: '', imgFile: null, icon: '' });
                renderCarouselSlidesFields();
            }
        });
    }
    
    function setBlockType(type, isNew) {
        currentBlockType = type;
        document.querySelectorAll('#admin-block-type-select .block-type-card').forEach(c => c.classList.remove('selected'));
        const selectedCard = document.querySelector(`#admin-block-type-select .block-type-card[data-type="${type}"]`);
        if (selectedCard) selectedCard.classList.add('selected');

        const fieldsDefault = document.getElementById('admin-block-fields-default-large');
        const fieldsCarousel = document.getElementById('admin-block-fields-carousel');
        
        fieldsDefault.style.display = (type === 'carousel') ? 'none' : 'block';
        fieldsCarousel.style.display = (type === 'carousel') ? 'block' : 'none';

        // Show/hide embed options and type cards
        const embedOptionsDiv = document.getElementById('admin-embed-options');
        const linkInput = document.getElementById('admin-block-link');
        const typeCards = document.getElementById('admin-block-type-select');
        if (embedOptionsDiv) {
            if (type === 'embed') {
                embedOptionsDiv.style.display = 'none';
            } else {
                const y = parseYoutubeEmbed(linkInput.value.trim());
                const s = parseSpotifyEmbed(linkInput.value.trim());
                embedOptionsDiv.style.display = (y || s) ? 'block' : 'none';
                const yBtn = document.getElementById('admin-embed-youtube-btn');
                const sBtn = document.getElementById('admin-embed-spotify-btn');
                if (yBtn) { yBtn.style.display = y ? 'inline-block' : 'none'; yBtn.disabled = !y; }
                if (sBtn) { sBtn.style.display = s ? 'inline-block' : 'none'; sBtn.disabled = !s; }
            }
        }
        if (typeCards) {
            if (type === 'embed') {
                typeCards.style.display = 'none';
            } else {
                typeCards.style.display = 'flex';
            }
        }

        if (isNew) {
            // Reset fields
            document.getElementById('admin-block-title').value = '';
            document.getElementById('admin-block-description').value = '';
            document.getElementById('admin-block-link').value = '';
            document.getElementById('admin-block-img').value = '';
            document.getElementById('admin-block-img').dataset.icon = '';
            document.getElementById('admin-block-details-container').style.display = 'none';
            carouselSlides = [{ title: '', desc: '', link: '' }, { title: '', desc: '', link: '' }];
            renderCarouselSlidesFields();
        }
         // Show details container for non-carousel types
        if(type !== 'carousel') {
             document.getElementById('admin-block-details-container').style.display = 'block';
        }

        // Hide image upload when in embed mode
        const imgInput = document.getElementById('admin-block-img');
        const imgLabelEl = imgInput ? imgInput.previousElementSibling : null;
        const imagePreviewEl = document.getElementById('admin-image-preview');
        if (type === 'embed') {
            if (imgLabelEl) imgLabelEl.style.display = 'none';
            if (imgInput) imgInput.style.display = 'none';
            if (imagePreviewEl) imagePreviewEl.style.display = 'none';
        } else {
            if (imgLabelEl) imgLabelEl.style.display = '';
            if (imgInput) imgInput.style.display = '';
            if (imagePreviewEl) imagePreviewEl.style.display = '';
        }
    }

    let lastPreviewUrl = null;
    function escapeHtml(text) {
        const t = (text == null) ? '' : String(text);
        return t
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function nl2brEscaped(text) {
        return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');
    }

    function renderBlockLivePreview() {
        const blockLivePreview = document.getElementById('admin-block-live-preview');
        const blockTitleInput = document.getElementById('admin-block-title');
        const blockDescInput = document.getElementById('admin-block-description');
        const blockImgInput = document.getElementById('admin-block-img');

        if (currentBlockType === 'embed' && currentEmbed) {
            let iframeHtml = '';
            if (currentEmbed.provider === 'youtube') {
                iframeHtml = `<iframe width="100%" height="315" src="${currentEmbed.embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
            } else if (currentEmbed.provider === 'spotify') {
                iframeHtml = `<iframe style="border-radius:12px" src="${currentEmbed.embedUrl}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
            }
            blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='flex-direction:column;align-items:stretch;max-width:350px;'>${iframeHtml}<div style='padding:8px 0 0 0;'><strong>${escapeHtml(blockTitleInput.value)}</strong><br><small>${nl2brEscaped(blockDescInput.value)}</small></div></div>`;
        } else if (currentBlockType === 'default' || currentBlockType === 'large-image') {
            let imgSrc = '';
            if (blockImgInput.files[0]) {
                if (lastPreviewUrl) URL.revokeObjectURL(lastPreviewUrl);
                imgSrc = URL.createObjectURL(blockImgInput.files[0]);
                lastPreviewUrl = imgSrc;
            } else if (blockImgInput.dataset.icon) {
                imgSrc = blockImgInput.dataset.icon;
            } else if (editingBlockIndex !== null && currentlyEditingUserBlocks[editingBlockIndex].icon) {
                imgSrc = currentlyEditingUserBlocks[editingBlockIndex].icon;
            } else {
                imgSrc = DEFAULT_ICON;
            }

            if (currentBlockType === 'default') {
                blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='max-width:350px;'><div class='block-content'><img src='${imgSrc}' style='height:40px;width:40px;object-fit:cover;border-radius:4px;'><div class='block-text'><strong>${escapeHtml(blockTitleInput.value)}</strong><small>${nl2brEscaped(blockDescInput.value)}</small></div></div></div>`;
            } else {
                blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='flex-direction:column;align-items:flex-start;max-width:350px;'><img src='${imgSrc}' style='width:100%;height:230px;object-fit:cover;border-radius:8px 8px 0 0;'><div style='padding:8px 0 0 0;'><strong>${escapeHtml(blockTitleInput.value)}</strong><br><small>${nl2brEscaped(blockDescInput.value)}</small></div></div>`;
            }
        } else if (currentBlockType === 'carousel') {
            let slidesHTML = '';
            for (let i = 0; i < carouselSlides.length; i++) {
                const slide = carouselSlides[i];
                let imgSrc = '';
                if (slide.imgFile) {
                    if (slide.lastPreviewUrl) URL.revokeObjectURL(slide.lastPreviewUrl);
                    imgSrc = URL.createObjectURL(slide.imgFile);
                    slide.lastPreviewUrl = imgSrc;
                } else if (slide.icon) {
                    imgSrc = slide.icon;
                } else {
                    imgSrc = DEFAULT_ICON;
                }
                slidesHTML += `<div style='display:inline-block;width:230px;height:320px;margin-right:8px;vertical-align:top;'><div style='background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;overflow:hidden;'><a href="${slide.link || '#'}" target="_blank" style="text-decoration:none; color:inherit;"><img src='${imgSrc}' style='width:230px;height:230px;object-fit:cover;display:block;'><div style='padding:8px;'><strong>${escapeHtml(slide.title || '')}</strong><br><small>${nl2brEscaped(slide.desc || '')}</small></div></a></div></div>`;
            }
            blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div style='overflow-x:auto;white-space:nowrap;max-width:100%;'>${slidesHTML}</div>`;
        }
    }
    
    function renderCarouselSlidesFields() {
        const container = document.getElementById('admin-carousel-slides-fields');
        container.innerHTML = '';
        carouselSlides.forEach((slide, idx) => {
            container.appendChild(createCarouselSlideField(slide, idx));
        });
    }

    function createCarouselSlideField(slide, idx) {
        const div = document.createElement('div');
        div.className = 'carousel-slide-field';
        const detailsVisible = slide.link ? 'block' : 'none';
        const isPermanentSlide = idx < 2;
        const buttonText = isPermanentSlide ? 'Clear' : 'Remove';

        div.innerHTML = `
            <p style='margin-bottom: 5px; font-weight: bold;'>Slide ${idx + 1}:</p>
            <p class="input-feild-title-text">URL:</p>
            <input type='url' placeholder='Paste a link...' value='${slide.link || ''}' class='input-feild collab-input-field carousel-slide-link'>
            <div class="carousel-url-loading-indicator"></div>
            <div class='carousel-slide-details' style='display: ${detailsVisible};'>
                <p class="input-feild-title-text" style="margin-top: 10px;">Title:</p>
                <input type='text' placeholder='Slide Title' value='${slide.title || ''}' class='input-feild collab-input-field carousel-slide-title'>
                <p class="input-feild-title-text" style="margin-top: 10px;">Description:</p>
                <input type='text' placeholder='Slide Description' value='${slide.desc || ''}' class='input-feild collab-input-field carousel-slide-desc'>
                <p class="input-feild-title-text" style="margin-top: 10px;">Upload Block Image:</p>
                <input type='file' accept='image/*' class='carousel-slide-img'>
                <div class="carousel-image-preview" style="margin-top: 10px;"></div>
            </div>
            <button type='button' class='remove-slide-btn secondary-btn'>${buttonText}</button>
        `;
        
        const linkInput = div.querySelector('.carousel-slide-link');
        const detailsContainer = div.querySelector('.carousel-slide-details');
        
        linkInput.addEventListener('input', e => {
            slide.link = e.target.value;
            detailsContainer.style.display = slide.link.trim() !== '' ? 'block' : 'none';
        });
        linkInput.addEventListener('change', (e) => {
            fetchMetadataForInput(e.target, 'carousel', idx);
        });

        const titleInput = detailsContainer.querySelector('.carousel-slide-title');
        const descInput = detailsContainer.querySelector('.carousel-slide-desc');
        const imgInput = detailsContainer.querySelector('.carousel-slide-img');

        titleInput.addEventListener('input', e => { slide.title = e.target.value; renderBlockLivePreview(); });
        descInput.addEventListener('input', e => { slide.desc = e.target.value; renderBlockLivePreview(); });
        imgInput.addEventListener('change', e => { slide.imgFile = e.target.files[0]; renderBlockLivePreview(); });
        if (slide.icon) imgInput.dataset.icon = slide.icon;
        
        div.querySelector('.remove-slide-btn').addEventListener('click', function() {
            if (carouselSlides.length > 2) {
                carouselSlides.splice(idx, 1);
            } else { // For the first 2, just clear them
                carouselSlides[idx] = { title: '', desc: '', link: '', imgFile: null, icon: '' };
            }
            renderCarouselSlidesFields();
            renderBlockLivePreview();
        });
        return div;
    }
    
    window.updateCarouselSlide = (index, key, value) => {
        if(carouselSlides[index]) carouselSlides[index][key] = value;
    };

    async function onSaveBlock() {
        const { uploadImage } = window.collabFirebaseUtils;
        const saveBtn = document.getElementById('admin-save-block');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            let newBlockData = {};
            if (currentBlockType === 'carousel') {
                const slidesToSave = [];
                const slideFields = document.querySelectorAll('#admin-carousel-slides-fields .carousel-slide-field');

                for (let i = 0; i < carouselSlides.length; i++) {
                    const slide = carouselSlides[i];
                    const slideField = slideFields[i];
                    if (!slideField) continue;

                    const imgInput = slideField.querySelector('.carousel-slide-img');
                    let iconUrl = slide.icon || ''; // Keep existing icon by default

                    if (slide.imgFile) { // Priority 1: New manual upload for this slide
                        const file = slide.imgFile;
                        const path = `blocks/${currentlyEditingUser.email}/carousel/${Date.now()}_${file.name}`;
                        iconUrl = await uploadImage(file, path);
                    } else if (imgInput && imgInput.dataset.fetchedUrl) { // Priority 2: Fetched URL for this slide
                        iconUrl = imgInput.dataset.fetchedUrl;
                    }
                    
                    if(slide.title || slide.link) { // Only save non-empty slides
                        slidesToSave.push({
                            title: slide.title,
                            desc: slide.desc,
                            link: slide.link,
                            icon: iconUrl || DEFAULT_ICON,
                        });
                    }
                }
                newBlockData = { type: 'carousel', slides: slidesToSave };
            } else if (currentBlockType === 'embed' && currentEmbed) {
                newBlockData = {
                    type: 'embed',
                    provider: currentEmbed.provider,
                    embedUrl: currentEmbed.embedUrl,
                    title: document.getElementById('admin-block-title').value,
                    desc: document.getElementById('admin-block-description').value,
                    link: document.getElementById('admin-block-link').value,
                    icon: DEFAULT_ICON
                };
            } else {
                const imgInput = document.getElementById('admin-block-img');
                let iconUrl = imgInput.dataset.icon || (editingBlockIndex !== null ? currentlyEditingUserBlocks[editingBlockIndex].icon : '');
                
                if (imgInput.files[0]) { // Priority 1: New manual upload
                    const file = imgInput.files[0];
                    const path = `blocks/${currentlyEditingUser.email}/${Date.now()}_${file.name}`;
                    iconUrl = await uploadImage(file, path);
                } else if (imgInput.dataset.fetchedUrl) { // Priority 2: Fetched URL
                    iconUrl = imgInput.dataset.fetchedUrl;
                }

                newBlockData = {
                    type: currentBlockType,
                    title: document.getElementById('admin-block-title').value,
                    desc: document.getElementById('admin-block-description').value,
                    link: document.getElementById('admin-block-link').value,
                    icon: iconUrl || DEFAULT_ICON
                };
            }
            
            if (editingBlockIndex !== null) {
                currentlyEditingUserBlocks[editingBlockIndex] = newBlockData;
            } else {
                currentlyEditingUserBlocks.push(newBlockData);
            }
            isUserFormDirty = true;

            renderAdminUserBlocks();
            document.getElementById('admin-edit-block-modal').style.display = 'none';

        } catch(e) {
            console.error("Error saving block:", e);
            alert("Error saving block: " + e.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Block';
        }
    }

    // --- Helpers for metadata fetching and image compression ---

    function isValidUrl(url) {
        if (!url) return true;
        return /^https?:\/\//.test(url) || /^www\./.test(url);
    }

    function normalizeUrl(url) {
        if (!url) return '';
        if (/^https?:\/\//.test(url)) return url;
        if (/^www\./.test(url)) return 'https://' + url;
        return url;
    }

    function parseYoutubeEmbed(url) {
        if (!url) return null;
        try {
            const u = new URL(normalizeUrl(url));
            if (u.hostname === 'youtu.be') {
                const id = u.pathname.replace('/', '').trim();
                if (id) return `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0`;
            }
            if (u.hostname.includes('youtube.com')) {
                const v = u.searchParams.get('v');
                if (v) return `https://www.youtube.com/embed/${v}?modestbranding=1&rel=0`;
                if (u.pathname.startsWith('/shorts/')) {
                    const id = u.pathname.split('/')[2];
                    if (id) return `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0`;
                }
                if (u.pathname.startsWith('/embed/')) {
                    return `https://www.youtube.com${u.pathname}${u.search}`;
                }
            }
        } catch (_) {}
        return null;
    }

    function parseSpotifyEmbed(url) {
        if (!url) return null;
        try {
            const u = new URL(normalizeUrl(url));
            if (!u.hostname.includes('spotify.com')) return null;
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) {
                const type = parts[0];
                const id = parts[1];
                const supported = ['track', 'album', 'user', 'playlist', 'artist', 'show', 'episode'];
                if (supported.includes(type) && id) {
                    return `https://open.spotify.com/embed/${type}/${id}`;
                }
            }
            if (parts.length >= 2 && parts[0] === 'user') {
                const id = parts[1];
                return `https://open.spotify.com/embed/user/${id}`;
            }
        } catch (_) {}
        return null;
    }

    async function fetchLinkMetadata(url) {
        const encodedUrl = encodeURIComponent(normalizeUrl(url));
        const response = await fetch(`https://api.microlink.io/?url=${encodedUrl}`);
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(`API returned status: ${data.status}`);
        return data.data;
    }

    function fetchMetadataForInput(linkInput, blockType, slideIndex = -1) {
        const url = linkInput.value;
        if (!url || !isValidUrl(url)) return;

        let titleInput, descInput, imgInput, imagePreviewDiv, loadingIndicator;

        if (blockType === 'carousel') {
            const slideContainer = linkInput.closest('.carousel-slide-field');
            titleInput = slideContainer.querySelector('.carousel-slide-title');
            descInput = slideContainer.querySelector('.carousel-slide-desc');
            imgInput = slideContainer.querySelector('.carousel-slide-img');
            imagePreviewDiv = slideContainer.querySelector('.carousel-image-preview');
            loadingIndicator = slideContainer.querySelector('.carousel-url-loading-indicator');
        } else {
            const fieldsContainer = linkInput.closest('#admin-block-fields-default-large');
            titleInput = fieldsContainer.querySelector('#admin-block-title');
            descInput = fieldsContainer.querySelector('#admin-block-description');
            imgInput = fieldsContainer.querySelector('#admin-block-img');
            imagePreviewDiv = fieldsContainer.querySelector('#admin-image-preview');
            loadingIndicator = fieldsContainer.querySelector('#admin-url-loading-indicator');
        }

        loadingIndicator.innerHTML = '<span>Fetching preview...</span>';
        imagePreviewDiv.innerHTML = '';

        fetchLinkMetadata(url).then(metadata => {
            loadingIndicator.innerHTML = '';
            if (metadata.title) titleInput.value = metadata.title;
            if (metadata.description) descInput.value = metadata.description;
            
            if (blockType === 'carousel') {
                carouselSlides[slideIndex].title = titleInput.value;
                carouselSlides[slideIndex].desc = descInput.value;
            }

            // Clear any previously selected file, since fetched URL should take precedence
            imgInput.value = '';

            if (metadata.image && metadata.image.url) {
                const imageUrl = metadata.image.url;
                imagePreviewDiv.innerHTML = `<img src="${imageUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;">`;
                // We will save the fetched URL to the dataset to be used if no file is selected.
                imgInput.dataset.fetchedUrl = imageUrl;
            }
             renderBlockLivePreview();
        }).catch(error => {
            console.error("Error fetching link metadata:", error);
            loadingIndicator.innerHTML = '<span style="color: red;">Could not fetch link data.</span>';
        });
    }

    // Call this once on DOM load
    initializeBlockEditor();

    // --- Avatar Upload Functionality ---
    
    // Image compression function (same as profile.html)
    async function compressImage(file, quality = 0.7, maxWidth = 800, maxHeight = 800) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth || height > maxHeight) {
                    const scale = Math.min(maxWidth / width, maxHeight / height);
                    width = width * scale;
                    height = height * scale;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    blob => {
                        URL.revokeObjectURL(url);
                        resolve(blob);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    // Initialize avatar upload functionality
    function initializeAvatarUpload() {
        const avatarInput = document.getElementById('admin-avatar-upload');
        const avatarPreview = document.getElementById('admin-avatar-preview');
        const clearAvatarBtn = document.getElementById('admin-clear-avatar');
        
        if (!avatarInput || !avatarPreview || !clearAvatarBtn) return;

        let cropper = null;
        let avatarFile = null;

        avatarInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                img.onload = () => {
                    const modal = document.createElement("div");
                    modal.className = "cropper-modal";
                    
                    modal.innerHTML = `
                        <div class="cropper-modal-content">
                            <div class="cropper-image-container">
                                <img id="crop-image" style="max-width: 100%; display: block;" />
                            </div>
                            <div class="cropper-buttons">
                                <button id="crop-confirm" style="margin-right: 10px;">Crop</button>
                                <button id="crop-cancel" class="secondary-btn">Cancel</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    const cropImg = modal.querySelector("#crop-image");
                    cropImg.src = img.src;

                    cropper = new Cropper(cropImg, {
                        aspectRatio: 1,
                        viewMode: 1,
                    });

                    modal.querySelector("#crop-confirm").onclick = async () => {
                        const cropConfirmBtn = modal.querySelector("#crop-confirm");
                        const cropCancelBtn = modal.querySelector("#crop-cancel");

                        cropConfirmBtn.disabled = true;
                        cropCancelBtn.disabled = true;
                        cropConfirmBtn.textContent = 'Uploading avatar...';
                        
                        try {
                            const blob = await new Promise(resolve => cropper.getCroppedCanvas().toBlob(resolve, 'image/jpeg'));
                            
                            avatarFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
                            const compressedBlob = await compressImage(avatarFile, 0.7, 800, 800);
                            const compressedFile = new File([compressedBlob], "avatar.jpg", { type: "image/jpeg" });
                            
                            // Upload the new avatar
                            const userEmail = currentlyEditingUser.email;
                            const avatarUrl = await window.collabFirebaseUtils.uploadImage(compressedFile, `avatars/${userEmail}`);
                            
                            // Update the preview
                            avatarPreview.src = avatarUrl;
                            
                            // Show clear button
                            clearAvatarBtn.style.display = 'inline-block';
                            
                            // Mark form as dirty
                            isUserFormDirty = true;
                            
                            cropper.destroy();
                            modal.remove();
                        } catch (error) {
                            console.error('Error saving avatar:', error);
                            alert('Error saving avatar. Please try again.');
                            // Restore button state on error
                            cropConfirmBtn.disabled = false;
                            cropCancelBtn.disabled = false;
                            cropConfirmBtn.textContent = 'Crop';
                        }
                    };

                    modal.querySelector("#crop-cancel").onclick = () => {
                        cropper.destroy();
                        modal.remove();
                    };
                };
            }
        });

        clearAvatarBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to clear the avatar?')) return;
            
            try {
                // Delete the avatar file from Firebase Storage if it exists
                if (currentlyEditingUser.avatar && !currentlyEditingUser.avatar.includes('default-avatar')) {
                    await window.collabFirebaseUtils.deleteImage(currentlyEditingUser.avatar);
                }
                
                // Update preview to default
                avatarPreview.src = 'static/img/default-avatar.png';
                
                // Hide clear button
                clearAvatarBtn.style.display = 'none';
                
                // Clear the file input
                avatarInput.value = '';
                
                // Mark form as dirty
                isUserFormDirty = true;
                
            } catch (error) {
                console.error('Error clearing avatar:', error);
                alert('Error clearing avatar. Please try again.');
            }
        });
    }

    // --- Edit Global Block Modal ---
    const gbModal = document.getElementById('edit-global-block-modal');
    const gbForm = document.getElementById('edit-global-block-form');
    const gbCommentsList = document.getElementById('gb-comments-list');
    let currentEditingBlockId = null;

    function openEditBlockModal(block){
        if(!block) return;
        currentEditingBlockId = block.id;
        gbForm.gbTitle = document.getElementById('gb-title');
        gbForm.gbDesc = document.getElementById('gb-desc');
        gbForm.gbLink = document.getElementById('gb-link');
        gbForm.gbIcon = document.getElementById('gb-icon');
        gbForm.gbCreated = document.getElementById('gb-created');
        gbForm.gbTitle.value = block.title || '';
        gbForm.gbDesc.value = block.desc || '';
        gbForm.gbLink.value = block.link || '';
        gbForm.gbIcon.value = block.icon || '';
        // Pre-fill datetime with existing createdAt (handles Firestore Timestamp, object, or ISO string)
        let d = null;
        const c = block.createdAt;
        if (c) {
          if (typeof c === 'object' && typeof c.toDate === 'function') {
            d = c.toDate();
          } else if (typeof c === 'object' && 'seconds' in c) {
            d = new Date(c.seconds * 1000);
          } else {
            d = new Date(c);
          }
        }
        if (d && !isNaN(d.getTime())) {
          // datetime-local requires local time in format YYYY-MM-DDTHH:MM
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          gbForm.gbCreated.value = local;
        } else {
          gbForm.gbCreated.value = '';
        }
        renderBlockComments(block.id);
        gbModal.style.display='block';
    }

    async function renderBlockComments(blockId){
        gbCommentsList.innerHTML = 'Loading...';
        const commentsSnap = await window.collabFirebaseUtils.getBlockComments(blockId).catch(()=>null);
        if(!commentsSnap){ gbCommentsList.innerHTML='Error loading'; return; }
        gbCommentsList.innerHTML = commentsSnap.docs.map(ds=>{
            const c = ds.data();
            return `<div class="gb-comment" data-id="${ds.id}" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span><strong>${c.authorTitle||c.author}</strong>: ${c.text}</span>
                <button class="gb-del-comment-btn" data-cid="${ds.id}" style="border:1px solid #000;background:none;">🗑</button>
            </div>`;
        }).join('') || '<p>No comments</p>';
    }

    gbModal.querySelector('.close-button').onclick = ()=>{ gbModal.style.display='none'; currentEditingBlockId=null; };

    gbForm.onsubmit = async (e)=>{
        e.preventDefault(); if(!currentEditingBlockId) return;
        const payload = {
          title: gbForm.gbTitle.value.trim(),
          desc: gbForm.gbDesc.value.trim(),
          link: gbForm.gbLink.value.trim(),
          icon: gbForm.gbIcon.value.trim()
        };
        if(gbForm.gbCreated.value){ payload.createdAt = new Date(gbForm.gbCreated.value).toISOString(); }
        await window.collabFirebaseUtils.updateGlobalBlock(currentEditingBlockId,payload).catch(err=>alert(err.message));
        gbModal.style.display='none';
        await loadBlocks(true);
    };

    // comment delete handler
    gbCommentsList.addEventListener('click', async (e)=>{
        const btn = e.target.closest('.gb-del-comment-btn');
        if(!btn) return; const cid = btn.dataset.cid; if(!currentEditingBlockId) return;
        if(!confirm('Delete comment?')) return;
        btn.disabled=true;
        await window.collabFirebaseUtils.deleteBlockComment(currentEditingBlockId,cid).catch(err=>alert(err.message));
        await renderBlockComments(currentEditingBlockId);
    });

    // Search & load more listeners
    document.getElementById('blocks-search-input').addEventListener('input',()=>renderBlocks());
    document.getElementById('load-more-blocks-btn').addEventListener('click',()=>loadBlocks());

    // Sort change listener
    const sortSelect = document.getElementById('gb-sort-select');
    if(sortSelect){ sortSelect.addEventListener('change', ()=> renderBlocks()); }

    // Accordion setup
    const sections = Array.from(document.querySelectorAll('.admin-section'));
    const defaultOpenId = 'users-section';
    sections.forEach(sec => {
        if (sec.id !== defaultOpenId) sec.classList.add('collapsed');
        const header = sec.querySelector('h2');
        if (header) {
            header.addEventListener('click', () => {
                sections.forEach(s => s.classList.add('collapsed'));
                sec.classList.remove('collapsed');
            });
        }
    });

    // Sidebar nav behaviour
    const navCards = document.querySelectorAll('.admin-nav-card');
    function setActive(card){ navCards.forEach(c=>c.classList.remove('active')); card.classList.add('active'); }
    navCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetSel = card.getAttribute('data-target');
            const target = document.querySelector(targetSel);
            if (target) {
                setActive(card);
                target.scrollIntoView({behavior:'smooth',block:'start'});
                sections.forEach(s => s.classList.add('collapsed'));
                target.classList.remove('collapsed');
            }
        });
    });
    // Mark users nav as active initially
    const firstNav = document.querySelector('.admin-nav-card[data-target="#'+defaultOpenId+'"]');
    if(firstNav) firstNav.classList.add('active');
}); 