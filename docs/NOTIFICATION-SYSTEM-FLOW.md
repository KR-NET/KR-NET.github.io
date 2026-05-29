# Notification System: System Flow Diagram

This document maps how notifications flow through the KR Network—from admin broadcast, connection requests, and user display.

---

## High-Level Flow

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│  ADMIN (admin.html) │────▶│  FIREBASE FIRESTORE       │────▶│  NETWORK (index.html)   │
│  Send notification  │     │  sentNotifications +     │     │  Bell + popup display   │
└─────────────────────┘     │  users/{email}/notif...   │     └─────────────────────────┘
                           └──────────────────────────┘
                                    ▲
┌─────────────────────┐             │
│  CONNECTION REQUEST │─────────────┘
│  (Network profile   │  users/{email}.connections
│   Connect button)   │  (computed, not stored in notifications)
└─────────────────────┘
                                    ▲
┌─────────────────────┐             │
│ COLLABORATION REQ   │─────────────┘
│  (Profile block     │  users/{email}.blocks[].collaborators
│   modal: invite     │  + collaborations, dismissedCollaborationRequests
│   collaborators)    │  (computed, not stored in notifications)
└─────────────────────┘
```

---

## Detailed System Diagram

```mermaid
flowchart TB
    subgraph ADMIN["1. ADMIN SEND (admin.html + admin-app.js)"]
        A1[Admin fills form: title, body, category]
        A2[Optional: imageUrl, link]
        A3[Target: All Users or specific emails]
        A4[Submit → sendNotifications or updateSentNotification]
        A1 --> A2 --> A3 --> A4
    end

    subgraph SEND["2. SEND HANDLER (collab-firebase-setup.js sendNotifications)"]
        S1[isAdmin check]
        S2[addDoc sentNotifications - log entry]
        S3[target === 'all' ? getAllUsers : use targets array]
        S4[Batch write 499 users at a time]
        S5[For each email: doc users/email/notifications]
        S6[Set: title, body, category, imageUrl, link, timestamp, read:false, logId]
        A4 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6
    end

    subgraph FIRESTORE["3. FIREBASE FIRESTORE"]
        subgraph SENT["sentNotifications (log)"]
            SN1[id, title, body, category, imageUrl, link]
            SN2[target: 'all' or array of emails]
            SN3[sentAt]
        end
        
        subgraph USER_NOTIF["users/{email}/notifications"]
            UN1[title, body, category, imageUrl, link]
            UN2[timestamp, read, logId]
        end
        
        subgraph USERS["users/{email}"]
            U1[connections: [...]]
            U2[dismissedConnectionRequests: [...]]
            U3[collaborations: [block globalIds]]
            U4[dismissedCollaborationRequests: [block globalIds]]
        end
    end

    S2 --> SENT
    S6 --> USER_NOTIF

    subgraph CONN_REQ["4. CONNECTION REQUEST FLOW (no Firestore notifications)"]
        C1[User A clicks Connect on User B profile]
        C2[addConnectionForCurrentUser B.email]
        C3[updateDoc users/A: connections arrayUnion B]
        C4[User B: computePendingConnectionRequests]
        C5[Find users where: theirConnections includes B AND B.connections excludes them AND not dismissed]
        C6[Render in notification popup as Connection Requests section]
        C1 --> C2 --> C3
        C3 --> USERS
        USERS --> C4 --> C5 --> C6
    end

    subgraph NETWORK["5. NETWORK DISPLAY (index.html + network-app.js)"]
        N1[loadUserNotifications - getUserNotifications]
        N2[computePendingConnectionRequests]
        N2b[computePendingCollaborationRequests]
        N3[updateNotificationBell - badge if unread or pending]
        N4[User clicks bell → showNotificationPopup]
        N5[renderNotifications: connection + collaboration requests + Firestore notifications]
        N6[Mark unread as read → markNotificationsAsRead]
        N1 --> N2 --> N2b --> N3
        N4 --> N5 --> N6
    end

    subgraph COLLAB_REQ["4b. COLLABORATION REQUEST FLOW (computed)"]
        CR1[User A adds B email to block.collaborators in profile block modal]
        CR2[Block saved with collaborators array]
        CR3[User B: computePendingCollaborationRequests]
        CR4[Find blocks where: collaborators includes B AND B.collaborations excludes globalId AND not dismissed]
        CR5[Render in notification popup as Collaboration Requests section]
        CR1 --> CR2 --> CR3 --> CR4 --> CR5
    end

    subgraph ACTIONS["6. USER ACTIONS IN POPUP"]
        AC1[Connect btn → addConnectionForCurrentUser]
        AC2[Decline btn → dismissConnectionRequestForCurrentUser]
        AC3[Accept collab → addCollaborationForCurrentUser]
        AC4[Decline collab → dismissCollaborationRequestForCurrentUser]
        AC5[View More → open link]
        N5 --> AC1
        N5 --> AC2
        N5 --> AC3
        N5 --> AC4
        N5 --> AC5
    end

    USER_NOTIF --> N1
    USERS --> N2
    AC1 --> USERS
    AC2 --> USERS

    subgraph ADMIN_MANAGE["7. ADMIN MANAGE SENT (admin-app.js)"]
        AM1[loadSentNotifications - getAllSentNotifications]
        AM2[renderSentNotifications - filter by search/user]
        AM3[edit → updateSentNotification - updates sentNotifications doc only]
        AM4[delete → deleteSentNotification - removes log; user inbox unchanged]
        AM1 --> AM2
        AM2 --> AM3
        AM2 --> AM4
    end

    SENT --> AM1
```

---

## Data Flow Summary

| Step | Action | Location | Firebase |
|------|--------|----------|----------|
| 1 | Admin creates notification | admin.html | — |
| 2 | Log to sentNotifications | collab-firebase-setup.js | `sentNotifications/{id}` |
| 3 | Fan-out to user inboxes | collab-firebase-setup.js | `users/{email}/notifications/{docId}` |
| 4 | User sends connection request | network-app.js | `users/{requester}.connections` arrayUnion |
| 5 | Pending requests computed | network-app.js | Read `users` (connections, dismissedConnectionRequests) |
| 6 | Load user notifications | network-firebase-setup.js | `users/{email}/notifications` |
| 7 | Display bell + popup | network-app.js | — |
| 8 | Mark as read | network-firebase-setup.js | Update `users/{email}/notifications/{id}` read: true |
| 9 | Connect/Decline | network-firebase-setup.js | `users/{email}` connections, dismissedConnectionRequests |
| 10 | User adds collaborators to block | profile-app.js | `users/{email}.blocks[].collaborators` |
| 11 | Accept/Decline collaboration | network-firebase-setup.js | `users/{email}` collaborations, dismissedCollaborationRequests |

---

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `sendNotifications(targets, notificationData)` | collab-firebase-setup.js | Log + fan-out to users/{email}/notifications |
| `getAllSentNotifications()` | collab-firebase-setup.js | Query sentNotifications for admin list |
| `updateSentNotification(id, data)` | collab-firebase-setup.js | Update sentNotifications log (not user inboxes) |
| `deleteSentNotification(id)` | collab-firebase-setup.js | Delete log entry (user inboxes unchanged) |
| `getUserNotifications(userEmail)` | network-firebase-setup.js | Get docs from users/{email}/notifications |
| `markNotificationsAsRead(userEmail, ids)` | network-firebase-setup.js | Batch update read: true |
| `addConnectionForCurrentUser(targetEmail)` | network-firebase-setup.js | Add target to current user's connections |
| `dismissConnectionRequestForCurrentUser(targetEmail)` | network-firebase-setup.js | Add target to dismissedConnectionRequests |
| `addCollaborationForCurrentUser(blockGlobalId)` | network-firebase-setup.js | Add block globalId to current user's collaborations |
| `dismissCollaborationRequestForCurrentUser(blockGlobalId)` | network-firebase-setup.js | Add block globalId to dismissedCollaborationRequests |
| `removeCollaborationFromUser(collaboratorEmail, blockGlobalId)` | profile-firebase-setup.js | Remove block globalId from collaborator when owner removes them |
| `computePendingCollaborationRequests()` | network-app.js | Blocks where I'm in collaborators, not accepted, not dismissed |
| `loadUserNotifications()` | network-app.js | Fetch + compute + render |
| `computePendingConnectionRequests()` | network-app.js | Users who added me, I haven't added back, not dismissed |
| `updateNotificationBell()` | network-app.js | Badge on bell if unread or pending |
| `renderNotifications()` | network-app.js | Connection requests section + Firestore notifications |
| `showNotificationPopup()` | network-app.js | Open popup, mark unread as read |

---

## Notification Types

| Type | Source | Storage | Display |
|------|--------|---------|---------|
| **Admin broadcast** | Admin form | `sentNotifications` + `users/{email}/notifications` | Notification items in popup |
| **Connection request** | User clicks Connect | `users/{email}.connections` (computed) | Connection Requests section in popup |
| **Collaboration request** | User adds collaborator email in block modal | `users/{email}.blocks[].collaborators` (computed) | Collaboration Requests section in popup |

---

## Firebase Collections Structure

```
sentNotifications/
  {id}/
    title, body, category, imageUrl?, link?
    target: 'all' | [email1, email2, ...]
    sentAt

users/
  {email}/
    connections: [email1, email2, ...]
    dismissedConnectionRequests: [email3, ...]
    collaborations: [blockGlobalId1, ...]      ← blocks user has accepted as collaborator
    dismissedCollaborationRequests: [globalId, ...]
    notifications/           ← subcollection
      {docId}/
        title, body, category, imageUrl?, link?
        timestamp, read, logId
```

---

## Connection Request vs Admin Notification

| Aspect | Connection Request | Admin Notification |
|--------|--------------------|--------------------|
| **Trigger** | User A adds User B to connections | Admin sends via form |
| **Storage** | users/A.connections includes B | users/B/notifications/{doc} |
| **Visibility** | User B sees "A wants to connect" → pending | User B sees notification doc |
| **Actions** | Connect (add B to A), Decline (dismiss) | View More (link), or none |
| **Persistence** | Until Connect or Decline | Until user reads (read: true) |

---

## Collaboration Request vs Connection Request

| Aspect | Collaboration Request | Connection Request |
|--------|----------------------|--------------------|
| **Trigger** | User A adds User B to block.collaborators in profile block modal | User A clicks Connect on User B profile |
| **Storage** | Block has collaborators array; B has collaborations/dismissedCollaborationRequests | users/A.connections includes B |
| **Visibility** | User B sees "A wants to add you as collaborator on [block title]" | User B sees "A wants to connect" |
| **Actions** | Accept (add globalId to collaborations), Decline (add to dismissed) | Connect, Decline |
| **Display** | Accepted collaborators shown at top of block in profile modal on index.html | Mutual connection creates link in network |
