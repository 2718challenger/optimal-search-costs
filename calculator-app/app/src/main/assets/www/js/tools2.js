/* 도구 2: 진법(프로그래머), 단위 변환, 물리 상수, 공학 도구, 기록, 설정 */
'use strict';
(function () {
  const E = window.Engine, A = window.App;
  const { $, $$, esc } = A;
  const { field, seg, segs, panes, persist, errHTML, val, attrs } = window.ToolsUtil;
  const f = (x) => A.fmt(x);
  const si = (x, u) => E.pretty(E.siString(x, u));

  /* ═════════ 진법 / 프로그래머 ═════════ */
  A.register({
    id: 'prog', name: '진법', glyph: '0x',
    init(root) {
      const st = Object.assign({ bits: 32, signed: true, base: 'DEC', toks: [] }, A.Store.get('prog', {}));
      const BASES = { HEX: 16, DEC: 10, OCT: 8, BIN: 2 };
      const save = () => A.Store.set('prog', st);
      const KEYS = [
        ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'], ['F', 'F'],
        ['AND', 'AND', 'f'], ['OR', 'OR', 'f'], ['XOR', 'XOR', 'f'], ['NOT', 'NOT', 'f'], ['<<', '≪', 'f'], ['>>', '≫', 'f'],
        ['7', '7'], ['8', '8'], ['9', '9'], ['(', '(', 'f'], [')', ')', 'f'], ['DEL', '⌫', 'o'],
        ['4', '4'], ['5', '5'], ['6', '6'], ['*', '×', 'o'], ['/', '÷', 'o'], ['AC', 'AC', 'o'],
        ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'o'], ['-', '−', 'o'], ['MOD', 'MOD', 'o'],
        ['ROL', 'ROL', 'f'], ['ROR', 'ROR', 'f'], ['0', '0'], ['NAND', 'NAND', 'f'], ['NOR', 'NOR', 'f'], ['=', '=', 'eq'],
      ];
      root.innerHTML = `<div class="scroll" style="padding-top:2px">
        <div class="card" style="padding:10px 10px 8px">
          <div class="prog-expr" id="pexpr"></div>
          <div class="base-list" id="pbases"></div>
          <div class="bits" id="pbits"></div>
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            ${seg('pw', [['8', '8비트'], ['16', '16'], ['32', '32'], ['64', '64']], String(st.bits))}
          </div>
          <div class="row" style="justify-content:space-between;margin:-2px 2px 10px"><span style="font-size:13px;color:var(--text-2)">부호 있는 정수 (2의 보수)</span><button class="switch ${st.signed ? 'on' : ''}" id="psigned"></button></div>
          <div class="prog-keys" id="pkeys">${KEYS.map(([k, l, c]) => `<button data-k="${k}" class="${c || ''}">${l}</button>`).join('')}</div>
          <p class="note">기준 진법을 탭해서 바꿀 수 있습니다. 비트를 탭하면 해당 비트가 반전됩니다. ROL/ROR은 현재 값을 1비트 회전합니다.</p>
        </div></div>`;
      const W = () => BigInt(st.bits), MASK = () => (1n << W()) - 1n;
      const norm = (v) => v & MASK();
      const signed = (v) => (st.signed && (v >> (W() - 1n)) & 1n ? v - (1n << W()) : v);
      const isNum = (t) => /^[0-9A-F]+$/.test(t);
      function toStr(v, b) {
        if (b === 10) return signed(v).toString(10);
        let s = v.toString(b).toUpperCase();
        if (b === 2) { s = s.padStart(Math.min(st.bits, Math.ceil(s.length / 4) * 4), '0'); s = s.replace(/\B(?=(\d{4})+(?!\d))/g, ' '); }
        if (b === 16) s = s.replace(/\B(?=([0-9A-F]{4})+(?![0-9A-F]))/g, ' ');
        return s;
      }
      function evalToks() {
        const toks = st.toks.slice(); let p = 0;
        const base = BigInt(BASES[st.base]);
        const num = (s) => { let v = 0n; for (const ch of s) { const d = BigInt(parseInt(ch, 16)); if (d >= base) throw new Error(`${st.base}에서 쓸 수 없는 숫자: ${ch}`); v = v * base + d; } return v; };
        const peek = () => toks[p];
        const prec = { OR: 1, NOR: 1, XOR: 2, AND: 3, NAND: 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, MOD: 6 };
        function unary() {
          const t = toks[p];
          if (t === 'NOT') { p++; return norm(~unary()); }
          if (t === '-') { p++; return norm(-unary()); }
          if (t === '(') { p++; const v = binary(0); if (toks[p] === ')') p++; return v; }
          if (t && isNum(t)) { p++; return norm(num(t)); }
          throw new Error(t ? '구문 오류' : '식이 완성되지 않았습니다');
        }
        function binary(minP) {
          let a = unary();
          while (peek() && prec[peek()] !== undefined && prec[peek()] > minP) {
            const op = toks[p++]; const b = binary(prec[op]);
            const sa = signed(a), sb = signed(b);
            switch (op) {
              case '+': a = norm(a + b); break;
              case '-': a = norm(a - b); break;
              case '*': a = norm(a * b); break;
              case '/': if (b === 0n) throw new Error('0으로 나눌 수 없습니다'); a = norm(st.signed ? sa / sb : a / b); break;
              case 'MOD': if (b === 0n) throw new Error('0으로 나눌 수 없습니다'); a = norm(st.signed ? sa % sb : a % b); break;
              case 'AND': a = a & b; break;
              case 'OR': a = a | b; break;
              case 'XOR': a = a ^ b; break;
              case 'NAND': a = norm(~(a & b)); break;
              case 'NOR': a = norm(~(a | b)); break;
              case '<<': a = norm(a << (b % W())); break;
              case '>>': a = st.signed ? norm(sa >> (b % W())) : a >> (b % W()); break;
            }
          }
          return a;
        }
        if (!toks.length) return 0n;
        const v = binary(0);
        if (p < toks.length && toks[p] !== ')') throw new Error('구문 오류');
        return v;
      }
      let value = 0n, err = null;
      function render() {
        try { value = evalToks(); err = null; } catch (e) { err = e.message; }
        const disp = { '*': '×', '/': '÷', '-': '−', '<<': '≪', '>>': '≫' };
        $('#pexpr').innerHTML = st.toks.length ? esc(st.toks.map((t) => disp[t] || t).join(' ')) + (err ? ` <span style="color:var(--warn);font-size:12px">· ${esc(err)}</span>` : '') : '<span style="color:var(--text-4)">0</span>';
        $('#pbases').innerHTML = Object.entries(BASES).map(([k, b]) => `<div class="base-row ${k === st.base ? 'on' : ''}" data-b="${k}"><span class="b">${k}</span><span class="v">${esc(toStr(value, b))}</span></div>`).join('');
        let h = '';
        for (let nib = 15; nib >= 0; nib--) {
          h += '<div class="nib"><div class="bb">';
          for (let b = 3; b >= 0; b--) { const bit = nib * 4 + b; const on = (value >> BigInt(bit)) & 1n; h += `<button data-bit="${bit}" class="${on ? 'one' : ''} ${bit >= st.bits ? 'dis' : ''}">${on}</button>`; }
          h += `</div><small>${nib * 4}</small></div>`;
        }
        $('#pbits').innerHTML = h;
        const bv = BASES[st.base];
        $$('#pkeys button').forEach((b) => { const k = b.dataset.k; if (/^[0-9A-F]$/.test(k)) b.disabled = parseInt(k, 16) >= bv; });
        save();
      }
      const setValue = (v) => { st.toks = [toStr(norm(v), BASES[st.base]).replace(/ /g, '')]; if (st.base === 'DEC') { const s = signed(norm(v)); st.toks = s < 0n ? ['-', (-s).toString()] : [s.toString()]; } };
      root.addEventListener('click', (e) => {
        const br = e.target.closest('[data-b]');
        if (br) { A.haptic(); const v = value; st.base = br.dataset.b; setValue(v); render(); return; }
        const bt = e.target.closest('[data-bit]');
        if (bt) { const bit = +bt.dataset.bit; if (bit >= st.bits) return; A.haptic(); setValue(value ^ (1n << BigInt(bit))); render(); return; }
        if (e.target.id === 'psigned') { st.signed = !st.signed; e.target.classList.toggle('on', st.signed); const v = value; setValue(v); render(); return; }
        const kb = e.target.closest('#pkeys button'); if (!kb) return;
        A.haptic();
        const k = kb.dataset.k, toks = st.toks, last = toks[toks.length - 1];
        if (/^[0-9A-F]$/.test(k)) { if (last && isNum(last)) toks[toks.length - 1] = (last === '0' ? '' : last) + k; else toks.push(k); }
        else if (k === 'DEL') { if (last && isNum(last) && last.length > 1) toks[toks.length - 1] = last.slice(0, -1); else toks.pop(); }
        else if (k === 'AC') st.toks = [];
        else if (k === '=') { if (!err) setValue(value); }
        else if (k === 'ROL' || k === 'ROR') { const w = W(); const v = value; const r = k === 'ROL' ? ((v << 1n) | (v >> (w - 1n))) : ((v >> 1n) | ((v & 1n) << (w - 1n))); setValue(norm(r)); }
        else toks.push(k);
        render();
      });
      segs(root, (n, k) => { const v = value; st.bits = +k; setValue(v); render(); });
      render();
    },
  });

  /* ═════════ 단위 변환 ═════════ */
  const U = {
    '길이': [['나노미터', 'nm', 1e-9], ['마이크로미터', 'µm', 1e-6], ['밀리미터', 'mm', 1e-3], ['센티미터', 'cm', 1e-2], ['미터', 'm', 1], ['킬로미터', 'km', 1e3], ['인치', 'in', 0.0254], ['피트', 'ft', 0.3048], ['야드', 'yd', 0.9144], ['마일', 'mi', 1609.344], ['해리', 'nmi', 1852], ['옹스트롬', 'Å', 1e-10], ['자(尺)', '자', 10 / 33], ['리(里)', '리', 400], ['천문단위', 'AU', 1.495978707e11], ['광년', 'ly', 9.4607304725808e15], ['파섹', 'pc', 3.0856775814913673e16]],
    '넓이': [['제곱밀리미터', 'mm²', 1e-6], ['제곱센티미터', 'cm²', 1e-4], ['제곱미터', 'm²', 1], ['아르', 'a', 100], ['헥타르', 'ha', 1e4], ['제곱킬로미터', 'km²', 1e6], ['평', '평', 400 / 121], ['제곱인치', 'in²', 6.4516e-4], ['제곱피트', 'ft²', 0.09290304], ['제곱야드', 'yd²', 0.83612736], ['에이커', 'ac', 4046.8564224], ['제곱마일', 'mi²', 2589988.110336]],
    '부피': [['밀리리터', 'mL', 1e-6], ['리터', 'L', 1e-3], ['세제곱미터', 'm³', 1], ['세제곱센티미터', 'cm³', 1e-6], ['미국 갤런', 'gal', 3.785411784e-3], ['영국 갤런', 'imp gal', 4.54609e-3], ['쿼트', 'qt', 9.46352946e-4], ['파인트', 'pt', 4.73176473e-4], ['컵', 'cup', 2.365882365e-4], ['액량 온스', 'fl oz', 2.95735295625e-5], ['큰술', 'tbsp', 1.478676478125e-5], ['작은술', 'tsp', 4.92892159375e-6], ['세제곱피트', 'ft³', 0.028316846592], ['세제곱인치', 'in³', 1.6387064e-5], ['배럴(석유)', 'bbl', 0.158987294928], ['되', '되', 1.8039e-3]],
    '질량': [['밀리그램', 'mg', 1e-6], ['그램', 'g', 1e-3], ['킬로그램', 'kg', 1], ['톤', 't', 1e3], ['온스', 'oz', 0.028349523125], ['파운드', 'lb', 0.45359237], ['스톤', 'st', 6.35029318], ['미국 톤', 'short ton', 907.18474], ['영국 톤', 'long ton', 1016.0469088], ['캐럿', 'ct', 2e-4], ['그레인', 'gr', 6.479891e-5], ['근', '근', 0.6], ['돈', '돈', 3.75e-3], ['원자질량단위', 'u', 1.66053906660e-27]],
    '시간': [['나노초', 'ns', 1e-9], ['마이크로초', 'µs', 1e-6], ['밀리초', 'ms', 1e-3], ['초', 's', 1], ['분', 'min', 60], ['시간', 'h', 3600], ['일', 'd', 86400], ['주', 'wk', 604800], ['월(평균)', 'mo', 2629746], ['년(그레고리력)', 'yr', 31556952]],
    '속도': [['미터/초', 'm/s', 1], ['킬로미터/시', 'km/h', 1 / 3.6], ['마일/시', 'mph', 0.44704], ['노트', 'kn', 1852 / 3600], ['피트/초', 'ft/s', 0.3048], ['마하(15°C)', 'Ma', 340.29], ['광속', 'c', 299792458]],
    '온도': [['섭씨', '°C', (x) => x + 273.15, (k) => k - 273.15], ['화씨', '°F', (x) => (x - 32) * 5 / 9 + 273.15, (k) => (k - 273.15) * 9 / 5 + 32], ['켈빈', 'K', (x) => x, (k) => k], ['랭킨', '°R', (x) => x * 5 / 9, (k) => k * 9 / 5]],
    '압력': [['파스칼', 'Pa', 1], ['헥토파스칼', 'hPa', 100], ['킬로파스칼', 'kPa', 1e3], ['메가파스칼', 'MPa', 1e6], ['바', 'bar', 1e5], ['밀리바', 'mbar', 100], ['기압', 'atm', 101325], ['토르', 'Torr', 101325 / 760], ['수은주 밀리미터', 'mmHg', 133.322387415], ['수은주 인치', 'inHg', 3386.389], ['psi', 'psi', 6894.757293168], ['kgf/cm²', 'kgf/cm²', 98066.5]],
    '에너지': [['줄', 'J', 1], ['킬로줄', 'kJ', 1e3], ['메가줄', 'MJ', 1e6], ['칼로리', 'cal', 4.184], ['킬로칼로리', 'kcal', 4184], ['와트시', 'Wh', 3600], ['킬로와트시', 'kWh', 3.6e6], ['전자볼트', 'eV', 1.602176634e-19], ['BTU', 'BTU', 1055.05585262], ['피트파운드', 'ft·lbf', 1.3558179483314004], ['에르그', 'erg', 1e-7]],
    '일률': [['와트', 'W', 1], ['밀리와트', 'mW', 1e-3], ['킬로와트', 'kW', 1e3], ['메가와트', 'MW', 1e6], ['마력(영)', 'hp', 745.69987158227022], ['마력(미터)', 'PS', 735.49875], ['BTU/시', 'BTU/h', 0.29307107017], ['kcal/시', 'kcal/h', 1.163]],
    '힘': [['뉴턴', 'N', 1], ['킬로뉴턴', 'kN', 1e3], ['다인', 'dyn', 1e-5], ['킬로그램힘', 'kgf', 9.80665], ['파운드힘', 'lbf', 4.4482216152605], ['온스힘', 'ozf', 0.27801385095378125]],
    '토크': [['뉴턴미터', 'N·m', 1], ['kgf·m', 'kgf·m', 9.80665], ['kgf·cm', 'kgf·cm', 0.0980665], ['lbf·ft', 'lbf·ft', 1.3558179483314004], ['lbf·in', 'lbf·in', 0.1129848290276167]],
    '각도': [['도', '°', Math.PI / 180], ['라디안', 'rad', 1], ['그라디안', 'grad', Math.PI / 200], ['분(각)', '′', Math.PI / 10800], ['초(각)', '″', Math.PI / 648000], ['회전', 'rev', 2 * Math.PI], ['밀리라디안', 'mrad', 1e-3]],
    '주파수': [['헤르츠', 'Hz', 1], ['킬로헤르츠', 'kHz', 1e3], ['메가헤르츠', 'MHz', 1e6], ['기가헤르츠', 'GHz', 1e9], ['분당 회전수', 'rpm', 1 / 60], ['각속도', 'rad/s', 1 / (2 * Math.PI)]],
    '데이터': [['비트', 'bit', 1], ['바이트', 'B', 8], ['킬로바이트', 'kB', 8e3], ['메가바이트', 'MB', 8e6], ['기가바이트', 'GB', 8e9], ['테라바이트', 'TB', 8e12], ['키비바이트', 'KiB', 8192], ['메비바이트', 'MiB', 8 * 1024 ** 2], ['기비바이트', 'GiB', 8 * 1024 ** 3], ['테비바이트', 'TiB', 8 * 1024 ** 4]],
    '연비': [['km/L', 'km/L', 1], ['L/100km', 'L/100km', (x) => 100 / x, (b) => 100 / b], ['mpg (미국)', 'mpg US', 0.425143707], ['mpg (영국)', 'mpg UK', 0.35400619]],
  };
  const toBase = (u, x) => (typeof u[2] === 'function' ? u[2](x) : x * u[2]);
  const fromBase = (u, b) => (typeof u[2] === 'function' ? u[3](b) : b / u[2]);
  A.register({
    id: 'units', name: '단위', glyph: '⇄',
    init(root) {
      const st = Object.assign({ cat: '길이', from: 4, to: 7 }, A.Store.get('units', {}));
      root.innerHTML = `<div class="scroll">${seg('uc', Object.keys(U).map((k) => [k, k]), st.cat)}
        <div class="card">
          ${field('uv', '값', '1')}
          <div class="row" style="align-items:flex-end"><div class="field" style="flex:1"><label>변환 전</label><select class="inp" id="uf"></select></div>
          <button class="btn" id="uswap" style="margin-bottom:10px;padding:0 12px">⇄</button>
          <div class="field" style="flex:1"><label>변환 후</label><select class="inp" id="ut"></select></div></div>
          <div class="out" id="uout"></div>
        </div>
        <div class="card"><h2>전체 변환표</h2><div id="ulist"></div></div></div>`;
      persist(root);
      const save = () => A.Store.set('units', st);
      function opts() {
        const list = U[st.cat];
        if (st.from >= list.length) st.from = 0; if (st.to >= list.length) st.to = Math.min(1, list.length - 1);
        const o = list.map((u, i) => `<option value="${i}">${esc(u[0])} (${esc(u[1])})</option>`).join('');
        $('#uf').innerHTML = o; $('#ut').innerHTML = o; $('#uf').value = st.from; $('#ut').value = st.to;
      }
      function calc() {
        const list = U[st.cat], out = $('#uout');
        try {
          const x = val('uv'); const b = toBase(list[st.from], x); const y = fromBase(list[st.to], b);
          out.innerHTML = `<div class="lbl">${esc(f(x))} ${esc(list[st.from][1])} =</div><div class="big">${esc(f(y))} <span style="font-size:16px;color:var(--text-3)">${esc(list[st.to][1])}</span></div>`;
          $('#ulist').innerHTML = list.map((u, i) => `<div class="list-item" data-u="${i}"><div class="main"><div class="t">${esc(u[0])}</div><div class="d">${esc(u[1])}</div></div><div class="v">${esc(f(fromBase(u, b)))}</div></div>`).join('');
        } catch (e) { out.innerHTML = errHTML(e); }
        save();
      }
      opts(); calc();
      segs(root, (n, k) => { st.cat = k; st.from = 0; st.to = 1; opts(); calc(); });
      root.addEventListener('change', (e) => { if (e.target.id === 'uf') st.from = +e.target.value; if (e.target.id === 'ut') st.to = +e.target.value; calc(); });
      root.addEventListener('input', (e) => { if (e.target.id === 'uv') calc(); });
      root.addEventListener('click', (e) => {
        if (e.target.id === 'uswap') { A.haptic(); [st.from, st.to] = [st.to, st.from]; opts(); calc(); }
        const it = e.target.closest('[data-u]'); if (it) { st.to = +it.dataset.u; opts(); calc(); $('#uout').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      });
    },
  });

  /* ═════════ 물리 상수 ═════════ */
  const K = [
    ['기본 상수', [['c', '진공 중 광속', 299792458, 'm/s'], ['G', '만유인력 상수', 6.67430e-11, 'm³/(kg·s²)'], ['h', '플랑크 상수', 6.62607015e-34, 'J·s'], ['ħ', '디랙 상수 h/2π', 1.054571817e-34, 'J·s'], ['g', '표준 중력가속도', 9.80665, 'm/s²']]],
    ['전자기', [['e', '기본 전하', 1.602176634e-19, 'C'], ['ε₀', '진공 유전율', 8.8541878128e-12, 'F/m'], ['μ₀', '진공 투자율', 1.25663706212e-6, 'N/A²'], ['kₑ', '쿨롱 상수', 8.9875517923e9, 'N·m²/C²'], ['Z₀', '자유공간 임피던스', 376.730313668, 'Ω'], ['Φ₀', '자속 양자', 2.067833848e-15, 'Wb'], ['G₀', '컨덕턴스 양자', 7.748091729e-5, 'S'], ['K_J', '조지프슨 상수', 483597.8484e9, 'Hz/V'], ['R_K', '폰 클리칭 상수', 25812.80745, 'Ω']]],
    ['원자 · 핵', [['mₑ', '전자 질량', 9.1093837015e-31, 'kg'], ['mₚ', '양성자 질량', 1.67262192369e-27, 'kg'], ['mₙ', '중성자 질량', 1.67492749804e-27, 'kg'], ['u', '원자질량단위', 1.66053906660e-27, 'kg'], ['α', '미세구조 상수', 7.2973525693e-3, ''], ['R∞', '리드베리 상수', 10973731.568160, '1/m'], ['a₀', '보어 반지름', 5.29177210903e-11, 'm'], ['rₑ', '고전 전자 반지름', 2.8179403262e-15, 'm'], ['μ_B', '보어 마그네톤', 9.2740100783e-24, 'J/T'], ['μ_N', '핵 마그네톤', 5.0507837461e-27, 'J/T'], ['λ_C', '콤프턴 파장', 2.42631023867e-12, 'm']]],
    ['물리화학', [['N_A', '아보가드로 수', 6.02214076e23, '1/mol'], ['k_B', '볼츠만 상수', 1.380649e-23, 'J/K'], ['R', '기체 상수', 8.314462618, 'J/(mol·K)'], ['F', '패러데이 상수', 96485.33212, 'C/mol'], ['σ', '슈테판–볼츠만 상수', 5.670374419e-8, 'W/(m²·K⁴)'], ['b', '빈 변위 상수', 2.897771955e-3, 'm·K'], ['V_m', '이상기체 몰부피 (0°C, 1atm)', 22.41396954e-3, 'm³/mol'], ['atm', '표준 대기압', 101325, 'Pa'], ['T₀', '0°C 절대온도', 273.15, 'K']]],
    ['천문 · 지구', [['M⊕', '지구 질량', 5.9722e24, 'kg'], ['R⊕', '지구 평균 반지름', 6.371e6, 'm'], ['M☉', '태양 질량', 1.98847e30, 'kg'], ['R☉', '태양 반지름', 6.957e8, 'm'], ['AU', '천문단위', 1.495978707e11, 'm'], ['ly', '광년', 9.4607304725808e15, 'm'], ['pc', '파섹', 3.0856775814913673e16, 'm']]],
    ['수학', [['π', '원주율', Math.PI, ''], ['e', '자연로그의 밑', Math.E, ''], ['φ', '황금비', (1 + Math.sqrt(5)) / 2, ''], ['γ', '오일러–마스케로니 상수', 0.5772156649015329, ''], ['√2', '2의 제곱근', Math.SQRT2, ''], ['ln 2', '2의 자연로그', Math.LN2, ''], ['G', '카탈랑 상수', 0.915965594177219, '']]],
  ];
  A.register({
    id: 'const', name: '상수', glyph: 'ħ',
    init(root) {
      root.innerHTML = `<div class="scroll"><div class="field"><input class="inp" id="kq" placeholder="검색 (이름 또는 기호)" ${attrs}></div><div id="klist"></div>
        <p class="note">CODATA 2018 권장값. 항목을 탭하면 계산기에 기호로 입력되며, 길게 누르면 값을 복사합니다.</p></div>`;
      function render(q = '') {
        q = q.trim().toLowerCase();
        $('#klist').innerHTML = K.map(([g, items], gi) => {
          const rows = items.map((it, ii) => ({ it, ii })).filter(({ it }) => !q || it[0].toLowerCase().includes(q) || it[1].includes(q));
          if (!rows.length) return '';
          return `<div class="card"><h2>${g}</h2>${rows.map(({ it, ii }) => `<div class="list-item" data-g="${gi}" data-i="${ii}"><div class="main"><div class="t"><span class="sym">${esc(it[0])}</span> · ${esc(it[1])}</div><div class="d">${esc(it[3])}</div></div><div class="v">${esc(E.pretty(E.fmtReal(it[2], { mode: 'NORM' })))}</div></div>`).join('')}</div>`;
        }).join('') || '<div class="empty">검색 결과가 없습니다</div>';
        $$('#klist .list-item').forEach((row) => A.longPress(row, () => { const it = K[+row.dataset.g][1][+row.dataset.i]; A.copy(E.fmtReal(it[2], { mode: 'NORM' })); }));
      }
      render();
      $('#kq').addEventListener('input', (e) => render(e.target.value));
      root.addEventListener('click', (e) => {
        const r = e.target.closest('.list-item'); if (!r) return;
        const it = K[+r.dataset.g][1][+r.dataset.i];
        A.haptic(); A.show('calc'); A.Calc.insertValue(it[0], E.fmtReal(it[2], { mode: 'NORM' }));
        A.toast(`${it[0]} = ${E.pretty(E.fmtReal(it[2], { mode: 'NORM' }))} ${it[3]}`);
      });
    },
  });

  /* ═════════ 공학 도구 ═════════ */
  const COLORS = [['검정', '#1b1b1b', 0], ['갈색', '#7a4a26', 1], ['빨강', '#c8352e', 2], ['주황', '#e0782a', 3], ['노랑', '#e3c437', 4], ['초록', '#3f8f4a', 5], ['파랑', '#3567b5', 6], ['보라', '#7b4fa6', 7], ['회색', '#8d8f93', 8], ['흰색', '#f1f1f1', 9], ['금색', '#c9a13b', -1], ['은색', '#c4c6c9', -2]];
  const TOL = { 1: '±1%', 2: '±2%', 5: '±0.5%', 6: '±0.25%', 7: '±0.1%', 8: '±0.05%', 10: '±5%', 11: '±10%' };
  const ESER = {
    E12: [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82],
    E24: [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91],
    E96: [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976],
  };
  function nearestE(x, ser) {
    if (!(x > 0)) return NaN;
    const list = ESER[ser]; const dec = Math.floor(Math.log10(x)) - (ser === 'E96' ? 2 : 1);
    let best = null;
    for (const d of [dec - 1, dec, dec + 1]) for (const v of list) { const c = v * Math.pow(10, d); if (!best || Math.abs(Math.log(c / x)) < Math.abs(Math.log(best / x))) best = c; }
    return Number(best.toPrecision(3));
  }
  A.register({
    id: 'eng', name: '공학', glyph: 'Ω',
    init(root) {
      root.innerHTML = `<div class="scroll">
        ${seg('eg', [['ohm', '옴의 법칙'], ['res', '저항 색띠'], ['comb', '합성'], ['div', '전압 분배'], ['rlc', 'RLC'], ['db', '데시벨'], ['tri', '삼각형'], ['num', '정수론']], 'ohm')}
        <div data-pane-eg="ohm"><div class="card"><h2>옴의 법칙 · 전력 — 두 값을 입력</h2>
          <div class="grid2">${field('ov', '전압 V (볼트)', '12')}${field('oi', '전류 I (암페어)', '')}${field('or', '저항 R (옴)', '220')}${field('op', '전력 P (와트)', '')}</div>
          <button class="btn primary block" data-go="ohm">계산</button><div class="out" id="oout"></div></div></div>
        <div data-pane-eg="res" hidden><div class="card"><h2>저항 색띠 해독<span class="sp"></span></h2>
          ${seg('rb', [['4', '4색띠'], ['5', '5색띠'], ['6', '6색띠']], '4')}
          <div class="resistor" id="rsvg"></div><div class="bands" id="rbands"></div><div class="out" id="rout"></div></div>
          <div class="card"><h2>표준 저항값 찾기</h2>${field('rq', '원하는 저항값 (Ω, 예: 4.7k → 4700)', '4700')}<div class="out" id="rqout"></div></div></div>
        <div data-pane-eg="comb" hidden><div class="card"><h2>직렬 · 병렬 합성</h2>
          <div class="field"><label>값 목록 (쉼표 구분)</label><textarea class="inp fx" id="cl" style="height:64px" ${attrs}>100, 220, 470</textarea></div>
          <div class="out" id="cout"></div></div></div>
        <div data-pane-eg="div" hidden><div class="card"><h2>전압 분배기  Vout = Vin·R2/(R1+R2)</h2>
          <div class="grid3">${field('dvin', 'Vin (V)', '5')}${field('dr1', 'R1 (Ω)', '10000')}${field('dr2', 'R2 (Ω)', '4700')}</div>
          <div class="out" id="dvout"></div>
          <div class="grid2" style="margin-top:10px">${field('dvt', '목표 Vout (V) → R2 계산', '3.3')}<div class="field"><label>필요한 R2</label><div class="inp" id="dvr2" style="display:flex;align-items:center"></div></div></div></div></div>
        <div data-pane-eg="rlc" hidden><div class="card"><h2>RLC 회로</h2>
          <div class="grid2">${field('lr', 'R (Ω)', '100')}${field('ll', 'L (H)', '0.01')}${field('lc', 'C (F)', '1E-6')}${field('lf', '주파수 f (Hz)', '1000')}</div>
          <div class="out" id="lout"></div></div></div>
        <div data-pane-eg="db" hidden><div class="card"><h2>데시벨 변환</h2>
          <div class="grid2">${field('dbp', '전력비 P₂/P₁', '2')}${field('dbv', '전압비 V₂/V₁', '2')}${field('dbx', 'dB 값', '3')}${field('dbm', 'dBm', '0')}</div>
          <div class="out" id="dbout"></div></div></div>
        <div data-pane-eg="tri" hidden><div class="card"><h2>삼각형 풀이 — 세 값 입력 (각은 도)</h2>
          <div class="grid3">${field('ta', '변 a', '3')}${field('tb', '변 b', '4')}${field('tc', '변 c', '5')}${field('tA', '각 A', '')}${field('tB', '각 B', '')}${field('tC', '각 C', '')}</div>
          <button class="btn primary block" data-go="tri">풀기</button><div class="out" id="trout"></div></div></div>
        <div data-pane-eg="num" hidden><div class="card"><h2>소인수분해 · 약수</h2>${field('nn', '정수 n', '360')}<div class="out" id="nout"></div></div>
          <div class="card"><h2>최대공약수 · 최소공배수</h2>${field('ng', '정수 목록 (쉼표)', '84, 126, 210')}<div class="out" id="ngout"></div></div></div>
      </div>`;
      persist(root);
      let bands = 4;
      const rsel = A.Store.get('eng.bands', { 4: [1, 0, 2, 10], 5: [1, 0, 0, 1, 1], 6: [1, 0, 0, 1, 1, 1] });
      segs(root, (n, k) => { if (n === 'eg') { panes(root, 'eg', k); live(); } else { bands = +k; drawRes(); } });
      // 옴의 법칙
      function ohm() {
        const out = $('#oout');
        try {
          const g = (id) => { const s = $('#' + id).value.trim(); return s ? E.evalReal(s) : null; };
          let V = g('ov'), I = g('oi'), R = g('or'), P = g('op');
          const n = [V, I, R, P].filter((x) => x !== null).length;
          if (n < 2) throw new Error('두 값을 입력하세요');
          if (V !== null && I !== null) { R = V / I; P = V * I; }
          else if (V !== null && R !== null) { I = V / R; P = V * V / R; }
          else if (V !== null && P !== null) { I = P / V; R = V * V / P; }
          else if (I !== null && R !== null) { V = I * R; P = I * I * R; }
          else if (I !== null && P !== null) { V = P / I; R = P / (I * I); }
          else if (R !== null && P !== null) { V = Math.sqrt(P * R); I = Math.sqrt(P / R); }
          out.innerHTML = `<div class="kv"><dt>전압 V</dt><dd>${si(V, 'V')}</dd><dt>전류 I</dt><dd>${si(I, 'A')}</dd><dt>저항 R</dt><dd>${si(R, 'Ω')}</dd><dt>전력 P</dt><dd>${si(P, 'W')}</dd><dt>컨덕턴스 G</dt><dd>${si(1 / R, 'S')}</dd></div>`;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      // 저항 색띠
      function drawRes() {
        const sel = rsel[bands];
        const roles = bands === 4 ? ['1번째', '2번째', '승수', '오차'] : bands === 5 ? ['1번째', '2번째', '3번째', '승수', '오차'] : ['1번째', '2번째', '3번째', '승수', '오차', '온도계수'];
        const allowed = (role) => role === '승수' ? COLORS.map((c, i) => i) : role === '오차' ? [1, 2, 5, 6, 7, 8, 10, 11] : role === '온도계수' ? [0, 1, 2, 3, 4, 5, 6, 7] : COLORS.slice(0, 10).map((c, i) => i);
        $('#rbands').innerHTML = roles.map((r, bi) => `<div class="band-row"><label>${r}</label><div class="swatches">${allowed(r).map((ci) => `<button data-band="${bi}" data-c="${ci}" title="${COLORS[ci][0]}" style="background:${COLORS[ci][1]}" class="${sel[bi] === ci ? 'on' : ''}"></button>`).join('')}</div></div>`).join('');
        const xs = bands === 4 ? [80, 112, 144, 228] : bands === 5 ? [76, 104, 132, 160, 228] : [72, 98, 124, 150, 210, 238];
        $('#rsvg').innerHTML = `<svg viewBox="0 0 320 70"><line x1="0" y1="35" x2="320" y2="35" stroke="#8d8f93" stroke-width="4"/><rect x="50" y="12" width="220" height="46" rx="20" fill="#cdb594"/>${sel.map((c, i) => `<rect x="${xs[i]}" y="12" width="14" height="46" fill="${COLORS[c][1]}"/>`).join('')}</svg>`;
        const digits = sel.slice(0, bands === 4 ? 2 : 3).map((c) => COLORS[c][2]);
        const mulC = COLORS[sel[bands === 4 ? 2 : 3]][2];
        const R = parseInt(digits.join(''), 10) * Math.pow(10, mulC);
        const tol = TOL[sel[bands === 4 ? 3 : 4]] || '';
        const tolP = parseFloat(tol.replace(/[±%]/g, '')) / 100;
        const tc = bands === 6 ? [250, 100, 50, 15, 25, 20, 10, 5][sel[5]] + ' ppm/K' : null;
        $('#rout').innerHTML = `<div class="lbl">저항값</div><div class="big">${si(Number(R.toPrecision(4)), 'Ω')} <span style="font-size:16px;color:var(--text-3)">${tol}</span></div><div class="kv" style="margin-top:8px"><dt>범위</dt><dd>${si(R * (1 - tolP), 'Ω')} ~ ${si(R * (1 + tolP), 'Ω')}</dd>${tc ? `<dt>온도계수</dt><dd>${tc}</dd>` : ''}<dt>색 순서</dt><dd>${sel.map((c) => COLORS[c][0]).join(' · ')}</dd></div>`;
        A.Store.set('eng.bands', rsel);
      }
      function stdRes() {
        const out = $('#rqout');
        try {
          const x = val('rq'); if (!(x > 0)) throw new Error('양수를 입력하세요');
          out.innerHTML = `<div class="kv">${['E12', 'E24', 'E96'].map((s) => { const v = nearestE(x, s); return `<dt>${s} (${s === 'E12' ? '±10%' : s === 'E24' ? '±5%' : '±1%'})</dt><dd>${si(v, 'Ω')} <span class="muted">(${((v / x - 1) * 100).toFixed(2)}%)</span></dd>`; }).join('')}</div>`;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function comb() {
        const out = $('#cout');
        try {
          const v = $('#cl').value.split(/[,;\s]+/).filter(Boolean).map((s) => E.evalReal(s));
          if (!v.length) throw new Error('값을 입력하세요');
          const ser = v.reduce((a, b) => a + b, 0), par = 1 / v.reduce((a, b) => a + 1 / b, 0);
          out.innerHTML = `<div class="kv"><dt>저항·인덕터 직렬</dt><dd>${esc(f(ser))}</dd><dt>저항·인덕터 병렬</dt><dd>${esc(f(par))}</dd><dt>커패시터 직렬</dt><dd>${esc(f(par))}</dd><dt>커패시터 병렬</dt><dd>${esc(f(ser))}</dd><dt>개수</dt><dd>${v.length}</dd></div>`;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function vdiv() {
        const out = $('#dvout');
        try {
          const vin = val('dvin'), r1 = val('dr1'), r2 = val('dr2');
          const vo = vin * r2 / (r1 + r2), i = vin / (r1 + r2);
          out.innerHTML = `<div class="lbl">Vout</div><div class="big">${si(vo, 'V')}</div><div class="kv" style="margin-top:8px"><dt>전류</dt><dd>${si(i, 'A')}</dd><dt>R1 · R2 소비전력</dt><dd>${si(i * i * r1, 'W')} · ${si(i * i * r2, 'W')}</dd><dt>분배비</dt><dd>${esc(f(r2 / (r1 + r2)))}</dd></div>`;
          const vt = val('dvt'); const need = vt * r1 / (vin - vt);
          $('#dvr2').textContent = need > 0 && isFinite(need) ? `${E.pretty(E.siString(need, 'Ω'))} (E24: ${E.pretty(E.siString(nearestE(need, 'E24'), 'Ω'))})` : '불가능';
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function rlc() {
        const out = $('#lout');
        try {
          const R = val('lr'), L = val('ll'), C = val('lc'), fr = val('lf');
          const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C)), w = 2 * Math.PI * fr;
          const XL = w * L, XC = 1 / (w * C), Z = Math.hypot(R, XL - XC), ph = Math.atan2(XL - XC, R) * 180 / Math.PI;
          out.innerHTML = `<div class="kv"><dt>공진 주파수 f₀</dt><dd>${si(f0, 'Hz')}</dd><dt>공진 각주파수 ω₀</dt><dd>${si(2 * Math.PI * f0, 'rad/s')}</dd><dt>시정수 τ = RC</dt><dd>${si(R * C, 's')}</dd><dt>시정수 τ = L/R</dt><dd>${si(L / R, 's')}</dd><dt>직렬 Q 인자</dt><dd>${esc(f(Math.sqrt(L / C) / R))}</dd><dt>대역폭 (직렬)</dt><dd>${si(R / (2 * Math.PI * L), 'Hz')}</dd><dt>X_L @ f</dt><dd>${si(XL, 'Ω')}</dd><dt>X_C @ f</dt><dd>${si(XC, 'Ω')}</dd><dt>직렬 |Z| @ f</dt><dd>${si(Z, 'Ω')}</dd><dt>위상각</dt><dd>${esc(f(ph))}°</dd><dt>RC 차단주파수</dt><dd>${si(1 / (2 * Math.PI * R * C), 'Hz')}</dd></div>`;
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function db() {
        const out = $('#dbout'); const g = (id) => { try { return val(id); } catch (e) { return NaN; } };
        const p = g('dbp'), v = g('dbv'), d = g('dbx'), m = g('dbm');
        out.innerHTML = `<div class="kv"><dt>전력비 → dB</dt><dd>${esc(f(10 * Math.log10(p)))} dB</dd><dt>전압비 → dB</dt><dd>${esc(f(20 * Math.log10(v)))} dB</dd><dt>dB → 전력비</dt><dd>${esc(f(Math.pow(10, d / 10)))}</dd><dt>dB → 전압비</dt><dd>${esc(f(Math.pow(10, d / 20)))}</dd><dt>dBm → 전력</dt><dd>${si(Math.pow(10, m / 10) / 1000, 'W')}</dd><dt>dBm → 전압 (50Ω)</dt><dd>${si(Math.sqrt(Math.pow(10, m / 10) / 1000 * 50), 'V')} rms</dd></div>`;
      }
      function tri() {
        const out = $('#trout');
        try {
          const g = (id) => { const s = $('#' + id).value.trim(); return s ? E.evalReal(s) : null; };
          let a = g('ta'), b = g('tb'), c = g('tc'), Aa = g('tA'), Bb = g('tB'), Cc = g('tC');
          const r = Math.PI / 180, d = 180 / Math.PI;
          const given = [a, b, c, Aa, Bb, Cc].filter((x) => x !== null).length;
          if (given !== 3) throw new Error('정확히 세 값을 입력하세요 (변 하나 이상 포함)');
          if ([a, b, c].every((x) => x === null)) throw new Error('최소 한 변이 필요합니다');
          const sols = [];
          const angles = [Aa, Bb, Cc].filter((x) => x !== null).length;
          if (angles === 0) { // SSS
            if (a + b <= c || a + c <= b || b + c <= a) throw new Error('삼각형이 될 수 없습니다');
            Aa = Math.acos((b * b + c * c - a * a) / (2 * b * c)) * d; Bb = Math.acos((a * a + c * c - b * b) / (2 * a * c)) * d; Cc = 180 - Aa - Bb; sols.push([a, b, c, Aa, Bb, Cc]);
          } else if (angles >= 2) { // ASA/AAS
            if (Aa === null) Aa = 180 - Bb - Cc; if (Bb === null) Bb = 180 - Aa - Cc; if (Cc === null) Cc = 180 - Aa - Bb;
            if (Aa <= 0 || Bb <= 0 || Cc <= 0) throw new Error('각의 합이 180°보다 작아야 합니다');
            const k = a !== null ? a / Math.sin(Aa * r) : b !== null ? b / Math.sin(Bb * r) : c / Math.sin(Cc * r);
            sols.push([k * Math.sin(Aa * r), k * Math.sin(Bb * r), k * Math.sin(Cc * r), Aa, Bb, Cc]);
          } else { // 변 2 + 각 1
            const S = [a, b, c], Ang = [Aa, Bb, Cc]; const ai = Ang.findIndex((x) => x !== null);
            if (S[ai] === null) { // SAS
              const [j, k] = [0, 1, 2].filter((x) => x !== ai);
              S[ai] = Math.sqrt(S[j] ** 2 + S[k] ** 2 - 2 * S[j] * S[k] * Math.cos(Ang[ai] * r));
              Ang[j] = Math.acos(Math.max(-1, Math.min(1, (S[ai] ** 2 + S[k] ** 2 - S[j] ** 2) / (2 * S[ai] * S[k])))) * d; Ang[k] = 180 - Ang[ai] - Ang[j];
              sols.push([...S, ...Ang]);
            } else { // SSA (모호한 경우)
              const j = [0, 1, 2].find((x) => x !== ai && S[x] !== null); const k = 3 - ai - j;
              const sinJ = S[j] * Math.sin(Ang[ai] * r) / S[ai];
              if (sinJ > 1 + 1e-12) throw new Error('해가 없습니다');
              const cands = [Math.asin(Math.min(1, sinJ)) * d]; if (sinJ < 1 - 1e-12) cands.push(180 - cands[0]);
              cands.forEach((Aj) => { const Ak = 180 - Ang[ai] - Aj; if (Ak <= 1e-9) return; const S2 = S.slice(), A2 = Ang.slice(); A2[j] = Aj; A2[k] = Ak; S2[k] = S[ai] * Math.sin(Ak * r) / Math.sin(Ang[ai] * r); sols.push([...S2, ...A2]); });
              if (!sols.length) throw new Error('해가 없습니다');
            }
          }
          out.innerHTML = sols.map((s, i) => {
            const [x, y, z, X, Y, Z] = s; const p = (x + y + z) / 2; const area = Math.sqrt(Math.max(0, p * (p - x) * (p - y) * (p - z)));
            return `${sols.length > 1 ? `<div class="lbl">해 ${i + 1}</div>` : ''}<div class="kv" style="margin-bottom:8px"><dt>a · b · c</dt><dd>${[x, y, z].map(f).join(' · ')}</dd><dt>A · B · C</dt><dd>${[X, Y, Z].map((q) => f(q) + '°').join(' · ')}</dd><dt>넓이</dt><dd>${esc(f(area))}</dd><dt>둘레</dt><dd>${esc(f(2 * p))}</dd><dt>외접원 반지름 R</dt><dd>${esc(f(x * y * z / (4 * area)))}</dd><dt>내접원 반지름 r</dt><dd>${esc(f(area / p))}</dd><dt>높이 hₐ</dt><dd>${esc(f(2 * area / x))}</dd></div>`;
          }).join('');
        } catch (e) { out.innerHTML = errHTML(e); }
      }
      function numth() {
        const out = $('#nout');
        try {
          const n = Math.round(val('nn')); if (Math.abs(n) > 9e15) throw new Error('|n| ≤ 9×10¹⁵');
          const fac = E.factorize(n);
          const an = Math.abs(n);
          let divs = []; if (an > 0 && an <= 1e12) { for (let i = 1; i * i <= an; i++) if (an % i === 0) { divs.push(i); if (i * i !== an) divs.push(an / i); } divs.sort((a, b) => a - b); }
          const phi = fac.filter(([p]) => p > 1).reduce((acc, [p]) => acc / p * (p - 1), an);
          const str = fac.map(([p, e]) => (e > 1 ? `${p}${E.supify(e)}` : `${p}`)).join(' × ') || String(n);
          out.innerHTML = `<div class="lbl">소인수분해</div><div class="big" style="font-size:22px">${esc(str)}</div><div class="kv" style="margin-top:8px"><dt>소수 여부</dt><dd>${E.isPrime(n) ? '소수' : '합성수/기타'}</dd><dt>약수 개수</dt><dd>${divs.length || '—'}</dd><dt>약수의 합</dt><dd>${divs.length ? f(divs.reduce((a, b) => a + b, 0)) : '—'}</dd><dt>오일러 φ(n)</dt><dd>${esc(f(phi))}</dd></div>${divs.length && divs.length <= 200 ? `<p class="note">약수: ${divs.join(', ')}</p>` : ''}`;
        } catch (e) { out.innerHTML = errHTML(e); }
        const o2 = $('#ngout');
        try {
          const v = $('#ng').value.split(/[,;\s]+/).filter(Boolean).map((s) => Math.round(E.evalReal(s)));
          if (v.length < 2) throw new Error('두 개 이상 입력하세요');
          o2.innerHTML = `<div class="kv"><dt>최대공약수 GCD</dt><dd>${esc(f(v.reduce(E.gcd2)))}</dd><dt>최소공배수 LCM</dt><dd>${esc(f(v.reduce(E.lcm2)))}</dd></div>`;
        } catch (e) { o2.innerHTML = errHTML(e); }
      }
      function live() { stdRes(); comb(); vdiv(); rlc(); db(); numth(); }
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]'); if (b) { A.haptic(); if (b.dataset.go === 'ohm') ohm(); if (b.dataset.go === 'tri') tri(); }
        const sw = e.target.closest('[data-band]'); if (sw) { A.haptic(); rsel[bands][+sw.dataset.band] = +sw.dataset.c; drawRes(); }
      });
      let t; root.addEventListener('input', () => { clearTimeout(t); t = setTimeout(live, 150); });
      drawRes(); live(); ohm(); tri();
    },
  });

  /* ═════════ 기록 ═════════ */
  A.register({
    id: 'history', name: '기록', glyph: '↺',
    init(root) {
      root.innerHTML = '<div class="scroll"><div class="row" style="justify-content:space-between;margin:4px 2px 6px"><span style="font-size:12px;color:var(--text-3)" id="hcount"></span><button class="btn sm" id="hclear">모두 지우기</button></div><div class="card" style="padding:4px 14px" id="hlist"></div><p class="note">탭하면 계산기로 불러오고, 길게 누르면 결과를 복사합니다.</p></div>';
      root.addEventListener('click', (e) => {
        if (e.target.id === 'hclear') { if (!A.History.all().length) return; A.History.clear(); this.show(); A.toast('기록을 지웠습니다'); return; }
        const it = e.target.closest('.hist-item'); if (!it) return;
        A.haptic(); const item = A.History.all()[+it.dataset.i]; A.show('calc'); A.Calc.load(item);
      });
    },
    show() {
      const items = A.History.all();
      $('#hcount').textContent = `${items.length}개 항목`;
      const fmtT = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      $('#hlist').innerHTML = items.length ? items.map((it, i) => `<div class="hist-item" data-i="${i}"><span class="tm">${fmtT(it.t)}</span><div class="e">${esc(it.e)}</div><div class="r">= ${esc(E.pretty(it.r))}</div></div>`).join('') : '<div class="empty">아직 계산 기록이 없습니다</div>';
      $$('#hlist .hist-item').forEach((el) => A.longPress(el, () => A.copy(A.History.all()[+el.dataset.i].r)));
    },
  });

  /* ═════════ 설정 ═════════ */
  A.register({
    id: 'settings', name: '설정', glyph: '⚙',
    init(root) {
      const s = A.settings;
      root.innerHTML = `<div class="scroll">
        <div class="card"><h2>계산</h2>
          <div class="set-row"><div><div class="t">각도 단위</div><div class="d">삼각함수 입력/출력</div></div>${seg('sa', [['DEG', 'DEG'], ['RAD', 'RAD'], ['GRAD', 'GRAD']], s.angle)}</div>
          <div class="set-row"><div><div class="t">표시 형식</div><div class="d">일반 · 고정소수 · 과학 · 공학</div></div>${seg('sm', [['NORM', '일반'], ['FIX', 'FIX'], ['SCI', 'SCI'], ['ENG', 'ENG']], s.mode)}</div>
          <div class="set-row"><div><div class="t">자릿수</div><div class="d">FIX 소수 자릿수 / SCI 유효숫자</div></div><span class="stepper"><button data-dg="-1">−</button><b id="sdig">${s.digits}</b><button data-dg="1">+</button></span></div>
          <div class="set-row"><div><div class="t">천 단위 구분 기호</div><div class="d">1,234,567</div></div><button class="switch ${s.sep ? 'on' : ''}" data-sw="sep"></button></div>
          <div class="set-row"><div><div class="t">복소수 극형식 표시</div><div class="d">r∠θ</div></div><button class="switch ${s.polar ? 'on' : ''}" data-sw="polar"></button></div>
        </div>
        <div class="card"><h2>화면</h2>
          <div class="set-row"><div><div class="t">테마</div><div class="d">그래파이트 다크 · 실버 라이트</div></div>${seg('st', [['dark', '다크'], ['light', '라이트']], s.theme)}</div>
          <div class="set-row"><div><div class="t">진동 피드백</div><div class="d">키를 누를 때 짧은 진동</div></div><button class="switch ${s.haptic ? 'on' : ''}" data-sw="haptic"></button></div>
        </div>
        <div class="card"><h2>데이터</h2>
          <div class="row"><button class="btn" id="rsHist">기록 지우기</button><button class="btn" id="rsVars">변수·메모리 지우기</button></div>
        </div>
        <div class="card"><h2>정보</h2>
          <p style="margin:0;font-size:13.5px;line-height:1.7;color:var(--text-2)"><b style="color:var(--text)">Graphite 공학용 계산기</b> 1.0<br>
          복소수 · 행렬/고유값 · 방정식(다항/연립/일반) · 수치 미분/적분/극한/급수/테일러 · 그래프(직교/극/매개변수) · 1·2변수 통계와 5종 회귀 · 6종 확률분포 · 진법/비트 연산 · 16종 단위 변환 · CODATA 물리 상수 · 전기·전자 공학 도구 · 삼각형 풀이 · 정수론</p>
          <p class="note">모든 계산은 기기 안에서 오프라인으로 처리됩니다.</p></div>
      </div>`;
      const refresh = () => { A.saveSettings(); A.applySettings(); A.Calc.render(); window.dispatchEvent(new Event('themechange')); };
      segs(root, (n, k) => {
        if (n === 'sa') s.angle = k; if (n === 'sm') s.mode = k; if (n === 'st') s.theme = k;
        refresh();
      });
      root.addEventListener('click', (e) => {
        const sw = e.target.closest('[data-sw]');
        if (sw) { const k = sw.dataset.sw; s[k] = !s[k]; sw.classList.toggle('on', s[k]); refresh(); return; }
        const dg = e.target.closest('[data-dg]');
        if (dg) { s.digits = Math.max(0, Math.min(12, s.digits + +dg.dataset.dg)); $('#sdig').textContent = s.digits; refresh(); return; }
        if (e.target.id === 'rsHist') { A.History.clear(); A.toast('기록을 지웠습니다'); }
        if (e.target.id === 'rsVars') { ['A', 'B', 'C', 'D', 'X', 'Y', 'M'].forEach((k) => delete E.globals[k]); A.Store.set('vars', {}); A.Store.set('mem', null); $('#stMem').hidden = true; A.toast('변수와 메모리를 지웠습니다'); }
      });
    },
    show() {
      const s = A.settings; const r = $('#v-settings');
      [['sa', s.angle], ['sm', s.mode]].forEach(([n, v]) => $$(`[data-seg="${n}"] button`, r).forEach((b) => b.classList.toggle('on', b.dataset.k === v)));
    },
  });
})();
