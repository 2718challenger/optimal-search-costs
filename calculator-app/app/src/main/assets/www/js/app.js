/* Graphite 앱 코어: 내비게이션, 계산기, 시트, 입력 키보드, 저장소 */
'use strict';
(function () {
  const E = window.Engine;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ───────── 저장소 ───────── */
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('graphite.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('graphite.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
  };
  const settings = Object.assign({ angle: 'DEG', mode: 'NORM', digits: 4, sep: false, polar: false, theme: 'dark', haptic: true, view: 'calc' }, Store.get('settings', {}));
  const saveSettings = () => Store.set('settings', settings);
  function applySettings() {
    E.state.angle = settings.angle;
    Object.assign(E.fmtOpt, { mode: settings.mode, digits: settings.digits, sep: settings.sep, polar: settings.polar });
    document.documentElement.dataset.theme = settings.theme;
    $('#stAngle').textContent = settings.angle;
    $('#stFmt').textContent = settings.mode === 'NORM' ? 'NORM' : settings.mode + (settings.mode === 'ENG' ? '' : settings.digits);
    if (window.Android && Android.setDark) try { Android.setDark(settings.theme === 'dark'); } catch (e) { /* */ }
  }

  /* ───────── 유틸 ───────── */
  function haptic() {
    if (!settings.haptic) return;
    try { if (window.Android && Android.vibrate) Android.vibrate(); else if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* */ }
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600);
  }
  function copy(text) {
    try {
      if (window.Android && Android.copy) Android.copy(text);
      else if (navigator.clipboard) navigator.clipboard.writeText(text);
      toast('복사됨: ' + (text.length > 28 ? text.slice(0, 28) + '…' : text));
    } catch (e) { toast('복사 실패'); }
  }
  function longPress(el, fn, ms = 520) {
    let t, fired = false;
    el.addEventListener('pointerdown', () => { fired = false; t = setTimeout(() => { fired = true; fn(); haptic(); }, ms); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(t)));
    el.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  const fmt = (x) => E.pretty(E.fmtReal(x));
  const fmtC = (z) => E.pretty(E.fmtCx(z));
  function fmtHTML(s) { // "1.2×10¹⁵" 는 이미 유니코드 위첨자
    return esc(s);
  }

  /* ───────── 시트 ───────── */
  let sheetClose = null;
  function openSheet(title, html, onMount) {
    $('#sheetTitle').textContent = title;
    const body = $('#sheetBody'); body.innerHTML = html; body.scrollTop = 0;
    $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
    if (onMount) onMount(body);
    sheetClose = closeSheet;
  }
  function closeSheet() { $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); sheetClose = null; }

  /* ───────── 뷰 등록/내비게이션 ───────── */
  const views = [];
  let current = null;
  function register(v) { views.push(v); }
  function buildNav() {
    const nav = $('#modes');
    nav.innerHTML = views.map((v) => `<button data-v="${v.id}">${v.name}</button>`).join('');
    nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { haptic(); show(b.dataset.v); } });
    $('#menuBtn').addEventListener('click', () => {
      haptic();
      openSheet('모든 기능', `<div class="menu-grid">${views.map((v) => `<button data-v="${v.id}" class="${v.id === current ? 'active' : ''}"><span class="gl">${v.glyph}</span><span class="nm">${v.name}</span></button>`).join('')}</div>`,
        (b) => b.addEventListener('click', (e) => { const t = e.target.closest('button'); if (t) { closeSheet(); show(t.dataset.v); } }));
    });
  }
  function show(id) {
    const v = views.find((q) => q.id === id) || views[0];
    if (!v.inited) { v.init($('#v-' + v.id)); v.inited = true; }
    $$('.view').forEach((s) => s.classList.toggle('active', s.id === 'v-' + v.id));
    $$('#modes button').forEach((b) => { const on = b.dataset.v === v.id; b.classList.toggle('active', on); if (on) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
    current = v.id; settings.view = v.id; saveSettings();
    KB.hide();
    if (v.show) v.show();
  }

  /* ───────── 수식 입력 키보드 (도구 화면용) ───────── */
  const KB = (() => {
    let target = null;
    const keys = [
      ['sin(', 'sin', 'f'], ['cos(', 'cos', 'f'], ['tan(', 'tan', 'f'], ['ln(', 'ln', 'f'], ['log(', 'log', 'f'], ['√(', '√', 'f'],
      ['x', 'x', 'f'], ['^', 'xʸ', 'f'], ['(', '(', 'f'], [')', ')', 'f'], ['π', 'π', 'f'], ['e', 'e', 'f'],
      ['7'], ['8'], ['9'], ['⌫', '⌫', 'o'], ['←', '◀', 'o'], ['→', '▶', 'o'],
      ['4'], ['5'], ['6'], ['×', '×', 'o'], ['÷', '÷', 'o'], ['⌨', 'ABC', 'f'],
      ['1'], ['2'], ['3'], ['+', '+', 'o'], ['-', '−', 'o'], [',', ',', 'o'],
      ['0'], ['.'], ['E', 'E', 'f'], ['=', '=', 'o'], ['θ', 'θ', 'f'], ['✓', '완료', 'd'],
    ];
    function build() {
      const kb = $('#kb');
      kb.innerHTML = keys.map(([v, l, c]) => `<button data-k="${esc(v)}" class="${c || ''}">${esc(l || v)}</button>`).join('');
      kb.addEventListener('pointerdown', (e) => e.preventDefault()); // 포커스 유지
      kb.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || !target) return;
        haptic(); press(b.dataset.k);
      });
      document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (el.matches && el.matches('.fx')) { target = el; if (!el.dataset.sys) el.setAttribute('inputmode', 'none'); if (!el.dataset.sys) showKb(); }
      });
      document.addEventListener('focusout', (e) => {
        setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('.fx')) hide(); }, 80);
      });
    }
    function showKb() {
      $('#kb').classList.add('on'); document.body.classList.add('kb-open');
      setTimeout(() => { if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
    }
    function hide() {
      $('#kb').classList.remove('on'); document.body.classList.remove('kb-open');
      if (target) { delete target.dataset.sys; target.setAttribute('inputmode', 'none'); }
    }
    function press(k) {
      const el = target; const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
      const fire = () => el.dispatchEvent(new Event('input', { bubbles: true }));
      if (k === '✓') { el.blur(); hide(); el.dispatchEvent(new Event('change', { bubbles: true })); return; }
      if (k === '⌫') {
        if (s !== e) el.setRangeText('', s, e, 'end');
        else if (s > 0) { el.setRangeText('', s - 1, s, 'end'); }
        fire(); return;
      }
      if (k === '←') { const p = Math.max(0, s - 1); el.setSelectionRange(p, p); return; }
      if (k === '→') { const p = Math.min(el.value.length, e + 1); el.setSelectionRange(p, p); return; }
      if (k === '⌨') { el.dataset.sys = '1'; el.removeAttribute('inputmode'); $('#kb').classList.remove('on'); document.body.classList.remove('kb-open'); el.blur(); setTimeout(() => el.focus(), 30); return; }
      el.setRangeText(k, s, e, 'end'); fire();
    }
    return { build, hide, isOpen: () => $('#kb').classList.contains('on') };
  })();

  /* ───────── 계산기 ───────── */
  const Calc = (() => {
    let pieces = [], cursor = 0, done = false, shift = false, hyp = false;
    let lastValue = null, resultMode = 'dec', lastError = null;
    const P = (d, c = d, k = 'other') => ({ d, c, k });
    const SCI = [
      [{ id: '2nd', l: '2nd', cls: 'toggle' }, { id: 'drg', l: 'DRG' }, { id: 'hyp', l: 'hyp', cls: 'toggle' }, { id: 'left', l: '◀' }, { id: 'right', l: '▶' }, { id: 'pal', l: 'ƒ<sub>(x)</sub>' }],
      [{ id: 'sin', l: 'sin', s: 'sin⁻¹' }, { id: 'cos', l: 'cos', s: 'cos⁻¹' }, { id: 'tan', l: 'tan', s: 'tan⁻¹' }, { id: 'ln', l: 'ln', s: 'eˣ' }, { id: 'log', l: 'log', s: '10ˣ' }, { id: 'sqrt', l: '√', s: '∛' }],
      [{ id: 'sq', l: 'x²', s: 'x³' }, { id: 'pow', l: 'xʸ', s: 'ʸ√x' }, { id: 'inv', l: 'x⁻¹', s: '|x|' }, { id: 'fact', l: 'n!', s: 'Γ' }, { id: 'ncr', l: 'nCr', s: 'nPr' }, { id: 'mod', l: 'mod', s: '%' }],
      [{ id: 'lp', l: '(' }, { id: 'rp', l: ')' }, { id: 'comma', l: ',' }, { id: 'pi', l: 'π', s: 'e' }, { id: 'i', l: 'i', s: '∠' }, { id: 'x', l: 'x', s: '°' }],
      [{ id: 'mc', l: 'MC' }, { id: 'mr', l: 'MR' }, { id: 'mplus', l: 'M+' }, { id: 'mminus', l: 'M−' }, { id: 'sto', l: 'STO', s: 'RCL' }, { id: 'sd', l: 'S⇔D', s: 'DMS' }],
    ];
    const MAIN = [
      [{ id: 'd7', l: '7' }, { id: 'd8', l: '8' }, { id: 'd9', l: '9' }, { id: 'del', l: '⌫', cls: 'op small' }, { id: 'ac', l: 'AC', cls: 'ac' }],
      [{ id: 'd4', l: '4' }, { id: 'd5', l: '5' }, { id: 'd6', l: '6' }, { id: 'mul', l: '×', cls: 'op' }, { id: 'div', l: '÷', cls: 'op' }],
      [{ id: 'd1', l: '1' }, { id: 'd2', l: '2' }, { id: 'd3', l: '3' }, { id: 'add', l: '+', cls: 'op' }, { id: 'sub', l: '−', cls: 'op' }],
      [{ id: 'd0', l: '0' }, { id: 'dot', l: '.' }, { id: 'exp', l: '×10<sup>x</sup>', cls: 'small' }, { id: 'ans', l: 'Ans', s: 'rand', cls: 'small' }, { id: 'eq', l: '=', cls: 'eq' }],
    ];
    const keyHTML = (k) => `<button class="key ${k.cls || ''} ${k.s ? 'has2' : ''}" data-id="${k.id}">${k.s ? `<span class="s">${k.s}</span>` : ''}<span class="l">${k.l}</span></button>`;

    function resolve(id) {
      if (/^d\d$/.test(id)) return P(id[1], id[1], 'num');
      const trig = { sin: 1, cos: 1, tan: 1 };
      if (trig[id]) {
        const name = (shift ? 'a' : '') + id + (hyp ? 'h' : '');
        return P(id + (hyp ? 'h' : '') + (shift ? '⁻¹' : '') + '(', name + '(', 'fn');
      }
      switch (id) {
        case 'dot': return P('.', '.', 'num');
        case 'exp': return P('E', 'E', 'num');
        case 'add': return P('+', '+', 'op');
        case 'sub': return P('−', '-', 'op');
        case 'mul': return P('×', '*', 'op');
        case 'div': return P('÷', '/', 'op');
        case 'ln': return shift ? P('e^(', 'e^(', 'fn') : P('ln(', 'ln(', 'fn');
        case 'log': return shift ? P('10^(', '10^(', 'fn') : P('log(', 'log(', 'fn');
        case 'sqrt': return shift ? P('∛(', 'cbrt(', 'fn') : P('√(', 'sqrt(', 'fn');
        case 'sq': return shift ? P('³', '^3', 'op') : P('²', '^2', 'op');
        case 'pow': return shift ? P('root(', 'root(', 'fn') : P('^', '^', 'op');
        case 'inv': return shift ? P('abs(', 'abs(', 'fn') : P('⁻¹', '^(-1)', 'op');
        case 'fact': return shift ? P('Γ(', 'gamma(', 'fn') : P('!', '!', 'op');
        case 'ncr': return shift ? P('nPr(', 'nPr(', 'fn') : P('nCr(', 'nCr(', 'fn');
        case 'mod': return shift ? P('%', '%', 'op') : P(' mod ', ' mod ', 'op');
        case 'lp': return P('(', '(', 'other');
        case 'rp': return P(')', ')', 'other');
        case 'comma': return P(',', ',', 'op');
        case 'pi': return shift ? P('e', 'e', 'num') : P('π', 'π', 'num');
        case 'i': return shift ? P('∠', '∠', 'op') : P('i', 'i', 'num');
        case 'x': return shift ? P('°', '°', 'op') : P('x', 'x', 'num');
        case 'ans': return shift ? P('rand', 'rand()', 'fn') : P('Ans', 'Ans', 'num');
      }
      return null;
    }
    const startsWithAns = (p) => (p.k === 'op' && p.d !== ',') || ['²', '³', '⁻¹', '!', '%', '°'].includes(p.d);

    function insert(p) {
      if (done) {
        done = false; resultMode = 'dec';
        if (startsWithAns(p) && lastValue) { pieces = [P('Ans', 'Ans', 'num')]; cursor = 1; }
        else { pieces = []; cursor = 0; }
      }
      pieces.splice(cursor, 0, p); cursor++;
      render();
    }
    function insertExternal(d, c) { insert(P(d, c || d, 'fn')); }

    function code() { return pieces.map((p) => p.c).join(''); }
    function evaluateNow() {
      const src = code();
      if (!src.trim()) return;
      try {
        const z = E.evaluate(src);
        lastValue = z; lastError = null; E.globals.Ans = z;
        done = true; resultMode = 'dec';
        const exprText = pieces.map((p) => p.d).join('');
        History.push({ e: exprText, c: src, p: pieces, r: E.fmtCx(z), t: Date.now() });
        render();
      } catch (e) {
        lastError = e instanceof E.CalcError ? e.message : '계산 오류'; done = false;
        render(true);
      }
    }
    function memValue() {
      if (done && lastValue) return lastValue;
      const src = code(); if (!src.trim()) return lastValue || E.C(0);
      return E.evaluate(src);
    }

    function action(id) {
      const wasShift = shift, wasHyp = hyp;
      const clearMods = () => { shift = false; hyp = false; };
      try {
        switch (id) {
          case '2nd': shift = !shift; updateMods(); return;
          case 'hyp': hyp = !hyp; updateMods(); return;
          case 'drg': {
            const order = ['DEG', 'RAD', 'GRAD'];
            settings.angle = order[(order.indexOf(settings.angle) + 1) % 3]; saveSettings(); applySettings();
            if (done && lastValue) { /* 재계산 */ }
            render(); toast('각도 단위: ' + { DEG: '도 (DEG)', RAD: '라디안 (RAD)', GRAD: '그라디안 (GRAD)' }[settings.angle]);
            return;
          }
          case 'left': if (done) { done = false; } cursor = Math.max(0, cursor - 1); render(); return;
          case 'right': if (done) { done = false; } cursor = Math.min(pieces.length, cursor + 1); render(); return;
          case 'pal': Palette.open(); clearMods(); updateMods(); return;
          case 'ac': pieces = []; cursor = 0; done = false; lastError = null; resultMode = 'dec'; clearMods(); updateMods(); render(); return;
          case 'del':
            if (done) { done = false; cursor = pieces.length; render(); return; }
            if (cursor > 0) { pieces.splice(cursor - 1, 1); cursor--; }
            lastError = null; render(); return;
          case 'eq': clearMods(); updateMods(); evaluateNow(); return;
          case 'mc': delete E.globals.M; updateMem(); toast('메모리 지움'); return;
          case 'mr': if (!E.globals.M) { toast('메모리가 비어 있습니다'); return; } insert(P('M', 'M', 'num')); return;
          case 'mplus': case 'mminus': {
            const v = memValue(); const m = E.globals.M || E.C(0);
            E.globals.M = id === 'mplus' ? E.add(m, v) : E.sub(m, v);
            Store.set('mem', { re: E.globals.M.re, im: E.globals.M.im });
            updateMem(); toast('M = ' + fmtC(E.globals.M)); return;
          }
          case 'sto': {
            clearMods(); updateMods();
            if (wasShift) { Vars.recall(); return; }
            let v; try { v = memValue(); } catch (e) { toast(e.message); return; }
            Vars.store(v); return;
          }
          case 'sd': {
            clearMods(); updateMods();
            if (!done || !lastValue || !E.isReal(lastValue)) { toast('결과가 실수일 때 사용할 수 있습니다'); return; }
            if (wasShift) resultMode = resultMode === 'dms' ? 'dec' : 'dms';
            else resultMode = resultMode === 'frac' ? 'mixed' : resultMode === 'mixed' || resultMode === 'dms' ? 'dec' : 'frac';
            if ((resultMode === 'frac' || resultMode === 'mixed') && !E.fracString(lastValue.re)) { resultMode = 'dec'; toast('분수로 나타낼 수 없습니다'); }
            if (resultMode === 'mixed' && Math.abs(lastValue.re) < 1) resultMode = 'dec';
            render(); return;
          }
        }
        const p = resolve(id);
        if (p) { insert(p); clearMods(); updateMods(); }
      } finally { void wasHyp; }
    }

    function updateMods() {
      document.body.classList.toggle('shift', shift);
      $$('#keypad .key[data-id="2nd"]').forEach((k) => k.classList.toggle('on', shift));
      $$('#keypad .key[data-id="hyp"]').forEach((k) => k.classList.toggle('on', hyp));
      $('#stShift').hidden = !shift; $('#stHyp').hidden = !hyp;
      // 2nd/hyp 상태에 따라 삼각함수 라벨 갱신
      ['sin', 'cos', 'tan'].forEach((f) => {
        const k = $(`#keypad .key[data-id="${f}"] .l`);
        if (k) k.innerHTML = f + (hyp ? 'h' : '');
      });
    }
    function updateMem() { $('#stMem').hidden = !E.globals.M; }

    function render(showErr) {
      const exprEl = $('#expr'), resEl = $('#result'), disp = $('#display'), hints = $('#hints');
      disp.classList.toggle('done', done);
      let html = '';
      pieces.forEach((p, i) => {
        if (i === cursor) html += '<span class="caret"></span>';
        html += `<span class="pc ${p.k}" data-i="${i}">${esc(p.d)}</span>`;
      });
      if (cursor === pieces.length) html += '<span class="caret"></span>';
      if (!pieces.length) html = '<span class="caret"></span><span class="ph">0</span>';
      exprEl.innerHTML = html;
      const caret = exprEl.querySelector('.caret'); if (caret && !done) caret.scrollIntoView({ block: 'nearest' });
      resEl.classList.remove('err'); hints.innerHTML = '';
      if (showErr && lastError) { resEl.classList.add('err'); resEl.textContent = lastError; return; }
      if (done && lastValue) {
        resEl.textContent = resultText(lastValue);
        if (E.isReal(lastValue)) {
          const x = lastValue.re;
          const forms = E.exactForms(x);
          if (Math.abs(x) >= 1e4 || (Math.abs(x) < 0.01 && x !== 0)) forms.push({ k: 'SI', v: E.siString(x) });
          hints.innerHTML = forms.slice(0, 3).map((f) => `<span class="hint">${f.k}<b>${esc(E.pretty(f.v))}</b></span>`).join('');
        } else {
          const r = E.cabs(lastValue), th = E.fromRad(E.carg(lastValue));
          hints.innerHTML = `<span class="hint">극형식<b>${esc(fmt(r))}∠${esc(fmt(th))}${settings.angle === 'DEG' ? '°' : ''}</b></span>`;
        }
        return;
      }
      // 실시간 미리보기
      const src = code();
      const onlyNumber = pieces.length && pieces.every((p) => p.k === 'num' && /[0-9.]/.test(p.d));
      if (src.trim() && !onlyNumber) {
        try { const z = E.evaluate(src); resEl.textContent = '= ' + fmtC(z); } catch (e) { resEl.textContent = ''; }
      } else resEl.textContent = '';
      $('#prevLine').textContent = '';
    }
    function resultText(z) {
      if (E.isReal(z)) {
        const x = z.re;
        if (resultMode === 'frac') return E.pretty(E.fracString(x, false));
        if (resultMode === 'mixed') return E.pretty(E.fracString(x, true));
        if (resultMode === 'dms') return E.pretty(E.toDMS(x));
      }
      return fmtC(z);
    }

    function build() {
      const kp = $('#keypad');
      kp.innerHTML = `<div class="sci">${SCI.map((r) => `<div class="krow">${r.map(keyHTML).join('')}</div>`).join('')}</div>
        <div class="main">${MAIN.map((r) => `<div class="krow">${r.map(keyHTML).join('')}</div>`).join('')}</div>`;
      kp.addEventListener('pointerdown', (e) => { const k = e.target.closest('.key'); if (k) { k.classList.add('press'); haptic(); } });
      const unpress = () => $$('#keypad .key.press').forEach((k) => k.classList.remove('press'));
      kp.addEventListener('pointerup', unpress); kp.addEventListener('pointercancel', unpress); kp.addEventListener('pointerleave', unpress);
      kp.addEventListener('click', (e) => { const k = e.target.closest('.key'); if (k) action(k.dataset.id); });
      longPress($('#keypad .key[data-id="del"]'), () => action('ac'));
      $('#expr').addEventListener('click', (e) => {
        const pc = e.target.closest('.pc'); if (!pc) return;
        if (done) done = false;
        const r = pc.getBoundingClientRect(); const i = +pc.dataset.i;
        cursor = e.clientX < r.left + r.width / 2 ? i : i + 1; render();
      });
      longPress($('#result'), () => { if (lastValue && done) copy(E.fmtCx(lastValue)); });
      longPress($('#expr'), () => { const t = pieces.map((p) => p.d).join(''); if (t) copy(t); });
      const m = Store.get('mem', null); if (m) E.globals.M = E.C(m.re, m.im);
      const vars = Store.get('vars', {}); Object.keys(vars).forEach((k) => { E.globals[k] = E.C(vars[k].re, vars[k].im); });
      updateMem(); updateMods(); render();
    }
    function load(item) { // 기록에서 불러오기
      pieces = item.p ? item.p.map((q) => ({ ...q })) : [P(item.e, item.c)];
      cursor = pieces.length; done = false; lastError = null; render();
    }
    function insertValue(label, value) { insert(P(label, `(${value})`, 'num')); }
    return { build, action, load, render, insertExternal, insertValue, P };
  })();

  /* ───────── 함수 팔레트 ───────── */
  const Palette = (() => {
    const G = [
      ['삼각함수', [['sin('], ['cos('], ['tan('], ['cot('], ['sec('], ['csc('], ['sin⁻¹(', 'asin('], ['cos⁻¹(', 'acos('], ['tan⁻¹(', 'atan('], ['cot⁻¹(', 'acot('], ['sec⁻¹(', 'asec('], ['csc⁻¹(', 'acsc('], ['atan2(', 'atan2(', 'y, x']]],
      ['쌍곡선함수', [['sinh('], ['cosh('], ['tanh('], ['coth('], ['sech('], ['csch('], ['sinh⁻¹(', 'asinh('], ['cosh⁻¹(', 'acosh('], ['tanh⁻¹(', 'atanh(']]],
      ['지수 · 로그', [['exp('], ['ln('], ['log('], ['log₂(', 'log2('], ['logₐ(', 'log(', 'x, 밑'], ['10^('], ['e^('], ['√(', 'sqrt('], ['∛(', 'cbrt('], ['root(', 'root(', 'x, n']]],
      ['미적분 · 급수', [['∫(', 'integ(', 'f(x), a, b'], ['d/dx(', 'deriv(', 'f(x), a'], ['Σ(', 'sum(', 'f(x), a, b'], ['Π(', 'prod(', 'f(x), a, b'], ['x', 'x', '변수']]],
      ['정수 · 수론', [['abs('], ['floor('], ['ceil('], ['round(', 'round(', 'x, 자리'], ['trunc('], ['frac('], ['sign('], ['gcd('], ['lcm('], ['mod(', 'mod(', 'a, b'], ['isprime(']]],
      ['조합 · 확률', [['nCr('], ['nPr('], ['!', '!', '계승'], ['Γ(', 'gamma('], ['lnΓ(', 'lgamma('], ['rand', 'rand()'], ['randint(', 'randint(', 'a, b'], ['erf('], ['erfc('], ['normcdf(', 'normcdf(', 'x, μ, σ'], ['normpdf(', 'normpdf(', 'x, μ, σ'], ['invnorm(', 'invnorm(', 'p, μ, σ']]],
      ['통계', [['mean('], ['median('], ['stdev('], ['stdevp('], ['min('], ['max('], ['total(', 'total(', '합계'], ['hypot(']]],
      ['복소수', [['i'], ['∠'], ['re('], ['im('], ['arg('], ['conj('], ['abs(', 'abs(', '크기']]],
      ['상수 · 각도', [['π'], ['e'], ['φ', 'phi', '황금비'], ['τ', 'tau', '2π'], ['°', '°', '도 입력'], ['deg(', 'deg(', 'rad→deg'], ['rad(', 'rad(', 'deg→rad'], ['Ans']]],
    ];
    function open() {
      const html = G.map(([g, items], gi) => `<div class="pgroup"><h4>${g}</h4><div class="pgrid">${items.map((it, ii) => `<button data-g="${gi}" data-i="${ii}">${esc(it[0].replace(/\($/, ''))}${it[2] ? `<small>${esc(it[2])}</small>` : ''}</button>`).join('')}</div></div>`).join('')
        + '<p class="note">∫, d/dx, Σ, Π 안에서는 <b>x</b> 를 변수로 사용합니다. 예: ∫(x², 0, 3) = 9, Σ(x, 1, 100) = 5050</p>';
      openSheet('함수', html, (b) => b.addEventListener('click', (e) => {
        const t = e.target.closest('button[data-g]'); if (!t) return;
        const it = G[+t.dataset.g][1][+t.dataset.i];
        haptic(); closeSheet(); show('calc');
        Calc.insertExternal(it[0], it[1] || it[0]);
      }));
    }
    return { open };
  })();

  /* ───────── 변수 STO / RCL ───────── */
  const Vars = (() => {
    const names = ['A', 'B', 'C', 'D', 'X', 'Y'];
    const save = () => { const o = {}; names.forEach((n) => { if (E.globals[n]) o[n] = { re: E.globals[n].re, im: E.globals[n].im }; }); Store.set('vars', o); };
    const grid = () => `<div class="pgrid">${names.map((n) => `<button data-n="${n}"><span class="sym">${n}</span><small>${E.globals[n] ? esc(fmtC(E.globals[n])) : '비어 있음'}</small></button>`).join('')}</div>`;
    function store(v) {
      openSheet('저장할 변수 선택  ·  ' + fmtC(v), grid(), (b) => b.addEventListener('click', (e) => {
        const t = e.target.closest('button[data-n]'); if (!t) return;
        E.globals[t.dataset.n] = v; save(); closeSheet(); toast(`${t.dataset.n} ← ${fmtC(v)}`);
      }));
    }
    function recall() {
      openSheet('불러올 변수', grid() + '<p class="note">변수는 수식 안에서 A, B, C, D, X, Y 로 직접 사용할 수 있습니다.</p>', (b) => b.addEventListener('click', (e) => {
        const t = e.target.closest('button[data-n]'); if (!t) return;
        closeSheet(); Calc.insertExternal(t.dataset.n, t.dataset.n);
      }));
    }
    return { store, recall, names };
  })();

  /* ───────── 기록 ───────── */
  const History = (() => {
    let items = Store.get('history', []);
    function push(it) { items.unshift(it); if (items.length > 300) items.length = 300; Store.set('history', items); }
    return { push, all: () => items, clear() { items = []; Store.set('history', items); }, remove(i) { items.splice(i, 1); Store.set('history', items); } };
  })();

  register({ id: 'calc', name: '계산', glyph: '±', init() { Calc.build(); }, show() { Calc.render(); } });

  function back() {
    if (sheetClose) { closeSheet(); return true; }
    if (KB.isOpen()) { if (document.activeElement) document.activeElement.blur(); KB.hide(); return true; }
    if (current !== 'calc') { show('calc'); return true; }
    return false;
  }

  function start() {
    applySettings();
    buildNav(); KB.build();
    $('#scrim').addEventListener('click', closeSheet);
    show(settings.view && views.find((v) => v.id === settings.view) ? settings.view : 'calc');
    if (!views.find((v) => v.id === 'calc').inited) { const v = views[0]; v.init($('#v-calc')); v.inited = true; }
  }

  window.App = { start, register, show, back, toast, copy, haptic, openSheet, closeSheet, Store, settings, saveSettings, applySettings, Calc, History, fmt, fmtC, esc, $, $$, longPress, fmtHTML };
})();
