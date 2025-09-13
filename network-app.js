// network-app.js
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let allUsers = [];
let nodes = [];
let links = [];
let simulation;
let zoomBehavior;

// Define a variable for fixed header height that can be updated
let fixedHeaderHeight = 158; // Default for desktop

// Function to update fixedHeaderHeight based on screen width
function updateFixedHeaderHeight() {
  if (window.innerWidth <= 768) { // Mobile breakpoint
    // On mobile: logo (50px high at top 10px) + searchbar (48px high at top 70px)
    // Effective space taken at the top is 70px (searchbar top) + 48px (searchbar height) = 118px
    fixedHeaderHeight = 118; 
  } else { // Desktop
    // On desktop: kr-navbar (~40px) + logo (50px) + searchbar (48px)
    // Original calculation: 158px. Navbar top 0, logo top 50, searchbar top 110.
    // Effective space is 110px (searchbar top) + 48px (searchbar height) = 158px
    fixedHeaderHeight = 158;
  }
  console.log("Updated fixedHeaderHeight:", fixedHeaderHeight);
}

// Initial call to set the header height
updateFixedHeaderHeight();

// Add event listener for window resize to update header height and re-center simulation
window.addEventListener('resize', () => {
  updateFixedHeaderHeight();
  if (simulation) {
    simulation.force("center", d3.forceCenter(
      window.innerWidth / 2,
      fixedHeaderHeight + (window.innerHeight - fixedHeaderHeight) / 2
    ));
    simulation.alpha(0.3).restart(); // Reheat simulation briefly to apply new center
  }
  // Potentially re-apply zoom if a node is selected and zoomed
  // This part might need more complex logic if you want to maintain zoom level and centering on resize
});

// Define radii for different node states
const R_SELECTED = 16;
const R_DEPTH_1 = 12;
const R_DEFAULT = 8; // Current normal size
const R_DISTANT = 5;
const R_MAGNIFIED = 30; // For nodes inside the vision circle

let activeClickedNodeId = null; // To keep track of the currently selected node for sizing
let currentProfileIdInUrl = null; // To track profile ID from URL for state management

const loadingScreen = document.getElementById('network-loading-screen'); // Get reference to loading screen
const loadingScreenGif = loadingScreen ? loadingScreen.querySelector('img') : null;
const loadingScreenText = loadingScreen ? loadingScreen.querySelector('p') : null;
const loadingCanvas = document.getElementById('loading-animation-canvas'); // Get reference to the canvas

// Define this at a higher scope if it's not already, or pass as needed
let scrollableModalContentElement = null;
let popupContainerElement = null; 
let originalViewCommunityButtonDivElement = null;
let stickyOverlayButtonElement = null;

let userNotifications = [];
let unreadNotificationIds = [];
let pendingConnectionRequests = [];
let panningMagnifiedNodes = new Map();

// Interval for cycling loading dots
let loadingDotsInterval = null;

// --- Vision Mode ---
let isVisionModeActive = false;
const visionCircle = document.getElementById('vision-circle-overlay');
const visionBtn = document.getElementById('vision-mode-btn');
const nodesInVision = new Set();
let visionMediaGroup = null; // A D3 selection for the <g> container for all vision media

// --- END Vision Mode ---

// --- START: DOMContentLoaded listener for staged loader ---
document.addEventListener('DOMContentLoaded', () => {
  if (!loadingScreen || loadingScreen.classList.contains('hidden')) return;

  // Step 1: show GIF (scale-in) immediately
  if (loadingScreenGif) loadingScreenGif.classList.add('visible');

  // Step 2: after short delay show text + canvas and start dots / animation
  setTimeout(() => {
    if (loadingScreenText) loadingScreenText.classList.add('visible');

    if (loadingCanvas) {
      loadingCanvas.classList.add('visible');
      if (window.startLoadingCanvasAnimation) {
        window.startLoadingCanvasAnimation('loading-animation-canvas');
      }
    }

    // Start cycling dots
    if (loadingScreenText) {
      let dotCount = 0;
      loadingDotsInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 3; // 0,1,2
        const dots = '.'.repeat(dotCount + 1);
        loadingScreenText.textContent = `Loading network${dots}`;
      }, 400);
    }
  }, 100); // delay before showing text & canvas
});
// --- END: DOMContentLoaded listener ---

function handleModalScroll() {
  if (!originalViewCommunityButtonDivElement || !scrollableModalContentElement || !popupContainerElement || !stickyOverlayButtonElement) {
    return;
  }

  const scrollableModalTop = scrollableModalContentElement.getBoundingClientRect().top;
  const originalButtonBottom = originalViewCommunityButtonDivElement.getBoundingClientRect().bottom;

  if (originalButtonBottom <= scrollableModalTop) {
    popupContainerElement.style.backgroundColor = '#0000ff';
    stickyOverlayButtonElement.style.display = 'flex';
  } else {
    popupContainerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    stickyOverlayButtonElement.style.display = 'none';
  }
}

// Initialize the network visualization
async function initNetwork() {
  if (loadingScreen) {
    loadingScreen.classList.remove('hidden');
    // Ensure GIF visible (will scale-in automatically)
    if (loadingScreenGif) loadingScreenGif.classList.add('visible');
    // Text & canvas visibility handled by DOMContentLoaded listener
  }

  // Fetch all users from Firestore
  allUsers = await window.networkFirebaseUtils.fetchAllUsers();
  
  if (loadingScreen) {
    // Begin fade-out sequence
    if (loadingDotsInterval) {
      clearInterval(loadingDotsInterval);
      loadingDotsInterval = null;
    }

    // Fade out canvas first
    if (loadingCanvas) loadingCanvas.classList.remove('visible');

    // Fade out text slightly later
    setTimeout(() => {
      if (loadingScreenText) loadingScreenText.classList.remove('visible');
    }, 100);

    // Stop canvas animation and hide overlay after fades complete
    setTimeout(() => {
      if (window.stopLoadingCanvasAnimation) {
        window.stopLoadingCanvasAnimation();
      }

      loadingScreen.classList.add('hidden');
      if (loadingScreenGif) loadingScreenGif.classList.remove('visible');
      // Trigger staggered UI fade-in once per page load
      if (!window.__uiRevealed) {
        window.__uiRevealed = true;
        revealUIStaggered();
      }
    }, 400); // overlay fade-out starts a bit earlier now
  }

  // Create nodes and links for the network
  nodes = allUsers.map(user => ({
    id: user.email,
    title: user.title || user.email,
    avatar: user.avatar || 'static/img/default-avatar.png'
  }));

  links = [];
  allUsers.forEach(user => {
    if (user.connections) {
      user.connections.forEach(targetEmail => {
        const targetUser = allUsers.find(u => u.email === targetEmail);
        if (targetUser && targetUser.connections?.includes(user.email)) {
          links.push({
            source: user.email,
            target: targetEmail
          });
        }
      });
    }
  });

  // Calculate node degrees to vary link distances for better layout
  const nodeDegrees = {};
  nodes.forEach(node => { nodeDegrees[node.id] = 0; });
  links.forEach(link => {
    nodeDegrees[link.source]++;
    nodeDegrees[link.target]++;
  });

  // Create the D3 force simulation
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links)
      .id(d => d.id)
      .distance(link => {
        // d3 replaces the string IDs with node objects in the links array
        const sourceDegree = nodeDegrees[link.source.id] || 1;
        const targetDegree = nodeDegrees[link.target.id] || 1;

        // If a node has only one connection, make its link shorter by a multiplier.
        if (sourceDegree === 1 || targetDegree === 1) {
          return 40; // A fixed, short distance.
        }

        // Base distance of 50, plus more for more connected nodes to spread out dense areas.
        // Capped at 120 to keep it in a reasonable range.
        return Math.min(50 + (sourceDegree + targetDegree) * 2, 120);
      })
      .strength(link => {
        // Make links for nodes with only one connection much stiffer.
        const sourceDegree = nodeDegrees[link.source.id] || 1;
        const targetDegree = nodeDegrees[link.target.id] || 1;
        if (sourceDegree === 1 || targetDegree === 1) {
          return 2.0; // Very high strength to enforce the short distance
        }
        // Give links to hubs (3+ connections) more flexibility by reducing strength.
        if (sourceDegree >= 3 || targetDegree >= 3) {
            return 0.15;
        }
        // Use a medium strength for all other links (i.e., between 2-connection nodes).
        return 0.4;
      })
    )
    .force("charge", d3.forceManyBody().strength(d => {
        const degree = nodeDegrees[d.id] || 0;
        if (degree === 1) {
            return -100; // Weaker repulsion for single-connection nodes to keep them close.
        }
        return -340; // Stronger repulsion for all other nodes to spread them out.
    }))
    .force("center", d3.forceCenter(
      window.innerWidth / 2, 
      fixedHeaderHeight + (window.innerHeight - fixedHeaderHeight) / 2 // Center in the visible part of the SVG
    ))
    .force("collide", d3.forceCollide(R_SELECTED + 2)); // Add collision force

  // Create the SVG container
  zoomBehavior = d3.zoom().on("zoom", (event) => {
    svg.select("g.network-container").attr("transform", event.transform);

    // Always calculate panning magnification
    calculatePanningMagnification(event.transform);

    if(isVisionModeActive) {
        updateVisionCircleSize();
        updateVisionMode(); // This will call updateNodeVisuals
    } else {
        // If vision mode is off, we still need to update visuals for the panning effect
        updateNodeVisuals(activeClickedNodeId, new Map());
    }
  });
  const svg = d3.select("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .call(zoomBehavior)
    .style("background-color", "#1a1a1a");

  // Create a container group for zooming
  const container = svg.append("g").attr("class", "network-container");

  // Create a group for vision mode media right before nodes, so nodes are on top
  visionMediaGroup = container.append("g").attr("class", "vision-media-container");

  // Create the links
  const link = container.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "link");

  // Create the nodes
  const node = container.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(d3.drag()
      // NEW: Filter to disable node dragging on touch devices, allowing panning instead.
      .filter(event => {
        const isTouchEvent = event.type.startsWith('touch');
        if (isTouchEvent) {
          console.log('Drag filter: IGNORING touch event to allow panning.');
          return false;
        }
        console.log('Drag filter: ALLOWING mouse event for node drag.');
        return true;
      })
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  // Add a clipPath for circular avatars
  node.append("defs")
    .append("clipPath")
    .attr("id", d => `clip-${d.id.replace(/[^a-zA-Z0-9]/g, '-')}`)
    .append("circle")
    .attr("r", 0); // Radius is set dynamically

  // Add a background circle for the pulsing effect (the focus ring)
  node.append("circle")
    .attr("class", "focus-ring")
    .attr("r", R_SELECTED + 4) // Start slightly larger, will be controlled by CSS/JS
    .style("opacity", 0); // Initially hidden

  // Add main visible circles to nodes
  node.append("circle")
    .attr("class", "main-circle") // Give it a class to distinguish from the focus ring
    .attr("r", R_DEFAULT); // Start with default radius

  // Add avatar image to each node, initially hidden
  node.append("image")
      .attr("class", "node-avatar")
      .attr("href", d => d.avatar)
      .attr("clip-path", d => `url(#clip-${d.id.replace(/[^a-zA-Z0-9]/g, '-')})`)
      .style("opacity", 0)
      .style("pointer-events", "none");

  // Add user titles next to nodes
  node.append("text")
    .attr("x", 12)
    .attr("y", 4)
    .text(d => d.title)
    .attr("class", "node-title");

  // Update positions on each tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("transform", d => `translate(${d.x},${d.y})`);
    
    if (isVisionModeActive) {
      visionMediaGroup.selectAll('.vision-media-group').each(function() {
          const group = d3.select(this);
          const nodeId = group.attr('data-node-id');
          const parentNode = nodes.find(n => n.id === nodeId);

          if (parentNode) {
              const satelliteDistance = 50;
              const imageSize = 25;
              
              const lines = group.selectAll('.media-link');
              const images = group.selectAll('.vision-media-image');
              const borders = group.selectAll('.media-image-border');
              
              const numSatellites = lines.size();
              
              for (let i = 0; i < numSatellites; i++) {
                  const angle = (i / numSatellites) * 2 * Math.PI;
                  const cx = parentNode.x + satelliteDistance * Math.cos(angle);
                  const cy = parentNode.y + satelliteDistance * Math.sin(angle);

                  d3.select(lines.nodes()[i])
                      .attr('x1', parentNode.x)
                      .attr('y1', parentNode.y)
                      .attr('x2', cx)
                      .attr('y2', cy);
                  
                  d3.select(images.nodes()[i])
                      .attr('x', cx - imageSize / 2)
                      .attr('y', cy - imageSize / 2);

                  d3.select(borders.nodes()[i])
                      .attr('cx', cx)
                      .attr('cy', cy);
              }
          }
      });
    }
  });

  // Add click handler for nodes
  node.on("click", async function(event, d) {
    console.log('Node CLICKED. Event:', event);
    updateNodeVisuals(d.id);
    
    // Center and zoom on the clicked node
    zoomToNode(d); // Call the new specific zoom function
    
    // Show clear filters button
    clearFiltersBtn.classList.add('active');
    clearFiltersBtn.style.display = 'block';
    // Ripple/Glow effect
    d3.selectAll('.node').classed('node-glow', false);
    d3.select(this).classed('node-glow', true);
    showNodeRipple(d);
    setTimeout(() => d3.selectAll('.node').classed('node-glow', false), 700);
    // Sound
    playNodeClickSound();
    // Haptic
    triggerHaptic();
    const userProfile = await window.networkFirebaseUtils.getUserProfile(d.id);
    if (userProfile) {
      // Update URL before showing modal
      if (userProfile.id) {
        history.pushState({ profileId: userProfile.id }, `Profile ${userProfile.title || userProfile.email}`, `?profile=${userProfile.id}`);
        currentProfileIdInUrl = String(userProfile.id);
      }
      showProfileModal(userProfile);
    }
  });
}

// Function to zoom and center on a specific node
function zoomToNode(nodeDatum, targetScale = 1.5) {
  if (!nodeDatum || nodeDatum.x === undefined || nodeDatum.y === undefined) return;

  const svg = d3.select('svg');
  const svgNode = svg.node();
  if (!svgNode) return;

  const svgWidth = svgNode.clientWidth;
  // Center Y but nudge upward so selected node sits slightly higher on the page
  const verticalCenter = fixedHeaderHeight + (svgNode.clientHeight - fixedHeaderHeight) / 2;
  const yOffset = -70; // move up by 40px – tweak if necessary
  const targetScreenY = verticalCenter + yOffset;
  const targetScreenX = svgWidth / 2;

  const translate = [
    targetScreenX - nodeDatum.x * targetScale,
    targetScreenY - nodeDatum.y * targetScale 
  ];

  svg.transition().duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(targetScale)
    )
    .on('end', () => {
      svg.select('g.network-container')
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${targetScale})`);
    });
}

// Drag functions
function dragstarted(event) {
  console.log('Drag STARTED. Event type:', event.sourceEvent.type);
  // event.sourceEvent.stopPropagation(); // This is no longer needed due to the .filter() on d3.drag
  if (!event.active) simulation.alphaTarget(0.3).restart();
  event.subject.fx = event.subject.x;
  event.subject.fy = event.subject.y;
}

function dragged(event) {
  console.log('Drag PROGRESSED. Event type:', event.sourceEvent.type);
  event.subject.fx = event.x;
  event.subject.fy = event.y;
}

function dragended(event) {
  console.log('Drag ENDED. Event type:', event.sourceEvent.type);
  if (!event.active) simulation.alphaTarget(0);
  event.subject.fx = null;
  event.subject.fy = null;
}

// Helper to create kebab button HTML
function kebabButtonHtml(link, idx, isCarousel) {
  return `<button class="kebab-btn" data-link="${link || ''}" data-block-idx="${idx}" data-carousel="${isCarousel ? '1' : '0'}" tabindex="0" aria-label="Share block link">
    <span class="kebab-dot"></span><span class="kebab-dot"></span><span class="kebab-dot"></span>
  </button>`;
}

// Show profile modal
function showProfileModal(user) {
  const popupContainer = document.getElementById('popup-container');
  const popupContent = popupContainer.querySelector('.popup'); // This is the scrollable element
  
  // Assign to higher-scope variables for access in scroll handler and closePopup
  scrollableModalContentElement = popupContent;
  popupContainerElement = popupContainer;
  originalViewCommunityButtonDivElement = popupContent.querySelector('.view-community-btn-div');
  stickyOverlayButtonElement = document.getElementById('sticky-view-community-button');

  // Ensure sticky button has content and click handler
  if (stickyOverlayButtonElement) {
    stickyOverlayButtonElement.innerHTML = `<img src="static/img/community.svg" alt="Community"> VIEW COMMUNITY`;
    stickyOverlayButtonElement.onclick = () => closePopup();
  }
  
  // Hide clear filters button when popup is open
  clearFiltersBtn.style.display = 'none';
  
  // Add or update the View Community button in its own div above the avatar
  let viewBtnDiv = popupContent.querySelector('.view-community-btn-div');
  if (!viewBtnDiv) {
    viewBtnDiv = document.createElement('div');
    viewBtnDiv.className = 'view-community-btn-div';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'view-community-btn'; // This class is primarily for its own specific styling if any
    // Add icon and text
    viewBtn.innerHTML = `<img src="static/img/community.svg" alt="Community" class="button-icon" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;"> VIEW COMMUNITY`;
    viewBtn.onclick = () => {
      closePopup(); // Call the main closePopup function which handles URL reset
    };
    viewBtnDiv.appendChild(viewBtn);
    popupContent.insertBefore(viewBtnDiv, popupContent.firstChild);
  } else {
    // If the button already exists, ensure its content and onclick handler are correct
    const existingBtn = viewBtnDiv.querySelector('.view-community-btn');
    if (existingBtn) {
      existingBtn.innerHTML = `<img src="static/img/community.svg" alt="Community" class="button-icon" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;"> VIEW COMMUNITY`;
      existingBtn.onclick = () => {
        closePopup(); // Call the main closePopup function which handles URL reset
      };
    }
  }

  // Add or update the share button in the top right
  let shareBtn = popupContent.querySelector('.popup-share-btn');
  if (!shareBtn) {
    shareBtn = document.createElement('button');
    shareBtn.className = 'popup-share-btn';
    shareBtn.innerHTML = `<img src="static/img/Share.png" alt="Share" width="21" height="21" />`;
    shareBtn.type = 'button';
    shareBtn.tabIndex = 0;
    popupContent.style.position = 'relative';
    popupContent.appendChild(shareBtn);
  }

  shareBtn.title = 'Share profile'; // Update title from "coming soon"
  shareBtn.onclick = (e) => {
    e.stopPropagation();

    // Construct the unique profile URL
    const profileUrl = `${window.location.origin}${window.location.pathname}?profile=${user.id}`;
    const shareModal = document.getElementById('share-modal');
    if (!shareModal) {
      console.error("Share modal element not found.");
      return;
    }

    const rect = shareBtn.getBoundingClientRect();
    shareModal.querySelector('.share-modal-link').textContent = profileUrl;
    shareModal.setAttribute('data-link', profileUrl);
    shareModal.style.display = 'block';

    // Position modal near the share button
    let modalTop = rect.bottom + window.scrollY + 8;
    let modalLeft = rect.right + window.scrollX - shareModal.offsetWidth;

    // Adjust if it goes off-screen
    if (modalLeft < 5) modalLeft = 5;
    if (modalTop + shareModal.offsetHeight > (window.innerHeight - 5)) {
        modalTop = rect.top + window.scrollY - shareModal.offsetHeight - 8;
    }

    shareModal.style.top = `${modalTop}px`;
    shareModal.style.left = `${modalLeft}px`;

    const copyBtn = shareModal.querySelector('.share-modal-copy');
    if (copyBtn) {
      copyBtn.textContent = 'Copy Link';
      setTimeout(() => copyBtn.focus(), 50);
    }
  };

  // Set user info
  document.getElementById('popup-image').src = user.avatar || 'static/img/default-avatar.png';
  document.getElementById('popup-title').textContent = user.title || user.email;
  
  // --- START: Add "Edit Your Profile" link if applicable ---
  const popupImageElement = document.getElementById('popup-image');
  let editProfileLinkContainer = popupContent.querySelector('.edit-profile-link-container');
  // Remove existing edit link container if present (for modal reuse)
  if (editProfileLinkContainer) {
    editProfileLinkContainer.remove();
  }

  const loggedInUser = window.networkFirebaseUtils ? window.networkFirebaseUtils.currentUser : null;

  if (loggedInUser && loggedInUser.email === user.email) {
    editProfileLinkContainer = document.createElement('div');
    editProfileLinkContainer.className = 'edit-profile-link-container';
    editProfileLinkContainer.style.textAlign = 'center';
    editProfileLinkContainer.style.marginTop = '10px';
    editProfileLinkContainer.style.marginBottom = '5px';

    const editLink = document.createElement('a');
    editLink.href = "profile.html";
    editLink.target = "_blank";
    editLink.textContent = "Edit Your Profile";
    editLink.style.color = "#0000ff"; // Or your preferred link color
    editLink.style.textDecoration = "underline";
    editLink.style.fontSize = "0.9em";

    editProfileLinkContainer.appendChild(editLink);
    // Insert after the popup image
    if (popupImageElement && popupImageElement.parentNode === popupContent) {
      popupImageElement.parentNode.insertBefore(editProfileLinkContainer, popupImageElement.nextSibling);
    }
  }
  // --- END: Add "Edit Your Profile" link if applicable ---
  
  // Update the JOIN button text
  const joinButton = document.getElementById('buttonscrollanchor');
  if (joinButton) {
    const userTitle = (user.title || 'USER').toUpperCase(); // Capitalize the title
    const buttonText = `JOIN ${userTitle} ON KR`; 
    
    // Find the text node directly within the button (more robust)
    let textNode = null;
    for (const node of joinButton.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        textNode = node;
        break;
      }
    }
    if (textNode) {
      textNode.textContent = ` ${buttonText} `;
    } else {
      // Fallback if text node isn't found (e.g., if structure changes)
      joinButton.innerHTML = `<img src="static/img/communityicon.png" alt="Community Icon" class="button-icon" /> ${buttonText}`;
    }
  }

  // Set social links
  const socialIcons = popupContent.querySelector('.social-icons');
  socialIcons.innerHTML = '';
  
  if (user.instagram) {
    socialIcons.innerHTML += `
      <a href="${user.instagram}" target="_blank">
        <img src="static/img/instagram.svg" alt="Instagram" class="social-icon" />
      </a>
    `;
  }
  if (user.youtube) {
    socialIcons.innerHTML += `
      <a href="${user.youtube}" target="_blank">
        <img src="static/img/youtube.svg" alt="YouTube" class="social-icon" />
      </a>
    `;
  }
  if (user.tiktok) {
    socialIcons.innerHTML += `
      <a href="${user.tiktok}" target="_blank">
        <img src="static/img/tiktok.svg" alt="TikTok" class="social-icon" />
      </a>
    `;
  }

  // Set bio
  const bioSection = popupContent.querySelector('.popup-spacer');
  bioSection.innerHTML = user.bio || 'No bio available';

  // Remove old blocks container if it exists
  let oldBlocks = popupContent.querySelector('.feature-tile-container');
  if (oldBlocks) oldBlocks.remove();
  let oldBlockContainer = popupContent.querySelector('.block-container');
  if (oldBlockContainer) oldBlockContainer.remove();

  // Add or update the new block container
  let blockContainer = popupContent.querySelector('.block-container');
  if (!blockContainer) {
    blockContainer = document.createElement('div');
    blockContainer.className = 'block-container';
    // Insert after .popup-spacer (bio)
    const spacer = popupContent.querySelector('.popup-spacer');
    if (spacer && spacer.nextSibling) {
      popupContent.insertBefore(blockContainer, spacer.nextSibling);
    } else {
      popupContent.appendChild(blockContainer);
    }
  }
  blockContainer.innerHTML = '';

  if (user.blocks && user.blocks.length > 0) {
    user.blocks.forEach((block, blockIdx) => {
      if (block.type === 'default' || !block.type) {
        // Default: image left, text right, whole block is a link
        blockContainer.innerHTML += `
          <a href="${block.link ? block.link : '#'}" class="block block-default" target="_blank" rel="noopener noreferrer" ${block.link ? '' : 'tabindex="-1" style="pointer-events:none;opacity:0.6;"'}>
            <div class="block-content">
              <img src="${block.icon || 'static/img/default-avatar.png'}" loading="lazy" width="40" height="40" alt="Block image">
              <div class="block-text block-text-default">
                <div class="block-title">${block.title || ''}</div>
                <div class="block-desc">${block.desc || ''}</div>
              </div>
              <div class="block-kebab">${kebabButtonHtml(block.link, blockIdx, false)}</div>
            </div>
          </a>
        `;
      } else if (block.type === 'large-image') {
        // Large image: image on top, text below, whole block is a link
        blockContainer.innerHTML += `
          <a href="${block.link ? block.link : '#'}" class="block block-large-image" target="_blank" rel="noopener noreferrer" ${block.link ? '' : 'tabindex="-1" style="pointer-events:none;opacity:0.6;"'}>
            <img src="${block.icon || 'static/img/default-avatar.png'}" loading="lazy" width="100%" height="230" style="object-fit:cover;border-radius:8px 8px 0 0;" alt="Block image">
            <div class="block-text-kebab-row">
              <div class="block-text">
                <div class="block-title">${block.title || ''}</div>
                <div class="block-desc">${block.desc || ''}</div>
              </div>
              <div class="block-kebab">${kebabButtonHtml(block.link, blockIdx, false)}</div>
            </div>
          </a>
        `;
      } else if (block.type === 'embed') {
        // Render embeds stacked (iframe on top, text below) like large-image blocks
        let iframeHtml = '';
        if (block.provider === 'youtube') {
          iframeHtml = `<iframe width="100%" height="215" style="border-radius:8px 8px 0 0;" src="${block.embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
        } else if (block.provider === 'spotify') {
          iframeHtml = `<iframe style="border-radius:0px; height:357px;" src="${block.embedUrl}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
        }
        blockContainer.innerHTML += `
          <div class="block block-embed" style="flex-direction:column;align-items:stretch;">
            <div style="width:100%;">${iframeHtml}</div>
            <div class="block-text-kebab-row">
              <div class="block-text">
                <div class="block-title">${block.title || ''}</div>
                <div class="block-desc">${block.desc || ''}</div>
              </div>
              <div class="block-kebab">${kebabButtonHtml(block.link, blockIdx, false)}</div>
            </div>
          </div>
        `;
      } else if (block.type === 'carousel' && Array.isArray(block.slides)) {
        // Carousel: horizontally scrollable row of large-image blocks
        blockContainer.innerHTML += `
          <div class="carousel-blocks">
            ${block.slides.map((slide, slideIdx) => `
              <a href="${slide.link ? slide.link : '#'}" class="block block-large-image carousel-slide" target="_blank" rel="noopener noreferrer" ${slide.link ? '' : 'tabindex="-1" style="pointer-events:none;opacity:0.6;"'}>
                <img src="${slide.icon || 'static/img/default-avatar.png'}" loading="lazy" width="230" height="230" style="object-fit:cover;border-radius:8px 8px 0 0;" alt="Slide image">
                <div class="block-text-kebab-row">
                  <div class="block-text">
                    <div class="block-title">${slide.title || ''}</div>
                    <div class="block-desc">${slide.desc || ''}</div>
                  </div>
                  <div class="block-kebab">${kebabButtonHtml(slide.link, `${blockIdx}-${slideIdx}`, true)}</div>
                </div>
              </a>
            `).join('')}
          </div>
        `;
      }
    });
  }

  // After rendering blocks, render practices section
  let oldPracticesSection = popupContent.querySelector('.practices-section');
  if (oldPracticesSection) oldPracticesSection.remove();
  const practicesSection = document.createElement('div');
  practicesSection.className = 'practices-section';
  let practicesHTML = `<div class="practices-title"><strong>KEYWORDS:</strong></div><div class="practices-pills">`;
  if (Array.isArray(user.practices) && user.practices.length > 0) {
    practicesHTML += user.practices.map(prac => `<span class="practice-pill-keyword">${prac.charAt(0).toUpperCase() + prac.slice(1)}</span>`).join('');
  } else {
    practicesHTML += '<span class="no-practices">No practices listed</span>';
  }
  practicesHTML += '</div>';
  practicesSection.innerHTML = practicesHTML;
  // Insert after blockContainer
  if (blockContainer && blockContainer.nextSibling) {
    popupContent.insertBefore(practicesSection, blockContainer.nextSibling);
  } else {
    popupContent.appendChild(practicesSection);
  }

  // Add share modal if not present
  let shareModal = document.getElementById('share-modal');
  if (!shareModal) {
    shareModal = document.createElement('div');
    shareModal.id = 'share-modal';
    shareModal.className = 'share-modal';
    shareModal.innerHTML = `
      <div class="share-modal-content">
        <div class="share-modal-link"></div>
        <button class="share-modal-copy">Copy Link</button>
      </div>
    `;
    document.body.appendChild(shareModal);
  }
  shareModal.style.display = 'none';

  // Kebab button event delegation
  blockContainer.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const link = btn.getAttribute('data-link');
      if (!link) return;
      
      const shareModal = document.getElementById('share-modal'); // Ensure we get the modal instance here
      if (!shareModal) {
        console.error("Share modal element not found for kebab button.");
        return;
      }

      const rect = btn.getBoundingClientRect();
      shareModal.querySelector('.share-modal-link').textContent = link;
      shareModal.setAttribute('data-link', link);
      shareModal.style.display = 'block';
      
      // Improved positioning logic for kebab share modal
      let modalTop = rect.bottom + window.scrollY + 8;
      let modalLeft = rect.left + window.scrollX - (shareModal.offsetWidth / 2) + (rect.width / 2);

      // Adjust if it goes off screen horizontally
      if (modalLeft < 5) modalLeft = 5; // Small padding from left edge
      if (modalLeft + shareModal.offsetWidth > window.innerWidth - 5) {
          modalLeft = window.innerWidth - shareModal.offsetWidth - 5; // Small padding from right edge
      }
      // Adjust if it goes off screen vertically (e.g., flip upwards if no space below)
      if (modalTop + shareModal.offsetHeight > window.innerHeight - 5 && (rect.top - shareModal.offsetHeight - 8 > 0)) {
          // If it goes off bottom and there's space above, flip it to appear above the kebab
          modalTop = rect.top + window.scrollY - shareModal.offsetHeight - 8;
      } else if (modalTop + shareModal.offsetHeight > window.innerHeight - 5) {
          // Otherwise, if it still goes off bottom, stick to bottom edge with padding
          modalTop = window.innerHeight - shareModal.offsetHeight - 5;
      }

      shareModal.style.top = `${modalTop}px`;
      shareModal.style.left = `${modalLeft}px`;

      const copyBtn = shareModal.querySelector('.share-modal-copy');
      if (copyBtn) {
        copyBtn.textContent = 'Copy Link'; // Reset button text for consistency
        setTimeout(() => copyBtn.focus(), 50);
      }
    };
  });

  // Copy link handler
  shareModal.querySelector('.share-modal-copy').onclick = () => {
    const link = shareModal.getAttribute('data-link');
    if (link) {
      navigator.clipboard.writeText(link);
      shareModal.querySelector('.share-modal-copy').textContent = 'Copied!';
      setTimeout(() => {
        shareModal.querySelector('.share-modal-copy').textContent = 'Copy Link';
        shareModal.style.display = 'none';
      }, 900);
    }
  };

  // Close share modal on outside click or Esc
  function closeShareModal() {
    shareModal.style.display = 'none';
  }
  document.addEventListener('mousedown', function handler(e) {
    if (shareModal.style.display === 'block' && !shareModal.contains(e.target)) {
      closeShareModal();
    }
  });
  window.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') closeShareModal();
  });

  // Show the popup
  popupContainer.style.display = 'flex';

  // Add scroll listener (avoid duplicates)
  if (scrollableModalContentElement && !scrollableModalContentElement.hasScrollListener) {
    scrollableModalContentElement.addEventListener('scroll', handleModalScroll);
    scrollableModalContentElement.hasScrollListener = true;
  }
  // Initial check in case the button is already out of view (e.g. on a very short screen or pre-scrolled state)
  handleModalScroll();
}

// Close profile modal
const closePopup = () => {
  if (popupContainerElement) {
    popupContainerElement.style.display = 'none';
    popupContainerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)'; // Reset background
  }

  if (stickyOverlayButtonElement) {
    stickyOverlayButtonElement.style.display = 'none'; // Hide sticky button
  }

  // Remove scroll listener
  if (scrollableModalContentElement) {
    scrollableModalContentElement.removeEventListener('scroll', handleModalScroll);
    scrollableModalContentElement.hasScrollListener = false;
  }
  // Reset global references
  scrollableModalContentElement = null;
  popupContainerElement = null; 
  originalViewCommunityButtonDivElement = null;
  stickyOverlayButtonElement = null;
  
  // Reset URL if a profile was being shown
  if (currentProfileIdInUrl || window.location.search.includes('profile=')) {
    history.pushState(null, "Network", "/");
    currentProfileIdInUrl = null; 
  }
  
  // Remove profile focus mode when popup closes
  document.documentElement.classList.remove('profile-focus-mode');
  
  // Show clear filters button again if filters are still active OR if a node was selected before popup (now handled by activeClickedNodeId)
  if (searchTerm || (selectedPractices && selectedPractices.length > 0) || activeClickedNodeId) {
    clearFiltersBtn.classList.add('active');
    clearFiltersBtn.style.display = 'block';
  }
};

document.getElementById('popup-background').addEventListener('click', closePopup);

// Add Escape key handler to close popup
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePopup();
  }
});

// Function to update node sizes and highlights based on selection, depth, and search
function updateNodeVisuals(selectedNodeId = null, nodesToMagnify = new Map()) {
  activeClickedNodeId = selectedNodeId; // Update the globally tracked selected node
  const isSearchFilterActive = searchTerm || selectedPractices.length > 0;
  let depths = {};
  let nodesToHighlight = new Set();

  if (selectedNodeId) {
    // --- Calculate Depths (BFS) --- 
    depths = { [selectedNodeId]: 0 };
    nodesToHighlight.add(selectedNodeId);
    const queue = [selectedNodeId];
    let head = 0;
    while(head < queue.length && depths[queue[head]] < 2) { // Only need up to depth 2
      const currentId = queue[head++];
      const currentDepth = depths[currentId];
      links.forEach(link => {
        let neighborId = null;
        if (link.source.id === currentId && !(link.target.id in depths)) {
          neighborId = link.target.id;
        } else if (link.target.id === currentId && !(link.source.id in depths)) {
          neighborId = link.source.id;
        }
        if (neighborId) {
          depths[neighborId] = currentDepth + 1;
          queue.push(neighborId);
          if (currentDepth === 0) { // Depth 1 nodes
            nodesToHighlight.add(neighborId);
          }
        }
      });
    }
  }

  // --- Apply Search/Filter Highlighting --- 
  if (isSearchFilterActive) {
    const term = searchTerm.trim().toLowerCase();
    allUsers.forEach(user => {
      let match = false;
      // Check title/email (nodes array might not have full data initially)
      if (term && (user.title || user.email).toLowerCase().includes(term)) {
        match = true;
      } 
      // Check bio
      if (!match && term && user.bio && user.bio.toLowerCase().includes(term)) {
        match = true;
      }
      // Check practices (both from filter and from search term)
      if (!match && Array.isArray(user.practices)) {
        if (selectedPractices.length > 0 && user.practices.some(p => selectedPractices.includes(p))) {
          match = true;
        }
        if (!match && term && user.practices.some(p => p.toLowerCase().includes(term))) {
          match = true;
        }
      }
      // Check blocks
      if (!match && term && user.blocks && Array.isArray(user.blocks)) {
        for (const block of user.blocks) {
          if ((block.title && block.title.toLowerCase().includes(term)) ||
              (block.desc && block.desc.toLowerCase().includes(term))) {
            match = true;
            break;
          }
          if (block.type === 'carousel' && Array.isArray(block.slides)) {
            for (const slide of block.slides) {
              if ((slide.title && slide.title.toLowerCase().includes(term)) ||
                  (slide.desc && slide.desc.toLowerCase().includes(term))) {
                match = true;
                break;
              }
            }
            if (match) break; // break outer loop if match found in slides
          }
        }
      }
      
      if (match) {
        nodesToHighlight.add(user.email);
      }
    });
  }
  
  // --- Update Node Visuals --- 
  d3.selectAll('.node').each(function(d) {
    const nodeElement = d3.select(this);
    const mainCircleElement = nodeElement.select('.main-circle'); // Target the main circle
    const focusRingElement = nodeElement.select('.focus-ring'); // Target the focus ring
    const textElement = nodeElement.select('text');
    const avatarImageElement = nodeElement.select('.node-avatar');
    const clipCircleElement = nodeElement.select('clipPath circle');
    const nodeId = d.id;
    let isHighlighted = nodesToHighlight.has(nodeId);
    let targetRadius;
    let isDimmed = false;

    if (selectedNodeId) {
      const depth = depths[nodeId];
      // Sizing
      if (depth === 0) targetRadius = R_SELECTED;
      else if (depth === 1) targetRadius = R_DEPTH_1;
      else if (depth === 2) targetRadius = R_DEFAULT;
      else targetRadius = R_DISTANT;
      
      // Dimming Logic
      if (depth > 1) {
          isDimmed = true;
      }
      
      // Focus Ring
      if (depth === 0) {
        focusRingElement
          .classed('pulsing-ring-active', true)
          .transition().duration(300)
          .attr('r', targetRadius + 5)
          .style('opacity', 0.7);
      } else {
        focusRingElement
          .classed('pulsing-ring-active', false)
          .transition().duration(150)
          .style('opacity', 0);
      }
    } else {
      // Sizing based only on search/filter highlight when nothing is clicked
      targetRadius = isSearchFilterActive && isHighlighted ? R_DEFAULT : R_DISTANT;
       // If search is not active, all nodes should be default size
      if (!isSearchFilterActive) targetRadius = R_DEFAULT;

      // Dimming logic for search
      if (isSearchFilterActive && !isHighlighted) {
          isDimmed = true;
      }

      // Ensure focus ring is off when no node is selected
      focusRingElement
        .classed('pulsing-ring-active', false)
        .transition().duration(150)
        .style('opacity', 0);
    }
    
    // Highlighted nodes should never be dimmed.
    if (isHighlighted) {
        isDimmed = false;
    }
    
    // --- Magnification Logic ---
    let magnifiedRadius = 0;

    // Vision Mode magnification
    const isVisionMagnified = isVisionModeActive && nodesToMagnify.has(nodeId);
    if (isVisionMagnified) {
        const visionCircleRadius = visionCircle.getBoundingClientRect().width / 2;
        if (visionCircleRadius > 0) {
            const distanceFromCenter = nodesToMagnify.get(nodeId);
            const distanceRatio = Math.min(distanceFromCenter / visionCircleRadius, 1.0);
            const magnificationFactor = 1 - d3.easeCubicOut(distanceRatio); // 1 at center, 0 at edge
            const visionMagnifiedRadius = R_DEFAULT + (R_MAGNIFIED - R_DEFAULT) * magnificationFactor;
            magnifiedRadius = Math.max(magnifiedRadius, visionMagnifiedRadius);
        }
    }
    
    // Panning magnification
    const isPanningMagnified = panningMagnifiedNodes.has(nodeId);
    if (isPanningMagnified) {
        const panningMagnifyRadius = 200; // Must match the value in calculatePanningMagnification
        const distanceFromCenter = panningMagnifiedNodes.get(nodeId);
        const distanceRatio = Math.min(distanceFromCenter / panningMagnifyRadius, 1.0);
        const magnificationFactor = 1 - d3.easeCubicOut(distanceRatio);
        const panningMagnifiedRadius = R_DEFAULT + (R_MAGNIFIED - R_DEFAULT) * magnificationFactor;
        magnifiedRadius = Math.max(magnifiedRadius, panningMagnifiedRadius);
    }
    
    // Apply final radius by taking the largest calculated size
            targetRadius = Math.max(targetRadius, magnifiedRadius);
    
    // Determine avatar visibility based on magnification
    const isMagnified = isVisionMagnified || (isPanningMagnified && !isVisionModeActive);
    
    // Apply highlight class
    nodeElement.classed('highlighted-node', isHighlighted);
    nodeElement.classed('dimmed', isDimmed);
    
    // Transition main circle and avatar visibility
    mainCircleElement.transition().duration(300)
        .attr('r', targetRadius)
        .style('opacity', isMagnified ? 0 : 1);

    avatarImageElement.transition().duration(300)
        .attr('x', -targetRadius)
        .attr('y', -targetRadius)
        .attr('width', targetRadius * 2)
        .attr('height', targetRadius * 2)
        .style('opacity', isMagnified ? 1 : 0);

    clipCircleElement.transition().duration(300)
        .attr('r', targetRadius);
    
    // Adjust text position based on new radius
    textElement.transition().duration(300).attr('x', targetRadius + 4); 
    
    // Apply final opacity
    // If search/filter active, highlighted nodes must be fully opaque
    if (isSearchFilterActive && isHighlighted) {
        isDimmed = false;
    }
    nodeElement.transition().duration(300).style('opacity', isDimmed ? 0.6 : 1);
  });

  // --- Update Link Visuals --- 
  d3.selectAll('.link').each(function(l) {
      const linkElement = d3.select(this);
      let isHighlighted = false;
      let isDimmed = false;
      const isFilterActive = selectedNodeId || isSearchFilterActive;

     if (selectedNodeId) {
          // Highlight links connected to the selected node
          isHighlighted = l.source.id === selectedNodeId || l.target.id === selectedNodeId;
      } else if (isSearchFilterActive) {
          // Highlight links between two highlighted nodes
          isHighlighted = nodesToHighlight.has(l.source.id) && nodesToHighlight.has(l.target.id);
      }

      if (isFilterActive && !isHighlighted) {
          isDimmed = true;
      }

      linkElement.classed('highlighted-link', isHighlighted);
      linkElement.classed('dimmed', isDimmed);
  });
}

// --- SEARCH & FILTER SYSTEM ---
const searchInput = document.getElementById('network-search-input');
const filterBtn = document.getElementById('practice-filter-btn');
const filterChipsDiv = document.getElementById('filter-chips');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
let filterDropdown = null;
let selectedPractices = [];
let searchTerm = '';
let debounceTimeout = null;

const PRACTICES = [
  "3D", "Architecture", "Community Engagement", "Computing", "Graphic Design",
  "Fashion", "Film", "Fine Art", "Image", "Jewelry", "Music", "Performance Arts",
  "Printing", "Product Design", "Publication", "Set Design", "Sound"
].sort();

function highlightMatchingNodes() {
  // This function now primarily triggers the update and potential zoom
  const isSearchFilterActive = searchTerm || selectedPractices.length > 0;
  updateNodeVisuals(activeClickedNodeId); // Re-apply visuals considering the new filter state

  if (isSearchFilterActive) {
    // Collect nodes matching the current search/filter to zoom
    let highlightedNodesData = [];
    const term = searchTerm.trim().toLowerCase();
    nodes.forEach((node, i) => {
        let match = false;
        // Search logic (ensure consistency with updateNodeVisuals if expanded)
        if (term && (node.title || node.id).toLowerCase().includes(term)) {
             match = true;
        }
        // Practice filter logic
        if (!match && selectedPractices.length > 0 && Array.isArray(allUsers[i]?.practices)) {
             match = allUsers[i].practices.some(p => selectedPractices.includes(p));
        }
        
        if (match) {
            highlightedNodesData.push(node);
        }
    });

    // Center and zoom on highlighted nodes
    if (highlightedNodesData.length > 0) {
      setTimeout(() => zoomToHighlightedNodes(highlightedNodesData), 50);
    }
  } else {
      // If search/filter cleared and no node actively clicked, reset zoom
      if (!activeClickedNodeId) {
           const svg = d3.select('svg');
           if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
               svg.transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
           }
      }
  }
}

function zoomToHighlightedNodes(nodesToZoom) {
  if (!nodesToZoom || nodesToZoom.length === 0) return;

  // Compute bounding box
  const xs = nodesToZoom.map(n => n.x).filter(x => x !== undefined && x !== null);
  const ys = nodesToZoom.map(n => n.y).filter(y => y !== undefined && y !== null);

  if (xs.length === 0 || ys.length === 0) return; // Not enough valid node positions

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  let boxWidth = maxX - minX;
  let boxHeight = maxY - minY;

  const svg = d3.select('svg');
  const svgNode = svg.node();
  if (!svgNode) return;
  const svgWidth = svgNode.clientWidth;
  const svgHeight = svgNode.clientHeight;
  
  // Define padding around the bounding box
  const padding = 80; // Increased padding slightly

  // If only one node, or all nodes are at the exact same spot, boxWidth/Height will be 0.
  // In this case, use a default size for calculating scale to prevent infinite zoom.
  if (boxWidth < R_SELECTED * 2) boxWidth = R_SELECTED * 4; // Use a width based on a couple of nodes
  if (boxHeight < R_SELECTED * 2) boxHeight = R_SELECTED * 4;

  // Calculate the scale required to fit the bounding box + padding
  const scaleX = svgWidth / (boxWidth + padding * 2); // padding on both sides
  const scaleY = svgHeight / (boxHeight + padding * 2);
  
  let targetScale = Math.min(scaleX, scaleY);
  
  // Set a maximum scale to prevent over-zooming, and a minimum if desired (e.g. 0.1)
  const maxZoom = 2.5;
  // const minZoom = 0.1; // Optional: if you want to limit how far out it can zoom
  targetScale = Math.min(targetScale, maxZoom);
  // targetScale = Math.max(targetScale, minZoom); // Optional

  const translate = [
    svgWidth / 2 - centerX * targetScale,
    svgHeight / 2 - centerY * targetScale
  ];
  
  svg.transition().duration(750) // Slightly longer duration for smoother zoom
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(targetScale)
    )
    .on('end', () => {
      // Force update the <g> transform in case the zoom handler didn't fire
      // This can happen if the target transform is identical to the current one.
      svg.select('g.network-container')
        .attr('transform', `translate(${translate[0]},${translate[1]}) scale(${targetScale})`);
    });
}

function renderFilterChips() {
  filterChipsDiv.innerHTML = '';
  selectedPractices.forEach(practice => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.tabIndex = 0;
    chip.setAttribute('aria-label', `Remove ${practice} filter`);
    chip.textContent = practice;
    // Tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'chip-tooltip';
    tooltip.textContent = `Remove filter: ${practice}`;
    chip.appendChild(tooltip);
    // Close button
    const close = document.createElement('span');
    close.className = 'chip-close';
    close.textContent = '×';
    chip.appendChild(close);
    // Animate removal
    function removeChip() {
      chip.classList.add('removing');
      setTimeout(() => {
        selectedPractices = selectedPractices.filter(p => p !== practice);
        renderFilterChips();
        highlightMatchingNodes();
        updateClearFiltersBtn();
        // If all filters and search are cleared, zoom out
        if (selectedPractices.length === 0 && !searchTerm) {
          const svg = d3.select('svg');
          if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
            svg.transition().duration(600)
              .call(zoomBehavior.transform, d3.zoomIdentity);
          }
        }
      }, 300);
    }
    // Toggle on chip click (anywhere)
    chip.onclick = (e) => {
      e.stopPropagation();
      removeChip();
    };
    // Also allow keyboard removal
    chip.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') removeChip();
    };
    // Prevent double removal if × is clicked
    close.onclick = (e) => {
      e.stopPropagation();
      removeChip();
    };
    filterChipsDiv.appendChild(chip);
  });
  // If all chips are gone and no search, zoom out
  if (selectedPractices.length === 0 && !searchTerm) {
    const svg = d3.select('svg');
    if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
      svg.transition().duration(600)
        .call(zoomBehavior.transform, d3.zoomIdentity);
    }
  }
}

function updateClearFiltersBtn() {
  if (searchTerm || selectedPractices.length > 0) {
    clearFiltersBtn.classList.add('active');
    clearFiltersBtn.style.display = 'block';
  } else {
    clearFiltersBtn.classList.remove('active');
    clearFiltersBtn.style.display = 'none';
  }
}

searchInput.addEventListener('input', () => {
  // Deselect any currently active node when user starts typing in search
  if (activeClickedNodeId) {
    // We want to reset the sizing/focus based on the clicked node,
    // and then let the new search term dictate highlighting and potentially new sizing.
    // Calling updateNodeVisuals(null) here will clear the activeClickedNodeId
    // and re-evaluate all nodes based on the current (potentially empty) search term and filters.
    updateNodeVisuals(null); 
  }

  searchTerm = searchInput.value;
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    highlightMatchingNodes();
    updateClearFiltersBtn();
    // If all filters and search are cleared, zoom out
    if (selectedPractices.length === 0 && !searchTerm) {
      const svg = d3.select('svg');
      if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
        svg.transition().duration(600)
          .call(zoomBehavior.transform, d3.zoomIdentity);
      }
    }
  }, 200);
});

filterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // Toggle dropdown: if open, close it; if closed, open it
  if (filterDropdown && filterDropdown.classList.contains('active')) {
    filterDropdown.classList.remove('active');
    return;
  }
  if (!filterDropdown) {
    filterDropdown = document.createElement('div');
    filterDropdown.id = 'practice-filter-dropdown';
    filterDropdown.innerHTML = `
      <button class="dropdown-close" aria-label="Close">×</button>
      <div class="dropdown-title">Filter by Practice</div>
      <div class="dropdown-pills"></div>
    `;
    document.body.appendChild(filterDropdown);
  }
  // Render pills
  const pillsDiv = filterDropdown.querySelector('.dropdown-pills');
  pillsDiv.innerHTML = '';
  PRACTICES.forEach(practice => {
    const pill = document.createElement('span');
    pill.className = 'dropdown-pill' + (selectedPractices.includes(practice) ? ' selected' : '');
    pill.textContent = practice;
    pill.onclick = () => {
      if (selectedPractices.includes(practice)) {
        selectedPractices = selectedPractices.filter(p => p !== practice);
      } else {
        selectedPractices = [...selectedPractices, practice];
      }
      renderFilterChips();
      highlightMatchingNodes();
      updateClearFiltersBtn();
      // Do NOT close or re-toggle the dropdown here
      // Do NOT call filterBtn.click();
    };
    pillsDiv.appendChild(pill);
  });
  // Show dropdown
  filterDropdown.classList.add('active');
  
  // Position dropdown below searchbar and center horizontally
  const rect = filterBtn.getBoundingClientRect();
  const dropdownWidth = 520; // Set a fixed width for the dropdown
  
  filterDropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;
  filterDropdown.style.left = '50%';
  filterDropdown.style.transform = 'translateX(-50%)';
  filterDropdown.style.width = `${dropdownWidth}px`;
  
  // Responsive: full width on mobile
  if (window.innerWidth < 700) {
    filterDropdown.style.width = '98vw';
  }
  // Close logic
  function closeDropdown() {
    filterDropdown.classList.remove('active');
  }
  filterDropdown.querySelector('.dropdown-close').onclick = closeDropdown;
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickHandler);
    window.addEventListener('keydown', escHandler);
  }, 10);
  function outsideClickHandler(e) {
    if (!filterDropdown.contains(e.target) && e.target !== filterBtn) {
      closeDropdown();
      document.removeEventListener('mousedown', outsideClickHandler);
      window.removeEventListener('keydown', escHandler);
    }
  }
  function escHandler(e) {
    if (e.key === 'Escape') {
      closeDropdown();
      document.removeEventListener('mousedown', outsideClickHandler);
      window.removeEventListener('keydown', escHandler);
    }
  }
});

clearFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchTerm = '';
  selectedPractices = [];
  renderFilterChips();
  updateClearFiltersBtn();

  if (currentProfileIdInUrl) {
    // A profile is "pinned" by URL or was last clicked
    const pinnedUser = allUsers.find(u => String(u.id) === String(currentProfileIdInUrl));
    if (pinnedUser) {
      activeClickedNodeId = pinnedUser.email; // Ensure this node is considered "active"
      updateNodeVisuals(pinnedUser.email); // Re-apply visuals focusing on this pinned user
      const pinnedNodeDatum = nodes.find(node => node.id === pinnedUser.email);
      if (pinnedNodeDatum) {
        setTimeout(() => zoomToNode(pinnedNodeDatum), 50); // Re-zoom to this user
      }
       // Do not close the modal if it's open for the pinned user
    } else {
      // Fallback if user not found (shouldn't happen if currentProfileIdInUrl is valid)
      activeClickedNodeId = null;
      updateNodeVisuals(null);
      if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
        d3.select('svg').transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
      }
    }
  } else {
    // No specific profile is pinned, reset everything
    activeClickedNodeId = null;
    updateNodeVisuals(null);
    if (typeof zoomBehavior !== 'undefined' && zoomBehavior) {
      d3.select('svg').transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity);
    }
  }
});

// Initial render
renderFilterChips();
updateClearFiltersBtn();

// Initialize the network when the page loads
window.addEventListener('load', async () => {
  
  await initNetwork();
  // Set initial default state for all nodes, but don't clear activeClickedNodeId if set by deep link below
  if (!activeClickedNodeId) { // Only call if not set by deep link processing
    updateNodeVisuals(null);
  }

  // Load notifications for logged in user
  await loadUserNotifications();

  // --- START: Log current user --- 
  if (window.networkFirebaseUtils && window.networkFirebaseUtils.currentUser) {
    console.log("Currently logged-in user on index.html:", window.networkFirebaseUtils.currentUser);
  } else {
    console.log("No user currently logged in on index.html.");
  }
  // --- END: Log current user ---

  // --- START: New code for deep linking ---
  const urlParams = new URLSearchParams(window.location.search);
  const profileIdFromUrl = urlParams.get('profile');

  if (profileIdFromUrl && allUsers.length > 0) {
    currentProfileIdInUrl = profileIdFromUrl; // Store it
    // Find the user by the numerical ID from the URL
    const targetUser = allUsers.find(user => String(user.id) === profileIdFromUrl);

    if (targetUser) {
      activeClickedNodeId = targetUser.email; // Set this as the active node
      // Find the corresponding D3 node data (simulation uses email as id)
      const targetNodeDatum = nodes.find(node => node.id === targetUser.email);

      if (targetNodeDatum) {
        // Select the node and update visuals
        updateNodeVisuals(targetUser.email);
        
        // Center and zoom on the node
        setTimeout(() => {
          zoomToNode(targetNodeDatum); 
        }, 150); // Increased delay slightly for stability

        // Show the profile modal for this user
        // Assuming targetUser from allUsers is sufficient for the initial modal display.
        showProfileModal(targetUser);
        
        // Ensure scroll handler is properly initialized for URL-opened popup
        setTimeout(() => {
          // Re-verify all elements are properly assigned
          const popupContainer = document.getElementById('popup-container');
          const popupContent = popupContainer?.querySelector('.popup');
          
          if (popupContainer && popupContent) {
            scrollableModalContentElement = popupContent;
            popupContainerElement = popupContainer;
            originalViewCommunityButtonDivElement = popupContent.querySelector('.view-community-btn-div');
            stickyOverlayButtonElement = document.getElementById('sticky-view-community-button');
            
            // Add scroll listener if not already added
            if (scrollableModalContentElement && !scrollableModalContentElement.hasScrollListener) {
              scrollableModalContentElement.addEventListener('scroll', handleModalScroll);
              scrollableModalContentElement.hasScrollListener = true;
            }
            
            // Initial scroll check
            handleModalScroll();
          }
        }, 150); 
        
        // Ensure the "Clear Filters" button reflects that a node is selected
        clearFiltersBtn.classList.add('active');
        clearFiltersBtn.style.display = 'block'; // Or 'none' if modal is open, as per showProfileModal

      } else {
        console.warn(`Deep link: Node data not found for user email: ${targetUser.email}`);
        currentProfileIdInUrl = null; // Reset if node not found
        updateNodeVisuals(null); // Reset visuals to default
      }
    } else {
      console.warn(`Deep link: User with ID "${profileIdFromUrl}" not found.`);
      currentProfileIdInUrl = null; // Reset if user not found
      // If user not found, ensure URL doesn't persist invalid profile ID if user navigates away and back
      history.replaceState(null, "Network", "/"); 
      updateNodeVisuals(null); // Reset visuals to default
    }
  } else {
    // No profile ID in URL, ensure visuals are default if not already set
    if (!activeClickedNodeId) { // Avoid overriding if a node was somehow selected before this point
        updateNodeVisuals(null);
    }
  }
  // --- END: New code for deep linking ---

  // Animated Placeholder Logic
  const searchInput = document.getElementById('network-search-input');
  const searchWrapper = document.querySelector('.network-search-wrapper');

  if (searchInput && searchWrapper) {
      const placeholderTexts = [
          "Search by name...",
          "by Keywords...",
          "Set Designer",
          "Discover New Artists",
          "Producer",
          "Photographer",
          "Video Editor"
      ];
      let placeholderIndex = 0;
      let placeholderInterval;

      const changePlaceholder = () => {
          const existingPlaceholders = searchWrapper.querySelectorAll('.placeholder-text');
          
          if (existingPlaceholders.length > 0) {
              existingPlaceholders.forEach((el, index) => {
                  // The last element is the one currently visible, so we animate it out.
                  if (index === existingPlaceholders.length - 1) {
                      el.classList.remove('fly-in');
                      el.classList.add('fly-out');
                      el.addEventListener('animationend', () => el.remove(), { once: true });
                  } else {
                      // Older, stuck placeholders are removed instantly.
                      el.remove();
                  }
              });
          }

          placeholderIndex = (placeholderIndex + 1) % placeholderTexts.length;
          const newPlaceholder = document.createElement('span');
          newPlaceholder.textContent = placeholderTexts[placeholderIndex];
          newPlaceholder.classList.add('placeholder-text', 'fly-in');
          searchWrapper.appendChild(newPlaceholder);
      };

      const startCycling = () => {
          stopCycling(); // Ensure no multiple intervals
          placeholderInterval = setInterval(changePlaceholder, 3500);
      };

      const stopCycling = () => {
          clearInterval(placeholderInterval);
          placeholderInterval = null;
      };

      // Pause and resume cycling when tab visibility changes
      document.addEventListener('visibilitychange', () => {
          // Only act if the user isn't currently interacting with the search bar
          if (document.activeElement !== searchInput && !searchInput.value) {
              if (document.hidden) {
                  stopCycling();
              } else {
                  // When we return to the tab, kick off a change immediately and restart the cycle
                  changePlaceholder();
                  startCycling();
              }
          }
      });

      // Initial setup
      const initialPlaceholder = document.createElement('span');
      initialPlaceholder.textContent = "Search...";
      initialPlaceholder.classList.add('placeholder-text');
      searchWrapper.appendChild(initialPlaceholder);

      searchInput.addEventListener('focus', () => {
          stopCycling();
          searchWrapper.classList.add('has-value-or-focus');
      });

      searchInput.addEventListener('blur', () => {
          if (!searchInput.value) {
              searchWrapper.classList.remove('has-value-or-focus');
              startCycling();
          }
      });

      searchInput.addEventListener('input', () => {
          if (searchInput.value) {
              searchWrapper.classList.add('has-value-or-focus');
          } else {
              // If a user clears the input while focused, we want the placeholder to remain hidden
              // The class will be removed on blur if the input is still empty
          }
      });

      setTimeout(() => {
          // Only start if user isn't already interacting and the tab is visible
          if (document.activeElement !== searchInput && !searchInput.value && !document.hidden) {
              changePlaceholder();
              startCycling();
          }
      }, 2500); // Initial delay
  }
});

// Add a soft click sound
let nodeClickAudio = document.getElementById('node-click-audio');
if (!nodeClickAudio) {
  nodeClickAudio = document.createElement('audio');
  nodeClickAudio.id = 'node-click-audio';
  nodeClickAudio.src = 'static/sounds/click-soft.mp3'; // You need to provide this file
  nodeClickAudio.preload = 'auto';
  document.body.appendChild(nodeClickAudio);
}

function playNodeClickSound() {
  if (nodeClickAudio) {
    nodeClickAudio.currentTime = 0;
    nodeClickAudio.play();
  }
}

function triggerHaptic() {
  if (window.navigator && window.navigator.vibrate) {
    window.navigator.vibrate(30);
  }
}

function showNodeRipple(nodeDatum) {
  // Get SVG and <g.network-container>
  const svg = d3.select('svg');
  const svgNode = svg.node();
  const g = svg.select('g.network-container').node();
  // Get node's position in SVG coordinates
  const pt = svgNode.createSVGPoint();
  pt.x = nodeDatum.x;
  pt.y = nodeDatum.y;
  const ctm = g.getScreenCTM();
  const screenPos = pt.matrixTransform(ctm);
  // Create ripple div
  const ripple = document.createElement('div');
  ripple.className = 'node-ripple';
  ripple.style.left = `${screenPos.x}px`;
  ripple.style.top = `${screenPos.y}px`;
  ripple.style.width = '32px';
  ripple.style.height = '32px';
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

// --- NOTIFICATION POPUP LOGIC ---
const notificationBellBtn = document.getElementById('notification-bell-btn');
const notificationPopupOverlay = document.getElementById('notification-popup-overlay');
const closeNotificationPopupBtn = document.getElementById('close-notification-popup');

async function showNotificationPopup() {
  if (notificationPopupOverlay) {
    notificationPopupOverlay.classList.add('visible');
  }
  
  // Mark unread notifications as read
  if (unreadNotificationIds.length > 0) {
    const user = window.networkFirebaseUtils.currentUser;
    if (user) {
        const idsToMarkAsRead = [...unreadNotificationIds];
        // Optimistically update UI
        unreadNotificationIds = [];
        updateNotificationBell();
        document.querySelectorAll('.notification-item.unread').forEach(item => {
            item.classList.remove('unread');
            item.querySelector('.unread-indicator')?.remove();
        });

        // Update in backend
        await window.networkFirebaseUtils.markNotificationsAsRead(user.email, idsToMarkAsRead);
    }
  }
}

function hideNotificationPopup() {
  if (notificationPopupOverlay) {
    notificationPopupOverlay.classList.remove('visible');
  }
}

if (notificationBellBtn) {
  notificationBellBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent click from bubbling to document if that closes other things
    showNotificationPopup();
  });
}

if (closeNotificationPopupBtn) {
  closeNotificationPopupBtn.addEventListener('click', hideNotificationPopup);
}

if (notificationPopupOverlay) {
  notificationPopupOverlay.addEventListener('click', (event) => {
    // Only close if the overlay itself (not content) is clicked
    if (event.target === notificationPopupOverlay) {
      hideNotificationPopup();
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && notificationPopupOverlay && notificationPopupOverlay.classList.contains('visible')) {
    hideNotificationPopup();
  }
});
// --- END NOTIFICATION POPUP LOGIC ---

async function loadUserNotifications() {
    const user = window.networkFirebaseUtils.currentUser;
    if (!user) return;

    userNotifications = await window.networkFirebaseUtils.getUserNotifications(user.email);
    unreadNotificationIds = userNotifications.filter(n => !n.read).map(n => n.id);

    // Also compute pending connection requests so the bell can reflect them
    await computePendingConnectionRequests();

    updateNotificationBell();
    renderNotifications();
}

function updateNotificationBell() {
    const bellBtn = document.getElementById('notification-bell-btn');
    if (!bellBtn) return;

    let indicator = bellBtn.querySelector('.notification-indicator');

    const hasUnread = unreadNotificationIds.length > 0;
    const hasPendingRequests = pendingConnectionRequests.length > 0;

    if (hasUnread || hasPendingRequests) {
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'notification-indicator';
            bellBtn.appendChild(indicator);
        }
        bellBtn.classList.add('has-notifications');
    } else {
        if (indicator) {
            indicator.remove();
        }
        bellBtn.classList.remove('has-notifications');
    }
}

function getCategoryIcon(category) {
    switch (category) {
        case 'KR News': return 'static/img/KRICON.png';
        case 'Connection Request': return 'static/img/community.svg';
        case 'Collaboration': return 'static/img/collabicon.png';
        case 'Update': return 'static/img/notification.svg';
        default: return 'static/img/notification.svg';
    }
}

function renderNotifications() {
    const popupContent = document.getElementById('notification-popup-content');
    if (!popupContent) return;

    let listContainer = popupContent.querySelector('.notification-list');
    if (!listContainer) {
        const p = popupContent.querySelector('p');
        if(p) p.remove();
        
        listContainer = document.createElement('div');
        listContainer.className = 'notification-list';
        popupContent.appendChild(listContainer);
    }
    // Build Connection Requests section first
    const connectionRequestsSection = renderConnectionRequestsSection();

    // Then the regular notification items
    const notificationItemsHtml = userNotifications.map(n => {
        const isUnread = unreadNotificationIds.includes(n.id);
        const imageHtml = n.imageUrl ? `<img src="${n.imageUrl}" alt="Notification image" class="notification-image">` : '';
        const linkHtml = n.link ? `<a href="${n.link}" target="_blank" class="notification-view-more">View More</a>` : '';
        const date = n.timestamp?.toDate ? n.timestamp.toDate().toLocaleDateString() : 'Just now';

        return `
            <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${n.id}">
                ${isUnread ? '<span class="unread-indicator"></span>' : ''}
                <div class="notification-header">
                    <img src="${getCategoryIcon(n.category)}" class="notification-category-icon" alt="${n.category}">
                    <span class="notification-category">${n.category}</span>
                    <span class="notification-timestamp">${date}</span>
                </div>
                <div class="notification-content">
                    <div class="notification-text">
                        <h4 class="notification-title">${n.title}</h4>
                        <p class="notification-body">${n.body}</p>
                    </div>
                    ${imageHtml}
                </div>
                ${linkHtml}
            </div>
        `;
    }).join('');

    const hasAny = (pendingConnectionRequests.length > 0) || (userNotifications.length > 0);
    if (!hasAny) {
        listContainer.innerHTML = '<p class="no-notifications">You have no notifications.</p>';
        return;
    }

    listContainer.innerHTML = connectionRequestsSection + notificationItemsHtml;
}

// --- Connection Requests Computation & Rendering ---
async function computePendingConnectionRequests() {
    const user = window.networkFirebaseUtils.currentUser;
    if (!user) {
        pendingConnectionRequests = [];
        return;
    }
    // Fetch all users and my profile
    const [allUsers, myProfile] = await Promise.all([
        window.networkFirebaseUtils.fetchAllUsers(),
        window.networkFirebaseUtils.getUserProfile(user.email)
    ]);

    const myConnections = Array.isArray(myProfile?.connections) ? myProfile.connections : [];
    const dismissed = Array.isArray(myProfile?.dismissedConnectionRequests) ? myProfile.dismissedConnectionRequests : [];

    // Users who added me, but I didn't add back, and I haven't dismissed
    pendingConnectionRequests = allUsers.filter(u => {
        if (u.email === user.email) return false;
        const theirConnections = Array.isArray(u.connections) ? u.connections : [];
        return theirConnections.includes(user.email)
            && !myConnections.includes(u.email)
            && !dismissed.includes(u.email);
    });
}

function renderConnectionRequestsSection() {
    if (!pendingConnectionRequests || pendingConnectionRequests.length === 0) return '';

    const count = pendingConnectionRequests.length;
    const header = `
        <div class="connection-requests-header">
            <h3>Connection Requests (${count})</h3>
            <p class="connection-requests-note">only connect with users if you have worked with them already</p>
        </div>
    `;

    const items = pendingConnectionRequests.map(u => {
        const avatar = u.avatar || 'static/img/default-avatar.png';
        const title = u.title || u.email.split('@')[0];
        const viewLink = `index.html?profile=${encodeURIComponent(u.email)}`;
        return `
            <div class="notification-item connection-request" data-email="${u.email}">
                <div class="notification-header">
                    <img src="${getCategoryIcon('Connection Request')}" class="notification-category-icon" alt="Connection Request">
                    <span class="notification-category">Connection Request</span>
                </div>
                <div class="notification-content">
                    <img src="${avatar}" alt="${title}" class="notification-image">
                    <div class="notification-text">
                        <h4 class="notification-title">${title}</h4>
                        <p class="notification-body">wants to connect with you</p>
                        <a href="${viewLink}" class="notification-view-more">View Profile</a>
                    </div>
                </div>
                <div class="connection-request-actions">
                    <button class="connect-btn" data-email="${u.email}">Connect</button>
                    <button class="decline-btn" data-email="${u.email}">Decline</button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event handlers after render on next microtask
    queueMicrotask(() => {
        document.querySelectorAll('.connection-request .connect-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                await window.networkFirebaseUtils.addConnectionForCurrentUser(email);
                // Remove from pending list and re-render
                pendingConnectionRequests = pendingConnectionRequests.filter(u => u.email !== email);
                updateNotificationBell();
                renderNotifications();
                showConnectedToast();
            });
        });
        document.querySelectorAll('.connection-request .decline-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                await window.networkFirebaseUtils.dismissConnectionRequestForCurrentUser(email);
                // Remove from pending list and re-render
                pendingConnectionRequests = pendingConnectionRequests.filter(u => u.email !== email);
                updateNotificationBell();
                renderNotifications();
            });
        });
    });

    return header + items;
}

function showConnectedToast() {
    // Remove any existing toast first
    const existing = document.querySelector('.connected-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'connected-toast';
    toast.textContent = 'Connected';
    document.body.appendChild(toast);

    // Force reflow then add visible class for transition
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 1500);
}

// --- Vision Mode Functions ---

function updateVisionCircleSize() {
    if (!isVisionModeActive || !visionCircle) return;
    
    const transform = d3.zoomTransform(d3.select('svg').node());
    const scale = transform.k;
    
    const baseSize = 250; // Base diameter in pixels
    const maxGrowth = 400; // Maximum amount the circle can grow
    const scaleFactor = 0.4;

    let growth = (scale - 1) * baseSize * scaleFactor;
    growth = Math.max(0, Math.min(growth, maxGrowth));

    const newSize = baseSize + growth;

    visionCircle.style.width = `${newSize}px`;
    visionCircle.style.height = `${newSize}px`;
    
    // The CSS uses transform: translate(-50%, -50%) for centering, so we don't need margins.
    // The animation also uses transform, so we need to preserve the rotate part if it exists.
    const currentTransform = window.getComputedStyle(visionCircle).transform;
    let rotation = '';
    if (currentTransform && currentTransform !== 'none') {
        const matrix = new DOMMatrix(currentTransform);
        // This is a simplification; extracting pure rotation from a 2D matrix is complex.
        // Assuming the animation is a simple 2D rotation.
        const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
        if (angle !== 0) {
            rotation = `rotate(${angle}deg)`;
        }
    }
    visionCircle.style.transform = `translate(-50%, -50%) ${rotation}`;
}

function toggleVisionMode() {
    isVisionModeActive = !isVisionModeActive;
    visionCircle.classList.toggle('hidden', !isVisionModeActive);
    visionBtn.classList.toggle('active', isVisionModeActive);

    if (isVisionModeActive) {
        updateVisionCircleSize(); // Set initial size based on current zoom
        simulation.force("magnify", magnifyingForce); // Add the force
        updateVisionMode();
    } else {
        simulation.force("magnify", null); // Remove the force
        // Clear all vision media when turning off
        nodesInVision.forEach(nodeId => hideNodeMedia(nodeId));
        nodesInVision.clear();
        // Reset node sizes
        updateNodeVisuals(activeClickedNodeId, new Map());
        // Reset vision circle inline styles to revert to CSS defaults
        visionCircle.style.width = '';
        visionCircle.style.height = '';
        visionCircle.style.transform = '';
    }
    // Reheat the simulation to apply/remove the force
    simulation.alpha(0.3).restart();
}

function updateVisionMode() {
    if (!isVisionModeActive || !visionCircle) return;

    const rect = visionCircle.getBoundingClientRect();
    const circleRadius = rect.width / 2;
    const circleCenter = { x: rect.left + circleRadius, y: rect.top + circleRadius };

    const svgNode = d3.select('svg').node();
    const networkContainerG = d3.select('g.network-container').node();
    if (!svgNode || !networkContainerG) return;
    const transform = networkContainerG.getScreenCTM();

    const nodesToMagnifyMap = new Map();

    d3.selectAll('.node').each(function(d) {
        const point = svgNode.createSVGPoint();
        point.x = d.x;
        point.y = d.y;
        
        const screenPoint = point.matrixTransform(transform);
        
        const dx = screenPoint.x - circleCenter.x;
        const dy = screenPoint.y - circleCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= circleRadius) {
            nodesToMagnifyMap.set(d.id, distance); // Store distance from center
            if (!nodesInVision.has(d.id)) {
                // Node entered the circle
                showNodeMedia(d);
            }
        }
    });

    // This keeps node sizing logic in one place
    updateNodeVisuals(activeClickedNodeId, nodesToMagnifyMap);

    // Find nodes that left the circle
    const nodesThatLeft = [...nodesInVision].filter(nodeId => !nodesToMagnifyMap.has(nodeId));
    nodesThatLeft.forEach(nodeId => {
        hideNodeMedia(nodeId);
    });

    // Update the master set
    nodesInVision.clear();
    nodesToMagnifyMap.forEach((_, nodeId) => nodesInVision.add(nodeId));
}

function magnifyingForce(alpha) {
    if (!isVisionModeActive || !visionCircle) return;

    // Get circle properties in screen space
    const rect = visionCircle.getBoundingClientRect();
    const circleRadius = rect.width / 2;
    const circleCenterScreen = { x: rect.left + circleRadius, y: rect.top + circleRadius };

    // Get the D3 zoom transform and its inverse
    const transform = d3.zoomTransform(d3.select('svg').node());
    const [invertedX, invertedY] = transform.invert([circleCenterScreen.x, circleCenterScreen.y]);
    
    // The center of the magnifying glass in the simulation's coordinate space
    const circleCenterSim = { x: invertedX, y: invertedY };
    // The radius, scaled to simulation space
    const radiusSim = circleRadius / transform.k;

    const strength = 0.05; // Force strength - tune this value

    for (const node of nodes) {
        const dx = node.x - circleCenterSim.x;
        const dy = node.y - circleCenterSim.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < radiusSim) {
            // Node is inside the circle, apply a force towards the center
            node.vx -= dx * strength * alpha;
            node.vy -= dy * strength * alpha;
        }
    }
}

function showNodeMedia(nodeData) {
    const user = allUsers.find(u => u.email === nodeData.id);
    if (!user || !user.blocks || user.blocks.length === 0) return;

    const mediaBlocks = user.blocks.flatMap(block => {
        if (block.type === 'carousel' && Array.isArray(block.slides)) {
            return block.slides.filter(slide => slide.icon);
        }
        return block.icon ? [block] : [];
    }).slice(0, 8); // Limit to max 8 media items per node for clarity

    if (mediaBlocks.length === 0) return;

    const parentGroup = visionMediaGroup.append('g')
        .attr('class', 'vision-media-group')
        .attr('data-node-id', nodeData.id)
        .style('opacity', 0); // Start transparent

    const satelliteDistance = 50;
    const imageSize = 25;

    mediaBlocks.forEach((block, i) => {
        const angle = (i / mediaBlocks.length) * 2 * Math.PI;
        const finalX = nodeData.x + satelliteDistance * Math.cos(angle);
        const finalY = nodeData.y + satelliteDistance * Math.sin(angle);

        // Link from parent to satellite - start at center
        const link = parentGroup.append('line')
            .attr('class', 'media-link')
            .attr('x1', nodeData.x)
            .attr('y1', nodeData.y)
            .attr('x2', nodeData.x)
            .attr('y2', nodeData.y);
        
        // Satellite image - start at center
        const image = parentGroup.append('image')
            .attr('class', 'vision-media-image')
            .attr('href', block.icon)
            .attr('x', nodeData.x - imageSize / 2)
            .attr('y', nodeData.y - imageSize / 2)
            .attr('width', imageSize)
            .attr('height', imageSize)
            .attr('clip-path', 'circle(50%)');

        // Clickable link border - start at center
        const border = parentGroup.append('a')
            .attr('href', block.link || '#')
            .attr('target', '_blank')
            .attr('rel', 'noopener noreferrer')
            .append('circle')
            .attr('class', 'media-image-border')
            .attr('cx', nodeData.x)
            .attr('cy', nodeData.y)
            .attr('r', imageSize / 2)
            .style('cursor', block.link ? 'pointer' : 'default');

        // Animate elements to their final positions
        link.transition().duration(400).attr('x2', finalX).attr('y2', finalY);
        image.transition().duration(400).attr('x', finalX - imageSize / 2).attr('y', finalY - imageSize / 2);
        border.transition().duration(400).attr('cx', finalX).attr('cy', finalY);
    });
    
    // Fade in the whole group
    parentGroup.transition().duration(400).style('opacity', 1);
}

function hideNodeMedia(nodeId) {
    const group = visionMediaGroup.selectAll(`.vision-media-group[data-node-id="${nodeId}"]`);
    
    if (!group.empty()) {
        group.transition().duration(300)
            .style('opacity', 0)
            .on('end', function() {
                d3.select(this).remove();
            });
    }
}

if (visionBtn) {
    visionBtn.addEventListener('click', toggleVisionMode);
}

// NEW: Function to calculate magnification based on panning/browsing
function calculatePanningMagnification(transform) {
    panningMagnifiedNodes.clear();
    const svgNode = d3.select('svg').node();
    if (!svgNode) return;

    const magnifyRadius = 200; // Radius of the effect in pixels.
    
    // Center of the visible SVG area
    const centerX = svgNode.clientWidth / 2;
    const centerY = fixedHeaderHeight + (svgNode.clientHeight - fixedHeaderHeight) / 2;

    d3.selectAll('.node').each(function(d) {
        const screenPoint = transform.apply([d.x, d.y]);
        const dx = screenPoint[0] - centerX;
        const dy = screenPoint[1] - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= magnifyRadius) {
            panningMagnifiedNodes.set(d.id, distance);
        }
    });
}

// END Vision Mode Functions
// ---

function closeProfileModal() {
    if (profileModal) {
        profileModal.style.display = 'none';
        // Reset URL
        history.pushState(null, "Network", "index.html");
    }
}

// ... existing code ...

// Reveal UI elements (except network web) in staggered fade
function revealUIStaggered() {
  const elements = [
    document.querySelector('.kr-navbar'),
    document.getElementById('fixed-top-logo'),
    document.getElementById('network-searchbar-container'),
    document.getElementById('notification-bell-btn'),
    document.getElementById('vision-mode-controls'),
    document.getElementById('join-kr-button-fixed'),
    
    document.querySelector('.kr-mobile-navbar-container'),
    document.getElementById('hamburger-btn'),
    document.getElementById('logged-in-user-status')
  ].filter(Boolean);

  elements.forEach((el, idx) => {
    setTimeout(() => {
      el.classList.remove('fade-in-hidden');
      el.classList.add('fade-in-show');
    }, idx * 100);
  });
}