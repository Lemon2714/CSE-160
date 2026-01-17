(() => {
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d');

  const brushButtons = Array.from(document.querySelectorAll('.brush-btn'));
  const sizeInput = document.getElementById('size');
  const segInput = document.getElementById('segments');
  const rIn = document.getElementById('r');
  const gIn = document.getElementById('g');
  const bIn = document.getElementById('b');
  const opacityIn = document.getElementById('opacity');
  const colorPreview = document.getElementById('colorPreview');
  const sizeVal = document.getElementById('sizeVal');
  const segVal = document.getElementById('segVal');
  const clearBtn = document.getElementById('clear');
  const undoBtn = document.getElementById('undo');
  const chalkToggle = document.getElementById('chalkToggle');

  let brush = 'point';
  let drawing = false;
  let lastPos = null;

  // undo history: store ImageData snapshots per stroke
  const history = [];
  const maxHistory = 60;

  function setActiveButton(id){
    brushButtons.forEach(b=>b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function drawChalk(x,y){
    const size = +sizeInput.value;
    const r = +rIn.value, g = +gIn.value, b = +bIn.value;
    const alpha = parseFloat(opacityIn ? opacityIn.value : 1);
    // particle count scales with area, tuned for performance
    const particles = Math.max(12, Math.round(size * size * 0.06));
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    // particle drawing differs per brush
    if(brush==='point'){
      const side = Math.max(2, size * 2);
      for(let i=0;i<particles;i++){
        const px = x + (Math.random()-0.5)*side;
        const py = y + (Math.random()-0.5)*side;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = (Math.random()*0.6+0.25) * alpha;
        const s = Math.random()*2 + 0.7;
        ctx.fillRect(px, py, s, s);
      }
    }else if(brush==='circle'){
      // sample inside the polygon defined by `segments` so chalk respects segment count
      const segments = Math.max(3, Math.round(+segInput.value));
      const verts = [];
      for(let i=0;i<segments;i++){
        const a = (i/segments)*Math.PI*2;
        verts.push({x: x + Math.cos(a)*size, y: y + Math.sin(a)*size});
      }
      // triangulate as fan from verts[0]
      const triAreas = [];
      let totalArea = 0;
      for(let i=1;i<segments-1;i++){
        const A = verts[0], B = verts[i], C = verts[i+1];
        const area = Math.abs((B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x)) * 0.5;
        triAreas.push(area);
        totalArea += area;
      }
      // cumulative
      const cum = [];
      let acc = 0;
      for(const a of triAreas){ acc += a; cum.push(acc); }
      for(let i=0;i<particles;i++){
        // pick triangle by area
        const rrand = Math.random() * (totalArea || 1);
        let triIndex = 0;
        while(triIndex < cum.length-1 && rrand > cum[triIndex]) triIndex++;
        const A = verts[0];
        const B = verts[triIndex+1];
        const C = verts[triIndex+2];
        // sample in triangle via barycentric
        let u = Math.random(), v = Math.random();
        if(u + v > 1){ u = 1 - u; v = 1 - v; }
        const px = A.x + u*(B.x - A.x) + v*(C.x - A.x);
        const py = A.y + u*(B.y - A.y) + v*(C.y - A.y);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = (Math.random()*0.6+0.2) * alpha;
        const s = Math.random()*2 + 0.6;
        ctx.fillRect(px,py,s,s);
      }
    }else if(brush==='triangle'){
      // triangle vertices (same as filled triangle)
      const triR = size * (1.3);
      const verts = [];
      for(let i=0;i<3;i++){
        const a = (i/3)*Math.PI*2 - Math.PI/2;
        verts.push({x: x + Math.cos(a)*triR, y: y + Math.sin(a)*triR});
      }
      // sample uniformly in triangle using barycentric method
      for(let i=0;i<particles;i++){
        let u = Math.random(), v = Math.random();
        if(u + v > 1){ u = 1 - u; v = 1 - v; }
        const A = verts[0], B = verts[1], C = verts[2];
        const px = A.x + u*(B.x - A.x) + v*(C.x - A.x);
        const py = A.y + u*(B.y - A.y) + v*(C.y - A.y);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.globalAlpha = (Math.random()*0.6+0.2) * alpha;
        const s = Math.random()*2 + 0.6;
        ctx.fillRect(px,py,s,s);
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }

  document.getElementById('brush-point').addEventListener('click',()=>{brush='point';setActiveButton('brush-point')});
  document.getElementById('brush-circle').addEventListener('click',()=>{brush='circle';setActiveButton('brush-circle')});
  document.getElementById('brush-triangle').addEventListener('click',()=>{brush='triangle';setActiveButton('brush-triangle')});

  function getColor(){
    const a = parseFloat(opacityIn ? opacityIn.value : 1);
    return `rgba(${+rIn.value},${+gIn.value},${+bIn.value},${a})`;
  }

  function drawShape(x,y){
    const size = +sizeInput.value;
    const segments = Math.max(3, Math.round(+segInput.value));
    ctx.fillStyle = getColor();
    ctx.beginPath();
    // chalk mode: particle-based textured drawing
    if(chalkToggle && chalkToggle.checked){
      drawChalk(x,y);
      return;
    }
    if(brush==='point'){
      // draw a centered square roughly matching the diameter of the other shapes
      const side = Math.max(2, size * 2);
      ctx.fillRect(x - side/2, y - side/2, side, side);
      return;
    }

    if(brush==='circle'){
      // polygonal circle using segments
      for(let i=0;i<segments;i++){
        const a = (i/segments)*Math.PI*2;
        const px = x + Math.cos(a)*size;
        const py = y + Math.sin(a)*size;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }

    if(brush==='triangle'){
      // equilateral triangle centered at x,y
      // increase circumradius so triangle height matches other shapes
      const triR = size * (1.3);
      for(let i=0;i<3;i++){
        const a = (i/3)*Math.PI*2 - Math.PI/2; // point up
        const px = x + Math.cos(a)*triR;
        const py = y + Math.sin(a)*triR;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
  }

  function sampleAndDraw(from, to){
    if(!from) { drawShape(to.x,to.y); lastPos = to; return; }
    const size = +sizeInput.value;
    const spacing = Math.max(2, size * 0.6);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if(dist < spacing){
      drawShape(to.x,to.y);
      lastPos = to;
      return;
    }
    const steps = Math.floor(dist/spacing);
    for(let i=1;i<=steps;i++){
      const t = i/steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      drawShape(x,y);
    }
    // ensure final point
    drawShape(to.x,to.y);
    lastPos = to;
  }

  // mouse handling
  function getPos(evt){
    const rect = canvas.getBoundingClientRect();
    return {x: evt.clientX - rect.left, y: evt.clientY - rect.top};
  }

  canvas.addEventListener('mousedown', (e)=>{
    drawing = true;
    const p = getPos(e);
    // save snapshot for undo (one snapshot per stroke)
    try{
      if(history.length >= maxHistory) history.shift();
      history.push(ctx.getImageData(0,0,canvas.width,canvas.height));
    }catch(err){ /* getImageData may fail if cross-origin, ignore */ }
    sampleAndDraw(null, p);
  });

  window.addEventListener('mouseup', ()=>{ drawing = false; lastPos = null; });

  canvas.addEventListener('mousemove', (e)=>{
    if(!drawing) return;
    const p = getPos(e);
    sampleAndDraw(lastPos, p);
  });

  // remove the separate click handler (mousedown handles both click & drag)

  clearBtn.addEventListener('click', ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
  });

  undoBtn.addEventListener('click', ()=>{
    if(history.length>0){
      const img = history.pop();
      ctx.putImageData(img, 0, 0);
    }else{
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
  });

  // support touch
  canvas.addEventListener('touchstart',(ev)=>{ ev.preventDefault(); drawing=true; const t=ev.touches[0]; const p=getPos(t);
    try{ if(history.length >= maxHistory) history.shift(); history.push(ctx.getImageData(0,0,canvas.width,canvas.height)); }catch(e){}
    sampleAndDraw(null,p);
  });
  canvas.addEventListener('touchmove',(ev)=>{ ev.preventDefault(); if(!drawing) return; const t=ev.touches[0]; const p=getPos(t); sampleAndDraw(lastPos,p); });
  canvas.addEventListener('touchend',(ev)=>{ drawing=false; lastPos = null; });

  // update UI preview and numeric displays
  function updatePreview(){
    if(colorPreview) colorPreview.style.background = getColor();
    if(sizeVal) sizeVal.textContent = sizeInput.value;
    if(segVal) segVal.textContent = segInput.value;
  }
  [rIn,gIn,bIn,opacityIn,sizeInput,segInput].forEach(el=>{ if(el) el.addEventListener('input', updatePreview); });
  updatePreview();

  // keyboard undo (Ctrl+Z / Cmd+Z)
  window.addEventListener('keydown',(e)=>{
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      if(undoBtn) undoBtn.click();
    }
  });

  // resize canvas on window resize to keep it simple (not scaling contents)
  window.addEventListener('resize', ()=>{
    // keep current size
  });

})();
