// Helper to create buffers for a cube made from triangles.
// Usage: const cube = createCubeBuffers(gl, size);
// Returns: {positionBuffer, normalBuffer, indexBuffer, indexCount}
function createCubeBuffers(gl, size = 1.0) {
    const s = size / 2.0;
    // We create 6 faces * 4 vertices = 24 vertices so each face can have a flat normal.
    const positions = [
        // Front face (z = +s)
        -s, -s,  s,
         s, -s,  s,
         s,  s,  s,
        -s,  s,  s,
        // Back face (z = -s)
         s, -s, -s,
        -s, -s, -s,
        -s,  s, -s,
         s,  s, -s,
        // Top face (y = +s)
        -s,  s,  s,
         s,  s,  s,
         s,  s, -s,
        -s,  s, -s,
        // Bottom face (y = -s)
        -s, -s, -s,
         s, -s, -s,
         s, -s,  s,
        -s, -s,  s,
        // Right face (x = +s)
         s, -s,  s,
         s, -s, -s,
         s,  s, -s,
         s,  s,  s,
        // Left face (x = -s)
        -s, -s, -s,
        -s, -s,  s,
        -s,  s,  s,
        -s,  s, -s,
    ];

    const normals = [
        // Front
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        // Back
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
        // Top
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        // Bottom
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        // Right
        1, 0, 0,
        1, 0, 0,
        1, 0, 0,
        1, 0, 0,
        // Left
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
    ];

    // Each face: two triangles (0,1,2) and (0,2,3)
    const indices = [
        0, 1, 2,   0, 2, 3,    // front
        4, 5, 6,   4, 6, 7,    // back
        8, 9,10,   8,10,11,    // top
       12,13,14,  12,14,15,    // bottom
       16,17,18,  16,18,19,    // right
       20,21,22,  20,22,23     // left
    ];

    // Create and fill position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create and fill normal buffer
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // Create and fill index buffer
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return {
        positionBuffer: positionBuffer,
        normalBuffer: normalBuffer,
        indexBuffer: indexBuffer,
        indexCount: indices.length,
    };
}

// Expose globally for simple usage in the assignment pages
window.createCubeBuffers = createCubeBuffers;

// Helper to create buffers for a cone made from triangles.
// The cone points along +Z axis, with base at z=0 and tip at z=height
// Usage: const cone = createConeBuffers(gl, radius, height, segments);
// Returns: {positionBuffer, normalBuffer, indexBuffer, indexCount}
function createConeBuffers(gl, radius = 0.5, height = 1.0, segments = 16) {
    const positions = [];
    const normals = [];
    const indices = [];

    // Tip of the cone at (0, 0, height)
    const tipIndex = 0;
    positions.push(0, 0, height);
    normals.push(0, 0, 1);  // tip normal points up (will be averaged)

    // Base center at (0, 0, 0)
    const baseCenterIndex = 1;
    positions.push(0, 0, 0);
    normals.push(0, 0, -1);  // base normal points down

    // Generate vertices around the base circle
    const baseStartIndex = 2;
    const slant = Math.sqrt(radius * radius + height * height);
    const nz = radius / slant;  // normal z component
    const nr = height / slant;  // normal radial component

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        // Vertex on base circle (for side)
        positions.push(x, y, 0);
        // Normal pointing outward and up along the cone surface
        normals.push(Math.cos(angle) * nr, Math.sin(angle) * nr, nz);
    }

    // Generate vertices for the base (separate so they have downward normals)
    const baseVertStartIndex = baseStartIndex + segments + 1;
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        positions.push(x, y, 0);
        normals.push(0, 0, -1);  // base faces down
    }

    // Create triangles for the cone sides (tip to base edge)
    for (let i = 0; i < segments; i++) {
        indices.push(tipIndex, baseStartIndex + i, baseStartIndex + i + 1);
    }

    // Create triangles for the base (fan from center)
    for (let i = 0; i < segments; i++) {
        indices.push(baseCenterIndex, baseVertStartIndex + i + 1, baseVertStartIndex + i);
    }

    // Create and fill position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create and fill normal buffer
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // Create and fill index buffer
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return {
        positionBuffer: positionBuffer,
        normalBuffer: normalBuffer,
        indexBuffer: indexBuffer,
        indexCount: indices.length,
    };
}

window.createConeBuffers = createConeBuffers;

// drawCone: bind the cone buffers, set the model matrix uniform, and draw.
function drawCone(gl, program, M, color, coneBuffers) {
    if (!coneBuffers) {
        if (!window._coneBuffers) window._coneBuffers = createConeBuffers(gl, 0.5, 1.0, 16);
        coneBuffers = window._coneBuffers;
    }
    if (!color) color = [0.8, 0.8, 0.8, 1.0];

    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const normLoc = gl.getAttribLocation(program, 'a_normal');
    const modelLoc = gl.getUniformLocation(program, 'u_ModelMatrix');
    const colorLoc = gl.getUniformLocation(program, 'u_Color');

    // Bind position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, coneBuffers.positionBuffer);
    if (posLoc !== -1) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    }

    // Bind normal buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, coneBuffers.normalBuffer);
    if (normLoc !== -1) {
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
    }

    // Set model matrix uniform
    const matArray = M && M.elements ? M.elements : M;
    if (modelLoc && matArray) {
        gl.uniformMatrix4fv(modelLoc, false, matArray);
    }

    // Set color uniform
    if (colorLoc) {
        gl.uniform4fv(colorLoc, color);
    }

    // Bind index buffer and draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, coneBuffers.indexBuffer);
    gl.drawElements(gl.TRIANGLES, coneBuffers.indexCount, gl.UNSIGNED_SHORT, 0);
}

window.drawCone = drawCone;

// drawCube: bind the cube buffers, set the model matrix uniform, and draw.
// Parameters:
// - gl: WebGLRenderingContext
// - program: compiled/linked shader program that expects `a_position`, `a_normal`, `u_ModelMatrix`, and `u_Color`
// - M: a 4x4 matrix (either a Float32Array length 16 or an object with `elements` array, e.g. Matrix4 from cuon-matrix)
// - color: [r, g, b, a] array for the cube color (default: light blue)
// - cubeBuffers: optional buffers object returned by `createCubeBuffers`; if omitted, one will be created lazily.
function drawCube(gl, program, M, color, cubeBuffers) {
    if (!cubeBuffers) {
        if (!window._cubeBuffers) window._cubeBuffers = createCubeBuffers(gl, 1.0);
        cubeBuffers = window._cubeBuffers;
    }
    // Default color if not provided
    if (!color) color = [0.6, 0.8, 1.0, 1.0];

    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const normLoc = gl.getAttribLocation(program, 'a_normal');
    const modelLoc = gl.getUniformLocation(program, 'u_ModelMatrix');
    const colorLoc = gl.getUniformLocation(program, 'u_Color');

    // Bind position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffers.positionBuffer);
    if (posLoc !== -1) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    }

    // Bind normal buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffers.normalBuffer);
    if (normLoc !== -1) {
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
    }

    // Set model matrix uniform
    const matArray = M && M.elements ? M.elements : M;
    if (modelLoc && matArray) {
        gl.uniformMatrix4fv(modelLoc, false, matArray);
    }

    // Set color uniform
    if (colorLoc) {
        gl.uniform4fv(colorLoc, color);
    }

    // Bind index buffer and draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeBuffers.indexBuffer);
    gl.drawElements(gl.TRIANGLES, cubeBuffers.indexCount, gl.UNSIGNED_SHORT, 0);
}

window.drawCube = drawCube;

// Global rotation angle (degrees) controlled by slider
window.gAnimalGlobalRotation = 0.0;

// Mouse rotation angles (degrees)
window.gMouseRotationX = 0.0;  // rotation around X axis (up/down tilt)
window.gMouseRotationY = 0.0;  // rotation around Y axis (left/right turn)

// Joint angles (degrees) controlled by sliders
window.gNeckBaseAngle = -20.0;   // Neck base tilt (affects entire neck + head)
window.gNeckMidAngle = 10.0;     // Neck mid tilt (affects upper neck + head)
window.gLeftUpperLegAngle = 10.0;   // Left upper leg rotation
window.gLeftLowerLegAngle = 15.0;   // Left lower leg (knee) rotation
window.gRightUpperLegAngle = 10.0;  // Right upper leg rotation
window.gRightLowerLegAngle = 15.0;  // Right lower leg (knee) rotation

// Wing angles (degrees) - for poke animation
window.gLeftWingAngle = -5.0;   // Left wing rotation (negative = tucked in)
window.gRightWingAngle = 5.0;   // Right wing rotation (positive = tucked in)

// Animation time (seconds since animation started)
window.gTime = 0.0;
window.gStartTime = 0.0;

// Animation on/off state
window.gAnimationOn = false;

// Poke animation state
window.gPokeAnimationOn = false;
window.gPokeStartTime = 0.0;

// updateAnimationAngles() - automatically update joint angles based on time
// Called every frame when animation is enabled
function updateAnimationAngles() {
    if (!window.gAnimationOn) return;

    const t = window.gTime;

    // Animate neck - gentle bobbing motion (forward and back)
    // Neck base: primary bob
    window.gNeckBaseAngle = 0 + Math.sin(t * 2) * 15;
    // Neck mid: follows base with delay + secondary faster motion for fluid look
    window.gNeckMidAngle = 5 + Math.sin(t * 2 - 0.3) * 18 + Math.sin(t * 5) * 8;

    // Animate legs - walking motion (legs move opposite to each other)
    const walkSpeed = 4;  // cycles per second
    const hipSwing = 25;  // degrees of hip rotation

    // Left leg
    const leftHipPhase = t * walkSpeed;
    window.gLeftUpperLegAngle = 10 + Math.sin(leftHipPhase) * hipSwing;
    // Knee: bends more when leg swings forward, extends when pushing back
    // Use squared sin for more natural knee motion + secondary harmonic
    const leftKneeBend = Math.sin(leftHipPhase);
    window.gLeftLowerLegAngle = 20 + (leftKneeBend > 0 ? leftKneeBend * 55 : leftKneeBend * 15) + Math.sin(leftHipPhase * 2) * 10;

    // Right leg - opposite phase (180 degrees out of phase)
    const rightHipPhase = t * walkSpeed + Math.PI;
    window.gRightUpperLegAngle = 10 + Math.sin(rightHipPhase) * hipSwing;
    // Same knee logic for right leg
    const rightKneeBend = Math.sin(rightHipPhase);
    window.gRightLowerLegAngle = 20 + (rightKneeBend > 0 ? rightKneeBend * 55 : rightKneeBend * 15) + Math.sin(rightHipPhase * 2) * 10;
}

// updatePokeAnimation() - special animation when shift+click (poke)
// Flaps wings and startles the peacock
function updatePokeAnimation() {
    if (!window.gPokeAnimationOn) {
        // Reset wing angles when not poking
        window.gLeftWingAngle = -5.0;
        window.gRightWingAngle = 5.0;
        return;
    }

    // Time since poke started
    const pokeTime = window.gTime - window.gPokeStartTime;
    const pokeDuration = 1.5;  // Animation lasts 1.5 seconds

    if (pokeTime > pokeDuration) {
        // End poke animation
        window.gPokeAnimationOn = false;
        window.gLeftWingAngle = -5.0;
        window.gRightWingAngle = 5.0;
        return;
    }

    // Wing flapping - rapid oscillation that decays over time
    const flapSpeed = 20;  // Fast flapping
    const flapDecay = 1 - (pokeTime / pokeDuration);  // Decay from 1 to 0
    const flapAmplitude = 70 * flapDecay;  // Max 70 degrees, decaying

    window.gLeftWingAngle = -5 - Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;
    window.gRightWingAngle = 5 + Math.abs(Math.sin(pokeTime * flapSpeed)) * flapAmplitude;

    // Startled head movement - quick jerk then settle
    if (!window.gAnimationOn) {
        const headJerk = Math.sin(pokeTime * 15) * 20 * flapDecay;
        window.gNeckBaseAngle = headJerk;
        window.gNeckMidAngle = 10 + headJerk * 0.5;
    }
}

// Simple shader helper functions
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Could not compile shader:\n' + info);
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Could not link program:\n' + info);
    }
    return program;
}

// Basic vertex/fragment shader sources. Vertex shader uses u_GlobalRotation as requested.
const basicVS = `
attribute vec4 a_position;
attribute vec3 a_normal;
uniform mat4 u_ModelMatrix;
uniform mat4 u_GlobalRotation;
uniform mat4 u_ViewProj;
void main() {
  gl_Position = u_ViewProj * u_GlobalRotation * u_ModelMatrix * a_position;
}
`;

const basicFS = `
precision mediump float;
uniform vec4 u_Color;
void main(){
  gl_FragColor = u_Color;
}
`;

// Render the entire scene. All drawing is isolated here so callers can
// simply call `renderScene(...)` after UI updates.
function renderScene(gl, program, cube, cone, vp) {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.2, 0.2, 0.2, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // global rotation matrix combining slider and mouse control
    const GR = new Matrix4();
    GR.setRotate(window.gAnimalGlobalRotation + window.gMouseRotationY, 0, 1, 0);  // Y-axis rotation
    GR.rotate(window.gMouseRotationX, 1, 0, 0);  // X-axis rotation (tilt)

    // Set shared uniforms: view-projection and global rotation
    gl.useProgram(program);
    const uViewProj = gl.getUniformLocation(program, 'u_ViewProj');
    const uGlobal = gl.getUniformLocation(program, 'u_GlobalRotation');
    if (uViewProj) gl.uniformMatrix4fv(uViewProj, false, vp.elements);
    if (uGlobal) gl.uniformMatrix4fv(uGlobal, false, GR.elements);

    // ========================================
    // HIERARCHICAL PARENT-CHILD TRANSFORMS
    // Each part uses a "joint" matrix (no scale) to pass to children,
    // and a "render" matrix (with scale) for drawing.
    // ========================================

    // Define colors for different body parts
    const COLOR_BODY = [0.5, 0.5, 0.5, 1.0];           // Gray
    const COLOR_NECK = [0.2, 0.4, 0.9, 1.0];           // Blue
    const COLOR_TAIL = [0.2, 0.7, 0.3, 1.0];           // Green
    const COLOR_LEGS = [0.76, 0.6, 0.42, 1.0];         // Light brown
    const COLOR_BEAK = [0.9, 0.9, 0.85, 1.0];          // Silver/white
    const COLOR_EYES = [0.05, 0.05, 0.05, 1.0];        // Black
    const COLOR_WINGS = [0.65, 0.65, 0.65, 1.0];       // Lighter gray

    // 1) BODY - root of the hierarchy
    const bodyJoint = new Matrix4();
    bodyJoint.translate(0.0, 0.6, 0.0);
    // Render body with scale
    const bodyRender = new Matrix4(bodyJoint);
    bodyRender.scale(1.2, 0.6, 1.6);
    drawCube(gl, program, bodyRender, COLOR_BODY, cube);

    // ========================================
    // WINGS - children of body (animated for poke)
    // Body half-width = 0.6, half-height = 0.3, half-depth = 0.8
    // ========================================
    // Left wing - uses global angle for poke animation
    const leftWingRender = new Matrix4(bodyJoint);
    leftWingRender.translate(-0.6, 0.1, -0.1);    // position at wing joint
    leftWingRender.rotate(window.gLeftWingAngle, 0, 0, 1);  // animated rotation
    leftWingRender.translate(-0.1, 0.0, 0.0);     // offset wing from joint
    leftWingRender.scale(0.25, 0.45, 0.85);
    drawCube(gl, program, leftWingRender, COLOR_WINGS, cube);

    // Right wing - uses global angle for poke animation
    const rightWingRender = new Matrix4(bodyJoint);
    rightWingRender.translate(0.6, 0.1, -0.1);    // position at wing joint
    rightWingRender.rotate(window.gRightWingAngle, 0, 0, 1);  // animated rotation
    rightWingRender.translate(0.1, 0.0, 0.0);     // offset wing from joint
    rightWingRender.scale(0.25, 0.45, 0.85);
    drawCube(gl, program, rightWingRender, COLOR_WINGS, cube);

    // ========================================
    // 2) NECK CHAIN: body -> neckBase -> neckMid -> head
    // ========================================

    // Neck Base - child of body
    // Position at top-front of body
    const neckBaseJoint = new Matrix4(bodyJoint);
    neckBaseJoint.translate(0.0, 0.3, 0.6);  // relative to body center
    neckBaseJoint.rotate(window.gNeckBaseAngle, 1, 0, 0);  // tilt forward (slider-controlled)
    // Render neck base
    const neckBaseRender = new Matrix4(neckBaseJoint);
    neckBaseRender.scale(0.25, 0.5, 0.25);
    drawCube(gl, program, neckBaseRender, COLOR_NECK, cube);

    // Neck Mid - child of neckBase
    // Rotation must happen at the JOINT (top of neck base), not at neck mid's center
    // neckBase half-height = 0.5/2 = 0.25, neckMid half-height = 0.45/2 = 0.225
    const neckMidJoint = new Matrix4(neckBaseJoint);
    neckMidJoint.translate(0.0, 0.25, 0.0);    // 1) move to joint (top of neck base)
    neckMidJoint.rotate(window.gNeckMidAngle, 1, 0, 0);  // 2) rotate at joint
    neckMidJoint.translate(0.0, 0.225, 0.0);   // 3) move to neck mid center
    // Render neck mid
    const neckMidRender = new Matrix4(neckMidJoint);
    neckMidRender.scale(0.22, 0.45, 0.22);
    drawCube(gl, program, neckMidRender, COLOR_NECK, cube);

    // Head - child of neckMid
    // Position at top of neck mid
    // neckMid half-height = 0.225, head half-height = 0.28/2 = 0.14
    // Translation Y = 0.225 + 0.14 = 0.365
    const headJoint = new Matrix4(neckMidJoint);
    headJoint.translate(0.0, 0.365, 0.05);     // move up and slightly forward
    // Render head
    const headRender = new Matrix4(headJoint);
    headRender.scale(0.35, 0.28, 0.28);
    drawCube(gl, program, headRender, COLOR_NECK, cube);

    // ========================================
    // BEAK - child of head (CONE primitive)
    // Positioned at front of head, pointing forward and slightly down
    // ========================================
    const beakJoint = new Matrix4(headJoint);
    // Head half-depth = 0.14, so front of head is at Z = +0.14
    beakJoint.translate(0.0, -0.02, 0.14);    // front of head, slightly below center
    beakJoint.rotate(15, 1, 0, 0);             // angle downward
    // Render beak as a cone (tip points forward along +Z)
    const beakRender = new Matrix4(beakJoint);
    beakRender.scale(0.05, 0.04, 0.22);        // narrow cone pointing forward
    drawCone(gl, program, beakRender, COLOR_BEAK, cone);

    // ========================================
    // EYES - children of head
    // Small black squares on sides of head
    // Head scale: (0.35, 0.28, 0.28), half-width = 0.175
    // ========================================
    // Left eye
    const leftEyeRender = new Matrix4(headJoint);
    leftEyeRender.translate(-0.16, 0.03, 0.08);  // left side, slightly up and forward
    leftEyeRender.scale(0.04, 0.04, 0.04);       // small cube
    drawCube(gl, program, leftEyeRender, COLOR_EYES, cube);

    // Right eye
    const rightEyeRender = new Matrix4(headJoint);
    rightEyeRender.translate(0.16, 0.03, 0.08);  // right side, slightly up and forward
    rightEyeRender.scale(0.04, 0.04, 0.04);      // small cube
    drawCube(gl, program, rightEyeRender, COLOR_EYES, cube);

    // ========================================
    // CREST FEATHERS - children of head
    // Small feathers fanning up from top of head
    // ========================================
    const numCrestFeathers = 5;
    for (let i = 0; i < numCrestFeathers; i++) {
        const crestJoint = new Matrix4(headJoint);
        // Position at top of head (head half-height = 0.14)
        const angle = (i - (numCrestFeathers - 1) / 2) * 12;  // spread angle (-24 to +24 degrees)
        crestJoint.translate(0.0, 0.14, -0.02);  // top of head, slightly back
        crestJoint.rotate(angle, 0, 0, 1);        // fan left/right
        crestJoint.rotate(-25, 1, 0, 0);          // tilt backward
        // Render crest feather (thin and tall)
        const crestRender = new Matrix4(crestJoint);
        crestRender.translate(0.0, 0.12, 0.0);    // offset so base is at head
        crestRender.scale(0.02, 0.25, 0.02);      // thin tall feathers
        drawCube(gl, program, crestRender, COLOR_NECK, cube);
    }

    // ========================================
    // 3) TAIL - children of body (fanning feathers)
    // Body half-depth = 1.6/2 = 0.8, so back edge is at Z = -0.8
    // Position tail at back edge, feathers extend further back
    // ========================================
    for (let i = -2; i <= 2; i++) {
        const tailJoint = new Matrix4(bodyJoint);
        // Z = -0.8 is body's back edge; feathers are centered so they extend back from there
        const featherDepth = 0.6 + Math.abs(i) * 0.8;
        const featherHalfDepth = featherDepth / 2;
        // Position so front of feather touches body's back edge
        tailJoint.translate(i * 0.15, 0.3 + Math.abs(i) * 0.05, -0.8 - featherHalfDepth);
        tailJoint.rotate(i * 8, 0, 1, 0);  // fan out
        // Render tail feather
        const tailRender = new Matrix4(tailJoint);
        tailRender.scale(0.2, 0.6, featherDepth);
        drawCube(gl, program, tailRender, COLOR_TAIL, cube);
    }

    // ========================================
    // 4) LEFT LEG CHAIN: body -> upperLeg -> lowerLeg -> foot
    // ========================================

    // Left Upper Leg - child of body
    // Position at bottom-left-front of body
    const lUpperJoint = new Matrix4(bodyJoint);
    lUpperJoint.translate(-0.4, -0.3, 0.4);  // relative to body center
    lUpperJoint.rotate(window.gLeftUpperLegAngle, 1, 0, 0);  // hip rotation (slider-controlled)
    // Render left upper leg
    const lUpperRender = new Matrix4(lUpperJoint);
    lUpperRender.scale(0.2, 0.4, 0.2);
    drawCube(gl, program, lUpperRender, COLOR_LEGS, cube);

    // Left Lower Leg - child of lUpperLeg
    // Rotation must happen at the KNEE (bottom of upper leg), not at lower leg's center
    // lUpper half-height = 0.4/2 = 0.2, lLower half-height = 0.35/2 = 0.175
    const lLowerJoint = new Matrix4(lUpperJoint);
    lLowerJoint.translate(0.0, -0.2, 0.0);     // 1) move to knee joint (bottom of upper leg)
    lLowerJoint.rotate(window.gLeftLowerLegAngle, 1, 0, 0);  // 2) rotate at knee
    lLowerJoint.translate(0.0, -0.175, 0.0);   // 3) move to lower leg center
    // Render left lower leg
    const lLowerRender = new Matrix4(lLowerJoint);
    lLowerRender.scale(0.18, 0.35, 0.18);
    drawCube(gl, program, lLowerRender, COLOR_LEGS, cube);

    // Left Foot - child of lLowerLeg
    // Position at bottom of lower leg
    // lLower half-height = 0.175, lFoot half-height = 0.08/2 = 0.04
    // Translation Y = -(0.175 + 0.04) = -0.215
    const lFootJoint = new Matrix4(lLowerJoint);
    lFootJoint.translate(0.0, -0.215, 0.1);   // move down and forward for foot
    lFootJoint.rotate(-20, 1, 0, 0);           // flatten foot on ground
    // Render left foot
    const lFootRender = new Matrix4(lFootJoint);
    lFootRender.scale(0.28, 0.08, 0.5);
    drawCube(gl, program, lFootRender, COLOR_LEGS, cube);

    // ========================================
    // 5) RIGHT LEG CHAIN: body -> upperLeg -> lowerLeg -> foot
    // ========================================

    // Right Upper Leg - child of body
    const rUpperJoint = new Matrix4(bodyJoint);
    rUpperJoint.translate(0.4, -0.3, 0.4);   // mirror of left leg
    rUpperJoint.rotate(window.gRightUpperLegAngle, 1, 0, 0);  // hip rotation (slider-controlled)
    // Render right upper leg
    const rUpperRender = new Matrix4(rUpperJoint);
    rUpperRender.scale(0.2, 0.4, 0.2);
    drawCube(gl, program, rUpperRender, COLOR_LEGS, cube);

    // Right Lower Leg - child of rUpperLeg
    // Rotation must happen at the KNEE (bottom of upper leg), not at lower leg's center
    // lUpper half-height = 0.2, lLower half-height = 0.175
    const rLowerJoint = new Matrix4(rUpperJoint);
    rLowerJoint.translate(0.0, -0.2, 0.0);     // 1) move to knee joint (bottom of upper leg)
    rLowerJoint.rotate(window.gRightLowerLegAngle, 1, 0, 0);  // 2) rotate at knee
    rLowerJoint.translate(0.0, -0.175, 0.0);   // 3) move to lower leg center
    // Render right lower leg
    const rLowerRender = new Matrix4(rLowerJoint);
    rLowerRender.scale(0.18, 0.35, 0.18);
    drawCube(gl, program, rLowerRender, COLOR_LEGS, cube);

    // Right Foot - child of rLowerLeg
    // Same calculation as left foot: Y = -(0.175 + 0.04) = -0.215
    const rFootJoint = new Matrix4(rLowerJoint);
    rFootJoint.translate(0.0, -0.215, 0.1);
    rFootJoint.rotate(-20, 1, 0, 0);
    // Render right foot
    const rFootRender = new Matrix4(rFootJoint);
    rFootRender.scale(0.28, 0.08, 0.5);
    drawCube(gl, program, rFootRender, COLOR_LEGS, cube);
}

// Initialize a small demo: create GL, compile shaders, set up cubes, and start render loop.
function initCubeDemo(canvasId) {
    const canvas = document.getElementById(canvasId);
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL not supported');

    const program = createProgram(gl, basicVS, basicFS);

    // Create buffers for cube and cone primitives
    const cube = createCubeBuffers(gl, 1.0);
    const cone = createConeBuffers(gl, 0.5, 1.0, 16);  // radius, height, segments

    // Setup view-projection matrix
    const vp = new Matrix4();
    vp.setPerspective(45, canvas.width / canvas.height, 0.1, 100);
    vp.lookAt(0, 2, 6, 0, 0, 0, 0, 1, 0);

    // Helper to set up a slider with its global variable
    function setupSlider(sliderId, globalVar, initialValue) {
        const slider = document.getElementById(sliderId);
        if (slider) {
            window[globalVar] = initialValue;
            slider.value = initialValue;
            slider.addEventListener('input', (e) => {
                window[globalVar] = parseFloat(e.target.value);
            });
        }
    }

    // Set up all sliders
    setupSlider('rotSlider', 'gAnimalGlobalRotation', 0);
    setupSlider('neckBaseSlider', 'gNeckBaseAngle', 0);
    setupSlider('neckMidSlider', 'gNeckMidAngle', 0);
    setupSlider('leftUpperLegSlider', 'gLeftUpperLegAngle', 10);
    setupSlider('leftLowerLegSlider', 'gLeftLowerLegAngle', 15);
    setupSlider('rightUpperLegSlider', 'gRightUpperLegAngle', 10);
    setupSlider('rightLowerLegSlider', 'gRightLowerLegAngle', 15);

    // Initialize animation start time
    window.gStartTime = performance.now() / 1000.0;

    // Set up animation toggle button
    const animBtn = document.getElementById('animationBtn');
    if (animBtn) {
        animBtn.addEventListener('click', () => {
            window.gAnimationOn = !window.gAnimationOn;
            animBtn.textContent = window.gAnimationOn ? 'Stop Animation' : 'Start Animation';
            animBtn.style.background = window.gAnimationOn ? '#a44' : '#4a4';
        });
    }

    // ========================================
    // Mouse control for rotation
    // Drag on canvas to rotate the animal
    // ========================================
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    canvas.addEventListener('mousedown', (e) => {
        // Check for shift+click to trigger poke animation
        if (e.shiftKey) {
            window.gPokeAnimationOn = true;
            window.gPokeStartTime = window.gTime;
            return;  // Don't start dragging when poking
        }

        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        // Map mouse movement to rotation (sensitivity factor)
        const sensitivity = 0.5;
        window.gMouseRotationY += deltaX * sensitivity;  // horizontal drag = Y rotation
        window.gMouseRotationX += deltaY * sensitivity;  // vertical drag = X rotation

        // Clamp X rotation to prevent flipping
        window.gMouseRotationX = Math.max(-90, Math.min(90, window.gMouseRotationX));

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    // FPS tracking variables
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let fps = 0;
    const fpsDisplay = document.getElementById('fpsDisplay');

    // tick() function - called every frame for animation
    function tick() {
        const now = performance.now();

        // Calculate FPS (update every 10 frames for stability)
        frameCount++;
        const elapsed = now - lastFrameTime;
        if (frameCount >= 10) {
            fps = Math.round(1000 * frameCount / elapsed);
            if (fpsDisplay) {
                fpsDisplay.textContent = 'FPS: ' + fps;
                // Color code: green if >= 30, yellow if >= 10, red if < 10
                if (fps >= 30) {
                    fpsDisplay.style.color = '#0f0';
                } else if (fps >= 10) {
                    fpsDisplay.style.color = '#ff0';
                } else {
                    fpsDisplay.style.color = '#f00';
                }
            }
            frameCount = 0;
            lastFrameTime = now;
        }

        // Update global time (seconds since start)
        window.gTime = now / 1000.0 - window.gStartTime;

        // Update animation angles (only modifies values if animation is on)
        updateAnimationAngles();

        // Update poke animation (wing flapping when shift+clicked)
        updatePokeAnimation();

        // Render the scene
        renderScene(gl, program, cube, cone, vp);

        // Request next frame
        requestAnimationFrame(tick);
    }

    // Start the animation loop
    tick();

    return { gl, program, cube, cone };
}

window.initCubeDemo = initCubeDemo;

