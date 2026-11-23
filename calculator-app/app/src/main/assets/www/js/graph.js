/* 그래프: 직교/극좌표/매개변수, 팬·핀치 줌, 추적, 근·극값·교점 분석, 값 표 */
'use strict';
(function () {
  const E = window.Engine, A = window.App;
  const { $, esc } = A;
  const COLORS = ['--c1', '--c2', '--c3', '--c4'];
  const st = {
    fns: A.Store.get('graph.fns', [
      { s: 'sin(x)', on: true }, { s: 'x^2/4-2', on: true }, { s: '', on: true }, { s: '', on: true },
    ]),
    view: null, markers: [], trace: null, tmin: '0', tmax: '2π',
  };
  let cv, ctx, W = 0, H = 0, dpr = 1, el;
  const save = () => A.Store.set('graph.fns', st.fns);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function withRad(fn) { const s = E.state.angle; E.state.angle = 'RAD'; try { return fn(); } finally { E.state.angle = s; } }

  // 함수 정의 해석
  function parseDef(src) {
    let s = (src || '').trim();
    if (!s) return null;
    const polar = /^r\s*=/.exec(s);
    if (polar) { const f = E.makeFn(s.slice(polar[0].length).replace(/\bt\b/g, 'θ'), 'θ'); E.compile(s.slice(polar[0].length).replace(/\bt\b/g, 'θ')); return { type: 'polar', f }; }
    s = s.replace(/^(y|f\(x\))\s*=/, '');
    // 매개변수: (x(t), y(t))
    if (/^\(.*\)$/.test(s)) {
      let depth = 0, cut = -1;
      for (let i = 1; i < s.length - 1; i++) { const ch = s[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === ',' && depth === 0) { cut = i; break; } }
      if (cut > 0) {
        const xs = s.slice(1, cut), ys = s.slice(cut + 1, -1);
        E.compile(xs); E.compile(ys);
        return { type: 'param', fx: E.makeFn(xs, 't'), fy: E.makeFn(ys, 't') };
      }
    }
    E.compile(s);
    return { type: 'cart', f: E.makeFn(s, 'x') };
  }
  function defs() {
    return st.fns.map((fn, i) => {
      if (!fn.on || !fn.s.trim()) return null;
      try { return Object.assign(parseDef(fn.s), { i }); } catch (e) { return { i, error: e.message }; }
    }).filter(Boolean);
  }

  function resetView() {
    const aspect = H && W ? H / W : 0.8;
    st.view = { xmin: -10, xmax: 10, ymin: -10 * aspect, ymax: 10 * aspect };
  }
  const X = (x) => (x - st.view.xmin) / (st.view.xmax - st.view.xmin) * W;
  const Y = (y) => H - (y - st.view.ymin) / (st.view.ymax - st.view.ymin) * H;
  const invX = (px) => st.view.xmin + px / W * (st.view.xmax - st.view.xmin);
  const invY = (py) => st.view.ymin + (H - py) / H * (st.view.ymax - st.view.ymin);
  function niceStep(range, px) {
    const raw = range / Math.max(1, px / 64);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const label = (v) => { const r = Math.abs(v) < 1e-12 ? 0 : v; return E.pretty(E.fmtReal(Number(r.toPrecision(6)), { mode: 'NORM' })); };

  function resize() {
    const box = cv.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    const nw = Math.round(box.width), nh = Math.round(box.height);
    if (!nw || !nh) return;
    const first = !W;
    W = nw; H = nh;
    cv.width = W * dpr; cv.height = H * dpr;
    if (first || !st.view) resetView();
    else { // 가로 범위 유지, 세로 비율 조정
      const cx = (st.view.ymin + st.view.ymax) / 2, half = (st.view.xmax - st.view.xmin) * H / W / 2;
      st.view.ymin = cx - half; st.view.ymax = cx + half;
    }
    draw();
  }

  function draw() {
    if (!ctx || !W) return;
    withRad(drawInner);
  }
  function drawInner() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const v = st.view;
    const gx = niceStep(v.xmax - v.xmin, W), gy = niceStep(v.ymax - v.ymin, H);
    const grid = css('--line'), grid2 = css('--line-2'), axis = css('--text-4'), txt = css('--text-3');
    // 보조 격자
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid; ctx.beginPath();
    for (let x = Math.ceil(v.xmin / (gx / 5)) * (gx / 5); x <= v.xmax; x += gx / 5) { const p = Math.round(X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H); }
    for (let y = Math.ceil(v.ymin / (gy / 5)) * (gy / 5); y <= v.ymax; y += gy / 5) { const p = Math.round(Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); }
    ctx.stroke();
    ctx.strokeStyle = grid2; ctx.beginPath();
    for (let x = Math.ceil(v.xmin / gx) * gx; x <= v.xmax; x += gx) { const p = Math.round(X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, H); }
    for (let y = Math.ceil(v.ymin / gy) * gy; y <= v.ymax; y += gy) { const p = Math.round(Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(W, p); }
    ctx.stroke();
    // 축
    const ax = Math.min(Math.max(Y(0), 0), H), ay = Math.min(Math.max(X(0), 0), W);
    ctx.strokeStyle = axis; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(0, Math.round(ax) + 0.5); ctx.lineTo(W, Math.round(ax) + 0.5);
    ctx.moveTo(Math.round(ay) + 0.5, 0); ctx.lineTo(Math.round(ay) + 0.5, H); ctx.stroke();
    // 눈금 라벨
    ctx.fillStyle = txt; ctx.font = '10.5px Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ly = Math.min(Math.max(ax + 4, 4), H - 16);
    for (let x = Math.ceil(v.xmin / gx) * gx; x <= v.xmax; x += gx) { if (Math.abs(x) < gx / 2) continue; ctx.fillText(label(x), X(x), ly); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const lx = Math.min(Math.max(ay - 5, 30), W - 4);
    for (let y = Math.ceil(v.ymin / gy) * gy; y <= v.ymax; y += gy) { if (Math.abs(y) < gy / 2) continue; ctx.fillText(label(y), lx, Y(y)); }
    // 곡선
    const ds = defs();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const d of ds) {
      if (d.error) continue;
      ctx.strokeStyle = css(COLORS[d.i]); ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (d.type === 'cart') plotCart(d.f);
      else plotParam(d);
      ctx.stroke();
    }
    // 마커
    for (const m of st.markers) {
      const px = X(m.x), py = Y(m.y);
      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      ctx.fillStyle = css('--bg'); ctx.strokeStyle = css('--text'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (st.trace) {
      const { x, y, i } = st.trace; const px = X(x), py = Y(y);
      ctx.strokeStyle = css('--text-4'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = css(COLORS[i]); ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  const clampY = (py) => Math.max(-5000, Math.min(H + 5000, py));
  function plotCart(f) {
    const n = Math.ceil(W * 1.5);
    let pen = false, px0, py0, y0;
    for (let k = 0; k <= n; k++) {
      const x = st.view.xmin + (st.view.xmax - st.view.xmin) * k / n;
      const y = f(x);
      if (!isFinite(y)) { pen = false; continue; }
      const px = X(x), py = Y(y);
      if (pen) {
        if (Math.abs(py - py0) > H * 0.5) { // 불연속(점근선) 감지
          const xm = x - (st.view.xmax - st.view.xmin) / n / 2, ym = f(xm);
          const between = isFinite(ym) && ym >= Math.min(y, y0) - 1e-9 && ym <= Math.max(y, y0) + 1e-9;
          if (!between) { pen = false; }
        }
      }
      if (pen) ctx.lineTo(px, clampY(py)); else ctx.moveTo(px, clampY(py));
      pen = true; px0 = px; py0 = py; y0 = y;
    }
    void px0;
  }
  function tRange() {
    let a = 0, b = 2 * Math.PI;
    try { a = E.evalReal(st.tmin); b = E.evalReal(st.tmax); } catch (e) { /* 기본값 */ }
    return [a, b];
  }
  function plotParam(d) {
    const [a, b] = tRange(); const n = 1500;
    let pen = false, py0 = 0;
    for (let k = 0; k <= n; k++) {
      const t = a + (b - a) * k / n;
      let x, y;
      if (d.type === 'polar') { const r = d.f(t); x = r * Math.cos(t); y = r * Math.sin(t); }
      else { x = d.fx(t); y = d.fy(t); }
      if (!isFinite(x) || !isFinite(y)) { pen = false; continue; }
      const px = X(x), py = Y(y);
      if (pen && Math.abs(py - py0) > H * 2) pen = false;
      if (pen) ctx.lineTo(px, clampY(py)); else ctx.moveTo(px, clampY(py));
      pen = true; py0 = py;
    }
  }

  // 확대/축소
  function zoom(f, cx, cy) {
    const v = st.view;
    if (cx === undefined) { cx = (v.xmin + v.xmax) / 2; cy = (v.ymin + v.ymax) / 2; }
    const nx = (v.xmax - v.xmin) * f;
    if (nx < 1e-9 || nx > 1e9) return;
    v.xmin = cx - (cx - v.xmin) * f; v.xmax = cx + (v.xmax - cx) * f;
    v.ymin = cy - (cy - v.ymin) * f; v.ymax = cy + (v.ymax - cy) * f;
    draw();
  }
  function autoY() {
    withRad(() => {
      const ds = defs().filter((d) => d.type === 'cart');
      if (!ds.length) return;
      const ys = [];
      for (const d of ds) for (let k = 0; k <= 400; k++) { const y = d.f(st.view.xmin + (st.view.xmax - st.view.xmin) * k / 400); if (isFinite(y)) ys.push(y); }
      if (!ys.length) return;
      ys.sort((a, b) => a - b);
      let lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1];
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.12; st.view.ymin = lo - pad; st.view.ymax = hi + pad;
    });
    draw();
  }

  function setTrace(px, py) {
    withRad(() => {
      const x = invX(px), yTap = invY(py);
      let best = null;
      for (const d of defs()) {
        if (d.error || d.type !== 'cart') continue;
        const y = d.f(x); if (!isFinite(y)) continue;
        const dist = Math.abs(Y(y) - py);
        if (!best || dist < best.dist) best = { x, y, i: d.i, dist };
      }
      if (best && best.dist < 80) {
        st.trace = best;
        $('#gread').innerHTML = `<b style="color:var(${COLORS[best.i]})">y${best.i + 1}</b>  x = ${esc(label(best.x))}   y = ${esc(label(best.y))}`;
      } else {
        st.trace = null;
        $('#gread').textContent = `(${label(x)}, ${label(yTap)})`;
      }
    });
    draw();
  }

  function bindGestures() {
    const pts = new Map();
    let start = null, pinch = null, moved = false, t0 = 0;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pts.size === 1) { start = { x: e.offsetX, y: e.offsetY, v: { ...st.view } }; moved = false; t0 = Date.now(); }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: invX((a.x + b.x) / 2), cy: invY((a.y + b.y) / 2), v: { ...st.view } };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 10) return;
        const f = pinch.d / d; const v0 = pinch.v;
        st.view = { xmin: pinch.cx - (pinch.cx - v0.xmin) * f, xmax: pinch.cx + (v0.xmax - pinch.cx) * f, ymin: pinch.cy - (pinch.cy - v0.ymin) * f, ymax: pinch.cy + (v0.ymax - pinch.cy) * f };
        moved = true; draw(); return;
      }
      if (pts.size === 1 && start && !pinch) {
        const dx = e.offsetX - start.x, dy = e.offsetY - start.y;
        if (Math.hypot(dx, dy) > 6) moved = true;
        if (!moved) return;
        const sx = (start.v.xmax - start.v.xmin) / W, sy = (start.v.ymax - start.v.ymin) / H;
        st.view = { xmin: start.v.xmin - dx * sx, xmax: start.v.xmax - dx * sx, ymin: start.v.ymin + dy * sy, ymax: start.v.ymax + dy * sy };
        draw();
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (!moved && Date.now() - t0 < 400) setTrace(e.offsetX, e.offsetY);
        start = null;
      } else if (pts.size === 1) { const p = [...pts.values()][0]; start = { x: p.x, y: p.y, v: { ...st.view } }; }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, invX(e.offsetX), invY(e.offsetY)); }, { passive: false });
  }

  // 분석
  function analyze(kind) {
    const out = $('#gout');
    st.markers = [];
    const ds = defs().filter((d) => !d.error && d.type === 'cart');
    if (!ds.length) { out.innerHTML = '<span class="err">분석할 y=f(x) 함수가 없습니다</span>'; draw(); return; }
    const a = st.view.xmin, b = st.view.xmax;
    let html = '';
    withRad(() => {
      const name = (d) => `<b style="color:var(${COLORS[d.i]})">y${d.i + 1}</b>`;
      if (kind === 'roots') {
        for (const d of ds) {
          const r = E.findRoots(d.f, a, b, 3000);
          r.forEach((x) => st.markers.push({ x, y: 0 }));
          html += `<div>${name(d)} 근: ${r.length ? r.map((x) => esc(label(x))).join(', ') : '<span class="muted">화면 범위에 없음</span>'}</div>`;
        }
      } else if (kind === 'ext') {
        for (const d of ds) {
          const r = E.findExtrema(d.f, a, b);
          r.forEach((p) => st.markers.push(p));
          html += `<div>${name(d)} ${r.length ? r.map((p) => `${p.type === 'max' ? '극대' : '극소'} (${esc(label(p.x))}, ${esc(label(p.y))})`).join('<br>') : '<span class="muted">극값 없음</span>'}</div>`;
        }
      } else if (kind === 'int') {
        if (ds.length < 2) html = '<span class="muted">교점을 구하려면 함수가 2개 이상 필요합니다</span>';
        for (let p = 0; p < ds.length; p++) for (let q = p + 1; q < ds.length; q++) {
          const f = ds[p].f, g = ds[q].f;
          const r = E.findRoots((x) => f(x) - g(x), a, b, 3000);
          r.forEach((x) => st.markers.push({ x, y: f(x) }));
          html += `<div>${name(ds[p])} ∩ ${name(ds[q])}: ${r.length ? r.map((x) => `(${esc(label(x))}, ${esc(label(f(x)))})`).join(', ') : '<span class="muted">없음</span>'}</div>`;
        }
      } else if (kind === 'yint') {
        for (const d of ds) { const y = d.f(0); if (isFinite(y)) st.markers.push({ x: 0, y }); html += `<div>${name(d)} y절편: ${isFinite(y) ? esc(label(y)) : '없음'}</div>`; }
      } else if (kind === 'area') {
        const d = ds[0];
        const lo = Math.max(a, st.areaA ?? a), hi = Math.min(b, st.areaB ?? b);
        const r = E.integrate(d.f, lo, hi);
        html = `<div>${name(d)} ∫ 화면 범위 [${esc(label(lo))}, ${esc(label(hi))}] = <b>${esc(label(r.value))}</b></div>`;
      }
    });
    out.innerHTML = html; draw();
  }

  function table() {
    const out = $('#gout');
    const ds = defs().filter((d) => !d.error && d.type === 'cart');
    if (!ds.length) { out.innerHTML = '<span class="err">표를 만들 y=f(x) 함수가 없습니다</span>'; return; }
    let x0, h;
    try { x0 = E.evalReal($('#gtx0').value || '0'); h = E.evalReal($('#gth').value || '1'); } catch (e) { out.innerHTML = `<span class="err">${esc(e.message)}</span>`; return; }
    let rows = '';
    withRad(() => {
      for (let k = 0; k < 25; k++) {
        const x = E.cleanNum(x0 + k * h);
        rows += `<tr><td>${esc(label(x))}</td>${ds.map((d) => { const y = d.f(x); return `<td>${isFinite(y) ? esc(label(y)) : '—'}</td>`; }).join('')}</tr>`;
      }
    });
    out.innerHTML = `<table class="tbl"><tr><th>x</th>${ds.map((d) => `<th style="color:var(${COLORS[d.i]})">y${d.i + 1}</th>`).join('')}</tr>${rows}</table>`;
  }

  function fnRows() {
    return st.fns.map((f, i) => `
      <div class="fn-row" style="color:var(${COLORS[i]})">
        <button class="dot ${f.on ? 'on' : ''}" data-tog="${i}"><span>${i + 1}</span></button>
        <input class="inp fx" data-fn="${i}" value="${esc(f.s)}" placeholder="${['예: sin(x)', '예: x^2-3', '예: r=2cos(3θ)', '예: (cos(t), sin(2t))'][i]}" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>`).join('');
  }

  A.register({
    id: 'graph', name: '그래프', glyph: '∿',
    init(root) {
      el = root;
      root.innerHTML = `
        <div class="graph-box"><canvas id="gcanvas"></canvas>
          <div class="g-tools"><button data-z="in">＋</button><button data-z="out">−</button><button data-z="fit" title="y 자동">↕</button><button data-z="home">⌂</button></div>
          <div class="g-read" id="gread"></div>
        </div>
        <div class="scroll" style="padding-top:10px">
          <div class="card"><h2>함수<span class="sp"></span><span class="tag">라디안 기준</span></h2>
            <div id="gfns">${fnRows()}</div>
            <div class="grid2"><div class="field"><label>t·θ 최소 (극/매개)</label><input class="inp fx" id="gtmin" value="${esc(st.tmin)}"></div><div class="field"><label>t·θ 최대</label><input class="inp fx" id="gtmax" value="${esc(st.tmax)}"></div></div>
            <p class="note" style="margin-top:0">y=f(x) 직교좌표 · <b>r=</b>f(θ) 극좌표 · <b>(</b>x(t), y(t)<b>)</b> 매개변수. 그래프를 탭하면 좌표를 추적하고, 끌어서 이동 · 두 손가락으로 확대합니다.</p>
          </div>
          <div class="card"><h2>분석 (화면 범위)</h2>
            <div class="btns"><button class="btn" data-an="roots">근 (x절편)</button><button class="btn" data-an="ext">극값</button><button class="btn" data-an="int">교점</button><button class="btn" data-an="yint">y절편</button></div>
            <div class="btns" style="margin-top:6px;grid-template-columns:1fr 1fr"><button class="btn" data-an="area">y1 정적분</button><button class="btn" data-an="clear">표시 지우기</button></div>
            <div class="grid3" style="margin-top:10px;align-items:end"><div class="field"><label>표 시작 x</label><input class="inp fx" id="gtx0" value="0"></div><div class="field"><label>간격</label><input class="inp fx" id="gth" value="1"></div><div class="field"><button class="btn block" id="gtbl">값 표</button></div></div>
            <div class="out" id="gout"></div>
          </div>
        </div>`;
      cv = $('#gcanvas'); ctx = cv.getContext('2d');
      bindGestures();
      root.querySelector('.g-tools').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; A.haptic();
        const z = b.dataset.z;
        if (z === 'in') zoom(1 / 1.6); else if (z === 'out') zoom(1.6); else if (z === 'fit') autoY(); else { resetView(); st.trace = null; $('#gread').textContent = ''; draw(); }
      });
      let tmr;
      root.addEventListener('input', (e) => {
        const i = e.target.dataset.fn;
        if (i !== undefined) { st.fns[+i].s = e.target.value; save(); }
        if (e.target.id === 'gtmin') st.tmin = e.target.value;
        if (e.target.id === 'gtmax') st.tmax = e.target.value;
        clearTimeout(tmr); tmr = setTimeout(() => {
          st.markers = []; st.trace = null;
          const errs = defs().filter((d) => d.error).map((d) => `y${d.i + 1}: ${esc(d.error)}`);
          $('#gout').innerHTML = errs.length ? `<span class="err">${errs.join('<br>')}</span>` : '';
          draw();
        }, 120);
      });
      root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tog]');
        if (t) { const i = +t.dataset.tog; st.fns[i].on = !st.fns[i].on; t.classList.toggle('on', st.fns[i].on); save(); draw(); return; }
        const an = e.target.closest('[data-an]');
        if (an) { A.haptic(); if (an.dataset.an === 'clear') { st.markers = []; st.trace = null; $('#gout').innerHTML = ''; $('#gread').textContent = ''; draw(); } else analyze(an.dataset.an); }
        if (e.target.id === 'gtbl') { A.haptic(); table(); }
      });
      new ResizeObserver(() => resize()).observe(cv.parentElement);
      window.addEventListener('themechange', draw);
    },
    show() { setTimeout(resize, 30); },
  });
  window.Graph = { draw };
})();
