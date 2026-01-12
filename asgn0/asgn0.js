// asgn0.js - draw vectors and handle UI

const CANVAS_SIZE = 400;
const ORIGIN = CANVAS_SIZE / 2;
const SCALE = 20; // scale vector coordinates by 20

function clearCanvas(ctx) {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawVector(ctx, v, color) {
  const e = v.elements;
  const x = ORIGIN + e[0] * SCALE;
  const y = ORIGIN - e[1] * SCALE; // invert y for canvas

  ctx.beginPath();
  ctx.moveTo(ORIGIN, ORIGIN);
  ctx.lineTo(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function readVectorFromInputs(prefix) {
  const x = parseFloat(document.getElementById(prefix + 'x').value) || 0;
  const y = parseFloat(document.getElementById(prefix + 'y').value) || 0;
  return new Vector3([x, y, 0]);
}

function handleDrawEvent() {
  const canvas = document.getElementById('example');
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx);

  const v1 = readVectorFromInputs('v1');
  const v2 = readVectorFromInputs('v2');

  drawVector(ctx, v1, 'red');
  drawVector(ctx, v2, 'blue');
}

function angleBetween(v1, v2) {
  const dot = Vector3.dot(v1, v2);
  const m1 = v1.magnitude();
  const m2 = v2.magnitude();
  if (m1 === 0 || m2 === 0) return 0;
  let cos = dot / (m1 * m2);
  cos = Math.min(1, Math.max(-1, cos));
  const rad = Math.acos(cos);
  return rad; // radians
}

function areaTriangle(v1, v2) {
  const c = Vector3.cross(v1, v2);
  const parallelogramArea = c.magnitude();
  return 0.5 * parallelogramArea;
}

function handleDrawOperationEvent() {
  const canvas = document.getElementById('example');
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx);

  const v1 = readVectorFromInputs('v1');
  const v2 = readVectorFromInputs('v2');

  drawVector(ctx, v1, 'red');
  drawVector(ctx, v2, 'blue');

  const op = document.getElementById('opSelect').value;
  const s = parseFloat(document.getElementById('scalar').value) || 0;

  if (op === 'add') {
    const v3 = new Vector3(v1.elements);
    v3.add(v2);
    drawVector(ctx, v3, 'green');
  } else if (op === 'sub') {
    const v3 = new Vector3(v1.elements);
    v3.sub(v2);
    drawVector(ctx, v3, 'green');
  } else if (op === 'mul') {
    const v3 = new Vector3(v1.elements);
    const v4 = new Vector3(v2.elements);
    v3.mul(s);
    v4.mul(s);
    drawVector(ctx, v3, 'green');
    drawVector(ctx, v4, 'green');
  } else if (op === 'div') {
    const v3 = new Vector3(v1.elements);
    const v4 = new Vector3(v2.elements);
    v3.div(s);
    v4.div(s);
    drawVector(ctx, v3, 'green');
    drawVector(ctx, v4, 'green');
  } else if (op === 'magnitude') {
    console.log('magnitude v1 =', v1.magnitude());
    console.log('magnitude v2 =', v2.magnitude());
    const nv1 = new Vector3(v1.elements);
    const nv2 = new Vector3(v2.elements);
    nv1.normalize();
    nv2.normalize();
    drawVector(ctx, nv1, 'green');
    drawVector(ctx, nv2, 'green');
  } else if (op === 'normalize') {
    const nv1 = new Vector3(v1.elements);
    const nv2 = new Vector3(v2.elements);
    nv1.normalize();
    nv2.normalize();
    console.log('normalized v1 =', nv1.elements);
    console.log('normalized v2 =', nv2.elements);
    drawVector(ctx, nv1, 'green');
    drawVector(ctx, nv2, 'green');
  } else if (op === 'angle') {
    const rad = angleBetween(v1, v2);
    const deg = rad * 180 / Math.PI;
    console.log('angle between v1 and v2 (radians):', rad);
    console.log('angle between v1 and v2 (degrees):', deg);
  } else if (op === 'area') {
    const area = areaTriangle(v1, v2);
    console.log('triangle area =', area);
    // draw v1+v2 to visualize triangle/parallelogram
    const v3 = new Vector3(v1.elements);
    v3.add(v2);
    drawVector(ctx, v3, 'green');
  }
}

function main() {
  const canvas = document.getElementById('example');
  if (!canvas) {
    console.log('Failed to retrieve the <canvas> element');
    return false;
  }
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx);

  document.getElementById('drawVectors').addEventListener('click', handleDrawEvent);
  document.getElementById('opBtn').addEventListener('click', handleDrawOperationEvent);
}
