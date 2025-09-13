import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
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

  // Make the entire header clickable to open the author's profile
  header.style.cursor = 'pointer';
  header.onclick = () => {
    const cachedUser = window.__userCache ? window.__userCache[block.owner] : null;
    const profileParam = cachedUser && cachedUser.id !== undefined ? cachedUser.id : block.owner;
    window.location.href = `index.html?profile=${encodeURIComponent(profileParam)}`;
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
  d.innerHTML = `${block.desc || ''}`;
  if (block.link) {
    d.style.cursor = 'pointer';
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(block.link, '_blank');
    });
  }

  const isCarousel = block.type === 'carousel';
  const isLarge = block.type === 'large-image';
  const isDefaultLayout = !isCarousel && !isLarge; // treat undefined or 'default'

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
      // existing behaviour
      card.appendChild(t);
      card.appendChild(d);
  }

  // Determine image to show
  if(block.type==='carousel' && Array.isArray(block.slides) && block.slides.length){
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
  card.appendChild(actions);

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
  card.appendChild(commentsDiv);

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
  card.appendChild(addDiv);

  // View profile button
  const viewBtn = document.createElement('button');
  viewBtn.className = 'discover-view-profile';
  viewBtn.textContent = 'VIEW PROFILE';
  // Navigate to the NETWORK page with the user's profile id (preferred) or email as fallback
  viewBtn.onclick = () => {
    const cachedUser = window.__userCache ? window.__userCache[block.owner] : null;
    const profileParam = cachedUser && cachedUser.id !== undefined ? cachedUser.id : block.owner;
    window.location.href = `index.html?profile=${encodeURIComponent(profileParam)}`;
  };
  card.appendChild(viewBtn);

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