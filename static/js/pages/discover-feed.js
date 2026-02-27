import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  where,
  doc,
  runTransaction,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  addDoc
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const db = window.networkFirebaseUtils?.db;
const auth = window.networkFirebaseUtils?.currentUser;

const BATCH_SIZE = 10;

// Lazy iframe loader for embeds
let __iframeObserver = null;
function ensureIframeObserver() {
  if (!__iframeObserver) {
    __iframeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const iframe = entry.target;
          const src = iframe.getAttribute('data-src');
          if (src) {
            iframe.setAttribute('src', src);
            iframe.removeAttribute('data-src');
          }
          __iframeObserver.unobserve(iframe);
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 0.1 });
  }
}

function createLazyEmbedIframe(provider, embedUrl, opts = {}) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('width', '100%');
  // Match profile sizes: YouTube 180px (list), Spotify 152px
  iframe.setAttribute('height', provider === 'spotify' ? '152' : '180');
  iframe.setAttribute('frameborder', '0');
  const extra = provider === 'spotify' && opts.spotifyType ? ` spotify-${opts.spotifyType}` : '';
  iframe.className = 'discover-embed-iframe ' + (provider === 'spotify' ? 'spotify-embed' : 'youtube-embed') + extra;
  if (provider === 'youtube') {
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('allowfullscreen', '');
  } else if (provider === 'spotify') {
    iframe.style.borderRadius = '12px';
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    iframe.setAttribute('loading', 'lazy');
  }
  // Lazy load via IntersectionObserver; also keep native hint
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('data-src', embedUrl);
  ensureIframeObserver();
  __iframeObserver.observe(iframe);
  return iframe;
}

// --- Minimal URL helpers to derive embedUrl when missing ---
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
  } catch(_) {}
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
  } catch(_) {}
  return null;
}

// Extended: also returns the spotify resource type for sizing
function parseSpotifyEmbedWithType(url) {
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
        return { embedUrl: `https://open.spotify.com/embed/${type}/${id}`, type };
      }
    }
    if (parts.length >= 2 && parts[0] === 'user') {
      const id = parts[1];
      return { embedUrl: `https://open.spotify.com/embed/user/${id}`, type: 'user' };
    }
  } catch(_) {}
  return null;
}

function createSortQuery(sortOption, timeFilter) {
  let q = collection(db, 'globalBlocks');
  const constraints = [];
  // Time filters
  if (timeFilter && timeFilter !== 'all') {
    const now = new Date();
    let start;
    switch (timeFilter) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        start = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        start = null;
    }
    if (start) constraints.push(where('createdAt', '>=', start.toISOString()));
  }

  // Sort
  if (sortOption === 'votes') {
    constraints.push(orderBy('score', 'desc'));
  } else {
    constraints.push(orderBy('createdAt', 'desc')); // most recent
  }

  constraints.push(limit(BATCH_SIZE));
  return query(q, ...constraints);
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d ago`;
  if (hr > 0) return `${hr}h ago`;
  if (min > 0) return `${min}m ago`;
  return 'just now';
}

// Voting helpers
async function voteOnBlock(blockId, value) {
  if (!window.networkFirebaseUtils.currentUser) return;
  const userEmail = window.networkFirebaseUtils.currentUser.email;
  const voteDoc = doc(db, 'globalBlocks', blockId, 'votes', userEmail);
  const blockDoc = doc(db, 'globalBlocks', blockId);
  await runTransaction(db, async (tx) => {
    const voteSnap = await tx.get(voteDoc);
    const blockSnap = await tx.get(blockDoc);
    if (!blockSnap.exists()) return;
    let up = blockSnap.data().upvotes || 0;
    let down = blockSnap.data().downvotes || 0;
    let prev = 0;
    if (voteSnap.exists()) {
      prev = voteSnap.data().value;
    }
    // No restriction – allow users to change/clear their vote

    // Update counts
    if (prev === 1) up -= 1;
    if (prev === -1) down -= 1;
    if (value === 1) up += 1;
    if (value === -1) down += 1;

    tx.set(voteDoc, { value }, { merge: true });
    tx.update(blockDoc, { upvotes: up, downvotes: down, score: up - down });
  });
}

async function addComment(blockId, text) {
  if (!window.networkFirebaseUtils.currentUser) return;
  const userEmail = window.networkFirebaseUtils.currentUser.email;
  const commentsCol = collection(db, 'globalBlocks', blockId, 'comments');
  await addDoc(commentsCol, {
    author: userEmail,
    text,
    timestamp: serverTimestamp(),
  });
}

async function deleteComment(blockId, commentId) {
  const userEmail = window.networkFirebaseUtils.currentUser?.email;
  if (!userEmail) return;
  const commentDoc = doc(db, 'globalBlocks', blockId, 'comments', commentId);
  await deleteDoc(commentDoc);
}

// Styles moved to styles.css; no inline injection needed.
function injectDiscoverStyles() { /* noop */ }

function renderBlockCard(block, container) {
  injectDiscoverStyles();
  const card = document.createElement('div');
  card.className = 'discover-post-card';

  // Header
  const header = document.createElement('div');
  header.className = 'discover-post-header';
  const avatar = document.createElement('img');
  avatar.className = 'discover-avatar';
  const titleWrap = document.createElement('div');
  titleWrap.innerHTML = `<div class="discover-author">Loading...</div><div class="discover-time">${formatTimeAgo(block.createdAt)}</div>`;
  header.appendChild(avatar);
  header.appendChild(titleWrap);
  // Owner action buttons (edit/delete) will be appended later if allowed

  // Make the entire header clickable to open the author's profile
  header.style.cursor = 'pointer';
  header.onclick = () => {
    const cachedUser = window.__userCache ? window.__userCache[block.owner] : null;
    const display = (cachedUser && cachedUser.title) ? cachedUser.title : block.owner;
    const slug = String(display || '').toLowerCase().replace(/\s+/g, '');
    window.location.href = `https://kr-net.work?link=${encodeURIComponent(slug)}`;
  };

  card.appendChild(header);

  // Load owner profile info
  (async ()=>{
     try {
       if(!window.__userCache) window.__userCache={};
       let data = window.__userCache[block.owner];
       if(!data){
         const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
         const snap = await getDoc(doc(db,'users',block.owner));
         data = snap.exists()? snap.data():{};
         window.__userCache[block.owner]=data;
       }
       avatar.src = data.avatar || 'static/img/default-avatar.png';
       titleWrap.querySelector('.discover-author').textContent = data.title || block.owner;
     }catch(e){
       console.error('profile fetch',e);
       avatar.src='static/img/default-avatar.png';
       titleWrap.querySelector('.discover-author').textContent = block.owner;
     }
  })();

  // Title big
  const t = document.createElement('div');
  t.className = 'discover-title';
  t.textContent = block.title || '';
  if (block.link) {
    t.style.cursor = 'pointer';
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(block.link, '_blank');
    });
  }

  const d = document.createElement('div');
  d.className = 'discover-desc';
  // Minimal sanitization to prevent XSS and preserve simple line breaks
  (function(){
    function sanitizeText(text, withLineBreaks = false){
      const t = (text == null) ? '' : String(text);
      const escaped = t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return withLineBreaks ? escaped.replace(/\r\n|\r|\n/g, '<br>') : escaped;
    }
    d.innerHTML = sanitizeText(block.desc || '', true);
  })();
  if (block.link) {
    d.style.cursor = 'pointer';
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(block.link, '_blank');
    });
  }

  const isCarousel = block.type === 'carousel';
  const isLarge = block.type === 'large-image';
  const isEmbed = block.type === 'embed';
  const isDefaultLayout = !isCarousel && !isLarge && !isEmbed; // treat undefined or 'default'

  // --- Owner controls: add Edit/Delete if the card belongs to current user ---
  try {
    const me = window.networkFirebaseUtils?.currentUser?.email;
    if (me && me === block.owner) {
      const actionsWrap = document.createElement('div');
      actionsWrap.style.marginLeft = 'auto';
      actionsWrap.style.display = 'flex';
      actionsWrap.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.className = 'discoverfeed-userpost-edit';
      editBtn.onclick = (e)=>{ e.stopPropagation(); openEditGlobalBlockModal(block, card); };

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Del';
      delBtn.className = 'discoverfeed-userpost-delete';
      delBtn.onclick = async (e)=>{ e.stopPropagation(); await deleteGlobalBlockOnly(block, card); };

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);
      header.appendChild(actionsWrap);
    }
  } catch(_){}

  if (isDefaultLayout) {
      // default small thumbnail row
      const row = document.createElement('div');
      row.className = 'discover-default-row';

      if (block.icon && block.icon !== 'static/img/default-icon.png') {
          const thumb = document.createElement('img');
          thumb.src = block.icon;
          thumb.className = 'discover-thumb';
          if (block.link) {
              thumb.style.cursor = 'pointer';
              thumb.addEventListener('click', (e)=>{e.stopPropagation(); window.open(block.link,'_blank');});
          }
          row.appendChild(thumb);
      }

      const contentWrap = document.createElement('div');
      contentWrap.className = 'discover-default-content';
      contentWrap.appendChild(t);
      contentWrap.appendChild(d);
      row.appendChild(contentWrap);
      card.appendChild(row);
  } else {
      // defer title/desc placement for non-default layouts (append after media)
  }

  // Determine image to show
  if (isEmbed) {
      // Attempt to derive embedUrl if not persisted yet
      let provider = block.provider;
      let embedUrl = block.embedUrl;
      let spotifyType = null;
      if ((!provider || !embedUrl) && block.link) {
        const y = parseYoutubeEmbed(block.link);
        const s = parseSpotifyEmbedWithType(block.link);
        if (y) { provider = 'youtube'; embedUrl = y; }
        else if (s) { provider = 'spotify'; embedUrl = s.embedUrl; spotifyType = s.type; }
      }
      if (provider && embedUrl) {
        const wrap = document.createElement('div');
        wrap.className = 'discover-embed-wrap';
        const iframe = createLazyEmbedIframe(provider, embedUrl, { spotifyType });
        wrap.appendChild(iframe);
        card.appendChild(wrap);
      }
  } else if(block.type==='carousel' && Array.isArray(block.slides) && block.slides.length){
      const car=document.createElement('div');
      car.className='discover-carousel';
      block.slides.forEach(slide=>{
          const s=document.createElement('div');
          s.className='discover-slide';
          const si=document.createElement('img');
          si.src=slide.icon || 'static/img/default-icon.png';
          s.appendChild(si);
          const txt=document.createElement('div');
          txt.className='slide-text';
          txt.textContent=slide.title || '';
          s.appendChild(txt);
          car.appendChild(s);
      });
      card.appendChild(car);
      // ensure starts at left
      requestAnimationFrame(()=>{car.scrollLeft = 0;});
  }else{
      let imgUrl = null;
      if (block.icon && block.icon !== 'static/img/default-icon.png') {
        imgUrl = block.icon;
      }
      // Only add the large image for non-default (i.e., large-image) blocks
      if (imgUrl && !isDefaultLayout) {
        const img = document.createElement('img');
        img.className = 'discover-img';
        img.src = imgUrl;

        if (block.link) {
          img.style.cursor = 'pointer';
          img.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(block.link, '_blank');
          });
        }

        card.appendChild(img);
      }
  }

  // For non-default layouts, place title and description after media
  if (!isDefaultLayout) {
    card.appendChild(t);
    card.appendChild(d);
  }

  // Interaction wrapper (actions + comments + add-comment)
  const interaction = document.createElement('div');
  interaction.className = 'discover-interaction';

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'discover-actions';

  // Comment button
  const commentBtn = document.createElement('button');
  commentBtn.className = 'comment-btn';
  const commentIcon = document.createElement('img');
  commentIcon.src = 'static/img/commenticon.svg';
  commentIcon.alt = 'Comment';
  commentBtn.appendChild(commentIcon);

  // Up-vote button
  const upBtn = document.createElement('button');
  upBtn.className = 'upvote-btn';
  const upIcon = document.createElement('img');
  upIcon.src = 'static/img/likeicon.svg';
  upIcon.alt = 'Up-vote';
  upBtn.appendChild(upIcon);

  // Score display
  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'score';
  scoreSpan.textContent = block.score || 0;

  // Down-vote button (same icon rotated)
  const downBtn = document.createElement('button');
  downBtn.className = 'downvote-btn';
  const downIcon = document.createElement('img');
  downIcon.src = 'static/img/likeicon.svg';
  downIcon.alt = 'Down-vote';
  downIcon.style.transform = 'rotate(180deg)';
  downBtn.appendChild(downIcon);

  actions.appendChild(commentBtn);
  actions.appendChild(upBtn);
  actions.appendChild(scoreSpan);
  actions.appendChild(downBtn);
  interaction.appendChild(actions);

  // Track current vote status locally (0 none, 1 up, -1 down)
  let currentVote = 0;

  // Load existing vote (if any)
  (async () => {
    if (window.networkFirebaseUtils.currentUser) {
      try {
        const voteSnap = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js').then(({getDoc, doc}) => {
          return getDoc(doc(db,'globalBlocks',block.globalId,'votes',window.networkFirebaseUtils.currentUser.email));
        });
        if (voteSnap.exists()) {
          currentVote = voteSnap.data().value || 0;
          updateVoteClasses();
        }
      } catch(e){console.error('vote fetch',e);}
    }
  })();

  const updateVoteClasses = () => {
    if (currentVote === 1) {
      upBtn.classList.add('selected');
      downBtn.classList.remove('selected');
    } else if (currentVote === -1) {
      downBtn.classList.add('selected');
      upBtn.classList.remove('selected');
    } else {
      upBtn.classList.remove('selected');
      downBtn.classList.remove('selected');
    }
  };

  upBtn.onclick = async () => {
    const newVal = currentVote === 1 ? 0 : 1;
    await voteOnBlock(block.globalId, newVal);
    scoreSpan.textContent = parseInt(scoreSpan.textContent) + (newVal - currentVote);
    currentVote = newVal;
    updateVoteClasses();
  };

  downBtn.onclick = async () => {
    const newVal = currentVote === -1 ? 0 : -1;
    await voteOnBlock(block.globalId, newVal);
    scoreSpan.textContent = parseInt(scoreSpan.textContent) + (newVal - currentVote);
    currentVote = newVal;
    updateVoteClasses();
  };

  updateVoteClasses();

  // Comments list
  const commentsDiv = document.createElement('div');
  commentsDiv.className = 'discover-comments';
  interaction.appendChild(commentsDiv);

  const loadComments = async (lim=3, showAll=false) => {
    commentsDiv.innerHTML='';
    const commentsCol = collection(db,'globalBlocks',block.globalId,'comments');
    const q = query(commentsCol,orderBy('timestamp','desc'),limit(lim));
    const snap = await getDocs(q);
    const total = snap.size;
    for (const ds of snap.docs){
      const c = ds.data();
      // Resolve author title
      let authorTitle = c.author;
      const isOwn = window.networkFirebaseUtils.currentUser && window.networkFirebaseUtils.currentUser.email === c.author;
      try {
        if(!window.__userCache) window.__userCache={};
        let u = window.__userCache[c.author];
        if(!u){
          const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
          const usnap = await getDoc(doc(db,'users',c.author));
          if(usnap.exists()) {
            u = usnap.data();
            window.__userCache[c.author]=u;
          }
        }
        if(u && u.title) authorTitle = u.title;
      } catch(e){console.error('comment author fetch',e);}

      const line = document.createElement('div');
      line.className = 'comment-line';

      const textSpan = document.createElement('span');
      textSpan.innerHTML = `<strong>${authorTitle}:</strong> ${c.text}`;
      line.appendChild(textSpan);

      if (isOwn) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'comment-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'comment-action-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = async () => {
          const newText = prompt('Edit your comment:', c.text);
          if (newText && newText.trim() !== c.text) {
            try {
              await updateDoc(doc(db,'globalBlocks',block.globalId,'comments',ds.id), { text:newText.trim() });
              loadComments(lim, showAll);
            } catch(e){console.error('update comment',e);}  
          }
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'comment-action-btn';
        delBtn.textContent = 'Del';
        delBtn.onclick = async () => {
          if (confirm('Delete this comment?')){
            await deleteComment(block.globalId, ds.id);
            loadComments(lim, showAll);
          }
        };

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(delBtn);
        line.appendChild(actionsDiv);
      }

      commentsDiv.appendChild(line);
    }
    if (!showAll && total === lim) {
      const btn = document.createElement('button');
      btn.textContent = 'View all';
      btn.onclick = () => loadComments(100, true);
      commentsDiv.appendChild(btn);
    }
  };
  loadComments();

  // Add comment input
  const addDiv = document.createElement('div');
  addDiv.className = 'discover-add-comment';
  const inp = document.createElement('input');
  inp.placeholder = 'Leave a comment…';
  const send = document.createElement('button');
  send.textContent = 'Post';
  send.onclick = async () => {
    if (inp.value.trim()) {
      await addComment(block.globalId, inp.value.trim());
      inp.value = '';
      loadComments();
    }
  };

  // Submit on Enter key
  inp.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send.click();
    }
  });

  addDiv.appendChild(inp);
  addDiv.appendChild(send);
  interaction.appendChild(addDiv);

  // Append interaction wrapper to card
  card.appendChild(interaction);

  // Removed 'VIEW PROFILE' button per request

  container.appendChild(card);
}

export async function initDiscoverFeed(containerEl) {
  if (!db) return;

  // Clean previous content (but keep container element)
  containerEl.innerHTML = '';
  containerEl.classList.add('discover-feed-container');
  // Ensure the discover feed has no extra padding inherited from welcome screen styles
  containerEl.style.padding = '0';

  // Create close (X) button (will be appended into header)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-join-popup';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    const overlay = document.getElementById('join-kr-popup-overlay');
    const bubble = document.getElementById('join-kr-popup-bubble');
    const content = document.getElementById('join-kr-popup-content');
    const joinBtn = document.getElementById('join-kr-main-btn');

    if (joinBtn) {
      joinBtn.classList.remove('positioned');
    }

    // Start hiding content
    if (content) {
      content.classList.add('hiding');
      content.classList.remove('visible');
    }

    // Trigger bubble shrink animation
    if (bubble) {
      bubble.classList.remove('expand');
      bubble.classList.add('shrink');
    }

    // After animation completes, fully close the overlay
    setTimeout(() => {
      if (overlay) overlay.classList.remove('active');
      document.body.classList.remove('join-popup-active');
      if (bubble) bubble.classList.remove('shrink');
      if (content) content.classList.remove('hiding');
    }, 600);
  });

  // Header
  const header = document.createElement('div');
  header.className = 'discover-feed-header';
  const title = document.createElement('h2');
  title.textContent = 'DISCOVER';
  const select = document.createElement('select');
  select.innerHTML = `
    <option value="recent">Most Recent</option>
    <option value="votes">Most Votes</option>
    <option value="relevant">Most Relevant</option>
  `;
  const timeSelect = document.createElement('select');
  timeSelect.innerHTML = `
    <option value="all">All Time</option>
    <option value="today">Today</option>
    <option value="week">This Week</option>
    <option value="month">This Month</option>
    <option value="year">This Year</option>
  `;
  header.appendChild(title);
  header.appendChild(select);
  header.appendChild(timeSelect);
  header.appendChild(closeBtn);
  containerEl.appendChild(header);

  const feed = document.createElement('div');
  containerEl.appendChild(feed);

  // ----- Hide / reveal header on scroll direction -----
  let lastScrollTop = 0;
  containerEl.addEventListener('scroll', () => {
    const current = containerEl.scrollTop;

    // Infinite scroll trigger (existing)
    if (current + containerEl.clientHeight >= containerEl.scrollHeight - 50) {
      loadMore();
    }

    const threshold = 10; // px delta to avoid jitter
    if (current > lastScrollTop + threshold) {
      // Scrolling down
      header.classList.add('header-hidden');
    } else if (current < lastScrollTop - threshold) {
      // Scrolling up
      header.classList.remove('header-hidden');
    }

    // Reset at top
    if (current <= 0) {
      header.classList.remove('header-hidden');
    }

    lastScrollTop = current;
  });

  let lastDoc = null;
  let loading = false;
  async function loadMore(reset = false) {
    if (loading) return;
    loading = true;
    if (reset) {
      feed.innerHTML = '';
      lastDoc = null;
    }
    let q = createSortQuery(select.value, timeSelect.value);
    if (lastDoc) {
      const { startAfter } = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js');
      q = query(q, startAfter(lastDoc));
    }
    const snap = await getDocs(q);
    if (snap.docs.length === 0) {
      loading = false;
      return;
    }
    lastDoc = snap.docs[snap.docs.length - 1];

    if (select.value === 'relevant') {
       // Build blocks with additional metrics
       const blocks = await Promise.all(snap.docs.map(async ds => {
         const blk = ds.data();
         blk.globalId = ds.id;
         // Comments count
         let commentsCnt = 0;
         try {
           const commentsCol = collection(db,'globalBlocks',ds.id,'comments');
           const commentsSnap = await getDocs(commentsCol);
           commentsCnt = commentsSnap.size;
         } catch(e){console.error('comments count',e);}

         const score = blk.score || 0;
         const hoursSince = (Date.now() - new Date(blk.createdAt).getTime())/3600000;
         const recency = Math.max(0, 72 - hoursSince); // within last 3 days
         blk.__relevance = score + commentsCnt + recency * 0.5; // weight recency
         return blk;
       }));

       blocks.sort((a,b)=>b.__relevance - a.__relevance);
       blocks.forEach(b=>renderBlockCard(b,feed));
    } else {
       snap.forEach(ds => {
         const blk = ds.data();
         blk.globalId = ds.id;
         renderBlockCard(blk, feed);
       });
    }
    loading = false;
  }

  // initial load
  await loadMore();

  select.onchange = () => loadMore(true);
  timeSelect.onchange = () => loadMore(true);
}

window.discoverFeed = { initDiscoverFeed };

// --- Owner Controls: Edit/Delete Handlers ---
function ensureEditModal() {
  let overlay = document.getElementById('df-edit-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'df-edit-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);display:none;justify-content:center;align-items:center;z-index:11000;';
  const modal = document.createElement('div');
  modal.id = 'df-edit-modal';
  modal.style.cssText = 'background:#1a1a1a;border-radius:8px;color:#fff;width:90%;max-width:480px;max-height:90vh;overflow:auto;position:relative;padding:16px;box-shadow:0 5px 25px rgba(0,0,0,0.3)';
  modal.innerHTML = `
    <button id="df-edit-close" style="position:absolute;top:8px;right:12px;background:none;border:none;color:#ffffff;font-size:28px;cursor:pointer">&times;</button>
    <h3 style="margin:0 0 12px 0;">Edit Block</h3>
    <div class="form-field"><label style="display:block;margin-bottom:6px;">Title</label><input id="df-edit-title" class="input-feild" style="width:100%;padding:6px;border-radius:4px;border:1px solid #ccc;background:#2a2a2a;color:#fff"></div>
    <div class="form-field"><label style="display:block;margin-bottom:6px;">Description</label><textarea id="df-edit-desc" class="input-feild" rows="3" style="width:100%;padding:6px;border-radius:4px;border:1px solid #ccc;background:#2a2a2a;color:#fff"></textarea></div>
    <div class="form-field"><label style="display:block;margin-bottom:6px;">Link</label><input id="df-edit-link" class="input-feild" style="width:100%;padding:6px;border-radius:4px;border:1px solid #ccc;background:#2a2a2a;color:#fff"></div>
    <div class="form-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
      <button id="df-edit-save" class="primary-btn" style="background:#0000ff;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Save</button>
      <button id="df-edit-cancel" class="secondary-btn" style="background:#666;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Cancel</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) overlay.style.display='none'; });
  overlay.querySelector('#df-edit-close').onclick = ()=> overlay.style.display='none';
  overlay.querySelector('#df-edit-cancel').onclick = ()=> overlay.style.display='none';
  return overlay;
}

async function deleteGlobalBlockOnly(block, card){
  if (!block || !block.globalId) return;
  if (!confirm('Delete this block from Discover? This will not remove it from your profile.')) return;
  try {
    await deleteDoc(doc(db,'globalBlocks', block.globalId));
    if (card && card.parentNode) card.parentNode.removeChild(card);
  } catch(e){
    alert('Failed to delete block.');
    console.error(e);
  }
}

async function openEditGlobalBlockModal(block){
  if(!block || !block.globalId) return;
  const overlay = ensureEditModal();
  const titleEl = overlay.querySelector('#df-edit-title');
  const descEl = overlay.querySelector('#df-edit-desc');
  const linkEl = overlay.querySelector('#df-edit-link');
  const saveBtn = overlay.querySelector('#df-edit-save');

  titleEl.value = block.title || '';
  descEl.value = block.desc || '';
  linkEl.value = block.link || '';
  overlay.style.display = 'flex';

  saveBtn.onclick = async ()=>{
    const newTitle = titleEl.value.trim();
    const newDesc = descEl.value.trim();
    const newLink = linkEl.value.trim();

    let provider = block.provider || null;
    let embedUrl = block.embedUrl || null;
    if (block.type === 'embed' && newLink) {
      const y = parseYoutubeEmbed(newLink);
      const s = parseSpotifyEmbedWithType(newLink);
      if (y) { provider = 'youtube'; embedUrl = y; }
      else if (s) { provider = 'spotify'; embedUrl = s.embedUrl; }
    }

    try {
      const gref = doc(db,'globalBlocks', block.globalId);
      const gpayload = { title: newTitle, desc: newDesc, link: newLink };
      if (block.type === 'embed') Object.assign(gpayload,{ provider, embedUrl });
      await updateDoc(gref, gpayload);

      const ownerRef = doc(db,'users', block.owner);
      const ownerSnap = await getDoc(ownerRef);
      if (ownerSnap.exists()) {
        const data = ownerSnap.data();
        const arr = Array.isArray(data.blocks) ? data.blocks.slice() : [];
        const idx = arr.findIndex(b => b && b.globalId === block.globalId);
        if (idx !== -1) {
          const merged = { ...arr[idx], ...gpayload, type: arr[idx].type || block.type };
          if (block.type === 'embed') Object.assign(merged,{ provider, embedUrl });
          arr[idx] = merged;
          await updateDoc(ownerRef, { blocks: arr });
        }
      }

      overlay.style.display = 'none';
      alert('Block updated.');
    } catch(e){
      alert('Failed to update block.');
      console.error(e);
    }
  };
}