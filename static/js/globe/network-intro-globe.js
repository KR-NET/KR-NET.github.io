import * as THREE from "three";
import getStarfield from "./getStarfield.js";
import { drawThreeGeo } from "./threeGeoJSON.js";

const canvas = document.getElementById('network-intro-globe-canvas');
const loadingScreen = document.getElementById('network-loading-screen');
const loadingText = document.querySelector('#network-loading-screen .loading-text');

let renderer = null;
let scene = null;
let camera = null;
let globeGroup = null;
let countries = null;
let animationFrameId = null;
let isInteractive = false;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotationVelocity = { x: 0, y: 0 };
let autoRotationSpeed = 0.003;
let loadingDotsInterval = null;
let isZoomingIn = false; // New flag for final zoom-in phase
let zoomInStartTime = 0;
let zoomInStartZ = 0;

function initNetworkIntroGlobe() {
  if (!canvas || !loadingScreen) {
    console.error('Network intro globe elements not found');
    return;
  }

  // Detect if loading a profile or network based on URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isLoadingProfile = urlParams.has('link');
  const baseLoadingText = isLoadingProfile ? 'Loading profile' : 'Loading network';

  const w = window.innerWidth;
  const h = window.innerHeight;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.03);
  camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
  
  // Start camera very far away
  const startCameraZ = 50;
  const finalCameraZ = 5;
  camera.position.z = startCameraZ;
  
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h);
  renderer.setClearColor(0x1a1a1a, 1);

  // Create globe group
  globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const geometry = new THREE.SphereGeometry(2);
  const lineMat = new THREE.LineBasicMaterial({ 
    color: 0x757575,
    transparent: true,
    opacity: 0.5,
    fog: true
  });
  const edges = new THREE.EdgesGeometry(geometry, 1);
  const line = new THREE.LineSegments(edges, lineMat);
  globeGroup.add(line);

  // Stars
  const stars = getStarfield({ numStars: 400, fog: false });
  scene.add(stars);

  let animationProgress = 0;
  const animationDuration = 1.5; // 1.5 seconds

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
      console.error('Error loading network intro globe data:', error);
    });

  const startTime = Date.now();
  let animationCompleted = false;

  // Start animated dots for loading text
  if (loadingText) {
    let dotCount = 0;
    loadingDotsInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 3; // 0, 1, 2
      const dots = '.'.repeat(dotCount + 1); // 1, 2, or 3 dots
      loadingText.textContent = `${baseLoadingText}${dots}`;
    }, 400);
  }

  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    
    if (!animationCompleted) {
      // Initial zoom-in animation phase
      const elapsed = (Date.now() - startTime) / 1000;
      animationProgress = Math.min(elapsed / animationDuration, 1);
      
      // Smooth zoom in with ease-out cubic
      const easeOut = 1 - Math.pow(1 - animationProgress, 3);
      camera.position.z = startCameraZ - (startCameraZ - finalCameraZ) * easeOut;
      
      // Gentle rotation during zoom
      globeGroup.rotation.y += autoRotationSpeed;
      if (countries) {
        countries.rotation.z += autoRotationSpeed;
      }
      
      // Complete animation and enable interaction
      if (animationProgress >= 1) {
        animationCompleted = true;
        enableInteraction();
      }
      
      renderer.render(scene, camera);
    } else if (isZoomingIn) {
      // Final zoom-in phase (when data is loaded)
      const zoomDuration = 1500; // 1.5 seconds - longer for full effect
      const backgroundFadeStart = 0.5; // Background starts fading at 50%
      const globeFadeStart = 0.85; // Globe starts fading much later at 85%
      const endZoom = -8; // Go VERY deep inside globe
      
      const elapsed = Date.now() - zoomInStartTime;
      const progress = Math.min(elapsed / zoomDuration, 1);
      
      // Simple exponential ease for aggressive zoom
      const ease = Math.pow(progress, 2);
      
      camera.position.z = zoomInStartZ - (zoomInStartZ - endZoom) * ease;
      
      // Fade out background earlier
      if (progress >= backgroundFadeStart && progress < globeFadeStart) {
        const bgFadeProgress = (progress - backgroundFadeStart) / (globeFadeStart - backgroundFadeStart);
        loadingScreen.style.backgroundColor = `rgba(26, 26, 26, ${1 - bgFadeProgress})`;
      } else if (progress >= globeFadeStart) {
        loadingScreen.style.backgroundColor = 'rgba(26, 26, 26, 0)';
      }
      
      // Fade out globe/canvas later
      if (progress >= globeFadeStart) {
        const globeFadeProgress = (progress - globeFadeStart) / (1 - globeFadeStart);
        canvas.style.opacity = String(1 - globeFadeProgress);
      }
      
      // Continue globe rotation during zoom
      globeGroup.rotation.y += autoRotationSpeed * 2;
      if (countries) {
        countries.rotation.z += 0.002;
      }
      
      renderer.render(scene, camera);
      
      // When zoom completes, trigger fade-out
      if (progress >= 1) {
        isZoomingIn = false;
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        completeLoadingScreenHide();
      }
    } else if (isInteractive) {
      // Interactive phase - waiting for data to load
      
      // Apply rotation velocity (damping)
      if (!isDragging) {
        globeGroup.rotation.y += rotationVelocity.x;
        globeGroup.rotation.x += rotationVelocity.y;
        
        // Damping
        rotationVelocity.x *= 0.95;
        rotationVelocity.y *= 0.95;
        
        // Auto-rotation when velocity is low
        if (Math.abs(rotationVelocity.x) < 0.001 && Math.abs(rotationVelocity.y) < 0.001) {
          globeGroup.rotation.y += autoRotationSpeed;
        }
      }
      
      if (countries) {
        countries.rotation.z += 0.001;
      }
      
      renderer.render(scene, camera);
    }
  }

  function enableInteraction() {
    isInteractive = true;
    canvas.style.cursor = 'grab';
    
    // Stop the dots animation when interaction is enabled
    if (loadingDotsInterval) {
      clearInterval(loadingDotsInterval);
      loadingDotsInterval = null;
    }
    
    // Set final text
    if (loadingText) {
      loadingText.textContent = `${baseLoadingText}...`;
    }
    
    // Mouse/touch event handlers
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart);
  }

  function onMouseDown(e) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
    previousMousePosition = { x: e.clientX, y: e.clientY };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    
    const rotationSpeed = 0.005;
    globeGroup.rotation.y += deltaX * rotationSpeed;
    globeGroup.rotation.x += deltaY * rotationSpeed;
    
    // Limit vertical rotation to prevent flipping
    globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x));
    
    // Store velocity for inertia
    rotationVelocity.x = deltaX * rotationSpeed * 0.5;
    rotationVelocity.y = deltaY * rotationSpeed * 0.5;
    
    previousMousePosition = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = { 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY 
      };
      
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchEnd);
    }
  }

  function onTouchMove(e) {
    if (!isDragging || e.touches.length !== 1) return;
    
    e.preventDefault();
    
    const deltaX = e.touches[0].clientX - previousMousePosition.x;
    const deltaY = e.touches[0].clientY - previousMousePosition.y;
    
    const rotationSpeed = 0.005;
    globeGroup.rotation.y += deltaX * rotationSpeed;
    globeGroup.rotation.x += deltaY * rotationSpeed;
    
    globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x));
    
    rotationVelocity.x = deltaX * rotationSpeed * 0.5;
    rotationVelocity.y = deltaY * rotationSpeed * 0.5;
    
    previousMousePosition = { 
      x: e.touches[0].clientX, 
      y: e.touches[0].clientY 
    };
  }

  function onTouchEnd() {
    isDragging = false;
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }

  // Start animation
  animate();

  // Handle window resize
  function handleResize() {
    const newW = window.innerWidth;
    const newH = window.innerHeight;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
  }
  
  window.addEventListener('resize', handleResize, false);
}

// Function to hide loading screen (called from network-app.js when data is loaded)
export function hideNetworkLoadingScreen() {
  if (!loadingScreen) return;
  
  // Stop dots animation if still running
  if (loadingDotsInterval) {
    clearInterval(loadingDotsInterval);
    loadingDotsInterval = null;
  }
  
  // Fallback: if WebGL/globe never initialized (e.g. mobile), hide loading screen directly
  if (!camera || !renderer) {
    completeLoadingScreenHide();
    return;
  }
  
  // Disable interaction during zoom
  isInteractive = false;
  if (canvas) canvas.style.cursor = 'default';
  
  // Start the final zoom-in phase within the existing animation loop
  isZoomingIn = true;
  zoomInStartTime = Date.now();
  zoomInStartZ = camera.position.z;
}

// Called when zoom-in animation completes
function completeLoadingScreenHide() {
  loadingScreen.style.transition = 'opacity 0.3s ease-out';
  loadingScreen.style.opacity = '0';
  
  setTimeout(() => {
    loadingScreen.style.display = 'none';
    
    // Clean up Three.js resources
    if (renderer) {
      renderer.dispose();
    }
    if (scene) {
      scene.clear();
    }
  }, 300);
}

// Make function available globally for network-app.js
window.hideNetworkLoadingScreen = hideNetworkLoadingScreen;

// Fallback when WebGL fails (e.g. mobile, low-power mode)
function fallbackHideLoadingScreen() {
  if (!loadingScreen) return;
  if (loadingDotsInterval) {
    clearInterval(loadingDotsInterval);
    loadingDotsInterval = null;
  }
  loadingScreen.style.transition = 'opacity 0.3s ease-out';
  loadingScreen.style.opacity = '0';
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 300);
}

// Initialize when DOM is ready
function init() {
  // On mobile: skip 3D globe, GIF is shown via HTML/CSS; hideNetworkLoadingScreen still works
  if (window.__isMobile) {
    return;
  }
  try {
    initNetworkIntroGlobe();
  } catch (e) {
    console.warn('Network intro globe init failed (WebGL may be unsupported):', e);
    fallbackHideLoadingScreen();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
