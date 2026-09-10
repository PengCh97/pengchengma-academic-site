(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const clean = v => String(v ?? '').trim();
  const maybeNum = v => clean(v) === '' ? NaN : Number(v);
  const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
  const safeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const debounce = (fn, wait = 220) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };
  const excelRound = (v, digits = 0) => {
    if (!Number.isFinite(v)) return NaN;
    const p = 10 ** digits;
    return Math.sign(v || 1) * Math.round(Math.abs(v) * p + Number.EPSILON) / p;
  };

  // ---------- tabs ----------
  $$('.tool-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tool-tab').forEach(b => b.classList.toggle('active', b === btn));
    $$('.tool-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
  }));

  function editableCell(value, key, opts = {}) {
    const type = opts.type || 'number';
    const step = opts.step || 'any';
    const min = opts.min != null ? ` min="${opts.min}"` : '';
    const cls = opts.className ? ` class="${opts.className}"` : '';
    return `<input data-key="${key}" type="${type}" step="${step}"${min}${cls} value="${safeText(value ?? '')}" aria-label="${safeText(opts.label || key)}">`;
  }
  function outCell(key, className = '') { return `<td data-out="${key}" class="sheet-output ${className}">—</td>`; }
  function addDeleteButton() { return '<button class="row-delete" type="button" title="删除该行">×</button>'; }
  function bindDelete(row, minRows = 1, recalc = null) {
    $('.row-delete', row)?.addEventListener('click', () => {
      const tbody = row.parentElement;
      if (tbody.children.length > minRows) row.remove();
      else $$('input', row).forEach(i => i.value = '');
      if (recalc) recalc();
    });
  }
  function setOut(row, key, value, digits = 2, raw = false) {
    const cell = $(`[data-out="${key}"]`, row);
    if (!cell) return;
    cell.textContent = raw ? (value ?? '—') : fmt(value, digits);
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- Kurlov ----------
  // Atomic/molecular masses and valences intentionally follow the uploaded workbook.
  const ionDefs = {
    Na:   {label:'Na', mol:23, charge:1, group:'cat'},
    K:    {label:'K', mol:39, charge:1, group:'cat'},
    Ca:   {label:'Ca', mol:40, charge:2, group:'cat'},
    Mg:   {label:'Mg', mol:24, charge:2, group:'cat'},
    Cl:   {label:'Cl', mol:35.5, charge:1, group:'an'},
    SO4:  {label:'SO₄', mol:96, charge:2, group:'an'},
    HCO3: {label:'HCO₃', mol:61, charge:1, group:'an'},
    CO3:  {label:'CO₃', mol:60, charge:2, group:'an'},
    Fe2:  {label:'Fe²⁺', mol:56, charge:2, group:'cat'},
    Fe3:  {label:'Fe³⁺', mol:56, charge:3, group:'cat'},
    Al:   {label:'Al³⁺', mol:27, charge:3, group:'cat'},
    NH4:  {label:'NH₄', mol:20, charge:1, group:'cat'},
    F:    {label:'F', mol:19, charge:1, group:'an'},
    NO3:  {label:'NO₃', mol:62, charge:1, group:'an'}
  };
  const majorFields = ['Na','K','Ca','Mg','Cl','SO4','HCO3'];
  const minorFields = ['CO3','Fe2','Fe3','Al','NH4','F','NO3'];
  const kFields = [...majorFields, ...minorFields];
  const kRows = $('#kurlovRows');
  let kurlovComputed = [];

  function addKurlovRow(data = {}) {
    const tr = document.createElement('tr');
    const id = data.id ?? `S${kRows.children.length + 1}`;
    tr.innerHTML = `<td>${editableCell(id,'id',{type:'text',label:'样品编号'})}</td>` +
      kFields.map(k => `<td class="${minorFields.includes(k) ? 'minor-ion-cell' : 'major-ion-cell'}">${editableCell(data[k] ?? '', k, {min:0,label:`${ionDefs[k].label} mg/L`})}</td>`).join('') +
      `<td>${addDeleteButton()}</td>`;
    kRows.appendChild(tr);
    bindDelete(tr, 1, debounce(calculateKurlov, 30));
  }
  function readKurlovRows() {
    return [...kRows.rows].map((r, idx) => {
      const o = {id: clean($('[data-key="id"]', r).value) || `S${idx+1}`};
      kFields.forEach(k => o[k] = Math.max(0, num($(`[data-key="${k}"]`, r).value, 0)));
      return o;
    }).filter(o => kFields.some(k => o[k] > 0));
  }
  function meq(mg, def) { return mg / def.mol * def.charge; }
  function kurlovFormula(sample, ionMeq, catTotal, anTotal) {
    const cats = kFields.filter(k => ionDefs[k].group === 'cat')
      .map(k => [k, catTotal ? ionMeq[k]/catTotal*100 : 0])
      .filter(x => x[1] >= 25).sort((a,b)=>b[1]-a[1]);
    const ans = kFields.filter(k => ionDefs[k].group === 'an')
      .map(k => [k, anTotal ? ionMeq[k]/anTotal*100 : 0])
      .filter(x => x[1] >= 25).sort((a,b)=>b[1]-a[1]);
    const render = arr => arr.length ? arr.map(([k,p]) => `${ionDefs[k].label}${Math.round(p)}`).join('·') : '混合型';
    const M = kFields.reduce((s,k)=>s+sample[k],0)/1000;
    return `M${M.toFixed(3)}  ${render(ans)} / ${render(cats)}`;
  }
  // 水化学类型判别：Na、K 分开；HCO3、CO3 分开。
  // 判别显示时不带离子价态；同类离子之间用居中的实心原点“·”连接，
  // 阳离子与阴离子之间用短横线“-”连接，例如：Ca·Mg-HCO3型。
  function hydroType(p) {
    const c = [
      ['Ca', p.Ca],
      ['Mg', p.Mg],
      ['Na', p.Na],
      ['K', p.K]
    ].sort((a,b)=>b[1]-a[1]);

    const a = [
      ['HCO3', p.HCO3],
      ['CO3', p.CO3],
      ['SO4', p.SO4],
      ['Cl', p.Cl]
    ].sort((a,b)=>b[1]-a[1]);

    const pick = arr => {
      if (arr[0][1] >= 50) return arr[0][0];
      const majors = arr.filter(x => x[1] >= 25).map(x=>x[0]);
      if (majors.length) return majors.join('·');
      return arr.slice(0, 2).map(x => x[0]).join('·');
    };

    return `${pick(c)}-${pick(a)}型`;
  }
  function computeKurlov(sample) {
    const ionMeq = {};
    kFields.forEach(k => ionMeq[k] = meq(sample[k], ionDefs[k]));
    const catTotal = kFields.filter(k=>ionDefs[k].group==='cat').reduce((s,k)=>s+ionMeq[k],0);
    const anTotal = kFields.filter(k=>ionDefs[k].group==='an').reduce((s,k)=>s+ionMeq[k],0);
    const balance = (catTotal + anTotal) ? (catTotal-anTotal)/(catTotal+anTotal)*100 : NaN;
    const majorCat = ionMeq.Ca + ionMeq.Mg + ionMeq.Na + ionMeq.K;
    const majorAn = ionMeq.HCO3 + ionMeq.CO3 + ionMeq.Cl + ionMeq.SO4;
    const p = {
      Ca: majorCat ? ionMeq.Ca/majorCat*100 : 0,
      Mg: majorCat ? ionMeq.Mg/majorCat*100 : 0,
      Na: majorCat ? ionMeq.Na/majorCat*100 : 0,
      K: majorCat ? ionMeq.K/majorCat*100 : 0,
      NaK: majorCat ? (ionMeq.Na+ionMeq.K)/majorCat*100 : 0,
      Cl: majorAn ? ionMeq.Cl/majorAn*100 : 0,
      SO4: majorAn ? ionMeq.SO4/majorAn*100 : 0,
      HCO3: majorAn ? ionMeq.HCO3/majorAn*100 : 0,
      CO3: majorAn ? ionMeq.CO3/majorAn*100 : 0,
      HCO3CO3: majorAn ? (ionMeq.HCO3+ionMeq.CO3)/majorAn*100 : 0
    };
    return {
      ...sample, ionMeq, catTotal, anTotal, balance, p,
      M: kFields.reduce((s,k)=>s+sample[k],0)/1000,
      type: hydroType(p),
      formula: kurlovFormula(sample, ionMeq, catTotal, anTotal)
    };
  }
  function calculateKurlov() {
    const rows = readKurlovRows();
    const status = $('#kurlovStatus');
    if (!rows.length) {
      status.textContent = '请至少输入一组有效的离子浓度。';
      $('#kurlovResults').innerHTML=''; kurlovComputed=[]; drawPiper([]); return;
    }
    kurlovComputed = rows.map(computeKurlov);
    $('#kurlovResults').innerHTML = kurlovComputed.map(r => `<tr><td>${safeText(r.id)}</td><td>${fmt(r.M,3)}</td><td>${fmt(r.catTotal,3)}</td><td>${fmt(r.anTotal,3)}</td><td class="${Math.abs(r.balance)>5?'warn-cell':'ok-cell'}">${fmt(r.balance,2)}%</td><td>${safeText(r.type)}</td><td class="formula-cell">${safeText(r.formula)}</td></tr>`).join('');
    status.textContent = `已计算 ${kurlovComputed.length} 组水样；Piper 三线图已同步更新。`;
    drawPiper(kurlovComputed);
  }

  // ---------- Piper diagram ----------
  const PIPER_RIGHT = 1.35;
  const SQ3 = Math.sqrt(3);
  const TRI_H = SQ3 / 2;

  function piperCoordinates(p) {
    // Cation triangle: Ca at lower-left, Na+K at lower-right, Mg at apex.
    const catX = (p.NaK + p.Mg/2) / 100;
    const catY = TRI_H * p.Mg / 100;
    // Anion triangle: HCO3+CO3 at lower-left, Cl at lower-right, SO4 at apex.
    const anX = PIPER_RIGHT + (p.Cl + p.SO4/2) / 100;
    const anY = TRI_H * p.SO4 / 100;
    // Standard 60-degree projection from both ternary triangles into the diamond.
    const diaX = 0.5*(catX+anX) + (anY-catY)/(2*SQ3);
    const diaY = (SQ3/2)*(anX-catX) + 0.5*(anY+catY);
    return {catX,catY,anX,anY,diaX,diaY};
  }

  function drawPiper(data) {
    const canvas = $('#piperCanvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const side = 425, plotLeft = 365, baseY = 1010;
    const sx = x => plotLeft + x * side;
    const sy = y => baseY - y * side;
    const ink = '#111820', grid = '#aeb9bf', minorGrid = '#c9d0d4', dashed = '#28343a';

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.lineCap='round'; ctx.lineJoin='round';

    const line = (pts, opts={}) => {
      ctx.save(); ctx.beginPath();
      ctx.strokeStyle = opts.color || ink;
      ctx.lineWidth = opts.width || 1.4;
      ctx.setLineDash(opts.dash || []);
      pts.forEach((p,i) => i ? ctx.lineTo(sx(p[0]),sy(p[1])) : ctx.moveTo(sx(p[0]),sy(p[1])));
      ctx.stroke(); ctx.restore();
    };
    const lerp = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
    const offsetFromEdge = (a,b,t,dist,outward=1) => {
      const p = lerp(a,b,t);
      const dx = b[0]-a[0], dy = b[1]-a[1];
      const L = Math.hypot(dx,dy) || 1;
      const nx = outward * (-dy / L) * (dist / side);
      const ny = outward * (dx / L) * (dist / side);
      return [p[0] + nx, p[1] + ny];
    };
    const text = (txt, x, y, opts={}) => {
      ctx.save();
      ctx.translate(sx(x),sy(y));
      if (opts.rotate) ctx.rotate(rad(opts.rotate));
      ctx.fillStyle = opts.color || ink;
      ctx.font = `${opts.italic?'italic ':''}${opts.weight||500} ${opts.size||18}px ${opts.serif?'Georgia,"Times New Roman",serif':'system-ui,-apple-system,"Microsoft YaHei",sans-serif'}`;
      ctx.textAlign = opts.align || 'center'; ctx.textBaseline = opts.baseline || 'middle';
      ctx.fillText(txt,0,0); ctx.restore();
    };
    const pixelText = (txt,x,y,opts={}) => {
      ctx.save(); ctx.translate(x,y); if(opts.rotate)ctx.rotate(rad(opts.rotate));
      ctx.fillStyle=opts.color||ink; ctx.font=`${opts.weight||500} ${opts.size||16}px system-ui,-apple-system,"Microsoft YaHei",sans-serif`;
      ctx.textAlign=opts.align||'left';ctx.textBaseline='middle';ctx.fillText(txt,0,0);ctx.restore();
    };
    const tick = (a,b,t,len=8) => {
      const p=lerp(a,b,t); const dx=b[0]-a[0],dy=b[1]-a[1]; const L=Math.hypot(dx,dy); const nx=-dy/L,ny=dx/L;
      line([[p[0]-nx*len/side/2,p[1]-ny*len/side/2],[p[0]+nx*len/side/2,p[1]+ny*len/side/2]],{width:1.4});
    };

    const L0=[0,0], LA=[.5,TRI_H], L1=[1,0];
    const R0=[PIPER_RIGHT,0], RA=[PIPER_RIGHT+.5,TRI_H], R1=[PIPER_RIGHT+1,0];

    // Triangle grids at 20%; 50% classification lines are darker/dashed.
    [0.2,0.4,0.6,0.8].forEach(f => {
      const opts={color:minorGrid,width:1};
      line([[.5*f,TRI_H*f],[1-.5*f,TRI_H*f]],opts);
      line([[f,0],[.5+.5*f,TRI_H*(1-f)]],opts);
      line([[1-f,0],[.5-.5*f,TRI_H*(1-f)]],opts);
      const o=PIPER_RIGHT;
      line([[o+.5*f,TRI_H*f],[o+1-.5*f,TRI_H*f]],opts);
      line([[o+f,0],[o+.5+.5*f,TRI_H*(1-f)]],opts);
      line([[o+1-f,0],[o+.5-.5*f,TRI_H*(1-f)]],opts);
    });

    // Outlines.
    line([L0,LA,L1,L0],{width:2.5});
    line([R0,RA,R1,R0],{width:2.5});

    // Diamond vertices from end members.
    const cd = q => { const z=piperCoordinates(q); return [z.diaX,z.diaY]; };
    const DL=cd({Ca:100,Mg:0,NaK:0,Cl:0,SO4:0,HCO3CO3:100});
    const DB=cd({Ca:0,Mg:0,NaK:100,Cl:0,SO4:0,HCO3CO3:100});
    const DR=cd({Ca:0,Mg:0,NaK:100,Cl:100,SO4:0,HCO3CO3:0});
    const DT=cd({Ca:100,Mg:0,NaK:0,Cl:100,SO4:0,HCO3CO3:0});

    // Diamond grid: two 20% line families.
    [0.2,0.4,0.6,0.8].forEach(t=>{
      line([lerp(DL,DT,t),lerp(DB,DR,t)],{color:grid,width:1});
      line([lerp(DL,DB,t),lerp(DT,DR,t)],{color:grid,width:1});
    });
    line([DL,DB,DR,DT,DL],{width:2.6});

    // Ticks and numbers, every 10%, labels every 20%.
    for(let i=0;i<=10;i++){
      const t=i/10;
      tick(L0,L1,t, i%2===0?11:7); tick(L0,LA,t, i%2===0?11:7); tick(LA,L1,t, i%2===0?11:7);
      tick(R0,R1,t, i%2===0?11:7); tick(R0,RA,t, i%2===0?11:7); tick(RA,R1,t, i%2===0?11:7);
      if(i%2===0){
        text(String(100-i*10),t,-.085,{size:17});
        const ml=lerp(L0,LA,t); text(String(i*10),ml[0]-.075,ml[1],{size:17,rotate:-60});
        const nk=lerp(LA,L1,t); text(String(i*10),nk[0]+.075,nk[1],{size:17,rotate:60});
        text(String(i*10),PIPER_RIGHT+t,-.085,{size:17});
        const hc=lerp(R0,RA,t); text(String(100-i*10),hc[0]-.075,hc[1],{size:17,rotate:-60});
        const so=lerp(RA,R1,t); text(String(100-i*10),so[0]+.075,so[1],{size:17,rotate:60});
      }
    }

    // Axis labels: move all English labels closer to the outer side of the solid edges.
    const mgLabel = offsetFromEdge(L0, LA, 0.48, 78, 1);
    const nakLabel = offsetFromEdge(LA, L1, 0.50, 78, 1);
    const hco3Label = offsetFromEdge(R0, RA, 0.50, 68, 1);
    const so4Label = offsetFromEdge(RA, R1, 0.50, 66, 1);
    const leftTopText = offsetFromEdge(DL, DT, 0.53, 74, 1);
    const rightTopText = offsetFromEdge(DR, DT, 0.53, 74, -1);

    text('Ca²⁺', 0.5, -0.17, {size:25, serif:true});
    text('Mg²⁺', mgLabel[0]-0.02, mgLabel[1], {size:24, serif:true, rotate:-60});
    text('Na⁺ + K⁺', nakLabel[0]+0.02, nakLabel[1], {size:22, serif:true, rotate:60});
    text('Cl⁻', PIPER_RIGHT+0.5, -0.17, {size:25, serif:true});
    text('CO₃²⁻ + HCO₃⁻', hco3Label[0]-0.01, hco3Label[1]-0.01, {size:20, serif:true, rotate:-60});
    text('SO₄²⁻', so4Label[0]+0.01, so4Label[1], {size:24, serif:true, rotate:60});

    // Diamond labels stay outside the upper two solid edges.
    text('Cl⁻ + SO₄²⁻', leftTopText[0]-0.01, leftTopText[1], {size:22, serif:true, rotate:-60});
    text('Ca²⁺ + Mg²⁺', rightTopText[0]+0.01, rightTopText[1], {size:22, serif:true, rotate:60});

    // Diamond side percentage labels (0–100), 20% steps.
    [0,0.2,0.4,0.6,0.8,1].forEach(t=>{
      const p1=lerp(DL,DT,t); text(String(Math.round(t*100)),p1[0]-.065,p1[1],{size:16,rotate:-60});
      const p2=lerp(DR,DT,t); text(String(Math.round(t*100)),p2[0]+.065,p2[1],{size:16,rotate:60});
    });

    // Marker drawing.
    const colors=['#55595d','#d63cff','#1d9be0','#10c738','#f01818','#f08a19','#7f59c7','#008f8c','#b14766','#284bd6','#6b8e23','#b66b00'];
    const shapes=['square','circle','triangle','diamond','left','right','pentagon','star','plus','cross','down','hexagon'];
    function drawMarker(x,y,shape,color,size=9){
      ctx.save();ctx.translate(sx(x),sy(y));ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;
      ctx.beginPath();
      const poly=(n,rot=-Math.PI/2)=>{for(let i=0;i<n;i++){const a=rot+i*2*Math.PI/n,px=Math.cos(a)*size,py=Math.sin(a)*size;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();};
      if(shape==='circle')ctx.arc(0,0,size,0,Math.PI*2);
      else if(shape==='square')ctx.rect(-size,-size,size*2,size*2);
      else if(shape==='triangle')poly(3);
      else if(shape==='down')poly(3,Math.PI/2);
      else if(shape==='diamond'){ctx.moveTo(0,-size*1.2);ctx.lineTo(size*1.1,0);ctx.lineTo(0,size*1.2);ctx.lineTo(-size*1.1,0);ctx.closePath();}
      else if(shape==='left'){ctx.moveTo(-size*1.2,0);ctx.lineTo(size*.9,-size);ctx.lineTo(size*.9,size);ctx.closePath();}
      else if(shape==='right'){ctx.moveTo(size*1.2,0);ctx.lineTo(-size*.9,-size);ctx.lineTo(-size*.9,size);ctx.closePath();}
      else if(shape==='pentagon')poly(5);
      else if(shape==='hexagon')poly(6);
      else if(shape==='star'){for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.42:size*1.2,px=Math.cos(a)*r,py=Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
      else if(shape==='plus'){ctx.moveTo(-size,0);ctx.lineTo(size,0);ctx.moveTo(0,-size);ctx.lineTo(0,size);ctx.stroke();ctx.restore();return;}
      else if(shape==='cross'){ctx.moveTo(-size,-size);ctx.lineTo(size,size);ctx.moveTo(size,-size);ctx.lineTo(-size,size);ctx.stroke();ctx.restore();return;}
      ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();ctx.restore();
    }

    data.forEach((r,i)=>{
      const c=piperCoordinates(r.p), color=colors[Math.floor(i/4)%colors.length], shape=shapes[i%shapes.length];
      drawMarker(c.catX,c.catY,shape,color,9);
      drawMarker(c.anX,c.anY,shape,color,9);
      drawMarker(c.diaX,c.diaY,shape,color,10);
    });

    // Legend inside the canvas, as in conventional exported Piper figures.
    pixelText('样品 / Sample',38,62,{size:17,weight:800});
    const maxLegend=31, rowH=29;
    data.slice(0,maxLegend).forEach((r,i)=>{
      const color=colors[Math.floor(i/4)%colors.length],shape=shapes[i%shapes.length];
      // Draw marker in pixel coordinates by temporarily converting to normalized coordinates.
      const px=52,py=98+i*rowH;
      ctx.save();ctx.translate(px,py);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();
      const s=6;
      if(shape==='circle')ctx.arc(0,0,s,0,Math.PI*2);
      else if(shape==='square')ctx.rect(-s,-s,s*2,s*2);
      else if(shape==='triangle'){ctx.moveTo(0,-s);ctx.lineTo(s,s);ctx.lineTo(-s,s);ctx.closePath();}
      else if(shape==='down'){ctx.moveTo(0,s);ctx.lineTo(s,-s);ctx.lineTo(-s,-s);ctx.closePath();}
      else if(shape==='diamond'){ctx.moveTo(0,-s);ctx.lineTo(s,0);ctx.lineTo(0,s);ctx.lineTo(-s,0);ctx.closePath();}
      else if(shape==='left'){ctx.moveTo(-s,0);ctx.lineTo(s,-s);ctx.lineTo(s,s);ctx.closePath();}
      else if(shape==='right'){ctx.moveTo(s,0);ctx.lineTo(-s,-s);ctx.lineTo(-s,s);ctx.closePath();}
      else if(shape==='pentagon'){for(let j=0;j<5;j++){const a=-Math.PI/2+j*2*Math.PI/5,x=Math.cos(a)*s,y=Math.sin(a)*s;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
      else if(shape==='hexagon'){for(let j=0;j<6;j++){const a=j*2*Math.PI/6,x=Math.cos(a)*s,y=Math.sin(a)*s;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
      else if(shape==='star'){for(let j=0;j<10;j++){const a=-Math.PI/2+j*Math.PI/5,rr=j%2?s*.42:s*1.15,x=Math.cos(a)*rr,y=Math.sin(a)*rr;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
      else if(shape==='plus'){ctx.moveTo(-s,0);ctx.lineTo(s,0);ctx.moveTo(0,-s);ctx.lineTo(0,s);ctx.stroke();ctx.restore();pixelText(clean(r.id).slice(0,28),70,py,{size:15});return;}
      else if(shape==='cross'){ctx.moveTo(-s,-s);ctx.lineTo(s,s);ctx.moveTo(s,-s);ctx.lineTo(-s,s);ctx.stroke();ctx.restore();pixelText(clean(r.id).slice(0,28),70,py,{size:15});return;}
      ctx.fill();ctx.restore();
      pixelText(clean(r.id).slice(0,28),70,py,{size:15});
    });
    if(data.length>maxLegend)pixelText(`… 另有 ${data.length-maxLegend} 组`,38,98+maxLegend*rowH,{size:14,color:'#53646d'});

    $('#piperLegend').innerHTML=data.map((r,i)=>`<span><i style="--legend-color:${colors[Math.floor(i/4)%colors.length]}"></i><b>${i+1}</b> ${safeText(r.id)} · ${safeText(r.type)}</span>`).join('');
  }

  $('#addKurlovRow').addEventListener('click',()=>addKurlovRow());
  $('#calcKurlov').addEventListener('click',calculateKurlov);
  $('#clearKurlov').addEventListener('click',()=>{kRows.innerHTML='';addKurlovRow();$('#kurlovResults').innerHTML='';$('#kurlovStatus').textContent='';drawPiper([]);});
  $('#kurlovExample').addEventListener('click',()=>{kRows.innerHTML='';[
    {id:'GW-01',Na:18.6,K:2.1,Ca:82.4,Mg:21.8,Cl:24.6,SO4:35.2,HCO3:278,CO3:0,F:.3,NO3:7.6},
    {id:'GW-02',Na:96.2,K:4.8,Ca:34.1,Mg:12.5,Cl:118,SO4:42,HCO3:168,CO3:0,F:.5,NO3:5.1},
    {id:'GW-03',Na:178,K:7.2,Ca:19.3,Mg:8.4,Cl:226,SO4:71,HCO3:96,CO3:0,F:.6,NO3:3.8},
    {id:'GW-04',Na:25,K:2.8,Ca:68,Mg:19,Cl:18,SO4:22,HCO3:245,CO3:0}
  ].forEach(addKurlovRow); calculateKurlov();});
  $('#importKurlovPaste').addEventListener('click',()=>{
    const text=$('#kurlovPaste').value.trim();if(!text)return;
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), parsed=[];
    lines.forEach((line,i)=>{
      const a=line.split(/\t|,|，|\s{2,}/).map(x=>x.trim());
      if(a.length<8)return;
      if(i===0 && !Number.isFinite(Number(a[1])))return;
      const o={id:a[0]};
      const order=[...majorFields,...minorFields];
      order.forEach((k,j)=>{const v=Number(a[j+1]);if(Number.isFinite(v))o[k]=v;});
      if(majorFields.some(k=>Number(o[k])>0))parsed.push(o);
    });
    if(!parsed.length){$('#kurlovStatus').textContent='未识别到有效粘贴数据，请检查列顺序。';return;}
    kRows.innerHTML='';parsed.forEach(addKurlovRow);calculateKurlov();
  });
  $('#downloadPiper').addEventListener('click',()=>{const a=document.createElement('a');a.download='Piper_diagram.png';a.href=$('#piperCanvas').toDataURL('image/png');a.click();});

  // ---------- Profile correction: mirrors the uploaded “剖面校正表打印” ----------
  const profileRows = $('#profileRows');
  const profileExampleData = [
    {id:0,x:373114.538,y:3337660.534,z:67},{id:1,x:373188.635,y:3337724.388,z:74},{id:2,x:373244.122,y:3337753.846,z:82},{id:3,x:373306.719,y:3337776.828,z:106},{id:4,x:373333.289,y:3337802.372,z:107},
    {id:5,x:373382.841,y:3337808.362,z:95},{id:6,x:373424.675,y:3337836.758,z:95},{id:7,x:373492.305,y:3337854.005,z:93},{id:8,x:373515.119,y:3337874.274,z:93},{id:9,x:373612.318,y:3337899.472,z:98},
    {id:10,x:373704.907,y:3337917.283,z:102},{id:11,x:373781.068,y:3337972.453,z:98},{id:12,x:373864.769,y:3337997.291,z:88},{id:13,x:373898.519,y:3338004.887,z:74},{id:14,x:373945.926,y:3337994.788,z:72},
    {id:15,x:373971.247,y:3338015.307,z:70},{id:16,x:373984.188,y:3338019.206,z:68},{id:17,x:374002.168,y:3338019.905,z:68},{id:18,x:374027.363,y:3338021.039,z:68},{id:19,x:374063.285,y:3338024.704,z:73}
  ];

  function addProfileRow(d={}) {
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${editableCell(d.id??profileRows.children.length,'id',{type:'text'})}</td>`+
      `<td>${editableCell(d.x??'','x')}</td><td>${editableCell(d.y??'','y')}</td>`+
      outCell('az')+outCell('corrSlant')+outCell('dx')+outCell('dy')+outCell('plan')+outCell('cumPlan')+
      `<td>${editableCell(d.z??'','z')}</td>`+outCell('dz')+outCell('corrDz')+outCell('cumDz')+outCell('cumCorrDz')+
      outCell('slope')+outCell('beta')+outCell('cosb')+outCell('trueSlant')+outCell('gamma')+`<td>${addDeleteButton()}</td>`;
    profileRows.appendChild(tr); bindDelete(tr,2,debounce(calculateProfile,30));
  }
  function profileValidRows(){
    return [...profileRows.rows].map((row,index)=>({row,index,id:clean($('[data-key="id"]',row).value)||String(index),x:maybeNum($('[data-key="x"]',row).value),y:maybeNum($('[data-key="y"]',row).value),z:maybeNum($('[data-key="z"]',row).value)})).filter(p=>[p.x,p.y,p.z].every(Number.isFinite));
  }
  function clearProfileOutputs(){
    [...profileRows.rows].forEach(r=>$$('[data-out]',r).forEach(c=>c.textContent='—'));
  }
  function calculateProfile(){
    clearProfileOutputs();
    const pts=profileValidRows(),status=$('#profileStatus');
    if(pts.length<2){status.textContent='至少需要两个具有 X、Y、高程的有效测点。';$('#profileSummary').innerHTML='<span>剖面总方向 γ：—</span><span>累计平距：—</span><span>累计校正高差：—</span>';return;}
    const dxAll=pts.at(-1).x-pts[0].x,dyAll=pts.at(-1).y-pts[0].y;
    const gammaExact=deg(Math.atan(dxAll/dyAll)), gamma=excelRound(gammaExact,0);
    let cumPlan=0,cumDz=0,cumCorrDz=0;
    pts.forEach((p,i)=>{
      if(i===0)return;
      const a=pts[i-1],b=p,row=b.row;
      const dx=b.x-a.x,dy=b.y-a.y;
      const plan=excelRound(Math.hypot(dx,dy),2);
      const az=excelRound(deg(Math.atan(dx/dy)),0);
      const dz=b.z-a.z;
      const slope=deg(Math.atan(dz/plan));
      const beta=excelRound(slope,0);
      const cosb=excelRound(Math.cos(rad(beta)),4);
      const corrSlant=excelRound(plan/cosb,0);
      const corrDz=excelRound(corrSlant*Math.sin(rad(beta)),2);
      const trueSlant=excelRound(plan/Math.cos(rad(slope)),0);
      cumPlan=excelRound(cumPlan+plan,2);
      cumDz+=dz;
      cumCorrDz=excelRound(cumCorrDz+corrDz,2);
      setOut(row,'az',az,0);setOut(row,'corrSlant',corrSlant,2);setOut(row,'dx',dx,2);setOut(row,'dy',dy,2);setOut(row,'plan',plan,2);setOut(row,'cumPlan',cumPlan,2);
      setOut(row,'dz',dz,2);setOut(row,'corrDz',corrDz,2);setOut(row,'cumDz',cumDz,2);setOut(row,'cumCorrDz',cumCorrDz,2);setOut(row,'slope',slope,2);setOut(row,'beta',beta,0);setOut(row,'cosb',cosb,4);setOut(row,'trueSlant',trueSlant,2);setOut(row,'gamma',gamma,0);
    });
    $('#profileSummary').innerHTML=`<span>剖面总方向 γ：<strong>${fmt(gamma,0)}°</strong></span><span>累计平距：<strong>${fmt(cumPlan,2)} m</strong></span><span>累计校正高差：<strong>${fmt(cumCorrDz,2)} m</strong></span>`;
    status.textContent=`已按原剖面校正表公式计算 ${pts.length-1} 条导线。`;
  }
  $('#addProfileRow').addEventListener('click',()=>addProfileRow());
  $('#calcProfile').addEventListener('click',calculateProfile);
  $('#clearProfile').addEventListener('click',()=>{profileRows.innerHTML='';addProfileRow({id:0});addProfileRow({id:1});calculateProfile();$('#profileStatus').textContent='';});
  $('#profileExample').addEventListener('click',()=>{profileRows.innerHTML='';profileExampleData.forEach(addProfileRow);calculateProfile();});

  // ---------- Thickness: mirrors Sheet1 A:V ----------
  const thicknessRows=$('#thicknessRows');
  const thicknessExampleData = [
    {id:'0-1',dir:150,lineSlant:52,layerPos:0,L:49,beta:8,sign:'+',layer:'Qhedl'},
    {id:'',dir:'',lineSlant:'',layerPos:49,L:3,beta:'',sign:'+',layer:'K1ηγ'},
    {id:'1-2',dir:170,lineSlant:24,layerPos:'',L:24,beta:19,sign:'+',layer:''},
    {id:'2-3',dir:151,lineSlant:23,layerPos:'',L:60,beta:23,sign:'+',layer:''},
    {id:'3-4',dir:124,lineSlant:20,layerPos:'',L:20,beta:3,sign:'+',layer:''},
    {id:'4-5',dir:158,lineSlant:45,layerPos:'',L:45,beta:-16,sign:'+',layer:''},
    {id:'5-6',dir:130,lineSlant:19,layerPos:'',L:19,beta:0,sign:'+',layer:''},
    {id:'6-7',dir:83,lineSlant:21,layerPos:'',L:21,beta:-5,sign:'+',layer:''},
    {id:'7-8',dir:132,lineSlant:63,layerPos:0,L:63,beta:0,sign:'+',layer:'Qhedl'},
    {id:'8-9',dir:170,lineSlant:21,layerPos:'',L:4.5,beta:14,sign:'+',layer:''},
    {id:'',dir:'',lineSlant:'',layerPos:4.5,L:16.5,beta:'',dipDir:126,alpha:83,sign:'+',layer:'Ar3m'},
    {id:'9-10',dir:150,lineSlant:52,layerPos:'',L:52,beta:4,dipDir:126,alpha:83,sign:'+',layer:''},
    {id:'10-11',dir:175,lineSlant:32,layerPos:'',L:1.5,beta:-7,dipDir:126,alpha:83,sign:'+',layer:''},
    {id:'',dir:'',lineSlant:'',layerPos:1.5,L:4.5,beta:'',gamma:175,sign:'+',layer:'ηγ'},
    {id:'',dir:'',lineSlant:'',layerPos:6,L:26,beta:'',dipDir:126,alpha:83,sign:'+',layer:'Ar3m'},
    {id:'11-12',dir:174,lineSlant:58,layerPos:'',L:58,beta:-10,dipDir:173,alpha:35,sign:'+',layer:''},
    {id:'12-13',dir:162,lineSlant:65,layerPos:'',L:16,beta:-12,dipDir:173,alpha:35,sign:'+',layer:''},
    {id:'',dir:'',lineSlant:'',layerPos:16,L:49,beta:'',sign:'+',layer:'Qhedl'},
    {id:'13-14',dir:163,lineSlant:54,layerPos:'',L:54,beta:-2,sign:'+',layer:''},
    {id:'14-15',dir:156,lineSlant:54,layerPos:'',L:54,beta:-2,sign:'+',layer:''},
    {id:'15-16',dir:160,lineSlant:68,layerPos:'',L:68,beta:-2,sign:'+',layer:''},
    {id:'16-17',dir:156,lineSlant:37,layerPos:'',L:37,beta:0,sign:'+',layer:''},
    {id:'17-18',dir:163,lineSlant:57,layerPos:'',L:57,beta:0,sign:'+',layer:''},
    {id:'18-19',dir:163,lineSlant:50,layerPos:'',L:50,beta:6,sign:'+',layer:''},
    {id:'19-20',dir:151,lineSlant:62,layerPos:'',L:21,beta:10,sign:'+',layer:''},
    {id:'',dir:'',lineSlant:'',layerPos:21,L:41,beta:10,sign:'+',layer:'K1ηγ'},
    {id:'20-21',dir:143,lineSlant:74,layerPos:'',L:74,beta:9,sign:'+',layer:''},
    {id:'21-22',dir:139,lineSlant:31,layerPos:'',L:31,beta:4,sign:'+',layer:''},
    {id:'22-23',dir:130,lineSlant:34,layerPos:'',L:34,beta:14,sign:'+',layer:''},
    {id:'23-24',dir:122,lineSlant:40,layerPos:'',L:40,beta:30,sign:'+',layer:''},
    {id:'24-25',dir:117,lineSlant:19,layerPos:'',L:19,beta:22,sign:'+',layer:''},
    {id:'25-26',dir:140,lineSlant:31,layerPos:'',L:31,beta:11,sign:'+',layer:''}
  ];

  function addThicknessRow(d={}){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${editableCell(d.id??'','id',{type:'text'})}</td><td>${editableCell(d.dir??'','dir')}</td><td>${editableCell(d.lineSlant??'','lineSlant',{min:0})}</td>`+
      outCell('cumSlant')+`<td>${editableCell(d.layerPos??'','layerPos',{min:0})}</td><td>${editableCell(d.L??'','L',{min:0})}</td><td>${editableCell(d.beta??'','beta')}</td>`+
      `<td>${editableCell(d.dipDir??'','dipDir')}</td><td>${editableCell(d.alpha??'','alpha',{min:0})}</td>`+
      `<td>${editableCell(d.gamma??'','gamma',{className:'optional-formula',label:'γ（留空自动计算）'})}</td>`+outCell('sinAlpha')+outCell('cosBeta')+outCell('cosGamma')+outCell('prod1')+
      `<td><select data-key="sign"><option value="+" ${d.sign==='-'?'':'selected'}>＋</option><option value="-" ${d.sign==='-'?'selected':''}>−</option></select></td>`+
      outCell('cosAlpha')+outCell('sinBeta')+outCell('prod2')+outCell('Y')+outCell('D')+
      `<td>${editableCell(d.layer??'','layer',{type:'text'})}</td>`+outCell('layerCum')+`<td>${addDeleteButton()}</td>`;
    thicknessRows.appendChild(tr); bindDelete(tr,1,debounce(calculateThickness,30));
  }
  function calculateThickness(){
    const rows=[...thicknessRows.rows],status=$('#thicknessStatus');
    if(!rows.length){status.textContent='请至少输入一行。';return;}
    let prevDir=NaN,prevBeta=NaN,cumSlant=0,currentLayer='',layerCum=0,valid=0;
    const totals={};
    rows.forEach((row,idx)=>{
      const rawDir=maybeNum($('[data-key="dir"]',row).value), rawBeta=maybeNum($('[data-key="beta"]',row).value);
      const lineSlant=maybeNum($('[data-key="lineSlant"]',row).value), Lraw=maybeNum($('[data-key="L"]',row).value);
      const L=Number.isFinite(Lraw)?Lraw:(Number.isFinite(lineSlant)?lineSlant:NaN);
      if(Number.isFinite(rawDir))prevDir=rawDir;
      if(Number.isFinite(rawBeta))prevBeta=rawBeta;
      const dir=Number.isFinite(rawDir)?rawDir:prevDir, beta=Number.isFinite(rawBeta)?rawBeta:prevBeta;
      const dipDir=maybeNum($('[data-key="dipDir"]',row).value), alphaRaw=maybeNum($('[data-key="alpha"]',row).value), gammaOverride=maybeNum($('[data-key="gamma"]',row).value);
      const alpha=Number.isFinite(alphaRaw)?alphaRaw:0;
      const sign=$('[data-key="sign"]',row).value;
      const layerRaw=clean($('[data-key="layer"]',row).value);
      if(layerRaw){if(layerRaw!==currentLayer){currentLayer=layerRaw;layerCum=0;}}
      const effectiveLayer=currentLayer || '未分层';
      if(!Number.isFinite(L)||!Number.isFinite(beta)){
        $$('[data-out]',row).forEach(c=>c.textContent='—');return;
      }
      valid++;
      cumSlant+=L;
      const gamma=Number.isFinite(gammaOverride)?gammaOverride:((Number.isFinite(dipDir)&&Number.isFinite(dir))?dir-dipDir:NaN);
      const sinAlpha=Math.sin(rad(alpha)),cosBeta=Math.cos(rad(beta)),cosGamma=Number.isFinite(gamma)?Math.cos(rad(gamma)):1;
      const prod1=sinAlpha*cosBeta*cosGamma,cosAlpha=Math.cos(rad(alpha)),sinBeta=Math.sin(rad(beta)),prod2=cosAlpha*sinBeta;
      const Y=sign==='-'?prod1-prod2:prod1+prod2;
      // Exact behavior of the uploaded workbook's existing T-column cell calculations.
      const D=L*sinBeta;
      layerCum+=Math.abs(D);
      totals[effectiveLayer]=(totals[effectiveLayer]||0)+Math.abs(D);
      setOut(row,'cumSlant',cumSlant,2);setOut(row,'sinAlpha',sinAlpha,2);setOut(row,'cosBeta',cosBeta,2);setOut(row,'cosGamma',cosGamma,2);setOut(row,'prod1',prod1,2);
      setOut(row,'cosAlpha',cosAlpha,2);setOut(row,'sinBeta',sinBeta,2);setOut(row,'prod2',prod2,2);setOut(row,'Y',Y,2);setOut(row,'D',D,2);setOut(row,'layerCum',layerCum,2);
    });
    $('#layerSummary').innerHTML='<strong>按分层代号汇总（|D|）：</strong>'+Object.entries(totals).map(([k,v])=>`<span>${safeText(k)}：${fmt(v,2)} m</span>`).join('');
    status.textContent=valid?`已按原地层厚度表公式计算 ${valid} 个有效分段。`:'请输入斜距 L 和坡角 β。';
  }
  $('#addThicknessRow').addEventListener('click',()=>addThicknessRow());
  $('#calcThickness').addEventListener('click',calculateThickness);
  $('#clearThickness').addEventListener('click',()=>{thicknessRows.innerHTML='';addThicknessRow();calculateThickness();$('#thicknessStatus').textContent='';});
  $('#thicknessExample').addEventListener('click',()=>{thicknessRows.innerHTML='';thicknessExampleData.forEach(addThicknessRow);calculateThickness();});

  // ---------- Optional Excel import ----------
  function getWorkbook(file, cb){
    if(typeof XLSX==='undefined'){alert('Excel 解析组件尚未加载，请稍后重试；网页手动输入不受影响。');return;}
    const reader=new FileReader();reader.onload=e=>{try{cb(XLSX.read(e.target.result,{type:'array'}));}catch(err){console.error(err);alert('无法读取该文件，请确认是有效的 Excel/CSV 文件。');}};reader.readAsArrayBuffer(file);
  }
  function rowsOf(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});}
  function normIonName(v){return String(v).replace(/\s/g,'').replace(/[＋+]/g,'+').replace(/[－-]/g,'-').toUpperCase();}
  function ionKeyFromLabel(v){const s=normIonName(v);if(s.startsWith('NA'))return'Na';if(/^K\+?/.test(s))return'K';if(s.startsWith('CA'))return'Ca';if(s.startsWith('MG'))return'Mg';if(s.startsWith('FE2'))return'Fe2';if(s.startsWith('FE3'))return'Fe3';if(s.startsWith('AL'))return'Al';if(s.startsWith('NH4'))return'NH4';if(s.startsWith('HCO3'))return'HCO3';if(s.startsWith('CO3'))return'CO3';if(s.startsWith('CL'))return'Cl';if(s.startsWith('SO4'))return'SO4';if(/^F-?/.test(s))return'F';if(s.startsWith('NO3'))return'NO3';return null;}

  $('#kurlovFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;getWorkbook(file,wb=>{
    const imported=[];
    wb.SheetNames.forEach(name=>{const arr=rowsOf(wb.Sheets[name]);const sample={id:name};let found=0;arr.forEach(row=>{const key=ionKeyFromLabel(row[1]??row[0]);if(key){const v=Number(row[2]??row[1]);if(Number.isFinite(v)){sample[key]=v;found++;}}});if(found>=5)imported.push(sample);});
    if(!imported.length){alert('未识别到库尔洛夫模板离子行。请直接在网页表格输入，或使用原“库尔洛夫式计算”Excel 模板。');return;}
    kRows.innerHTML='';imported.forEach(addKurlovRow);calculateKurlov();
  });});

  $('#profileFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;getWorkbook(file,wb=>{
    let arr=[];
    if(wb.Sheets['剖面校正表打印']){
      arr=rowsOf(wb.Sheets['剖面校正表打印']).slice(5).map(r=>({id:r[0],x:r[1],y:r[2],z:r[9]}));
    }else if(wb.Sheets['PMC原始数据校正']){
      arr=rowsOf(wb.Sheets['PMC原始数据校正']).slice(2).map(r=>({id:r[0],x:r[5],y:r[4],z:r[9]}));
    }else{
      const raw=rowsOf(wb.Sheets[wb.SheetNames[0]]);arr=raw.slice(1).map(r=>({id:r[0],x:r[1],y:r[2],z:r[3]}));
    }
    arr=arr.filter(r=>[r.x,r.y,r.z].every(v=>clean(v)!==''&&Number.isFinite(Number(v))));
    if(arr.length<2){alert('未识别到至少两个有效的导线点。');return;}
    profileRows.innerHTML='';arr.forEach(addProfileRow);calculateProfile();
  });});

  $('#thicknessFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;getWorkbook(file,wb=>{
    const raw=rowsOf(wb.Sheets[wb.SheetNames[0]]);
    const arr=raw.slice(3).map(r=>({id:r[0],dir:r[1],lineSlant:r[2],layerPos:r[4],L:r[5],beta:r[6],dipDir:r[7],alpha:r[8],gamma:r[9],sign:r[14]==='-'?'-':'+',layer:r[20]})).filter(r=>(clean(r.L)!==''&&Number.isFinite(Number(r.L)))||(clean(r.lineSlant)!==''&&Number.isFinite(Number(r.lineSlant))));
    if(!arr.length){alert('未识别到地层厚度模板数据。');return;}
    thicknessRows.innerHTML='';arr.forEach(addThicknessRow);calculateThickness();
  });});

  // ---------- live calculation ----------
  function profileRowsData(){
    return [...profileRows.rows].map(r=>[clean($('[data-key="id"]',r)?.value), $('[data-out="dx"]',r)?.textContent, $('[data-out="dy"]',r)?.textContent, $('[data-out="dist"]',r)?.textContent, $('[data-out="dh"]',r)?.textContent]);
  }
  function thicknessRowsData(){
    return [...thicknessRows.rows].map(r=>[clean($('[data-key="id"]',r)?.value), $('[data-key="layer"]',r)?.value, $('[data-out="trueThickness"]',r)?.textContent, $('[data-out="layerCum"]',r)?.textContent]);
  }

  $('#exportKurlov')?.addEventListener('click',()=>downloadCSV('库尔洛夫计算结果.csv',[['样品','矿化度','阳离子总量','阴离子总量','误差','水化学类型','库尔洛夫式'],...kurlovComputed.map(r=>[r.id,r.M,r.catTotal,r.anTotal,r.balance,r.type,r.formula])]));
  $('#exportProfile')?.addEventListener('click',()=>downloadCSV('剖面校正计算结果.csv',[['导线号','ΔX','ΔY','平距','高差'],...profileRowsData()]));
  $('#exportThickness')?.addEventListener('click',()=>downloadCSV('地层厚度计算结果.csv',[['导线号','分层','真厚度','累计厚度'],...thicknessRowsData()]));

  const liveK=debounce(calculateKurlov),liveP=debounce(calculateProfile),liveT=debounce(calculateThickness);
  kRows.addEventListener('input',liveK);
  profileRows.addEventListener('input',liveP);
  thicknessRows.addEventListener('input',liveT);
  thicknessRows.addEventListener('change',liveT);

  // ---------- init ----------
  addKurlovRow();addKurlovRow();
  addProfileRow({id:0});addProfileRow({id:1});
  addThicknessRow();
  drawPiper([]);
})();
