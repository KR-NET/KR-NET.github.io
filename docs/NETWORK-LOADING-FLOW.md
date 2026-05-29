# Network Page Load: System Flow Diagram

This document maps how data is fetched, loaded, and computed from Firestore to everything the user sees on `index.html` (the Network page).

---

## High-Level Flow

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│  PAGE LOAD          │────▶│  FIREBASE FIRESTORE   │────▶│  USER SEES               │
│  (index.html)       │     │  users collection    │     │  Network graph + UI      │
└─────────────────────┘     └──────────────────────┘     └─────────────────────────┘
         │                              ▲
         │                              │
         ▼                              │
┌─────────────────────┐                 │
│  LOADING SCREEN     │  (optional)     │
│  Globe / GIF        │  sessionStorage cache
└─────────────────────┘  from welcome.html
```

---

## Detailed System Diagram

```mermaid
flowchart TB
    subgraph PAGE["1. PAGE LOAD (index.html)"]
        P1[DOMContentLoaded: fade-in-hidden on navbar, searchbar, etc.]
        P2[Auth redirect check: if not from welcome/iframe/params → redirect to welcome.html]
        P3[Load network-firebase-setup.js]
        P4[Load network-app.js]
        P5[Load network-intro-globe.js]
        P6[window.load → initNetwork]
        P1 --> P2 --> P3 --> P4 --> P5 --> P6
    end

    subgraph LOADING["2. LOADING SCREEN (network-intro-globe.js)"]
        L1[initNetworkIntroGlobe - DOMContentLoaded]
        L2[Desktop: 3D globe + GeoJSON via geoJsonCache sessionStorage]
        L3[Mobile: skip 3D, show GIF via .mobile-globe class]
        L4[Loading text: 'Loading profile.' or 'Loading network.' from ?link param]
        L5[Safety: force-hide after 15s if still visible]
        L1 --> L2
        L1 --> L3
        L2 --> L4 --> L5
    end

    subgraph FETCH["3. FETCH USERS (network-firebase-setup.js fetchAllUsers)"]
        F1[Check sessionStorage kr_users_cache + kr_users_cache_time]
        F2[If cache fresh < 5 min → return cached]
        F3[Else: getDocs collection db 'users']
        F4[Map docs to { email: doc.id, ...doc.data }]
        F1 --> F2
        F1 --> F3 --> F4
    end

    subgraph WELCOME_CACHE["Optional: welcome.html pre-cache"]
        W1[getUsersDocs called on welcome page]
        W2[sessionStorage.setItem kr_users_cache, kr_users_cache_time]
        W1 --> W2
    end

    subgraph INIT["4. INIT NETWORK (network-app.js initNetwork)"]
        I1[allUsers = fetchAllUsers]
        I2[hideNetworkLoadingScreen]
        I3[revealUIStaggered - fade in navbar, searchbar, bell, etc.]
        I4[Filter: visibleUsers = allUsers with non-empty bio]
        I5[nodes = visibleUsers → id, title, avatar]
        I6[links = mutual connections between visibleUsers]
        I7[nodeDegrees for force layout]
        I8[D3 forceSimulation: link, charge, center, collide]
        I9[Create SVG: links, nodes, zoom, drag]
        I10[simulation.on tick → update link/node positions]
        I1 --> I2 --> I3 --> I4 --> I5 --> I6 --> I7 --> I8 --> I9 --> I10
    end

    subgraph AUTH["5. AUTH STATE (network-firebase-setup.js onAuthStateChanged)"]
        A1[user signed in?]
        A2[getUserProfile user.email → users/{email}]
        A3[Update logged-in-user-status: avatar, title]
        A4[loadInitialData user - placeholder]
        A5[Show locate-me-btn if user has node]
        A1 --> A2 --> A3 --> A4 --> A5
    end

    subgraph POST_INIT["6. POST-INIT (window.load)"]
        PO1[updateNodeVisuals null - default node sizes]
        PO2[loadUserNotifications - getUserNotifications, computePendingConnectionRequests]
        PO3[Deep link: ?link=slug → find user, zoomToNode, showProfileModal]
        PO1 --> PO2 --> PO3
    end

    subgraph USER_INTERACT["7. USER INTERACTIONS → DATA"]
        subgraph NODE_CLICK["Node click"]
            NC1[updateNodeVisuals nodeId - BFS depths 0,1,2]
            NC2[zoomToNode - center + scale]
            NC3[getUserProfile nodeId - users/{email}]
            NC4[showProfileModal userProfile]
            NC1 --> NC2 --> NC3 --> NC4
        end
        
        subgraph SEARCH["Search input"]
            S1[searchTerm = input.value debounced]
            S2[highlightMatchingNodes - match title, email, bio, practices, blocks]
            S3[updateNodeVisuals - highlight/dim]
            S1 --> S2 --> S3
        end
        
        subgraph FILTER["Practice filter"]
            PF1[selectedPractices from dropdown]
            PF2[renderFilterChips]
            PF3[updatePracticeLinks - force for practice-only links]
            PF4[updateNodeVisuals]
            PF1 --> PF2 --> PF3 --> PF4
        end
        
        subgraph PROFILE_MODAL["Profile modal"]
            PM1[user.avatar, user.title, user.bio]
            PM2[user.blocks - from getUserProfile]
            PM2b[Block collaborators: accepted only, from allUsers + block.collaborators]
            PM3[getUserProfile myProfile - check if already connected]
            PM4[Connect → addConnectionForCurrentUser]
            PM1 --> PM2 --> PM2b --> PM3 --> PM4
        end
    end

    subgraph FIRESTORE["3. FIREBASE FIRESTORE"]
        USERS["users/{email}"]
        USERS_FIELDS["id, title, bio, avatar, practices, connections, blocks, ..."]
    end

    FETCH --> USERS
    WELCOME_CACHE -.->|pre-warm| FETCH
    INIT --> FETCH
    LOADING -.->|hide when done| INIT
    AUTH --> USERS
    AUTH --> INIT
    NODE_CLICK --> USERS
    PROFILE_MODAL --> USERS
    USERS --> USERS_FIELDS
```

---

## Data Flow Summary

*Chronological order as found when loading the site (user coming from welcome.html):*

| Step | Action | Location | Firebase / Cache |
|------|--------|----------|------------------|
| 1 | welcome.html pre-caches users *(if user came from welcome)* | welcome.html | sessionStorage kr_users_cache, kr_users_cache_time |
| 2 | Page loads, scripts load | index.html | — |
| 3 | Auth redirect check | index.html (inline) | sessionStorage kr_from_welcome |
| 4 | Loading screen shown | network-intro-globe.js (DOMContentLoaded) | GeoJSON cache (sessionStorage) |
| 5 | Auth: getUserProfile *(when auth resolves)* | network-firebase-setup.js | users/{email} |
| 6 | window.load → initNetwork | network-app.js | — |
| 7 | fetchAllUsers | network-firebase-setup.js | sessionStorage kr_users_cache or getDocs users |
| 8 | **If ?link=slug:** find user, hide loading, reveal UI, showProfileModal *(profile popup shows immediately)* | network-app.js | allUsers (find by slug) |
| 9 | Filter visible users (bio), compute nodes + links, D3 simulation + SVG | network-app.js | — |
| 10 | hideNetworkLoadingScreen, revealUIStaggered *(or already done in step 8)* | network-intro-globe.js, network-app.js | — |
| 11 | updateNodeVisuals(null) or targetUser.email | network-app.js | — |
| 12 | loadUserNotifications | network-app.js | users/{email}/notifications |
| 13 | **If ?link=slug:** zoomToNode, clear filters *(graph now ready)* | network-app.js | — |
| — | *User interactions (after load):* | | |
| 14 | Node click: getUserProfile | network-app.js | users/{email} |
| 15 | Search/filter: highlight | network-app.js | allUsers in memory |
| 16 | Connect: addConnection | network-firebase-setup.js | users/{email} connections |

---

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `fetchAllUsers()` | network-firebase-setup.js | Get all users (cache or Firestore) |
| `getUserProfile(email)` | network-firebase-setup.js | Get single user doc users/{email} |
| `initNetwork()` | network-app.js | Fetch users, build nodes/links, D3 simulation |
| `hideNetworkLoadingScreen()` | network-intro-globe.js | Hide loading screen, zoom-out animation |
| `updateNodeVisuals(selectedNodeId, nodesToMagnify)` | network-app.js | BFS depths, search/filter highlight, dimming |
| `showProfileModal(user)` | network-app.js | Render profile popup from user object |
| `highlightMatchingNodes()` | network-app.js | Search + filter → updateNodeVisuals |
| `renderFilterChips()` | network-app.js | Render selected practice chips |
| `loadUserNotifications()` | network-app.js | getUserNotifications + computePendingConnectionRequests |
| `revealUIStaggered()` | network-app.js | Fade in navbar, searchbar, bell, etc. |

---

## Data Sources for What User Sees

| UI Element | Data Source | When Fetched |
|------------|-------------|--------------|
| **Network graph nodes** | allUsers (filtered by bio) | initNetwork → fetchAllUsers |
| **Network graph links** | allUsers.connections (mutual) | initNetwork (computed) |
| **Node avatars** | user.avatar | From allUsers (nodes) |
| **Node labels** | user.title | From allUsers (nodes) |
| **Profile modal** | getUserProfile | On node click |
| **Profile modal (from ?link=slug)** | allUsers (find by slug) | After initNetwork, deep link processing |
| **Logged-in status** | getUserProfile | onAuthStateChanged |
| **Notifications** | getUserNotifications | After initNetwork |
| **Connection requests** | allUsers + getUserProfile | computePendingConnectionRequests |
| **Collaboration requests** | allUsers + getUserProfile | computePendingCollaborationRequests |
| **Block collaborators** | block.collaborators + allUsers (collaborations) | showProfileModal: accepted collaborators at top of block |
| **Search highlight** | allUsers (title, bio, practices, blocks) | On input (debounced) |
| **Practice filter** | allUsers.practices | On filter select |
| **Locate me** | nodes (user.email) | updateLocateButtonVisibility |

---

## Firebase Collections Used

```
users/
  {email}/   ← doc id = email
    id                    (number, assigned on first sign-in)
    email                 (string)
    createdAt             (ISO string)
    title                 (string, display name)
    bio                   (string, max 200 chars)
    avatar                (string, Firebase Storage URL)
    instagram             (string, social URL)
    youtube               (string, social URL)
    tiktok                (string, social URL)
    practices             (array of strings, e.g. ["3D", "Film"])
    connections           (array of email strings)
    dismissedConnectionRequests  (array of email strings)
    collaborations        (array of block globalId strings - blocks user accepted as collaborator)
    dismissedCollaborationRequests  (array of block globalId strings)
    blocks                (array of block objects, see below)
    
    notifications/        ← subcollection
      {docId}/
        title             (string)
        body              (string)
        category          (string, e.g. "KR News", "Connection Request")
        imageUrl          (string or null)
        link              (string or null)
        timestamp         (serverTimestamp)
        read              (boolean)
        logId             (string, links to sentNotifications doc)

Block object (in users.blocks array):
  type                   ("default" | "large-image" | "carousel" | "embed")
  title                  (string)
  desc                   (string)
  link                   (string)
  icon                   (string, image URL)
  slides                 (array, for carousel only; each: { title, desc, link, icon })
  globalId               (string, safeEmail_timestamp)
  createdAt              (ISO string)
  provider               (string or null, for embed: "youtube" | "spotify")
  embedUrl               (string or null, for embed)
  collaborators          (array of email strings - invited collaborators; shown only if accepted)
```

---

## Cache Flow (welcome → index)

```
welcome.html
  └─ getUsersDocs() called (e.g. loadKRCreatives, loadNetworkStats)
       └─ getDocs(collection(db, 'users'))
       └─ sessionStorage.setItem('kr_users_cache', JSON.stringify(users))
       └─ sessionStorage.setItem('kr_users_cache_time', Date.now())

User clicks "Explore the Network" → index.html
  └─ initNetwork() → fetchAllUsers()
       └─ sessionStorage.getItem('kr_users_cache') → if age < 5 min, return cached
       └─ Else: getDocs(collection(db, 'users'))
```

---

## Optimization: Early Profile Display (?link=slug)

When the URL has `?link=slug`, the profile popup is shown **immediately after fetchAllUsers** (step 8), before the graph is built. The user sees the profile overlay right away; the network graph, zoom-to-node, and notifications load in the background. This avoids waiting for D3 simulation, node layout, and loadUserNotifications before showing the profile.

---

## Load Order (Scripts)

1. `network-firebase-setup.js` (Firebase auth + Firestore)
2. Auth redirect check (inline script)
3. `network-app.js` (main network logic)
4. `network-intro-globe.js` (loading screen 3D globe)
5. `window.addEventListener('load', …)` → `initNetwork()` + post-init
