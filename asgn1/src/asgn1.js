// ================================================================
// CSE 160 Assignment 1 - Shape Brush
// Organized with required functions and classes
// ================================================================

// Global WebGL variables
let canvas;
let gl;
let shapeProgram;
let chalkProgram;
let restoreProgram;

// Global attribute/uniform locations
let a_Position;
let u_Resolution;
let u_Center;
let u_Color;
let u_BrushType;
let u_Size;
let u_Segments;

// Global UI elements
let brushButtons;
let sizeInput;
let segInput;
let rIn, gIn, bIn, opacityIn;
let colorPreview;
let sizeVal, segVal;
let clearBtn, undoBtn, drawPictureBtn;
let chalkToggle;

// Global state variables
let g_selectedType = 'point';  // Current brush type
let g_selectedColor = [0.2, 0.47, 0.78, 1.0];  // Current color (RGBA)
let g_selectedSize = 24;  // Current size
let g_selectedSegments = 24;  // Current segments for circles
let g_isDrawing = false;
let g_lastPos = null;

// ================================================================
// SHAPE LIST - Contains all shapes that need to be drawn
// ================================================================
let g_shapesList = [];

// ================================================================
// SHAPE CLASSES - Point, Circle, Triangle
// ================================================================

// Base class for all shapes
class Shape {
  constructor(position, color, size) {
    this.position = position;  // {x, y}
    this.color = color;        // [r, g, b, a]
    this.size = size;
  }
  
  render() {
    // Override in subclasses
  }
}

// Point class (renders as a square)
class Point extends Shape {
  constructor(position, color, size) {
    super(position, color, size);
    this.type = 'point';
  }
  
  render() {
    gl.useProgram(shapeProgram);
    
    const side = Math.max(2, this.size * 2);
    const vertices = new Float32Array([
      -side/2, -side/2,
       side/2, -side/2,
      -side/2,  side/2,
       side/2,  side/2
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(u_Resolution, canvas.width, canvas.height);
    gl.uniform2f(u_Center, this.position.x, this.position.y);
    gl.uniform4f(u_Color, this.color[0], this.color[1], this.color[2], this.color[3]);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.deleteBuffer(buffer);
  }
}

// Circle class
class Circle extends Shape {
  constructor(position, color, size, segments) {
    super(position, color, size);
    this.type = 'circle';
    this.segments = segments || 24;
  }
  
  render() {
    gl.useProgram(shapeProgram);
    
    const radius = this.size;
    const vertices = [];
    for (let i = 0; i <= this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2;
      vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(u_Resolution, canvas.width, canvas.height);
    gl.uniform2f(u_Center, this.position.x, this.position.y);
    gl.uniform4f(u_Color, this.color[0], this.color[1], this.color[2], this.color[3]);
    
    gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 2);
    gl.deleteBuffer(buffer);
  }
}

// Triangle class
class Triangle extends Shape {
  constructor(position, color, size) {
    super(position, color, size);
    this.type = 'triangle';
  }
  
  render() {
    gl.useProgram(shapeProgram);
    
    const triR = this.size * 1.3;
    const vertices = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      vertices.push(Math.cos(angle) * triR, Math.sin(angle) * triR);
    }
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(u_Resolution, canvas.width, canvas.height);
    gl.uniform2f(u_Center, this.position.x, this.position.y);
    gl.uniform4f(u_Color, this.color[0], this.color[1], this.color[2], this.color[3]);
    
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.deleteBuffer(buffer);
  }
}

// ================================================================
// UNDO HISTORY
// ================================================================
const g_history = [];
const g_maxHistory = 60;
let hiddenCanvas;
let hiddenCtx;

// ================================================================
// SHADER SOURCE CODE
// ================================================================
const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  varying vec2 v_position;
  
  void main() {
    vec2 pixelPos = a_position + u_center;
    vec2 ndc = vec2(
      pixelPos.x / u_resolution.x * 2.0 - 1.0,
      1.0 - (pixelPos.y / u_resolution.y * 2.0)
    );
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_position = a_position;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_color;
  uniform int u_brushType;
  uniform float u_size;
  uniform int u_segments;
  varying vec2 v_position;
  
  void main() {
    gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
  }
`;

const CHALK_VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform float u_particleSize;
  varying vec2 v_position;
  
  void main() {
    vec2 position = (a_position * u_particleSize + u_center) / u_resolution * 2.0 - 1.0;
    position.y = -position.y;
    gl_Position = vec4(position, 0.0, 1.0);
    v_position = a_position;
  }
`;

const CHALK_FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_color;
  varying vec2 v_position;
  
  void main() {
    gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
  }
`;

const RESTORE_VERTEX_SOURCE = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  varying vec2 v_texCoord;
  void main() {
    vec2 pos = (a_position / u_resolution) * 2.0 - 1.0;
    pos.y = -pos.y;
    gl_Position = vec4(pos, 0.0, 1.0);
    v_texCoord = vec2(a_position.x / u_resolution.x, a_position.y / u_resolution.y);
  }
`;

const RESTORE_FRAGMENT_SOURCE = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_texCoord;
  void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
  }
`;

// ================================================================
// MAIN ENTRY POINT
// ================================================================
function main() {
  // Setup WebGL
  setupWebGL();
  
  // Connect GLSL variables
  connectVariablesToGLSL();
  
  // Setup UI event handlers
  setupUI();
  
  // Register click/mouse handlers
  handleClicks();
  
  // Initial render
  renderAllShapes();
  
  console.log('Application initialized successfully');
}

// ================================================================
// setupWebGL() - Initialize WebGL context and settings
// ================================================================
function setupWebGL() {
  // Get canvas element
  canvas = document.getElementById('draw-canvas');
  
  // Get WebGL context
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) || 
       canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
  
  if (!gl) {
    alert('WebGL not supported in your browser');
    return;
  }
  
  // Create hidden canvas for undo operations
  hiddenCanvas = document.createElement('canvas');
  hiddenCanvas.width = canvas.width;
  hiddenCanvas.height = canvas.height;
  hiddenCtx = hiddenCanvas.getContext('2d');
  
  // Compile shaders and create programs
  shapeProgram = createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE, 'shapeProgram');
  chalkProgram = createProgram(CHALK_VERTEX_SHADER_SOURCE, CHALK_FRAGMENT_SHADER_SOURCE, 'chalkProgram');
  restoreProgram = createProgram(RESTORE_VERTEX_SOURCE, RESTORE_FRAGMENT_SOURCE, 'restoreProgram');
  
  if (!shapeProgram || !chalkProgram || !restoreProgram) {
    alert('Failed to initialize shader programs. Check console for details.');
    return;
  }
  
  // Initialize WebGL settings
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

// ================================================================
// connectVariablesToGLSL() - Get attribute/uniform locations
// ================================================================
function connectVariablesToGLSL() {
  gl.useProgram(shapeProgram);
  
  // Get attribute locations
  a_Position = gl.getAttribLocation(shapeProgram, 'a_position');
  if (a_Position < 0) {
    console.error('Failed to get a_position location');
  }
  
  // Get uniform locations
  u_Resolution = gl.getUniformLocation(shapeProgram, 'u_resolution');
  u_Center = gl.getUniformLocation(shapeProgram, 'u_center');
  u_Color = gl.getUniformLocation(shapeProgram, 'u_color');
  u_BrushType = gl.getUniformLocation(shapeProgram, 'u_brushType');
  u_Size = gl.getUniformLocation(shapeProgram, 'u_size');
  u_Segments = gl.getUniformLocation(shapeProgram, 'u_segments');
}

// ================================================================
// handleClicks() - Register mouse/touch event handlers
// ================================================================
function handleClicks() {
  // Mouse down - start drawing
  canvas.addEventListener('mousedown', (e) => {
    g_isDrawing = true;
    const pos = getCanvasPosition(e);
    saveState();
    addShapeAtPosition(pos);
    renderAllShapes();
    // Hide reference section when user starts drawing
    hideReferenceSection();
  });
  
  // Mouse up - stop drawing
  window.addEventListener('mouseup', () => {
    g_isDrawing = false;
    g_lastPos = null;
  });
  
  // Mouse move - draw while held
  canvas.addEventListener('mousemove', (e) => {
    if (!g_isDrawing) return;
    const pos = getCanvasPosition(e);
    sampleAndDraw(g_lastPos, pos);
    renderAllShapes();
  });
  
  // Touch support
  canvas.addEventListener('touchstart', (ev) => {
    ev.preventDefault();
    g_isDrawing = true;
    const t = ev.touches[0];
    const pos = getCanvasPosition(t);
    saveState();
    addShapeAtPosition(pos);
    renderAllShapes();
    // Hide reference section when user starts drawing
    hideReferenceSection();
  });
  
  canvas.addEventListener('touchmove', (ev) => {
    ev.preventDefault();
    if (!g_isDrawing) return;
    const t = ev.touches[0];
    const pos = getCanvasPosition(t);
    sampleAndDraw(g_lastPos, pos);
    renderAllShapes();
  });
  
  canvas.addEventListener('touchend', () => {
    g_isDrawing = false;
    g_lastPos = null;
  });
  
  // Keyboard shortcut for undo
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      restoreState();
      // Hide reference section on undo
      hideReferenceSection();
    }
  });
}

// ================================================================
// renderAllShapes() - Clear and redraw all shapes
// ================================================================
function renderAllShapes() {
  // Note: We use immediate mode rendering (shapes drawn directly to canvas)
  // The g_shapesList is used for the current stroke being drawn
  // Previous strokes are preserved via the preserveDrawingBuffer option
  
  // Render any pending shapes in the list
  for (const shape of g_shapesList) {
    shape.render();
  }
  
  // Clear the list after rendering (shapes are now on canvas)
  g_shapesList = [];
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

// Compile a shader
function compileShader(source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const shaderType = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
    console.error(`${shaderType} shader compile error:`, gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Create a shader program
function createProgram(vertexSource, fragmentSource, programName = '') {
  const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) {
    console.error(`Failed to compile shaders for ${programName}`);
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(`Program link error for ${programName}:`, gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// Get canvas coordinates from mouse/touch event
function getCanvasPosition(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

// Get current color from UI
function getCurrentColor() {
  const a = parseFloat(opacityIn ? opacityIn.value : 1);
  return [
    +rIn.value / 255,
    +gIn.value / 255,
    +bIn.value / 255,
    a
  ];
}

// Add a shape at the given position based on current settings
function addShapeAtPosition(pos) {
  const color = getCurrentColor();
  const size = +sizeInput.value;
  const segments = Math.max(3, Math.round(+segInput.value));
  
  let shape;
  if (g_selectedType === 'point') {
    shape = new Point(pos, color, size);
  } else if (g_selectedType === 'circle') {
    shape = new Circle(pos, color, size, segments);
  } else if (g_selectedType === 'triangle') {
    shape = new Triangle(pos, color, size);
  }
  
  if (shape) {
    // Check for chalk mode
    if (chalkToggle && chalkToggle.checked) {
      drawChalk(pos.x, pos.y);
    } else {
      g_shapesList.push(shape);
    }
  }
  
  g_lastPos = pos;
}

// Sample points along a line and draw shapes
function sampleAndDraw(from, to) {
  if (!from) {
    addShapeAtPosition(to);
    return;
  }
  
  const size = +sizeInput.value;
  const spacing = Math.max(2, size * 0.6);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist < spacing) {
    addShapeAtPosition(to);
    return;
  }
  
  const steps = Math.floor(dist / spacing);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    addShapeAtPosition({ x, y });
  }
  addShapeAtPosition(to);
}

// Draw chalk particles
function drawChalk(x, y) {
  const size = +sizeInput.value;
  const color = getCurrentColor();
  const particles = Math.max(12, Math.round(size * size * 0.06));
  const segments = Math.max(3, Math.round(+segInput.value));
  
  const particlePositions = [];
  const particleSizes = [];
  const particleAlphas = [];
  
  if (g_selectedType === 'point') {
    const side = Math.max(2, size * 2);
    for (let i = 0; i < particles; i++) {
      particlePositions.push(
        x + (Math.random() - 0.5) * side,
        y + (Math.random() - 0.5) * side
      );
      particleSizes.push(Math.random() * 0.8 + 0.3);
      particleAlphas.push(1.0);
    }
  } else if (g_selectedType === 'circle') {
    const verts = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push({ x: x + Math.cos(a) * size, y: y + Math.sin(a) * size });
    }
    const triAreas = [];
    let totalArea = 0;
    for (let i = 1; i < segments - 1; i++) {
      const A = verts[0], B = verts[i], C = verts[i + 1];
      const area = Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) * 0.5;
      triAreas.push(area);
      totalArea += area;
    }
    const cum = [];
    let acc = 0;
    for (const a of triAreas) { acc += a; cum.push(acc); }
    for (let i = 0; i < particles; i++) {
      const rrand = Math.random() * (totalArea || 1);
      let triIndex = 0;
      while (triIndex < cum.length - 1 && rrand > cum[triIndex]) triIndex++;
      const A = verts[0];
      const B = verts[triIndex + 1];
      const C = verts[triIndex + 2];
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const px = A.x + u * (B.x - A.x) + v * (C.x - A.x);
      const py = A.y + u * (B.y - A.y) + v * (C.y - A.y);
      particlePositions.push(px, py);
      particleSizes.push(Math.random() * 0.8 + 0.3);
      particleAlphas.push(1.0);
    }
  } else if (g_selectedType === 'triangle') {
    const triR = size * 1.3;
    const verts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      verts.push({ x: x + Math.cos(a) * triR, y: y + Math.sin(a) * triR });
    }
    for (let i = 0; i < particles; i++) {
      let u = Math.random(), v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const A = verts[0], B = verts[1], C = verts[2];
      const px = A.x + u * (B.x - A.x) + v * (C.x - A.x);
      const py = A.y + u * (B.y - A.y) + v * (C.y - A.y);
      particlePositions.push(px, py);
      particleSizes.push(Math.random() * 0.8 + 0.3);
      particleAlphas.push(1.0);
    }
  }
  
  // Draw particles
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(chalkProgram);
  
  const positionLoc = gl.getAttribLocation(chalkProgram, 'a_position');
  const resolutionLoc = gl.getUniformLocation(chalkProgram, 'u_resolution');
  const centerLoc = gl.getUniformLocation(chalkProgram, 'u_center');
  const particleSizeLoc = gl.getUniformLocation(chalkProgram, 'u_particleSize');
  const colorLoc = gl.getUniformLocation(chalkProgram, 'u_color');
  
  gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
  
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5,
     0.5, -0.5,
    -0.5,  0.5,
     0.5,  0.5
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
  
  for (let i = 0; i < particles; i++) {
    const px = particlePositions[i * 2];
    const py = particlePositions[i * 2 + 1];
    const pSize = particleSizes[i];
    const pAlpha = particleAlphas[i] * color[3];
    
    gl.uniform2f(centerLoc, px, py);
    gl.uniform1f(particleSizeLoc, pSize);
    gl.uniform4f(colorLoc, color[0], color[1], color[2], pAlpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Save canvas state for undo
function saveState() {
  if (g_history.length >= g_maxHistory) {
    g_history.shift();
  }
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const flipped = new Uint8Array(canvas.width * canvas.height * 4);
  for (let y = 0; y < canvas.height; y++) {
    const srcRow = y * canvas.width * 4;
    const dstRow = (canvas.height - 1 - y) * canvas.width * 4;
    for (let x = 0; x < canvas.width * 4; x++) {
      flipped[dstRow + x] = pixels[srcRow + x];
    }
  }
  const imageData = new ImageData(
    new Uint8ClampedArray(flipped),
    canvas.width,
    canvas.height
  );
  g_history.push(imageData);
}

// Restore previous canvas state (undo)
function restoreState() {
  if (g_history.length === 0) {
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  
  const imageData = g_history.pop();
  hiddenCtx.putImageData(imageData, 0, 0);
  
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  if (restoreProgram) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      canvas.width, 0,
      0, canvas.height,
      canvas.width, canvas.height
    ]), gl.STATIC_DRAW);
    
    gl.useProgram(restoreProgram);
    const posLoc = gl.getAttribLocation(restoreProgram, 'a_position');
    const resLoc = gl.getUniformLocation(restoreProgram, 'u_resolution');
    const texLoc = gl.getUniformLocation(restoreProgram, 'u_texture');
    
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(texLoc, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.deleteTexture(texture);
  }
}

// ================================================================
// UI SETUP
// ================================================================
function setupUI() {
  // Get UI elements
  brushButtons = Array.from(document.querySelectorAll('.brush-btn'));
  sizeInput = document.getElementById('size');
  segInput = document.getElementById('segments');
  rIn = document.getElementById('r');
  gIn = document.getElementById('g');
  bIn = document.getElementById('b');
  opacityIn = document.getElementById('opacity');
  colorPreview = document.getElementById('colorPreview');
  sizeVal = document.getElementById('sizeVal');
  segVal = document.getElementById('segVal');
  clearBtn = document.getElementById('clear');
  undoBtn = document.getElementById('undo');
  chalkToggle = document.getElementById('chalkToggle');
  drawPictureBtn = document.getElementById('drawPicture');
  
  // Brush type buttons
  document.getElementById('brush-point').addEventListener('click', () => {
    g_selectedType = 'point';
    setActiveButton('brush-point');
  });
  document.getElementById('brush-circle').addEventListener('click', () => {
    g_selectedType = 'circle';
    setActiveButton('brush-circle');
  });
  document.getElementById('brush-triangle').addEventListener('click', () => {
    g_selectedType = 'triangle';
    setActiveButton('brush-triangle');
  });
  
  // Clear button
  clearBtn.addEventListener('click', () => {
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    g_shapesList = [];
    g_history.length = 0;
    // Hide the reference section
    const refSection = document.getElementById('reference-section');
    if (refSection) refSection.style.display = 'none';
  });
  
  // Undo button
  undoBtn.addEventListener('click', () => {
    restoreState();
    // Hide reference section on undo
    hideReferenceSection();
  });
  
  // Draw Picture button
  drawPictureBtn.addEventListener('click', () => {
    saveState();
    drawPicture();
    // Show the reference image section
    const refSection = document.getElementById('reference-section');
    if (refSection) {
      refSection.style.display = 'block';
      refSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  
  // Color/size preview updates
  [rIn, gIn, bIn, opacityIn, sizeInput, segInput].forEach(el => {
    if (el) el.addEventListener('input', updatePreview);
  });
  updatePreview();
}

function setActiveButton(id) {
  brushButtons.forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Helper function to hide reference section
function hideReferenceSection() {
  const refSection = document.getElementById('reference-section');
  if (refSection) refSection.style.display = 'none';
}

function updatePreview() {
  if (colorPreview) {
    colorPreview.style.background = `rgba(${+rIn.value},${+gIn.value},${+bIn.value},${parseFloat(opacityIn ? opacityIn.value : 1)})`;
  }
  if (sizeVal) sizeVal.textContent = sizeInput.value;
  if (segVal) segVal.textContent = segInput.value;
}

// ================================================================
// DRAW PICTURE - Creates the fish with RM initials
// ================================================================
function drawPicture() {
  // Clear canvas with light grayish-blue background
  gl.clearColor(0.92, 0.94, 0.96, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  g_history.length = 0;
  
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(shapeProgram);
  
  const positionLoc = gl.getAttribLocation(shapeProgram, 'a_position');
  const resolutionLoc = gl.getUniformLocation(shapeProgram, 'u_resolution');
  const centerLoc = gl.getUniformLocation(shapeProgram, 'u_center');
  const colorLoc = gl.getUniformLocation(shapeProgram, 'u_color');
  
  gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
  
  // Transform normalized coordinates (0-100) to canvas coordinates
  function toCanvas(x, y) {
    return {
      x: (x / 100) * canvas.width,
      y: canvas.height - (y / 100) * canvas.height
    };
  }
  
  // Helper function to draw a filled triangle
  function drawTriangle(x1, y1, x2, y2, x3, y3, r, g, b, a) {
    const p1 = toCanvas(x1, y1);
    const p2 = toCanvas(x2, y2);
    const p3 = toCanvas(x3, y3);
    
    const vertices = new Float32Array([p1.x, p1.y, p2.x, p2.y, p3.x, p3.y]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(centerLoc, 0, 0);
    gl.uniform4f(colorLoc, r, g, b, a);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.deleteBuffer(buffer);
  }
  
  // Define colors
  const fishBody = [1.0, 0.85, 0.2, 1.0];
  const blue = [0.3, 0.5, 0.8, 1.0];
  const eye = [0.1, 0.1, 0.1, 1.0];
  const seaweed = [0.2, 0.5, 0.3, 1.0];
  
  // ===== SEAWEED =====
  drawTriangle(5, 0, 8, 35, 12, 0, ...seaweed);
  drawTriangle(2, 0, 4, 20, 7, 0, ...seaweed);
  drawTriangle(10, 0, 15, 25, 18, 0, ...seaweed);
  drawTriangle(88, 0, 92, 45, 96, 0, ...seaweed);
  drawTriangle(85, 0, 87, 25, 90, 0, ...seaweed);
  drawTriangle(94, 0, 98, 30, 100, 0, ...seaweed);
  
  // ===== FISH BODY =====
  drawTriangle(10, 55, 25, 35, 25, 75, ...fishBody);
  drawTriangle(10, 55, 25, 35, 25, 55, ...fishBody);
  drawTriangle(10, 55, 25, 55, 25, 75, ...fishBody);
  drawTriangle(21, 60, 22, 65, 18, 63, ...eye);
  
  // Fill triangles behind R structure
  drawTriangle(25, 75, 42, 60, 42, 75, ...fishBody);
  drawTriangle(42, 60, 36, 59, 42, 35, ...fishBody);
  drawTriangle(25, 35, 30, 57, 42, 35, ...fishBody);
  drawTriangle(25, 55, 30, 57, 36, 59, ...fishBody);
  drawTriangle(25, 55, 36, 59, 42, 60, ...fishBody);
  
  // "R" Structure (Blue)
  drawTriangle(25, 75, 42, 60, 25, 55, ...blue);
  drawTriangle(30, 57, 42, 35, 36, 59, ...blue);
  drawTriangle(30, 57, 25, 55, 25, 35, ...blue);
  drawTriangle(29, 67, 34, 62, 29, 61, ...fishBody);
  
  // Body
  drawTriangle(42, 35, 42, 75, 65, 50, ...fishBody);
  
  // Fins
  drawTriangle(25, 75, 55, 95, 42, 75, ...fishBody);
  drawTriangle(25, 35, 55, 10, 42, 35, ...fishBody);
  
  // Tail as "M" (Blue)
  drawTriangle(65, 65, 65, 50, 85, 80, ...blue);
  drawTriangle(65, 50, 65, 35, 85, 20, ...blue);
  drawTriangle(65, 65, 65, 50, 75, 50, ...blue);
  drawTriangle(65, 50, 65, 35, 75, 50, ...blue);
  
  console.log('Picture drawn - Fish with RM initials!');
}

// ================================================================
// START APPLICATION
// ================================================================
main();
