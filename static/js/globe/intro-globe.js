import * as THREE from "three";
import getStarfield from "./getStarfield.js";
import { drawThreeGeo } from "./threeGeoJSON.js";

const canvas = document.getElementById('intro-globe-canvas');
const overlay = document.getElementById('intro-overlay');

function initIntroGlobe() {
  if (!canvas || !overlay) {
    console.error('Intro globe elements not found');
    fallbackToMainContent();
    return;
  }

  // Prevent scrolling during intro
  const preventScroll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // Disable scrolling during intro
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  window.addEventListener('wheel', preventScroll, { passive: false });
  window.addEventListener('touchmove', preventScroll, { passive: false });
  window.addEventListener('scroll', preventScroll, { passive: false });
  
  // Re-enable scrolling after 1 second
  setTimeout(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('scroll', preventScroll);
  }, 1000);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const scene = new THREE.Scene();
  // Light fog - affects land lines more while keeping globe visible
  scene.fog = new THREE.FogExp2(0x000000, 0.03);
  const camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
  
  // Start camera very far away
  const startCameraZ = 50;
  const finalCameraZ = 5;
  camera.position.z = startCameraZ;
  
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 1);

  // Create globe group
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const geometry = new THREE.SphereGeometry(2);
  const lineMat = new THREE.LineBasicMaterial({ 
    color: 0x757575,
    transparent: true,
    opacity: 0.5,
    fog: true // Globe wireframe not affected by fog
  });
  const edges = new THREE.EdgesGeometry(geometry, 1);
  const line = new THREE.LineSegments(edges, lineMat);
  globeGroup.add(line);

  // Reduced stars for performance (300 instead of 500)
  const stars = getStarfield({ numStars: 400, fog: false });
  scene.add(stars);

  let countries = null;
  let animationProgress = 0;
  const animationDuration = 1.5; // 1.5 seconds
  const bgFadeStartTime = 0.2; // Background starts fading at 0.8 seconds
  const bgFadeEndTime = 0.8; // Background fully transparent at 1.2 seconds
  const overlayFadeStartTime = 1.0; // Overlay (globe/stars) starts fading at 1.2 seconds

  // Function to convert lat/lon to sphere coordinates
  function latLonToVector3(lat, lon, radius, height) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    
    const x = -(radius + height) * Math.sin(phi) * Math.cos(theta);
    const z = (radius + height) * Math.sin(phi) * Math.sin(theta);
    const y = (radius + height) * Math.cos(phi);
    
    return new THREE.Vector3(x, y, z);
  }

  // Add London pin
  const londonLat = 51.5074;
  const londonLon = -0.1278;
  const pinRadius = 0.05;
  const pinHeight = 0.1;

  const pinGeometry = new THREE.SphereGeometry(pinRadius, 16, 16);
  const pinMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff8800,
    fog: false
  });
  const londonPin = new THREE.Mesh(pinGeometry, pinMaterial);

  const londonPosition = latLonToVector3(londonLat, londonLon, 2, pinHeight);
  londonPin.position.copy(londonPosition);
  globeGroup.add(londonPin);

  // Load GeoJSON data
  fetch('./static/data/ne_110m_land.json')
    .then(response => response.text())
    .then(text => {
      const data = JSON.parse(text);
      countries = drawThreeGeo({
        json: data,
        radius: 2,
        materialOptions: {
          color: 0x69b3a2,
        },
      });
      scene.add(countries);
    })
    .catch(error => {
      console.error('Error loading intro globe data:', error);
      // Continue animation even without countries
    });

  const startTime = Date.now();
  let animationCompleted = false;

  function animate() {
    if (animationCompleted) return;
    
    requestAnimationFrame(animate);
    
    const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds
    animationProgress = Math.min(elapsed / animationDuration, 1);
    
    // Smooth zoom in with ease-out cubic
    const easeOut = 1 - Math.pow(1 - animationProgress, 3);
    camera.position.z = startCameraZ - (startCameraZ - finalCameraZ) * easeOut;
    
    // Gentle rotation during zoom
    globeGroup.rotation.y += 0.003;
    if (countries) {
      countries.rotation.z += 0.003;
    }
    
    // Fade background from #181818 to transparent (earlier)
    if (elapsed < bgFadeStartTime) {
      overlay.style.backgroundColor = 'rgba(24, 24, 24, 1)';
    } else if (elapsed >= bgFadeStartTime && elapsed < bgFadeEndTime) {
      const bgFadeProgress = (elapsed - bgFadeStartTime) / (bgFadeEndTime - bgFadeStartTime);
      const bgOpacity = 1 - bgFadeProgress;
      overlay.style.backgroundColor = `rgba(24, 24, 24, ${bgOpacity})`;
    } else if (elapsed >= bgFadeEndTime) {
      overlay.style.backgroundColor = 'transparent';
    }
    
    // Fade out canvas (globe/stars) later - keep overlay at full opacity during background fade
    if (elapsed < overlayFadeStartTime) {
      canvas.style.opacity = '1';
    } else if (elapsed >= overlayFadeStartTime) {
      const fadeProgress = (elapsed - overlayFadeStartTime) / (animationDuration - overlayFadeStartTime);
      canvas.style.opacity = String(1 - fadeProgress);
    }
    
    // Complete animation
    if (animationProgress >= 1) {
      animationCompleted = true;
      completeIntro();
    }
    
    renderer.render(scene, camera);
  }

  function completeIntro() {
    setTimeout(() => {
      overlay.style.display = 'none';
      // Clean up
      renderer.dispose();
      scene.clear();
    }, 100);
  }

  // Fallback timeout
  setTimeout(() => {
    if (!animationCompleted) {
      fallbackToMainContent();
    }
  }, 3000); // If something goes wrong, force show content after 3 seconds

  // Start animation
  animate();

  // Handle window resize during intro
  function handleResize() {
    if (!animationCompleted) {
      const newW = window.innerWidth;
      const newH = window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    }
  }
  
  window.addEventListener('resize', handleResize, false);
}

function fallbackToMainContent() {
  // Re-enable scrolling in case of fallback
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  
  if (overlay) {
    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIntroGlobe);
} else {
  initIntroGlobe();
}
