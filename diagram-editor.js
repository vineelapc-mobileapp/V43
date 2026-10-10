/* Diagram Editor (teacher tool) - NEW in v80
 * Draw circuit / single-line diagrams for questions and explanations.
 * Tools: select/move, free-hand pen, line, arrow, rectangle, circle, text, eraser.
 * Symbols: R, L, C, sources, ground, switches, diode, meters, G, M, transformer, CB, bus ...
 * Output: PNG, handed to the existing "Attach Figure" / "Attach to explanation" file inputs,
 * so all existing upload / save / publish logic is reused unchanged.
 * Self-contained: needs no changes inside upload.js. */
(function () {
  'use strict';
  if (window.openDiagramEditor) return;

  const FONT = "'Segoe UI', Arial, sans-serif";
  const COLORS = ['#111111', '#d32f2f', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#757575'];
  const WIDTHS = [1.5, 2.5, 4, 6];
  const P = d => `<path d="${d}"/>`;
  const meter = ch => `<circle r="16"/>${P('M-40 0H-16M16 0H40')}<text y="6" text-anchor="middle" font-size="18" font-family="${FONT}" fill="currentColor" stroke="none">${ch}</text>`;
  const DOT = x => `<circle cx="${x}" r="2.8" fill="currentColor"/>`;

  // Every symbol is drawn centred on (0,0); terminals at x = -40 and x = +40.
  const SYMS = {
    R:   { n: 'Resistor R',        s: P('M-40 0H-24L-20-10L-12 10L-4-10L4 10L12-10L20 10L24 0H40') },
    VR:  { n: 'Variable R',        s: P('M-40 0H-24L-20-10L-12 10L-4-10L4 10L12-10L20 10L24 0H40') + P('M-22 16L24-16M24-16l-10 2M24-16l-3 10') },
    L:   { n: 'Inductor L',        s: P('M-40 0H-28a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0H40') },
    LC:  { n: 'Iron-core L',       s: P('M-40 0H-28a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0H40M-28-11H20M-28-14H20') },
    C:   { n: 'Capacitor C',       s: P('M-40 0H-5M-5-16V16M5-16V16M5 0H40') },
    Z:   { n: 'Impedance Z',       s: `<rect x="-18" y="-10" width="36" height="20"/>${P('M-40 0H-18M18 0H40')}<text y="6" text-anchor="middle" font-size="16" font-family="${FONT}" fill="currentColor" stroke="none">Z</text>` },
    CELL:{ n: 'DC cell',           s: P('M-40 0H-8M-8-16V16M8-8V8M8 0H40') + `<text x="-22" y="-8" font-size="13" font-family="${FONT}" fill="currentColor" stroke="none">+</text>` },
    BAT: { n: 'Battery',           s: P('M-40 0H-14M-14-16V16M-4-8V8M6-16V16M16-8V8M16 0H40') + `<text x="-30" y="-8" font-size="13" font-family="${FONT}" fill="currentColor" stroke="none">+</text>` },
    DC:  { n: 'DC source',         s: `<circle r="16"/>${P('M-40 0H-16M16 0H40')}<text x="-11" y="-3" font-size="13" font-family="${FONT}" fill="currentColor" stroke="none">+</text><text x="3" y="12" font-size="14" font-family="${FONT}" fill="currentColor" stroke="none">−</text>` },
    AC:  { n: 'AC source',         s: `<circle r="16"/>${P('M-40 0H-16M16 0H40M-10 0q5-10 10 0t10 0')}` },
    GND: { n: 'Ground',            s: P('M0-20V0M-14 0H14M-9 6H9M-4 12H4') },
    SWO: { n: 'Switch (open)',     s: P('M-40 0H-20M20 0H40M-20 0L14-18') + DOT(-20) + DOT(20) },
    SWC: { n: 'Switch (closed)',   s: P('M-40 0H-20M20 0H40M-20 0H20') + DOT(-20) + DOT(20) },
    D:   { n: 'Diode',             s: `${P('M-40 0H-10M10 0H40M10-14V14')}<path d="M-10-14V14L10 0Z"/>` },
    LAMP:{ n: 'Lamp',              s: `<circle r="14"/>${P('M-40 0H-14M14 0H40M-10-10L10 10M-10 10L10-10')}` },
    V:   { n: 'Voltmeter',         s: meter('V') },
    A:   { n: 'Ammeter',           s: meter('A') },
    W:   { n: 'Wattmeter',         s: meter('W') },
    G:   { n: 'Generator',         s: meter('G') },
    M:   { n: 'Motor',             s: meter('M') },
    TR:  { n: 'Transformer',       s: `<circle cx="-9" r="14"/><circle cx="9" r="14"/>${P('M-40 0H-23M23 0H40')}` },
    CB:  { n: 'Circuit breaker',   s: `<rect x="-12" y="-12" width="24" height="24"/>${P('M-40 0H-12M12 0H40M-12-12L12 12M12-12L-12 12')}` },
    ISO: { n: 'Isolator',          s: P('M-40 0H-16M16 0H40M-16 0L12-14M16-8V8') },
    FUSE:{ n: 'Fuse',              s: `<rect x="-16" y="-6" width="32" height="12"/>${P('M-40 0H40')}` },
    CT:  { n: 'CT',                s: `${P('M-40 0H40')}<circle r="10"/>` },
    BUS: { n: 'Bus bar',           s: '<path d="M-40 0H40" stroke-width="6"/>' },
    LOAD:{ n: 'Load',              s: `${P('M0-22V6')}<path d="M-8 0L0 11L8 0Z" fill="currentColor"/>` },
    ARR: { n: 'Current arrow',     s: P('M-40 0H40M40 0l-10-6M40 0l-10 6') },
    DOT: { n: 'Junction',          s: '<circle r="4.5" fill="currentColor"/>' },
    TERM:{ n: 'Terminal',          s: '<circle r="4.5"/>' }
  };
  const QUICK = ['Ω', 'µ', 'θ', 'φ', 'ω', '°', '∠', '√', '±', '→', 'π', 'Δ', '_', '^'];

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = v => Math.round(v * 100) / 100;

  // "V_1", "I_{abc}", "I^2R" -> sub/superscript tspans
  function richText(s, size) {
    const out = []; let i = 0, buf = '';
    const flush = () => { if (buf) { out.push(`<tspan>${esc(buf)}</tspan>`); buf = ''; } };
    while (i < s.length) {
      const ch = s[i];
      if ((ch === '_' || ch === '^') && i + 1 < s.length) {
        let body, j;
        if (s[i + 1] === '{') { j = s.indexOf('}', i + 2); if (j < 0) j = s.length; body = s.slice(i + 2, j); i = j + 1; }
        else { body = s[i + 1]; i += 2; }
        flush();
        const up = ch === '^', dy = size * (up ? -0.38 : 0.28);
        out.push(`<tspan font-size="${num(size * 0.68)}" dy="${num(dy)}">${esc(body)}</tspan><tspan dy="${num(-dy)}" font-size="${size}"></tspan>`);
      } else { buf += ch; i++; }
    }
    flush();
    return out.join('');
  }

  function elSvg(e, forExport) {
    const hit = (inner) => forExport ? '' : inner;
    const base = `stroke="${e.c}" stroke-width="${e.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const gA = `data-id="${e.id}"`;
    switch (e.t) {
      case 'pen': {
        const p = e.pts; let d;
        if (p.length === 1) d = `M${p[0][0]} ${p[0][1]}l0.1 0`;
        else { d = `M${p[0][0]} ${p[0][1]}`; for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; d += `Q${p[i][0]} ${p[i][1]} ${num(mx)} ${num(my)}`; } d += `L${p[p.length - 1][0]} ${p[p.length - 1][1]}`; }
        return `<g ${gA}><path d="${d}" ${base}/>${hit(`<path d="${d}" stroke="transparent" stroke-width="16" fill="none" pointer-events="stroke"/>`)}</g>`;
      }
      case 'line': {
        let head = '';
        if (e.arrow) {
          const a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), L = 8 + e.w * 2;
          const p1 = [e.x2 - L * Math.cos(a - 0.45), e.y2 - L * Math.sin(a - 0.45)], p2 = [e.x2 - L * Math.cos(a + 0.45), e.y2 - L * Math.sin(a + 0.45)];
          head = `<path d="M${num(p1[0])} ${num(p1[1])}L${e.x2} ${e.y2}L${num(p2[0])} ${num(p2[1])}" ${base}/>`;
        }
        return `<g ${gA}><path d="M${e.x1} ${e.y1}L${e.x2} ${e.y2}" ${base}/>${head}${hit(`<path d="M${e.x1} ${e.y1}L${e.x2} ${e.y2}" stroke="transparent" stroke-width="18" fill="none" pointer-events="stroke"/>`)}</g>`;
      }
      case 'rect':
        return `<g ${gA}><rect x="${e.x}" y="${e.y}" width="${e.w2}" height="${e.h2}" ${base}/>${hit(`<rect x="${e.x}" y="${e.y}" width="${e.w2}" height="${e.h2}" stroke="transparent" stroke-width="18" fill="none" pointer-events="stroke"/>`)}</g>`;
      case 'circle':
        return `<g ${gA}><circle cx="${e.x}" cy="${e.y}" r="${e.r}" ${base}/>${hit(`<circle cx="${e.x}" cy="${e.y}" r="${e.r}" stroke="transparent" stroke-width="18" fill="none" pointer-events="stroke"/>`)}</g>`;
      case 'text': {
        const w = Math.max(20, e.s.length * e.size * 0.6);
        return `<g ${gA}><text x="${e.x}" y="${e.y}" font-size="${e.size}" font-family="${FONT}" fill="${e.c}">${richText(e.s, e.size)}</text>${hit(`<rect x="${e.x - 3}" y="${e.y - e.size}" width="${num(w + 6)}" height="${num(e.size * 1.35)}" fill="transparent"/>`)}</g>`;
      }
      case 'sym': {
        const sw = num(e.w / e.sc);
        return `<g ${gA} transform="translate(${e.x} ${e.y}) rotate(${e.rot}) scale(${e.sc})" style="color:${e.c}" stroke="${e.c}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round">${SYMS[e.k].s}${hit('<rect x="-42" y="-24" width="84" height="48" fill="transparent" stroke="none"/>')}</g>`;
      }
    }
    return '';
  }

  function bboxOf(e) {
    switch (e.t) {
      case 'pen': { const xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
      case 'line': return [Math.min(e.x1, e.x2), Math.min(e.y1, e.y2), Math.max(e.x1, e.x2), Math.max(e.y1, e.y2)];
      case 'rect': return [e.x, e.y, e.x + e.w2, e.y + e.h2];
      case 'circle': return [e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r];
      case 'text': return [e.x, e.y - e.size, e.x + Math.max(20, e.s.length * e.size * 0.6), e.y + e.size * 0.35];
      case 'sym': {
        const a = e.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), pts = [[-42, -24], [42, -24], [42, 24], [-42, 24]].map(([x, y]) => [e.x + e.sc * (x * c - y * s), e.y + e.sc * (x * s + y * c)]);
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      }
    }
  }

  function injectStyles() {
    if (document.getElementById('ddStyles')) return;
    const st = document.createElement('style'); st.id = 'ddStyles';
    st.textContent = `
#ddOverlay{position:fixed;inset:0;z-index:10000;background:#eef1f6;display:flex;flex-direction:column;font-family:${FONT};color:#1b2330;}
#ddOverlay *{box-sizing:border-box;}
.dd-top{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#e65100;color:#fff;flex-wrap:wrap;}
.dd-top .dd-title{font-weight:700;flex:1;min-width:120px;}
.dd-btn{border:1px solid #cfd6e4;background:#fff;color:#1b2330;border-radius:9px;padding:7px 11px;font-size:14px;cursor:pointer;white-space:nowrap;}
.dd-btn:disabled{opacity:.4;}
.dd-btn.on{background:#e65100;color:#fff;border-color:#e65100;}
.dd-top .dd-btn{background:rgba(255,255,255,.18);color:#fff;border-color:rgba(255,255,255,.4);}
.dd-top .dd-btn.save{background:#fff;color:#e65100;font-weight:700;}
.dd-row{display:flex;gap:6px;padding:6px 10px;overflow-x:auto;background:#fff;border-bottom:1px solid #dde3ee;align-items:center;flex-shrink:0;}
.dd-row .sep{width:1px;align-self:stretch;background:#dde3ee;margin:0 4px;flex-shrink:0;}
.dd-sw{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #b8c1d3;cursor:pointer;flex-shrink:0;}
.dd-sw.on{box-shadow:0 0 0 3px #e65100;}
.dd-wrap{flex:1;min-height:0;overflow:auto;padding:10px;display:flex;justify-content:center;align-items:flex-start;}
#ddSvg{background:#fff;border:1px solid #b8c1d3;border-radius:6px;touch-action:none;display:block;flex-shrink:0;user-select:none;-webkit-user-select:none;}
.dd-syms{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;padding:8px 10px;background:#fff;border-top:1px solid #dde3ee;max-height:24vh;overflow:auto;flex-shrink:0;}
.dd-sym{border:1px solid #cfd6e4;border-radius:9px;background:#fafbfe;padding:4px 2px;cursor:pointer;text-align:center;font-size:10.5px;line-height:1.2;}
.dd-sym.on{border-color:#e65100;background:#fff3e0;}
.dd-sym svg{width:64px;height:30px;display:block;margin:0 auto 2px;}
.dd-bar{display:flex;gap:6px;padding:6px 10px;background:#fff3e0;border-top:1px solid #ffcc80;flex-wrap:wrap;align-items:center;flex-shrink:0;}
.dd-bar input[type=text]{flex:1;min-width:140px;padding:8px;border:1px solid #cfd6e4;border-radius:8px;font-size:15px;}
.dd-hint{font-size:12px;color:#5a6577;padding:2px 10px 6px;background:#fff;flex-shrink:0;}
.hidden-dd{display:none !important;}
`;
    document.head.appendChild(st);
  }

  function symThumb(k) { return `<svg viewBox="-46 -26 92 52" fill="none" stroke="#1b2330" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="color:#1b2330">${SYMS[k].s}</svg>`; }

  async function toDataUrl(src) {
    if (src.startsWith('data:')) return src;
    const r = await fetch(src, { mode: 'cors' });
    const b = await r.blob();
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  }
  const imgSize = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = rej; i.src = url; });

  window.openDiagramEditor = async function (opts) {
    opts = opts || {};
    injectStyles();
    const sc = { W: 800, H: 500, els: [], bg: null };
    let nextId = 1, tool = 'select', symKey = null, color = COLORS[0], width = WIDTHS[1], snap = true, sel = null, drag = null;
    let hist = [], hidx = -1;

    if (opts.background) {
      try {
        const d = await toDataUrl(opts.background);
        const [nw, nh] = await imgSize(d);
        sc.bg = d; sc.H = Math.max(200, Math.round(800 * nh / nw));
      } catch (err) { alert('The existing image could not be loaded for drawing on top of it (it may be hosted elsewhere). Starting with a blank sheet instead.'); }
    }

    const ov = document.createElement('div'); ov.id = 'ddOverlay';
    ov.innerHTML = `
<div class="dd-top"><span class="dd-title">✏ Diagram Editor</span>
 <button class="dd-btn" id="ddUndo">↶ Undo</button><button class="dd-btn" id="ddRedo">↷ Redo</button>
 <button class="dd-btn" id="ddClear">Clear</button><button class="dd-btn" id="ddCancel">✕ Cancel</button><button class="dd-btn save" id="ddSave">✔ Use this diagram</button></div>
<div class="dd-row" id="ddTools"></div>
<div class="dd-row" id="ddStyle"></div>
<div class="dd-hint" id="ddHint"></div>
<div class="dd-wrap"><svg id="ddSvg" xmlns="http://www.w3.org/2000/svg"></svg></div>
<div class="dd-bar hidden-dd" id="ddSelBar"></div>
<div class="dd-bar hidden-dd" id="ddTextBar"><input type="text" id="ddTextIn" placeholder="Type text. Use V_1 for subscript, I^2 for superscript"><span id="ddQuick" style="display:flex;gap:4px;flex-wrap:wrap;"></span></div>
<div class="dd-syms" id="ddSyms"></div>`;
    document.body.appendChild(ov);
    const $ = id => ov.querySelector('#' + id);
    const svg = $('ddSvg');

    // ---------- toolbar ----------
    const TOOLS = [['select', '☝ Select / Move'], ['pen', '✎ Free-hand'], ['line', '／ Line'], ['arrow', '→ Arrow'], ['rect', '▭ Rectangle'], ['circle', '◯ Circle'], ['text', 'T Text'], ['erase', '⌫ Eraser']];
    const toolRow = $('ddTools');
    TOOLS.forEach(([k, label]) => { const b = document.createElement('button'); b.className = 'dd-btn'; b.dataset.tool = k; b.textContent = label; b.onclick = () => setTool(k); toolRow.appendChild(b); });
    const styleRow = $('ddStyle');
    COLORS.forEach(c => { const s = document.createElement('div'); s.className = 'dd-sw'; s.style.background = c; s.dataset.c = c; s.onclick = () => { color = c; if (sel) { const e = byId(sel); e.c = c; commit(); } draw(); paintStyle(); }; styleRow.appendChild(s); });
    const sep = document.createElement('div'); sep.className = 'sep'; styleRow.appendChild(sep);
    WIDTHS.forEach(w => { const b = document.createElement('button'); b.className = 'dd-btn'; b.dataset.w = w; b.innerHTML = `<span style="display:inline-block;width:26px;height:${w}px;background:#1b2330;vertical-align:middle;border-radius:2px"></span>`; b.onclick = () => { width = w; if (sel) { const e = byId(sel); if (e.w !== undefined) { e.w = w; commit(); } } draw(); paintStyle(); }; styleRow.appendChild(b); });
    const sep2 = document.createElement('div'); sep2.className = 'sep'; styleRow.appendChild(sep2);
    const snapBtn = document.createElement('button'); snapBtn.className = 'dd-btn'; snapBtn.onclick = () => { snap = !snap; paintStyle(); draw(); }; styleRow.appendChild(snapBtn);
    const bgBtn = document.createElement('button'); bgBtn.className = 'dd-btn'; bgBtn.textContent = 'Remove background image'; bgBtn.onclick = () => { sc.bg = null; sc.H = 500; bgBtn.classList.add('hidden-dd'); draw(); }; if (!sc.bg) bgBtn.classList.add('hidden-dd'); styleRow.appendChild(bgBtn);
    const tallBtn = document.createElement('button'); tallBtn.className = 'dd-btn'; tallBtn.onclick = () => { sc.H = sc.H >= 700 ? 500 : 800; draw(); paintStyle(); }; styleRow.appendChild(tallBtn);

    const symBox = $('ddSyms');
    Object.keys(SYMS).forEach(k => { const d = document.createElement('div'); d.className = 'dd-sym'; d.dataset.k = k; d.innerHTML = symThumb(k) + SYMS[k].n; d.onclick = () => { symKey = k; setTool('sym'); }; symBox.appendChild(d); });
    const qk = $('ddQuick'); QUICK.forEach(ch => { const b = document.createElement('button'); b.className = 'dd-btn'; b.style.padding = '6px 9px'; b.textContent = ch; b.onclick = () => { const i = $('ddTextIn'); const a = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, a) + ch + i.value.slice(i.selectionEnd ?? a); i.focus(); i.selectionStart = i.selectionEnd = a + ch.length; i.dispatchEvent(new Event('input')); }; qk.appendChild(b); });

    const hints = { select: 'Tap a shape to select it. Drag to move. Drag the round handles to resize.', pen: 'Draw free-hand with finger or mouse.', line: 'Drag from start to end. With snap ON, lines straighten automatically.', arrow: 'Drag from tail to head.', rect: 'Drag diagonally to draw a rectangle.', circle: 'Drag from the centre outwards.', text: 'Tap where the text should go, then type in the box below.', erase: 'Tap (or drag over) anything to delete it.', sym: 'Tap on the sheet to place the symbol. Then use Rotate / Bigger / Smaller.' };
    function setTool(k) { tool = k; if (k !== 'select') sel = null; paintStyle(); draw(); }

    function paintStyle() {
      toolRow.querySelectorAll('.dd-btn').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
      styleRow.querySelectorAll('.dd-sw').forEach(s => s.classList.toggle('on', s.dataset.c === color));
      styleRow.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === width));
      snapBtn.textContent = 'Snap to grid: ' + (snap ? 'ON' : 'OFF'); snapBtn.classList.toggle('on', snap);
      tallBtn.textContent = sc.H >= 700 ? 'Sheet: Tall' : 'Sheet: Wide';
      symBox.querySelectorAll('.dd-sym').forEach(d => d.classList.toggle('on', tool === 'sym' && d.dataset.k === symKey));
      $('ddHint').textContent = hints[tool] || '';
      $('ddUndo').disabled = hidx <= 0; $('ddRedo').disabled = hidx >= hist.length - 1;
    }

    // ---------- model helpers ----------
    const byId = id => sc.els.find(e => e.id === id);
    const snapV = v => snap ? Math.round(v / 10) * 10 : v;
    function pt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [num(q.x), num(q.y)]; }
    function commit() { hist = hist.slice(0, hidx + 1); hist.push(JSON.stringify(sc.els)); hidx = hist.length - 1; paintStyle(); }
    function restore() { sc.els = JSON.parse(hist[hidx]); if (sel && !byId(sel)) sel = null; draw(); paintStyle(); }
    $('ddUndo').onclick = () => { if (hidx > 0) { hidx--; restore(); } };
    $('ddRedo').onclick = () => { if (hidx < hist.length - 1) { hidx++; restore(); } };
    $('ddClear').onclick = () => { if (sc.els.length && confirm('Delete everything on this sheet?')) { sc.els = []; sel = null; commit(); draw(); } };
    $('ddCancel').onclick = () => { if (!sc.els.length || confirm('Close the editor without using this diagram?')) close(); };
    function close() { window.removeEventListener('resize', fit); document.removeEventListener('keydown', onKey); ov.remove(); }
    function add(e) { e.id = 'e' + (nextId++); sc.els.push(e); return e; }
    function moveEl(e, o, dx, dy) {
      switch (e.t) {
        case 'pen': e.pts = o.pts.map(p => [num(p[0] + dx), num(p[1] + dy)]); break;
        case 'line': e.x1 = o.x1 + dx; e.y1 = o.y1 + dy; e.x2 = o.x2 + dx; e.y2 = o.y2 + dy; break;
        default: e.x = o.x + dx; e.y = o.y + dy;
      }
    }

    // ---------- drawing ----------
    function fit() {
      const wrap = svg.parentElement, aw = wrap.clientWidth - 20, ah = wrap.clientHeight - 20, r = sc.W / sc.H;
      const w = Math.max(320, Math.min(aw, ah * r, 1100));
      svg.style.width = Math.round(w) + 'px'; svg.style.height = Math.round(w / r) + 'px';
    }
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(svg.parentElement);
    window.addEventListener('resize', fit);
    function draw() {
      svg.setAttribute('viewBox', `0 0 ${sc.W} ${sc.H}`); fit();
      let g = '';
      for (let x = 0; x <= sc.W; x += 20) g += `M${x} 0V${sc.H}`;
      for (let y = 0; y <= sc.H; y += 20) g += `M0 ${y}H${sc.W}`;
      let html = '';
      if (sc.bg) html += `<image href="${sc.bg}" x="0" y="0" width="${sc.W}" height="${sc.H}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>`;
      if (snap) html += `<path d="${g}" stroke="#e6ebf3" stroke-width="1" fill="none" pointer-events="none"/>`;
      html += sc.els.map(e => elSvg(e, false)).join('');
      if (drag && drag.preview) html += elSvg(drag.preview, true).replace('data-id="undefined"', 'pointer-events="none"');
      if (sel && byId(sel)) {
        const e = byId(sel), b = bboxOf(e), pad = 8;
        html += `<rect x="${b[0] - pad}" y="${b[1] - pad}" width="${b[2] - b[0] + 2 * pad}" height="${b[3] - b[1] + 2 * pad}" fill="none" stroke="#e65100" stroke-dasharray="6 4" stroke-width="1.5" pointer-events="none"/>`;
        const H = (h, x, y) => `<circle data-h="${h}" cx="${x}" cy="${y}" r="9" fill="#fff" stroke="#e65100" stroke-width="2.5"/>`;
        if (e.t === 'line') html += H('1', e.x1, e.y1) + H('2', e.x2, e.y2);
        if (e.t === 'rect') html += H('br', e.x + e.w2, e.y + e.h2);
        if (e.t === 'circle') html += H('r', e.x + e.r, e.y);
      }
      svg.innerHTML = html;
      renderBars();
    }
    function renderBars() {
      const bar = $('ddSelBar'), tb = $('ddTextBar');
      const e = sel && byId(sel);
      bar.classList.toggle('hidden-dd', !e); tb.classList.toggle('hidden-dd', !(e && e.t === 'text'));
      if (!e) return;
      if (bar.dataset.for !== sel + e.t) {
        bar.dataset.for = sel + e.t; bar.innerHTML = '';
        const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'dd-btn'; b.textContent = label; b.onclick = fn; bar.appendChild(b); };
        if (e.t === 'sym') { mk('⟳ Rotate 90°', () => { e.rot = (e.rot + 90) % 360; commit(); draw(); }); mk('Bigger', () => { e.sc = num(Math.min(4, e.sc * 1.25)); commit(); draw(); }); mk('Smaller', () => { e.sc = num(Math.max(0.4, e.sc / 1.25)); commit(); draw(); }); }
        if (e.t === 'text') { mk('A+', () => { e.size = Math.min(80, e.size + 2); commit(); draw(); }); mk('A−', () => { e.size = Math.max(8, e.size - 2); commit(); draw(); }); }
        mk('Duplicate', () => { const c = JSON.parse(JSON.stringify(e)); const n = add(c); moveEl(n, c, 0, 0); if (n.t === 'line') { n.x1 += 20; n.x2 += 20; n.y1 += 20; n.y2 += 20; } else if (n.t === 'pen') n.pts = n.pts.map(p => [p[0] + 20, p[1] + 20]); else { n.x += 20; n.y += 20; } sel = n.id; commit(); draw(); });
        mk('To front', () => { sc.els = sc.els.filter(x => x !== e).concat(e); commit(); draw(); });
        mk('🗑 Delete', () => delSel());
      }
      if (e.t === 'text') { const i = $('ddTextIn'); if (document.activeElement !== i) i.value = e.s; }
    }
    function delSel() { if (!sel) return; sc.els = sc.els.filter(x => x.id !== sel); sel = null; commit(); draw(); }
    $('ddTextIn').oninput = ev => { const e = sel && byId(sel); if (e && e.t === 'text') { e.s = ev.target.value; draw(); } };
    $('ddTextIn').onchange = () => commit();
    $('ddTextIn').onkeydown = ev => { if (ev.key === 'Enter') { ev.target.blur(); commit(); } ev.stopPropagation(); };

    // ---------- pointer interaction ----------
    svg.addEventListener('pointerdown', ev => {
      if (ev.button > 0) return;
      svg.setPointerCapture(ev.pointerId);
      const p = pt(ev), t = ev.target;
      if (tool === 'select') {
        const h = t.closest && t.closest('[data-h]');
        if (h && sel) { drag = { mode: 'handle', h: h.dataset.h, id: sel }; return; }
        const g = t.closest && t.closest('[data-id]');
        if (g) { sel = g.dataset.id; const e = byId(sel); drag = { mode: 'move', start: p, orig: JSON.parse(JSON.stringify(e)), moved: false }; if (e.c) color = e.c; if (e.w !== undefined && WIDTHS.includes(e.w)) width = e.w; paintStyle(); }
        else sel = null;
        draw(); return;
      }
      if (tool === 'erase') { drag = { mode: 'erase', n: 0 }; eraseAt(ev); return; }
      if (tool === 'pen') { drag = { mode: 'pen', preview: { t: 'pen', pts: [p], c: color, w: width } }; draw(); return; }
      if (tool === 'text') {
        const e = add({ t: 'text', x: snapV(p[0]), y: snapV(p[1]), s: 'Text', size: 22, c: color }); sel = e.id; tool = 'select'; commit(); paintStyle(); draw();
        const i = $('ddTextIn'); i.value = e.s; setTimeout(() => { i.focus(); i.select(); }, 30); return;
      }
      if (tool === 'sym') {
        const e = add({ t: 'sym', k: symKey, x: snapV(p[0]), y: snapV(p[1]), rot: 0, sc: 1, c: color, w: width }); sel = e.id; tool = 'select'; commit(); paintStyle(); draw(); return;
      }
      if (['line', 'arrow', 'rect', 'circle'].includes(tool)) { drag = { mode: 'shape', a: [snapV(p[0]), snapV(p[1])] }; drag.preview = mkShape(drag.a, drag.a); draw(); }
    });
    function mkShape(a, b) {
      if (tool === 'line' || tool === 'arrow') {
        let [x2, y2] = b;
        if (snap) { if (Math.abs(x2 - a[0]) < 12) x2 = a[0]; if (Math.abs(y2 - a[1]) < 12) y2 = a[1]; }
        return { t: 'line', x1: a[0], y1: a[1], x2, y2, c: color, w: width, arrow: tool === 'arrow' };
      }
      if (tool === 'rect') return { t: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w2: Math.abs(b[0] - a[0]), h2: Math.abs(b[1] - a[1]), c: color, w: width };
      return { t: 'circle', x: a[0], y: a[1], r: num(Math.hypot(b[0] - a[0], b[1] - a[1])), c: color, w: width };
    }
    function eraseAt(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY), g = el && el.closest && el.closest('#ddSvg [data-id]');
      if (g) { sc.els = sc.els.filter(x => x.id !== g.dataset.id); drag.n++; draw(); }
    }
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      const p = pt(ev);
      if (drag.mode === 'erase') return eraseAt(ev);
      if (drag.mode === 'pen') { const l = drag.preview.pts[drag.preview.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.5) { drag.preview.pts.push(p); draw(); } return; }
      if (drag.mode === 'shape') { drag.preview = mkShape(drag.a, [snapV(p[0]), snapV(p[1])]); draw(); return; }
      if (drag.mode === 'move') {
        const e = byId(sel); let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
        if (snap) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
        if (dx || dy) drag.moved = true; moveEl(e, drag.orig, dx, dy); draw(); return;
      }
      if (drag.mode === 'handle') {
        const e = byId(sel), x = snapV(p[0]), y = snapV(p[1]); drag.moved = true;
        if (e.t === 'line') { if (drag.h === '1') { e.x1 = x; e.y1 = y; } else { e.x2 = x; e.y2 = y; } }
        if (e.t === 'rect') { e.w2 = Math.max(10, x - e.x); e.h2 = Math.max(10, y - e.y); }
        if (e.t === 'circle') e.r = Math.max(5, num(Math.hypot(p[0] - e.x, p[1] - e.y)));
        draw();
      }
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.mode === 'erase') { if (d.n) commit(); draw(); return; }
      if (d.mode === 'pen') { add(d.preview); sel = null; commit(); }
      else if (d.mode === 'shape') {
        const e = d.preview; const big = e.t === 'line' ? Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > 4 : e.t === 'rect' ? (e.w2 > 4 || e.h2 > 4) : e.r > 3;
        if (big) { add(e); sel = null; commit(); paintStyle(); } // tool stays active so several lines/shapes can be drawn in a row
      } else if (d.moved) commit();
      draw();
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

    function onKey(ev) {
      if (ev.target && ev.target.tagName === 'INPUT') return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); $(ev.shiftKey ? 'ddRedo' : 'ddUndo').click(); }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { if (sel) { ev.preventDefault(); delSel(); } }
      else if (ev.key === 'Escape') { sel = null; setTool('select'); }
    }
    document.addEventListener('keydown', onKey);

    // ---------- export ----------
    $('ddSave').onclick = async () => {
      const btn = $('ddSave'); btn.disabled = true;
      try {
        if (!sc.els.length && !sc.bg) { alert('Draw something first.'); return; }
        const inner = sc.els.map(e => elSvg(e, true)).join('');
        let vb = [0, 0, sc.W, sc.H];
        if (!sc.bg) {
          const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          tmp.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:800px;height:800px;visibility:hidden');
          tmp.setAttribute('viewBox', `0 0 ${sc.W} ${sc.H}`); tmp.innerHTML = `<g>${inner}</g>`; document.body.appendChild(tmp);
          const bb = tmp.firstChild.getBBox(); tmp.remove();
          const pad = 24, w = Math.max(bb.width + 2 * pad, 160), h = Math.max(bb.height + 2 * pad, 100);
          vb = [bb.x - (w - bb.width) / 2, bb.y - (h - bb.height) / 2, w, h];
        }
        const scale = Math.min(3, 2400 / vb[2]), ow = Math.round(vb[2] * scale), oh = Math.round(vb[3] * scale);
        const str = `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}" viewBox="${vb.map(num).join(' ')}"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>${sc.bg ? `<image href="${sc.bg}" x="0" y="0" width="${sc.W}" height="${sc.H}" preserveAspectRatio="xMidYMid meet"/>` : ''}${inner}</svg>`;
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('render failed')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str); });
        const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
        cv.getContext('2d').drawImage(img, 0, 0, ow, oh);
        const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
        if (!blob) throw new Error('could not create PNG');
        if (opts.onSave) await opts.onSave(blob);
        close();
      } catch (err) { alert('Could not save the diagram: ' + err.message); btn.disabled = false; }
    };

    commit(); paintStyle(); draw();
  };

  // ---------- hook into the existing question editor (no upload.js edits needed) ----------
  function wire() {
    document.querySelectorAll('button').forEach(b => {
      if (b.dataset.ddDone) return;
      const t = b.textContent;
      const kind = /Attach Figure\/Diagram|Browse for a Figure/.test(t) ? 'q' : /Attach photo \/ PDF \/ text to explanation/.test(t) ? 'e' : null;
      if (!kind) return;
      b.dataset.ddDone = '1';
      const nb = document.createElement('button');
      nb.type = 'button'; nb.className = b.className; nb.dataset.ddDone = '1';
      nb.style.cssText = b.style.cssText + ';margin-left:8px;background:#fff3e0;border-color:#e65100;color:#e65100;font-weight:600;';
      nb.textContent = '✏ Draw Diagram';
      b.after(nb);
      nb.onclick = () => {
        const row = b.parentElement, input = row.querySelector('input[type=file]');
        const prev = row.lastElementChild && row.lastElementChild.querySelector && row.lastElementChild.querySelector('img');
        window.openDiagramEditor({
          background: prev ? prev.src : null,
          onSave: async blob => {
            const file = new File([blob], 'diagram_' + Date.now() + '.png', { type: 'image/png' });
            const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
            // the question-figure handler tries OCR when the question box is empty - a drawing has no
            // text to read, so the box is briefly marked non-empty while the figure is handed over.
            let ta = null, old = '';
            if (kind === 'q') { ta = row.parentElement.querySelector('textarea'); if (ta && !ta.value.trim()) { old = ta.value; ta.value = '​'; ta.dispatchEvent(new Event('input', { bubbles: true })); } else ta = null; }
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (ta) { ta.value = old; ta.dispatchEvent(new Event('input', { bubbles: true })); }
          }
        });
      };
    });
  }
  let raf = 0;
  const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; wire(); }); };
  new MutationObserver(sched).observe(document.documentElement, { childList: true, subtree: true });
  wire();
})();
