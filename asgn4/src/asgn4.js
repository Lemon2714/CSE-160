// ============================================================
// Assignment 4 - Lighting (Phong Shader)
// Built on Assignment 3 Virtual World
// ============================================================

// ---- Unified Phong Shader ----
const VSHADER_SOURCE = `
  precision mediump float;
  attribute vec4 a_Position;
  attribute vec3 a_Normal;
  attribute vec2 a_TexCoord;
  uniform mat4 u_ModelMatrix;
  uniform mat4 u_NormalMatrix;
  uniform mat4 u_ViewProjMatrix;
  uniform vec3 u_EyePos;
  varying vec3 v_Normal;
  varying vec3 v_WorldPos;
  varying vec2 v_TexCoord;
  varying float v_Dist;
  void main() {
    vec4 worldPos = u_ModelMatrix * a_Position;
    gl_Position = u_ViewProjMatrix * worldPos;
    v_Normal = normalize((u_NormalMatrix * vec4(a_Normal, 0.0)).xyz);
    v_WorldPos = worldPos.xyz;
    v_TexCoord = a_TexCoord;
    v_Dist = distance(worldPos.xyz, u_EyePos);
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;
  uniform int u_LightingOn;
  uniform int u_NormalViz;

  uniform vec3 u_PointLightPos;
  uniform vec3 u_PointLightColor;
  uniform int u_PointLightOn;

  uniform vec3 u_SpotLightPos;
  uniform vec3 u_SpotLightDir;
  uniform float u_SpotCutoff;
  uniform vec3 u_SpotLightColor;
  uniform int u_SpotLightOn;

  uniform vec3 u_EyePos;
  uniform float u_TexColorWeight;
  uniform vec4 u_Color;
  uniform sampler2D u_Sampler;

  uniform vec3 u_FogColor;
  uniform float u_FogNear;
  uniform float u_FogFar;

  varying vec3 v_Normal;
  varying vec3 v_WorldPos;
  varying vec2 v_TexCoord;
  varying float v_Dist;

  void main() {
    vec3 N = normalize(v_Normal);

    if (u_NormalViz > 0) {
      gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
      return;
    }

    vec4 texColor = texture2D(u_Sampler, v_TexCoord);
    vec4 baseColor = mix(u_Color, texColor, u_TexColorWeight);

    vec3 litColor;

    if (u_LightingOn > 0) {
      vec3 V = normalize(u_EyePos - v_WorldPos);
      vec3 ambient = 0.15 * baseColor.rgb;
      vec3 diffSpec = vec3(0.0);

      if (u_PointLightOn > 0) {
        vec3 L = normalize(u_PointLightPos - v_WorldPos);
        float nDotL = max(dot(N, L), 0.0);
        vec3 R = reflect(-L, N);
        float spec = pow(max(dot(R, V), 0.0), 32.0);
        diffSpec += u_PointLightColor * (baseColor.rgb * nDotL + vec3(spec * 0.5));
      }

      if (u_SpotLightOn > 0) {
        vec3 L = normalize(u_SpotLightPos - v_WorldPos);
        float theta = dot(L, normalize(-u_SpotLightDir));
        if (theta > u_SpotCutoff) {
          float epsilon = 1.0 - u_SpotCutoff;
          float intensity = clamp((theta - u_SpotCutoff) / epsilon, 0.0, 1.0);
          intensity = intensity * intensity;
          float nDotL = max(dot(N, L), 0.0);
          vec3 R = reflect(-L, N);
          float spec = pow(max(dot(R, V), 0.0), 32.0);
          diffSpec += u_SpotLightColor * (baseColor.rgb * nDotL + vec3(spec * 0.5)) * intensity;
        }
      }

      litColor = ambient + diffSpec;
    } else {
      litColor = baseColor.rgb;
    }

    float fogFactor = clamp((u_FogFar - v_Dist) / (u_FogFar - u_FogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(u_FogColor, litColor, fogFactor), baseColor.a);
  }
`;

// ---- Globals ----
let gl, canvas;
let program;

// Uniform locations
let u_ModelMatrix, u_NormalMatrix, u_ViewProjMatrix;
let u_EyePos, u_FogColor, u_FogNear, u_FogFar;
let u_Sampler, u_TexColorWeight, u_Color;
let u_LightingOn, u_NormalViz;
let u_PointLightPos, u_PointLightColor, u_PointLightOn;
let u_SpotLightPos, u_SpotLightDir, u_SpotCutoff, u_SpotLightColor, u_SpotLightOn;

// Attribute locations
let a_Position, a_Normal, a_TexCoord;

// Geometry buffers
let cubeBuffer;
let peacockCubeBuffers, peacockConeBuffers;
let sphereBuffers;
let objBuffers = null;

// Camera
let camera;

// FPS tracking
let lastFPSTime = 0;
let frameCount = 0;

// Day/night cycle
let dayTime = 0;
const DAY_CYCLE_SPEED = 0.015;

// Lighting state
let lightingOn = true;
let normalVizOn = false;
let pointLightOn = true;
let spotLightOn = true;
let lightAnimOn = false;
let pointLightPos = [16, 8, 16];
let spotLightPos = [16, 15, 16];
let spotLightDir = [0, -1, 0];

// Reusable matrix for normal matrix computation
const _normalMat = new Matrix4();

function setNormalMatrix(modelMatrix) {
  _normalMat.setInverseOf(modelMatrix);
  _normalMat.transpose();
  gl.uniformMatrix4fv(u_NormalMatrix, false, _normalMat.elements);
}

// ---- Sky color ----
function getSkyColor(t) {
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

// ---- Terrain heightmap ----
let terrainVBO, terrainIBO, terrainIndexCount;
const TERRAIN_SIZE = 32;
const TERRAIN_RES  = 64;

function pseudoNoise(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
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
  let h = 0;
  h += smoothNoise(wx * 0.1, wz * 0.1) * 1.5;
  h += smoothNoise(wx * 0.25, wz * 0.25) * 0.6;
  h += smoothNoise(wx * 0.6, wz * 0.6) * 0.2;
  h -= 0.8;
  const edgeFade = 2.5;
  const fadeX = Math.min(wx, TERRAIN_SIZE - wx) / edgeFade;
  const fadeZ = Math.min(wz, TERRAIN_SIZE - wz) / edgeFade;
  const fade = Math.min(1, Math.min(Math.max(fadeX, 0), Math.max(fadeZ, 0)));
  return h * fade;
}

function createTerrainMesh() {
  const verts = [];  // x,y,z, nx,ny,nz, u,v  (stride 8)
  const indices = [];
  const step = TERRAIN_SIZE / TERRAIN_RES;
  const eps = 0.1;

  for (let iz = 0; iz <= TERRAIN_RES; iz++) {
    for (let ix = 0; ix <= TERRAIN_RES; ix++) {
      const wx = ix * step;
      const wz = iz * step;
      const wy = terrainHeight(wx, wz);

      // Normal via central differences
      const hL = terrainHeight(wx - eps, wz);
      const hR = terrainHeight(wx + eps, wz);
      const hD = terrainHeight(wx, wz - eps);
      const hU = terrainHeight(wx, wz + eps);
      let nx = hL - hR;
      let ny = 2.0 * eps;
      let nz = hD - hU;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      nx /= len; ny /= len; nz /= len;

      const u = ix / TERRAIN_RES * 8;
      const v = iz / TERRAIN_RES * 8;
      verts.push(wx, wy, wz, nx, ny, nz, u, v);
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
  let m = new Matrix4();
  gl.uniformMatrix4fv(u_ModelMatrix, false, m.elements);
  setNormalMatrix(m);
  gl.uniform1f(u_TexColorWeight, 1.0);
  gl.uniform4fv(u_Color, [0.3, 0.6, 0.2, 1.0]);

  bindTextured(terrainVBO, terrainIBO);
  gl.drawElements(gl.TRIANGLES, terrainIndexCount, gl.UNSIGNED_SHORT, 0);
}

// ============================================================
// EGG HUNT MINIGAME
// ============================================================
const TOTAL_EGGS = 10;
const EGG_COLLECT_RADIUS = 2.0;

const eggs = [
  { x:  5.5, z:  5.5, collected: false },
  { x: 15.5, z:  2.5, collected: false },
  { x: 28.5, z:  3.5, collected: false },
  { x: 24.0, z:  5.0, collected: false },
  { x: 12.0, z: 12.0, collected: false },
  { x:  2.5, z: 16.0, collected: false },
  { x: 20.0, z: 20.0, collected: false },
  { x:  8.0, z: 25.0, collected: false },
  { x: 16.0, z: 28.0, collected: false },
  { x: 28.0, z: 28.0, collected: false },
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
    if (Math.sqrt(dx * dx + dz * dz) < EGG_COLLECT_RADIUS) {
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
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

function drawEgg(ex, ez) {
  const groundY = terrainHeight(ex, ez);
  const bobY = groundY + 0.5 + Math.sin(performance.now() / 500 + ex + ez) * 0.15;
  const spin = (performance.now() / 1000 * 60 + ex * 50) % 360;

  let m = new Matrix4();
  m.translate(ex, bobY, ez);
  m.rotate(spin, 0, 1, 0);
  m.scale(0.25, 0.4, 0.25);
  drawCube(m, 0.0, [1.0, 0.85, 0.2, 1.0]);

  let m2 = new Matrix4();
  m2.translate(ex, bobY + 0.15, ez);
  m2.rotate(spin, 0, 1, 0);
  m2.scale(0.15, 0.2, 0.15);
  drawCube(m2, 0.0, [1.0, 0.95, 0.5, 1.0]);
}

function drawAllEggs() {
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
    this.eye = new Vector3([16, 2, 16]);
    this.at  = new Vector3([16, 2, 15]);
    this.up  = new Vector3([0, 1, 0]);
    this.fov = 60;
    this.moveSpeed = 0.15;
    this.rotSpeed  = 3;
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

  forward() {
    let f = new Vector3([
      this.at.elements[0] - this.eye.elements[0],
      0,
      this.at.elements[2] - this.eye.elements[2]
    ]);
    f.normalize();
    return f;
  }

  right() {
    let f = this.forward();
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

  panRight(angle) { this.panLeft(-angle); }

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
    let newY = d_prime.elements[1];
    let len = Math.sqrt(d_prime.elements[0]**2 + d_prime.elements[1]**2 + d_prime.elements[2]**2);
    if (Math.abs(newY / len) > 0.95) return;
    this.at.elements[0] = this.eye.elements[0] + d_prime.elements[0];
    this.at.elements[1] = this.eye.elements[1] + d_prime.elements[1];
    this.at.elements[2] = this.eye.elements[2] + d_prime.elements[2];
  }
}

// ============================================================
// GEOMETRY BUFFERS (all include normals)
// ============================================================

// ---- Textured cube: stride 8 (pos3 + normal3 + uv2) ----
function createTexturedCubeBuffer() {
  // prettier-ignore
  const vertexData = new Float32Array([
    // Front face (z=1), normal (0,0,1)
    0,0,1,  0,0,1,  0,0,
    1,0,1,  0,0,1,  1,0,
    1,1,1,  0,0,1,  1,1,
    0,1,1,  0,0,1,  0,1,
    // Back face (z=0), normal (0,0,-1)
    1,0,0,  0,0,-1,  0,0,
    0,0,0,  0,0,-1,  1,0,
    0,1,0,  0,0,-1,  1,1,
    1,1,0,  0,0,-1,  0,1,
    // Top face (y=1), normal (0,1,0)
    0,1,1,  0,1,0,  0,0,
    1,1,1,  0,1,0,  1,0,
    1,1,0,  0,1,0,  1,1,
    0,1,0,  0,1,0,  0,1,
    // Bottom face (y=0), normal (0,-1,0)
    0,0,0,  0,-1,0,  0,0,
    1,0,0,  0,-1,0,  1,0,
    1,0,1,  0,-1,0,  1,1,
    0,0,1,  0,-1,0,  0,1,
    // Right face (x=1), normal (1,0,0)
    1,0,1,  1,0,0,  0,0,
    1,0,0,  1,0,0,  1,0,
    1,1,0,  1,0,0,  1,1,
    1,1,1,  1,0,0,  0,1,
    // Left face (x=0), normal (-1,0,0)
    0,0,0,  -1,0,0,  0,0,
    0,0,1,  -1,0,0,  1,0,
    0,1,1,  -1,0,0,  1,1,
    0,1,0,  -1,0,0,  0,1,
  ]);

  const indices = new Uint16Array([
     0, 1, 2,   0, 2, 3,
     4, 5, 6,   4, 6, 7,
     8, 9,10,   8,10,11,
    12,13,14,  12,14,15,
    16,17,18,  16,18,19,
    20,21,22,  20,22,23,
  ]);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return { vbo, ibo, indexCount: indices.length };
}

// ---- Centered cube: stride 6 (pos3 + normal3) ----
function createCenteredCubeBuffers() {
  const s = 0.5;
  // prettier-ignore
  const data = new Float32Array([
    // Front (z=+s), normal (0,0,1)
    -s,-s, s,  0, 0, 1,
     s,-s, s,  0, 0, 1,
     s, s, s,  0, 0, 1,
    -s, s, s,  0, 0, 1,
    // Back (z=-s), normal (0,0,-1)
     s,-s,-s,  0, 0,-1,
    -s,-s,-s,  0, 0,-1,
    -s, s,-s,  0, 0,-1,
     s, s,-s,  0, 0,-1,
    // Top (y=+s), normal (0,1,0)
    -s, s, s,  0, 1, 0,
     s, s, s,  0, 1, 0,
     s, s,-s,  0, 1, 0,
    -s, s,-s,  0, 1, 0,
    // Bottom (y=-s), normal (0,-1,0)
    -s,-s,-s,  0,-1, 0,
     s,-s,-s,  0,-1, 0,
     s,-s, s,  0,-1, 0,
    -s,-s, s,  0,-1, 0,
    // Right (x=+s), normal (1,0,0)
     s,-s, s,  1, 0, 0,
     s,-s,-s,  1, 0, 0,
     s, s,-s,  1, 0, 0,
     s, s, s,  1, 0, 0,
    // Left (x=-s), normal (-1,0,0)
    -s,-s,-s, -1, 0, 0,
    -s,-s, s, -1, 0, 0,
    -s, s, s, -1, 0, 0,
    -s, s,-s, -1, 0, 0,
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
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length };
}

// ---- Sphere: stride 8 (pos3 + normal3 + uv2) ----
function createSphereBuffers(latBands, longBands) {
  const radius = 0.5;
  const verts = [];
  const indices = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = lat * Math.PI / latBands;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    for (let lon = 0; lon <= longBands; lon++) {
      const phi = lon * 2 * Math.PI / longBands;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      const nx = cosP * sinT;
      const ny = cosT;
      const nz = sinP * sinT;

      const x = radius * nx;
      const y = radius * ny;
      const z = radius * nz;

      const u = lon / longBands;
      const v = lat / latBands;

      verts.push(x, y, z, nx, ny, nz, u, v);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < longBands; lon++) {
      const first  = lat * (longBands + 1) + lon;
      const second = first + longBands + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length };
}

// ---- Cone: stride 6 (pos3 + normal3) ----
function createPeacockConeBuffers(radius, height, segments) {
  const verts = [];
  const indices = [];

  const slope = radius / height;

  // Tip vertex (index 0) — average normal pointing along +Z
  verts.push(0, 0, height, 0, 0, 1);

  // Side ring vertices (indices 1..segments+1)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = ca, ny = sa, nz = slope;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    verts.push(ca * radius, sa * radius, 0, nx/len, ny/len, nz/len);
  }

  // Base center (index segments+2)
  const baseCenterIdx = segments + 2;
  verts.push(0, 0, 0, 0, 0, -1);

  // Base ring vertices (indices baseCenterIdx+1 ..)
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    verts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0, 0, 0, -1);
  }

  // Side triangles
  for (let i = 0; i < segments; i++) {
    indices.push(0, 1 + i, 1 + i + 1);
  }

  // Base cap triangles
  for (let i = 0; i < segments; i++) {
    indices.push(baseCenterIdx, baseCenterIdx + 1 + i + 1, baseCenterIdx + 1 + i);
  }

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length };
}

// ============================================================
// ATTRIBUTE BINDING HELPERS
// ============================================================

function bindTextured(vbo, ibo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const F = Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, F * 8, 0);
  gl.enableVertexAttribArray(a_Normal);
  gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, F * 8, F * 3);
  gl.enableVertexAttribArray(a_TexCoord);
  gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, F * 8, F * 6);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
}

function bindUntextured(vbo, ibo) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const F = Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(a_Position);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, F * 6, 0);
  gl.enableVertexAttribArray(a_Normal);
  gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, F * 6, F * 3);
  gl.disableVertexAttribArray(a_TexCoord);
  gl.vertexAttrib2f(a_TexCoord, 0.0, 0.0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
}

// ============================================================
// DRAW HELPERS
// ============================================================

function drawCube(modelMatrix, texWeight, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
  setNormalMatrix(modelMatrix);
  gl.uniform1f(u_TexColorWeight, texWeight);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, cubeBuffer.indexCount, gl.UNSIGNED_SHORT, 0);
}

function drawSphere(x, y, z, scale, color) {
  bindTextured(sphereBuffers.vbo, sphereBuffers.ibo);
  useTexture('white');
  let m = new Matrix4();
  m.translate(x, y, z);
  m.scale(scale, scale, scale);
  gl.uniformMatrix4fv(u_ModelMatrix, false, m.elements);
  setNormalMatrix(m);
  gl.uniform1f(u_TexColorWeight, 0.0);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, sphereBuffers.count, gl.UNSIGNED_SHORT, 0);
}

function drawOBJModel(x, y, z, scale, color) {
  if (!objBuffers) return;
  bindUntextured(objBuffers.vbo, objBuffers.ibo);
  let m = new Matrix4();
  m.translate(x, y, z);
  m.scale(scale, scale, scale);
  gl.uniformMatrix4fv(u_ModelMatrix, false, m.elements);
  setNormalMatrix(m);
  gl.uniform1f(u_TexColorWeight, 0.0);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, objBuffers.count, gl.UNSIGNED_SHORT, 0);
}

// Peacock primitives — use the unified shader with untextured binding
function drawPCube(M, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, M.elements);
  setNormalMatrix(M);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, peacockCubeBuffers.count, gl.UNSIGNED_SHORT, 0);
}

function drawPCone(M, color) {
  bindUntextured(peacockConeBuffers.vbo, peacockConeBuffers.ibo);
  gl.uniformMatrix4fv(u_ModelMatrix, false, M.elements);
  setNormalMatrix(M);
  gl.uniform4fv(u_Color, color);
  gl.drawElements(gl.TRIANGLES, peacockConeBuffers.count, gl.UNSIGNED_SHORT, 0);
}

// Draw a small unlit cube at the light position
function drawLightMarker() {
  gl.uniform1i(u_LightingOn, 0);
  gl.uniform1i(u_NormalViz, 0);
  bindTextured(cubeBuffer.vbo, cubeBuffer.ibo);
  useTexture('white');
  let m = new Matrix4();
  m.translate(pointLightPos[0] - 0.15, pointLightPos[1] - 0.15, pointLightPos[2] - 0.15);
  m.scale(0.3, 0.3, 0.3);
  drawCube(m, 0.0, [1.0, 1.0, 0.3, 1.0]);
  gl.uniform1i(u_LightingOn, lightingOn ? 1 : 0);
  gl.uniform1i(u_NormalViz, normalVizOn ? 1 : 0);
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

function createWhiteTexture() {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const pixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  textures['white'] = tex;
}

// ---- World map ----
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

let dynamicBlocks = {};

function blockKey(x, y, z) { return x + ',' + y + ',' + z; }

function hasBlock(x, y, z) {
  const key = blockKey(x, y, z);
  if (dynamicBlocks[key] === false) return false;
  if (dynamicBlocks[key] === true)  return true;
  if (x < 0 || x >= 32 || z < 0 || z >= 32) return false;
  if (y < 0 || y >= 4) return false;
  return y < worldMap[z][x];
}

function addBlock() {
  let pos = getTargetBlock();
  if (!pos) return;
  let [x, y, z] = pos.place;
  if (y < 0 || y > 5) return;
  dynamicBlocks[blockKey(x, y, z)] = true;
}

function removeBlock() {
  let pos = getTargetBlock();
  if (!pos) return;
  let [x, y, z] = pos.hit;
  dynamicBlocks[blockKey(x, y, z)] = false;
}

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
    let bx = Math.floor(eye[0] + dx * t);
    let by = Math.floor(eye[1] + dy * t);
    let bz = Math.floor(eye[2] + dz * t);
    if (hasBlock(bx, by, bz)) {
      return { hit: [bx, by, bz], place: [prevX, prevY, prevZ] };
    }
    prevX = bx; prevY = by; prevZ = bz;
  }
  return null;
}

// ============================================================
// OBJ LOADER
// ============================================================

function parseOBJ(text) {
  const positions = [];
  const normals = [];
  const outVerts = [];
  const outIndices = [];
  const vertCache = {};
  let idx = 0;

  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (line.startsWith('vn ')) {
      const parts = line.split(/\s+/);
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const faceIndices = [];
      for (let p of parts) {
        const segs = p.split('/');
        const vi = parseInt(segs[0]) - 1;
        const ni = segs.length >= 3 && segs[2] !== '' ? parseInt(segs[2]) - 1 : vi;
        const key = vi + '/' + ni;
        if (!(key in vertCache)) {
          outVerts.push(
            positions[vi*3], positions[vi*3+1], positions[vi*3+2],
            normals[ni*3]  || 0, normals[ni*3+1] || 0, normals[ni*3+2] || 1
          );
          vertCache[key] = idx++;
        }
        faceIndices.push(vertCache[key]);
      }
      // Triangulate (fan)
      for (let i = 1; i < faceIndices.length - 1; i++) {
        outIndices.push(faceIndices[0], faceIndices[i], faceIndices[i+1]);
      }
    }
  }

  return { vertices: new Float32Array(outVerts), indices: new Uint16Array(outIndices) };
}

function loadOBJ(url, callback) {
  fetch(url)
    .then(r => r.text())
    .then(text => {
      const data = parseOBJ(text);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
      callback({ vbo, ibo, count: data.indices.length });
    })
    .catch(err => {
      console.warn('OBJ load failed:', err);
      callback(null);
    });
}

// ---- Input handling ----
let keys = {};

function setupInput() {
  document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  document.addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('click', (e) => {
    if (!document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    const sensitivity = 0.15;
    camera.panLeft(-e.movementX * sensitivity);
    camera.tilt(-e.movementY * sensitivity);
  });

  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) addBlock();
    if (e.button === 2) removeBlock();
  });

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

// ============================================================
// DRAWING THE WORLD
// ============================================================

function drawWorld(skyCol) {
  if (!skyCol) skyCol = [0.53, 0.81, 0.92];

  // Sky box — unlit, no normal viz
  gl.uniform1i(u_LightingOn, 0);
  gl.uniform1i(u_NormalViz, 0);
  bindTextured(cubeBuffer.vbo, cubeBuffer.ibo);
  useTexture('white');
  let skyM = new Matrix4();
  skyM.translate(-50, -50, -50);
  skyM.scale(132, 132, 132);
  drawCube(skyM, 0.0, [skyCol[0], skyCol[1], skyCol[2], 1.0]);

  // Restore lighting and normal viz state
  gl.uniform1i(u_LightingOn, lightingOn ? 1 : 0);
  gl.uniform1i(u_NormalViz, normalVizOn ? 1 : 0);

  // Terrain
  drawTerrain();

  // Re-bind cube buffers (textured, stride 8)
  bindTextured(cubeBuffer.vbo, cubeBuffer.ibo);

  // Draw walls from the map
  useTexture('wall');
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      let h = worldMap[z][x];
      for (let y = 0; y < h; y++) {
        let key = blockKey(x, y, z);
        if (dynamicBlocks[key] === false) continue;
        let m = new Matrix4();
        m.translate(x, y, z);
        drawCube(m, 1.0, [0.8, 0.8, 0.8, 1.0]);
      }
    }
  }

  // Dynamic blocks
  useTexture('wall');
  for (let key in dynamicBlocks) {
    if (dynamicBlocks[key] !== true) continue;
    let parts = key.split(',').map(Number);
    let [bx, by, bz] = parts;
    if (bx >= 0 && bx < 32 && bz >= 0 && bz < 32 && by < worldMap[bz][bx]) continue;
    let m = new Matrix4();
    m.translate(bx, by, bz);
    drawCube(m, 1.0, [0.8, 0.8, 0.8, 1.0]);
  }

  // Eggs
  bindTextured(cubeBuffer.vbo, cubeBuffer.ibo);
  drawAllEggs();

  // Spheres
  drawSphere(10, terrainHeight(10, 10) + 1.5, 10, 2.0, [0.2, 0.6, 1.0, 1.0]);
  drawSphere(22, terrainHeight(22, 8)  + 1.0, 8,  1.5, [1.0, 0.3, 0.3, 1.0]);

  // OBJ model (torus)
  drawOBJModel(16, terrainHeight(16, 8) + 2.0, 8, 1.5, [0.8, 0.5, 1.0, 1.0]);

  // Peacock
  drawPeacock(3, 1, 27);

  // Light position marker
  drawLightMarker();
}

// ---- Render loop ----
const PLAYER_EYE_HEIGHT = 2.0;
let lightAngle = 0;

function tick() {
  processKeys();

  // Camera follows terrain
  const groundY = terrainHeight(camera.eye.elements[0], camera.eye.elements[2]);
  const targetY = groundY + PLAYER_EYE_HEIGHT;
  const deltaY = targetY - camera.eye.elements[1];
  camera.eye.elements[1] += deltaY;
  camera.at.elements[1]  += deltaY;

  // Resize canvas
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  checkEggCollection();
  updatePeacockAnimation(1 / 60);

  // Animate light orbit
  if (lightAnimOn) {
    lightAngle += 1;
    const r = 10;
    pointLightPos[0] = 16 + r * Math.cos(lightAngle * Math.PI / 180);
    pointLightPos[2] = 16 + r * Math.sin(lightAngle * Math.PI / 180);
    // Update sliders to reflect animated position
    const slX = document.getElementById('lightX');
    const slZ = document.getElementById('lightZ');
    if (slX) slX.value = pointLightPos[0];
    if (slZ) slZ.value = pointLightPos[2];
  }

  dayTime = (dayTime + DAY_CYCLE_SPEED / 60) % 1.0;
  const skyCol = getSkyColor(dayTime);

  gl.clearColor(skyCol[0], skyCol[1], skyCol[2], 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set per-frame uniforms
  let vpMat = camera.viewProjMatrix();
  gl.uniformMatrix4fv(u_ViewProjMatrix, false, vpMat.elements);
  gl.uniform3f(u_EyePos, camera.eye.elements[0], camera.eye.elements[1], camera.eye.elements[2]);
  gl.uniform3f(u_FogColor, skyCol[0], skyCol[1], skyCol[2]);
  gl.uniform1f(u_FogNear, 20.0);
  gl.uniform1f(u_FogFar, 50.0);

  // Lighting uniforms
  gl.uniform1i(u_LightingOn, lightingOn ? 1 : 0);
  gl.uniform1i(u_NormalViz, normalVizOn ? 1 : 0);

  gl.uniform3fv(u_PointLightPos, pointLightPos);
  gl.uniform3f(u_PointLightColor, 1.0, 1.0, 0.9);
  gl.uniform1i(u_PointLightOn, pointLightOn ? 1 : 0);

  gl.uniform3fv(u_SpotLightPos, spotLightPos);
  gl.uniform3fv(u_SpotLightDir, spotLightDir);
  gl.uniform1f(u_SpotCutoff, Math.cos(25 * Math.PI / 180));
  gl.uniform3f(u_SpotLightColor, 0.9, 0.9, 1.0);
  gl.uniform1i(u_SpotLightOn, spotLightOn ? 1 : 0);

  // Bind cube once for initial draws
  bindTextured(cubeBuffer.vbo, cubeBuffer.ibo);

  drawWorld(skyCol);

  // FPS
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

// ============================================================
// UI SETUP
// ============================================================

function setupUI() {
  document.getElementById('btnLighting').addEventListener('click', () => {
    lightingOn = !lightingOn;
    document.getElementById('btnLighting').textContent = 'Lighting: ' + (lightingOn ? 'ON' : 'OFF');
  });

  document.getElementById('btnNormalViz').addEventListener('click', () => {
    normalVizOn = !normalVizOn;
    document.getElementById('btnNormalViz').textContent = 'Normals: ' + (normalVizOn ? 'ON' : 'OFF');
  });

  document.getElementById('btnPointLight').addEventListener('click', () => {
    pointLightOn = !pointLightOn;
    document.getElementById('btnPointLight').textContent = 'Point Light: ' + (pointLightOn ? 'ON' : 'OFF');
  });

  document.getElementById('btnSpotLight').addEventListener('click', () => {
    spotLightOn = !spotLightOn;
    document.getElementById('btnSpotLight').textContent = 'Spot Light: ' + (spotLightOn ? 'ON' : 'OFF');
  });

  document.getElementById('lightX').addEventListener('input', (e) => {
    pointLightPos[0] = parseFloat(e.target.value);
  });
  document.getElementById('lightY').addEventListener('input', (e) => {
    pointLightPos[1] = parseFloat(e.target.value);
  });
  document.getElementById('lightZ').addEventListener('input', (e) => {
    pointLightPos[2] = parseFloat(e.target.value);
  });

  document.getElementById('lightOrbit').addEventListener('change', (e) => {
    lightAnimOn = e.target.checked;
  });

  document.getElementById('cameraAngle').addEventListener('input', (e) => {
    const angle = parseFloat(e.target.value);
    const dist = 1.0;
    const rad = angle * Math.PI / 180;
    camera.at.elements[0] = camera.eye.elements[0] + Math.sin(rad) * dist;
    camera.at.elements[2] = camera.eye.elements[2] - Math.cos(rad) * dist;
  });
}

// ============================================================
// INITIALIZATION
// ============================================================

function main() {
  canvas = document.getElementById('glCanvas');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) {
    alert('WebGL not supported!');
    return;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  console.log('Canvas size:', canvas.width, 'x', canvas.height);

  // Compile unified shader
  program = createProgramFromSources(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  if (!program) {
    document.getElementById('errorOverlay').style.display = 'block';
    document.getElementById('errorOverlay').textContent += 'FATAL: Shader program failed to compile/link!\n';
    return;
  }
  gl.useProgram(program);

  // Attribute locations
  a_Position = gl.getAttribLocation(program, 'a_Position');
  a_Normal   = gl.getAttribLocation(program, 'a_Normal');
  a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord');
  console.log('Attribute locations:', a_Position, a_Normal, a_TexCoord);
  if (a_Position < 0 || a_Normal < 0 || a_TexCoord < 0) {
    console.error('Failed to get attribute locations:', a_Position, a_Normal, a_TexCoord);
  }

  // Uniform locations
  u_ModelMatrix    = gl.getUniformLocation(program, 'u_ModelMatrix');
  u_NormalMatrix   = gl.getUniformLocation(program, 'u_NormalMatrix');
  u_ViewProjMatrix = gl.getUniformLocation(program, 'u_ViewProjMatrix');
  u_EyePos         = gl.getUniformLocation(program, 'u_EyePos');
  u_FogColor       = gl.getUniformLocation(program, 'u_FogColor');
  u_FogNear        = gl.getUniformLocation(program, 'u_FogNear');
  u_FogFar         = gl.getUniformLocation(program, 'u_FogFar');
  u_Sampler        = gl.getUniformLocation(program, 'u_Sampler');
  u_TexColorWeight = gl.getUniformLocation(program, 'u_TexColorWeight');
  u_Color          = gl.getUniformLocation(program, 'u_Color');

  u_LightingOn     = gl.getUniformLocation(program, 'u_LightingOn');
  u_NormalViz      = gl.getUniformLocation(program, 'u_NormalViz');

  u_PointLightPos   = gl.getUniformLocation(program, 'u_PointLightPos');
  u_PointLightColor = gl.getUniformLocation(program, 'u_PointLightColor');
  u_PointLightOn    = gl.getUniformLocation(program, 'u_PointLightOn');

  u_SpotLightPos   = gl.getUniformLocation(program, 'u_SpotLightPos');
  u_SpotLightDir   = gl.getUniformLocation(program, 'u_SpotLightDir');
  u_SpotCutoff     = gl.getUniformLocation(program, 'u_SpotCutoff');
  u_SpotLightColor = gl.getUniformLocation(program, 'u_SpotLightColor');
  u_SpotLightOn    = gl.getUniformLocation(program, 'u_SpotLightOn');

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.53, 0.81, 0.92, 1.0);

  // Create geometry
  cubeBuffer = createTexturedCubeBuffer();
  createTerrainMesh();
  sphereBuffers = createSphereBuffers(24, 24);
  peacockCubeBuffers = createCenteredCubeBuffers();
  peacockConeBuffers = createPeacockConeBuffers(0.5, 1.0, 16);

  // Textures
  createWhiteTexture();
  generateProceduralTextures();
  loadTexture('grass', 'grass.jpg');
  loadTexture('wall',  'dirt.jpg');

  // Load OBJ model
  loadOBJ('torus.obj', (buffers) => {
    if (buffers) {
      objBuffers = buffers;
      console.log('OBJ model loaded');
    }
  });

  camera = new Camera();
  setupInput();
  setupUI();

  lastFPSTime = performance.now();
  tick();

  console.log('Assignment 4 initialized. Click the canvas to enable mouse look.');
}

// ============================================================
// SHADER HELPERS
// ============================================================

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

// ============================================================
// PROCEDURAL TEXTURES
// ============================================================

function generateProceduralTextures() {
  textures['grass'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const noise = Math.random() * 30;
    pixels[i]     = 50 + noise;
    pixels[i + 1] = 120 + noise;
    pixels[i + 2] = 30 + noise;
    pixels[i + 3] = 255;
  });

  textures['wall'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const brickH = 8, brickW = 16, mortarSize = 1;
    const row = Math.floor(y / brickH);
    const offset = (row % 2 === 0) ? 0 : brickW / 2;
    const lx = (x + offset) % brickW;
    const ly = y % brickH;
    const isMortar = lx < mortarSize || ly < mortarSize;
    const noise = Math.random() * 15;
    if (isMortar) {
      pixels[i]=180+noise; pixels[i+1]=175+noise; pixels[i+2]=160+noise; pixels[i+3]=255;
    } else {
      pixels[i]=150+noise; pixels[i+1]=70+noise; pixels[i+2]=50+noise; pixels[i+3]=255;
    }
  });

  textures['dirt'] = makeProceduralTexture(64, (x, y, pixels, w) => {
    const i = (y * w + x) * 4;
    const noise = Math.random() * 40;
    pixels[i]=120+noise; pixels[i+1]=80+noise; pixels[i+2]=50+noise; pixels[i+3]=255;
  });
}

function makeProceduralTexture(size, paintFn) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      paintFn(x, y, pixels, size);
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
// PEACOCK ANIMAL
// ============================================================

let peacockTime = 0;
let peacockAnimOn = true;

let pNeckBase = -20, pNeckMid = 10;
let pLeftUpper = 10, pLeftLower = 15;
let pRightUpper = 10, pRightLower = 15;
let pLeftWing = -5, pRightWing = 5;

function updatePeacockAnimation(dt) {
  if (!peacockAnimOn) return;
  peacockTime += dt;
  const t = peacockTime;

  if (allEggsFound) {
    const cycleDuration = 1.5;
    const pokeTime = t % cycleDuration;
    const flapDecay = 1 - (pokeTime / cycleDuration);
    const flapSpeed = 20;
    const flapAmplitude = 70 * flapDecay;
    pLeftWing  = -5 - Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;
    pRightWing =  5 + Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;
    const headJerk = Math.sin(pokeTime * 15) * 20 * flapDecay;
    pNeckBase = headJerk;
    pNeckMid  = 10 + headJerk * 0.5;
    pLeftUpper = 10; pLeftLower = 15;
    pRightUpper = 10; pRightLower = 15;
    return;
  }

  pLeftWing = -5;
  pRightWing = 5;
  pNeckBase = Math.sin(t * 2) * 15;
  pNeckMid  = 5 + Math.sin(t * 2 - 0.3) * 18 + Math.sin(t * 5) * 8;

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

function drawPeacock(wx, wy, wz) {
  // Bind peacock cube buffers once for all cube parts
  bindUntextured(peacockCubeBuffers.vbo, peacockCubeBuffers.ibo);
  gl.uniform1f(u_TexColorWeight, 0.0);

  const C_BODY  = [0.5, 0.5, 0.5, 1];
  const C_NECK  = [0.2, 0.4, 0.9, 1];
  const C_TAIL  = [0.2, 0.7, 0.3, 1];
  const C_LEGS  = [0.76, 0.6, 0.42, 1];
  const C_BEAK  = [0.9, 0.9, 0.85, 1];
  const C_EYES  = [0.05, 0.05, 0.05, 1];
  const C_WINGS = [0.65, 0.65, 0.65, 1];

  const root = new Matrix4();
  root.translate(wx, wy, wz);
  root.rotate(180, 0, 1, 0);

  // BODY
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

  // NECK CHAIN
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

  // BEAK (cone — rebinds buffers)
  const beakJ = new Matrix4(headJ);
  beakJ.translate(0, -0.02, 0.14);
  beakJ.rotate(15, 1, 0, 0);
  const beakR = new Matrix4(beakJ);
  beakR.scale(0.05, 0.04, 0.22);
  drawPCone(beakR, C_BEAK);

  // Re-bind cube buffers for remaining cube parts
  bindUntextured(peacockCubeBuffers.vbo, peacockCubeBuffers.ibo);

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

  // TAIL
  for (let i = -2; i <= 2; i++) {
    const tJ = new Matrix4(bodyJoint);
    const fd = 0.6 + Math.abs(i) * 0.8;
    tJ.translate(i * 0.15, 0.3 + Math.abs(i) * 0.05, -0.8 - fd / 2);
    tJ.rotate(i * 8, 0, 1, 0);
    const tR = new Matrix4(tJ);
    tR.scale(0.2, 0.6, fd);
    drawPCube(tR, C_TAIL);
  }

  // LEFT LEG
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

  // RIGHT LEG
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
