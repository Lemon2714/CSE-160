// ============================================================
// Assignment 3 - Virtual World
// A first-person exploration of a 32x32x4 voxel world
// ============================================================

// ---- Shader sources (with distance fog) ----
const VSHADER_SOURCE = `
  attribute vec4 a_Position;
  attribute vec2 a_TexCoord;
  uniform mat4 u_ViewProjMatrix;
  uniform mat4 u_ModelMatrix;
  uniform vec3 u_EyePos;
  varying vec2 v_TexCoord;
  varying float v_Dist;
  void main() {
    vec4 worldPos = u_ModelMatrix * a_Position;
    gl_Position = u_ViewProjMatrix * worldPos;
    v_TexCoord = a_TexCoord;
    v_Dist = distance(worldPos.xyz, u_EyePos);
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;
  uniform sampler2D u_Sampler;
  uniform float u_TexColorWeight;   // 1.0 = texture, 0.0 = solid color
  uniform vec4 u_Color;
  uniform vec3 u_FogColor;
  uniform float u_FogNear;
  uniform float u_FogFar;
  varying vec2 v_TexCoord;
  varying float v_Dist;
  void main() {
    vec4 texColor = texture2D(u_Sampler, v_TexCoord);
    vec4 baseColor = mix(u_Color, texColor, u_TexColorWeight);
    float fogFactor = clamp((u_FogFar - v_Dist) / (u_FogFar - u_FogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(u_FogColor, baseColor.rgb, fogFactor), baseColor.a);
  }
`;

// ---- Solid-color shader for the peacock animal (with fog) ----
const PEACOCK_VS = `
  attribute vec4 a_Position;
  uniform mat4 u_ViewProjMatrix;
  uniform mat4 u_ModelMatrix;
  uniform vec3 u_EyePos;
  varying float v_Dist;
  void main() {
    vec4 worldPos = u_ModelMatrix * a_Position;
    gl_Position = u_ViewProjMatrix * worldPos;
    v_Dist = distance(worldPos.xyz, u_EyePos);
  }
`;

const PEACOCK_FS = `
  precision mediump float;
  uniform vec4 u_Color;
  uniform vec3 u_FogColor;
  uniform float u_FogNear;
  uniform float u_FogFar;
  varying float v_Dist;
  void main() {
    float fogFactor = clamp((u_FogFar - v_Dist) / (u_FogFar - u_FogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(u_FogColor, u_Color.rgb, fogFactor), u_Color.a);
  }
`;

// ---- Globals ----
let gl, canvas;
let program;
let u_ViewProjMatrix, u_ModelMatrix, u_Sampler, u_TexColorWeight, u_Color;
let u_EyePos, u_FogColor, u_FogNear, u_FogFar;

// Peacock shader program + uniform locations
let peacockProgram;
let pu_ViewProjMatrix, pu_ModelMatrix, pu_Color;
let pu_EyePos, pu_FogColor, pu_FogNear, pu_FogFar;

// Peacock geometry buffers (centered at origin, like asgn2)
let peacockCubeBuffers, peacockConeBuffers;

// Camera
let camera;

// FPS tracking
let lastFPSTime = 0;
let frameCount = 0;

// Day/night cycle
let dayTime = 0;           // 0..1 where 0=noon, 0.5=midnight
const DAY_CYCLE_SPEED = 0.015;  // full cycle in ~67 seconds

function getSkyColor(t) {
  // t: 0=noon, 0.25=sunset, 0.5=midnight, 0.75=sunrise
  // Noon: bright blue, Sunset: orange, Night: dark blue, Sunrise: pink
  const noon    = [0.53, 0.81, 0.92];
  const sunset  = [0.95, 0.55, 0.25];
  const night   = [0.05, 0.05, 0.15];
  const sunrise = [0.90, 0.50, 0.55];

  function lerp3(a, b, f) {
    return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
  }

  if (t < 0.25)      return lerp3(noon, sunset, t / 0.25);
  else if (t < 0.5)  return lerp3(sunset, night, (t - 0.25) / 0.25);
  else if (t < 0.75) return lerp3(night, sunrise, (t - 0.5) / 0.25);
  else               return lerp3(sunrise, noon, (t - 0.75) / 0.25);
}

// Terrain heightmap
let terrainVBO, terrainIBO, terrainIndexCount;
const TERRAIN_SIZE = 32;
const TERRAIN_RES  = 64;  // vertices per side (higher = smoother hills)

// Simple value noise for terrain generation
function pseudoNoise(x, z) {
  // Hash-based pseudo-random
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  // Smoothstep
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = pseudoNoise(ix, iz);
  const n10 = pseudoNoise(ix + 1, iz);
  const n01 = pseudoNoise(ix, iz + 1);
  const n11 = pseudoNoise(ix + 1, iz + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sz;
}

function terrainHeight(wx, wz) {
  // Multi-octave noise for natural-looking terrain
  let h = 0;
  h += smoothNoise(wx * 0.1, wz * 0.1) * 1.5;    // broad hills
  h += smoothNoise(wx * 0.25, wz * 0.25) * 0.6;   // medium bumps
  h += smoothNoise(wx * 0.6, wz * 0.6) * 0.2;     // fine detail
  h -= 0.8;  // shift down so most terrain is near y=0

  // Fade to y=0 near edges so terrain meets boundary walls cleanly
  const edgeFade = 2.5;  // fade within this distance of edge
  const fadeX = Math.min(wx, TERRAIN_SIZE - wx) / edgeFade;
  const fadeZ = Math.min(wz, TERRAIN_SIZE - wz) / edgeFade;
  const fade = Math.min(1, Math.min(Math.max(fadeX, 0), Math.max(fadeZ, 0)));
  return h * fade;
}

function createTerrainMesh() {
  const verts = [];  // x,y,z, u,v
  const indices = [];
  const step = TERRAIN_SIZE / TERRAIN_RES;

  for (let iz = 0; iz <= TERRAIN_RES; iz++) {
    for (let ix = 0; ix <= TERRAIN_RES; ix++) {
      const wx = ix * step;
      const wz = iz * step;
      const wy = terrainHeight(wx, wz);
      const u = ix / TERRAIN_RES * 8;  // tile texture 8 times
      const v = iz / TERRAIN_RES * 8;
      verts.push(wx, wy, wz, u, v);
    }
  }

  const w = TERRAIN_RES + 1;
  for (let iz = 0; iz < TERRAIN_RES; iz++) {
    for (let ix = 0; ix < TERRAIN_RES; ix++) {
      const i = iz * w + ix;
      indices.push(i, i + 1, i + w);
      indices.push(i + 1, i + w + 1, i + w);
    }
  }

  terrainVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  terrainIBO = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  terrainIndexCount = indices.length;
}

function drawTerrain() {
  useTexture('grass');
  // Set model matrix to identity (terrain is already in world space)
  let m = new Matrix4();
  gl.uniformMatrix4fv(u_ModelMatrix, false, m.elements);
  gl.uniform1f(u_TexColorWeight, 1.0);
  gl.uniform4fv(u_Color, [0.3, 0.6, 0.2, 1.0]);

  // Bind terrain buffers
  gl.bindBuffer(gl.ARRAY_BUFFER, terrainVBO);
  const FSIZE = Float32Array.BYTES_PER_ELEMENT;
  const posLoc = gl.getAttribLocation(program, 'a_Position');
  const texLoc = gl.getAttribLocation(program, 'a_TexCoord');
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, FSIZE * 5, 0);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, FSIZE * 5, FSIZE * 3);
  gl.enableVertexAttribArray(texLoc);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIBO);
  gl.drawElements(gl.TRIANGLES, terrainIndexCount, gl.UNSIGNED_SHORT, 0);
}

// ============================================================
// EGG HUNT MINIGAME
// ============================================================
const TOTAL_EGGS = 10;
const EGG_COLLECT_RADIUS = 2.0;  // how close player must be to collect

// Egg positions scattered around open areas of the 32x32 map
// Each: { x, z, collected }
const eggs = [
  { x:  5.5, z:  5.5, collected: false },   // near top-left room
  { x: 15.5, z:  2.5, collected: false },   // top center corridor
  { x: 28.5, z:  3.5, collected: false },   // top right area
  { x: 24.0, z:  5.0, collected: false },   // inside tall room
  { x: 12.0, z: 12.0, collected: false },   // inside small room center
  { x:  2.5, z: 16.0, collected: false },   // left edge middle
  { x: 20.0, z: 20.0, collected: false },   // inside bottom-right room
  { x:  8.0, z: 25.0, collected: false },   // bottom-left open area
  { x: 16.0, z: 28.0, collected: false },   // bottom center
  { x: 28.0, z: 28.0, collected: false },   // bottom-right corner
];

let eggsCollected = 0;
let allEggsFound = false;

function checkEggCollection() {
  if (allEggsFound) return;
  const px = camera.eye.elements[0];
  const pz = camera.eye.elements[2];

  for (let egg of eggs) {
    if (egg.collected) continue;
    const dx = px - egg.x;
    const dz = pz - egg.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < EGG_COLLECT_RADIUS) {
      egg.collected = true;
      eggsCollected++;
      updateEggHUD();
      if (eggsCollected >= TOTAL_EGGS) {
        allEggsFound = true;
        showVictoryMessage();
      }
    }
  }
}

function updateEggHUD() {
  const el = document.getElementById('eggCounter');
  if (el) {
    el.textContent = 'Eggs: ' + eggsCollected + ' / ' + TOTAL_EGGS;
    if (eggsCollected >= TOTAL_EGGS) {
      el.style.color = '#0f0';
      el.textContent = 'All eggs found!';
    }
  }
}

function showVictoryMessage() {
  const el = document.getElementById('victoryMsg');
  if (el) {
    el.style.display = 'block';
    // Hide after animation completes
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

// Draw a single egg at world position (golden ellipsoid from cubes)
function drawEgg(ex, ez) {
  // Egg sits on the terrain, bobbing up and down + spinning
  const groundY = terrainHeight(ex, ez);
  const bobY = groundY + 0.5 + Math.sin(performance.now() / 500 + ex + ez) * 0.15;
  const spin = (performance.now() / 1000 * 60 + ex * 50) % 360;

  // Main egg body (tall ellipsoid approximated by a scaled cube)
  let m = new Matrix4();
  m.translate(ex, bobY, ez);
  m.rotate(spin, 0, 1, 0);
  m.scale(0.25, 0.4, 0.25);
  drawCube(m, 0.0, [1.0, 0.85, 0.2, 1.0]);  // golden color, no texture

  // Small highlight on top
  let m2 = new Matrix4();
  m2.translate(ex, bobY + 0.15, ez);
  m2.rotate(spin, 0, 1, 0);
  m2.scale(0.15, 0.2, 0.15);
  drawCube(m2, 0.0, [1.0, 0.95, 0.5, 1.0]);  // lighter gold
}

function drawAllEggs() {
  // Use white texture so color comes through cleanly
  useTexture('white');
  for (let egg of eggs) {
    if (!egg.collected) {
      drawEgg(egg.x, egg.z);
    }
  }
}

// ---- Camera class ----
class Camera {
  constructor() {
    this.eye = new Vector3([16, 2, 16]);    // Start near center of 32x32 world
    this.at  = new Vector3([16, 2, 15]);     // Looking along -Z
    this.up  = new Vector3([0, 1, 0]);

    this.fov = 60;
    this.moveSpeed = 0.15;
    this.rotSpeed  = 3;   // degrees per key press / mouse move
  }

  viewMatrix() {
    const v = new Matrix4();
    v.setLookAt(
      this.eye.elements[0], this.eye.elements[1], this.eye.elements[2],
      this.at.elements[0],  this.at.elements[1],  this.at.elements[2],
      this.up.elements[0],  this.up.elements[1],  this.up.elements[2]
    );
    return v;
  }

  projMatrix() {
    const p = new Matrix4();
    p.setPerspective(this.fov, canvas.width / canvas.height, 0.1, 200);
    return p;
  }

  viewProjMatrix() {
    const vp = this.projMatrix();
    vp.multiply(this.viewMatrix());
    return vp;
  }

  // Forward direction (normalized, in XZ plane)
  forward() {
    let f = new Vector3([
      this.at.elements[0] - this.eye.elements[0],
      0,
      this.at.elements[2] - this.eye.elements[2]
    ]);
    f.normalize();
    return f;
  }

  // Right direction (cross of forward and up, in XZ plane)
  right() {
    let f = this.forward();
    // cross(f, up) = (f.z * up.y - f.y * up.z, ..., f.x * up.y - f.y * up.x)
    // simplified since up = (0,1,0) and f.y = 0:
    let r = new Vector3([-f.elements[2], 0, f.elements[0]]);
    r.normalize();
    return r;
  }

  moveForward()  { this._move(this.forward(),  this.moveSpeed); }
  moveBackward() { this._move(this.forward(), -this.moveSpeed); }
  moveLeft()     { this._move(this.right(),    -this.moveSpeed); }
  moveRight()    { this._move(this.right(),     this.moveSpeed); }

  _move(dir, dist) {
    this.eye.elements[0] += dir.elements[0] * dist;
    this.eye.elements[2] += dir.elements[2] * dist;
    this.at.elements[0]  += dir.elements[0] * dist;
    this.at.elements[2]  += dir.elements[2] * dist;
  }

  // Rotate camera left/right (yaw) by angle in degrees
  panLeft(angle) {
    let d = new Vector3([
      this.at.elements[0] - this.eye.elements[0],
      this.at.elements[1] - this.eye.elements[1],
      this.at.elements[2] - this.eye.elements[2]
    ]);
    let rotMat = new Matrix4();
    rotMat.setRotate(angle, this.up.elements[0], this.up.elements[1], this.up.elements[2]);
    let d_prime = rotMat.multiplyVector3(d);
    this.at.elements[0] = this.eye.elements[0] + d_prime.elements[0];
    this.at.elements[1] = this.eye.elements[1] + d_prime.elements[1];
    this.at.elements[2] = this.eye.elements[2] + d_prime.elements[2];
  }

  panRight(angle) {
    this.panLeft(-angle);
  }

  // Rotate camera up/down (pitch) by angle in degrees
  tilt(angle) {
    let d = new Vector3([
      this.at.elements[0] - this.eye.elements[0],
      this.at.elements[1] - this.eye.elements[1],
      this.at.elements[2] - this.eye.elements[2]
    ]);
    let r = this.right();
    let rotMat = new Matrix4();
    rotMat.setRotate(angle, r.elements[0], r.elements[1], r.elements[2]);
    let d_prime = rotMat.multiplyVector3(d);

    // Prevent flipping past straight up/down
    let newY = d_prime.elements[1];
    let len = Math.sqrt(
      d_prime.elements[0] ** 2 + d_prime.elements[1] ** 2 + d_prime.elements[2] ** 2
    );
    if (Math.abs(newY / len) > 0.95) return; // clamp pitch

    this.at.elements[0] = this.eye.elements[0] + d_prime.elements[0];
    this.at.elements[1] = this.eye.elements[1] + d_prime.elements[1];
    this.at.elements[2] = this.eye.elements[2] + d_prime.elements[2];
  }
}

// ---- Cube vertex data (with texture coordinates) ----
// Each face: 4 vertices, 2 triangles = 6 indices
// Position (x,y,z) + TexCoord (u,v) per vertex
function createTexturedCubeBuffer() {
  // prettier-ignore
  const vertexData = new Float32Array([
    // Front face (z=1)
    0,0,1,  0,0,
    1,0,1,  1,0,
    1,1,1,  1,1,
    0,1,1,  0,1,
    // Back face (z=0)
    1,0,0,  0,0,
    0,0,0,  1,0,
    0,1,0,  1,1,
    1,1,0,  0,1,
    // Top face (y=1)
    0,1,1,  0,0,
    1,1,1,  1,0,
    1,1,0,  1,1,
    0,1,0,  0,1,
    // Bottom face (y=0)
    0,0,0,  0,0,
    1,0,0,  1,0,
    1,0,1,  1,1,
    0,0,1,  0,1,
    // Right face (x=1)
    1,0,1,  0,0,
    1,0,0,  1,0,
    1,1,0,  1,1,
    1,1,1,  0,1,
    // Left face (x=0)
    0,0,0,  0,0,
    0,0,1,  1,0,
    0,1,1,  1,1,
    0,1,0,  0,1,
  ]);

  const indices = new Uint16Array([
     0, 1, 2,   0, 2, 3,  // front
     4, 5, 6,   4, 6, 7,  // back
     8, 9,10,   8,10,11,  // top
    12,13,14,  12,14,15,  // bottom
    16,17,18,  16,18,19,  // right
    20,21,22,  20,22,23,  // left
  ]);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return { vbo, ibo, indexCount: indices.length };
}

let cubeBuffer;

// ---- Draw a single cube ----
function drawCube(modelMatrix, texWeight, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
  gl.uniform1f(u_TexColorWeight, texWeight);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, cubeBuffer.indexCount, gl.UNSIGNED_SHORT, 0);
}

// ---- Texture loading ----
let textures = {};

function loadTexture(name, url) {
  const tex = gl.createTexture();
  const img = new Image();
  img.onload = function () {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    textures[name] = tex;
    console.log('Loaded texture:', name);
  };
  img.onerror = function () {
    console.warn('Failed to load texture:', name, url);
  };
  img.src = url;
}

function useTexture(name) {
  if (textures[name]) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[name]);
    gl.uniform1i(u_Sampler, 0);
  }
}

// ---- Create a 1x1 white texture as fallback ----
function createWhiteTexture() {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const pixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  textures['white'] = tex;
}

// ---- World map (32x32, values 0-4 represent wall height) ----
// 0 = no wall (open ground), 1-4 = wall of that height in cubes
// prettier-ignore
const worldMap = [
  [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,4],
  [4,0,0,2,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,3,0,0,0,0,0,4],
  [4,0,0,2,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,3,0,0,0,0,0,4],
  [4,0,0,2,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,3,0,0,0,0,0,4],
  [4,0,0,2,2,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,2,2,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
  [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
];

// Dynamic blocks added/removed by the player
let dynamicBlocks = {};  // key: "x,y,z" -> true

function blockKey(x, y, z) { return x + ',' + y + ',' + z; }

function hasBlock(x, y, z) {
  const key = blockKey(x, y, z);
  if (dynamicBlocks[key] === false) return false; // explicitly removed
  if (dynamicBlocks[key] === true)  return true;  // explicitly added
  // Check world map
  if (x < 0 || x >= 32 || z < 0 || z >= 32) return false;
  if (y < 0 || y >= 4) return false;
  const height = worldMap[z][x];
  return y < height;
}

function addBlock() {
  let pos = getTargetBlock();
  if (!pos) return;
  // Place adjacent to the targeted face
  let [x, y, z] = pos.place;
  if (y < 0 || y > 5) return;
  dynamicBlocks[blockKey(x, y, z)] = true;
}

function removeBlock() {
  let pos = getTargetBlock();
  if (!pos) return;
  let [x, y, z] = pos.hit;
  // Don't remove ground or boundary walls (optional protection)
  dynamicBlocks[blockKey(x, y, z)] = false;
}

// Raycast from camera to find the block we're looking at
function getTargetBlock() {
  const eye = camera.eye.elements;
  const at  = camera.at.elements;
  let dx = at[0] - eye[0];
  let dy = at[1] - eye[1];
  let dz = at[2] - eye[2];
  let len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  dx /= len; dy /= len; dz /= len;

  const maxDist = 8;
  const step = 0.1;
  let prevX = -1, prevY = -1, prevZ = -1;

  for (let t = 0; t < maxDist; t += step) {
    let px = eye[0] + dx * t;
    let py = eye[1] + dy * t;
    let pz = eye[2] + dz * t;
    let bx = Math.floor(px);
    let by = Math.floor(py);
    let bz = Math.floor(pz);

    if (hasBlock(bx, by, bz)) {
      return {
        hit: [bx, by, bz],
        place: [prevX, prevY, prevZ]
      };
    }
    prevX = bx; prevY = by; prevZ = bz;
  }
  return null;
}

// ---- Input handling ----
let keys = {};

function setupInput() {
  document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  document.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

  // Mouse look (pointer lock)
  canvas.addEventListener('click', (e) => {
    if (!document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    // Nothing extra needed
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    const sensitivity = 0.15;
    camera.panLeft(-e.movementX * sensitivity);
    camera.tilt(-e.movementY * sensitivity);
  });

  // Place / remove blocks (while pointer is locked)
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) addBlock();    // left click
    if (e.button === 2) removeBlock(); // right click
  });

  // Prevent context menu
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function processKeys() {
  if (keys['w']) camera.moveForward();
  if (keys['s']) camera.moveBackward();
  if (keys['a']) camera.moveLeft();
  if (keys['d']) camera.moveRight();
  if (keys['q']) camera.panLeft(camera.rotSpeed);
  if (keys['e']) camera.panRight(camera.rotSpeed);
}

// ---- Drawing the world ----
function drawWorld(skyCol) {
  if (!skyCol) skyCol = [0.53, 0.81, 0.92];

  // Sky box (large cube colored to match current sky)
  let skyM = new Matrix4();
  skyM.translate(-50, -50, -50);
  skyM.scale(132, 132, 132);
  drawCube(skyM, 0.0, [skyCol[0], skyCol[1], skyCol[2], 1.0]);

  // Terrain (replaces flat ground plane)
  drawTerrain();

  // Re-bind cube buffers after terrain drew with its own buffers
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer.vbo);
  const FSIZE = Float32Array.BYTES_PER_ELEMENT;
  const posLoc = gl.getAttribLocation(program, 'a_Position');
  const texLoc = gl.getAttribLocation(program, 'a_TexCoord');
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, FSIZE * 5, 0);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, FSIZE * 5, FSIZE * 3);
  gl.enableVertexAttribArray(texLoc);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeBuffer.ibo);

  // Draw walls from the map
  useTexture('wall');
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      let h = worldMap[z][x];
      for (let y = 0; y < h; y++) {
        let key = blockKey(x, y, z);
        if (dynamicBlocks[key] === false) continue; // removed
        let m = new Matrix4();
        m.translate(x, y, z);
        drawCube(m, 1.0, [0.8, 0.8, 0.8, 1.0]);
      }
    }
  }

  // Draw dynamically added blocks
  useTexture('wall');
  for (let key in dynamicBlocks) {
    if (dynamicBlocks[key] !== true) continue;
    let parts = key.split(',').map(Number);
    // Skip if this was already part of the worldMap
    let [bx, by, bz] = parts;
    if (bx >= 0 && bx < 32 && bz >= 0 && bz < 32 && by < worldMap[bz][bx]) continue;
    let m = new Matrix4();
    m.translate(bx, by, bz);
    drawCube(m, 1.0, [0.8, 0.8, 0.8, 1.0]);
  }

  // ---- Draw eggs ----
  drawAllEggs();

  // ---- Draw the peacock animal ----
  // Place it in the back-left corner, facing -Z (same direction player starts looking)
  drawPeacock(3, 1, 27);

  // Switch back to the textured program for any subsequent draws
  gl.useProgram(program);
}

// ---- Render loop ----
const PLAYER_EYE_HEIGHT = 2.0;  // height of eyes above terrain

function tick() {
  processKeys();

  // Adjust camera Y to follow terrain
  const groundY = terrainHeight(camera.eye.elements[0], camera.eye.elements[2]);
  const targetY = groundY + PLAYER_EYE_HEIGHT;
  const deltaY = targetY - camera.eye.elements[1];
  camera.eye.elements[1] += deltaY;
  camera.at.elements[1]  += deltaY;

  // Resize canvas to fill window
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Check egg collection
  checkEggCollection();

  // Update peacock animation
  updatePeacockAnimation(1 / 60);

  // Advance day/night cycle
  dayTime = (dayTime + DAY_CYCLE_SPEED / 60) % 1.0;
  const skyCol = getSkyColor(dayTime);

  gl.clearColor(skyCol[0], skyCol[1], skyCol[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set view-projection matrix + fog/eye uniforms on textured program
  gl.useProgram(program);
  let vpMat = camera.viewProjMatrix();
  gl.uniformMatrix4fv(u_ViewProjMatrix, false, vpMat.elements);
  gl.uniform3f(u_EyePos, camera.eye.elements[0], camera.eye.elements[1], camera.eye.elements[2]);
  gl.uniform3f(u_FogColor, skyCol[0], skyCol[1], skyCol[2]);
  gl.uniform1f(u_FogNear, 20.0);
  gl.uniform1f(u_FogFar, 50.0);

  // Bind the cube VBO/IBO once
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer.vbo);
  const FSIZE = Float32Array.BYTES_PER_ELEMENT;
  const a_Position = gl.getAttribLocation(program, 'a_Position');
  const a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord');
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, FSIZE * 5, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, FSIZE * 5, FSIZE * 3);
  gl.enableVertexAttribArray(a_TexCoord);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeBuffer.ibo);

  drawWorld(skyCol);

  // FPS counter
  frameCount++;
  let now = performance.now();
  if (now - lastFPSTime > 500) {
    let fps = Math.round(frameCount / ((now - lastFPSTime) / 1000));
    document.getElementById('fpsDisplay').textContent = 'FPS: ' + fps;
    frameCount = 0;
    lastFPSTime = now;
  }

  requestAnimationFrame(tick);
}

// ---- Initialization ----
function main() {
  canvas = document.getElementById('glCanvas');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) {
    alert('WebGL not supported!');
    return;
  }

  // Compile shaders
  program = createProgramFromSources(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  gl.useProgram(program);

  // Get uniform locations
  u_ViewProjMatrix = gl.getUniformLocation(program, 'u_ViewProjMatrix');
  u_ModelMatrix    = gl.getUniformLocation(program, 'u_ModelMatrix');
  u_Sampler        = gl.getUniformLocation(program, 'u_Sampler');
  u_TexColorWeight = gl.getUniformLocation(program, 'u_TexColorWeight');
  u_Color          = gl.getUniformLocation(program, 'u_Color');
  u_EyePos         = gl.getUniformLocation(program, 'u_EyePos');
  u_FogColor       = gl.getUniformLocation(program, 'u_FogColor');
  u_FogNear        = gl.getUniformLocation(program, 'u_FogNear');
  u_FogFar         = gl.getUniformLocation(program, 'u_FogFar');

  // GL state
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.92, 1.0);

  // Create cube buffer
  cubeBuffer = createTexturedCubeBuffer();

  // Create terrain mesh
  createTerrainMesh();

  // Create fallback white texture
  createWhiteTexture();

  // Generate procedural textures as fallbacks
  generateProceduralTextures();

  // Load real image textures (override procedural ones when loaded)
  loadTexture('grass', 'grass.jpg');
  loadTexture('wall',  'dirt.jpg');

  // Compile peacock solid-color shader
  peacockProgram = createProgramFromSources(gl, PEACOCK_VS, PEACOCK_FS);
  pu_ViewProjMatrix = gl.getUniformLocation(peacockProgram, 'u_ViewProjMatrix');
  pu_ModelMatrix    = gl.getUniformLocation(peacockProgram, 'u_ModelMatrix');
  pu_Color          = gl.getUniformLocation(peacockProgram, 'u_Color');
  pu_EyePos         = gl.getUniformLocation(peacockProgram, 'u_EyePos');
  pu_FogColor       = gl.getUniformLocation(peacockProgram, 'u_FogColor');
  pu_FogNear        = gl.getUniformLocation(peacockProgram, 'u_FogNear');
  pu_FogFar         = gl.getUniformLocation(peacockProgram, 'u_FogFar');

  // Create peacock geometry buffers
  peacockCubeBuffers = createCenteredCubeBuffers();
  peacockConeBuffers = createPeacockConeBuffers(0.5, 1.0, 16);

  // Camera
  camera = new Camera();

  // Input
  setupInput();

  // Start render loop
  lastFPSTime = performance.now();
  tick();

  console.log('Virtual World initialized. Click the canvas to enable mouse look.');
}

// ---- Shader compilation helpers ----
function createShaderFromSource(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgramFromSources(gl, vsSource, fsSource) {
  const vs = createShaderFromSource(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShaderFromSource(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// ---- Procedural Texture Generation ----
// We generate textures programmatically so no image files are needed to start
function generateProceduralTextures() {
  // Grass texture
  textures['grass'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const noise = Math.random() * 30;
    pixels[i]     = 50 + noise;       // R
    pixels[i + 1] = 120 + noise;      // G
    pixels[i + 2] = 30 + noise;       // B
    pixels[i + 3] = 255;              // A
  });

  // Wall / brick texture
  textures['wall'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const brickH = 8;
    const brickW = 16;
    const mortarSize = 1;
    const row = Math.floor(y / brickH);
    const offset = (row % 2 === 0) ? 0 : brickW / 2;
    const lx = (x + offset) % brickW;
    const ly = y % brickH;
    const isMortar = lx < mortarSize || ly < mortarSize;
    const noise = Math.random() * 15;
    if (isMortar) {
      pixels[i]     = 180 + noise;
      pixels[i + 1] = 175 + noise;
      pixels[i + 2] = 160 + noise;
      pixels[i + 3] = 255;
    } else {
      pixels[i]     = 150 + noise;
      pixels[i + 1] = 70  + noise;
      pixels[i + 2] = 50  + noise;
      pixels[i + 3] = 255;
    }
  });

  // Dirt texture
  textures['dirt'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const noise = Math.random() * 40;
    pixels[i]     = 120 + noise;
    pixels[i + 1] = 80  + noise;
    pixels[i + 2] = 50  + noise;
    pixels[i + 3] = 255;
  });
}

function makeProceduralTexture(size, paintFn) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      paintFn(x, y, pixels, size);
    }
  }
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

// ============================================================
// PEACOCK ANIMAL (ported from asgn2)
// ============================================================

// ---- Centered cube buffers (vertices from -0.5 to +0.5) ----
function createCenteredCubeBuffers() {
  const s = 0.5;
  // prettier-ignore
  const positions = new Float32Array([
    // Front (z=+s)
    -s,-s, s,  s,-s, s,  s, s, s,  -s, s, s,
    // Back (z=-s)
     s,-s,-s, -s,-s,-s, -s, s,-s,   s, s,-s,
    // Top (y=+s)
    -s, s, s,  s, s, s,  s, s,-s,  -s, s,-s,
    // Bottom (y=-s)
    -s,-s,-s,  s,-s,-s,  s,-s, s,  -s,-s, s,
    // Right (x=+s)
     s,-s, s,  s,-s,-s,  s, s,-s,   s, s, s,
    // Left (x=-s)
    -s,-s,-s, -s,-s, s, -s, s, s,  -s, s,-s,
  ]);
  // prettier-ignore
  const indices = new Uint16Array([
     0, 1, 2,  0, 2, 3,
     4, 5, 6,  4, 6, 7,
     8, 9,10,  8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length, stride: 3 };
}

// ---- Cone buffers (tip at +Z, base at z=0) ----
function createPeacockConeBuffers(radius, height, segments) {
  const positions = [];
  const indices = [];
  // Tip
  positions.push(0, 0, height);
  // Base center
  positions.push(0, 0, 0);
  // Base ring
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  // Base ring duplicate for base cap
  const baseStart2 = 2 + segments + 1;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  // Side triangles
  for (let i = 0; i < segments; i++) {
    indices.push(0, 2 + i, 2 + i + 1);
  }
  // Base cap
  for (let i = 0; i < segments; i++) {
    indices.push(1, baseStart2 + i + 1, baseStart2 + i);
  }
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length, stride: 3 };
}

// ---- Draw helpers for peacock primitives ----
function drawPeacockPrimitive(buffers, M, color) {
  gl.useProgram(peacockProgram);
  // Bind VBO
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vbo);
  const posLoc = gl.getAttribLocation(peacockProgram, 'a_Position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
  // Uniforms
  gl.uniformMatrix4fv(pu_ModelMatrix, false, M.elements);
  gl.uniform4fv(pu_Color, color);
  // Draw
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.ibo);
  gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
}

function drawPCube(M, color) { drawPeacockPrimitive(peacockCubeBuffers, M, color); }
function drawPCone(M, color) { drawPeacockPrimitive(peacockConeBuffers, M, color); }

// ---- Peacock animation state ----
let peacockTime = 0;
let peacockAnimOn = true;

// Joint angles
let pNeckBase = -20, pNeckMid = 10;
let pLeftUpper = 10, pLeftLower = 15;
let pRightUpper = 10, pRightLower = 15;
let pLeftWing = -5, pRightWing = 5;

function updatePeacockAnimation(dt) {
  if (!peacockAnimOn) return;
  peacockTime += dt;
  const t = peacockTime;

  if (allEggsFound) {
    // ---- Celebration: looping poke/flap animation from asgn2 ----
    // Use a looping time (mod the cycle duration for infinite loop)
    const cycleDuration = 1.5;
    const pokeTime = t % cycleDuration;
    const flapDecay = 1 - (pokeTime / cycleDuration);
    const flapSpeed = 20;
    const flapAmplitude = 70 * flapDecay;

    // Wing flapping
    pLeftWing  = -5 - Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;
    pRightWing =  5 + Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;

    // Startled head jerk
    const headJerk = Math.sin(pokeTime * 15) * 20 * flapDecay;
    pNeckBase = headJerk;
    pNeckMid  = 10 + headJerk * 0.5;

    // Legs stay still during celebration
    pLeftUpper = 10; pLeftLower = 15;
    pRightUpper = 10; pRightLower = 15;
    return;
  }

  // ---- Normal idle/walk animation ----
  // Reset wings to tucked
  pLeftWing = -5;
  pRightWing = 5;

  // Neck bob
  pNeckBase = Math.sin(t * 2) * 15;
  pNeckMid  = 5 + Math.sin(t * 2 - 0.3) * 18 + Math.sin(t * 5) * 8;

  // Walking legs
  const ws = 4, hs = 25;
  const lp = t * ws;
  pLeftUpper = 10 + Math.sin(lp) * hs;
  const lk = Math.sin(lp);
  pLeftLower = 20 + (lk > 0 ? lk * 55 : lk * 15) + Math.sin(lp * 2) * 10;

  const rp = t * ws + Math.PI;
  pRightUpper = 10 + Math.sin(rp) * hs;
  const rk = Math.sin(rp);
  pRightLower = 20 + (rk > 0 ? rk * 55 : rk * 15) + Math.sin(rp * 2) * 10;
}

// ---- Draw the full peacock at a world position ----
function drawPeacock(wx, wy, wz) {
  // Set shared VP matrix + fog on peacock program
  gl.useProgram(peacockProgram);
  let vpMat = camera.viewProjMatrix();
  gl.uniformMatrix4fv(pu_ViewProjMatrix, false, vpMat.elements);
  gl.uniform3f(pu_EyePos, camera.eye.elements[0], camera.eye.elements[1], camera.eye.elements[2]);
  const skyCol = getSkyColor(dayTime);
  gl.uniform3f(pu_FogColor, skyCol[0], skyCol[1], skyCol[2]);
  gl.uniform1f(pu_FogNear, 20.0);
  gl.uniform1f(pu_FogFar, 50.0);

  // Colors
  const C_BODY  = [0.5, 0.5, 0.5, 1];
  const C_NECK  = [0.2, 0.4, 0.9, 1];
  const C_TAIL  = [0.2, 0.7, 0.3, 1];
  const C_LEGS  = [0.76, 0.6, 0.42, 1];
  const C_BEAK  = [0.9, 0.9, 0.85, 1];
  const C_EYES  = [0.05, 0.05, 0.05, 1];
  const C_WINGS = [0.65, 0.65, 0.65, 1];

  // Root transform — place peacock in the world, rotated to face -Z (player's initial direction)
  const root = new Matrix4();
  root.translate(wx, wy, wz);
  root.rotate(180, 0, 1, 0);

  // 1) BODY
  const bodyJoint = new Matrix4(root);
  bodyJoint.translate(0, 0.6, 0);
  const bodyR = new Matrix4(bodyJoint);
  bodyR.scale(1.2, 0.6, 1.6);
  drawPCube(bodyR, C_BODY);

  // WINGS
  const lwR = new Matrix4(bodyJoint);
  lwR.translate(-0.6, 0.1, -0.1);
  lwR.rotate(pLeftWing, 0, 0, 1);
  lwR.translate(-0.1, 0, 0);
  lwR.scale(0.25, 0.45, 0.85);
  drawPCube(lwR, C_WINGS);

  const rwR = new Matrix4(bodyJoint);
  rwR.translate(0.6, 0.1, -0.1);
  rwR.rotate(pRightWing, 0, 0, 1);
  rwR.translate(0.1, 0, 0);
  rwR.scale(0.25, 0.45, 0.85);
  drawPCube(rwR, C_WINGS);

  // 2) NECK CHAIN
  const neckBaseJ = new Matrix4(bodyJoint);
  neckBaseJ.translate(0, 0.3, 0.6);
  neckBaseJ.rotate(pNeckBase, 1, 0, 0);
  const nbR = new Matrix4(neckBaseJ);
  nbR.scale(0.25, 0.5, 0.25);
  drawPCube(nbR, C_NECK);

  const neckMidJ = new Matrix4(neckBaseJ);
  neckMidJ.translate(0, 0.25, 0);
  neckMidJ.rotate(pNeckMid, 1, 0, 0);
  neckMidJ.translate(0, 0.225, 0);
  const nmR = new Matrix4(neckMidJ);
  nmR.scale(0.22, 0.45, 0.22);
  drawPCube(nmR, C_NECK);

  // HEAD
  const headJ = new Matrix4(neckMidJ);
  headJ.translate(0, 0.365, 0.05);
  const headR = new Matrix4(headJ);
  headR.scale(0.35, 0.28, 0.28);
  drawPCube(headR, C_NECK);

  // BEAK (cone)
  const beakJ = new Matrix4(headJ);
  beakJ.translate(0, -0.02, 0.14);
  beakJ.rotate(15, 1, 0, 0);
  const beakR = new Matrix4(beakJ);
  beakR.scale(0.05, 0.04, 0.22);
  drawPCone(beakR, C_BEAK);

  // EYES
  const leR = new Matrix4(headJ);
  leR.translate(-0.16, 0.03, 0.08);
  leR.scale(0.04, 0.04, 0.04);
  drawPCube(leR, C_EYES);

  const reR = new Matrix4(headJ);
  reR.translate(0.16, 0.03, 0.08);
  reR.scale(0.04, 0.04, 0.04);
  drawPCube(reR, C_EYES);

  // CREST FEATHERS
  for (let i = 0; i < 5; i++) {
    const cJ = new Matrix4(headJ);
    const ang = (i - 2) * 12;
    cJ.translate(0, 0.14, -0.02);
    cJ.rotate(ang, 0, 0, 1);
    cJ.rotate(-25, 1, 0, 0);
    const cR = new Matrix4(cJ);
    cR.translate(0, 0.12, 0);
    cR.scale(0.02, 0.25, 0.02);
    drawPCube(cR, C_NECK);
  }

  // 3) TAIL
  for (let i = -2; i <= 2; i++) {
    const tJ = new Matrix4(bodyJoint);
    const fd = 0.6 + Math.abs(i) * 0.8;
    tJ.translate(i * 0.15, 0.3 + Math.abs(i) * 0.05, -0.8 - fd / 2);
    tJ.rotate(i * 8, 0, 1, 0);
    const tR = new Matrix4(tJ);
    tR.scale(0.2, 0.6, fd);
    drawPCube(tR, C_TAIL);
  }

  // 4) LEFT LEG
  const luJ = new Matrix4(bodyJoint);
  luJ.translate(-0.4, -0.3, 0.4);
  luJ.rotate(pLeftUpper, 1, 0, 0);
  const luR = new Matrix4(luJ);
  luR.scale(0.2, 0.4, 0.2);
  drawPCube(luR, C_LEGS);

  const llJ = new Matrix4(luJ);
  llJ.translate(0, -0.2, 0);
  llJ.rotate(pLeftLower, 1, 0, 0);
  llJ.translate(0, -0.175, 0);
  const llR = new Matrix4(llJ);
  llR.scale(0.18, 0.35, 0.18);
  drawPCube(llR, C_LEGS);

  const lfJ = new Matrix4(llJ);
  lfJ.translate(0, -0.215, 0.1);
  lfJ.rotate(-20, 1, 0, 0);
  const lfR = new Matrix4(lfJ);
  lfR.scale(0.28, 0.08, 0.5);
  drawPCube(lfR, C_LEGS);

  // 5) RIGHT LEG
  const ruJ = new Matrix4(bodyJoint);
  ruJ.translate(0.4, -0.3, 0.4);
  ruJ.rotate(pRightUpper, 1, 0, 0);
  const ruR = new Matrix4(ruJ);
  ruR.scale(0.2, 0.4, 0.2);
  drawPCube(ruR, C_LEGS);

  const rlJ = new Matrix4(ruJ);
  rlJ.translate(0, -0.2, 0);
  rlJ.rotate(pRightLower, 1, 0, 0);
  rlJ.translate(0, -0.175, 0);
  const rlR = new Matrix4(rlJ);
  rlR.scale(0.18, 0.35, 0.18);
  drawPCube(rlR, C_LEGS);

  const rfJ = new Matrix4(rlJ);
  rfJ.translate(0, -0.215, 0.1);
  rfJ.rotate(-20, 1, 0, 0);
  const rfR = new Matrix4(rfJ);
  rfR.scale(0.28, 0.08, 0.5);
  drawPCube(rfR, C_LEGS);
}

// ---- Start ----
window.onload = main;
