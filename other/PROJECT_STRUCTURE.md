# KR Network - Project Structure

## 📁 Reorganization Complete (Phase 1 & 2)

This document describes the new, cleaner organization of the codebase.

---

## Current Structure

```
KR-Network/
├── index.html              # Main network page
├── welcome.html            # Landing/welcome page
├── profile.html            # User profile page
├── collab.html             # Collaboration page
├── admin.html              # Admin dashboard
├── terms.html              # Terms and conditions
│
├── static/
│   ├── css/
│   │   └── styles.css      # Main stylesheet (moved from root)
│   │
│   ├── js/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── mobile-nav.js
│   │   │   └── loading-canvas-animation.js
│   │   │
│   │   ├── pages/          # Page-specific logic
│   │   │   ├── network-app.js
│   │   │   ├── profile-app.js
│   │   │   ├── collab-app.js
│   │   │   ├── admin-app.js
│   │   │   └── discover-feed.js
│   │   │
│   │   ├── firebase/       # Firebase setup modules
│   │   │   ├── network-firebase-setup.js
│   │   │   ├── profile-firebase-setup.js
│   │   │   └── collab-firebase-setup.js
│   │   │
│   │   └── globe/          # Three.js globe components
│   │       ├── welcome-globe.js
│   │       ├── intro-globe.js
│   │       ├── threeGeoJSON.js
│   │       ├── worldmap.js
│   │       └── getStarfield.js
│   │
│   ├── img/                # Images and icons
│   │   └── default-icon.png (moved from root)
│   │
│   ├── video/              # Video assets
│   ├── sounds/             # Audio files
│   └── data/               # JSON data files
│
└── CNAME.txt              # GitHub Pages config
```

---



---

## Next Steps (Phase 3+)

### Recommended Future Improvements:
1. **Extract embedded CSS from HTML files** into separate stylesheets
2. **Extract embedded JS from HTML files** into separate modules
3. **Create shared utility modules** for common functions
4. **Consolidate Firebase configurations** into a single config file
5. **Create component-specific CSS files** for modular styling

---

## File Size Comparison

### Before:
- Total root files: ~23,622 lines
- welcome.html: 2,416 lines (with embedded CSS/JS)
- Mixed content everywhere

### After (Phase 1 & 2):
- Clean, organized structure
- All external assets properly organized
- Ready for further optimization

---

## Testing Checklist

After reorganization, verify:
- [ ] index.html loads correctly
- [ ] welcome.html displays properly
- [ ] profile.html functions work
- [ ] collab.html page loads
- [ ] admin.html dashboard works
- [ ] All navigation between pages works
- [ ] Firebase authentication still works
- [ ] Images and icons display correctly
- [ ] Mobile navigation works

---

**Last Updated:** Feb 16, 2026
**Status:** Phase 1 & 2 Complete ✅
