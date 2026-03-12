// ============================================================
// Assignment 5 - Three.js 3D World
// A first-person exploration scene with 22+ shapes, 3 light
// types, a textured skybox, an animated object, and a GLB model.
// ============================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- Globals ----
let scene, camera, renderer, controls, clock;
const moveState = { forward: false, backward: false, left: false, right: false };
const animatedObjects = [];
const MOVE_SPEED = 18;
let frameCount = 0, lastFpsTime = 0;

init();

// ================================================================
//  Initialization
// ================================================================

function init() {
  clock = new THREE.Clock();

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdbc8a8, 60, 180);

  // Camera (perspective projection)
  camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 500
  );
  camera.position.set(0, 2, 15);

  // First-person controls (pointer lock + mouse look)
  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  const blocker = document.getElementById('blocker');
  const instructions = document.getElementById('instructions');
  instructions.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
  controls.addEventListener('unlock', () => { blocker.style.display = 'flex'; });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Build the world
  createSkybox();
  createLights();
  createObjects();
  loadModel();

  window.addEventListener('resize', onResize);

  animate();
}

// ================================================================
//  Input handlers
// ================================================================

function onKeyDown(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward  = true; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = true; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left     = true; break;
    case 'KeyD': case 'ArrowRight': moveState.right    = true; break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward  = false; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = false; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left     = false; break;
    case 'KeyD': case 'ArrowRight': moveState.right    = false; break;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ================================================================
//  Procedural canvas textures
// ================================================================

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a7c3f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 800; i++) {
    const r = 30 + Math.random() * 50;
    const g = 90 + Math.random() * 70;
    const b = 25 + Math.random() * 35;
    ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

function makeBrickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b0b0b0';
  ctx.fillRect(0, 0, 256, 256);
  const bw = 60, bh = 30, gap = 4;
  for (let row = 0; row < 9; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < 5; col++) {
      const r = 150 + Math.random() * 50;
      const g = 55 + Math.random() * 30;
      const b = 40 + Math.random() * 20;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(off + col * bw + gap / 2, row * bh + gap / 2, bw - gap, bh - gap);
    }
  }
  return new THREE.CanvasTexture(c);
}

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 50; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = `rgba(60,35,10,${Math.random() * 0.3 + 0.1})`;
    ctx.lineWidth = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// ================================================================
//  Skybox (procedural canvas CubeTexture)
// ================================================================

function createSkybox() {
  const size = 512;

  function makeSideFace() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0.0,  '#0b1026');
    g.addColorStop(0.25, '#1c2951');
    g.addColorStop(0.50, '#c0392b');
    g.addColorStop(0.65, '#e67e22');
    g.addColorStop(0.80, '#f9ca24');
    g.addColorStop(1.0,  '#dbc8a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * size,
        size * 0.15 + Math.random() * size * 0.3,
        50 + Math.random() * 80,
        12 + Math.random() * 15,
        0, 0, Math.PI * 2
      );
      ctx.fill();
    }
    return canvas;
  }

  function makeTopFace() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.7 + 0.3})`;
      ctx.beginPath();
      ctx.arc(
        Math.random() * size, Math.random() * size,
        Math.random() * 1.5 + 0.5, 0, Math.PI * 2
      );
      ctx.fill();
    }
    return canvas;
  }

  function makeBottomFace() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dbc8a8';
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  // CubeTexture order: +X, -X, +Y, -Y, +Z, -Z
  const faces = [
    makeSideFace(), makeSideFace(),
    makeTopFace(),  makeBottomFace(),
    makeSideFace(), makeSideFace(),
  ];

  const cubeTexture = new THREE.CubeTexture(faces);
  cubeTexture.needsUpdate = true;
  scene.background = cubeTexture;
}

// ================================================================
//  Lights  (3 different types: Ambient, Directional, Point)
// ================================================================

function createLights() {
  // 1. Ambient light -- soft fill
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  // 2. Directional light -- acts as the sun, casts shadows
  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
  dirLight.position.set(25, 35, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width  = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near   = 0.5;
  dirLight.shadow.camera.far    = 120;
  dirLight.shadow.camera.left   = -40;
  dirLight.shadow.camera.right  =  40;
  dirLight.shadow.camera.top    =  40;
  dirLight.shadow.camera.bottom = -40;
  scene.add(dirLight);

  // 3. Point light -- warm lantern glow near the centre of the scene
  const pointLight = new THREE.PointLight(0xff9933, 2.5, 35, 1.5);
  pointLight.position.set(0, 3.5, 0);
  pointLight.castShadow = true;
  scene.add(pointLight);

  // Small emissive sphere as a visual indicator for the point light
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffaa44 })
  );
  lantern.position.copy(pointLight.position);
  scene.add(lantern);
}

// ================================================================
//  Objects  (22 primary shapes, 5+ geometry kinds)
// ================================================================

function createObjects() {
  const grassTex = makeGrassTexture();
  const brickTex = makeBrickTexture();
  const woodTex  = makeWoodTexture();

  // ---- helpers ----
  function addMesh(geo, mat, pos, opts = {}) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow    = opts.castShadow   !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    scene.add(mesh);
    return mesh;
  }

  // ========== BOXES ==========

  // #1  Ground plane (large flat box, grass-textured)
  const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 });
  const ground = addMesh(
    new THREE.BoxGeometry(120, 0.5, 120), groundMat, [0, -0.25, 0]
  );
  ground.receiveShadow = true;

  // #2-#5  Brick walls forming a small enclosure
  const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 });
  addMesh(new THREE.BoxGeometry(8, 4, 0.5),  wallMat, [8, 2, -10]);
  addMesh(new THREE.BoxGeometry(8, 4, 0.5),  wallMat, [8, 2, -15]);
  addMesh(new THREE.BoxGeometry(0.5, 4, 5.5), wallMat, [12.25, 2, -12.5]);
  addMesh(new THREE.BoxGeometry(10, 4, 0.5), wallMat, [-12, 2, -8]);

  // #6-#7  Wooden crates
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
  addMesh(new THREE.BoxGeometry(2, 2, 2),       woodMat, [5, 1, 5]);
  addMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), woodMat, [6.8, 0.75, 3.8]);

  // ========== CYLINDERS ==========

  // #8-#10  Tree trunks
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.9 });
  const treePositions = [[-8, 0, -5], [-16, 0, 4], [12, 0, 9]];
  treePositions.forEach(([x, , z]) => {
    addMesh(new THREE.CylinderGeometry(0.4, 0.55, 4, 12), trunkMat, [x, 2, z]);
  });

  // #11-#12  Stone pillars
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa, roughness: 0.5, metalness: 0.15,
  });
  addMesh(new THREE.CylinderGeometry(0.6, 0.7, 5, 16), pillarMat, [-10, 2.5, -16]);
  addMesh(new THREE.CylinderGeometry(0.6, 0.7, 5, 16), pillarMat, [-7,  2.5, -16]);

  // ========== CONES (tree canopies) ==========

  // #13-#15
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d7d3a, roughness: 0.85 });
  treePositions.forEach(([x, , z]) => {
    addMesh(new THREE.ConeGeometry(2.5, 4, 8), leafMat, [x, 6, z]);
  });

  // ========== SPHERES ==========

  // #16-#18  Decorative eggs (one animated)
  const eggColors = [0xffd700, 0x4a90d9, 0xff4444];
  const eggPositions = [[3, 0.4, -3], [-5, 0.4, 8], [14, 0.4, -5]];
  eggColors.forEach((color, i) => {
    const egg = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 20, 14),
      new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 })
    );
    egg.scale.set(1, 1.3, 1);
    egg.position.set(...eggPositions[i]);
    egg.castShadow = true;
    scene.add(egg);
    if (i === 2) {
      animatedObjects.push({ mesh: egg, type: 'bob', baseY: 0.4 });
    }
  });

  // #19  Moon (emissive sphere high in sky)
  addMesh(
    new THREE.SphereGeometry(3, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffcc }),
    [30, 50, -50],
    { castShadow: false, receiveShadow: false }
  );

  // #20  Boulder
  addMesh(
    new THREE.SphereGeometry(1.2, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1.0 }),
    [16, 1.2, 1]
  );

  // #21  Metallic orb
  addMesh(
    new THREE.SphereGeometry(0.6, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x8888ff, metalness: 0.9, roughness: 0.1 }),
    [-3, 0.6, 11]
  );

  // ========== TORUS ==========

  // #22  Archway ring
  addMesh(
    new THREE.TorusGeometry(3, 0.3, 16, 48),
    new THREE.MeshStandardMaterial({ color: 0xcc8844, metalness: 0.5, roughness: 0.3 }),
    [0, 3.5, -22]
  );

  // ========== TORUS KNOT (animated) ==========

  // #23  Spinning decorative knot
  const knot = addMesh(
    new THREE.TorusKnotGeometry(1, 0.3, 100, 16),
    new THREE.MeshStandardMaterial({ color: 0x8844cc, metalness: 0.6, roughness: 0.2 }),
    [0, 2.8, -5],
    { castShadow: true }
  );
  animatedObjects.push({ mesh: knot, type: 'spin' });
}

// ================================================================
//  Load textured GLB model
// ================================================================

function loadModel() {
  const loader = new GLTFLoader();

  const urls = [
    'models/scene.glb',
    'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Duck/glTF-Binary/Duck.glb',
  ];

  function tryLoad(idx) {
    if (idx >= urls.length) {
      console.warn(
        'Could not load 3D model. Place a .glb file at src/models/scene.glb for a local model.'
      );
      return;
    }

    loader.load(
      urls[idx],
      (gltf) => {
        const model = gltf.scene;

        // Auto-scale so the model's tallest dimension is ~2 metres
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const TARGET_HEIGHT = 2;
        const s = maxDim > 0 ? TARGET_HEIGHT / maxDim : 1;
        model.scale.set(s, s, s);

        // Re-centre at ground level after scaling
        const scaledBox = new THREE.Box3().setFromObject(model);
        const yOffset = -scaledBox.min.y;
        model.position.set(-5, yOffset, -3);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(model);
      },
      undefined,
      () => tryLoad(idx + 1)
    );
  }

  tryLoad(0);
}

// ================================================================
//  Animation loop
// ================================================================

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // First-person movement
  if (controls.isLocked) {
    const speed = MOVE_SPEED * delta;
    if (moveState.forward)  controls.moveForward(speed);
    if (moveState.backward) controls.moveForward(-speed);
    if (moveState.left)     controls.moveRight(-speed);
    if (moveState.right)    controls.moveRight(speed);
  }

  // Animated objects
  for (const obj of animatedObjects) {
    if (obj.type === 'spin') {
      obj.mesh.rotation.y += delta * 1.2;
      obj.mesh.rotation.x += delta * 0.5;
    } else if (obj.type === 'bob') {
      obj.mesh.position.y = obj.baseY + Math.sin(elapsed * 3) * 0.35;
    }
  }

  // FPS counter
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    document.getElementById('fpsDisplay').textContent = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = now;
  }

  renderer.render(scene, camera);
}
