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

  // ---------- tabs / direct links ----------
  const TOOL_TABS = ['kurlov','isotope','profile','thickness'];
  function activateToolTab(tabName, opts = {}) {
    if (!TOOL_TABS.includes(tabName)) return false;
    const btn = $(`.tool-tab[data-tab="${tabName}"]`);
    const panel = $(`.tool-panel[data-panel="${tabName}"]`);
    if (!btn || !panel) return false;
    $$('.tool-tab').forEach(b => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.tool-panel').forEach(p => p.classList.toggle('active', p === panel));
    if (opts.updateHash && history.replaceState) history.replaceState(null, '', `#${tabName}`);
    if (opts.scroll) requestAnimationFrame(() => panel.scrollIntoView({behavior: opts.smooth === false ? 'auto' : 'smooth', block:'start'}));
    return true;
  }
  function tabFromHash() {
    const hash = decodeURIComponent(location.hash || '').replace(/^#/, '').replace(/^panel-/, '');
    return TOOL_TABS.includes(hash) ? hash : '';
  }
  $$('.tool-tab').forEach(btn => btn.addEventListener('click', () => activateToolTab(btn.dataset.tab, {updateHash:true, scroll:true})));
  window.addEventListener('hashchange', () => {
    const tab = tabFromHash();
    if (tab) activateToolTab(tab, {scroll:true});
  });

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

  // ---------- Major-ion equiline diagnostics ----------
  // The 1:1 comparison must use equivalent concentrations (meq/L), not mg/L.
  // A ±10% ratio band is used only for automated visual classification; it is not a
  // universal geochemical boundary and should be checked against geology and other tracers.
  const EQUILINE_RATIO_LOW = 0.90;
  const EQUILINE_RATIO_HIGH = 1.10;

  function equilinePosition(y, x) {
    if (!(x > 0) && !(y > 0)) return {key:'none', label:'无有效数据', ratio:NaN};
    if (!(x > 0)) return {key:'above', label:'1:1 线上方', ratio:Infinity};
    const ratio = y / x;
    if (ratio >= EQUILINE_RATIO_LOW && ratio <= EQUILINE_RATIO_HIGH) return {key:'near', label:'1:1 线附近', ratio};
    return ratio > EQUILINE_RATIO_HIGH
      ? {key:'above', label:'1:1 线上方', ratio}
      : {key:'below', label:'1:1 线下方', ratio};
  }

  function nakClExplanation(pos) {
    if (pos.key === 'near') return 'Na⁺+K⁺ 与 Cl⁻ 的当量接近平衡；若 K⁺贡献较小，符合岩盐（NaCl）等氯化物盐溶解的化学计量特征，但混合过程也可能产生相似关系。';
    if (pos.key === 'above') return 'Na⁺+K⁺ 相对 Cl⁻ 过量，通常提示 Na/K 硅酸盐风化和/或阳离子交换（溶液中的 Ca、Mg 被交换位点吸附、Na 释放入水）对碱金属有贡献。';
    if (pos.key === 'below') return 'Cl⁻ 相对 Na⁺+K⁺ 过量，需考虑额外 Cl⁻ 来源（如咸水/海水混合、蒸发盐或人为输入）及/或反向阳离子交换造成的 Na 亏损；仅凭该图不能唯一判定机制。';
    return '缺少可用于判读的 Na、K 或 Cl 当量数据。';
  }

  function caMgAnionExplanation(pos) {
    if (pos.key === 'near') return 'Ca²⁺+Mg²⁺ 与 HCO₃⁻+SO₄²⁻ 的当量近似平衡，符合方解石/白云石与石膏/硬石膏等碳酸盐—硫酸盐矿物溶解的总体化学计量特征。';
    if (pos.key === 'above') return 'Ca²⁺+Mg²⁺ 相对 HCO₃⁻+SO₄²⁻ 过量，更常指向反向阳离子交换释放 Ca/Mg，或 Ca/Mg 由 Cl⁻、NO₃⁻ 等其他阴离子配平；不能简单等同于“碳酸盐溶解增强”。';
    if (pos.key === 'below') return 'HCO₃⁻+SO₄²⁻ 相对 Ca²⁺+Mg²⁺ 过量，常见于阳离子交换消耗 Ca/Mg 并释放 Na，和/或 Na/K 硅酸盐风化产生 HCO₃⁻ 且由 Na/K 配平；附加 SO₄²⁻ 来源也可能使点位向右偏移。';
    return '缺少可用于判读的 Ca、Mg、HCO₃ 或 SO₄ 当量数据。';
  }

  function ionDissolutionDiagnostic(ionMeq) {
    const nak = ionMeq.Na + ionMeq.K;
    const cl = ionMeq.Cl;
    const caMg = ionMeq.Ca + ionMeq.Mg;
    const hco3so4 = ionMeq.HCO3 + ionMeq.SO4;
    const nakCl = equilinePosition(nak, cl);
    const caMgAn = equilinePosition(caMg, hco3so4);
    return {
      nak, cl, caMg, hco3so4,
      nakCl: {...nakCl, explanation:nakClExplanation(nakCl)},
      caMgAn: {...caMgAn, explanation:caMgAnionExplanation(caMgAn)}
    };
  }
  function kurlovFormula(sample, ionMeq, catTotal, anTotal) {
    const cats = kFields.filter(k => ionDefs[k].group === 'cat')
      .map(k => [k, catTotal ? ionMeq[k]/catTotal*100 : 0])
      .filter(x => x[1] >= HYDRO_TYPE_THRESHOLD).sort((a,b)=>b[1]-a[1]);
    const ans = kFields.filter(k => ionDefs[k].group === 'an')
      .map(k => [k, anTotal ? ionMeq[k]/anTotal*100 : 0])
      .filter(x => x[1] >= HYDRO_TYPE_THRESHOLD).sort((a,b)=>b[1]-a[1]);
    const render = arr => arr.length ? arr.map(([k,p]) => `${ionDefs[k].label}${Math.round(p)}`).join('·') : '混合型';
    const M = kFields.reduce((s,k)=>s+sample[k],0)/1000;
    return `M${M.toFixed(3)}  ${render(ans)} / ${render(cats)}`;
  }
  // 水化学类型判别：按全部已输入阳/阴离子的当量百分比判定。
  // 规则：分别在总阳离子、总阴离子中筛选当量百分比 >= 25% 的离子，
  // 所有达到或超过阈值的离子都必须显示；即使某一离子 > 50%，也不能隐藏其他 >= 25% 的离子。
  const HYDRO_TYPE_THRESHOLD = 25;
  const hydroTypeLabels = {
    Na:'Na', K:'K', Ca:'Ca', Mg:'Mg', Fe2:'Fe²⁺', Fe3:'Fe³⁺', Al:'Al³⁺', NH4:'NH₄⁺',
    Cl:'Cl', SO4:'SO₄', HCO3:'HCO₃', CO3:'CO₃', F:'F', NO3:'NO₃'
  };
  function hydroType(ionPercent) {
    const pickGroup = group => {
      const selected = kFields
        .filter(k => ionDefs[k].group === group)
        .map(k => [k, ionPercent[k] || 0])
        .filter(([,pct]) => pct >= HYDRO_TYPE_THRESHOLD)
        .sort((a,b) => b[1] - a[1]);
      return selected.length ? selected.map(([k]) => hydroTypeLabels[k] || ionDefs[k].label).join('·') : '混合';
    };
    return `${pickGroup('cat')}-${pickGroup('an')}型`;
  }
  function nakmgFractions(sample) {
    const rawNa = Math.max(0, sample.Na) / 1000;
    const rawK = Math.max(0, sample.K) / 100;
    const rawMg = Math.sqrt(Math.max(0, sample.Mg));
    const sum = rawNa + rawK + rawMg;
    return {
      rawNa, rawK, rawMg, sum,
      Na: sum ? rawNa / sum * 100 : 0,
      K: sum ? rawK / sum * 100 : 0,
      Mg: sum ? rawMg / sum * 100 : 0
    };
  }
  function naKTemperature(sample) {
    // Giggenbach (1988): concentrations use the same mass-concentration unit (mg/L here).
    const na = Math.max(0, sample.Na);
    const k = Math.max(0, sample.K);
    if (!(na > 0 && k > 0)) return NaN;
    const denom = Math.log10(na / k) + 1.75;
    return Math.abs(denom) < 1e-12 ? NaN : 1390 / denom - 273.15;
  }
  function kMgTemperature(sample) {
    // Giggenbach K-Mg thermometer: K and Mg use the same mass-concentration unit (mg/L here).
    const k = Math.max(0, sample.K);
    const mg = Math.max(0, sample.Mg);
    if (!(k > 0 && mg > 0)) return NaN;
    const ratio = (k * k) / mg;
    if (!(ratio > 0)) return NaN;
    const denom = 14 - Math.log10(ratio);
    return Math.abs(denom) < 1e-12 ? NaN : 4410 / denom - 273.15;
  }
  function computeKurlov(sample) {
    const ionMeq = {};
    kFields.forEach(k => ionMeq[k] = meq(sample[k], ionDefs[k]));
    const catTotal = kFields.filter(k=>ionDefs[k].group==='cat').reduce((s,k)=>s+ionMeq[k],0);
    const anTotal = kFields.filter(k=>ionDefs[k].group==='an').reduce((s,k)=>s+ionMeq[k],0);
    const balance = (catTotal + anTotal) ? (catTotal-anTotal)/(catTotal+anTotal)*100 : NaN;
    const majorCat = ionMeq.Ca + ionMeq.Mg + ionMeq.Na + ionMeq.K;
    const majorAn = ionMeq.HCO3 + ionMeq.CO3 + ionMeq.Cl + ionMeq.SO4;
    // ionPercent：各离子占“全部已输入同号离子总当量”的百分比，用于库尔洛夫式与水化学类型判定。
    // p：仅保留 Piper 图所需的主要离子相对百分比，其分母仍为 Piper 主要离子之和。
    const ionPercent = {};
    kFields.forEach(k => {
      const total = ionDefs[k].group === 'cat' ? catTotal : anTotal;
      ionPercent[k] = total ? ionMeq[k] / total * 100 : 0;
    });
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

    const nk = nakmgFractions(sample);
    const nkCoord = nakmgCoordinates(nk);
    const fullY = curveYAtX(NAKMG_FULL_CURVE, nkCoord.x);
    const lowerY = curveYAtX(NAKMG_LOWER_CURVE, nkCoord.x);
    const tol = TRI_H * 0.012;
    let zone = '非平衡区';
    if (nk.sum > 0) {
      if (nkCoord.y >= fullY - tol) zone = '完全平衡区';
      else if (nkCoord.y >= lowerY - tol) zone = '局部平衡区';
    }
    const tNaK = naKTemperature(sample);
    const tKMg = kMgTemperature(sample);
    let recommendFormula = '不建议直接选用 Na-K / K-Mg 温标';
    let reservoirTemp = NaN;
    let remark = '位于非平衡区，建议结合其他温标或水岩平衡证据综合判断。';
    if (zone === '完全平衡区') {
      recommendFormula = 'Na-K 温标';
      reservoirTemp = tNaK;
      remark = Number.isFinite(tNaK) ? '优先采用 Na-K 温标估算理论热储温度。' : 'Na 或 K 数据不足，无法计算 Na-K 温标。';
    } else if (zone === '局部平衡区') {
      recommendFormula = 'K-Mg 温标';
      reservoirTemp = tKMg;
      remark = Number.isFinite(tKMg) ? '优先采用 K-Mg 温标估算理论热储温度。' : 'K 或 Mg 数据不足，无法计算 K-Mg 温标。';
    }

    const ionDiagnostic = ionDissolutionDiagnostic(ionMeq);

    return {
      ...sample, ionMeq, ionPercent, catTotal, anTotal, balance, p, ionDiagnostic,
      M: kFields.reduce((s,k)=>s+sample[k],0)/1000,
      type: hydroType(ionPercent),
      formula: kurlovFormula(sample, ionMeq, catTotal, anTotal),
      nakmg: {
        ...nk,
        coord: nkCoord,
        zone,
        recommendFormula,
        tNaK,
        tKMg,
        reservoirTemp,
        remark
      }
    };
  }
  function calculateKurlov() {
    const rows = readKurlovRows();
    const status = $('#kurlovStatus');
    if (!rows.length) {
      status.textContent = '请至少输入一组有效的离子浓度。';
      $('#kurlovResults').innerHTML='';
      if ($('#kurlovIonDetails')) $('#kurlovIonDetails').innerHTML='';
      $('#nakmgResults').innerHTML='';
      $('#ionDissolutionResults').innerHTML='';
      kurlovComputed=[]; drawPiper([]); drawIonDissolution([]); drawNaKMg([]); return;
    }
    kurlovComputed = rows.map(computeKurlov);
    $('#kurlovResults').innerHTML = kurlovComputed.map(r => `<tr><td>${safeText(r.id)}</td><td>${fmt(r.M,3)}</td><td>${fmt(r.catTotal,3)}</td><td>${fmt(r.anTotal,3)}</td><td class="${Math.abs(r.balance)>5?'warn-cell':'ok-cell'}">${fmt(r.balance,2)}%</td><td>${safeText(r.type)}</td><td class="formula-cell">${safeText(r.formula)}</td></tr>`).join('');
    const ionDetailBody = $('#kurlovIonDetails');
    if (ionDetailBody) {
      ionDetailBody.innerHTML = kurlovComputed.map(r => `<tr><td>${safeText(r.id)}</td>${kFields.map(k => `<td>${fmt(r.ionMeq[k],3)}</td><td class="${r.ionPercent[k] >= HYDRO_TYPE_THRESHOLD ? 'major-percent-cell' : ''}">${fmt(r.ionPercent[k],2)}%</td>`).join('')}</tr>`).join('');
    }
    $('#nakmgResults').innerHTML = kurlovComputed.map(r => `<tr><td>${safeText(r.id)}</td><td>${fmt(r.nakmg.rawNa,4)}</td><td>${fmt(r.nakmg.rawK,4)}</td><td>${fmt(r.nakmg.rawMg,4)}</td><td>${safeText(r.nakmg.zone)}</td><td>${safeText(r.nakmg.recommendFormula)}</td><td>${fmt(r.nakmg.tNaK,2)}</td><td>${fmt(r.nakmg.tKMg,2)}</td><td>${fmt(r.nakmg.reservoirTemp,2)}</td><td>${safeText(r.nakmg.remark)}</td></tr>`).join('');
    $('#ionDissolutionResults').innerHTML = kurlovComputed.map(r => {
      const d = r.ionDiagnostic;
      const ratio1 = Number.isFinite(d.nakCl.ratio) ? fmt(d.nakCl.ratio,2) : (d.nakCl.ratio === Infinity ? '∞' : '—');
      const ratio2 = Number.isFinite(d.caMgAn.ratio) ? fmt(d.caMgAn.ratio,2) : (d.caMgAn.ratio === Infinity ? '∞' : '—');
      return `<tr><td>${safeText(r.id)}</td><td>${fmt(d.cl,3)}</td><td>${fmt(d.nak,3)}</td><td>${ratio1}</td><td>${safeText(d.nakCl.label)}</td><td class="ion-explain-cell">${safeText(d.nakCl.explanation)}</td><td>${fmt(d.hco3so4,3)}</td><td>${fmt(d.caMg,3)}</td><td>${ratio2}</td><td>${safeText(d.caMgAn.label)}</td><td class="ion-explain-cell">${safeText(d.caMgAn.explanation)}</td></tr>`;
    }).join('');
    status.textContent = `已计算 ${kurlovComputed.length} 组水样；Piper 三线图、离子等当量关系图与 Na-K-Mg 三角图已同步更新。`;
    drawPiper(kurlovComputed);
    drawIonDissolution(kurlovComputed);
    drawNaKMg(kurlovComputed);
  }

  // ---------- Piper diagram ----------
  const PIPER_RIGHT = 1.35;
  const SQ3 = Math.sqrt(3);
  const TRI_H = SQ3 / 2;
  const NAKMG_TMIN = 0;
  const NAKMG_TMAX = 360;
  const NAKMG_ISOTHERM_STEP = 20;
  const NAKMG_LABEL_STEP = 40;
  const MARKER_COLORS = ['#55595d','#d63cff','#1d9be0','#10c738','#f01818','#f08a19','#7f59c7','#008f8c','#b14766','#284bd6','#6b8e23','#b66b00'];
  const MARKER_SHAPES = ['square','circle','triangle','diamond','left','right','pentagon','star','plus','cross','down','hexagon'];
  const markerColor = i => MARKER_COLORS[Math.floor(i/4)%MARKER_COLORS.length];
  const markerShape = i => MARKER_SHAPES[i%MARKER_SHAPES.length];

  function drawMarkerPixel(ctx, x, y, i, size = 7) {
    const shape = markerShape(i), color = markerColor(i), s = size;
    ctx.save(); ctx.translate(x, y); ctx.fillStyle=color; ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath();
    if(shape==='circle')ctx.arc(0,0,s,0,Math.PI*2);
    else if(shape==='square')ctx.rect(-s,-s,s*2,s*2);
    else if(shape==='triangle'){ctx.moveTo(0,-s);ctx.lineTo(s,s);ctx.lineTo(-s,s);ctx.closePath();}
    else if(shape==='down'){ctx.moveTo(0,s);ctx.lineTo(s,-s);ctx.lineTo(-s,-s);ctx.closePath();}
    else if(shape==='diamond'){ctx.moveTo(0,-s);ctx.lineTo(s,0);ctx.lineTo(0,s);ctx.lineTo(-s,0);ctx.closePath();}
    else if(shape==='left'){ctx.moveTo(-s,0);ctx.lineTo(s,-s);ctx.lineTo(s,s);ctx.closePath();}
    else if(shape==='right'){ctx.moveTo(s,0);ctx.lineTo(-s,-s);ctx.lineTo(-s,s);ctx.closePath();}
    else if(shape==='pentagon'){for(let j=0;j<5;j++){const a=-Math.PI/2+j*2*Math.PI/5,px=Math.cos(a)*s,py=Math.sin(a)*s;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
    else if(shape==='hexagon'){for(let j=0;j<6;j++){const a=j*2*Math.PI/6,px=Math.cos(a)*s,py=Math.sin(a)*s;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
    else if(shape==='star'){for(let j=0;j<10;j++){const a=-Math.PI/2+j*Math.PI/5,rr=j%2?s*.42:s*1.15,px=Math.cos(a)*rr,py=Math.sin(a)*rr;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
    else if(shape==='plus'){ctx.moveTo(-s,0);ctx.lineTo(s,0);ctx.moveTo(0,-s);ctx.lineTo(0,s);ctx.stroke();ctx.restore();return;}
    else if(shape==='cross'){ctx.moveTo(-s,-s);ctx.lineTo(s,s);ctx.moveTo(s,-s);ctx.lineTo(-s,s);ctx.stroke();ctx.restore();return;}
    ctx.fill(); ctx.restore();
  }

  function niceAxisMax(value) {
    if (!(value > 0)) return 10;
    const raw = value * 1.04;
    const exp = 10 ** Math.floor(Math.log10(raw));
    const f = raw / exp;
    const candidates = [1, 2, 2.5, 4, 5, 8, 10];
    const picked = candidates.find(v => f <= v) || 10;
    return picked * exp;
  }

  function drawIonDissolution(data) {
    const canvas = $('#ionDissolutionCanvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.lineCap='round'; ctx.lineJoin='round';

    const panels = [
      {
        x:105, y:55, w:560, h:555,
        xLabel:'Cl⁻ (meq/L)', yLabel:'Na⁺ + K⁺ (meq/L)',
        getX:r=>r.ionDiagnostic.cl, getY:r=>r.ionDiagnostic.nak,
        caption:'(a) Na⁺ + K⁺ — Cl⁻'
      },
      {
        x:840, y:55, w:560, h:555,
        xLabel:'HCO₃⁻ + SO₄²⁻ (meq/L)', yLabel:'Ca²⁺ + Mg²⁺ (meq/L)',
        getX:r=>r.ionDiagnostic.hco3so4, getY:r=>r.ionDiagnostic.caMg,
        caption:'(b) Ca²⁺ + Mg²⁺ — HCO₃⁻ + SO₄²⁻'
      }
    ];

    const drawText = (txt,x,y,opts={}) => {
      ctx.save(); ctx.translate(x,y); if(opts.rotate)ctx.rotate(opts.rotate);
      ctx.fillStyle=opts.color||'#172027';
      ctx.font=`${opts.weight||500} ${opts.size||17}px ${opts.serif?'Georgia,"Times New Roman",serif':'system-ui,-apple-system,"Microsoft YaHei",sans-serif'}`;
      ctx.textAlign=opts.align||'center'; ctx.textBaseline=opts.baseline||'middle'; ctx.fillText(txt,0,0); ctx.restore();
    };

    panels.forEach(panel => {
      const maxValue = data.length ? Math.max(...data.flatMap(r=>[panel.getX(r),panel.getY(r)]).filter(Number.isFinite), 0) : 0;
      const axisMax = niceAxisMax(maxValue);
      const sx = v => panel.x + (v/axisMax)*panel.w;
      const sy = v => panel.y + panel.h - (v/axisMax)*panel.h;

      // axes
      ctx.save(); ctx.strokeStyle='#101820'; ctx.lineWidth=2;
      ctx.strokeRect(panel.x,panel.y,panel.w,panel.h); ctx.restore();

      // ticks and labels
      for(let k=0;k<=5;k++){
        const v=axisMax*k/5;
        const xp=sx(v), yp=sy(v);
        ctx.save();ctx.strokeStyle='#101820';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(xp,panel.y+panel.h);ctx.lineTo(xp,panel.y+panel.h+8);ctx.stroke();
        ctx.beginPath();ctx.moveTo(panel.x-8,yp);ctx.lineTo(panel.x,yp);ctx.stroke();ctx.restore();
        const digits = axisMax < 2 ? 2 : axisMax < 10 ? 1 : 0;
        drawText(v.toFixed(digits),xp,panel.y+panel.h+28,{size:14});
        drawText(v.toFixed(digits),panel.x-15,yp,{size:14,align:'right'});
      }

      // 1:1 equiline
      ctx.save();ctx.strokeStyle='#5b6368';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx(0),sy(0));ctx.lineTo(sx(axisMax),sy(axisMax));ctx.stroke();ctx.restore();
      const lx=sx(axisMax*0.53), ly=sy(axisMax*0.53);
      drawText('1:1 等当量线',lx,ly-13,{size:15,rotate:-Math.atan2(panel.h,panel.w),color:'#4d565b'});

      data.forEach((r,i)=>{
        const x=panel.getX(r),y=panel.getY(r);
        if(Number.isFinite(x)&&Number.isFinite(y)) drawMarkerPixel(ctx,sx(x),sy(y),i,7);
      });

      drawText(panel.xLabel,panel.x+panel.w/2,panel.y+panel.h+62,{size:19,serif:true});
      drawText(panel.yLabel,panel.x-70,panel.y+panel.h/2,{size:19,serif:true,rotate:-Math.PI/2});
      drawText(panel.caption,panel.x+panel.w/2,26,{size:18,weight:700});
    });

    // Shared legend; samples keep the same marker in both panels.
    const maxLegend = 12;
    const items = data.slice(0,maxLegend);
    const cols = 6, cellW = 210, startX = 115, startY = 735;
    items.forEach((r,i)=>{
      const row=Math.floor(i/cols),col=i%cols,x=startX+col*cellW,y=startY+row*34;
      drawMarkerPixel(ctx,x,y,i,6);
      drawText(clean(r.id),x+14,y,{size:14,align:'left'});
    });
    if(data.length>maxLegend) drawText(`… 另有 ${data.length-maxLegend} 组水样`,startX,startY+70,{size:14,align:'left',color:'#5f6f77'});
  }

  function nakmgCoordinates(p) {
    const na = p.Na / 100;
    const mg = p.Mg / 100;
    return { x: mg + na / 2, y: TRI_H * na };
  }

  function nakmgEquilibriumPoint(tempC, coefficient = 457) {
    // Liu et al. (2022), following Giggenbach diagram construction:
    // log10(K^2/Mg) = 14 - 4410/T(K), set K = 1 mg/L.
    const T = tempC + 273.15;
    const K = 1;
    const lkm = 14 - 4410 / T;
    const Mg = (K * K) / Math.pow(10, lkm);
    // Full-equilibrium: Na = 457*K^0.37*Mg^0.315
    // Lower boundary:   Na = 100*K^0.37*Mg^0.315
    const Na = coefficient * Math.pow(K, 0.37) * Math.pow(Mg, 0.315);
    const S = Na / 1000 + K / 100 + Math.sqrt(Mg);
    const p = {
      Na: S ? (Na / 1000) / S * 100 : 0,
      K:  S ? (K / 100) / S * 100 : 0,
      Mg: S ? Math.sqrt(Mg) / S * 100 : 0
    };
    return { tempC, Na, K, Mg, p, coord: nakmgCoordinates(p) };
  }

  function nakmgCurve(coefficient, step = 2) {
    const pts = [];
    for (let t = NAKMG_TMIN; t <= NAKMG_TMAX + 1e-9; t += step) pts.push(nakmgEquilibriumPoint(t, coefficient));
    return pts;
  }

  const NAKMG_FULL_CURVE = nakmgCurve(457, 2);
  const NAKMG_LOWER_CURVE = nakmgCurve(100, 2);
  // Keep dashed isotherms dense (20 °C), but show temperature text every 40 °C.
  const NAKMG_ISOTHERMS = [];
  for (let t = NAKMG_TMIN; t <= NAKMG_TMAX; t += NAKMG_ISOTHERM_STEP) {
    NAKMG_ISOTHERMS.push({
      tempC: t,
      full: nakmgEquilibriumPoint(t, 457),
      lower: nakmgEquilibriumPoint(t, 100)
    });
  }
  const NAKMG_TEMP_LABELS = [];
  // Temperature text is shown every 40 °C from 0 °C, but the 360 °C label is intentionally omitted.
  for (let t = NAKMG_TMIN; t < NAKMG_TMAX; t += NAKMG_LABEL_STEP) {
    NAKMG_TEMP_LABELS.push({
      tempC: t,
      full: nakmgEquilibriumPoint(t, 457),
      lower: nakmgEquilibriumPoint(t, 100)
    });
  }

  function curveYAtX(curve, x) {
    const pts = curve.map(d => d.coord).slice().sort((a,b)=>a.x-b.x);
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[pts.length-1].x) return pts[pts.length-1].y;
    for (let i=1; i<pts.length; i++) {
      if (x <= pts[i].x) {
        const a=pts[i-1], b=pts[i];
        const f=(x-a.x)/((b.x-a.x)||1);
        return a.y+(b.y-a.y)*f;
      }
    }
    return pts[pts.length-1].y;
  }

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
      const c=piperCoordinates(r.p), color=markerColor(i), shape=markerShape(i);
      drawMarker(c.catX,c.catY,shape,color,9);
      drawMarker(c.anX,c.anY,shape,color,9);
      drawMarker(c.diaX,c.diaY,shape,color,10);
    });

    // Legend inside the canvas, as in conventional exported Piper figures.
    pixelText('样品 / Sample',38,62,{size:17,weight:800});
    const maxLegend=31, rowH=29;
    data.slice(0,maxLegend).forEach((r,i)=>{
      const color=markerColor(i),shape=markerShape(i);
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

    $('#piperLegend').innerHTML=data.map((r,i)=>`<span><i style="--legend-color:${markerColor(i)}"></i><b>${i+1}</b> ${safeText(r.id)} · ${safeText(r.type)}</span>`).join('');
  }

  function drawNaKMg(data) {
    const canvas = $('#nakmgCanvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const side = 820, plotLeft = 115, baseY = 860;
    const sx = x => plotLeft + x * side;
    const sy = y => baseY - y * side;
    const ink = '#111820', grid = '#c6cdd2', outline = '#111820';
    const K0 = [0, 0], NaA = [0.5, TRI_H], Mg1 = [1, 0];

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,W,H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const line = (pts, opts={}) => {
      ctx.save(); ctx.beginPath();
      ctx.strokeStyle = opts.color || ink;
      ctx.lineWidth = opts.width || 1.4;
      ctx.setLineDash(opts.dash || []);
      pts.forEach((p,i)=> i ? ctx.lineTo(sx(p[0]),sy(p[1])) : ctx.moveTo(sx(p[0]),sy(p[1])));
      ctx.stroke(); ctx.restore();
    };
    const text = (txt, x, y, opts={}) => {
      ctx.save();
      ctx.translate(sx(x), sy(y));
      if (opts.rotate) ctx.rotate(rad(opts.rotate));
      ctx.fillStyle = opts.color || ink;
      ctx.font = `${opts.weight||500} ${opts.size||18}px ${opts.serif?'Georgia,"Times New Roman",serif':'system-ui,-apple-system,"Microsoft YaHei",sans-serif'}`;
      ctx.textAlign = opts.align || 'center';
      ctx.textBaseline = opts.baseline || 'middle';
      ctx.fillText(txt,0,0); ctx.restore();
    };
    const pixelText = (txt,x,y,opts={}) => {
      ctx.save(); ctx.translate(x,y); if(opts.rotate)ctx.rotate(rad(opts.rotate));
      ctx.fillStyle=opts.color||ink;
      ctx.font=`${opts.weight||500} ${opts.size||16}px ${opts.serif?'Georgia,"Times New Roman",serif':'system-ui,-apple-system,"Microsoft YaHei",sans-serif'}`;
      ctx.textAlign=opts.align||'left'; ctx.textBaseline='middle';
      ctx.fillText(txt,0,0); ctx.restore();
    };
    const tick = (a,b,t,len=9) => {
      const p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      const dx=b[0]-a[0],dy=b[1]-a[1]; const L=Math.hypot(dx,dy)||1;
      const nx=-dy/L,ny=dx/L;
      line([[p[0]-nx*len/side/2,p[1]-ny*len/side/2],[p[0]+nx*len/side/2,p[1]+ny*len/side/2]],{color:outline,width:1.3});
    };
    const drawMarker = (x,y,shape,color,size=8) => {
      ctx.save();ctx.translate(sx(x),sy(y));ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();
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
    };

    // grid
    [0.2,0.4,0.6,0.8].forEach(f=>{
      line([[0.5*f,TRI_H*f],[1-0.5*f,TRI_H*f]],{color:grid,width:1});
      line([[f,0],[0.5+0.5*f,TRI_H*(1-f)]],{color:grid,width:1});
      line([[1-f,0],[0.5-0.5*f,TRI_H*(1-f)]],{color:grid,width:1});
    });

    // Exact equilibrium curves and outline.
    line([K0,NaA,Mg1,K0],{color:outline,width:2.8});
    const fullCurve = NAKMG_FULL_CURVE.map(d=>[d.coord.x,d.coord.y]);
    const lowerCurve = NAKMG_LOWER_CURVE.map(d=>[d.coord.x,d.coord.y]);
    line(fullCurve,{color:'#31cc3e',width:4});
    line(lowerCurve,{color:'#c51fe5',width:4});

    // Isotherms: connect equal-temperature points on the two equilibrium boundaries.
    NAKMG_ISOTHERMS.forEach(m=>{
      const a=[m.full.coord.x,m.full.coord.y], b=[m.lower.coord.x,m.lower.coord.y];
      line([a,b],{color:'#9aa6ad',width:1,dash:[7,7]});
    });

    // ticks and scale labels
    for(let i=0;i<=10;i++){
      const t=i/10;
      tick(K0,NaA,t,i%2===0?12:7); tick(NaA,Mg1,t,i%2===0?12:7); tick(K0,Mg1,t,i%2===0?12:7);
      if(i%2===0){
        if(i<10) text(String(i*10), (K0[0]+(NaA[0]-K0[0])*t)-0.055, (K0[1]+(NaA[1]-K0[1])*t), {size:16, rotate:-60});
        if(i>0) text(String(i*10), (NaA[0]+(Mg1[0]-NaA[0])*t)+0.055, (NaA[1]+(Mg1[1]-NaA[1])*t), {size:16, rotate:60});
        text(String(100-i*10), t, -0.08, {size:16});
      }
    }

    // axis labels
    text('Na/1000', 0.52, TRI_H + 0.07, {size:28, serif:true});
    text('K/100', -0.03, -0.03, {size:24, serif:true});
    text('√Mg', 1.08, -0.03, {size:24, serif:true});

    // Temperature labels on the full-equilibrium curve: display every 40 °C.
    // Labels are offset away from the equilibrium band and automatically separated
    // so adjacent temperature values do not overlap. Figure labels contain numbers only.
    const placedTempLabels = [];
    const boxesOverlap = (a,b,pad=5) => !(
      a.right + pad < b.left || a.left - pad > b.right ||
      a.bottom + pad < b.top || a.top - pad > b.bottom
    );
    ctx.save();
    ctx.font='600 15px "Times New Roman",Times,serif';
    NAKMG_TEMP_LABELS.forEach((m,i)=>{
      const prev = NAKMG_FULL_CURVE.find(d=>d.tempC >= Math.max(NAKMG_TMIN,m.tempC-4)) || m.full;
      const next = NAKMG_FULL_CURVE.find(d=>d.tempC >= Math.min(NAKMG_TMAX,m.tempC+4)) || m.full;
      const dx = sx(next.coord.x)-sx(prev.coord.x);
      const dy = sy(next.coord.y)-sy(prev.coord.y);
      const L = Math.hypot(dx,dy)||1;
      const tx = dx/L, ty = dy/L;

      // Use the vector from the lower equilibrium boundary toward the full-equilibrium
      // boundary as the preferred outward direction. This keeps text off the green curve.
      const bx = sx(m.full.coord.x)-sx(m.lower.coord.x);
      const by = sy(m.full.coord.y)-sy(m.lower.coord.y);
      const BL = Math.hypot(bx,by)||1;
      const nx = bx/BL, ny = by/BL;

      let angle = Math.atan2(dy,dx)*180/Math.PI + 180;
      // Keep all temperature text upright/readable while preserving curve orientation.
      while (angle > 180) angle -= 360;
      while (angle <= -180) angle += 360;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;

      const label = String(m.tempC);
      const textW = ctx.measureText(label).width;
      const textH = 18;
      const ar = Math.abs(Math.cos(rad(angle))), as = Math.abs(Math.sin(rad(angle)));
      const boxW = textW*ar + textH*as;
      const boxH = textW*as + textH*ar;

      let chosen = null;
      const normalOffsets = [22,30,38,46,54,64,76];
      const tangentOffsets = [0,14,-14,28,-28,42,-42];
      for (const no of normalOffsets) {
        for (const to of tangentOffsets) {
          const px = sx(m.full.coord.x) + nx*no + tx*to;
          const py = sy(m.full.coord.y) + ny*no + ty*to;
          const box = {left:px-boxW/2, right:px+boxW/2, top:py-boxH/2, bottom:py+boxH/2};
          const insideCanvas = box.left>8 && box.right<W-8 && box.top>8 && box.bottom<H-8;
          if (!insideCanvas) continue;
          if (placedTempLabels.every(b=>!boxesOverlap(box,b,6))) {
            chosen = {px,py,box};
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        const px = sx(m.full.coord.x) + nx*82;
        const py = sy(m.full.coord.y) + ny*82;
        chosen = {px,py,box:{left:px-boxW/2,right:px+boxW/2,top:py-boxH/2,bottom:py+boxH/2}};
      }
      placedTempLabels.push(chosen.box);
      ctx.save(); ctx.translate(chosen.px,chosen.py); ctx.rotate(rad(angle));
      ctx.fillStyle='#28343a';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(label,0,0); ctx.restore();
    });
    ctx.restore();

    // region labels
    text('完全平衡区', 0.50, TRI_H*0.73, {size:30, weight:700, color:'rgba(17,24,32,0.78)'});
    text('局部平衡区', 0.50, TRI_H*0.38, {size:30, weight:700, color:'rgba(17,24,32,0.78)'});
    text('非平衡区', 0.50, TRI_H*0.11, {size:30, weight:700, color:'rgba(17,24,32,0.78)'});

    // sample points
    data.forEach((r,i)=> drawMarker(r.nakmg.coord.x, r.nakmg.coord.y, markerShape(i), markerColor(i), 9));

    // legend at right
    pixelText('Na-K-Mg 图例', 1045, 82, {size:18, weight:800});
    ctx.save(); ctx.strokeStyle='#31cc3e'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(1050,120); ctx.lineTo(1150,120); ctx.stroke(); ctx.restore();
    pixelText('完全平衡线', 1185, 120, {size:18, serif:true});
    ctx.save(); ctx.strokeStyle='#c51fe5'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(1050,160); ctx.lineTo(1150,160); ctx.stroke(); ctx.restore();
    pixelText('局部平衡线', 1185, 160, {size:18, serif:true});
    ctx.save(); ctx.strokeStyle='#9aa6ad'; ctx.lineWidth=1; ctx.setLineDash([7,7]); ctx.beginPath(); ctx.moveTo(1050,202); ctx.lineTo(1150,202); ctx.stroke(); ctx.restore();
    pixelText('等温虚线：0–360℃，20℃间隔；图内温度数字：0–320，40℃间隔', 1185, 202, {size:15});
    pixelText('完全平衡区 → 推荐 Na-K 温标', 1050, 242, {size:15});
    pixelText('局部平衡区 → 推荐 K-Mg 温标', 1050, 269, {size:15});
    pixelText('非平衡区 → 不直接推荐温标', 1050, 296, {size:15});

    data.slice(0,18).forEach((r,i)=>{
      const y = 350 + i*30; const x = 1062;
      // draw pixel marker
      const shape = markerShape(i), color = markerColor(i), s = 6;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle=color; ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath();
      if(shape==='circle')ctx.arc(0,0,s,0,Math.PI*2);
      else if(shape==='square')ctx.rect(-s,-s,s*2,s*2);
      else if(shape==='triangle'){ctx.moveTo(0,-s);ctx.lineTo(s,s);ctx.lineTo(-s,s);ctx.closePath();}
      else if(shape==='down'){ctx.moveTo(0,s);ctx.lineTo(s,-s);ctx.lineTo(-s,-s);ctx.closePath();}
      else if(shape==='diamond'){ctx.moveTo(0,-s);ctx.lineTo(s,0);ctx.lineTo(0,s);ctx.lineTo(-s,0);ctx.closePath();}
      else if(shape==='left'){ctx.moveTo(-s,0);ctx.lineTo(s,-s);ctx.lineTo(s,s);ctx.closePath();}
      else if(shape==='right'){ctx.moveTo(s,0);ctx.lineTo(-s,-s);ctx.lineTo(-s,s);ctx.closePath();}
      else if(shape==='pentagon'){for(let j=0;j<5;j++){const a=-Math.PI/2+j*2*Math.PI/5,px=Math.cos(a)*s,py=Math.sin(a)*s;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
      else if(shape==='hexagon'){for(let j=0;j<6;j++){const a=j*2*Math.PI/6,px=Math.cos(a)*s,py=Math.sin(a)*s;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
      else if(shape==='star'){for(let j=0;j<10;j++){const a=-Math.PI/2+j*Math.PI/5,rr=j%2?s*.42:s*1.15,px=Math.cos(a)*rr,py=Math.sin(a)*rr;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
      else if(shape==='plus'){ctx.moveTo(-s,0);ctx.lineTo(s,0);ctx.moveTo(0,-s);ctx.lineTo(0,s);ctx.stroke(); ctx.restore(); pixelText(`${clean(r.id)}  ${r.nakmg.zone}  ${fmt(r.nakmg.reservoirTemp,1)}℃`, 1080, y, {size:14}); return;}
      else if(shape==='cross'){ctx.moveTo(-s,-s);ctx.lineTo(s,s);ctx.moveTo(s,-s);ctx.lineTo(-s,s);ctx.stroke(); ctx.restore(); pixelText(`${clean(r.id)}  ${r.nakmg.zone}  ${fmt(r.nakmg.reservoirTemp,1)}℃`, 1080, y, {size:14}); return;}
      ctx.fill(); ctx.restore();
      pixelText(`${clean(r.id)}  ${r.nakmg.zone}  ${fmt(r.nakmg.reservoirTemp,1)}℃`, 1080, y, {size:14});
    });
    if(data.length>18) pixelText(`… 另有 ${data.length-18} 组水样`, 1050, 350+18*30, {size:14, color:'#53646d'});
  }

  $('#addKurlovRow').addEventListener('click',()=>addKurlovRow());
  $('#calcKurlov').addEventListener('click',calculateKurlov);
  $('#clearKurlov').addEventListener('click',()=>{kRows.innerHTML='';addKurlovRow();$('#kurlovResults').innerHTML='';$('#nakmgResults').innerHTML='';$('#ionDissolutionResults').innerHTML='';$('#kurlovStatus').textContent='';drawPiper([]);drawIonDissolution([]);drawNaKMg([]);});
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
  $('#downloadIonDissolution')?.addEventListener('click',()=>{const a=document.createElement('a');a.download='Ion_equiline_diagnostics.png';a.href=$('#ionDissolutionCanvas').toDataURL('image/png');a.click();});
  $('#downloadNaKMg')?.addEventListener('click',()=>{const a=document.createElement('a');a.download='Na-K-Mg_diagram.png';a.href=$('#nakmgCanvas').toDataURL('image/png');a.click();});

  // ---------- Stable isotope recharge elevation ----------
  const isotopeRows = $('#isotopeRows');
  let isotopeComputed = [];
  const METEORIC_LINE_PRESETS = {
    china2014: {name:'中国 CHNIP 大气降水线（Liu et al., 2014）', a:7.48, b:1.01},
    china1983: {name:'中国常用全国大气降水线（7.9δ¹⁸O+8.2）', a:7.9, b:8.2},
    global: {name:'全球大气降水线 GMWL（Craig, 1961）', a:8, b:10}
  };

  function addIsotopeRow(data={}) {
    const tr=document.createElement('tr');
    const id=data.id ?? `ISO-${isotopeRows.children.length+1}`;
    tr.innerHTML=`<td>${editableCell(id,'id',{type:'text',label:'样品编号'})}</td>`+
      `<td>${editableCell(data.o18??'','o18',{label:'δ18O ‰'})}</td>`+
      `<td>${editableCell(data.d??'','d',{label:'δD ‰'})}</td>`+
      `<td>${editableCell(data.sampleElevation??'','sampleElevation',{label:'采样点高程 m'})}</td>`+
      `<td>${addDeleteButton()}</td>`;
    isotopeRows.appendChild(tr);
    bindDelete(tr,1,debounce(calculateIsotope,30));
  }

  function readIsotopeRows(){
    return [...isotopeRows.rows].map((r,idx)=>({
      id:clean($('[data-key="id"]',r)?.value)||`ISO-${idx+1}`,
      o18:maybeNum($('[data-key="o18"]',r)?.value),
      d:maybeNum($('[data-key="d"]',r)?.value),
      sampleElevation:maybeNum($('[data-key="sampleElevation"]',r)?.value)
    })).filter(r=>Number.isFinite(r.o18)&&Number.isFinite(r.d));
  }

  function currentMeteoricLine(){
    const mode=$('#meteoricLineMode')?.value||'china2014';
    if(mode==='custom'){
      return {mode,name:'当地/自定义大气降水线',a:maybeNum($('#meteoricSlope')?.value),b:maybeNum($('#meteoricIntercept')?.value)};
    }
    return {mode,...METEORIC_LINE_PRESETS[mode]};
  }

  function updateMeteoricControls(recalc=true){
    const mode=$('#meteoricLineMode')?.value||'china2014';
    const slope=$('#meteoricSlope'), intercept=$('#meteoricIntercept');
    if(mode==='custom'){
      slope.disabled=false; intercept.disabled=false;
    }else{
      const p=METEORIC_LINE_PRESETS[mode];
      slope.value=p.a; intercept.value=p.b; slope.disabled=true; intercept.disabled=true;
    }
    const line=currentMeteoricLine();
    $('#meteoricFormulaText').textContent=Number.isFinite(line.a)&&Number.isFinite(line.b)
      ? `当前：δD = ${line.a} × δ¹⁸O ${line.b>=0?'+':'−'} ${Math.abs(line.b)}`
      : '当前：请输入有效的斜率与截距。';
    if(recalc) calculateIsotope();
  }

  function updateElevationControls(recalc=true){
    const mode=$('#elevationModel')?.value||'china';
    $('#chinaElevationSettings')?.classList.toggle('hidden',mode!=='china');
    $('#globalElevationSettings')?.classList.toggle('hidden',mode!=='global');
    $('#customElevationSettings')?.classList.toggle('hidden',mode!=='custom');
    updateCustomElevationFormulaText();
    if(recalc) calculateIsotope();
  }

  function updateCustomElevationFormulaText(){
    const isotope=$('#customElevationIsotope')?.value||'d';
    const slope=maybeNum($('#customElevationSlope')?.value);
    const intercept=maybeNum($('#customElevationIntercept')?.value);
    const symbol=isotope==='d'?'δD':'δ¹⁸O';
    const target=$('#customElevationFormulaText');
    if(!target)return;
    if(Number.isFinite(slope)&&Number.isFinite(intercept)){
      target.textContent=`当地公式：${symbol} = ${slope} × ALT ${intercept>=0?'+':'−'} ${Math.abs(intercept)}；反算 ALT = (${symbol} ${intercept>=0?'−':'+'} ${Math.abs(intercept)}) / ${slope}。`;
    }else{
      target.textContent=`当地公式：${symbol} = a × ALT + b；反算 ALT = (${symbol} − b) / a。请录入研究区实测数据建立的局地回归系数。`;
    }
  }

  function estimateRechargeElevation(sample){
    const mode=$('#elevationModel')?.value||'china';
    if(mode==='china'){
      const lon=maybeNum($('#chinaLongitude')?.value), lat=maybeNum($('#chinaLatitude')?.value);
      const label='中国 CHNIP 全国空间回归';
      if(!Number.isFinite(lon)||!Number.isFinite(lat)) return {elevation:NaN,label,note:'需输入研究区经度和纬度后才能按全国 CHNIP 空间回归反算高程。'};
      const elevation=(8.892-0.041*lon-0.312*lat-sample.o18)/0.002;
      const outOfDomain=lon<80||lon>140||lat<20||lat>50;
      const note=(outOfDomain?'经纬度超出原 CHNIP 站点约 80–140°E、20–50°N 的覆盖范围，属于外推；':'')+
        '该全国回归受纬度、经度和区域气候共同影响，仅用于区域尺度初步估算，局地高程梯度通常更可靠。';
      return {elevation,label,note};
    }
    if(mode==='global'){
      const href=maybeNum($('#globalRefElevation')?.value), ref=maybeNum($('#globalRefO18')?.value), grad=maybeNum($('#globalGradient')?.value);
      const label='全球平均 δ¹⁸O 梯度 + 本地参考点';
      if(!Number.isFinite(href)||!Number.isFinite(ref)||!Number.isFinite(grad)||Math.abs(grad)<1e-12) return {elevation:NaN,label,note:'需输入参考点高程、参考点年加权降水 δ¹⁸O 和非零高程梯度。'};
      const elevation=href+(sample.o18-ref)/(grad/100);
      return {elevation,label,note:'全球 −0.28‰/100 m 为经验平均值；绝对高程由当地参考点锚定，特殊气候/高海拔区应改用实测局地梯度。'};
    }
    const isotope=$('#customElevationIsotope')?.value||'d';
    const a=maybeNum($('#customElevationSlope')?.value), b=maybeNum($('#customElevationIntercept')?.value);
    const label=`当地自定义 ${isotope==='d'?'δD':'δ¹⁸O'}–高程公式`;
    if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)<1e-12) return {elevation:NaN,label,note:'自定义公式需输入有效的斜率 a 与截距 b，且 a 不能为 0。公式形式为 δ = a·ALT + b。'};
    const delta=isotope==='d'?sample.d:sample.o18;
    return {elevation:(delta-b)/a,label,note:`按当地关系 ${isotope==='d'?'δD':'δ¹⁸O'} = ${fmt(a,6)}·ALT ${b>=0?'+':'−'} ${fmt(Math.abs(b),3)} 反算；应同时核对局地回归的 R²、样本高程范围及季节代表性。`};
  }

  function isotopeLinePosition(residual,tolerance){
    if(!Number.isFinite(residual)) return {key:'none',label:'无法判定'};
    if(Math.abs(residual)<=tolerance) return {key:'near',label:'降水线附近'};
    return residual<0?{key:'below',label:'降水线下方'}:{key:'above',label:'降水线上方'};
  }

  function isotopeSourceInterpretation(sample,pos,elev){
    const mode=$('#interpretationMode')?.value||'academic';
    const dh=Number.isFinite(elev.elevation)&&Number.isFinite(sample.sampleElevation)?elev.elevation-sample.sampleElevation:NaN;
    const heightAcademic=Number.isFinite(dh)
      ? (dh>0
          ? ` 估算补给高程高于采样点约 ${Math.round(dh)} m，支持来自较高地形单元的侧向径流或山地降水补给；但该结论受所选高程模型与端元代表性控制。`
          : dh<0
            ? ` 估算补给高程低于采样点约 ${Math.abs(Math.round(dh))} m，说明当前高程模型可能存在区域外推、蒸发/混合影响或端元不匹配，应优先检查局地回归。`
            : ' 估算补给高程与采样点高程接近，支持近区大气降水入渗补给。')
      : '';
    const heightConcise=Number.isFinite(dh)
      ? (dh>0 ? `；估算补给区约高于采样点 ${Math.round(dh)} m` : dh<0 ? `；估算高程低于采样点 ${Math.abs(Math.round(dh))} m，需检查模型` : '；补给高程与采样点接近')
      : '';

    if(mode==='concise'){
      if(pos.key==='near') return `主要为大气降水补给，蒸发影响不明显${heightConcise}。`;
      if(pos.key==='below') return `大气降水来源为主，但存在蒸发分馏或蒸发地表水混入${heightConcise}。`;
      if(pos.key==='above') return `仍以降水来源为主，可能受高 d-excess 水汽、冷季/高海拔降水或端元混合影响${heightConcise}。`;
      return '数据不足，无法判定补给源。';
    }

    if(pos.key==='near') return '样品位于所选大气降水线附近，δD 与 δ¹⁸O 基本保持大气降水的协同分馏关系，优先指示以大气降水直接或间接入渗补给为主，未见强烈蒸发型偏移。' + heightAcademic;
    if(pos.key==='below') return '样品位于所选大气降水线下方，通常指示补给水在降落、地表停留或入渗过程中发生蒸发分馏，或混入受蒸发影响的河流、湖泊、土壤水等端元；若为地热/深循环水，还应排查高温水–岩氧同位素交换。' + heightAcademic;
    if(pos.key==='above') return '样品位于所选大气降水线上方，常与较高 d-excess 的水汽源、冷季或高海拔降水、不同季节/水汽端元混合，或所选区域降水线与真实局地降水线不一致有关。该位置不能单独作为雪融水或特定水源的唯一证据。' + heightAcademic;
    return '缺少有效同位素数据，无法进行补给源判读。';
  }

  function computeIsotope(sample){
    const line=currentMeteoricLine();
    const tolerance=Math.max(0,num($('#meteoricTolerance')?.value,5));
    const expected=Number.isFinite(line.a)&&Number.isFinite(line.b)?line.a*sample.o18+line.b:NaN;
    const residual=sample.d-expected;
    const pos=isotopeLinePosition(residual,tolerance);
    const dExcess=sample.d-8*sample.o18;
    const elev=estimateRechargeElevation(sample);
    const relative=Number.isFinite(elev.elevation)&&Number.isFinite(sample.sampleElevation)?elev.elevation-sample.sampleElevation:NaN;
    return {...sample,line,expected,residual,pos,dExcess,elev,relative,source:isotopeSourceInterpretation(sample,pos,elev)};
  }

  function niceStep(span,target=8){
    if(!(span>0)) return 1;
    const raw=span/target, mag=10**Math.floor(Math.log10(raw)), n=raw/mag;
    const mult=n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10;
    return mult*mag;
  }

  function drawIsotope(data){
    const canvas=$('#isotopeCanvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
    const line=currentMeteoricLine();
    let xs=data.map(r=>r.o18).filter(Number.isFinite);
    if(!xs.length) xs=[-20,0];
    let xmin=Math.min(...xs), xmax=Math.max(...xs);
    let xspan=Math.max(4,xmax-xmin); xmin-=xspan*.14; xmax+=xspan*.14;
    let xstep=niceStep(xmax-xmin,8); xmin=Math.floor(xmin/xstep)*xstep; xmax=Math.ceil(xmax/xstep)*xstep;
    const lineYs=(Number.isFinite(line.a)&&Number.isFinite(line.b))?[line.a*xmin+line.b,line.a*xmax+line.b]:[];
    let ys=[...data.map(r=>r.d).filter(Number.isFinite),...lineYs];
    if(!ys.length) ys=[-140,20];
    let ymin=Math.min(...ys), ymax=Math.max(...ys), yspan=Math.max(20,ymax-ymin); ymin-=yspan*.12;ymax+=yspan*.12;
    let ystep=niceStep(ymax-ymin,8); ymin=Math.floor(ymin/ystep)*ystep; ymax=Math.ceil(ymax/ystep)*ystep;
    const m={l:120,r:55,t:55,b:105};
    const px=x=>m.l+(x-xmin)/(xmax-xmin)*(W-m.l-m.r);
    const py=y=>H-m.b-(y-ymin)/(ymax-ymin)*(H-m.t-m.b);
    ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.strokeRect(m.l,m.t,W-m.l-m.r,H-m.t-m.b);
    ctx.font='20px "Times New Roman","Noto Serif SC",serif';ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='top';
    for(let x=xmin,i=0;x<=xmax+xstep*.2&&i<50;x+=xstep,i++){
      const xx=px(x);ctx.beginPath();ctx.moveTo(xx,H-m.b);ctx.lineTo(xx,H-m.b+9);ctx.stroke();ctx.fillText(Number.isInteger(x)?String(x):x.toFixed(1),xx,H-m.b+13);
      if(i<49&&x+xstep/2<xmax){const mx=px(x+xstep/2);ctx.beginPath();ctx.moveTo(mx,H-m.b);ctx.lineTo(mx,H-m.b+5);ctx.stroke();}
    }
    ctx.textAlign='right';ctx.textBaseline='middle';
    for(let y=ymin,i=0;y<=ymax+ystep*.2&&i<50;y+=ystep,i++){
      const yy=py(y);ctx.beginPath();ctx.moveTo(m.l-9,yy);ctx.lineTo(m.l,yy);ctx.stroke();ctx.fillText(Number.isInteger(y)?String(y):y.toFixed(1),m.l-14,yy);
    }
    ctx.save();ctx.font='28px "Times New Roman","Noto Serif SC",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('△ δ¹⁸O (‰)',m.l+(W-m.l-m.r)/2,H-35);ctx.translate(36,m.t+(H-m.t-m.b)/2);ctx.rotate(-Math.PI/2);ctx.fillText('△ δD / δ²H (‰)',0,0);ctx.restore();
    if(Number.isFinite(line.a)&&Number.isFinite(line.b)){
      ctx.save();ctx.strokeStyle='#777';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px(xmin),py(line.a*xmin+line.b));ctx.lineTo(px(xmax),py(line.a*xmax+line.b));ctx.stroke();ctx.restore();
    }
    data.forEach((r,i)=>{
      const x=px(r.o18),y=py(r.d),color=markerColor(i);
      ctx.save();ctx.strokeStyle=color;ctx.fillStyle='#fff';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      ctx.save();ctx.font='21px "Times New Roman","Noto Serif SC",serif';ctx.fillStyle='#222';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillText(clean(r.id),x+8,y-5);ctx.restore();
    });
    const boxW=445,boxH=86,bx=W-m.r-boxW-14,by=H-m.b-boxH-12;
    ctx.save();ctx.fillStyle='rgba(255,255,255,.94)';ctx.strokeStyle='#777';ctx.lineWidth=1;ctx.fillRect(bx,by,boxW,boxH);ctx.strokeRect(bx,by,boxW,boxH);
    ctx.strokeStyle='#777';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx+22,by+29);ctx.lineTo(bx+90,by+29);ctx.stroke();
    ctx.fillStyle='#222';ctx.font='17px "Times New Roman","Noto Serif SC",serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(line.name||'参考降水线',bx+105,by+29);
    const formula=Number.isFinite(line.a)&&Number.isFinite(line.b)?`δD = ${line.a}δ¹⁸O ${line.b>=0?'+':'−'} ${Math.abs(line.b)}`:'公式无效';ctx.fillText(formula,bx+22,by+61);ctx.restore();
  }

  function calculateIsotope(){
    if(!isotopeRows) return;
    const rows=readIsotopeRows(),status=$('#isotopeStatus');
    if(!rows.length){
      isotopeComputed=[];$('#isotopeResults').innerHTML='';status.textContent='请输入至少一组有效的 δ¹⁸O 与 δD 数据。';drawIsotope([]);return;
    }
    isotopeComputed=rows.map(computeIsotope);
    $('#isotopeResults').innerHTML=isotopeComputed.map(r=>{
      const cls=r.pos.key==='near'?'isotope-position-near':r.pos.key==='below'?'isotope-position-below':r.pos.key==='above'?'isotope-position-above':'';
      return `<tr><td>${safeText(r.id)}</td><td>${fmt(r.o18,2)}</td><td>${fmt(r.d,2)}</td><td>${fmt(r.dExcess,2)}</td><td>${fmt(r.residual,2)}</td><td class="${cls}">${safeText(r.pos.label)}</td><td>${safeText(r.source)}</td><td>${fmt(r.elev.elevation,0)}</td><td>${fmt(r.relative,0)}</td><td>${safeText(r.elev.label)}</td><td>${safeText(r.elev.note)}</td></tr>`;
    }).join('');
    const missing=isotopeComputed.filter(r=>!Number.isFinite(r.elev.elevation)).length;
    status.textContent=`已计算 ${isotopeComputed.length} 组水样并更新同位素关系图${missing?`；其中 ${missing} 组尚缺高程模型所需参数，暂不输出补给高程`:''}。`;
    drawIsotope(isotopeComputed);
  }

  $('#addIsotopeRow')?.addEventListener('click',()=>addIsotopeRow());
  $('#calcIsotope')?.addEventListener('click',calculateIsotope);
  $('#clearIsotope')?.addEventListener('click',()=>{isotopeRows.innerHTML='';addIsotopeRow();$('#isotopeResults').innerHTML='';$('#isotopeStatus').textContent='';isotopeComputed=[];drawIsotope([]);});
  $('#isotopeExample')?.addEventListener('click',()=>{isotopeRows.innerHTML='';[
    {id:'DRJ1',o18:-11.34,d:-83.53},{id:'DRJ2',o18:-11.62,d:-85.27}
  ].forEach(addIsotopeRow);calculateIsotope();});
  $('#importIsotopePaste')?.addEventListener('click',()=>{
    const text=$('#isotopePaste')?.value.trim();if(!text)return;
    const parsed=[];text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
      const a=line.split(/\t|,|，|\s{2,}/).map(x=>x.trim());
      if(a.length<3)return;if(i===0&&!Number.isFinite(Number(a[1])))return;
      const o18=Number(a[1]),d=Number(a[2]),h=Number(a[3]);if(Number.isFinite(o18)&&Number.isFinite(d))parsed.push({id:a[0]||`ISO-${i+1}`,o18,d,sampleElevation:Number.isFinite(h)?h:''});
    });
    if(!parsed.length){$('#isotopeStatus').textContent='未识别到有效数据，请按“样品、δ18O、δD、采样点高程（可选）”排列。';return;}
    isotopeRows.innerHTML='';parsed.forEach(addIsotopeRow);calculateIsotope();
  });
  $('#downloadIsotopePlot')?.addEventListener('click',()=>{const a=document.createElement('a');a.download='deltaD_delta18O_recharge.png';a.href=$('#isotopeCanvas').toDataURL('image/png');a.click();});
  $('#exportIsotope')?.addEventListener('click',()=>downloadCSV('稳定同位素补给高程计算结果.csv',[[
    '样品','δ18O(‰)','δD(‰)','d-excess(‰)','相对降水线偏移Δ(‰)','图上位置','补给源判读','估算补给高程(m)','采样点高程(m)','相对采样点高差(m)','高程模型','说明'
  ],...isotopeComputed.map(r=>[r.id,r.o18,r.d,r.dExcess,r.residual,r.pos.label,r.source,r.elev.elevation,r.sampleElevation,r.relative,r.elev.label,r.elev.note])]));

  $('#meteoricLineMode')?.addEventListener('change',()=>updateMeteoricControls(true));
  $('#elevationModel')?.addEventListener('change',()=>updateElevationControls(true));
  ['meteoricSlope','meteoricIntercept','meteoricTolerance','chinaLongitude','chinaLatitude','globalRefElevation','globalRefO18','globalGradient','customElevationIsotope','customElevationSlope','customElevationIntercept','interpretationMode'].forEach(id=>{
    const el=$(`#${id}`);if(!el)return;el.addEventListener(el.tagName==='SELECT'?'change':'input',debounce(()=>{
      if(id==='meteoricSlope'||id==='meteoricIntercept')updateMeteoricControls(false);
      if(id==='customElevationIsotope'||id==='customElevationSlope'||id==='customElevationIntercept')updateCustomElevationFormulaText();
      calculateIsotope();
    },80));
  });

  $('#isotopeFile')?.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;getWorkbook(file,wb=>{
    const raw=rowsOf(wb.Sheets[wb.SheetNames[0]]);if(!raw.length){alert('工作表为空。');return;}
    const normalize=v=>String(v??'').toLowerCase().replace(/\s/g,'').replace(/[¹⁸]/g,m=>m==='¹'?'1':'8').replace(/[²]/g,'2').replace(/[δ∆]/g,'delta');
    let header=-1,idx={id:0,o18:1,d:2,h:3};
    for(let r=0;r<Math.min(raw.length,12);r++){
      const hs=raw[r].map(normalize);
      const oi=hs.findIndex(x=>x.includes('18o')||x.includes('o18'));
      const di=hs.findIndex(x=>x.includes('deltad')||x.includes('delta2h')||x.includes('2h')||x==='d');
      if(oi>=0&&di>=0){header=r;idx.o18=oi;idx.d=di;idx.id=hs.findIndex(x=>x.includes('样品')||x.includes('编号')||x==='id'||x.includes('sample'));if(idx.id<0)idx.id=0;idx.h=hs.findIndex(x=>x.includes('高程')||x.includes('海拔')||x.includes('elevation')||x.includes('alt'));break;}
    }
    const start=header>=0?header+1:0,parsed=[];
    raw.slice(start).forEach((row,i)=>{const o18=Number(row[idx.o18]),d=Number(row[idx.d]);if(!Number.isFinite(o18)||!Number.isFinite(d))return;const h=idx.h>=0?Number(row[idx.h]):NaN;parsed.push({id:clean(row[idx.id])||`ISO-${i+1}`,o18,d,sampleElevation:Number.isFinite(h)?h:''});});
    if(!parsed.length){alert('未识别到有效的 δ18O 与 δD 两列。建议表头使用“样品、δ18O、δD、采样点高程”。');return;}
    isotopeRows.innerHTML='';parsed.forEach(addIsotopeRow);calculateIsotope();
  });});

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

  $('#exportKurlov')?.addEventListener('click',()=>{
    const ionHeaders = kFields.flatMap(k => [`${ionDefs[k].label}(meq/L)`, `${ionDefs[k].label}占${ionDefs[k].group==='cat'?'总阳离子':'总阴离子'}(%)`]);
    downloadCSV('库尔洛夫计算结果.csv',[[
      '样品','矿化度','阳离子总量','阴离子总量','误差','水化学类型','库尔洛夫式',
      ...ionHeaders,
      'Cl(meq/L)','Na+K(meq/L)','(Na+K)/Cl','Na+K-Cl位置','Na+K-Cl解释','HCO3+SO4(meq/L)','Ca+Mg(meq/L)','(Ca+Mg)/(HCO3+SO4)','Ca+Mg-HCO3-SO4位置','Ca+Mg-HCO3-SO4解释',
      'Na/1000','K/100','√Mg','Na-K-Mg平衡区间','推荐计算公式','Na-K温标(℃)','K-Mg温标(℃)','理论热储温度(℃)','说明'
    ],...kurlovComputed.map(r=>[
      r.id,r.M,r.catTotal,r.anTotal,r.balance,r.type,r.formula,
      ...kFields.flatMap(k => [r.ionMeq[k], r.ionPercent[k]]),
      r.ionDiagnostic.cl,r.ionDiagnostic.nak,r.ionDiagnostic.nakCl.ratio,r.ionDiagnostic.nakCl.label,r.ionDiagnostic.nakCl.explanation,r.ionDiagnostic.hco3so4,r.ionDiagnostic.caMg,r.ionDiagnostic.caMgAn.ratio,r.ionDiagnostic.caMgAn.label,r.ionDiagnostic.caMgAn.explanation,r.nakmg.rawNa,r.nakmg.rawK,r.nakmg.rawMg,r.nakmg.zone,r.nakmg.recommendFormula,r.nakmg.tNaK,r.nakmg.tKMg,r.nakmg.reservoirTemp,r.nakmg.remark
    ])]);
  });
  $('#exportProfile')?.addEventListener('click',()=>downloadCSV('剖面校正计算结果.csv',[['导线号','ΔX','ΔY','平距','高差'],...profileRowsData()]));
  $('#exportThickness')?.addEventListener('click',()=>downloadCSV('地层厚度计算结果.csv',[['导线号','分层','真厚度','累计厚度'],...thicknessRowsData()]));

  const liveK=debounce(calculateKurlov),liveI=debounce(calculateIsotope),liveP=debounce(calculateProfile),liveT=debounce(calculateThickness);
  kRows.addEventListener('input',liveK);
  isotopeRows?.addEventListener('input',liveI);
  profileRows.addEventListener('input',liveP);
  thicknessRows.addEventListener('input',liveT);
  thicknessRows.addEventListener('change',liveT);

  // ---------- init ----------
  addKurlovRow();addKurlovRow();
  addIsotopeRow();addIsotopeRow();
  addProfileRow({id:0});addProfileRow({id:1});
  addThicknessRow();
  updateMeteoricControls(false);
  updateElevationControls(false);
  drawPiper([]);
  drawIonDissolution([]);
  drawNaKMg([]);
  drawIsotope([]);
  const initialTab = tabFromHash();
  if (initialTab) setTimeout(() => activateToolTab(initialTab, {scroll:true, smooth:false}), 0);
})();
