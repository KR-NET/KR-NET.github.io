# Profile Posts → Global Blocks → Discover Feed: System Flow Diagram

This document maps how content flows from a user's profile post to global blocks and into the Discover feed.

---

## High-Level Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  PROFILE PAGE   │────▶│  FIREBASE STORE   │────▶│  DISCOVER / FEEDS    │
│  (profile.html) │     │  (dual write)     │     │  (read from global)  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

---

## Detailed System Diagram

```mermaid
flowchart TB
    subgraph PROFILE["1. PROFILE PAGE (profile.html + profile-app.js)"]
        A[User clicks Add Block]
        B[Block Modal opens]
        C[User fills: title, desc, link, icon/image]
        D[Block types: default, large-image, carousel, embed]
        E[User clicks Save Block]
        A --> B --> C --> D --> E
    end

    subgraph SAVE["2. SAVE HANDLER (profile-app.js save-block click)"]
        F[Validate URLs]
        G[Build block object]
        H[Compress & upload images → Firebase Storage]
        I[Add/update block in blocks array]
        J[renderBlocks - update UI]
        K[saveUserData email, blocks]
        L[upsertGlobalBlock email, block]
        M[saveUserData again - persist globalId]
        E --> F --> G --> H --> I --> J --> K --> L --> M
    end

    subgraph FIRESTORE["3. FIREBASE FIRESTORE"]
        subgraph USERS["users/{email}"]
            U1[title, bio, avatar, practices]
            U2[connections]
            U3["blocks: [{type, title, desc, link, icon, slides?, globalId, createdAt}]"]
        end
        
        subgraph GLOBAL["globalBlocks/{globalId}"]
            G1["globalId = safeEmail_timestamp"]
            G2[owner, createdAt, title, desc, link, icon]
            G3[type, slides, provider, embedUrl]
            G4[upvotes, downvotes, score]
        end
        
        subgraph SUBCOLS["Subcollections"]
            V["globalBlocks/{id}/votes/{userEmail}"]
            C["globalBlocks/{id}/comments"]
        end
    end

    K --> USERS
    L --> GLOBAL
    GLOBAL --> V
    GLOBAL --> C

    subgraph REALTIME["4. REAL-TIME SYNC (profile-firebase-setup.js)"]
        R1[onSnapshot users/email]
        R2[Doc change → renderBlocks data.blocks]
        R1 --> R2
    end

    USERS --> R1

    subgraph CONSUMERS["5. CONSUMERS (read from globalBlocks)"]
        subgraph DISCOVER["Discover Feed (discover-feed.js)"]
            D1[initDiscoverFeed - on JOIN popup when logged in]
            D2[createSortQuery: orderBy createdAt or score]
            D3[getDocs globalBlocks + time filter]
            D4[renderBlockCard for each block]
            D5[Vote: voteOnBlock → votes subcol]
            D6[Comment: addComment → comments subcol]
            D1 --> D2 --> D3 --> D4
            D4 --> D5
            D4 --> D6
        end
        
        subgraph WELCOME["Welcome Page (welcome.html)"]
            W1[loadRecentPosts]
            W2[Query globalBlocks orderBy createdAt]
            W3[Filter: type === large-image only]
            W4[Show slideshow of 20 posts]
            W1 --> W2 --> W3 --> W4
        end
        
        subgraph NETWORK["Network (network-app.js)"]
            N1[fetchAllUsers - users collection]
            N2[User docs include blocks array]
            N3[showProfileModal - renders user.blocks]
            N4[showNodeMedia - blocks for vision mode satellites]
            N1 --> N2 --> N3
            N2 --> N4
        end
        
        subgraph ADMIN["Admin (admin-app.js)"]
            A1[getGlobalBlocks - paginated]
            A2[Render blocks list]
            A1 --> A2
        end
    end

    GLOBAL --> D2
    GLOBAL --> W2
    USERS --> N1
    GLOBAL --> A1

    subgraph DELETE["6. DELETE FLOW (profile-app.js deleteBlock)"]
        DEL1[User clicks Delete]
        DEL2[deleteImage for block icon/slides]
        DEL3[deleteGlobalBlock globalId]
        DEL4[splice from blocks array]
        DEL5[saveUserData blocks]
        DEL1 --> DEL2 --> DEL3 --> DEL4 --> DEL5
    end

    GLOBAL -.->|deleteDoc| DEL3
```

---

## Data Flow Summary

| Step | Action | Location | Firebase |
|------|--------|----------|----------|
| 1 | User creates block on profile | profile.html | — |
| 2 | Images uploaded | profile-app.js | Storage: `blocks/{email}/...` |
| 3 | Block saved to user doc | profile-firebase-setup.js | `users/{email}` → `blocks` array |
| 4 | Block upserted to global | profile-firebase-setup.js | `globalBlocks/{globalId}` |
| 5 | Real-time listener updates UI | profile-firebase-setup.js | onSnapshot `users/{email}` |
| 6 | Discover feed queries | discover-feed.js | `globalBlocks` collection |
| 7 | Welcome slideshow queries | welcome.html | `globalBlocks` (large-image only) |
| 8 | Network profile modal | network-app.js | `users` (includes blocks) |
| 9 | Delete block | profile-app.js | Delete from both `users.blocks` and `globalBlocks` |

---

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `saveUserData(email, { blocks })` | profile-firebase-setup.js | Merge blocks into users doc |
| `upsertGlobalBlock(ownerEmail, block)` | profile-firebase-setup.js | Create/update globalBlocks doc |
| `generateGlobalBlockId(email, createdAt)` | profile-firebase-setup.js | `safeEmail_timestamp` |
| `deleteGlobalBlock(globalId)` | profile-firebase-setup.js | Remove from globalBlocks |
| `setupUserDataListener(email)` | profile-firebase-setup.js | Real-time sync for profile |
| `createSortQuery(sort, timeFilter)` | discover-feed.js | Query globalBlocks (newest/votes) |
| `renderBlockCard(block, container)` | discover-feed.js | Render block in Discover |
| `voteOnBlock(blockId, value)` | discover-feed.js | Up/down vote |
| `addComment(blockId, text)` | discover-feed.js | Add comment |
| `fetchAllUsers()` | network-firebase-setup.js | Get all users (with blocks) |

---

## Block Types

| Type | Profile display | Discover display | Welcome slideshow |
|------|-----------------|------------------|-------------------|
| `default` | Icon + text | Icon + text | No |
| `large-image` | Large image + text | Large image + text | **Yes** |
| `carousel` | Multi-slide | Carousel | No |
| `embed` | YouTube/Spotify iframe | YouTube/Spotify iframe | No |

---

## Firebase Collections Structure

```
users/
  {email}/
    id, title, bio, avatar, practices, connections, ...
    blocks: [
      { type, title, desc, link, icon, slides?, globalId, createdAt }
    ]

globalBlocks/
  {globalId}/   ← globalId = safeEmail_timestamp
    owner, createdAt, title, desc, link, icon, type, slides
    provider?, embedUrl?   (for embeds)
    upvotes, downvotes, score
    votes/{userEmail}      (subcollection)
    comments/              (subcollection)
```
