import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import getStarfield from "./src/getStarfield.js";
import { drawThreeGeo } from "./src/threeGeoJSON.js";

const canvas = document.getElementById('globe-canvas');
const w = window.innerWidth;
const h = window.innerHeight;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.3);
const camera = new THREE.PerspectiveCamera(75, w / h, 1, 100);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(w, h);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// Track user interaction for auto-rotation
let isUserInteracting = false;
controls.addEventListener('start', () => {
  isUserInteracting = true;
});
controls.addEventListener('end', () => {
  isUserInteracting = false;
});

// Create a container for the globe and pins that will rotate together
const globeGroup = new THREE.Group();
scene.add(globeGroup);

const geometry = new THREE.SphereGeometry(2);
const lineMat = new THREE.LineBasicMaterial({ 
  color: 0xffffff,
  transparent: true,
  opacity: 0.4, 
});
const edges = new THREE.EdgesGeometry(geometry, 1);
const line = new THREE.LineSegments(edges, lineMat);
globeGroup.add(line);

const stars = getStarfield({ numStars: 1000, fog: false });
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
label.style.fontSize = '16px';
label.style.pointerEvents = 'none';
label.style.display = 'block';
label.textContent = 'London';
document.body.appendChild(label);

// check here for more datasets ...
// https://github.com/martynafford/natural-earth-geojson
// non-geojson datasets: https://www.naturalearthdata.com/downloads/
fetch('./geojson/ne_110m_land.json')
  .then(response => response.text())
  .then(text => {
    const data = JSON.parse(text);
    countries = drawThreeGeo({
      json: data,
      radius: 2,
      materialOptions: {
        color: 0x80FF80,
      },
    });
    scene.add(countries);
  });

function animate() {
  requestAnimationFrame(animate);
  
  // Auto-rotate when not being interacted with
  if (!isUserInteracting) {
    globeGroup.rotation.y += 0.002;
    if (countries) {
      countries.rotation.z += 0.002;
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
  
  // Get canvas position on page to account for any offset from h2 or other elements
  const canvasRect = canvas.getBoundingClientRect();
  
  const x = (pinScreenPosition.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
  const y = (-(pinScreenPosition.y * 0.5) + 0.5) * canvasRect.height + canvasRect.top;
  
  label.style.left = (x + 15) + 'px';
  label.style.top = y + 'px';
  label.style.opacity = opacity;
  
  renderer.render(scene, camera);
  controls.update();
}

animate();

function handleWindowResize () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleWindowResize, false);