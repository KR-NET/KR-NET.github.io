// app.js
import Cropper from "https://cdn.jsdelivr.net/npm/cropperjs@1.5.13/dist/cropper.esm.js";

// --- HELP MODAL LOGIC ---
const helpIcons = document.querySelectorAll('.help-icon');
const helpModal = document.getElementById('help-modal');
const helpModalTitle = document.getElementById('help-modal-title');
const helpModalText = document.getElementById('help-modal-text');
const helpModalClose = document.getElementById('help-modal-close');

const helpContent = {
  profile: {
    title: "My Profile Section",
    text: "Personalise your page, fill in your details like title, bio, and social media links, and upload a profile picture"
  },
  connections: {
    title: "Connections Section",
    text: "This section shows users you've mutually connected with. Click 'Manage Connections' to find and connect with others you've collaborated with. This determines your position in the network web."
  },
  links: {
    title: "Links Section",
    text: "What is it you do? What demonstates your work? Add links to your projects, websites, or other online content here. Build your profile using blocks (default, large image, or carousel)."
  }
};

helpIcons.forEach(icon => {
  icon.addEventListener('click', (e) => {
    const section = e.target.dataset.section;
    if (helpContent[section]) {
      helpModalTitle.textContent = helpContent[section].title;
      helpModalText.textContent = helpContent[section].text;
      helpModal.style.display = 'flex';
    }
  });
});

function closeHelpModal() {
  helpModal.style.display = 'none';
}

helpModalClose.addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) { // Clicked on the background
    closeHelpModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && helpModal.style.display === 'flex') {
    closeHelpModal();
  }
});

// --- END HELP MODAL LOGIC ---

// Loading screen management
const loadingScreen = document.getElementById('loading-screen');
let loadingTasks = 0;

window.startLoading = function() {
  loadingTasks++;
  loadingScreen.classList.remove('hidden');
};

window.stopLoading = function() {
  loadingTasks--;
  if (loadingTasks <= 0) {
    loadingTasks = 0;
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
    }, 500); // Match the CSS transition duration
  }
};

// Lazy loading for blocks
let blocksLoaded = false;
const blocksSection = document.querySelector('.blocks-section');
const blocksObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !blocksLoaded && window.firebaseUtils.currentUser) {
      loadBlocks();
    }
  });
}, { threshold: 0.1 });

blocksObserver.observe(blocksSection);

async function loadBlocks() {
  if (blocksLoaded) return;
  blocksLoaded = true;
  
  try {
    const email = window.firebaseUtils.currentUser.email;
    const docRef = await window.firebaseUtils.getUserDocRef(email);
    const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (Array.isArray(data.blocks)) {
        window.renderBlocks(data.blocks);
      }
    }
  } catch (error) {
    console.error('Error loading blocks:', error);
  }
}

const avatarInput = document.getElementById("avatar-upload");
const avatarPreview = document.getElementById("avatar-preview");
const saveStatusEl = document.getElementById('save-status');

let avatarFile = null;
let cropper = null;

avatarInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const modal = document.createElement("div");
      modal.style.position = "fixed";
      modal.style.top = "0";
      modal.style.left = "0";
      modal.style.width = "100vw";
      modal.style.height = "100vh";
      modal.style.background = "rgba(0,0,0,0.8)";
      modal.style.display = "flex";
      modal.style.justifyContent = "center";
      modal.style.alignItems = "center";
      modal.style.zIndex = "10002";
      
      modal.innerHTML = `<div style="background: white; padding: 1rem; border-radius: 8px; max-width: 90%; max-height: 90vh; overflow: auto;">
        <div style="max-height: 70vh; margin-bottom: 1rem;"><img id="crop-image" style="max-width: 100%; display: block;" /></div>
        <div style="text-align: center;">
          <button id="crop-confirm" style="margin-right: 10px;">Crop</button>
          <button id="crop-cancel" class="secondary">Cancel</button>
        </div>
      </div>`;
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
        
        window.startLoading();
        try {
          const blob = await new Promise(resolve => cropper.getCroppedCanvas().toBlob(resolve, 'image/jpeg'));
          
          avatarFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
          const compressedBlob = await compressImage(avatarFile, 0.7, 800, 800);
          const compressedFile = new File([compressedBlob], "avatar.jpg", { type: "image/jpeg" });
          
          // Upload the new avatar immediately
          const email = window.firebaseUtils.currentUser.email;
          const avatarUrl = await window.firebaseUtils.uploadImage(compressedFile, `avatars/${email}`);
          
          // Update the preview
          avatarPreview.src = avatarUrl;
          
          // Save to Firestore
          await window.firebaseUtils.saveUserData(email, { avatar: avatarUrl });
          
          cropper.destroy();
          modal.remove();
        } catch (error) {
          console.error('Error saving avatar:', error);
          alert('Error saving avatar. Please try again.');
          // Restore button state on error
          cropConfirmBtn.disabled = false;
          cropCancelBtn.disabled = false;
          cropConfirmBtn.textContent = 'Crop';
        } finally {
          window.stopLoading();
        }
      };

      modal.querySelector("#crop-cancel").onclick = () => {
        cropper.destroy();
        modal.remove();
      };
    };
  }
});

async function compressImage(file, quality = 0.6, maxWidth = 700, maxHeight = 700) {
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

// --- NOTIFICATION POPUP --- 
function showNotification(message, isError = false) {
  const popup = document.getElementById('notification-popup');
  popup.textContent = message;
  popup.style.background = isError ? '#c0392b' : '#222';
  popup.style.display = 'block';
  popup.style.opacity = '1';
  setTimeout(() => {
    popup.style.opacity = '0';
    setTimeout(() => { popup.style.display = 'none'; }, 300);
  }, 2000);
}

// --- AUTO-SAVE LOGIC ---

// Debounce function to limit how often a function is called
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Helper function to normalize social media handles into full URLs
function normalizeSocialUrl(value, platform) {
    if (!value || value.trim() === '') return '';
    
    value = value.trim();

    // If it's already a full URL, keep it.
    if (value.startsWith('http') || value.startsWith('www.')) {
        return value;
    }

    // It's a handle, format it.
    const handle = value.startsWith('@') ? value.substring(1) : value;

    switch(platform) {
        case 'instagram':
            return `https://www.instagram.com/${handle}`;
        case 'tiktok':
            return `https://www.tiktok.com/@${handle}`;
        case 'youtube':
             // Assume new @-handles for YouTube
             return `https://www.youtube.com/@${handle}`;
        default:
            return value;
    }
}

// Function to save profile data
async function autoSaveProfile() {
    if (!window.firebaseUtils.currentUser || !saveStatusEl) return;
    
    // 1. Show "Saving..." status
    saveStatusEl.textContent = 'Saving...';
    saveStatusEl.classList.remove('saved');
    saveStatusEl.classList.add('visible');
    
    try {
        const email = window.firebaseUtils.currentUser.email;
        
        // Gather data from all inputs
        const profileData = {
            title: document.getElementById("profile-title").value,
            bio: document.getElementById("bio").value,
            instagram: normalizeSocialUrl(document.getElementById("instagram").value, 'instagram'),
            youtube: normalizeSocialUrl(document.getElementById("youtube").value, 'youtube'),
            tiktok: normalizeSocialUrl(document.getElementById("tiktok").value, 'tiktok'),
            practices: selectedPractices // This is updated by the practice pills
        };
        
        // Note: Avatar is saved separately in its own flow to handle cropping
        
        await window.firebaseUtils.saveUserData(email, profileData);
        
        // 2. Show "Saved" status on success
        saveStatusEl.textContent = '✓ Saved';
        saveStatusEl.classList.add('saved');
        
    } catch (e) {
        console.error('Auto-save failed:', e);
        // Show error status
        saveStatusEl.textContent = 'Error saving';
        saveStatusEl.classList.add('error'); // You can add an error class for styling if you want
    } finally {
        // 3. Hide status indicator after a delay
        setTimeout(() => {
            saveStatusEl.classList.remove('visible');
        }, 2000); // Keep "Saved" message visible for 2 seconds
    }
}

// Create a debounced version of the save function
const debouncedAutoSave = debounce(autoSaveProfile, 1500);

// Attach event listeners to all relevant inputs
document.addEventListener('DOMContentLoaded', () => {
    const inputsToTrack = document.querySelectorAll(
        '#profile-title, #bio, #instagram, #youtube, #tiktok'
    );
    
    inputsToTrack.forEach(input => {
        input.addEventListener('input', debouncedAutoSave);
    });
});

// The event listener for practice pills will be added in `renderPracticePills`

// Block modal logic
const blocksContainer = document.getElementById("blocks-container");
const blockModal = document.getElementById("block-modal");
const blockTitleInput = document.getElementById("block-title");
const blockDescInput = document.getElementById("block-description");
const blockLinkInput = document.getElementById("block-link");
const blockImgInput = document.getElementById("block-img");
const blockTypeSelect = document.getElementById("block-type-select");
const blockFieldsDefaultLarge = document.getElementById("block-fields-default-large");
const blockFieldsCarousel = document.getElementById("block-fields-carousel");
const blockLivePreview = document.getElementById("block-live-preview");
const carouselSlidesFields = document.getElementById("carousel-slides-fields");
const addCarouselSlideBtn = document.getElementById("add-carousel-slide");
const blockDetailsContainer = document.getElementById('block-details-container');
const embedOptionsDiv = document.getElementById('embed-options');
const embedYoutubeBtn = document.getElementById('embed-youtube-btn');
const embedSpotifyBtn = document.getElementById('embed-spotify-btn');

let blocks = [];
let editingBlockIndex = null;
let currentBlockType = 'default';
let carouselSlides = [];
const DEFAULT_ICON = 'static/img/default-icon.png';
let currentEmbed = null; // { provider: 'youtube'|'spotify', embedUrl: string }

function parseYoutubeEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(normalizeUrl(url));
    // youtu.be/VIDEOID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '').trim();
      if (id) return `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0`;
    }
    // www.youtube.com or m.youtube.com or youtube.com
    if (u.hostname.includes('youtube.com')) {
      // Handle /watch?v=ID
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}?modestbranding=1&rel=0`;
      // Handle shorts
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        if (id) return `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0`;
      }
      // Handle already embedded
      if (u.pathname.startsWith('/embed/')) {
        return `https://www.youtube.com${u.pathname}${u.search}`;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

function parseSpotifyEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(normalizeUrl(url));
    if (!u.hostname.includes('spotify.com')) return null;
    // Supported: track, album, user (profile) via open.spotify.com/user/{id}
    // Also support playlist and artist if pasted, but we only advertise track, albums, profiles
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const type = parts[0];
      const id = parts[1];
      const supported = ['track', 'album', 'user', 'playlist', 'artist', 'show', 'episode'];
      if (supported.includes(type) && id) {
        return `https://open.spotify.com/embed/${type}/${id}`;
      }
    }
    // Some profile URLs could be open.spotify.com/user/{id}/playlists → still embed profile
    if (parts.length >= 2 && parts[0] === 'user') {
      const id = parts[1];
      return `https://open.spotify.com/embed/user/${id}`;
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function fetchLinkMetadataAndFillForm(url, titleInput, descInput, imgInput, imagePreviewDiv, loadingIndicatorContainer) {
    if (!url || !isValidUrlForFlow(url)) { // Use existing validation
        return;
    }

    loadingIndicatorContainer.innerHTML = `
      <div class="loading-indicator">
        <div class="spinner"></div>
        <span>Fetching preview...</span>
      </div>
    `;
    imagePreviewDiv.innerHTML = ''; // Clear previous image preview

    try {
        const encodedUrl = encodeURIComponent(normalizeUrl(url));
        const response = await fetch(`https://api.microlink.io/?url=${encodedUrl}`);
        
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        const data = await response.json();
        if (data.status !== 'success') throw new Error(`API returned status: ${data.status}`);

        const metadata = data.data;
        if (metadata.title) titleInput.value = metadata.title;
        if (metadata.description) descInput.value = metadata.description;
        
        loadingIndicatorContainer.innerHTML = ''; // Clear "fetching" message

        if (metadata.image && metadata.image.url) {
            const imageUrl = metadata.image.url;
            imagePreviewDiv.innerHTML = `<img src="${imageUrl}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 10px;">`;

             try {
                const imageResponse = await fetch(imageUrl);
                if (imageResponse.ok) {
                    const blob = await imageResponse.blob();
                    const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1).split('?')[0] || 'image.jpg';
                    const file = new File([blob], filename, { type: blob.type });

                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    imgInput.files = dataTransfer.files;

                    // Manually trigger change event for live preview update
                    imgInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (e) {
                console.warn("Could not fetch image for pre-filling file input due to CORS or other network issue. Image preview is still shown.", e);
                imagePreviewDiv.innerHTML += '<p style="font-size: 12px; color: #666;">Could not auto-load image file. Please save and upload manually if desired.</p>';
            }
        }
    } catch (error) {
        console.error("Error fetching link metadata:", error);
        loadingIndicatorContainer.innerHTML = '<p class="loading-indicator" style="color: red;">Could not fetch link data.</p>';
    }
}

function renderBlockLivePreview() {
  if (currentBlockType === 'embed' && currentEmbed) {
    let iframeHtml = '';
    if (currentEmbed.provider === 'youtube') {
      iframeHtml = `<iframe width="100%" height="315" src="${currentEmbed.embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    } else if (currentEmbed.provider === 'spotify') {
      iframeHtml = `<iframe style="border-radius:12px" src="${currentEmbed.embedUrl}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    }
    blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='flex-direction:column;align-items:stretch;max-width:350px;'>${iframeHtml}<div style='padding:8px 0 0 0;'><strong>${blockTitleInput.value}</strong><br><small>${blockDescInput.value}</small></div></div>`;
  } else if (currentBlockType === 'default' || currentBlockType === 'large-image') {
    let imgSrc = '';
    if (blockImgInput.files[0]) {
      if (lastPreviewUrl) URL.revokeObjectURL(lastPreviewUrl);
      imgSrc = URL.createObjectURL(blockImgInput.files[0]);
      lastPreviewUrl = imgSrc;
    } else if (blockImgInput.dataset.icon) {
      imgSrc = blockImgInput.dataset.icon;
    } else if (editingBlockIndex !== null && blocks[editingBlockIndex].icon) {
      imgSrc = blocks[editingBlockIndex].icon;
    } else {
      imgSrc = DEFAULT_ICON;
    }
    if (currentBlockType === 'default') {
      blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='max-width:350px;'><div class='block-content'><img src='${imgSrc}' style='height:40px;width:40px;object-fit:cover;border-radius:4px;'><div class='block-text'><strong>${blockTitleInput.value}</strong><small>${blockDescInput.value}</small></div></div></div>`;
    } else {
      blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div class='block' style='flex-direction:column;align-items:flex-start;max-width:350px;'><img src='${imgSrc}' style='width:100%;height:230px;object-fit:cover;border-radius:8px 8px 0 0;'><div style='padding:8px 0 0 0;'><strong>${blockTitleInput.value}</strong><br><small>${blockDescInput.value}</small></div></div>`;
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
      slidesHTML += `<div class="preview-carousel-slide" draggable="true" data-index="${i}" style='display:inline-block;width:230px;height:320px;margin-right:8px;vertical-align:top;'><div style='background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;overflow:hidden;'><img src='${imgSrc}' style='width:230px;height:230px;object-fit:cover;display:block;'><div style='padding:8px;'><strong>${slide.title || ''}</strong><br><small>${slide.desc || ''}</small></div></div></div>`;
    }
    blockLivePreview.innerHTML = `<p class='preview-text'>Block Preview:</p><div id="preview-carousel-container" style='overflow-x:auto;white-space:nowrap;max-width:100%;'>${slidesHTML}</div>`;

    // Add drag-and-drop for preview slides
    const previewContainer = document.getElementById('preview-carousel-container');
    if (previewContainer) {
      previewContainer.querySelectorAll('.preview-carousel-slide').forEach(slideEl => {
        slideEl.addEventListener('dragstart', (e) => {
          const from = e.currentTarget.getAttribute('data-index');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(from));
          e.currentTarget.classList.add('dragging');
        });
        slideEl.addEventListener('dragend', (e) => {
          e.currentTarget.classList.remove('dragging');
          previewContainer.querySelectorAll('.preview-carousel-slide.drag-over').forEach(x => x.classList.remove('drag-over'));
        });
        slideEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.currentTarget.classList.add('drag-over');
        });
        slideEl.addEventListener('dragleave', (e) => {
          e.currentTarget.classList.remove('drag-over');
        });
        slideEl.addEventListener('drop', (e) => {
          e.preventDefault();
          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
          const toIndex = parseInt(e.currentTarget.getAttribute('data-index'));
          if (!isNaN(fromIndex) && !isNaN(toIndex) && fromIndex !== toIndex) {
            const [moved] = carouselSlides.splice(fromIndex, 1);
            carouselSlides.splice(toIndex, 0, moved);
            renderCarouselSlidesFields();
            renderBlockLivePreview();
          }
        });
      });
    }
  }
}

function setBlockType(type) {
  // If switching from carousel to default/large-image, copy first slide's data
  if ((type === 'default' || type === 'large-image') && currentBlockType === 'carousel' && carouselSlides.length > 0) {
    const first = carouselSlides[0];
    blockTitleInput.value = first.title || '';
    blockDescInput.value = first.desc || '';
    blockLinkInput.value = first.link || '';
    blockImgInput.value = '';
    blockImgInput.dataset.icon = first.icon || DEFAULT_ICON;
  }
  // If switching from default/large-image to carousel, pre-fill first slide with current block data
  if (type === 'carousel' && (currentBlockType === 'default' || currentBlockType === 'large-image')) {
    carouselSlides = [
      {
        title: blockTitleInput.value || '',
        desc: blockDescInput.value || '',
        link: blockLinkInput.value || '',
        imgFile: null,
        icon: blockImgInput.dataset.icon || DEFAULT_ICON,
        isPermanent: true
      },
      { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true }
    ];
  } else if (type === 'carousel') {
    if (!Array.isArray(carouselSlides) || carouselSlides.length < 2) {
      carouselSlides = [
        { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true },
        { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true }
      ];
    }
  }
  currentBlockType = type;
  document.querySelectorAll('.block-type-card').forEach(card => card.classList.remove('selected'));
  const selectedCard = document.querySelector(`.block-type-card[data-type="${type}"]`);
  if (selectedCard) selectedCard.classList.add('selected');
  
  const blockUrlContainer = document.getElementById('block-url-container');
  blockUrlContainer.style.display = (type === 'carousel') ? 'none' : 'block';

  // Show details container for default, large-image, and embed
  blockFieldsDefaultLarge.style.display = (type === 'default' || type === 'large-image' || type === 'embed') ? '' : 'none';
  blockFieldsCarousel.style.display = (type === 'carousel') ? '' : 'none';
  if (embedOptionsDiv) {
    if (type === 'embed') {
      embedOptionsDiv.style.display = 'none';
    } else {
      const y = parseYoutubeEmbed(blockLinkInput.value.trim());
      const s = parseSpotifyEmbed(blockLinkInput.value.trim());
      embedOptionsDiv.style.display = (y || s) ? 'block' : 'none';
      if (embedYoutubeBtn) embedYoutubeBtn.style.display = y ? 'inline-block' : 'none';
      if (embedSpotifyBtn) embedSpotifyBtn.style.display = s ? 'inline-block' : 'none';
    }
  }
  // Hide block-type card selector when in embed mode
  const typeCards = document.getElementById('block-type-select');
  if (typeCards) {
    if (type === 'embed') {
      typeCards.style.display = 'none';
    } else if (type === 'carousel') {
      typeCards.style.display = 'flex';
    } else {
      typeCards.style.display = 'flex';
    }
  }
  if (type === 'carousel') {
    renderCarouselSlidesFields();
  }
  // Show/hide image upload fields based on type
  const imagePreviewEl = document.getElementById('image-preview');
  const imgLabelEl = blockImgInput ? blockImgInput.previousElementSibling : null;
  if (type === 'embed') {
    if (blockDetailsContainer) blockDetailsContainer.style.display = 'block';
    if (imgLabelEl) imgLabelEl.style.display = 'none';
    if (blockImgInput) blockImgInput.style.display = 'none';
    if (imagePreviewEl) imagePreviewEl.style.display = 'none';
  } else if (type === 'default' || type === 'large-image') {
    if (imgLabelEl) imgLabelEl.style.display = '';
    if (blockImgInput) blockImgInput.style.display = '';
    if (imagePreviewEl) imagePreviewEl.style.display = '';
  }
  renderBlockLivePreview();
}

blockTypeSelect.addEventListener('click', (e) => {
  const card = e.target.closest('.block-type-card');
  if (card) setBlockType(card.dataset.type);
});

[blockTitleInput, blockDescInput, blockLinkInput, blockImgInput].forEach(input => {
  input.addEventListener('input', renderBlockLivePreview);
  input.addEventListener('change', renderBlockLivePreview);
});

// Embed buttons logic
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
    setBlockType('embed');
    if (blockDetailsContainer) blockDetailsContainer.style.display = 'block';
    const typeCards = document.getElementById('block-type-select');
    if (typeCards) typeCards.style.display = 'none';
    // Prefill title/description if empty using metadata
    const imagePreviewDiv = document.getElementById('image-preview');
    const loadingIndicatorContainer = document.getElementById('url-loading-indicator');
    if (!blockTitleInput.value && !blockDescInput.value) {
      fetchLinkMetadataAndFillForm(url, blockTitleInput, blockDescInput, blockImgInput, imagePreviewDiv, loadingIndicatorContainer)
        .then(() => renderBlockLivePreview());
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
    setBlockType('embed');
    if (blockDetailsContainer) blockDetailsContainer.style.display = 'block';
    const typeCards = document.getElementById('block-type-select');
    if (typeCards) typeCards.style.display = 'none';
    // Prefill title/description if empty using metadata
    const imagePreviewDiv = document.getElementById('image-preview');
    const loadingIndicatorContainer = document.getElementById('url-loading-indicator');
    if (!blockTitleInput.value && !blockDescInput.value) {
      fetchLinkMetadataAndFillForm(url, blockTitleInput, blockDescInput, blockImgInput, imagePreviewDiv, loadingIndicatorContainer)
        .then(() => renderBlockLivePreview());
    } else {
      renderBlockLivePreview();
    }
  });
}

// Show block details only after a link is entered
blockLinkInput.addEventListener('change', (e) => {
    const url = e.target.value.trim();
    const blockTypeSelect = document.getElementById("block-type-select");
    const blockLivePreview = document.getElementById("block-live-preview");
    const blockDetailsContainer = document.getElementById('block-details-container');
    const shownAfterUrlInput = document.querySelector('.shown-after-url-input');
    const urlInstruction = document.getElementById('url-instruction');

    // Update embed button states
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
    if (embedOptionsDiv) { embedOptionsDiv.style.display = (y || s) ? 'block' : 'none'; }

    if (url && isValidUrlForFlow(url)) {
        // Show the entire section after URL input
        shownAfterUrlInput.classList.add('visible');
        urlInstruction.textContent = 'Great! Now you can customize your block.';
        urlInstruction.style.color = '#4CAF50';
        
        blockTypeSelect.style.display = 'flex';
        blockLivePreview.style.display = 'block';
        if (currentBlockType !== 'carousel') {
             blockDetailsContainer.style.display = 'block';
        }
        
        if (currentBlockType === 'default' || currentBlockType === 'large-image') {
            const imagePreviewDiv = document.getElementById('image-preview');
            const loadingIndicatorContainer = document.getElementById('url-loading-indicator');
            fetchLinkMetadataAndFillForm(url, blockTitleInput, blockDescInput, blockImgInput, imagePreviewDiv, loadingIndicatorContainer)
              .then(() => renderBlockLivePreview());
        }
    } else {
        // Hide the entire section after URL input if URL is invalid or empty
        shownAfterUrlInput.classList.remove('visible');
        if (url) {
            urlInstruction.textContent = 'Please enter a valid URL (starting with http://, https://, or www.)';
            urlInstruction.style.color = '#f44336';
        } else {
            urlInstruction.textContent = 'Enter a valid URL to continue with block creation';
            urlInstruction.style.color = '#666';
        }
        blockTypeSelect.style.display = 'none';
        blockLivePreview.style.display = 'none';
        blockDetailsContainer.style.display = 'none';
    }
});

// Also handle input event for immediate feedback
blockLinkInput.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const shownAfterUrlInput = document.querySelector('.shown-after-url-input');
    const urlInstruction = document.getElementById('url-instruction');

    // Update embed button states live
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
    if (embedOptionsDiv) { embedOptionsDiv.style.display = (y || s) ? 'block' : 'none'; }

  // If currently in embed mode, update current embed URL for live preview
  if (currentBlockType === 'embed' && currentEmbed) {
    const next = currentEmbed.provider === 'youtube' ? parseYoutubeEmbed(url) : parseSpotifyEmbed(url);
    currentEmbed = next ? { provider: currentEmbed.provider, embedUrl: next } : null;
    renderBlockLivePreview();
  }

    if (url && isValidUrlForFlow(url)) {
        // Show the entire section after URL input
        shownAfterUrlInput.classList.add('visible');
        urlInstruction.textContent = 'Great! Now you can customize your block.';
        urlInstruction.style.color = '#4CAF50';
    } else {
        // Hide the entire section after URL input if URL is invalid or empty
        shownAfterUrlInput.classList.remove('visible');
        if (url) {
            urlInstruction.textContent = 'Please enter a valid URL (starting with http://, https://, or www.)';
            urlInstruction.style.color = '#f44336';
        } else {
            urlInstruction.textContent = 'Enter a valid URL to continue with block creation';
            urlInstruction.style.color = '#666';
        }
    }
});

function createCarouselSlideField(slide, idx) {
  const div = document.createElement('div');
  div.className = 'carousel-slide-field';
  div.dataset.index = String(idx);
  const detailsVisible = slide.link ? 'block' : 'none';
  const isPermanentSlide = slide.isPermanent === true;
  const buttonText = isPermanentSlide ? 'Clear' : 'Remove';

  div.innerHTML = `
    <div class="slide-drag-handle" draggable="true" title="Drag to reorder">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 9h8M8 15h8"/>
      </svg>
    </div>
    <p class='preview-text' style='margin-bottom: 5px; font-weight: bold;'>Slide ${idx + 1}:</p>
    <p class="input-feild-title-text">URL:</p>
    <input type='url' placeholder='Paste a link to get started...' value='${slide.link || ''}' class='carousel-slide-link'>
    <div class="carousel-url-loading-indicator"></div>
    <div class='carousel-slide-details' style='display: ${detailsVisible};'>
      <p class="input-feild-title-text" style="margin-top: 10px;">Title:</p>
      <input type='text' placeholder='Slide Title' value='${slide.title || ''}' class='carousel-slide-title'>
      <p class="input-feild-title-text" style="margin-top: 10px;">Description:</p>
      <input type='text' placeholder='Slide Description' value='${slide.desc || ''}' class='carousel-slide-desc'>
      <p class="input-feild-title-text" style="margin-top: 10px;">Upload Block Image:</p>
      <input type='file' accept='image/*' class='carousel-slide-img'>
      <div class="carousel-image-preview" style="margin-top: 10px;"></div>
    </div>
    <div class='slide-reorder-controls' style='display:flex; gap:6px; margin-top:8px;'>
      <button type='button' class='slide-up-btn secondary' aria-label='Move slide up' title='Move up' ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type='button' class='slide-down-btn secondary' aria-label='Move slide down' title='Move down' ${idx === (carouselSlides.length - 1) ? 'disabled' : ''}>↓</button>
    </div>
    <button type='button' class='remove-slide-btn'>${buttonText}</button>
  `;
  
  const linkInput = div.querySelector('.carousel-slide-link');
  const detailsContainer = div.querySelector('.carousel-slide-details');
  
  linkInput.addEventListener('input', e => {
    slide.link = e.target.value;
    if (linkInput.value.trim() !== '') {
      detailsContainer.style.display = 'block';
    } else {
      detailsContainer.style.display = 'none';
    }
  });
  
  linkInput.addEventListener('change', (e) => {
      const url = e.target.value;
      const titleInput = detailsContainer.querySelector('.carousel-slide-title');
      const descInput = detailsContainer.querySelector('.carousel-slide-desc');
      const imgInput = detailsContainer.querySelector('.carousel-slide-img');
      const imagePreviewDiv = div.querySelector('.carousel-image-preview');
      const loadingIndicatorContainer = div.querySelector('.carousel-url-loading-indicator');
      fetchLinkMetadataAndFillForm(url, titleInput, descInput, imgInput, imagePreviewDiv, loadingIndicatorContainer)
          .then(() => {
              // Update the slide object with the new data
              slide.title = titleInput.value;
              slide.desc = descInput.value;
              if(imgInput.files[0]) {
                  slide.imgFile = imgInput.files[0];
              }
              renderBlockLivePreview();
          });
  });

  const titleInput = detailsContainer.querySelector('.carousel-slide-title');
  const descInput = detailsContainer.querySelector('.carousel-slide-desc');
  const imgInput = detailsContainer.querySelector('.carousel-slide-img');

  titleInput.addEventListener('input', e => { slide.title = e.target.value; renderBlockLivePreview(); });
  descInput.addEventListener('input', e => { slide.desc = e.target.value; renderBlockLivePreview(); });
  imgInput.addEventListener('change', e => { slide.imgFile = e.target.files[0]; renderBlockLivePreview(); });
  imgInput.dataset.icon = slide.icon || DEFAULT_ICON;
  
  const actionButton = div.querySelector('.remove-slide-btn');
  actionButton.addEventListener('click', function() {
    if (isPermanentSlide) {
      // Clear functionality for the first two slides
      carouselSlides[idx] = { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true };
      renderCarouselSlidesFields();
      renderBlockLivePreview();
    } else {
      // Remove functionality for subsequent slides
      if (carouselSlides.length > 2) {
        carouselSlides.splice(idx, 1);
        renderCarouselSlidesFields();
        renderBlockLivePreview();
      }
    }
  });

  // Slide drag handle events
  const slideHandle = div.querySelector('.slide-drag-handle');
  if (slideHandle) {
    slideHandle.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      div.classList.add('dragging');
    });
    slideHandle.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      document.querySelectorAll('#carousel-slides-fields .carousel-slide-field.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  }

  // Keyboard-accessible Up/Down reorder buttons
  const upBtn = div.querySelector('.slide-up-btn');
  const downBtn = div.querySelector('.slide-down-btn');
  if (upBtn) {
    upBtn.addEventListener('click', () => moveCarouselSlide(idx, -1));
  }
  if (downBtn) {
    downBtn.addEventListener('click', () => moveCarouselSlide(idx, 1));
  }
  return div;
}

function renderCarouselSlidesFields() {
  carouselSlidesFields.innerHTML = '';
  carouselSlides.forEach((slide, idx) => {
    carouselSlidesFields.appendChild(createCarouselSlideField(slide, idx));
  });
  ensureCarouselFieldsDnD();
}

addCarouselSlideBtn.addEventListener('click', () => {
  if (carouselSlides.length < 10) {
    carouselSlides.push({ title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: false });
    renderCarouselSlidesFields();
    renderBlockLivePreview();
  }
});

// Enable drag-and-drop reordering inside the modal slide fields
function ensureCarouselFieldsDnD() {
  const container = carouselSlidesFields;
  if (!container) return;

  container.querySelectorAll('.carousel-slide-field').forEach(field => {
    field.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.classList.add('drag-over');
    });
    field.addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('drag-over');
    });
    field.addEventListener('drop', (e) => {
      e.preventDefault();
      const toField = e.currentTarget;
      toField.classList.remove('drag-over');
      const toIndex = parseInt(toField.dataset.index);
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      if (!isNaN(fromIndex) && !isNaN(toIndex) && fromIndex !== toIndex) {
        const [moved] = carouselSlides.splice(fromIndex, 1);
        carouselSlides.splice(toIndex, 0, moved);
        renderCarouselSlidesFields();
        renderBlockLivePreview();
      }
    });
  });
}

// Helper to move a slide up or down by delta (-1 or +1)
function moveCarouselSlide(fromIndex, delta) {
  const toIndex = fromIndex + delta;
  if (toIndex < 0 || toIndex >= carouselSlides.length) return;
  const [moved] = carouselSlides.splice(fromIndex, 1);
  carouselSlides.splice(toIndex, 0, moved);
  renderCarouselSlidesFields();
  renderBlockLivePreview();
}

let lastPreviewUrl = null;
function resetBlockModal() {
  setBlockType('default');
  blockTitleInput.value = '';
  blockDescInput.value = '';
  blockLinkInput.value = '';
  blockImgInput.value = '';
  blockImgInput.dataset.icon = '';
  currentEmbed = null;
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('url-loading-indicator').innerHTML = '';

  if (lastPreviewUrl) {
    URL.revokeObjectURL(lastPreviewUrl);
    lastPreviewUrl = null;
  }
  carouselSlides.forEach(slide => {
    if (slide.lastPreviewUrl) {
      URL.revokeObjectURL(slide.lastPreviewUrl);
      delete slide.lastPreviewUrl;
    }
  });

  carouselSlides = [
    { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true },
    { title: '', desc: '', link: '', imgFile: null, icon: '', isPermanent: true }
  ];
  renderCarouselSlidesFields();
  
  const blockTypeSelect = document.getElementById("block-type-select");
  const blockLivePreview = document.getElementById("block-live-preview");
  const blockDetailsContainer = document.getElementById('block-details-container');
  const shownAfterUrlInput = document.querySelector('.shown-after-url-input');
  const urlInstruction = document.getElementById('url-instruction');
  
  shownAfterUrlInput.classList.remove('visible');
  urlInstruction.textContent = 'Enter a valid URL to continue with block creation';
  urlInstruction.style.color = '#666';
  blockTypeSelect.style.display = 'none';
  blockLivePreview.style.display = 'none';
  blockDetailsContainer.style.display = 'none';
  if (embedOptionsDiv) {
    embedOptionsDiv.style.display = 'block';
    if (embedYoutubeBtn) embedYoutubeBtn.disabled = true;
    if (embedSpotifyBtn) embedSpotifyBtn.disabled = true;
  }
}

function openBlockModal(isEditing = false) {
  blockModal.style.display = "flex";
  document.getElementById("modal-title").textContent = isEditing ? "Edit Block" : "Add Block";
  document.getElementById("save-block").textContent = isEditing ? "Save Changes" : "Save Block";

  const blockTypeSelect = document.getElementById("block-type-select");
  const blockLivePreview = document.getElementById("block-live-preview");
  const blockDetailsContainer = document.getElementById('block-details-container');
  const shownAfterUrlInput = document.querySelector('.shown-after-url-input');
  const urlInstruction = document.getElementById('url-instruction');

  if (!isEditing) {
    resetBlockModal();
  } else {
    // Show sections when editing an existing block
    shownAfterUrlInput.classList.add('visible');
    urlInstruction.textContent = 'Great! Now you can customize your block.';
    urlInstruction.style.color = '#4CAF50';
    blockTypeSelect.style.display = 'flex';
    blockLivePreview.style.display = 'block';
    if (currentBlockType !== 'carousel') {
        blockDetailsContainer.style.display = 'block';
    } else {
        blockDetailsContainer.style.display = 'none';
    }
    if (embedOptionsDiv) embedOptionsDiv.style.display = 'block';
  }

  // Focus the first input for accessibility
  setTimeout(() => document.getElementById('block-link').focus(), 100);
  // Always render the preview immediately
  renderBlockLivePreview();
  
  // Trigger validation to ensure proper initial state only when ADDING a block
  if (!isEditing) {
    setTimeout(() => {
      const url = blockLinkInput.value.trim();
      if (!url || !isValidUrlForFlow(url)) {
        shownAfterUrlInput.classList.remove('visible');
        if (url) {
          urlInstruction.textContent = 'Please enter a valid URL (starting with http://, https://, or www.)';
          urlInstruction.style.color = '#f44336';
        } else {
          urlInstruction.textContent = 'Enter a valid URL to continue with block creation';
          urlInstruction.style.color = '#666';
        }
      }
    }, 50);
  }
}

function closeBlockModal() {
  blockModal.style.display = "none";
  editingBlockIndex = null;
  resetBlockModal();
}

document.getElementById("add-block").addEventListener("click", () => openBlockModal(false));
document.getElementById("cancel-block").addEventListener("click", closeBlockModal);

function isValidUrl(url) {
  if (!url) return true; // Allow empty (optional) URLs
  return /^https?:\/\//.test(url) || /^www\./.test(url);
}

// New validation function for the progressive disclosure flow
function isValidUrlForFlow(url) {
  if (!url || url.trim() === '') return false; // Require non-empty URL for the flow
  return /^https?:\/\//.test(url) || /^www\./.test(url);
}

function normalizeUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  if (/^www\./.test(url)) return 'https://' + url;
  return url;
}

document.getElementById("save-block").addEventListener("click", async () => {
  if (!window.firebaseUtils.currentUser) return;
  // Validate URLs before saving
  if (currentBlockType === 'default' || currentBlockType === 'large-image' || currentBlockType === 'embed') {
    if (!isValidUrl(blockLinkInput.value)) {
      alert('Please enter a valid URL (starting with http://, https://, or www.) for the link.');
      blockLinkInput.focus();
      return;
    }
    if (currentBlockType === 'embed' && !currentEmbed) {
      alert('Please choose a valid YouTube or Spotify embed using the buttons.');
      return;
    }
  } else if (currentBlockType === 'carousel') {
    for (let i = 0; i < carouselSlides.length; i++) {
      if (!isValidUrl(carouselSlides[i].link)) {
        alert(`Please enter a valid URL (starting with http://, https://, or www.) for slide ${i + 1}.`);
        const fields = document.querySelectorAll('.carousel-slide-link');
        if (fields[i]) fields[i].focus();
        return;
      }
    }
  }
  const saveBtn = document.getElementById("save-block");
  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';
  try {
    const email = window.firebaseUtils.currentUser.email;
    let createdAt = (editingBlockIndex !== null && blocks[editingBlockIndex].createdAt) ? blocks[editingBlockIndex].createdAt : new Date().toISOString();
    let existingGlobalId = (editingBlockIndex !== null && blocks[editingBlockIndex].globalId) ? blocks[editingBlockIndex].globalId : null;
    let block = {};
    let imagesToDelete = [];
    if (currentBlockType === 'embed' && currentEmbed) {
      block = {
        type: 'embed',
        provider: currentEmbed.provider,
        embedUrl: currentEmbed.embedUrl,
        title: blockTitleInput.value,
        desc: blockDescInput.value,
        link: normalizeUrl(blockLinkInput.value),
        icon: DEFAULT_ICON,
        createdAt: createdAt,
        globalId: existingGlobalId
      };
    } else if (currentBlockType === 'default' || currentBlockType === 'large-image') {
      if (editingBlockIndex !== null && blocks[editingBlockIndex].type === 'carousel') {
        const prevSlides = blocks[editingBlockIndex].slides || [];
        for (let i = 1; i < prevSlides.length; i++) {
          const icon = prevSlides[i].icon;
          if (icon && !icon.includes(DEFAULT_ICON)) {
            imagesToDelete.push(icon);
          }
        }
      }
      let imgUrl = null;
      const file = blockImgInput.files[0];
      if (file) {
        const compressedBlob = await compressImage(file, 0.7, 800, 800);
        const compressedFile = new File([compressedBlob], file.name, { type: 'image/jpeg' });
        imgUrl = await window.firebaseUtils.uploadImage(compressedFile, `blocks/${email}/${Date.now()}`);
      }
      let icon = imgUrl;
      if (!icon) {
        icon = blockImgInput.dataset.icon || (editingBlockIndex !== null && blocks[editingBlockIndex].icon) || DEFAULT_ICON;
      }
      block = {
        type: currentBlockType,
        title: blockTitleInput.value,
        desc: blockDescInput.value,
        link: normalizeUrl(blockLinkInput.value),
        icon: icon,
        createdAt: createdAt,
        globalId: existingGlobalId
      };
    } else if (currentBlockType === 'carousel') {
      const slides = [];
      for (let i = 0; i < carouselSlides.length; i++) {
        let imgUrl = null;
        if (carouselSlides[i].imgFile) {
          const compressedBlob = await compressImage(carouselSlides[i].imgFile, 0.7, 800, 800);
          const compressedFile = new File([compressedBlob], carouselSlides[i].imgFile.name, { type: 'image/jpeg' });
          imgUrl = await window.firebaseUtils.uploadImage(compressedFile, `blocks/${email}/carousel/${Date.now()}_${i}`);
        }
        slides.push({
          title: carouselSlides[i].title,
          desc: carouselSlides[i].desc,
          link: normalizeUrl(carouselSlides[i].link),
          icon: imgUrl || carouselSlides[i].icon || DEFAULT_ICON
        });
      }
      block = {
        type: 'carousel',
        slides,
        createdAt: createdAt,
        globalId: existingGlobalId
      };
    }
    if (editingBlockIndex !== null) {
      blocks[editingBlockIndex] = block;
      editingBlockIndex = null;
    } else {
      blocks.push(block);
    }
    renderBlocks(blocks);
    await window.firebaseUtils.saveUserData(email, { blocks });
    for (const url of imagesToDelete) {
      await window.firebaseUtils.deleteImage(url);
    }

    // Upsert globalBlocks entry
    const globalId = await window.firebaseUtils.upsertGlobalBlock(email, block);
    block.globalId = globalId;
    await window.firebaseUtils.saveUserData(email, { blocks }); // save again to persist globalId if new
    closeBlockModal();
  } catch (e) {
    alert('Error saving block. Please try again.');
    console.error(e);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

function renderBlocks(arr) {
  blocks = arr;
  blocksContainer.innerHTML = "";
  arr.forEach((block, index) => {
    let blockHTML = '';
    let actionsHTML = `
      <div class="block-actions" style="margin-top:8px; display: flex; justify-content: flex-end; width: 100%;">
        
        <button class="edit-btn" onclick="editBlock(${index})">Edit</button>
        <button class="delete-btn" onclick="deleteBlock(${index})" style="padding: 6px 8px; line-height: 1;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;
    if (block.type === 'embed') {
      let iframeHtml = '';
      if (block.provider === 'youtube') {
        iframeHtml = `<iframe width=\"100%\" height=\"180\" src=\"${block.embedUrl}\" title=\"YouTube video player\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" allowfullscreen></iframe>`;
      } else if (block.provider === 'spotify') {
        iframeHtml = `<iframe style=\"border-radius:12px\" src=\"${block.embedUrl}\" width=\"100%\" height=\"152\" frameborder=\"0\" allow=\"autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture\" loading=\"lazy\"></iframe>`;
      }
      blockHTML = `<div style='flex-direction:column;align-items:stretch;display:flex;width:100%;'>
        <div style="display:flex;align-items:center;width:100%;">
          <div class="drag-handle" style="cursor:move;padding:8px;color:#666;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#f0f0f0;margin-right:8px;position:relative;" draggable="true" data-index="${index}" title="Drag to reorder">
            <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
              <path d=\"M8 9h8M8 15h8\"/>
            </svg>
          </div>
          <div style=\"width:100%;\">${iframeHtml}</div>
        </div>
        <div style='padding:8px 0 0 0; margin-left:36px;'><strong>${block.title || ''}</strong><br><small>${block.desc || ''}</small></div>
        ${actionsHTML}
      </div>`;
    } else if (!block.type || block.type === 'default') {
      blockHTML = `
        <div class="block-content" style="flex-direction:column;align-items:flex-start;display:flex;width:100%;">
          <div style="display:flex;align-items:center;width:100%;">
            <div class="drag-handle" style="cursor:move;padding:8px;color:#666;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#f0f0f0;margin-right:8px;position:relative;" draggable="true" data-index="${index}" title="Drag to reorder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 9h8M8 15h8"/>
              </svg>
            </div>
            <img src="${block.icon || DEFAULT_ICON}" alt="icon">
            <div class="block-text" style="margin-left:12px;"><strong>${block.title}</strong><small>${block.desc}</small></div>
          </div>
          ${actionsHTML}
        </div>`;
    } else if (block.type === 'large-image') {
      blockHTML = `<div style='flex-direction:column;align-items:flex-start;display:flex;width:100%;'>
        <div style="display:flex;align-items:center;width:90%;">
          <div class="drag-handle" style="cursor:move;padding:8px;color:#666;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#f0f0f0;margin-right:8px;position:relative;" draggable="true" data-index="${index}" title="Drag to reorder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 9h8M8 15h8"/>
            </svg>
          </div>
          <img src="${block.icon || DEFAULT_ICON}" style="width:100%;height:230px;object-fit:cover;border-radius:8px 8px 0 0;">
        </div>
        <div style='padding:8px 0 0 0; margin-left:36px;'><strong>${block.title}</strong><br><small>${block.desc}</small></div>${actionsHTML}</div>`;
    } else if (block.type === 'carousel') {
      let slidesHTML = '';
      for (let i = 0; i < block.slides.length; i++) {
        const slide = block.slides[i];
        slidesHTML += `<div style='display:inline-block;width:230px;height:320px;margin-right:8px;vertical-align:top;'><div style='background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;overflow:hidden;'><img src='${slide.icon || DEFAULT_ICON}' style='width:230px;height:230px;object-fit:cover;display:block;'><div style='padding:8px;'><strong>${slide.title || ''}</strong><br><small>${slide.desc || ''}</small></div></div></div>`;
      }
      blockHTML = `<div style='flex-direction:column;align-items:stretch;display:flex;width:100%;'>
        <div style="display:flex;align-items:center;width:100%;">
          <div class="drag-handle" style="cursor:move;padding:8px;color:#666;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#f0f0f0;margin-right:8px;position:relative;" draggable="true" data-index="${index}" title="Drag to reorder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 9h8M8 15h8"/>
            </svg>
          </div>
          <div style='overflow-x:auto;white-space:nowrap;max-width:100%;margin-bottom:4px;'>${slidesHTML}</div>
        </div>
        ${actionsHTML}
      </div>`;
    }
    const div = document.createElement("div");
    div.className = "block";
    div.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
    div.innerHTML = blockHTML;
    blocksContainer.appendChild(div);
  });

  // Add drag and drop event listeners
  const dragHandles = document.querySelectorAll('.drag-handle');
  dragHandles.forEach(handle => {
    handle.addEventListener('dragstart', handleDragStart);
    handle.addEventListener('dragend', handleDragEnd);
  });

  blocksContainer.addEventListener('dragover', handleDragOver);
  blocksContainer.addEventListener('drop', handleDrop);
}

// Drag and drop handlers
function handleDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.index);
  e.target.style.opacity = '0.4';
  
  // Add dragging class to the block
  const block = e.target.closest('.block');
  block.style.transform = 'scale(1.02)';
  block.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  block.style.zIndex = '1000';
  block.style.opacity = '0.8';
  
  // Create ghost image
  const ghost = block.cloneNode(true);
  ghost.style.position = 'absolute';
  ghost.style.top = '-1000px';
  ghost.style.opacity = '0.8';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 20, 20);
  setTimeout(() => document.body.removeChild(ghost), 0);
}

function handleDragEnd(e) {
  e.target.style.opacity = '1';
  
  // Remove dragging class from the block
  const block = e.target.closest('.block');
  block.style.transform = '';
  block.style.boxShadow = '';
  block.style.zIndex = '';
  block.style.opacity = '';
  
  // Remove any drop indicators and reset block positions
  document.querySelectorAll('.drop-indicator, .drop-wireframe').forEach(el => el.remove());
  document.querySelectorAll('.block').forEach(b => {
    b.style.transform = '';
    b.style.transition = '';
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  const block = e.target.closest('.block');
  if (!block) return;
  
  const blocks = document.querySelectorAll('.block');
  const dragHandle = document.querySelector('.drag-handle[draggable="true"]');
  if (!dragHandle) return;
  
  const dragIndex = parseInt(dragHandle.dataset.index);
  const dropIndex = parseInt(block.querySelector('.drag-handle').dataset.index);
  
  if (dragIndex === dropIndex) return;
  
  // Remove existing drop indicators
  document.querySelectorAll('.drop-indicator, .drop-wireframe').forEach(el => el.remove());
  
  // Create drop indicator
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.style.position = 'absolute';
  indicator.style.left = '0';
  indicator.style.right = '0';
  indicator.style.height = '2px';
  indicator.style.background = '#0000ff';
  indicator.style.pointerEvents = 'none';
  indicator.style.zIndex = '1000';
  
  // Create wireframe box
  const wireframe = document.createElement('div');
  wireframe.className = 'drop-wireframe';
  wireframe.style.position = 'absolute';
  wireframe.style.left = '0';
  wireframe.style.right = '0';
  wireframe.style.border = '2px dashed #0000ff';
  wireframe.style.borderRadius = '8px';
  wireframe.style.pointerEvents = 'none';
  wireframe.style.zIndex = '999';
  wireframe.style.transition = 'all 0.2s ease';
  
  // Calculate positions and move blocks
  const blockHeight = block.offsetHeight;
  const blockTop = block.getBoundingClientRect().top;
  const blocksContainer = document.getElementById('blocks-container');
  const containerTop = blocksContainer.getBoundingClientRect().top;
  
  if (dragIndex < dropIndex) {
    indicator.style.bottom = '0';
    wireframe.style.top = '100%';
    wireframe.style.height = blockHeight + 'px';
    
    // Move blocks below the drop position
    blocks.forEach((b, idx) => {
      if (idx > dropIndex) {
        b.style.transition = 'transform 0.2s ease';
        b.style.transform = `translateY(${blockHeight + 8}px)`;
      }
    });
  } else {
    indicator.style.top = '0';
    wireframe.style.bottom = '100%';
    wireframe.style.height = blockHeight + 'px';
    
    // Move blocks above the drop position
    blocks.forEach((b, idx) => {
      if (idx < dropIndex) {
        b.style.transition = 'transform 0.2s ease';
        b.style.transform = `translateY(-${blockHeight + 8}px)`;
      }
    });
  }
  
  block.style.position = 'relative';
  block.appendChild(indicator);
  block.appendChild(wireframe);
}

async function handleDrop(e) {
  e.preventDefault();
  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
  const toIndex = parseInt(e.target.closest('.block')?.querySelector('.drag-handle')?.dataset.index);
  
  if (fromIndex !== toIndex) {
    try {
      // Remove drop indicators and reset block positions
      document.querySelectorAll('.drop-indicator, .drop-wireframe').forEach(el => el.remove());
      document.querySelectorAll('.block').forEach(b => {
        b.style.transform = '';
        b.style.transition = '';
      });
      
      // Reorder blocks array
      const [movedBlock] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, movedBlock);
      
      // Re-render blocks with animation
      renderBlocks(blocks);
      
      // Save new order to Firestore
      if (window.firebaseUtils.currentUser) {
        try {
          await window.firebaseUtils.saveUserData(window.firebaseUtils.currentUser.email, { blocks });
        } catch (error) {
          console.error('Error saving block order:', error);
          // Revert the blocks array to its original state
          blocks.splice(toIndex, 1);
          blocks.splice(fromIndex, 0, movedBlock);
          renderBlocks(blocks);
          alert('Failed to save the new order. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error in handleDrop:', error);
      alert('An error occurred while reordering blocks. Please try again.');
    }
  }
}

window.renderBlocks = renderBlocks;

window.editBlock = function(index) {
  editingBlockIndex = index;
  const block = blocks[index];
  if (block.type === 'embed') {
    setBlockType('embed');
    currentEmbed = { provider: block.provider, embedUrl: block.embedUrl };
    blockTitleInput.value = block.title || '';
    blockDescInput.value = block.desc || '';
    blockLinkInput.value = block.link || '';
    blockImgInput.value = '';
    if (embedOptionsDiv) embedOptionsDiv.style.display = 'block';
    blockDetailsContainer.style.display = 'block';
  } else if (!block.type || block.type === 'default' || block.type === 'large-image') {
    setBlockType(block.type || 'default');
    blockTitleInput.value = block.title || '';
    blockDescInput.value = block.desc || '';
    blockLinkInput.value = block.link || '';
    blockImgInput.value = '';
    blockImgInput.dataset.icon = block.icon || DEFAULT_ICON;
    
    // Show/hide details container based on whether a link exists
    const blockDetailsContainer = document.getElementById('block-details-container');
    if (block.link) {
      blockDetailsContainer.style.display = 'block';
    } else {
      blockDetailsContainer.style.display = 'none';
    }
  } else if (block.type === 'carousel') {
    setBlockType('carousel');
    carouselSlides = block.slides.map((slide, i) => ({
      title: slide.title || '',
      desc: slide.desc || '',
      link: slide.link || '',
      imgFile: null,
      icon: slide.icon || DEFAULT_ICON,
      isPermanent: i < 2
    }));
    renderCarouselSlidesFields();
  }
  renderBlockLivePreview();
  openBlockModal(true);
};

window.deleteBlock = async function(index) {
  if (!window.firebaseUtils.currentUser) return;

  if (confirm('Are you sure you want to delete this block?')) {
    const blockToDelete = blocks[index];

    // Delete images for default/large-image blocks
    if ((!blockToDelete.type || blockToDelete.type === 'default' || blockToDelete.type === 'large-image') &&
        blockToDelete.icon && !blockToDelete.icon.includes(DEFAULT_ICON)) {
      await window.firebaseUtils.deleteImage(blockToDelete.icon);
    }

    // Delete images for carousel blocks
    if (blockToDelete.type === 'carousel' && Array.isArray(blockToDelete.slides)) {
      for (const slide of blockToDelete.slides) {
        if (slide.icon && !slide.icon.includes(DEFAULT_ICON)) {
          await window.firebaseUtils.deleteImage(slide.icon);
        }
      }
    }

    blocks.splice(index, 1);
    renderBlocks(blocks);
    await window.firebaseUtils.saveUserData(window.firebaseUtils.currentUser.email, { blocks });
  }
};

// --- CONNECTIONS LOGIC ---
const connectionsList = document.getElementById('connections-list');
const manageConnectionsBtn = document.getElementById('manage-connections-btn');
const connectionsModal = document.getElementById('connections-modal');
const closeConnectionsModalBtn = document.getElementById('close-connections-modal');
const connectionsSearch = document.getElementById('connections-search');
const connectionsModalList = document.getElementById('connections-modal-list');

let allUsers = [];
let currentUserEmail = null;
let currentUserConnections = [];

// Helper: fetch all users from Firestore
async function fetchAllUsers() {
  const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
  const snapshot = await getDocs(collection(window.firebaseUtils.db, 'users'));
  allUsers = snapshot.docs.map(doc => ({
    email: doc.id,
    ...doc.data()
  }));
}

// Helper: get mutual connections
function getMutualConnections() {
  if (!window.firebaseUtils.currentUser) return [];
  const myEmail = window.firebaseUtils.currentUser.email;
  return allUsers.filter(user => {
    if (user.email === myEmail) return false;
    const theirConnections = user.connections || [];
    return currentUserConnections.includes(user.email) && theirConnections.includes(myEmail);
  });
}

// On page load, fetch all users and render connections
async function refreshConnectionsOnLoad() {
  console.log('Refreshing connections, current user:', window.firebaseUtils.currentUser);
  if (!window.firebaseUtils.currentUser) {
    renderConnectionsList();
    return;
  }
  
  try {
    await fetchAllUsers();
    const user = window.firebaseUtils.currentUser;
    const docRef = await window.firebaseUtils.getUserDocRef(user.email);
    const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('User connections data:', data);
      currentUserConnections = Array.isArray(data.connections) ? data.connections : [];
      console.log('Current user connections:', currentUserConnections);
    } else {
      currentUserConnections = [];
    }
    
    renderConnectionsList();
  } catch (error) {
    console.error('Error loading connections:', error);
    currentUserConnections = [];
    renderConnectionsList();
  }
}

// Render mutual connections in the main section
function renderConnectionsList() {
  console.log('Rendering connections list, current user:', window.firebaseUtils.currentUser);
  if (!window.firebaseUtils.currentUser) {
    connectionsList.innerHTML = '<div style="color:#888;">Log in to see connections.</div>';
    return;
  }
  
  const mutuals = getMutualConnections();
  console.log('Mutual connections:', mutuals);
  
  if (mutuals.length === 0) {
    connectionsList.innerHTML = '<div style="color:#888;">No connections yet. Start connecting with others!</div>';
    return;
  }
  
  connectionsList.innerHTML = mutuals.map(user => `
    <div style="display:flex;align-items:center;margin-bottom:8px;">
      <img src="${user.avatar || 'static/img/default-icon.png'}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;margin-right:10px;">
      <span style="font-weight:bold;">${user.title || user.email}</span>
    </div>
  `).join('');
}

// Modal open/close logic
manageConnectionsBtn.onclick = async () => {
  if (!window.firebaseUtils.currentUser) return;
  connectionsModal.style.display = 'flex';
  connectionsSearch.value = '';
  await refreshConnectionsModalList();
  connectionsSearch.focus();
};
closeConnectionsModalBtn.onclick = () => {
  connectionsModal.style.display = 'none';
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') connectionsModal.style.display = 'none';
});

// Fetch all users and update modal list
async function refreshConnectionsModalList() {
  await fetchAllUsers();
  const user = window.firebaseUtils.currentUser;
  currentUserEmail = user?.email;
  if (user) {
    const docRef = await window.firebaseUtils.getUserDocRef(user.email);
    const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    const docSnap = await getDoc(docRef);
    currentUserConnections = docSnap.exists() ? (docSnap.data().connections || []) : [];
  } else {
    currentUserConnections = [];
  }
  renderConnectionsModalList();
}

// Render all users in modal (with search, connect/disconnect)
function renderConnectionsModalList() {
  const search = connectionsSearch.value.trim().toLowerCase();
  const myEmail = currentUserEmail;
  const myConnections = currentUserConnections;
  connectionsModalList.innerHTML = allUsers
    .filter(user => user.email !== myEmail && (user.title || '').toLowerCase().includes(search))
    .map(user => {
      const isConnected = myConnections.includes(user.email);
      const theirConnections = Array.isArray(user.connections) ? user.connections : [];
      const theyAddedMe = theirConnections.includes(myEmail);

      let label = 'Connect';
      let bg = '#0000ff'; // blue
      if (isConnected && theyAddedMe) {
        label = 'Disconnect';
        bg = '#cc0000'; // red
      } else if (isConnected && !theyAddedMe) {
        label = 'Connection pending';
        bg = '#999999'; // gray
      }

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;">
            <img src="${user.avatar || 'static/img/default-icon.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:10px;">
            <span style="font-weight:bold;">${user.title || user.email}</span>
          </div>
          <button style=\"background:${bg};color:#fff;padding:4px 12px;border-radius:4px;border:none;cursor:pointer;min-width:140px;\" onclick=\"window.toggleConnection('${user.email}', ${isConnected})\">${label}</button>
        </div>
      `;
    }).join('');
}

connectionsSearch.oninput = renderConnectionsModalList;

// Firestore helpers for connections
window.toggleConnection = async function(email, isConnected) {
  if (!window.firebaseUtils.currentUser) return;
  const myEmail = window.firebaseUtils.currentUser.email;
  // Get my doc
  const myDocRef = await window.firebaseUtils.getUserDocRef(myEmail);
  let newConnections;
  if (isConnected) {
    // Remove
    newConnections = currentUserConnections.filter(e => e !== email);
  } else {
    // Add
    newConnections = [...new Set([...currentUserConnections, email])];
  }
  await window.firebaseUtils.updateConnections(myDocRef, newConnections);
  // Update local state and UI
  currentUserConnections = newConnections;
  renderConnectionsModalList();
  renderConnectionsList();
};

// Make functions available globally
window.refreshConnectionsOnLoad = refreshConnectionsOnLoad;
window.renderConnectionsList = renderConnectionsList;

// If you have login/logout logic, call refreshConnectionsOnLoad() after login/logout as well.

if (window.firebaseUtils) {
  window.firebaseUtils.currentUserDoc = {};
  window.firebaseUtils.getAllUsers = async function() {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    return getDocs(collection(window.firebaseUtils.db, 'users'));
  };
  window.firebaseUtils.getUserDocRef = async function(email) {
    const { doc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    return doc(window.firebaseUtils.db, 'users', email);
  };
  window.firebaseUtils.updateConnections = async function(docRef, connections) {
    const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    await updateDoc(docRef, { connections });
  };
}

// --- PRACTICES LOGIC ---
const PRACTICES = [
  "3D", "Architecture", "Community Engagement", "Computing", "Graphic Design",
  "Fashion", "Film", "Fine Art", "Image", "Jewelry", "Music", "Performance Arts",
  "Printing", "Product Design", "Publication", "Set Design", "Sound", "Writing", "Photography"
].sort();

const practicesButtonsDiv = document.getElementById("practices-buttons");
let selectedPractices = [];

function renderPracticePills(selected = []) {
  // console.log('Rendering practice pills with selected:', selected);
  practicesButtonsDiv.innerHTML = "";
  // Update the global selectedPractices array
  selectedPractices = [...selected];
  
  PRACTICES.forEach(practice => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = selected.includes(practice);
    // console.log(`Practice ${practice} is selected:`, isSelected);
    btn.className = "practice-pill" + (isSelected ? " selected" : "");
    btn.textContent = practice;
    btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    btn.onclick = () => {
      if (selectedPractices.includes(practice)) {
        selectedPractices = selectedPractices.filter(p => p !== practice);
      } else {
        selectedPractices = [...selectedPractices, practice];
      }
      // Update button state
      btn.className = "practice-pill" + (selectedPractices.includes(practice) ? " selected" : "");
      btn.setAttribute("aria-pressed", selectedPractices.includes(practice) ? "true" : "false");

      // Trigger the auto-save
      debouncedAutoSave();
    };
    practicesButtonsDiv.appendChild(btn);
  });
}

// Make renderPracticePills available globally
window.renderPracticePills = renderPracticePills;

// Load practices from Firestore and render
async function loadPracticesFromFirestore(email) {
  try {
    // console.log('Loading practices for:', email);
    const docRef = await window.firebaseUtils.getUserDocRef(email);
    const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('User data:', data);
      selectedPractices = Array.isArray(data.practices) ? data.practices : [];
      // console.log('Selected practices:', selectedPractices);
      renderPracticePills(selectedPractices);
    } else {
      console.log('No user data found');
      selectedPractices = [];
      renderPracticePills([]);
    }
  } catch (error) {
    console.error('Error loading practices:', error);
    selectedPractices = [];
    renderPracticePills([]);
  }
}

// Patch into your loadUserData logic:
const origLoadUserData = window.loadUserData;
window.loadUserData = async function(email) {
  await loadPracticesFromFirestore(email);
  if (origLoadUserData) await origLoadUserData(email);
};

// Initial render for new users
renderPracticePills([]);

// --- PROFILE PROGRESS BAR LOGIC ---
window.updateProfileProgress = function(hasProfileDetails, hasConnections, hasBlocks) {
  const progressBarFill = document.getElementById('progressBarFill');
  const circle1 = document.getElementById('progressCircle1');
  const circle2 = document.getElementById('progressCircle2');
  const circle3 = document.getElementById('progressCircle3');
  const circle4 = document.getElementById('progressCircle4');

  const textDetails = document.getElementById('progressTextDetails');
  const textConnect = document.getElementById('progressTextConnect');
  const textBuild = document.getElementById('progressTextBuild');
  const textComplete = document.getElementById('progressTextComplete');

  // Reset all
  [circle1, circle2, circle3, circle4].forEach(c => c.classList.remove('filled'));
  [textDetails, textConnect, textBuild, textComplete].forEach(t => t.style.display = 'none');

  if (hasProfileDetails && hasConnections && hasBlocks) {
    // All complete
    progressBarFill.style.width = '100%';
    [circle1, circle2, circle3, circle4].forEach(c => c.classList.add('filled'));
    textComplete.style.display = 'block';
  } else if (hasProfileDetails && hasConnections) {
    // Profile details and connections done
    progressBarFill.style.width = '71%';
    [circle1, circle2, circle3].forEach(c => c.classList.add('filled'));
    textBuild.style.display = 'block';
  } else if (hasProfileDetails) {
    // Only profile details done
    progressBarFill.style.width = '38%';
    [circle1, circle2].forEach(c => c.classList.add('filled'));
    textConnect.style.display = 'block';
  } else {
    // Nothing or only just started (e.g. new user)
    progressBarFill.style.width = '5%';
    circle1.classList.add('filled');
    textDetails.style.display = 'block';
  }
};

// Initialize progress bar for a logged-out state or before data loads
if (document.getElementById('progressBarFill')) { // Ensure elements exist
    window.updateProfileProgress(false, false, false);
}
// --- END PROFILE PROGRESS BAR LOGIC ---

// --- CLOSE PROFILE PROGRESS SECTION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const closeProgressBtn = document.getElementById('closeProgressSectionBtn');
  const profileProgressSection = document.getElementById('profileProgressSection');

  if (closeProgressBtn && profileProgressSection) {
    closeProgressBtn.addEventListener('click', () => {
      if (profileProgressSection) {
        profileProgressSection.style.display = 'none';
      }
    });
  }

  const welcomeStartBtn = document.getElementById('welcome-start-btn');
  const welcomeSlider = document.querySelector('.welcome-slider');
  const createAccountBtn = document.getElementById('create-account-btn');
  const backToSlide1Btn = document.getElementById('back-to-slide-1');
  
  if (welcomeStartBtn && welcomeSlider) {
    welcomeStartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      welcomeSlider.classList.add('show-slide-2');
    });
  }

  if (backToSlide1Btn && welcomeSlider) {
    backToSlide1Btn.addEventListener('click', (e) => {
      e.preventDefault();
      welcomeSlider.classList.remove('show-slide-2');
    });
  }

  if (createAccountBtn && loginBtn) {
    createAccountBtn.addEventListener('click', () => {
      loginBtn.click();
    });
  }

  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
});
// --- END CLOSE PROFILE PROGRESS SECTION LOGIC ---

// --- COLLAPSIBLE SECTIONS LOGIC ---

function initializeCollapsibleSections(userData = {}) {
  const profileSection = document.getElementById('profile-collapsible-section');
  const connectionsSection = document.getElementById('connections-collapsible-section');
  
  if (!profileSection || !connectionsSection) return;

  // --- Logic for Profile Section ---
  const hasTitle = !!userData.title;
  const hasBio = !!userData.bio;
  const hasSocial = !!userData.instagram || !!userData.youtube || !!userData.tiktok;
  const hasPractices = userData.practices && userData.practices.length > 0;

  if (profileSection.dataset.manualToggle !== 'true') {
    if (hasTitle && hasBio && hasSocial && hasPractices) {
      profileSection.classList.add('collapsed');
    } else {
      profileSection.classList.remove('collapsed');
    }
  }
  
  // Update header content dynamically
  const collapsedAvatar = document.getElementById('collapsed-avatar-preview');
  const collapsedTitle = document.getElementById('collapsed-title');
  if (collapsedAvatar) {
    collapsedAvatar.src = userData.avatar || 'static/img/default-avatar.png';
  }
  if (collapsedTitle) {
    collapsedTitle.textContent = userData.title || 'YOUR PROFILE';
  }

  // --- Logic for Connections Section ---
  const hasConnections = userData.connections && userData.connections.length > 0;
  if (connectionsSection.dataset.manualToggle !== 'true') {
    if (hasConnections) {
      connectionsSection.classList.add('collapsed');
    } else {
      connectionsSection.classList.remove('collapsed');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.parentElement;
      section.dataset.manualToggle = 'true';
      section.classList.toggle('collapsed');
    });
  });
});

window.initializeCollapsibleSections = initializeCollapsibleSections;

// --- END COLLAPSIBLE SECTIONS LOGIC ---

// --- PREVIEW PAGE MODAL LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const previewBtn = document.getElementById('preview-page-btn');
    const previewModal = document.getElementById('preview-modal');
    const previewModalClose = document.getElementById('preview-modal-close');
    const previewIframe = document.getElementById('preview-iframe');

    if (previewBtn && previewModal && previewModalClose && previewIframe) {
        previewBtn.addEventListener('click', () => {
            const userDoc = window.firebaseUtils.currentUserDoc;
            if (userDoc && userDoc.id) {
                const baseUrl = window.location.origin;
                const previewUrl = `${baseUrl}/?profile=${userDoc.id}`;
                previewIframe.src = previewUrl;
                previewModal.style.display = 'flex'; // Use flex to center content
            } else {
                alert('Could not find user profile information. Please try again.');
                console.error('User data or user ID is not available.');
            }
        });

        const closeModal = () => {
            previewModal.style.display = 'none';
            previewIframe.src = ''; // Clear src to stop video/audio playback
        };

        previewModalClose.addEventListener('click', closeModal);

        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewModal.style.display === 'flex') {
                closeModal();
            }
        });
    }
});
// --- END PREVIEW PAGE MODAL LOGIC ---
