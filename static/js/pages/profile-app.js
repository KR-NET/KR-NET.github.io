// app.js
import Cropper from "https://cdn.jsdelivr.net/npm/cropperjs@1.5.13/dist/cropper.esm.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
// --- Onboarding Modal Controller ---
const OB_SEEN_KEY = 'kr_profile_onboard_step_v1';
const onboardOverlay = document.getElementById('onboard-overlay');
const onboardBody = document.getElementById('onboard-body');
const onboardTitle = document.getElementById('onboard-title') || document.querySelector('.onboard-title');
const onboardBack = document.getElementById('onboard-back');
const onboardNext = document.getElementById('onboard-next');
const onboardSkip = document.getElementById('onboard-skip');
const onboardDots = document.querySelectorAll('.onboard-dot');

let onboardStep = 0; // 0..3
let hasShownAvatarNudge = false; // first-press gate for step 0 when no avatar

function hasCustomAvatar() {
  try {
    const doc = window.firebaseUtils?.currentUserDoc || {};
    if (doc && typeof doc.avatar === 'string' && doc.avatar.trim()) return true;
  } catch (_) { }
  // Fallback to checking current preview sources during onboarding step 0
  try {
    const obAvatar = document.getElementById('ob-avatar');
    const preview = document.getElementById('avatar-preview');
    const isDefault = (src) => !src || src.includes('static/img/default-avatar.png');
    const anySet = (obAvatar && !isDefault(obAvatar.src)) || (preview && !isDefault(preview.src));
    return !!anySet;
  } catch (_) { }
  return false;
}

function ensureNudgeOverlay() {
  let overlay = document.getElementById('avatar-nudge-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'avatar-nudge-overlay';
  overlay.className = 'onboard-nudge-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="onboard-nudge-content" tabindex="-1">
      <button class="onboard-nudge-close" aria-label="Close">&times;</button>
      <div class="onboard-nudge-title">Add a profile picture?</div>
      <div class="onboard-nudge-text">A photo helps you stand out. Are you sure you don't want to add one now?</div>
      <div class="onboard-nudge-actions">
        <button type="button" class="secondary" id="nudge-dismiss">Close</button>
        <button type="button" id="nudge-change-photo">Change Photo</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Close interactions (outside click)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideAvatarNudge(); });
  // Close button
  const closeBtn = overlay.querySelector('.onboard-nudge-close');
  if (closeBtn) closeBtn.addEventListener('click', hideAvatarNudge);
  // Footer buttons
  const dismissBtn = overlay.querySelector('#nudge-dismiss');
  const changeBtn = overlay.querySelector('#nudge-change-photo');
  if (dismissBtn) dismissBtn.addEventListener('click', hideAvatarNudge);
  if (changeBtn) changeBtn.addEventListener('click', () => {
    try { hideAvatarNudge(); } catch (_) { }
    try {
      // Trigger existing avatar file input
      if (avatarInput) {
        try { avatarInput.value = ''; } catch (_) { }
        avatarInput.click();
      }
    } catch (_) { }
  });
  return overlay;
}

let lastFocusedBeforeNudge = null;
function showAvatarNudge() {
  const overlay = ensureNudgeOverlay();
  if (!overlay) return;
  lastFocusedBeforeNudge = document.activeElement;
  overlay.classList.add('visible');
  try {
    const content = overlay.querySelector('.onboard-nudge-content');
    content?.focus();
  } catch (_) { }
}

function hideAvatarNudge() {
  const overlay = document.getElementById('avatar-nudge-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  try { if (lastFocusedBeforeNudge) lastFocusedBeforeNudge.focus(); } catch (_) { }
}

function shakeAndLabelContinueAnyways() {
  if (!onboardNext) return;
  // Update label
  onboardNext.textContent = 'Continue Anyways';
  // Shake animation
  onboardNext.classList.remove('shake-once');
  // Force reflow to restart animation
  void onboardNext.offsetWidth;
  onboardNext.classList.add('shake-once');
  const remove = () => onboardNext.classList.remove('shake-once');
  onboardNext.addEventListener('animationend', remove, { once: true });
}

function resetContinueButtonState() {
  if (!onboardNext) return;
  if (onboardStep === 0) {
    onboardNext.textContent = 'Continue';
    onboardNext.classList.remove('shake-once');
    hasShownAvatarNudge = false;
  }
}

function normalizeForValidation(value, platform) {
  try {
    // reuse existing normalizer if available below (hoisted), else basic
    if (typeof normalizeSocialUrl === 'function') return normalizeSocialUrl(value, platform);
  } catch (_) { }
  return value || '';
}

function hasAnyValidSocial() {
  const ig = document.getElementById('ob-instagram')?.value || '';
  const yt = document.getElementById('ob-youtube')?.value || '';
  const tk = document.getElementById('ob-tiktok')?.value || '';
  const candidates = [
    ['instagram', ig],
    ['youtube', yt],
    ['tiktok', tk]
  ].map(([p, v]) => normalizeForValidation(v, p)).filter(Boolean);
  for (const v of candidates) {
    const val = v.trim();
    if (!val) continue;
    try { new URL(val.startsWith('http') ? val : `https://${val}`); return true; } catch (_) { }
  }
  return false;
}

function setOnboardDots(step) {
  onboardDots.forEach((d, i) => d.classList.toggle('active', i === step));
}

function validateStep(data) {
  // Prefer live inputs on the current step; fall back to the latest doc snapshot
  const doc = window.firebaseUtils?.currentUserDoc || data || {};
  switch (onboardStep) {
    case 0: {
      const v = (document.getElementById('ob-title')?.value || doc.title || '').trim();
      return v.length > 0;
    }
    case 1: {
      const v = (document.getElementById('ob-bio')?.value || doc.bio || '').trim();
      const len = v.length;
      return len >= 5 && len <= 280;
    }
    case 2: {
      // Use the module-scoped selectedPractices state if available
      if (Array.isArray(selectedPractices) && selectedPractices.length > 0) return true;
      return Array.isArray(doc.practices) && doc.practices.length > 0;
    }
    case 3: return true; // socials optional
    default: return false;
  }
}

function renderStep() {
  setOnboardDots(onboardStep);
  // Update header title per step (Option A)
  if (onboardTitle) {
    const TITLES = [
      'Welcome to KR. Let\u2019s create your profile!',
      'Set Your Bio',
      'Select Your Creative Practices',
      'Connect Your Socials'
    ];
    onboardTitle.textContent = TITLES[onboardStep] || '';
  }
  // Reset Next button label by default; step 4 may override
  if (onboardNext) onboardNext.textContent = 'Continue';
  onboardBack.style.visibility = onboardStep > 0 ? 'visible' : 'hidden';
  onboardSkip.style.display = onboardStep === 3 ? 'inline-block' : 'none';
  const doc = window.firebaseUtils?.currentUserDoc || {};
  if (onboardStep === 0) {
    onboardBody.innerHTML = `
      <img id="ob-avatar" class="onboard-avatar" src="${doc.avatar || 'static/img/default-avatar.png'}" alt="Avatar">
      <div class="onboard-step-title">Your Info</div>
      <div class="center-align" style="margin-bottom:6px;">Enter your name and add a profile photo.</div>
      <button id="ob-avatar-btn" class="onboard-upload-btn" type="button">Change Photo</button>
      <div class="input-feild-title"><p class="input-feild-title-text">Display Name<span>*</span></p></div>
      <input id="ob-title" class="input-feild onboard-input" type="text" placeholder="Profile Title" value="${doc.title || ''}">
      <div class="onboard-hint" id="ob-title-hint"></div>
    `;
    const titleInput = document.getElementById('ob-title');
    titleInput.addEventListener('input', () => { debouncedAutoSave(); localStorage.setItem(OB_SEEN_KEY, String(onboardStep)); updateValidation(); });
    // Wire avatar change to existing input
    const obBtn = document.getElementById('ob-avatar-btn');
    if (obBtn && avatarInput) {
      obBtn.onclick = () => {
        // ensure change fires even if picking same file
        try { avatarInput.value = ''; } catch (_) { }
        avatarInput.click();
      };
    }
    const obAvatar = document.getElementById('ob-avatar');
    if (obAvatar && avatarPreview) {
      const sync = () => { obAvatar.src = avatarPreview.src; };
      obAvatar.src = avatarPreview.src;
      avatarPreview.addEventListener('load', sync, { once: true });
    }
    // Keep underlying field in sync
    const profileTitle = document.getElementById('profile-title');
    if (profileTitle) titleInput.addEventListener('input', () => { profileTitle.value = titleInput.value; });
  } else if (onboardStep === 1) {
    const bioVal = (doc.bio || '');
    const count = bioVal.trim().length;
    const nameSource = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
    onboardBody.innerHTML = `
      <img class="onboard-avatar" src="${doc.avatar || 'static/img/default-avatar.png'}" alt="Avatar">
      <div class="onboard-step-title">${nameSource || 'Your Bio'}</div>
      <div class="center-align" id="ob-bio-prompt"></div>
      <div class="input-feild-title"><p class="input-feild-title-text">Bio<span>*</span></p></div>
      <textarea id="ob-bio" class="input-feild onboard-input" rows="5" placeholder="Add your bio...">${bioVal}</textarea>
      <div><span class="onboard-hint" id="ob-bio-hint"></span><span class="onboard-counter" id="ob-bio-count">${count}/280</span></div>
    `;
    const promptEl = document.getElementById('ob-bio-prompt');
    const updatePrompt = () => {
      const nm = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
      promptEl.textContent = nm ? `So, ${nm}, your bio. What do you do?` : 'Enter your bio. What do you do?';
      const stepTitleEl = document.querySelector('.onboard-step-title');
      if (stepTitleEl) stepTitleEl.textContent = nm || 'Your Bio';
    };
    updatePrompt();
    const titleField = document.getElementById('profile-title');
    if (titleField) titleField.addEventListener('input', updatePrompt);
    const bioInput = document.getElementById('ob-bio');
    const bioCount = document.getElementById('ob-bio-count');
    bioInput.addEventListener('input', () => {
      const v = bioInput.value;
      bioCount.textContent = `${v.trim().length}/280`;
      if (v.length > 280) bioInput.value = v.slice(0, 280);
      debouncedAutoSave(); localStorage.setItem(OB_SEEN_KEY, String(onboardStep)); updateValidation();
    });
    const bioField = document.getElementById('bio');
    if (bioField) bioInput.addEventListener('input', () => { bioField.value = bioInput.value; });
  } else if (onboardStep === 2) {
    const nameSource = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
    onboardBody.innerHTML = `
      <img class="onboard-avatar" src="${doc.avatar || 'static/img/default-avatar.png'}" alt="Avatar">
      <div class="onboard-step-title">${nameSource || 'Your Practices'}</div>
      <div class="center-align">What themes you workin’ with?</div>
      <div class="input-feild-title"><p class="input-feild-title-text">Creative Practices<span>*</span></p></div>
      <div id="ob-practices" class="onboard-practices"></div>
      <div class="onboard-hint" id="ob-practices-hint"></div>
    `;
    const updateTitle = () => {
      const nm = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
      const stepTitleEl = document.querySelector('.onboard-step-title');
      if (stepTitleEl) stepTitleEl.textContent = nm || 'Your Practices';
    };
    const titleField = document.getElementById('profile-title');
    if (titleField) titleField.addEventListener('input', updateTitle);
    updateTitle();
    const wrap = document.getElementById('ob-practices');
    // Use existing PRACTICES and module-scoped selection state
    const current = Array.isArray(selectedPractices) ? selectedPractices : (Array.isArray(doc.practices) ? doc.practices : []);
    PRACTICES.forEach(pr => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'practice-pill' + (current.includes(pr) ? ' selected' : '');
      btn.textContent = pr;
      btn.onclick = () => {
        if (selectedPractices.includes(pr)) {
          selectedPractices = selectedPractices.filter(p => p !== pr);
        } else {
          selectedPractices = [...selectedPractices, pr];
        }
        btn.classList.toggle('selected');
        debouncedAutoSave(); localStorage.setItem(OB_SEEN_KEY, String(onboardStep)); updateValidation();
      };
      wrap.appendChild(btn);
    });
  } else if (onboardStep === 3) {
    const nameSource = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
    onboardBody.innerHTML = `
      <img class="onboard-avatar" src="${doc.avatar || 'static/img/default-avatar.png'}" alt="Avatar">
      <div class="onboard-step-title">${nameSource || 'Your Socials'}</div>
      <div class="center-align">Connect to your socials - so people can find out more about you</div>
      <div class="input-feild-title"><p class="input-feild-title-text">Socials</p></div>
      <div class="onboard-input-wrap">
        <img class="onboard-left-icon" src="static/img/instagram.svg" alt="" aria-hidden="true">
        <input id="ob-instagram" class="input-feild onboard-input" type="url" placeholder="Instagram URL or @Handle" value="${doc.instagram || ''}">
        <button type="button" class="onboard-open-btn" id="ob-instagram-open" aria-label="Open Instagram" title="Open Instagram">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>
      <div class="onboard-input-wrap">
        <img class="onboard-left-icon" src="static/img/youtube.svg" alt="" aria-hidden="true">
        <input id="ob-youtube" class="input-feild onboard-input" type="url" placeholder="YouTube URL or @Handle" value="${doc.youtube || ''}">
        <button type="button" class="onboard-open-btn" id="ob-youtube-open" aria-label="Open YouTube" title="Open YouTube">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>
      <div class="onboard-input-wrap">
        <img class="onboard-left-icon" src="static/img/tiktok.svg" alt="" aria-hidden="true">
        <input id="ob-tiktok" class="input-feild onboard-input" type="url" placeholder="TikTok URL or @Handle" value="${doc.tiktok || ''}">
        <button type="button" class="onboard-open-btn" id="ob-tiktok-open" aria-label="Open TikTok" title="Open TikTok">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>
      <div class="onboard-hint">I recommend adding these now, but skipping won’t affect your setup.</div>
    `;
    const updateTitle = () => {
      const nm = (document.getElementById('ob-title')?.value || document.getElementById('profile-title')?.value || doc.title || '').trim();
      const stepTitleEl = document.querySelector('.onboard-step-title');
      if (stepTitleEl) stepTitleEl.textContent = nm || 'Your Socials';
    };
    const titleField = document.getElementById('profile-title');
    if (titleField) titleField.addEventListener('input', updateTitle);
    updateTitle();
    const ig = document.getElementById('ob-instagram');
    const yt = document.getElementById('ob-youtube');
    const tk = document.getElementById('ob-tiktok');
    const igOpen = document.getElementById('ob-instagram-open');
    const ytOpen = document.getElementById('ob-youtube-open');
    const tkOpen = document.getElementById('ob-tiktok-open');
    const igField = document.getElementById('instagram');
    const ytField = document.getElementById('youtube');
    const tkField = document.getElementById('tiktok');
    [
      [ig, igField], [yt, ytField], [tk, tkField]
    ].forEach(([a, b]) => { if (a && b) a.addEventListener('input', () => { b.value = a.value; debouncedAutoSave(); updateValidation(); }); });
    const HOMEPAGES = {
      instagram: 'https://www.instagram.com/',
      youtube: 'https://www.youtube.com/',
      tiktok: 'https://www.tiktok.com/'
    };
    function computeSocialUrl(inputEl, platform) {
      const raw = (inputEl?.value || '').trim();
      if (raw) {
        let url = normalizeSocialUrl(raw, platform);
        if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
        return url;
      }
      return HOMEPAGES[platform] || 'https://www.google.com';
    }
    [[ig, igOpen, 'instagram'], [yt, ytOpen, 'youtube'], [tk, tkOpen, 'tiktok']].forEach(([inp, btn, plat]) => {
      if (!btn) return;
      btn.disabled = false; // always enabled
      btn.addEventListener('click', () => {
        const url = computeSocialUrl(inp, plat);
        window.open(url, '_blank', 'noopener');
      });
    });
    // Prepare footer buttons for Step 4
    if (onboardNext) onboardNext.textContent = 'Finish';
  }
  updateValidation();
}

function updateValidation() {
  const valid = validateStep();
  // Default behavior for steps 0-2: disable when invalid
  if (onboardStep !== 3) {
    onboardNext.disabled = !valid;
  }
  // hints
  if (onboardStep === 0) {
    const v = (document.getElementById('ob-title')?.value || '').trim();
    document.getElementById('ob-title-hint').textContent = v ? '' : 'Add your display name to continue.';
  } else if (onboardStep === 1) {
    const len = (document.getElementById('ob-bio')?.value || '').trim().length;
    const hint = document.getElementById('ob-bio-hint');
    hint.textContent = len < 5 ? 'Say a little about what you do (min 5 chars).' : '';
  } else if (onboardStep === 2) {
  } else if (onboardStep === 2) {
    const has = Array.isArray(selectedPractices) && selectedPractices.length > 0;
    const hint = document.getElementById('ob-practices-hint');
    if (hint) hint.textContent = has ? '' : 'Pick at least one practice to get discovered.';
  } else if (onboardStep === 3) {
    // Toggle visibility: show Skip only by default; show Finish when any valid social is present
    const showFinish = hasAnyValidSocial();
    if (onboardNext) onboardNext.style.display = showFinish ? 'inline-block' : 'none';
    if (onboardSkip) onboardSkip.style.display = showFinish ? 'none' : 'inline-block';
  }
}

function go(step) {
  onboardStep = Math.max(0, Math.min(3, step));
  renderStep();
}

onboardBack?.addEventListener('click', () => {
  go(onboardStep - 1);
  resetContinueButtonState();
});
onboardNext?.addEventListener('click', () => {
  if (!validateStep()) return;
  // Step 0 gate: if no custom avatar set, first press shows nudge and changes label
  if (onboardStep === 0 && !hasCustomAvatar()) {
    if (!hasShownAvatarNudge) {
      showAvatarNudge();
      shakeAndLabelContinueAnyways();
      hasShownAvatarNudge = true;
      return; // do not advance yet
    }
  }
  if (onboardStep < 3) { go(onboardStep + 1); localStorage.setItem(OB_SEEN_KEY, String(onboardStep)); resetContinueButtonState(); }
  else {
    onboardOverlay.classList.remove('visible');
    document.body.style.overflow = '';
    // After finishing details onboarding, consider launching connections onboarding immediately
    maybeStartConnectionsOnboarding();
  }
});
// Close nudge on Esc (does not advance)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('avatar-nudge-overlay');
    if (overlay && overlay.classList.contains('visible')) {
      hideAvatarNudge();
    }
  }
});
onboardSkip?.addEventListener('click', () => { onboardOverlay.classList.remove('visible'); document.body.style.overflow = ''; });

function shouldShowOnboarding(data) {
  const d = data || window.firebaseUtils?.currentUserDoc || {};
  const missingTitle = !(d.title && String(d.title).trim());
  const missingBio = !((d.bio || '').trim().length >= 5);
  const missingPractices = !(Array.isArray(d.practices) && d.practices.length > 0);
  return missingTitle || missingBio || missingPractices;
}

function inferFirstIncompleteStep(d) {
  if (!(d.title && String(d.title).trim())) return 0;
  if (!((d.bio || '').trim().length >= 5)) return 1;
  if (!(Array.isArray(d.practices) && d.practices.length > 0)) return 2;
  return 3;
}

window.addEventListener('kr_profile_doc_updated', (e) => {
  const data = e.detail || {};
  const isOpen = onboardOverlay.classList.contains('visible');
  if (isOpen) {
    // Do not auto-close while open; user must finish Step 4 (Continue/Skip)
    updateValidation();
    return;
  }
  if (shouldShowOnboarding(data)) {
    onboardOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
    const startStep = inferFirstIncompleteStep(data);
    go(startStep);
  }
  // After first onboarding completes, consider launching connections onboarding
  try {
    const hasConns = Array.isArray(data.connections) && data.connections.length > 0;
    const email = window.firebaseUtils?.currentUser?.email || '';
    const perUserKey = email ? `kr_connections_onboard_seen_v1:${email}` : null;
    const seen = perUserKey ? (localStorage.getItem(perUserKey) === '1') : false;
    const obVisible = document.getElementById('conn-onboard-overlay')?.classList.contains('visible');
    if (!hasConns && !seen && !obVisible && !onboardOverlay.classList.contains('visible')) {
      // Show connections onboarding
      startConnectionsOnboarding();
    }
  } catch (_) { }
});

// If avatar becomes set during step 0, reset the Continue button state and close nudge if visible
window.addEventListener('kr_profile_doc_updated', () => {
  if (onboardStep === 0 && hasCustomAvatar()) {
    resetContinueButtonState();
    hideAvatarNudge();
  }
});

// Helper to open connections onboarding if appropriate
function maybeStartConnectionsOnboarding() {
  try {
    const data = window.firebaseUtils?.currentUserDoc || {};
    const hasConns = Array.isArray(data.connections) && data.connections.length > 0;
    const email = window.firebaseUtils?.currentUser?.email || '';
    const perUserKey = email ? `kr_connections_onboard_seen_v1:${email}` : null;
    const seen = perUserKey ? (localStorage.getItem(perUserKey) === '1') : false;
    const obVisible = document.getElementById('conn-onboard-overlay')?.classList.contains('visible');
    if (!hasConns && !seen && !obVisible) {
      setTimeout(() => { try { if (window.startConnectionsOnboarding) window.startConnectionsOnboarding(); } catch (_) { } }, 30);
    }
  } catch (_) { }
}

// Ensure skip also opens connections onboarding when appropriate
if (onboardSkip) {
  onboardSkip.addEventListener('click', () => {
    onboardOverlay.classList.remove('visible');
    document.body.style.overflow = '';
    maybeStartConnectionsOnboarding();
  });
}

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
const loadingHelpBtn = document.getElementById('loading-help');
let loadingHelpTimer = null;

// Initialize: Ensure loading screen is hidden on page load if something goes wrong
if (loadingScreen) {
  // Safety timeout: force hide loading screen after 10 seconds if still visible
  setTimeout(() => {
    if (!loadingScreen.classList.contains('hidden') && loadingTasks === 0) {
      console.warn('Loading screen force-hidden after timeout');
      loadingScreen.classList.add('hidden');
    }
  }, 10000);
}

// Add reload button functionality
if (loadingHelpBtn) {
  loadingHelpBtn.addEventListener('click', () => {
    window.location.reload();
  });
}

window.startLoading = function () {
  loadingTasks++;
  if (loadingScreen) {
    loadingScreen.classList.remove('hidden');
  }
  // Hide helper immediately and (re)start delayed reveal timer
  if (loadingHelpBtn) loadingHelpBtn.style.display = 'none';
  if (loadingHelpTimer) {
    clearTimeout(loadingHelpTimer);
    loadingHelpTimer = null;
  }
  loadingHelpTimer = setTimeout(() => {
    if (loadingTasks > 0 && loadingScreen && !loadingScreen.classList.contains('hidden')) {
      if (loadingHelpBtn) loadingHelpBtn.style.display = 'inline-block';
    }
  }, 5000);
};

window.stopLoading = function () {
  loadingTasks--;
  if (loadingTasks <= 0) {
    loadingTasks = 0;
    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
    }, 500); // Match the CSS transition duration
  }
  // Always clear and hide helper when stopping a loading task
  if (loadingHelpTimer) {
    clearTimeout(loadingHelpTimer);
    loadingHelpTimer = null;
  }
  if (loadingHelpBtn) loadingHelpBtn.style.display = 'none';
};

// Click helper to reload the page
if (loadingHelpBtn) {
  loadingHelpBtn.addEventListener('click', () => {
    try {
      // Provide immediate feedback by hiding loader before reload
      loadingScreen?.classList.add('hidden');
    } catch (_) { }
    window.location.reload();
  });
}

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
      // Ensure this sits above the onboarding overlay (z-index 10010)
      modal.style.zIndex = "10050";

      modal.innerHTML = `<div style="background: white; padding: 1rem; border-radius: 8px; max-width: 90%; max-height: 90vh; overflow: auto;">
        <div style="max-height: 70vh; margin-bottom: 1rem;"><img id="crop-image" style="max-width: 100%; display: block;" /></div>
        <div style="text-align: center;">
          <button id="crop-cancel">Cancel</button>
          <button id="crop-confirm" >Crop</button>
          
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
          const compressedBlob = await compressImage(avatarFile, 0.7, 400, 400);
          const compressedFile = new File([compressedBlob], "avatar.jpg", { type: "image/jpeg" });

          // Upload the new avatar immediately
          const email = window.firebaseUtils.currentUser.email;
          const avatarUrl = await window.firebaseUtils.uploadImage(compressedFile, `avatars/${email}`);

          // Update the preview
          avatarPreview.src = avatarUrl;
          // If onboarding open, sync its avatar image
          try {
            const ob = document.getElementById('ob-avatar');
            if (ob) ob.src = avatarUrl;
          } catch (_) { }

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
  // Allow re-selecting the same file by clearing the input value
  try { e.target.value = ''; } catch (_) { }
});

// Allow clicking the avatar image to trigger the file input
if (avatarPreview && avatarInput) {
  avatarPreview.style.cursor = 'pointer';
  avatarPreview.addEventListener('click', () => {
    avatarInput.click();
  });
}

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
  return function (...args) {
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

  switch (platform) {
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
const debouncedAutoSave = debounce(autoSaveProfile, 2000);

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
        if (imgInput.files[0]) {
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
  actionButton.addEventListener('click', function () {
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
  document.getElementById("modal-title").textContent = isEditing ? "Edit Link" : "Add Link";
  document.getElementById("save-block").textContent = isEditing ? "Save Changes" : "Save Link";

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
          urlInstruction.textContent = 'Enter a valid URL to continue with link creation';
          urlInstruction.style.color = '#ff8800';
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
document.getElementById("modal-close").addEventListener("click", closeBlockModal);

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
        const targetQuality = (currentBlockType === 'default') ? 0.5 : 0.7;
        const maxWidth = (currentBlockType === 'default') ? 100 : 700;
        const maxHeight = (currentBlockType === 'default') ? 100 : 700;
        const compressedBlob = await compressImage(file, targetQuality, maxWidth, maxHeight);
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
          const compressedBlob = await compressImage(carouselSlides[i].imgFile, 0.7, 700, 700);
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

window.editBlock = function (index) {
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

window.deleteBlock = async function (index) {
  if (!window.firebaseUtils.currentUser) return;

  if (confirm('Are you sure you want to delete this block?')) {
    const blockToDelete = blocks[index];
    const ownerEmail = window.firebaseUtils.currentUser.email;

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

    // Delete corresponding global block (if present)
    try {
      let globalId = blockToDelete.globalId;
      if (!globalId && blockToDelete.createdAt && window.firebaseUtils.generateGlobalBlockId) {
        globalId = window.firebaseUtils.generateGlobalBlockId(ownerEmail, blockToDelete.createdAt);
      }
      if (globalId && window.firebaseUtils.deleteGlobalBlock) {
        await window.firebaseUtils.deleteGlobalBlock(globalId);
      }
    } catch (err) {
      console.error('Error deleting corresponding global block', err);
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
    connectionsList.innerHTML = '';
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
  // If user has no connections, start at step 0; otherwise jump to step 2 (connections list)
  const step = (currentUserConnections && currentUserConnections.length > 0) ? 2 : 0;
  try { if (window.startConnectionsOnboarding) window.startConnectionsOnboarding(step); } catch (_) { }
};
if (closeConnectionsModalBtn && connectionsModal) {
  closeConnectionsModalBtn.onclick = () => {
    connectionsModal.style.display = 'none';
  };
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && connectionsModal && connectionsModal.style.display === 'flex') {
    connectionsModal.style.display = 'none';
  }
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

if (connectionsSearch) connectionsSearch.oninput = renderConnectionsModalList;

// Firestore helpers for connections
window.toggleConnection = async function (email, isConnected) {
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
  window.firebaseUtils.getAllUsers = async function () {
    const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    return getDocs(collection(window.firebaseUtils.db, 'users'));
  };
  window.firebaseUtils.getUserDocRef = async function (email) {
    const { doc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
    return doc(window.firebaseUtils.db, 'users', email);
  };
  window.firebaseUtils.updateConnections = async function (docRef, connections) {
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
window.loadUserData = async function (email) {
  await loadPracticesFromFirestore(email);
  if (origLoadUserData) await origLoadUserData(email);
};

// Initial render for new users
renderPracticePills([]);

// --- PROFILE PROGRESS BAR LOGIC ---
window.updateProfileProgress = function (hasProfileDetails, hasConnections, hasBlocks) {
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

// Track pending collapse timers and user interaction
const collapseTimers = {
  profile: null,
  connections: null
};

const userInteracting = {
  profile: false,
  connections: false
};

function setupSectionInputMonitoring(section, sectionKey) {
  if (!section) return;
  
  const contentArea = section.querySelector('.collapsible-content');
  if (!contentArea) return;
  
  // Get all interactive elements in the section
  const interactiveElements = contentArea.querySelectorAll(
    'input, textarea, button:not(.collapsible-header):not(.help-icon), select, .practice-pill'
  );
  
  // Track focus/click on any input in this section
  const handleInteraction = () => {
    userInteracting[sectionKey] = true;
    
    // Cancel any pending collapse for this section
    if (collapseTimers[sectionKey]) {
      clearTimeout(collapseTimers[sectionKey]);
      collapseTimers[sectionKey] = null;
    }
  };
  
  // Track when user stops interacting (blur on all inputs)
  const handleBlur = () => {
    // Small delay to check if focus moved to another input in the same section
    setTimeout(() => {
      const activeElement = document.activeElement;
      const isStillInSection = contentArea.contains(activeElement);
      
      if (!isStillInSection) {
        userInteracting[sectionKey] = false;
      }
    }, 100);
  };
  
  interactiveElements.forEach(element => {
    element.addEventListener('focus', handleInteraction);
    element.addEventListener('click', handleInteraction);
    element.addEventListener('blur', handleBlur);
  });
}

function scheduleCollapse(section, sectionKey, delay = 2000) {
  if (!section) return;
  
  // Clear any existing timer
  if (collapseTimers[sectionKey]) {
    clearTimeout(collapseTimers[sectionKey]);
  }
  
  // Only schedule collapse if user is not currently interacting
  if (userInteracting[sectionKey]) {
    return; // Stay open indefinitely while user is interacting
  }
  
  // Schedule the collapse
  collapseTimers[sectionKey] = setTimeout(() => {
    // Double-check user isn't interacting before collapsing
    if (!userInteracting[sectionKey] && section.dataset.manualToggle !== 'true') {
      section.classList.add('collapsed');
    }
    collapseTimers[sectionKey] = null;
  }, delay);
}

function initializeCollapsibleSections(userData = {}) {
  const profileSection = document.getElementById('profile-collapsible-section');
  const connectionsSection = document.getElementById('connections-collapsible-section');

  if (!profileSection || !connectionsSection) return;

  // Setup input monitoring for both sections (only once)
  if (!profileSection.dataset.monitoringSetup) {
    setupSectionInputMonitoring(profileSection, 'profile');
    profileSection.dataset.monitoringSetup = 'true';
  }
  
  if (!connectionsSection.dataset.monitoringSetup) {
    setupSectionInputMonitoring(connectionsSection, 'connections');
    connectionsSection.dataset.monitoringSetup = 'true';
  }

  // --- Logic for Profile Section ---
  const hasTitle = !!userData.title;
  const hasBio = !!userData.bio;
  const hasSocial = !!userData.instagram || !!userData.youtube || !!userData.tiktok;
  const hasPractices = userData.practices && userData.practices.length > 0;
  const isProfileComplete = hasTitle && hasBio && hasSocial && hasPractices;

  if (profileSection.dataset.manualToggle !== 'true') {
    if (isProfileComplete) {
      // Schedule collapse with 2-second delay
      scheduleCollapse(profileSection, 'profile', 2000);
    } else {
      // If incomplete, cancel any pending collapse and open the section
      if (collapseTimers.profile) {
        clearTimeout(collapseTimers.profile);
        collapseTimers.profile = null;
      }
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
      // Schedule collapse with 2-second delay
      scheduleCollapse(connectionsSection, 'connections', 2000);
    } else {
      // If no connections, cancel any pending collapse and open the section
      if (collapseTimers.connections) {
        clearTimeout(collapseTimers.connections);
        collapseTimers.connections = null;
      }
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
      
      // Cancel any pending auto-collapse when user manually toggles
      const sectionId = section.id;
      if (sectionId === 'profile-collapsible-section' && collapseTimers.profile) {
        clearTimeout(collapseTimers.profile);
        collapseTimers.profile = null;
      } else if (sectionId === 'connections-collapsible-section' && collapseTimers.connections) {
        clearTimeout(collapseTimers.connections);
        collapseTimers.connections = null;
      }
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
        const title = (userDoc.title || '').toLowerCase().replace(/\s+/g,'');
        const previewUrl = `${baseUrl}/?link=${title}`;
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
// --- PREVIEW BUTTON SCROLL REVEAL LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('preview-btn-container');
  const btn = document.getElementById('preview-page-btn');
  if (!container || !btn) return;

  let lastY = window.scrollY;
  const THRESHOLD = 200; // show only after scrolled this far
  const HIDE_VELOCITY = 1.2; // px per ms; require fast upward scroll to hide
  let lastT = performance.now();

  function updateVisibility() {
    const computed = window.getComputedStyle(btn);
    const isVisible = computed.display !== 'none' && !btn.disabled;
    if (!isVisible) {
      container.classList.remove('show');
      return;
    }
    const now = performance.now();
    const y = window.scrollY;
    const dy = y - lastY;
    const dt = Math.max(1, now - lastT);
    const v = dy / dt; // px per ms, positive when going down
    const goingDown = dy > 0;
    lastY = y;
    lastT = now;

    if (goingDown && y > THRESHOLD) {
      container.classList.add('show');
    } else if (!goingDown) {
      // Hide only if upward speed exceeds threshold and we're not near top
      if (Math.abs(v) > HIDE_VELOCITY && y > 60) {
        container.classList.remove('show');
      }
    }
  }

  updateVisibility();
  window.addEventListener('scroll', updateVisibility, { passive: true });
  const observer = new MutationObserver(updateVisibility);
  observer.observe(btn, { attributes: true, attributeFilter: ['disabled', 'style', 'class'] });
});
// --- END PREVIEW BUTTON SCROLL REVEAL LOGIC ---

// --- CONNECTIONS ONBOARDING MODAL ---
(function () {
  function getPerUserSeenKey() {
    const email = window.firebaseUtils?.currentUser?.email || '';
    return email ? `kr_connections_onboard_seen_v1:${email}` : null;
  }
  const overlay = document.getElementById('conn-onboard-overlay');
  if (!overlay) return;
  const body = document.getElementById('conn-onboard-body');
  const title = document.getElementById('conn-onboard-title');
  const back = document.getElementById('conn-onboard-back');
  const next = document.getElementById('conn-onboard-next');
  const skip = document.getElementById('conn-onboard-skip');
  const dots = overlay.querySelectorAll('.onboard-dot');
  let step = 0; // 0..3
  let usersCache = [];
  let myEmail = null;
  let svg = null, container = null, sim = null, zoomBehavior = null;
  let nodes = [], links = [];
  let hasAnyRequest = false;

  function setDots() { dots.forEach((d, i) => d.classList.toggle('active', i === step)); }
  function setHeader() {
    const titles = [
      'Welcome to the Network!',
      'Welcome to the Network!',
      'Add People You’ve Worked With:',
      'Amazing! You’re All Setup :)'
    ];
    title.textContent = titles[step] || '';
  }
  function clearBody() { while (body.firstChild) body.removeChild(body.firstChild); }

  function initSvg(height = 220) {
    const wrap = document.createElement('div');
    wrap.id = 'conn-web-wrap';
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'conn-web-svg';
    s.setAttribute('height', String(height));
    // Improve touch interactions on mobile for panning/zooming
    s.style.touchAction = 'none';
    wrap.appendChild(s); body.appendChild(wrap);
    svg = d3.select(s);
    container = svg.append('g').attr('class', 'conn-net');
    // Enable zoom & pan similar to index web
    zoomBehavior = d3.zoom()
      .scaleExtent([0.6, 3])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });
    svg.call(zoomBehavior).on('dblclick.zoom', null);
    // Temporarily block interactions for first 2s on open
    s.style.pointerEvents = 'none';
    setTimeout(()=>{ s.style.pointerEvents = 'auto'; }, 2000);
  }
  function pulseNode(sel) {
    sel.transition().duration(800).attr('r', 10).ease(d3.easeCubicInOut)
    .transition().duration(800).attr('r', 8).ease(d3.easeCubicInOut).on('end', () => pulseNode(sel));
  }
  function pulseBetween(sel, rSmall, rLarge, dur=800) {
    sel.transition().duration(dur).attr('r', rLarge).ease(d3.easeCubicInOut)
      .transition().duration(dur).attr('r', rSmall).ease(d3.easeCubicInOut)
      .on('end', ()=> pulseBetween(sel, rSmall, rLarge, dur));
  }

  function renderStep() {
    setDots(); setHeader();
    back.style.visibility = step > 0 ? 'visible' : 'hidden';
    skip.style.display = step === 2 ? 'inline-block' : (step === 3 ? 'none' : 'none');
    next.textContent = step === 1 ? "Let's Get Connected" : (step === 2 ? 'Finish' : (step === 3 ? "Let's Build Your Profile" : 'Continue'));
    if (step === 2) {
      // Hide Finish until at least one connection request exists
      next.style.display = hasAnyRequest ? 'inline-block' : 'none';
    } else {
      next.style.display = 'inline-block';
    }
    clearBody();

    if (step === 0) {
      initSvg();
      const w = body.querySelector('#conn-web-svg').clientWidth, h = 220;
      const myTitle = (window.firebaseUtils?.currentUserDoc?.title || window.firebaseUtils?.currentUser?.email || 'You');
      nodes = [{ id: 'me', title: myTitle, x: w / 2, y: h / 2 }]; links = [];
      const main = container.append('circle').attr('cx', w / 2).attr('cy', h / 2).attr('r', 8).attr('fill', '#ffa500');
      const ring0 = container.append('circle')
        .attr('cx', w/2).attr('cy', h/2).attr('r', 14)
        .attr('fill', '#ffa500')
        .attr('opacity', 0.25);
      pulseBetween(ring0, 14, 20, 900);
      const meAvatar0 = window.firebaseUtils?.currentUserDoc?.avatar;
      if (meAvatar0) {
        const clipId0 = `conn-clip-me-${Date.now()}`;
        svg.append('defs').append('clipPath').attr('id', clipId0)
          .append('circle').attr('cx', w/2).attr('cy', h/2).attr('r', 11);
        container.append('image')
          .attr('href', meAvatar0)
          .attr('x', w/2 - 11)
          .attr('y', h/2 - 11)
          .attr('width', 22)
          .attr('height', 22)
          .attr('clip-path', `url(#${clipId0})`);
      }
      container.append('text').attr('class', 'node-title').attr('x', w / 2 + 12).attr('y', h / 2 + 4).attr('fill', '#d8d8d8').text(myTitle);
      pulseNode(main);
      body.insertAdjacentHTML('beforeend', '<div class="center-align" style="margin-top:6px;">This is you... a single node in a vast creative web.</div><div class="center-align" style="margin-top:8px;">The network is a web of users, connected and linked through their collaborations</div>');
    } else if (step === 1) {
      initSvg();
      const w = body.querySelector('#conn-web-svg').clientWidth, h = 220;
      const center = { x: w / 2, y: h / 2 };
      const neigh = [{ x: center.x - 90, y: center.y - 20 }, { x: center.x + 70, y: center.y - 30 }, { x: center.x + 10, y: center.y + 70 }];
      const neighNames = ['Photographer', 'Set Designer', 'Ed'];
      const myTitle = (window.firebaseUtils?.currentUserDoc?.title || window.firebaseUtils?.currentUser?.email || 'You');
      // Layer groups to ensure links behind nodes
      const gLines = container.append('g').attr('class','conn2-links');
      const gNodes = container.append('g').attr('class','conn2-nodes');
      const gLabels = container.append('g').attr('class','conn2-labels');
      // Add pulsing fill first (so it sits behind)
      const ring1 = gNodes.append('circle')
        .attr('cx', center.x).attr('cy', center.y).attr('r', 14)
        .attr('fill', '#ffa500')
        .attr('opacity', 0.25);
      pulseBetween(ring1, 14, 20, 900);
      // Add the core node on top of the pulsing fill
      gNodes.append('circle').attr('cx', center.x).attr('cy', center.y).attr('r', 8).attr('fill', '#ffa500');
      const meAvatar1 = window.firebaseUtils?.currentUserDoc?.avatar;
      if (meAvatar1) {
        const clipId1 = `conn-clip-me-${Date.now()}`;
        svg.append('defs').append('clipPath').attr('id', clipId1)
          .append('circle').attr('cx', center.x).attr('cy', center.y).attr('r', 11);
        gNodes.append('image')
          .attr('href', meAvatar1)
          .attr('x', center.x - 11)
          .attr('y', center.y - 11)
          .attr('width', 22)
          .attr('height', 22)
          .attr('clip-path', `url(#${clipId1})`);
      }
      gLabels.append('text').attr('class', 'node-title').attr('x', center.x + 12).attr('y', center.y + 4).attr('fill', '#d8d8d8').text(myTitle);
      // delayed neighbors + links with ripple/draw effect
      neigh.forEach((p, i) => {
        const delay = 250 + i * 220;
        setTimeout(() => {
          gLines.append('line').attr('x1', center.x).attr('y1', center.y).attr('x2', center.x).attr('y2', center.y)
            .attr('stroke', '#aaa').attr('stroke-width', 1)
            .transition().duration(400).attr('x2', p.x).attr('y2', p.y);
          const c = gNodes.append('circle').attr('cx', center.x).attr('cy', center.y).attr('r', 0).attr('fill', '#69b3a2');
          c.transition().duration(400).attr('cx', p.x).attr('cy', p.y).attr('r', 7);
          gLabels.append('text').attr('class', 'node-title').attr('x', p.x + 12).attr('y', p.y + 4)
            .attr('fill', '#d8d8d8').style('opacity', 0).text(neighNames[i] || 'KR Member')
            .transition().duration(400).style('opacity', 1);
          const ripple = gNodes.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', 1).attr('stroke', '#58a6ff').attr('fill', 'none').attr('opacity', 0.8);
          ripple.transition().duration(600).attr('r', 22).attr('opacity', 0).remove();
        }, delay);
      });
      body.insertAdjacentHTML('beforeend', '<div class="center-align" style="margin-top:8px;">The more you connect, the more you get found, and the wider your reach becomes.</div>');
    } else if (step === 2) {
      initSvg(360);
      // Overlay container inside web wrap for search + panel
      const wrap = body.querySelector('#conn-web-wrap');
      const overlay = document.createElement('div');
      overlay.className = 'conn-overlay';
      wrap.appendChild(overlay);
      const search = document.createElement('input');
      search.type = 'text'; search.className = 'conn-search'; search.placeholder = 'Search users by title...';
      overlay.appendChild(search);
      const panel = document.createElement('div'); panel.className = 'conn-panel'; overlay.appendChild(panel);
      const title = document.createElement('div'); title.className = 'conn-panel-title'; title.textContent = 'KR Members:'; panel.appendChild(title);
      const list = document.createElement('div'); list.className = 'conn-list'; panel.appendChild(list);
      // Load users and my connections
      queueMicrotask(async () => {
        try {
          const user = window.firebaseUtils.currentUser;
          if (!user) return;
          myEmail = user.email;
          const snap = await window.firebaseUtils.getAllUsers();
          usersCache = snap.docs ? snap.docs.map(doc => ({ email: doc.id, ...doc.data() })) : [];
          const myRef = await window.firebaseUtils.getUserDocRef(myEmail);
          const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
          const mySnap = await getDoc(myRef);
          const myData = mySnap.exists() ? mySnap.data() : {};
          const myConns = Array.isArray(myData.connections) ? myData.connections : [];
          const dismissed = Array.isArray(myData.dismissedConnectionRequests) ? myData.dismissedConnectionRequests : [];
          // Compute pending: users who added me
          const pendingFromOthers = usersCache.filter(u => Array.isArray(u.connections) && u.connections.includes(myEmail) && !myConns.includes(u.email) && !dismissed.includes(u.email)).map(u => u.email);
          renderLiveNetwork(usersCache, myConns, pendingFromOthers);
          hasAnyRequest = pendingFromOthers.length > 0;
          updateFooter();
          renderList(usersCache, myConns, pendingFromOthers);
          search.addEventListener('input', () => { renderList(usersCache, myConns, pendingFromOthers, search.value.trim().toLowerCase()); });
        } catch (e) { console.error('conn-onboard load error', e); }
      });
    } else if (step === 3) {
      initSvg(260);
      body.insertAdjacentHTML('beforeend', '<div class="center-align" style="margin-top:10px;">Your connection requests has been sent. Also, let them know you’ve added them!</div>');
      // Load users and render full network (same as page 3, without the list/search)
      queueMicrotask(async () => {
        try {
          const user = window.firebaseUtils.currentUser;
          if (!user) return;
          myEmail = user.email;
          const snap = await window.firebaseUtils.getAllUsers();
          usersCache = snap.docs ? snap.docs.map(doc => ({ email: doc.id, ...doc.data() })) : [];
          const myRef = await window.firebaseUtils.getUserDocRef(myEmail);
          const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
          const mySnap = await getDoc(myRef);
          const myData = mySnap.exists() ? mySnap.data() : {};
          const myConns = Array.isArray(myData.connections) ? myData.connections : [];
          const dismissed = Array.isArray(myData.dismissedConnectionRequests) ? myData.dismissedConnectionRequests : [];
          const pendingFromOthers = usersCache.filter(u => Array.isArray(u.connections) && u.connections.includes(myEmail) && !myConns.includes(u.email) && !dismissed.includes(u.email)).map(u => u.email);
          renderLiveNetwork(usersCache, myConns, pendingFromOthers);
        } catch (e) { console.error('conn-onboard page 4 load error', e); }
      });
    }
  }

  function renderLiveNetwork(allUsers, myConns, pending) {
    const s = body.querySelector('#conn-web-svg'); if (!s) return;
    const w = s.clientWidth, h = s.clientHeight;
    const myDisplay = (window.firebaseUtils?.currentUserDoc?.title || myEmail || 'You');
    const myNode = { id: myEmail || 'me', title: myDisplay };
    const neighbors = new Set([...myConns, ...pending]);
    const others = allUsers.filter(u => u.email !== myEmail && !neighbors.has(u.email)).slice(0, 45); // limit to 45 to avoid performance issues
    nodes = [myNode, ...[...neighbors].map(e => {
      const u = allUsers.find(x => x.email === e); return { id: e, title: (u?.title || e) };
    }), ...others.map(u => ({ id: u.email, title: (u.title || u.email) }))];
    const displayed = new Set(nodes.map(n => n.id));
    const userMap = new Map(allUsers.map(u => [u.email, u]));
    links = [];
    // My links: solid if mutual, dotted if pending (either direction)
    myConns.forEach(e => {
      if (!displayed.has(e)) return;
      const theirConns = Array.isArray(userMap.get(e)?.connections) ? userMap.get(e).connections : [];
      const mutual = theirConns.includes(myEmail);
      links.push({ source: myNode.id, target: e, style: mutual ? 'solid' : 'dotted' });
    });
    // Pending inbound (they added me but I haven't added them)
    pending.forEach(e => {
      if (!displayed.has(e)) return;
      if (!myConns.includes(e)) links.push({ source: myNode.id, target: e, style: 'dotted' });
    });
    // Grey links: real mutual connections among displayed others (excluding my node)
    const dedup = new Set();
    displayed.forEach(a => {
      if (a === myNode.id) return;
      const aConns = Array.isArray(userMap.get(a)?.connections) ? userMap.get(a).connections : [];
      aConns.forEach(b => {
        if (!displayed.has(b) || b === a || b === myNode.id) return;
        const bConns = Array.isArray(userMap.get(b)?.connections) ? userMap.get(b).connections : [];
        if (!bConns.includes(a)) return; // require mutual
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!dedup.has(key)) {
          dedup.add(key);
          links.push({ source: a, target: b, style: 'grey' });
        }
      });
    });
    // D3 render
    container.selectAll('*').remove();
    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(l => l.style === 'grey' ? 0.05 : 0.3))
      .force('charge', d3.forceManyBody().strength(-140))
      .force('center', d3.forceCenter(w / 2, h / 2));
    const linkSel = container.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', l => l.style === 'solid' || l.style === 'dotted' ? '#ffffff' : '#555')
      .attr('stroke-width', l => l.style === 'solid' ? 2 : 1)
      .attr('stroke-dasharray', l => l.style === 'dotted' ? '4 4' : '');
    const nodeSel = container.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => d.id === myNode.id ? 8 : 6)
      .attr('fill', d => d.id === myNode.id ? '#ffa500' : '#9aa4b2');
    // pulsing ring for my node in live view
    const meNodeInit = nodes.find(n=>n.id===myNode.id);
    let ringLive = null;
    if (meNodeInit) {
      ringLive = container.append('circle')
        .attr('cx', meNodeInit.x||w/2).attr('cy', meNodeInit.y||h/2).attr('r', 14)
        .attr('fill', '#ffa500')
        .attr('opacity', 0.25);
      pulseBetween(ringLive, 14, 20, 900);
    }
    const labelSel = container.append('g').selectAll('text').data(nodes).join('text')
      .attr('class', 'node-title').attr('fill', '#d8d8d8')
      .text(d => d.title || d.id);

    // Temporarily pin my node at canvas center for first 2 seconds
    const mePin = nodes.find(n => n.id === myNode.id);
    if (mePin) {
      mePin.fx = w / 2; mePin.fy = h / 2;
      setTimeout(() => { mePin.fx = null; mePin.fy = null; }, 2000);
    }
    // Avatar overlay for my node in live view
    const meAvatarLive = window.firebaseUtils?.currentUserDoc?.avatar;
    let avatarSelLive = null; let clipIdLive = null;
    if (meAvatarLive) {
      clipIdLive = `conn-clip-me-live-${Date.now()}`;
      svg.append('defs').append('clipPath').attr('id', clipIdLive).append('circle').attr('r', 11);
      avatarSelLive = container.append('image').attr('href', meAvatarLive).attr('width', 22).attr('height', 22).attr('clip-path', `url(#${clipIdLive})`);
    }
    let centeredOnce = false;
    sim.on('tick', () => {
      linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
      labelSel.attr('x', d => (d.x || 0) + 12).attr('y', d => (d.y || 0) + 4);
      if (avatarSelLive) {
        const meNode = nodes.find(n => n.id === myNode.id);
        if (meNode) {
          svg.select(`#${clipIdLive} circle`).attr('cx', meNode.x).attr('cy', meNode.y);
          avatarSelLive.attr('x', (meNode.x || 0) - 11).attr('y', (meNode.y || 0) - 11);
        }
      }
      if (ringLive) {
        const meNode = nodes.find(n => n.id === myNode.id);
        if (meNode) {
          ringLive.attr('cx', meNode.x || 0).attr('cy', meNode.y || 0);
        }
      }
      // Center the view on my node once at start
      if (!centeredOnce && zoomBehavior) {
        const meNode = nodes.find(n => n.id === myNode.id);
        if (meNode && Number.isFinite(meNode.x) && Number.isFinite(meNode.y)) {
          const tx = (w / 2) - meNode.x;
          const ty = (h / 2) - meNode.y;
          svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(1));
          centeredOnce = true;
        }
      }
    });
  }

  function renderList(allUsers, myConns, pending, q = '') {
    const list = body.querySelector('.conn-list'); if (!list) return;
    const me = myEmail;
    const filtered = allUsers
      .filter(u => u.email !== me)
      .filter(u => (u.title || '').toLowerCase().includes(q));
    filtered.sort((a, b) => (a.title || a.email).localeCompare(b.title || b.email));
    list.innerHTML = filtered.map(u => {
      const isConnected = myConns.includes(u.email); // I added them
      const theirConnections = Array.isArray(u.connections) ? u.connections : [];
      const theyAddedMe = theirConnections.includes(me);
      const isMutual = isConnected && theyAddedMe;
      // Labeling rules:
      // - Mutual: Disconnect (red)
      // - Outbound pending (I added them, they haven't added me): Request Sent (grey)
      // - Inbound pending (they added me, I haven't): Connect (blue)
      // - None: Connect (blue)
      let label = 'Connect';
      let cls = 'btn-blue';
      let state = 'none';
      if (isMutual) { label = 'Disconnect'; cls = 'btn-red'; state = 'mutual'; }
      else if (isConnected && !theyAddedMe) { label = 'Request Sent'; cls = 'btn-grey'; state = 'outbound'; }
      else { label = 'Connect'; cls = 'btn-blue'; state = 'none'; }
      return `<div class="conn-row" data-email="${u.email}"><div class="left"><img src="${u.avatar || 'static/img/default-avatar.png'}"><span>${u.title || u.email}</span></div><button class="${cls}" data-state="${state}">${label}</button></div>`;
    }).join('');
    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.currentTarget.closest('.conn-row');
        const email = row.getAttribute('data-email');
        const state = e.currentTarget.getAttribute('data-state');
        try {
          const myRef = await window.firebaseUtils.getUserDocRef(myEmail);
          let mySnap = null; {
            const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
            mySnap = await getDoc(myRef);
          }
          const myData = mySnap.exists() ? mySnap.data() : {};
          let connArr = Array.isArray(myData.connections) ? myData.connections : [];
          // Recompute counterpart's connections to decide mutuality
          const targetUser = allUsers.find(u => u.email === email) || {};
          const theirConnections = Array.isArray(targetUser.connections) ? targetUser.connections : [];
          const theyAddedMe = theirConnections.includes(myEmail);
          const iAddedThem = connArr.includes(email);

          if (state === 'mutual') {
            // Disconnect
            connArr = connArr.filter(x => x !== email);
            await window.firebaseUtils.updateConnections(myRef, connArr);
          } else if (state === 'outbound') {
            // Cancel my request
            connArr = connArr.filter(x => x !== email);
            await window.firebaseUtils.updateConnections(myRef, connArr);
          } else {
            // Send/accept connection (adds my connection)
            connArr = [...new Set([...connArr, email])];
            await window.firebaseUtils.updateConnections(myRef, connArr);
            hasAnyRequest = true; updateFooter();
          }
          // Re-render live
          const snap = await window.firebaseUtils.getAllUsers();
          usersCache = snap.docs ? snap.docs.map(doc => ({ email: doc.id, ...doc.data() })) : [];
          const mySnap2 = await (await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js')).getDoc(myRef);
          const myData2 = mySnap2.exists() ? mySnap2.data() : {};
          const myConns2 = Array.isArray(myData2.connections) ? myData2.connections : [];
          // recompute pendingFromOthers (inbound requests)
          const pendingFromOthers = usersCache.filter(u => Array.isArray(u.connections) && u.connections.includes(myEmail) && !myConns2.includes(u.email)).map(u => u.email);
          renderLiveNetwork(usersCache, myConns2, pendingFromOthers);
          renderList(usersCache, myConns2, pendingFromOthers, (body.querySelector('.conn-search')?.value || '').trim().toLowerCase());
        } catch (err) { console.error('toggle conn error', err); }
      });
    });
  }

  function updateFooter() {
    if (step === 2) {
      next.textContent = 'Finish';
      // Toggle visibility based on whether any request exists
      if (next) next.style.display = hasAnyRequest ? 'inline-block' : 'none';
    }
  }

  function scrollToBlocks() {
    try {
      const blocks = document.querySelector('.blocks-section');
      if (!blocks) return;
      // Ensure expanded if collapsible systems hide it (not collapsible by id, so just scroll)
      blocks.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) { }
  }

  function render() { setHeader(); renderStep(); }
  function go(n) { step = Math.max(0, Math.min(3, n)); render(); }

  back?.addEventListener('click', () => go(step - 1));
  next?.addEventListener('click', () => {
    if (step < 3) {
      go(step + 1);
    } else {
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
      try {
        const key = getPerUserSeenKey();
        if (key) localStorage.setItem(key, '1');
      } catch (_) { }
      scrollToBlocks();
    }
  });
  skip?.addEventListener('click', () => {
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
    try {
      const key = getPerUserSeenKey();
      if (key) localStorage.setItem(key, '1');
    } catch (_) { }
    scrollToBlocks();
  });

  window.startConnectionsOnboarding = function (initialStep) {
    try { if (!overlay) return; overlay.style.display = ''; } catch (_) { }
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
    if (typeof initialStep === 'number' && isFinite(initialStep)) {
      step = Math.max(0, Math.min(3, Math.floor(initialStep)));
    } else {
      step = 0;
    }
    hasAnyRequest = false;
    render();
  };
})();
// --- END CONNECTIONS ONBOARDING MODAL ---
