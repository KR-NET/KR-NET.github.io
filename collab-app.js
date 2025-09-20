// collab-app.js

const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Collab App Initialized');

    const postsContainer = document.getElementById('collab-posts-container');
    const createPostBtn = document.getElementById('create-post-btn');
    const newPostModal = document.getElementById('new-post-modal');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const newPostForm = document.getElementById('new-post-form');

    const collabContentBody = document.querySelector('.collab-content-section-body');
    const postCollabBtn = document.getElementById('post-collab-btn');
    let originalCollabContentHTML = collabContentBody ? collabContentBody.innerHTML : ''; // Will be replaced by post list

    const PRACTICES = window.collabFirebaseUtils.PRACTICES;
    const KEYWORDS = window.collabFirebaseUtils.KEYWORDS;

    // Search and filter state
    let allPosts = [];
    let filteredPosts = [];
    let searchQuery = '';
    let selectedFilters = {
        practices: new Set(),
        keywords: new Set(),
        status: new Set(),
        dateRange: null
    };
    let searchTimeout = null;

    function linkify(text) {
        if (!text) return text;
        const urlRegex = /(\b(https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}([^\s<]*))/g;
        return text.replace(urlRegex, (url) => {
            let href = url;
            if (!/^(https?:\/\/)/i.test(href)) {
                href = 'http://' + href;
            }
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="post-info-link">${url}</a>`;
        });
    }

    // --- TIME AGO UTILITY --- (simple version)
    function formatTimeAgo(firestoreTimestamp) {
        if (!firestoreTimestamp) return '';
        const date = firestoreTimestamp.toDate(); // Convert Firestore Timestamp to JS Date
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);

        if (seconds < 60) return `${seconds} sec ago`;
        if (minutes < 60) return `${minutes} min ago`;
        if (hours < 24) return `${hours} hr ago`;
        if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // --- CHECK IF POST IS EXPIRED ---
    function isPostExpired(post) {
        if (!post.date) return false;
        
        const today = new Date();
        const postDate = new Date(post.date);
        
        // If time is specified, include it in the comparison
        if (post.time) {
            const [hours, minutes] = post.time.split(':').map(Number);
            postDate.setHours(hours, minutes, 0, 0);
        } else {
            // If no time specified, consider it expired at end of day
            postDate.setHours(23, 59, 59, 999);
        }
        
        return today > postDate;
    }

    // --- SEARCH AND FILTER FUNCTIONS ---
    function debouncedSearch() {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        searchTimeout = setTimeout(() => {
            applySearchAndFilters();
        }, 300);
    }

    function applySearchAndFilters() {
        filteredPosts = allPosts.filter(post => {
            // Search filter
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                const titleMatch = (post.title || '').toLowerCase().includes(searchLower);
                const contentMatch = (post.info || '').toLowerCase().includes(searchLower);
                const authorMatch = (post.authorDisplayName || '').toLowerCase().includes(searchLower);
                const keywordsMatch = (post.keywords || []).some(k => String(k).toLowerCase().includes(searchLower));
                const practicesMatch = (post.practices || []).some(p => String(p).toLowerCase().includes(searchLower));
                
                if (!titleMatch && !contentMatch && !authorMatch && !keywordsMatch && !practicesMatch) {
                    return false;
                }
            }

            // Practice filters
            if (selectedFilters.practices.size > 0) {
                const hasMatchingPractice = (post.practices || [])
                    .map(p => String(p).toLowerCase())
                    .some(p => selectedFilters.practices.has(p));
                if (!hasMatchingPractice) return false;
            }

            // Keyword filters
            if (selectedFilters.keywords.size > 0) {
                const hasMatchingKeyword = (post.keywords || [])
                    .map(k => String(k).toLowerCase())
                    .some(k => selectedFilters.keywords.has(k));
                if (!hasMatchingKeyword) return false;
            }

            // Status filters
            if (selectedFilters.status.size > 0) {
                const isExpired = isPostExpired(post);
                const isActive = !isExpired;
                
                if (selectedFilters.status.has('active') && !isActive) return false;
                if (selectedFilters.status.has('expired') && !isExpired) return false;
            }

            // Date range filters
            if (selectedFilters.dateRange) {
                const postDate = new Date(post.date);
                const today = new Date();
                
                switch (selectedFilters.dateRange) {
                    case 'this-week':
                        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                        if (postDate < weekAgo) return false;
                        break;
                    case 'this-month':
                        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                        if (postDate < monthAgo) return false;
                        break;
                    case 'upcoming':
                        if (postDate < today) return false;
                        break;
                }
            }

            return true;
        });

        renderCollabPosts(filteredPosts);
        updateFilterChips();
        updateClearFiltersButton();
    }

    function updateFilterChips() {
        const chipsContainer = document.getElementById('collab-filter-chips');
        if (!chipsContainer) return;

        let chipsHTML = '';
        
        // Practice chips
        selectedFilters.practices.forEach(practice => {
            chipsHTML += `
                <span class="filter-chip" data-type="practice" data-value="${practice}">
                    ${practice.toUpperCase()}
                    <span class="chip-close" data-type="practice" data-value="${practice}">&times;</span>
                </span>
            `;
        });

        // Keyword chips
        selectedFilters.keywords.forEach(keyword => {
            chipsHTML += `
                <span class="filter-chip" data-type="keyword" data-value="${keyword}">
                    ${keyword}
                    <span class="chip-close" data-type="keyword" data-value="${keyword}">&times;</span>
                </span>
            `;
        });

        // Status chips
        selectedFilters.status.forEach(status => {
            const displayText = status === 'active' ? 'Active Posts' : 'Expired Posts';
            chipsHTML += `
                <span class="filter-chip" data-type="status" data-value="${status}">
                    ${displayText}
                    <span class="chip-close" data-type="status" data-value="${status}">&times;</span>
                </span>
            `;
        });

        // Date range chip
        if (selectedFilters.dateRange) {
            const dateLabels = {
                'this-week': 'This Week',
                'this-month': 'This Month',
                'upcoming': 'Upcoming'
            };
            chipsHTML += `
                <span class="filter-chip" data-type="dateRange" data-value="${selectedFilters.dateRange}">
                    ${dateLabels[selectedFilters.dateRange]}
                    <span class="chip-close" data-type="dateRange" data-value="${selectedFilters.dateRange}">&times;</span>
                </span>
            `;
        }

        chipsContainer.innerHTML = chipsHTML;
    }

    function updateClearFiltersButton() {
        const clearBtn = document.getElementById('clear-collab-filters-btn');
        if (!clearBtn) return;

        const hasFilters = selectedFilters.practices.size > 0 || 
                          selectedFilters.keywords.size > 0 || 
                          selectedFilters.status.size > 0 || 
                          selectedFilters.dateRange;

        clearBtn.classList.toggle('active', hasFilters);
    }

    function clearAllFilters() {
        selectedFilters.practices.clear();
        selectedFilters.keywords.clear();
        selectedFilters.status.clear();
        selectedFilters.dateRange = null;
        searchQuery = '';
        
        const searchInput = document.getElementById('collab-search-input');
        if (searchInput) searchInput.value = '';
        
        applySearchAndFilters();
        closeFilterDropdown();
    }

    function toggleFilterDropdown() {
        console.log('Filter button clicked');
        const dropdown = document.getElementById('collab-filter-dropdown');
        if (!dropdown) {
            console.error('Filter dropdown not found');
            return;
        }

        const isActive = dropdown.classList.contains('active');
        console.log('Dropdown active state:', isActive);
        
        if (isActive) {
            closeFilterDropdown();
        } else {
            openFilterDropdown();
        }
    }

    function openFilterDropdown() {
        console.log('Opening filter dropdown');
        const dropdown = document.getElementById('collab-filter-dropdown');
        if (!dropdown) {
            console.error('Dropdown not found in openFilterDropdown');
            return;
        }

        dropdown.classList.add('active');
        console.log('Added active class to dropdown');
        document.addEventListener('click', outsideClickHandler);
        document.addEventListener('keydown', escHandler);
    }

    function closeFilterDropdown() {
        const dropdown = document.getElementById('collab-filter-dropdown');
        if (!dropdown) return;

        dropdown.classList.remove('active');
        document.removeEventListener('click', outsideClickHandler);
        document.removeEventListener('keydown', escHandler);
    }

    function outsideClickHandler(e) {
        const dropdown = document.getElementById('collab-filter-dropdown');
        const filterBtn = document.getElementById('collab-filter-btn');
        
        if (dropdown && !dropdown.contains(e.target) && !filterBtn.contains(e.target)) {
            closeFilterDropdown();
        }
    }

    function escHandler(e) {
        if (e.key === 'Escape') {
            closeFilterDropdown();
        }
    }

    function handleFilterSelection(type, value) {
        const normalized = String(value).toLowerCase();
        switch (type) {
            case 'practice':
                if (selectedFilters.practices.has(normalized)) {
                    selectedFilters.practices.delete(normalized);
                } else {
                    selectedFilters.practices.add(normalized);
                }
                break;
            case 'keyword':
                if (selectedFilters.keywords.has(normalized)) {
                    selectedFilters.keywords.delete(normalized);
                } else {
                    selectedFilters.keywords.add(normalized);
                }
                break;
            case 'status':
                if (selectedFilters.status.has(normalized)) {
                    selectedFilters.status.delete(normalized);
                } else {
                    selectedFilters.status.add(normalized);
                }
                break;
            case 'dateRange':
                selectedFilters.dateRange = selectedFilters.dateRange === value ? null : value;
                break;
        }
        
        applySearchAndFilters();
    }

    function removeFilterChip(type, value) {
        switch (type) {
            case 'practice':
                selectedFilters.practices.delete(value);
                break;
            case 'keyword':
                selectedFilters.keywords.delete(value);
                break;
            case 'status':
                selectedFilters.status.delete(value);
                break;
            case 'dateRange':
                selectedFilters.dateRange = null;
                break;
        }
        
        applySearchAndFilters();
    }

    function cycleSearchPlaceholders() {
        const searchInput = document.getElementById('collab-search-input');
        if (!searchInput) return;

        const placeholders = [
            'Search collaborations...',
            'Search by title, content, or author...',
            'Filter by practices or keywords...',
            'Find active or upcoming posts...'
        ];

        let currentIndex = 0;
        
        const cyclePlaceholder = () => {
            searchInput.placeholder = placeholders[currentIndex];
            currentIndex = (currentIndex + 1) % placeholders.length;
        };

        // Initial placeholder
        cyclePlaceholder();
        
        // Cycle every 3 seconds
        setInterval(cyclePlaceholder, 3000);
    }

    // --- RENDER POSTS --- 
    function renderCollabPosts(posts) {
        if (!collabContentBody) return;
        if (posts.length === 0) {
            collabContentBody.innerHTML = '<div class="no-posts-message"><h2>No collaborations posted yet.</h2><p>Be the first to share an idea!</p></div>';
            return;
        }

        let postsHTML = '<div class="collab-posts-list">';
        posts.forEach(post => {
            const timeAgo = formatTimeAgo(post.createdAt);
            const currentUserEmail = window.collabFirebaseUtils.currentUser ? window.collabFirebaseUtils.currentUser.email : null;
            const isAuthor = currentUserEmail === post.authorEmail;
            const isExpired = isPostExpired(post);

            const infoText = post.info || '';
            const linkifiedInfo = infoText.replace(urlRegex, '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>');
            const isLong = infoText.length > 200;
            
            // Linkify the truncated text, or the full text if it's short
            const displayInfo = isLong ? linkify(infoText.substring(0, 200)) + '...' : linkifiedInfo;
            
            // The read-more button will contain the fully linkified text
            const readMoreButton = isLong ? `<button class="read-more-btn" data-full-info="${escape(linkifiedInfo)}">Read More</button>` : '';

            const authorLink = post.authorId 
                ? `<a href="/?profile=${post.authorId}" target="_blank" class="view-profile-btn primary-btn">Connect With ${post.authorDisplayName.split(' ')[0]}</a>` 
                : '';

            const expiredBadge = isExpired ? '<span class="post-expired-badge">POST EXPIRED</span>' : '';
            const expiredClass = isExpired ? ' post-expired' : '';

            postsHTML += `
                <div class="collab-post-item collapsed${expiredClass}" data-post-id="${post.id}">
                    <div class="post-header">
                        <img src="${post.authorAvatar || 'static/img/default-avatar.png'}" alt="${post.authorDisplayName}" class="post-author-avatar">
                        <div class="post-author-info">
                            <span class="post-author-name">${post.authorDisplayName}</span>
                            <span class="post-time-ago">${timeAgo}</span>
                        </div>
                        ${isAuthor ? 
                            `<div class="post-actions-owner">
                                <button class="edit-post-btn" data-id="${post.id}">Edit</button>
                                <button class="delete-post-btn" data-id="${post.id}" data-image-path="${post.imagePath || ''}">Delete</button>
                            </div>` : ''}
                    </div>
                    <div class="post-body">
                        ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Post image" class="post-image">` : ''}
                        <div class="post-content">
                            <div class="post-title-container">
                                <h3 class="post-title">${post.title}</h3>
                                ${expiredBadge}
                            </div>
                            <p class="post-info">${displayInfo}</p>
                            ${readMoreButton}
                            <a href="#" class="view-more-link">View More...</a>
                        </div>
                    </div>
                    <div class="post-bottom-row">
                       <div class="post-meta">
                           <div class="post-tags">
                               ${post.keywords.map(k => `<span class="post-tag keyword-tag">${k}</span>`).join('')}
                           </div>
                           <div class="post-tags post-practices-tags">
                               ${post.practices.map(p => `<span class="post-tag practice-tag">${p.toUpperCase()}</span>`).join('')}
                           </div>
                           <br>
                           ${post.date ? `<span class="post-datetime">Date: ${post.date}${post.time ? ', Time: ' + post.time : ''}</span>` : ''}
                       </div>
                       <div class="post-footer">
                           ${authorLink}
                       </div>
                    </div>
                </div>
            `;
        });
        postsHTML += '</div>';
        collabContentBody.innerHTML = postsHTML;

        // Add event listeners for new buttons (Read More, Edit, Delete)
        attachPostItemEventListeners(); 
    }
    
    function attachPostItemEventListeners() {
        document.querySelectorAll('.read-more-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const postInfoP = this.closest('.post-content').querySelector('.post-info');
                if (postInfoP) {
                    postInfoP.innerHTML = unescape(this.dataset.fullInfo);
                    this.remove(); // Remove the button after expanding
                }
            });
        });

        // Edit button functionality
        document.querySelectorAll('.edit-post-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const postId = this.dataset.id;
                
                // --- START: Fetch full post data from Firestore ---
                const post = await window.collabFirebaseUtils.getCollabPostById(postId);
                if (!post) {
                    alert("Error: Could not find the post to edit.");
                    return;
                }
                // --- END: Fetch full post data from Firestore ---

                // Show edit form
                collabContentBody.innerHTML = getCreatePostFormHTML();
                attachFormEventListeners();

                // Fill form with current data from the fetched post object
                document.getElementById('post-title').value = post.title;
                document.getElementById('post-info').value = post.info;
                document.getElementById('post-date').value = post.date || '';
                document.getElementById('post-time').value = post.time || '';

                // Select keywords and practices
                if (post.keywords && Array.isArray(post.keywords)) {
                    post.keywords.forEach(keyword => {
                    const pill = document.querySelector(`#post-keywords-pills .collab-form-pill[data-value="${keyword}"]`);
                    if (pill) pill.classList.add('selected');
                });
                }

                if (post.practices && Array.isArray(post.practices)) {
                    post.practices.forEach(practice => {
                    const pill = document.querySelector(`#post-practices-pills .collab-form-pill[data-value="${practice}"]`);
                    if (pill) pill.classList.add('selected');
                });
                }

                // Modify submit button for edit mode
                const submitBtn = document.getElementById('submit-create-post');
                submitBtn.textContent = 'Update Post';
                submitBtn.dataset.mode = 'edit';
                submitBtn.dataset.postId = postId;
                submitBtn.dataset.imagePath = post.imageUrl || ''; // Use image path from fetched data

                // Update form submission handler
                submitBtn.onclick = async () => {
                    if (!validateCreatePostForm()) return;

                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Updating...';

                    try {
                        const postData = {
                            title: document.getElementById('post-title').value.trim(),
                            info: document.getElementById('post-info').value.trim(),
                            keywords: Array.from(document.querySelectorAll('#post-keywords-pills .collab-form-pill.selected')).map(p => p.dataset.value),
                            practices: Array.from(document.querySelectorAll('#post-practices-pills .collab-form-pill.selected')).map(p => p.dataset.value),
                            date: document.getElementById('post-date').value,
                            time: document.getElementById('post-time').value
                        };

                        const imageFile = document.getElementById('post-image').files[0];
                        await window.collabFirebaseUtils.updateCollabPost(
                            submitBtn.dataset.postId,
                            postData,
                            submitBtn.dataset.imagePath,
                            imageFile
                        );

                        alert('Post updated successfully!');
                        // Reset the post button state
                        postCollabBtn.classList.remove('active');
                        // Load posts
                        loadAndDisplayPosts();
                    } catch (error) {
                        console.error("Error updating post:", error);
                        displayFormError(error.message || "Failed to update post. Please try again.");
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Update Post';
                    }
                };
            });
        });

        // Delete button functionality
        document.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                if (!confirm('Are you sure you want to delete this post?')) return;

                const postId = this.dataset.id;
                const imagePath = this.dataset.imagePath;

                try {
                    await window.collabFirebaseUtils.deleteCollabPost(postId, imagePath);
                    alert('Post deleted successfully!');
                    loadAndDisplayPosts();
                } catch (error) {
                    console.error("Error deleting post:", error);
                    alert(error.message || "Failed to delete post. Please try again.");
                }
            });
        });

        // OPEN MODAL LISTENERS (added)
        document.querySelectorAll('.view-more-link, .collab-post-item.collapsed .post-image').forEach(el => {
            el.addEventListener('click', function(e) {
                e.preventDefault();
                const postItem = this.closest('.collab-post-item');
                if (postItem) openPostModal(postItem.dataset.postId);
            });
        });
    }

    // --- LOAD AND DISPLAY POSTS --- 
    async function loadAndDisplayPosts() {
        if (!collabContentBody) return;
        const loadingScreen = document.getElementById('collab-loading-screen');
        const loadingGif = loadingScreen ? loadingScreen.querySelector('img') : null;
        const loadingText = loadingScreen ? loadingScreen.querySelector('p') : null;
        const loadingCanvas = document.getElementById('collab-loading-animation-canvas');

        // Show loading screen
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
            if (window.startLoadingCanvasAnimation) window.startLoadingCanvasAnimation('collab-loading-animation-canvas');
            if (loadingGif) loadingGif.classList.add('visible');
            if (loadingText) loadingText.classList.add('visible');
            if (loadingCanvas) loadingCanvas.classList.add('visible');
        }

        try {
            const posts = await window.collabFirebaseUtils.getCollabPosts();
            // Sort posts by creation date to ensure consistent order
            posts.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
            
            // Store all posts and initialize filtered posts
            allPosts = posts;
            filteredPosts = posts;
            
            renderCollabPosts(posts);
            
            // Initialize search and filter system
            initializeSearchAndFilters();
        } catch (error) {
            console.error("Error loading posts:", error);
            collabContentBody.innerHTML = '<div class="no-posts-message error"><h2>Could not load collaborations.</h2><p>Please try again later.</p></div>';
        } finally {
            // Hide loading screen
            if (loadingScreen) {
                setTimeout(() => {
                    if (window.stopLoadingCanvasAnimation) window.stopLoadingCanvasAnimation();
                    loadingScreen.classList.add('hidden');
                    if (loadingGif) loadingGif.classList.remove('visible');
                    if (loadingText) loadingText.classList.remove('visible');
                    if (loadingCanvas) loadingCanvas.classList.remove('visible');
                }, 300);
            }
        }
    }

    function getCreatePostFormHTML() {
        let practicesHTML = PRACTICES.map(practice => 
            `<span class="collab-form-pill" data-type="practice" data-value="${practice}">${practice.toUpperCase()}</span>`
        ).join('');

        let keywordsHTML = KEYWORDS.map(keyword =>
            `<span class="collab-form-pill ${keyword === 'COLLABORATION' ? 'selected' : ''}" data-type="keyword" data-value="${keyword}">${keyword}</span>`
        ).join('');

        return `
            <div id="create-post-form-container">
                <h2>Create New Post</h2>
                <div id="post-form-error-message" class="form-error-message" style="display:none;"></div>
                <div class="form-field">
                    <label class="form-input-title" for="post-title">Collaboration Title<span>*</span></label>
                    <input type="text" id="post-title" class="input-feild collab-input-field" name="post-title" required>
                </div>
                <div class="form-field">
                    <label for="post-info">Description<span>*</span></label>
                    <textarea id="post-info" name="post-info" class="input-feild collab-input-field" rows="10" required></textarea>
                </div>
                
                

                <div class="form-field">
                    <label>Select Keywords<span>*</span></label>
                    <div class="pills-container" id="post-keywords-pills">
                        ${keywordsHTML}
                    </div>
                </div>
                <div class="form-field">
                    <label>Categories (Select up to 4)</label>
                    <div class="pills-container" id="post-practices-pills">
                        ${practicesHTML}
                    </div>
                </div>

                <div class="form-field">
                    <label for="post-image">Image (Optional)</label>
                    <input type="file" id="post-image" name="post-image" accept="image/*" class="file-upload-input-collab">
                     <small>Max 5MB. Recommended 1:1 aspect ratio.</small>
                </div>


                <div class="form-field-row">
                    <div class="form-field">
                        <label for="post-date">Date (Optional)</label>
                        <input type="date" id="post-date" name="post-date" class="input-feild collab-input-field2">
                    </div>
                    <div class="form-field">
                        <label for="post-time">Time (Optional)</label>
                        <input type="time" id="post-time" name="post-time" class="input-feild collab-input-field2">
                    </div>
                </div>
                <div class="form-actions">
                     
                    <button type="submit" id="submit-create-post" class="primary-btn">Submit Post</button>
                </div>
            </div>
        `;
    }

    //<button type="button" id="cancel-create-post" class="secondary-btn">Cancel</button>

    function displayFormError(message) {
        const errorDiv = document.getElementById('post-form-error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function clearFormError() {
        const errorDiv = document.getElementById('post-form-error-message');
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    }

    function validateCreatePostForm() {
        clearFormError();
        const title = document.getElementById('post-title').value.trim();
        const info = document.getElementById('post-info').value.trim();
        const imageFile = document.getElementById('post-image').files[0];
        const selectedKeywords = Array.from(document.querySelectorAll('#post-keywords-pills .collab-form-pill.selected')).map(p => p.dataset.value);

        if (!title) {
            displayFormError('Post Title is required.');
            return false;
        }
        if (!info) {
            displayFormError('Post Information is required.');
            return false;
        }
        if (selectedKeywords.length === 0) {
            displayFormError('At least one Keyword must be selected.');
            return false;
        }

        if (imageFile) {
            if (imageFile.size > 5 * 1024 * 1024) { // 5MB limit
                displayFormError('Image size should not exceed 5MB.');
                return false;
            }
            if (!['image/jpeg', 'image/png', 'image/gif'].includes(imageFile.type)) {
                displayFormError('Invalid image type. Please use JPG, PNG, or GIF.');
                return false;
            }
        }
        return true;
    }

    async function handlePostSubmission() {
        if (!validateCreatePostForm()) {
            return;
        }

        const submitButton = document.getElementById('submit-create-post');
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        try {
            const user = window.collabFirebaseUtils.currentUser;
            if (!user) {
                displayFormError("You must be logged in to post.");
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Post';
                return;
            }

            // Fetch full user profile to get the numeric ID
            const userProfile = await window.collabFirebaseUtils.getUserProfile(user.email);
            if (!userProfile || typeof userProfile.id === 'undefined') {
                displayFormError("Could not retrieve your user ID. Please try again.");
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Post';
                return;
            }

            const postData = {
                title: document.getElementById('post-title').value.trim(),
                info: document.getElementById('post-info').value.trim(),
                keywords: Array.from(document.querySelectorAll('#post-keywords-pills .collab-form-pill.selected')).map(p => p.dataset.value),
                practices: Array.from(document.querySelectorAll('#post-practices-pills .collab-form-pill.selected')).map(p => p.dataset.value),
                date: document.getElementById('post-date').value,
                time: document.getElementById('post-time').value,
                authorEmail: user.email,
                authorId: userProfile.id, // Numeric ID
                createdAt: new Date() // Will be converted to Firestore Timestamp by server
            };

            const imageFile = document.getElementById('post-image').files[0];

            await window.collabFirebaseUtils.saveCollabPost(postData, imageFile);
            
            alert('Post submitted successfully!'); // Replace with better notification
            loadAndDisplayPosts(); // Refresh posts list

        } catch (error) {
            console.error("Error submitting post:", error);
            displayFormError(error.message || "Failed to submit post. Please try again.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Post';
        }
    }

    function attachFormEventListeners() {
        const formContainer = document.getElementById('create-post-form-container');
        if (!formContainer) return;

        const cancelBtn = document.getElementById('cancel-create-post');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                loadAndDisplayPosts(); // On cancel, show the posts list
            });
        }

        const submitBtn = document.getElementById('submit-create-post');
        if (submitBtn) {
            // Remove any previous event listeners
            submitBtn.onclick = null;
            submitBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (submitBtn.dataset.mode === 'edit') {
                    // Do nothing here, edit handler is set in the edit logic
                    return;
                }
                handlePostSubmission();
            });
        }

        const pills = formContainer.querySelectorAll('.collab-form-pill');
        let practicePillsSelected = 0;
        const maxPractices = 4;

        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                const type = pill.dataset.type;
                if (type === 'practice') {
                    if (pill.classList.contains('selected')) {
                        pill.classList.remove('selected');
                        practicePillsSelected--;
                    } else {
                        if (practicePillsSelected < maxPractices) {
                            pill.classList.add('selected');
                            practicePillsSelected++;
                        } else {
                            // Optional: Notify user they can only select maxPractices
                            displayFormError(`You can select up to ${maxPractices} practices.`);
                            setTimeout(clearFormError, 3000); // Clear message after 3s
                        }
                    }
                } else { // For keywords, no limit
                    pill.classList.toggle('selected');
                }
            });
        });
        
        const fileInput = formContainer.querySelector('#post-image');
        if (fileInput) {
            const smallIndicator = formContainer.querySelector('#post-image + small');
            const originalSmallText = smallIndicator ? smallIndicator.textContent : 'Max 5MB. Recommended 1:1 aspect ratio.';
            fileInput.addEventListener('change', function() {
                if (smallIndicator) {
                    if (this.files && this.files.length > 0) {
                        smallIndicator.textContent = this.files[0].name;
                    } else {
                        smallIndicator.textContent = originalSmallText;
                    }
                }
            });
        }
    }

    if (postCollabBtn && collabContentBody) {
        postCollabBtn.addEventListener('click', () => {
            const user = window.collabFirebaseUtils.currentUser;
            if (!user) {
                 alert("Please log in to create a post."); // Or a more styled notification
                 return;
            }

            // Toggle the active state of the button
            postCollabBtn.classList.toggle('active');

            // Check if the form is currently displayed
            const isFormDisplayed = collabContentBody.querySelector('#create-post-form-container');
            
            if (isFormDisplayed) {
                // If form is displayed, show posts
                loadAndDisplayPosts();
            } else {
                // If posts are displayed, show form
                if (!originalCollabContentHTML) {
                    originalCollabContentHTML = collabContentBody.innerHTML;
                }
                collabContentBody.innerHTML = getCreatePostFormHTML();
                attachFormEventListeners();
            }
        });
    }

    // --- INITIALIZE SEARCH AND FILTERS ---
    function initializeSearchAndFilters() {
        console.log('Initializing search and filters...');
        
        // Initialize search input
        const searchInput = document.getElementById('collab-search-input');
        if (searchInput) {
            console.log('Found search input, adding event listener');
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value;
                debouncedSearch();
            });
        } else {
            console.error('Search input not found');
        }

        // Initialize filter button
        const filterBtn = document.getElementById('collab-filter-btn');
        if (filterBtn) {
            console.log('Found filter button, adding event listener');
            filterBtn.addEventListener('click', toggleFilterDropdown);
        } else {
            console.error('Filter button not found');
        }

        // Initialize clear filters button
        const clearBtn = document.getElementById('clear-collab-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearAllFilters);
        }

        // Initialize filter chips container
        const chipsContainer = document.getElementById('collab-filter-chips');
        if (chipsContainer) {
            chipsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-close')) {
                    const type = e.target.dataset.type;
                    const value = e.target.dataset.value;
                    removeFilterChip(type, value);
                }
            });
        }

        // Initialize filter dropdown pills
        const filterDropdown = document.getElementById('collab-filter-dropdown');
        if (filterDropdown) {
            console.log('Found filter dropdown, adding event listeners');
            // Filter pill clicks (robust to clicks on text nodes or child elements)
            filterDropdown.addEventListener('click', (e) => {
                const pill = e.target.closest('.filter-pill');
                if (pill && filterDropdown.contains(pill)) {
                    const type = pill.dataset.type;
                    const value = pill.dataset.value;
                    handleFilterSelection(type, value);
                    // Update visual state
                    pill.classList.toggle('selected');
                }
            });

            // Close button
            const closeBtn = filterDropdown.querySelector('.dropdown-close');
            if (closeBtn) {
                console.log('Found close button, adding event listener');
                closeBtn.addEventListener('click', closeFilterDropdown);
            } else {
                console.error('Close button not found in dropdown');
            }
        } else {
            console.error('Filter dropdown not found');
        }

        // Start placeholder cycling
        cycleSearchPlaceholders();
    }

    // Initialize search and filters immediately when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing search and filters');
        initializeSearchAndFilters();
    });

    // Also try to initialize immediately if DOM is already ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM loaded, initializing search and filters');
            initializeSearchAndFilters();
        });
    } else {
        console.log('DOM already ready, initializing search and filters');
        initializeSearchAndFilters();
    }

    // Load posts by default when the page loads and DOM is ready
    if (collabContentBody && !collabContentBody.querySelector('#create-post-form-container')) {
       loadAndDisplayPosts();
    }

    // --- Post Modal Logic (added) ---
    const postModalOverlay = document.getElementById('post-modal-overlay');
    const postModalBody = document.getElementById('post-modal-body');
    const closePostModalBtn = document.getElementById('close-post-modal');

    function openPostModal(postId) {
        if (!postModalOverlay || !postModalBody) return;
        const postEl = document.querySelector(`.collab-post-item[data-post-id="${postId}"]`);
        if (!postEl) return;

        // Clone and prepare
        const clone = postEl.cloneNode(true);
        clone.classList.remove('collapsed');
        clone.querySelectorAll('.view-more-link').forEach(l => l.remove());

        // Ensure image full width
        clone.querySelectorAll('.post-image').forEach(img => {
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.maxHeight = '400px';
            img.style.marginRight = '0';
        });

        postModalBody.innerHTML = '';
        postModalBody.appendChild(clone);

        postModalOverlay.classList.remove('hidden');
        requestAnimationFrame(() => postModalOverlay.classList.add('visible'));

        document.body.style.overflow = 'hidden';
    }

    function closePostModal() {
        if (!postModalOverlay) return;
        postModalOverlay.classList.remove('visible');
        setTimeout(() => {
            postModalOverlay.classList.add('hidden');
            if (postModalBody) postModalBody.innerHTML = '';
        }, 300);
        document.body.style.overflow = '';
    }

    if (closePostModalBtn) closePostModalBtn.addEventListener('click', closePostModal);
    if (postModalOverlay) {
        postModalOverlay.addEventListener('click', (e) => {
            if (e.target === postModalOverlay) closePostModal();
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && postModalOverlay && postModalOverlay.classList.contains('visible')) {
            closePostModal();
        }
    });
    // --- End Post Modal Logic ---
}); 