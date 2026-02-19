import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import getStarfield from "./getStarfield.js";
import { drawThreeGeo } from "./threeGeoJSON.js";

const canvas = document.getElementById('welcome-globe-canvas');
const container = document.querySelector('.final-mission-content');

function initGlobe() {
  if (!container) return;

  // On mobile: show GIF instead of 3D globe
  if (window.__isMobile) {
    container.classList.add('mobile-globe');
    return;
  }

  if (!canvas) return;

  const w = container.offsetWidth;
  const h = container.offsetHeight;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.3);
  const camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
  
  // Start camera far away for intro animation
  const finalCameraZ = 5;
  camera.position.z = 50;
  
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0); // Transparent background

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = false;
  controls.enablePan = false;

  // Track user interaction for auto-rotation
  let isUserInteracting = false;
  controls.addEventListener('start', () => {
    isUserInteracting = true;
  });
  controls.addEventListener('end', () => {
    isUserInteracting = false;
  });

  // Animation state
  let hasAnimatedIn = false;
  let isAnimatingIn = false;
  let animationProgress = 0;

  // Create a container for the globe and pins that will rotate together
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const geometry = new THREE.SphereGeometry(2);
  const lineMat = new THREE.LineBasicMaterial({ 
    color: 0xffffff,
    transparent: true,
    opacity: 0.3, 
  });
  const edges = new THREE.EdgesGeometry(geometry, 1);
  const line = new THREE.LineSegments(edges, lineMat);
  globeGroup.add(line);

  // Reduced stars for better performance
  const stars = getStarfield({ numStars: 500, fog: false });
  scene.add(stars);

  // Store reference to countries for rotation
  let countries = null;

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
  londonPin.userData = { label: "London" };
  globeGroup.add(londonPin);

  // Create label element
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.color = 'white';
  label.style.fontFamily = 'Helvetica, Arial, sans-serif';
  label.style.fontSize = '14px';
  label.style.pointerEvents = 'none';
  label.style.display = 'block';
  label.style.zIndex = '1';
  label.textContent = 'London';
  container.appendChild(label);

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
      console.error('Error loading globe data:', error);
    });

  function animate() {
    requestAnimationFrame(animate);
    
    // Handle zoom-in animation
    if (isAnimatingIn && animationProgress < 1) {
      animationProgress += 0.012; // Animation speed (adjust for faster/slower)
      if (animationProgress > 1) animationProgress = 1;
      
      // Ease-out function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - animationProgress, 3);
      camera.position.z = 50 - (50 - finalCameraZ) * easeOut;
      
      if (animationProgress >= 1) {
        isAnimatingIn = false;
        hasAnimatedIn = true;
      }
    }
    
    // Slower auto-rotation when not being interacted with
    if (!isUserInteracting) {
      globeGroup.rotation.y += 0.0008; // Reduced from 0.002
      if (countries) {
        countries.rotation.z += 0.0008; // Reduced from 0.002
      }
    }
    
    // Always update label position
    const pinWorldPosition = new THREE.Vector3();
    londonPin.getWorldPosition(pinWorldPosition);
    
    // Calculate distance from camera for fog effect
    const distanceFromCamera = pinWorldPosition.distanceTo(camera.position);
    
    // Check if pin is facing camera (dot product with camera direction)
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const pinDirection = pinWorldPosition.clone().sub(camera.position).normalize();
    const dotProduct = cameraDirection.dot(pinDirection);
    
    // Calculate opacity based on distance and position (fog effect)
    let opacity = 1.0;
    if (dotProduct < 0) {
      // Pin is behind the camera
      opacity = 0;
    } else {
      // Apply fog-like opacity based on distance
      const fogDensity = 0.3;
      opacity = Math.exp(-fogDensity * (distanceFromCamera - 3));
      opacity = Math.max(0, Math.min(1, opacity));
    }
    
    const pinScreenPosition = pinWorldPosition.clone();
    pinScreenPosition.project(camera);
    
    // Get canvas and container positions
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Calculate screen position in pixels relative to canvas
    const x = (pinScreenPosition.x * 0.5 + 0.5) * canvasRect.width;
    const y = (-(pinScreenPosition.y * 0.5) + 0.5) * canvasRect.height;
    
    // Offset from canvas position to container position
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    
    // Position label relative to container
    label.style.left = (canvasOffsetX + x + 15) + 'px';
    label.style.top = (canvasOffsetY + y) + 'px';
    label.style.opacity = opacity;
    
    renderer.render(scene, camera);
    controls.update();
  }

  animate();

  // Intersection Observer to trigger animation when globe comes into view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !hasAnimatedIn && !isAnimatingIn) {
        isAnimatingIn = true;
        animationProgress = 0;
      }
    });
  }, {
    threshold: 0.2 // Trigger when 20% of the element is visible
  });

  observer.observe(container);

  // Responsive resize handler
  function handleWindowResize() {
    const newW = container.offsetWidth;
    const newH = container.offsetHeight;
    camera.aspect = newW / newH;
    camera.updateProjectionMatrix();
    renderer.setSize(newW, newH);
  }
  
  window.addEventListener('resize', handleWindowResize, false);
  
  // Handle visibility changes to pause/resume animation
  let animationFrameId;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrameId);
    } else {
      animate();
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobe);
} else {
  initGlobe();
}
