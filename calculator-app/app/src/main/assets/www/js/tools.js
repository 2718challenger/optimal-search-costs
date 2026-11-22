/* 도구 1: 방정식, 미적분, 행렬, 벡터, 통계, 확률분포 */
'use strict';
(function () {
  const E = window.Engine, A = window.App;
  const { $, $$, esc } = A;
  const f = (x) => A.fmt(x);
  const fc = (z) => A.fmtC(z);
  const errHTML = (e) => `<span class="err">${esc(e && e.message ? e.message : e)}</span>`;
  const attrs = 'autocomplete="off" autocapitalize="off" spellcheck="false"';
  const field = (id, label, val, extra = '') => `<div class="field"><label for="${id}">${label}</label><input class="inp fx" id="${id}" value="${esc(val)}" ${attrs} ${extra}></div>`;
  const seg = (name, items, on) => `<div class="seg" data-seg="${name}">${items.map(([k, l]) => `<button data-k="${k}" class="${k === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const val = (id) => E.evalReal($('#' + id).value);
  const withRad = (fn) => { const s = E.state.angle; E.state.angle = 'RAD'; try { return fn(); } finally { E.state.angle = s; } };
  const sub = (i) => String(i).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[c] || c).join('');

  // 입력값 저장/복원
  function persist(root) {
    $$('input[id], textarea[id]', root).forEach((el) => {
      const v = A.Store.get('in.' + el.id, null); if (v !== null) el.value = v;
    });
    root.addEventListener('input', (e) => { if (e.target.id) A.Store.set('in.' + e.target.id, e.target.value); });
  }
  function segs(root, handler) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.seg button'); if (!b) return;
      const s = b.parentElement; $$('button', s).forEach((x) => x.classList.toggle('on', x === b));
      A.haptic(); handler(s.dataset.seg, b.dataset.k);
    });
  }
  function panes(root, name, key) { $$(`[data-pane-${name}]`, root).forEach((p) => { p.hidden = p.getAttribute(`data-pane-${name}`) !== key; }); }

  /* ───────── 간단한 차트 ───────── */
  const Chart = {
    draw(cv, o) {
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W) return;
      cv.width = W * dpr; cv.height = H * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const pad = { l: 8, r: 8, t: 10, b: 20 };
      const { xmin, xmax } = o; let { ymin, ymax } = o;
      if (ymax - ymin < 1e-12) { ymax += 1; ymin -= 1; }
      const X = (x) => pad.l + (x - xmin) / (xmax - xmin) * (W - pad.l - pad.r);
      const Y = (y) => H - pad.b - (y - ymin) / (ymax - ymin) * (H - pad.t - pad.b);
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = css('--line-2'); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(pad.l, Y(Math.max(ymin, Math.min(ymax, 0)))); ctx.lineTo(W - pad.r, Y(Math.max(ymin, Math.min(ymax, 0)))); ctx.stroke();
      ctx.fillStyle = css('--text-4'); ctx.font = '10px Roboto, sans-serif'; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillText(lbl(xmin), pad.l, H - pad.b + 5);
      ctx.textAlign = 'right'; ctx.fillText(lbl(xmax), W - pad.r, H - pad.b + 5);
      if (o.bars) {
        const bw = o.barW;
        o.bars.forEach((b) => {
          ctx.fillStyle = b.hi ? css('--accent') : css('--surface-3');
          const x0 = X(b.x - bw / 2), x1 = X(b.x + bw / 2);
          ctx.fillRect(x0 + 1, Y(b.y), Math.max(1, x1 - x0 - 2), Y(0) - Y(b.y));
        });
      }
      if (o.shade) {
        const { fn, a, b } = o.shade; const lo = Math.max(a, xmin), hi = Math.min(b, xmax);
        if (hi > lo) {
          ctx.fillStyle = css('--accent-soft'); ctx.beginPath(); ctx.moveTo(X(lo), Y(0));
          for (let k = 0; k <= 200; k++) { const x = lo + (hi - lo) * k / 200; ctx.lineTo(X(x), Y(fn(x))); }
          ctx.lineTo(X(hi), Y(0)); ctx.closePath(); ctx.fill();
        }
      }
      (o.fns || []).forEach((c) => {
        ctx.strokeStyle = css(c.color || '--c1'); ctx.lineWidth = 2; ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= 300; k++) { const x = xmin + (xmax - xmin) * k / 300; const y = c.fn(x); if (!isFinite(y)) { pen = false; continue; } const py = Math.max(-1000, Math.min(H + 1000, Y(y))); if (pen) ctx.lineTo(X(x), py); else ctx.moveTo(X(x), py); pen = true; }
        ctx.stroke();
      });
      (o.points || []).forEach((p) => { ctx.fillStyle = css('--c2'); ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.5, 0, Math.PI * 2); ctx.fill(); });
    },
  };
  const lbl = (v) => E.pretty(E.fmtReal(Number(Number(v).toPrecision(4)), { mode: 'NORM' }));
  window.Chart = Chart;

  /* ═════════ 방정식 ═════════ */
  A.register({
    id: 'solve', name: '방정식', glyph: 'x=',
    init(root) {
      let deg = A.Store.get('solve.deg', 2), n = A.Store.get('solve.n', 2);
      root.innerHTML = `<div class="scroll">
        ${seg('sv', [['poly', '다항 방정식'], ['lin', '연립 일차'], ['gen', '일반 방정식']], 'poly')}
        <div data-pane-sv="poly"><div class="card"><h2>aₙxⁿ + … + a₁x + a₀ = 0<span class="sp"></span><span class="stepper">차수 <button data-d="-1">−</button><b id="pdeg">${deg}</b><button data-d="1">+</button></span></h2>
          <div id="pcoef" class="grid3"></div>
          <button class="btn primary block" id="psolve" style="margin-top:4px">풀기</button><div class="out" id="pout"></div></div></div>
        <div data-pane-sv="lin" hidden><div class="card"><h2>연립 일차방정식<span class="sp"></span><span class="stepper">미지수 <button data-n="-1">−</button><b id="ln">${n}</b><button data-n="1">+</button></span></h2>
          <div class="mx-wrap"><div id="lgrid"></div></div>
          <button class="btn primary block" id="lsolve" style="margin-top:10px">풀기</button><div class="out" id="lout"></div></div></div>
        <div data-pane-sv="gen" hidden><div class="card"><h2>f(x) = g(x) 수치해</h2>
          ${field('geq', '방정식 (x 사용)', 'x^3 - 2x = 5')}
          <div class="grid2">${field('ga', '탐색 시작', '-100')}${field('gb', '탐색 끝', '100')}</div>
          <button class="btn primary block" id="gsolve">모든 실근 찾기</button><div class="out" id="gout2"></div>
          <p class="note">구간을 잘게 나눠 부호 변화를 찾고 이분법으로 정밀화합니다. 삼각함수는 현재 각도 단위(${E.state.angle})를 따릅니다.</p></div></div>
      </div>`;
      const pcoef = () => {
        const old = $$('#pcoef input').map((i) => i.value);
        const defs = deg === 2 ? ['1', '-3', '2'] : deg === 3 ? ['1', '-6', '11', '-6'] : null;
        $('#pcoef').innerHTML = Array.from({ length: deg + 1 }, (_, k) => {
          const p = deg - k; const v = old.length === deg + 1 ? old[k] : (defs ? defs[k] : (k === 0 ? '1' : '0'));
          return field('pc' + k, p === 0 ? 'a₀ (상수)' : `a${sub(p)} · x${p > 1 ? E.supify(p) : ''}`, v);
        }).join('');
      };
      const lgrid = () => {
        const g = $('#lgrid'); const old = {};
        $$('input', g).forEach((i) => { old[i.dataset.rc] = i.value; });
        const vars = ['x', 'y', 'z', 'w', 'u', 'v'];
        const ex = [[2, 1, 5], [1, -1, 1]];
        g.className = 'mx'; g.style.gridTemplateColumns = `repeat(${n + 1}, auto)`;
        let h = '';
        for (let i = 0; i < n; i++) for (let j = 0; j <= n; j++) {
          const rc = `${i},${j}`; const v = old[rc] ?? (n === 2 && ex[i] ? String(ex[i][j]) : (i === j ? '1' : '0'));
          h += `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><input class="inp fx" data-rc="${rc}" value="${esc(v)}" ${attrs}><small style="font-size:10px;color:var(--text-4)">${j < n ? vars[j] : '= 상수'}</small></div>`;
        }
        g.innerHTML = h;
      };
      pcoef(); lgrid(); persist(root);
      segs(root, (name, k) => panes(root, 'sv', k));
      root.addEventListener('click', (e) => {
        const d = e.target.closest('[data-d]');
        if (d) { deg = Math.max(1, Math.min(10, deg + +d.dataset.d)); $('#pdeg').textContent = deg; A.Store.set('solve.deg', deg); pcoef(); return; }
        const nn = e.target.closest('[data-n]');
        if (nn) { n = Math.max(2, Math.min(6, n + +nn.dataset.n)); $('#ln').textContent = n; A.Store.set('solve.n', n); lgrid(); return; }
        if (e.target.id === 'psolve') solvePoly();
        if (e.target.id === 'lsolve') solveLin();
        if (e.target.id === 'gsolve') solveGen();
      });
      function solvePoly() {
        const out = $('#pout');
        try {
          const c = Array.from({ length: deg + 1 }, (_, k) => val('pc' + k));
          if (c[0] === 0) throw new Error('최고차 계수가 0이 아니어야 합니다');
          const roots = E.polyRoots(c);
          let h = `<div class="kv">${roots.map((r, i) => `<dt>x${sub(i + 1)}</dt><dd>${esc(fc(r))}</dd>`).join('')}</div>`;
          if (deg === 2) {
            const [a, b, cc] = c; const D = b * b - 4 * a * cc;
            h += `<div class="kv" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><dt>판별식 D</dt><dd>${esc(f(D))} (${D > 0 ? '서로 다른 두 실근' : D === 0 ? '중근' : '두 허근'})</dd><dt>꼭짓점</dt><dd>(${esc(f(-b / (2 * a)))}, ${esc(f(cc - b * b / (4 * a)))})</dd><dt>두 근의 합 / 곱</dt><dd>${esc(f(-b / a))} / ${esc(f(cc / a))}</dd></div>`;
            const ex = roots.map((r) => (r.im === 0 ? E.exactForms(r.re) : [])).flat();
            if (ex.length) h += `<p class="note">정확한 값: ${ex.map((q) => esc(E.pretty(q.v))).join(', ')}</p>`;
          }
          out.innerHTML = h;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function solveLin() {
        const out = $('#lout');
        try {
          const M = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => E.evalReal($(`#lgrid input[data-rc="${i},${j}"]`).value)));
          const res = E.Mx.solve(M.map((r) => r.slice(0, n)), M.map((r) => r[n]));
          const vars = ['x', 'y', 'z', 'w', 'u', 'v'];
          if (res.status === 'none') out.innerHTML = '<span class="err">해가 없습니다 (모순 방정식)</span>';
          else if (res.status === 'many') out.innerHTML = '<span class="err">해가 무수히 많습니다 (종속 방정식)</span>';
          else {
            const det = E.Mx.det(M.map((r) => r.slice(0, n)));
            out.innerHTML = `<div class="kv">${res.x.map((v, i) => `<dt class="sym">${vars[i]}</dt><dd>${esc(f(v))}${(() => { const fr = E.fracString(v); return fr ? ` <span class="muted">= ${esc(fr)}</span>` : ''; })()}</dd>`).join('')}<dt>계수 행렬식</dt><dd>${esc(f(det))}</dd></div>`;
          }
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function solveGen() {
        const out = $('#gout2');
        try {
          const fn = E.makeEquation($('#geq').value);
          const a = val('ga'), b = val('gb');
          if (!(b > a)) throw new Error('탐색 끝이 시작보다 커야 합니다');
          const r = E.findRoots(fn, a, b, 20000);
          out.innerHTML = r.length ? `<div class="kv">${r.slice(0, 40).map((x, i) => `<dt>x${sub(i + 1)}</dt><dd>${esc(f(x))}</dd>`).join('')}</div>${r.length > 40 ? `<p class="note">외 ${r.length - 40}개</p>` : ''}` : '<span class="muted">이 구간에서 실근을 찾지 못했습니다</span>';
        } catch (e) { out.innerHTML = errHTML(e); }
      }
    },
  });

  /* ═════════ 미적분 ═════════ */
  A.register({
    id: 'calculus', name: '미적분', glyph: '∫',
    init(root) {
      root.innerHTML = `<div class="scroll">
        ${seg('cc', [['der', '미분'], ['int', '정적분'], ['lim', '극한'], ['ser', '급수 Σ·Π'], ['tay', '테일러']], 'der')}
        <div data-pane-cc="der"><div class="card"><h2>도함수 f⁽ⁿ⁾(a)<span class="sp"></span><span class="tag">라디안</span></h2>
          ${field('dfx', 'f(x)', 'x^3·sin(x)')}<div class="grid2">${field('da', 'x = a', '1')}${field('dn', '차수 (1~4)', '1')}</div>
          <button class="btn primary block" data-go="der">계산</button><div class="out" id="dout"></div></div></div>
        <div data-pane-cc="int" hidden><div class="card"><h2>∫ₐᵇ f(x) dx<span class="sp"></span><span class="tag">라디안</span></h2>
          ${field('ifx', 'f(x)', 'e^(-x^2)')}<div class="grid2">${field('ia', '하한 a', '-∞')}${field('ib', '상한 b', '∞')}</div>
          <button class="btn primary block" data-go="int">계산</button><div class="out" id="iout"></div><canvas class="chart" id="ichart"></canvas>
          <p class="note">적응형 가우스–크론로드(G7/K15) 구적법. 무한 구간(∞, inf)도 변수 치환으로 계산합니다.</p></div></div>
        <div data-pane-cc="lim" hidden><div class="card"><h2>lim f(x)  (x → a)<span class="sp"></span><span class="tag">라디안</span></h2>
          ${field('lfx', 'f(x)', 'sin(x)/x')}${field('la', 'a (∞ 가능)', '0')}
          <button class="btn primary block" data-go="lim">계산</button><div class="out" id="lout2"></div></div></div>
        <div data-pane-cc="ser" hidden><div class="card"><h2>급수 · 곱<span class="sp"></span><span class="tag">변수 n 또는 x</span></h2>
          ${seg('sk', [['sum', 'Σ 합'], ['prod', 'Π 곱']], 'sum')}
          ${field('sfx', '일반항 f(n)', '1/n^2')}<div class="grid2">${field('sa', '시작 n', '1')}${field('sb', '끝 (∞ 가능)', '∞')}</div>
          <button class="btn primary block" data-go="ser">계산</button><div class="out" id="sout"></div></div></div>
        <div data-pane-cc="tay" hidden><div class="card"><h2>테일러 전개<span class="sp"></span><span class="tag">라디안</span></h2>
          ${field('tfx', 'f(x)', 'cos(x)')}<div class="grid2">${field('ta', '중심 a', '0')}${field('tn', '차수 (1~10)', '6')}</div>
          <button class="btn primary block" data-go="tay">전개</button><div class="out" id="tout"></div>
          <p class="note">복소평면 위의 코시 적분공식으로 계수를 계산하므로 고차 계수까지 정확합니다 (해석함수 대상).</p></div></div>
      </div>`;
      persist(root);
      let serKind = 'sum';
      segs(root, (name, k) => { if (name === 'cc') panes(root, 'cc', k); else serKind = k; });
      const fn2 = (src) => { const g = E.compile(src); const env = Object.assign({}, E.globals); return (v) => { env.x = env.n = E.C(v); try { const z = g(env); return E.isReal(z) ? z.re : NaN; } catch (e) { return NaN; } }; };
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]'); if (!b) return; A.haptic();
        const k = b.dataset.go;
        withRad(() => {
          if (k === 'der') {
            const out = $('#dout');
            try {
              const src = $('#dfx').value; E.compile(src); const fn = E.makeFn(src); const a = val('da'); const n = Math.round(val('dn'));
              const d = E.derivative(fn, a, n); const fa = fn(a);
              let h = `<div class="lbl">f${"′″‴⁗"[n - 1]}(${esc(f(a))})</div><div class="big">${esc(f(d))}</div><div class="kv" style="margin-top:8px"><dt>f(a)</dt><dd>${esc(f(fa))}</dd>`;
              if (n === 1 && isFinite(fa)) h += `<dt>접선</dt><dd>y = ${esc(f(d))}x ${fa - d * a < 0 ? '−' : '+'} ${esc(f(Math.abs(fa - d * a)))}</dd>${d !== 0 ? `<dt>법선 기울기</dt><dd>${esc(f(-1 / d))}</dd>` : ''}`;
              out.innerHTML = h + '</div>';
            } catch (er) { out.innerHTML = errHTML(er); }
          }
          if (k === 'int') {
            const out = $('#iout');
            try {
              const src = $('#ifx').value; E.compile(src); const fn = E.makeFn(src);
              const pa = (s) => E.evalReal(String(s).replace(/∞/g, 'inf'));
              const a = pa($('#ia').value), b2 = pa($('#ib').value);
              const r = E.integrate(fn, a, b2);
              const ex = E.exactForms(r.value).map((q) => esc(E.pretty(q.v)));
              out.innerHTML = `<div class="lbl">∫ f(x) dx</div><div class="big">${esc(f(r.value))}</div><div class="kv" style="margin-top:8px"><dt>추정 오차</dt><dd>${esc(E.pretty(r.error.toExponential(2)))}</dd>${isFinite(a) && isFinite(b2) && a !== b2 ? `<dt>평균값</dt><dd>${esc(f(r.value / (b2 - a)))}</dd>` : ''}${ex.length ? `<dt>정확한 값 추정</dt><dd>${ex.join(', ')}</dd>` : ''}</div>`;
              const lo = isFinite(a) ? a : (isFinite(b2) ? b2 - 10 : -5), hi = isFinite(b2) ? b2 : lo + 10;
              const pad = (hi - lo) * 0.15 || 1; const xs = [lo - pad, hi + pad];
              let ys = []; for (let i = 0; i <= 100; i++) { const y = fn(xs[0] + (xs[1] - xs[0]) * i / 100); if (isFinite(y)) ys.push(y); }
              Chart.draw($('#ichart'), { xmin: xs[0], xmax: xs[1], ymin: Math.min(0, ...ys), ymax: Math.max(0, ...ys) * 1.1, fns: [{ fn }], shade: { fn, a: lo, b: hi } });
            } catch (er) { out.innerHTML = errHTML(er); }
          }
          if (k === 'lim') {
            const out = $('#lout2');
            try {
              const src = $('#lfx').value; E.compile(src); const fn = E.makeFn(src);
              const a = E.evalReal($('#la').value.replace(/∞/g, 'inf'));
              const L = isFinite(a) ? E.limit(fn, a, -1) : E.limit(fn, a, 1), Rr = isFinite(a) ? E.limit(fn, a, 1) : L;
              const show = (v) => (Number.isNaN(v) ? '수렴하지 않음' : f(v));
              const same = (Number.isNaN(L) && Number.isNaN(Rr)) ? false : (L === Rr || Math.abs(L - Rr) < 1e-7 * Math.max(1, Math.abs(L)));
              out.innerHTML = `<div class="lbl">극한값</div><div class="big">${same ? esc(show(L)) : '존재하지 않음'}</div>${isFinite(a) ? `<div class="kv" style="margin-top:8px"><dt>좌극한 x→a⁻</dt><dd>${esc(show(L))}</dd><dt>우극한 x→a⁺</dt><dd>${esc(show(Rr))}</dd></div>` : ''}`;
            } catch (er) { out.innerHTML = errHTML(er); }
          }
          if (k === 'ser') {
            const out = $('#sout');
            try {
              const src = $('#sfx').value; E.compile(src); const fn = fn2(src);
              const a = Math.round(val('sa')); const bs = $('#sb').value.replace(/∞/g, 'inf'); const bv = E.evalReal(bs);
              const prod = serKind === 'prod';
              let acc = prod ? 1 : 0, nTerms = 0, conv = true;
              const maxN = isFinite(bv) ? Math.round(bv) : a + 2e6;
              if (isFinite(bv) && bv - a > 2e6) throw new Error('항이 너무 많습니다 (최대 2×10⁶)');
              let small = 0;
              for (let k2 = a; k2 <= maxN; k2++) {
                const t = fn(k2); if (!isFinite(t)) throw new Error(`n=${k2} 에서 항이 정의되지 않습니다`);
                const prev = acc; acc = prod ? acc * t : acc + t; nTerms++;
                if (!isFinite(bv)) {
                  if (Math.abs(acc - prev) <= 1e-16 * Math.max(1, Math.abs(acc))) { if (++small > 20) break; } else small = 0;
                }
              }
              if (!isFinite(bv) && small <= 20) conv = false;
              out.innerHTML = `<div class="lbl">${prod ? 'Π' : 'Σ'} (${nTerms.toLocaleString()}항)</div><div class="big">${esc(f(acc))}</div>${!conv ? '<p class="note">2×10⁶항까지 더했지만 수렴이 느리거나 발산합니다. 근사값입니다.</p>' : ''}${(() => { const ex = E.exactForms(acc); return ex.length ? `<p class="note">정확한 값 추정: ${ex.map((q) => esc(E.pretty(q.v))).join(', ')}</p>` : ''; })()}`;
            } catch (er) { out.innerHTML = errHTML(er); }
          }
          if (k === 'tay') {
            const out = $('#tout');
            try {
              const src = $('#tfx').value; const a = val('ta'); const n = Math.max(1, Math.min(10, Math.round(val('tn'))));
              const co = E.taylor(src, a, n);
              const xa = a === 0 ? 'x' : `(x ${a < 0 ? '+' : '−'} ${f(Math.abs(a))})`;
              const terms = co.map((c, k2) => {
                if (c === 0) return null;
                const fr = E.fracString(c); const cs = fr && fr.length < 14 ? fr : f(c);
                const pw = k2 === 0 ? '' : k2 === 1 ? xa : `${xa}${E.supify(k2)}`;
                return { c, s: k2 === 0 ? cs : (Math.abs(c) === 1 ? (c < 0 ? '−' : '') + pw : `${cs}·${pw}`) };
              }).filter(Boolean);
              const poly = terms.map((t, i) => (i === 0 ? t.s : (t.s.startsWith('-') || t.s.startsWith('−') ? ` − ${t.s.replace(/^[-−]/, '')}` : ` + ${t.s}`))).join('') || '0';
              out.innerHTML = `<div class="lbl">f(x) ≈</div><div style="font-size:16px;color:var(--text);line-height:1.6">${esc(E.pretty(poly))}</div><table class="tbl" style="margin-top:10px"><tr><th>k</th><th>f⁽ᵏ⁾(a)/k!</th><th>f⁽ᵏ⁾(a)</th></tr>${co.map((c, k2) => `<tr><td>${k2}</td><td>${esc(f(c))}</td><td>${esc(f(c * E.gamma(k2 + 1)))}</td></tr>`).join('')}</table>`;
            } catch (er) { out.innerHTML = errHTML(er); }
          }
        });
      });
    },
  });

  /* ═════════ 행렬 ═════════ */
  A.register({
    id: 'matrix', name: '행렬', glyph: '[ ]',
    init(root) {
      const st = A.Store.get('matrix', { A: { r: 3, c: 3, v: [['2', '1', '0'], ['1', '3', '1'], ['0', '1', '4']] }, B: { r: 3, c: 3, v: [['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']] } });
      let target = 'A', last = null;
      const save = () => A.Store.set('matrix', st);
      const editor = (n) => `<div class="card"><h2>행렬 ${n}<span class="sp"></span>
          <span class="stepper">행 <button data-m="${n}" data-dim="r" data-d="-1">−</button><b id="${n}r">${st[n].r}</b><button data-m="${n}" data-dim="r" data-d="1">+</button></span>
          <span class="stepper">열 <button data-m="${n}" data-dim="c" data-d="-1">−</button><b id="${n}c">${st[n].c}</b><button data-m="${n}" data-dim="c" data-d="1">+</button></span></h2>
          <div class="mx-wrap"><div class="mx" id="mx${n}"></div></div></div>`;
      root.innerHTML = `<div class="scroll">${editor('A')}${editor('B')}
        <div class="card"><h2>연산<span class="sp"></span></h2>
          ${seg('mt', [['A', '대상: A'], ['B', '대상: B']], 'A')}
          <div class="btns">
            <button class="btn" data-op="add">A + B</button><button class="btn" data-op="sub">A − B</button><button class="btn" data-op="mul">A × B</button><button class="btn" data-op="mulBA">B × A</button>
            <button class="btn" data-op="det">det</button><button class="btn" data-op="inv">역행렬</button><button class="btn" data-op="T">전치</button><button class="btn" data-op="sq">제곱</button>
            <button class="btn" data-op="rank">계수</button><button class="btn" data-op="tr">대각합</button><button class="btn" data-op="rref">RREF</button><button class="btn" data-op="eig">고유값</button>
            <button class="btn" data-op="pow">n제곱</button><button class="btn" data-op="scale">k배</button><button class="btn" data-op="cp">특성다항식</button><button class="btn" data-op="swap">A ↔ B</button>
          </div>
          <div class="grid2" style="margin-top:8px">${field('mk', 'k / n 값', '2')}<div class="field"><label>&nbsp;</label><button class="btn block" data-op="clear">대상 초기화</button></div></div>
          <div class="out" id="mout"></div>
          <div class="row" id="mcopy" style="margin-top:8px" hidden><button class="btn sm" data-op="toA">결과 → A</button><button class="btn sm" data-op="toB">결과 → B</button><button class="btn sm" data-op="toCalc">결과 복사</button></div>
        </div></div>`;
      persist(root);
      function render(n) {
        const m = st[n]; const g = $('#mx' + n);
        g.style.gridTemplateColumns = `repeat(${m.c}, auto)`;
        let h = '';
        for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) h += `<input class="inp fx" data-m="${n}" data-i="${i}" data-j="${j}" value="${esc((m.v[i] && m.v[i][j]) ?? '0')}" ${attrs}>`;
        g.innerHTML = h; $('#' + n + 'r').textContent = m.r; $('#' + n + 'c').textContent = m.c;
      }
      render('A'); render('B');
      const get = (n) => { const m = st[n]; return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => E.evalReal((m.v[i] && m.v[i][j]) || '0'))); };
      const set = (n, M) => { st[n] = { r: M.length, c: M[0].length, v: M.map((r) => r.map((x) => E.fmtReal(E.cleanNum(Number(x.toPrecision(12))), { mode: 'NORM' }))) }; save(); render(n); };
      const mxHTML = (M) => `<div class="mx-wrap"><div class="mx-out" style="grid-template-columns:repeat(${M[0].length},auto)">${M.flat().map((x) => `<span>${esc(f(Math.abs(x) < 1e-13 ? 0 : x))}</span>`).join('')}</div></div>`;
      root.addEventListener('input', (e) => {
        const t = e.target; if (t.dataset.m && t.dataset.i !== undefined) { const m = st[t.dataset.m]; (m.v[t.dataset.i] = m.v[t.dataset.i] || [])[t.dataset.j] = t.value; save(); }
      });
      segs(root, (name, k) => { target = k; });
      root.addEventListener('click', (e) => {
        const s = e.target.closest('[data-dim]');
        if (s) {
          const m = st[s.dataset.m]; const dim = s.dataset.dim; m[dim] = Math.max(1, Math.min(6, m[dim] + +s.dataset.d));
          for (let i = 0; i < m.r; i++) { m.v[i] = m.v[i] || []; for (let j = 0; j < m.c; j++) if (m.v[i][j] === undefined) m.v[i][j] = '0'; }
          save(); render(s.dataset.m); return;
        }
        const b = e.target.closest('[data-op]'); if (!b) return; A.haptic();
        const op = b.dataset.op, out = $('#mout'), other = target === 'A' ? 'B' : 'A';
        const showM = (M, title) => { last = M; out.innerHTML = `<div class="lbl">${title}</div>${mxHTML(M)}`; $('#mcopy').hidden = false; };
        const showS = (x, title) => { last = null; out.innerHTML = `<div class="lbl">${title}</div><div class="big">${esc(typeof x === 'string' ? x : f(x))}</div>`; $('#mcopy').hidden = true; };
        try {
          const T = target;
          switch (op) {
            case 'add': showM(E.Mx.add(get('A'), get('B')), 'A + B'); break;
            case 'sub': showM(E.Mx.add(get('A'), get('B'), -1), 'A − B'); break;
            case 'mul': showM(E.Mx.mul(get('A'), get('B')), 'A × B'); break;
            case 'mulBA': showM(E.Mx.mul(get('B'), get('A')), 'B × A'); break;
            case 'det': showS(E.Mx.det(get(T)), `det(${T})`); break;
            case 'inv': {
              const Mi = E.Mx.inv(get(T)); showM(Mi, `${T}⁻¹`);
              const d = E.Mx.det(get(T)); if (Math.abs(d) > 1e-12 && Math.abs(d) < 1e6 && Number.isInteger(E.cleanNum(d))) out.innerHTML += `<p class="note">det = ${esc(f(d))} · 분수로: ${esc(Mi.map((r) => r.map((x) => E.fracString(x) || f(x)).join('  ')).join(' │ '))}</p>`;
              break;
            }
            case 'T': showM(E.Mx.T(get(T)), `${T}ᵀ`); break;
            case 'sq': showM(E.Mx.pow(get(T), 2), `${T}²`); break;
            case 'pow': { const k = val('mk'); showM(E.Mx.pow(get(T), k), `${T}^${f(k)}`); break; }
            case 'scale': { const k = val('mk'); showM(E.Mx.scale(get(T), k), `${f(k)}·${T}`); break; }
            case 'rank': showS(E.Mx.rank(get(T)), `rank(${T})`); break;
            case 'tr': showS(E.Mx.trace(get(T)), `tr(${T})`); break;
            case 'rref': showM(E.Mx.rref(get(T)).M, `RREF(${T})`); break;
            case 'cp': {
              const c = E.Mx.charPoly(get(T)); const n = c.length - 1;
              const s = c.map((v, k) => { if (Math.abs(v) < 1e-12) return null; const p = n - k; const vv = E.cleanNum(v); const a = Math.abs(vv); const cs = (a === 1 && p > 0) ? '' : f(a); return { neg: vv < 0, s: cs + (p > 0 ? 'λ' + (p > 1 ? E.supify(p) : '') : '') }; }).filter(Boolean)
                .map((t, i) => (i === 0 ? (t.neg ? '−' : '') + t.s : (t.neg ? ' − ' : ' + ') + t.s)).join('');
              showS(s, `det(λI − ${T})`); break;
            }
            case 'eig': {
              const r = E.Mx.eigen(get(T)); last = null; $('#mcopy').hidden = true;
              out.innerHTML = `<div class="lbl">고유값 · 고유벡터 (${T})</div><table class="tbl"><tr><th>λ</th><th>고유벡터 (정규화)</th></tr>${r.vals.map((l, i) => `<tr><td>${esc(fc(l))}</td><td>${r.vecs[i] ? '(' + r.vecs[i].map((x) => esc(f(x))).join(', ') + ')' : '<span class="muted">복소</span>'}</td></tr>`).join('')}</table>`;
              break;
            }
            case 'swap': [st.A, st.B] = [st.B, st.A]; save(); render('A'); render('B'); A.toast('A ↔ B 교환'); break;
            case 'clear': { const m = st[T]; m.v = Array.from({ length: m.r }, () => new Array(m.c).fill('0')); save(); render(T); break; }
            case 'toA': if (last) set('A', last); break;
            case 'toB': if (last) set('B', last); break;
            case 'toCalc': if (last) A.copy('[' + last.map((r) => '[' + r.map((x) => E.fmtReal(x)).join(', ') + ']').join(', ') + ']'); break;
          }
          void other;
        } catch (er) { out.innerHTML = errHTML(er); $('#mcopy').hidden = true; }
      });
    },
  });

  /* ═════════ 벡터 ═════════ */
  A.register({
    id: 'vector', name: '벡터', glyph: '→',
    init(root) {
      root.innerHTML = `<div class="scroll"><div class="card"><h2>벡터 a, b</h2>
        ${seg('vd', [['3', '3차원'], ['2', '2차원']], '3')}
        <div class="grid3" id="va">${field('a1', 'a₁', '1')}${field('a2', 'a₂', '2')}${field('a3', 'a₃', '3')}</div>
        <div class="grid3" id="vb">${field('b1', 'b₁', '4')}${field('b2', 'b₂', '-1')}${field('b3', 'b₃', '2')}</div>
        <div class="out" id="vout"></div></div></div>`;
      persist(root);
      let dim = 3;
      segs(root, (n, k) => { dim = +k; $$('#a3,#b3').forEach((i) => { i.closest('.field').style.visibility = dim === 3 ? '' : 'hidden'; }); calc(); });
      const vec = (p) => Array.from({ length: dim }, (_, i) => E.evalReal($('#' + p + (i + 1)).value));
      const V = (v) => `(${v.map((x) => esc(f(x))).join(', ')})`;
      function calc() {
        const out = $('#vout');
        try {
          const a = vec('a'), b = vec('b');
          const dot = a.reduce((s, x, i) => s + x * b[i], 0);
          const na = Math.hypot(...a), nb = Math.hypot(...b);
          const cos = dot / (na * nb);
          const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
          let cross = null;
          if (dim === 3) cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          else cross = a[0] * b[1] - a[1] * b[0];
          const proj = b.map((x) => x * dot / (nb * nb));
          out.innerHTML = `<div class="kv">
            <dt>a + b</dt><dd>${V(a.map((x, i) => x + b[i]))}</dd>
            <dt>a − b</dt><dd>${V(a.map((x, i) => x - b[i]))}</dd>
            <dt>a · b (내적)</dt><dd>${esc(f(dot))}</dd>
            <dt>a × b (외적)</dt><dd>${Array.isArray(cross) ? V(cross) : esc(f(cross)) + ' <span class="muted">(z성분)</span>'}</dd>
            <dt>|a|, |b|</dt><dd>${esc(f(na))}, ${esc(f(nb))}</dd>
            <dt>사잇각</dt><dd>${esc(f(ang * 180 / Math.PI))}° · ${esc(f(ang))} rad</dd>
            <dt>proj<sub>b</sub> a</dt><dd>${V(proj)}</dd>
            <dt>a 단위벡터</dt><dd>${V(a.map((x) => x / na))}</dd>
            <dt>${dim === 3 ? '평행사변형 넓이' : '평행사변형 넓이'}</dt><dd>${esc(f(Array.isArray(cross) ? Math.hypot(...cross) : Math.abs(cross)))}</dd>
            <dt>두 점 거리 |a−b|</dt><dd>${esc(f(Math.hypot(...a.map((x, i) => x - b[i]))))}</dd>
          </div>`;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      root.addEventListener('input', calc); calc();
    },
  });

  /* ═════════ 통계 ═════════ */
  function parseList(s) {
    const out = [];
    String(s).split(/[,;\n\s]+/).filter(Boolean).forEach((tok) => {
      const m = /^(.+):(.+)$/.exec(tok); // 값:도수
      if (m) { const v = E.evalReal(m[1]), c = Math.round(E.evalReal(m[2])); for (let i = 0; i < c; i++) out.push(v); }
      else out.push(E.evalReal(tok));
    });
    return out;
  }
  A.register({
    id: 'stats', name: '통계', glyph: 'σ',
    init(root) {
      root.innerHTML = `<div class="scroll">
        ${seg('st', [['one', '1변수 통계'], ['two', '2변수 · 회귀']], 'one')}
        <div data-pane-st="one"><div class="card"><h2>데이터</h2>
          <div class="field"><label>쉼표로 구분 · 값:도수 표기 가능 (예: 3:4)</label><textarea class="inp fx" id="sd1" ${attrs}>2, 4, 4, 4, 5, 5, 7, 9</textarea></div>
          <div class="out" id="s1out"></div><canvas class="chart" id="s1chart"></canvas></div></div>
        <div data-pane-st="two" hidden><div class="card"><h2>x, y 데이터</h2>
          <div class="field"><label>x 값</label><textarea class="inp fx" id="sdx" style="height:64px" ${attrs}>1, 2, 3, 4, 5, 6</textarea></div>
          <div class="field"><label>y 값</label><textarea class="inp fx" id="sdy" style="height:64px" ${attrs}>2.1, 3.9, 6.2, 7.8, 10.1, 12.2</textarea></div>
          ${seg('rt', [['lin', '선형'], ['quad', '2차'], ['exp', '지수'], ['pow', '거듭제곱'], ['log', '로그']], 'lin')}
          <div class="out" id="s2out"></div><canvas class="chart" id="s2chart"></canvas>
          <div class="grid2" style="margin-top:10px">${field('spx', '예측: x =', '7')}<div class="field"><label>ŷ</label><div class="inp" id="spy" style="display:flex;align-items:center"></div></div></div>
        </div></div></div>`;
      persist(root);
      let rtype = 'lin', model = null;
      segs(root, (n, k) => { if (n === 'st') { panes(root, 'st', k); setTimeout(() => { one(); two(); }, 20); } else { rtype = k; two(); } });
      function one() {
        const out = $('#s1out');
        try {
          const v = parseList($('#sd1').value); const s = E.stats1(v);
          const row = (k, x) => `<dt>${k}</dt><dd>${typeof x === 'string' ? x : esc(f(x))}</dd>`;
          out.innerHTML = `<div class="kv">${row('n', s.n)}${row('평균 x̄', s.mean)}${row('중앙값', s.median)}${row('최빈값', s.modes.length ? s.modes.map(f).join(', ') : '없음')}
            ${row('표본표준편차 s', s.sds)}${row('모표준편차 σ', s.sdp)}${row('표본분산 s²', s.vars)}${row('모분산 σ²', s.varp)}
            ${row('최솟값 · 최댓값', `${f(s.min)} · ${f(s.max)}`)}${row('범위', s.range)}${row('Q1 · Q3', `${f(s.q1)} · ${f(s.q3)}`)}${row('IQR', s.iqr)}
            ${row('Σx', s.sum)}${row('Σx²', s.sum2)}${row('표준오차', s.sem)}${row('변동계수', s.cv)}${row('왜도', s.skew)}${row('첨도(초과)', s.kurt)}
            ${isFinite(s.geo) ? row('기하평균', s.geo) + row('조화평균', s.harm) : ''}</div>`;
          // 히스토그램
          const k = Math.max(1, Math.min(14, Math.ceil(Math.log2(s.n) + 1)));
          const w = (s.range || 1) / k; const bins = new Array(k).fill(0);
          v.forEach((x) => { bins[Math.min(k - 1, Math.floor((x - s.min) / w))]++; });
          Chart.draw($('#s1chart'), { xmin: s.min - w / 2, xmax: s.min + w * (k - 0.5), ymin: 0, ymax: Math.max(...bins) * 1.1, bars: bins.map((c, i) => ({ x: s.min + w * i, y: c })), barW: w });
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function two() {
        const out = $('#s2out');
        try {
          const xs = parseList($('#sdx').value), ys = parseList($('#sdy').value);
          if (xs.length !== ys.length) throw new Error(`x(${xs.length}개)와 y(${ys.length}개)의 개수가 다릅니다`);
          const r = E.regression(xs, ys, rtype); model = r;
          const [eq, co] = r.eq;
          out.innerHTML = `<div class="lbl">${esc(eq)}</div><div class="kv">${Object.entries(co).map(([k, v]) => `<dt class="sym">${k}</dt><dd>${esc(f(v))}</dd>`).join('')}<dt>상관계수 r</dt><dd>${esc(f(r.r))}</dd><dt>결정계수 r²</dt><dd>${esc(f(r.r2))}</dd><dt>x̄ · ȳ</dt><dd>${esc(f(xs.reduce((a, b) => a + b, 0) / xs.length))} · ${esc(f(ys.reduce((a, b) => a + b, 0) / ys.length))}</dd></div>`;
          const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
          const px = (xmax - xmin) * 0.1 || 1, py = (ymax - ymin) * 0.15 || 1;
          Chart.draw($('#s2chart'), { xmin: xmin - px, xmax: xmax + px, ymin: ymin - py, ymax: ymax + py, fns: [{ fn: r.fn, color: '--c3' }], points: xs.map((x, i) => [x, ys[i]]) });
          pred();
        } catch (e) { out.innerHTML = errHTML(e); model = null; $('#spy').textContent = ''; }
      }
      function pred() { try { $('#spy').textContent = model ? f(model.fn(val('spx'))) : ''; } catch (e) { $('#spy').textContent = '—'; } }
      let t;
      root.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { if (e.target.id === 'sd1') one(); else if (e.target.id === 'spx') pred(); else two(); }, 150); });
      this.show = () => setTimeout(() => { one(); two(); }, 30);
      one(); two();
    },
  });

  /* ═════════ 확률분포 ═════════ */
  A.register({
    id: 'dist', name: '확률분포', glyph: '𝒩',
    init(root) {
      const D = {
        norm: { name: '정규', p: [['μ (평균)', '0'], ['σ (표준편차)', '1']], cont: true },
        t: { name: 't', p: [['ν (자유도)', '10']], cont: true },
        chi: { name: 'χ²', p: [['k (자유도)', '3']], cont: true },
        exp: { name: '지수', p: [['λ (비율)', '0.5']], cont: true },
        binom: { name: '이항', p: [['n (시행)', '20'], ['p (성공확률)', '0.3']], cont: false },
        pois: { name: '포아송', p: [['λ (평균)', '4']], cont: false },
      };
      let kind = 'norm';
      root.innerHTML = `<div class="scroll">${seg('dk', Object.entries(D).map(([k, v]) => [k, v.name]), 'norm')}
        <div class="card"><h2 id="dtitle">정규분포</h2><div class="grid2" id="dparams"></div>
          <div class="grid2">${field('dx', 'x (또는 k)', '1.96')}${field('dx2', 'x₂ (구간 상한, 선택)', '')}</div>
          <div class="out" id="dout"></div><canvas class="chart" id="dchart"></canvas>
          <div class="grid2" style="margin-top:12px">${field('dp', '역함수: 누적확률 p', '0.975')}<div class="field"><label>P(X ≤ x) = p 인 x</label><div class="inp" id="dinv" style="display:flex;align-items:center"></div></div></div>
        </div></div>`;
      function params() {
        const d = D[kind];
        $('#dtitle').textContent = d.name + '분포';
        $('#dparams').innerHTML = d.p.map(([l, v], i) => field(`dp_${kind}_${i}`, l, A.Store.get(`in.dp_${kind}_${i}`, v))).join('');
      }
      params(); persist(root);
      segs(root, (n, k) => { kind = k; params(); calc(); });
      function calc() {
        const out = $('#dout');
        try {
          const d = D[kind]; const p = d.p.map((_, i) => val(`dp_${kind}_${i}`));
          const x = val('dx'); const x2s = $('#dx2').value.trim(); const x2 = x2s ? E.evalReal(x2s) : null;
          let pdf, cdf, inv = null, range, mean, vr;
          const Di = E.Dist;
          switch (kind) {
            case 'norm': if (p[1] <= 0) throw new Error('σ > 0'); pdf = (t) => Di.normal.pdf(t, p[0], p[1]); cdf = (t) => Di.normal.cdf(t, p[0], p[1]); inv = (q) => Di.normal.inv(q, p[0], p[1]); range = [p[0] - 4 * p[1], p[0] + 4 * p[1]]; mean = p[0]; vr = p[1] ** 2; break;
            case 't': if (p[0] <= 0) throw new Error('ν > 0'); pdf = (t) => Di.tPdf(t, p[0]); cdf = (t) => Di.tCdf(t, p[0]); inv = (q) => Di.tInv(q, p[0]); range = [-5, 5]; mean = p[0] > 1 ? 0 : NaN; vr = p[0] > 2 ? p[0] / (p[0] - 2) : Infinity; break;
            case 'chi': if (p[0] <= 0) throw new Error('k > 0'); pdf = (t) => Di.chiPdf(t, p[0]); cdf = (t) => Di.chiCdf(t, p[0]); inv = (q) => { let lo = 0, hi = p[0] + 50 * Math.sqrt(2 * p[0]) + 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (cdf(m) < q) lo = m; else hi = m; } return (lo + hi) / 2; }; range = [0, p[0] + 4 * Math.sqrt(2 * p[0]) + 2]; mean = p[0]; vr = 2 * p[0]; break;
            case 'exp': if (p[0] <= 0) throw new Error('λ > 0'); pdf = (t) => Di.expPdf(t, p[0]); cdf = (t) => Di.expCdf(t, p[0]); inv = (q) => -Math.log(1 - q) / p[0]; range = [0, 5 / p[0]]; mean = 1 / p[0]; vr = 1 / p[0] ** 2; break;
            case 'binom': { const n = Math.round(p[0]); if (p[1] < 0 || p[1] > 1) throw new Error('0 ≤ p ≤ 1'); pdf = (k) => Di.binomPmf(Math.round(k), n, p[1]); cdf = (k) => (k < 0 ? 0 : Di.binomCdf(Math.floor(k), n, p[1])); range = [0, n]; mean = n * p[1]; vr = n * p[1] * (1 - p[1]); break; }
            case 'pois': if (p[0] <= 0) throw new Error('λ > 0'); pdf = (k) => Di.poisPmf(Math.round(k), p[0]); cdf = (k) => (k < 0 ? 0 : Di.poisCdf(Math.floor(k), p[0])); range = [0, Math.ceil(p[0] + 5 * Math.sqrt(p[0]) + 3)]; mean = p[0]; vr = p[0]; break;
          }
          const disc = !D[kind].cont;
          const le = cdf(x), ge = disc ? 1 - cdf(x - 1) : 1 - le;
          let h = `<div class="kv"><dt>${disc ? 'P(X = k)' : 'f(x) 확률밀도'}</dt><dd>${esc(f(pdf(x)))}</dd><dt>P(X ≤ x)</dt><dd>${esc(f(le))}</dd>${disc ? `<dt>P(X < x)</dt><dd>${esc(f(cdf(x - 1)))}</dd>` : ''}<dt>P(X ≥ x)</dt><dd>${esc(f(ge))}</dd>`;
          if (x2 !== null) { const between = disc ? cdf(x2) - cdf(x - 1) : cdf(x2) - cdf(x); h += `<dt>P(${f(x)} ≤ X ≤ ${f(x2)})</dt><dd>${esc(f(between))}</dd>`; }
          h += `<dt>평균 · 분산</dt><dd>${esc(f(mean))} · ${esc(f(vr))}</dd></div>`;
          out.innerHTML = h;
          try { const q = val('dp'); $('#dinv').textContent = inv ? f(inv(q)) : '이산분포는 지원 안 함'; } catch (e) { $('#dinv').textContent = '—'; }
          const cvs = $('#dchart');
          const lo = x2 !== null ? x : range[0], hi = x2 !== null ? x2 : x;
          if (disc) {
            const bars = []; for (let k = range[0]; k <= range[1]; k++) bars.push({ x: k, y: pdf(k), hi: k >= (x2 !== null ? x : -Infinity) && k <= hi });
            Chart.draw(cvs, { xmin: range[0] - 0.5, xmax: range[1] + 0.5, ymin: 0, ymax: Math.max(...bars.map((b) => b.y)) * 1.1, bars, barW: 1 });
          } else {
            let ym = 0; for (let i = 0; i <= 200; i++) { const y = pdf(range[0] + (range[1] - range[0]) * i / 200); if (isFinite(y)) ym = Math.max(ym, y); }
            Chart.draw(cvs, { xmin: range[0], xmax: range[1], ymin: 0, ymax: Math.min(ym, 5) * 1.1, fns: [{ fn: pdf }], shade: { fn: pdf, a: lo, b: hi } });
          }
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      let t; root.addEventListener('input', () => { clearTimeout(t); t = setTimeout(calc, 120); });
      this.show = () => setTimeout(calc, 30);
      calc();
    },
  });

  window.ToolsUtil = { field, seg, segs, panes, persist, errHTML, val, attrs, Chart, withRad };
})();
