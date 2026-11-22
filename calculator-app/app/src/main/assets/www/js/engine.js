/* Graphite 계산 엔진: 복소수, 수식 파서/컴파일러, 수치해석, 행렬, 통계, 확률분포 */
'use strict';
(function (global) {

  class CalcError extends Error {}
  const err = (m) => { throw new CalcError(m); };

  /* ───────────── 복소수 ───────────── */
  class Cx { constructor(re, im) { this.re = re; this.im = im || 0; } }
  const C = (re, im) => new Cx(re, im || 0);
  const isReal = (z) => z.im === 0 || Math.abs(z.im) <= 1e-11 * Math.max(1, Math.abs(z.re));
  const snap = (v, a, b) => (Math.abs(v) < 1e-14 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : v);

  const add = (a, b) => C(snap(a.re + b.re, a.re, b.re), snap(a.im + b.im, a.im, b.im));
  const sub = (a, b) => C(snap(a.re - b.re, a.re, b.re), snap(a.im - b.im, a.im, b.im));
  const neg = (a) => C(-a.re, -a.im);
  const mul = (a, b) => (a.im === 0 && b.im === 0) ? C(a.re * b.re)
    : C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  function div(a, b) {
    if (b.re === 0 && b.im === 0) err('0으로 나눌 수 없습니다');
    if (a.im === 0 && b.im === 0) return C(a.re / b.re);
    if (Math.abs(b.re) >= Math.abs(b.im)) {
      const r = b.im / b.re, d = b.re + b.im * r;
      return C((a.re + a.im * r) / d, (a.im - a.re * r) / d);
    }
    const r = b.re / b.im, d = b.re * r + b.im;
    return C((a.re * r + a.im) / d, (a.im * r - a.re) / d);
  }
  const cabs = (z) => Math.hypot(z.re, z.im);
  const carg = (z) => Math.atan2(z.im, z.re);
  const cexp = (z) => { const m = Math.exp(z.re); return z.im === 0 ? C(m) : C(m * Math.cos(z.im), m * Math.sin(z.im)); };
  function clog(z) {
    if (z.re === 0 && z.im === 0) err('정의역 오류: log(0)');
    if (z.im === 0 && z.re > 0) return C(Math.log(z.re));
    return C(Math.log(cabs(z)), carg(z));
  }
  function csqrt(z) {
    if (z.im === 0) return z.re >= 0 ? C(Math.sqrt(z.re)) : C(0, Math.sqrt(-z.re));
    const m = cabs(z);
    const re = Math.sqrt((m + z.re) / 2), im = Math.sign(z.im) * Math.sqrt((m - z.re) / 2);
    return C(re, im);
  }
  function cpow(a, b) {
    if (b.im === 0) {
      const n = b.re;
      if (a.im === 0) {
        const x = a.re;
        if (x === 0) {
          if (n > 0) return C(0);
          if (n === 0) return C(1);
          err('0으로 나눌 수 없습니다');
        }
        if (x > 0 || Number.isInteger(n)) return C(Math.pow(x, n));
        const fr = toFraction(n, 1000);
        if (fr && fr.d % 2 === 1) { const v = Math.pow(-x, n); return C(fr.n % 2 === 0 ? v : -v); }
      }
      if (Number.isInteger(n) && Math.abs(n) <= 4096) {
        let r = C(1), base = a, k = Math.abs(n);
        while (k > 0) { if (k & 1) r = mul(r, base); base = mul(base, base); k >>= 1; }
        return n < 0 ? div(C(1), r) : r;
      }
    }
    if (a.re === 0 && a.im === 0) {
      if (b.re > 0) return C(0);
      err('0으로 나눌 수 없습니다');
    }
    return cexp(mul(b, clog(a)));
  }

  /* ───────────── 각도 ───────────── */
  const state = { angle: 'DEG' };
  const fullTurn = () => (state.angle === 'DEG' ? 360 : state.angle === 'GRAD' ? 400 : 2 * Math.PI);
  const toRad = (x) => (state.angle === 'DEG' ? x * Math.PI / 180 : state.angle === 'GRAD' ? x * Math.PI / 200 : x);
  const fromRad = (x) => (state.angle === 'DEG' ? x * 180 / Math.PI : state.angle === 'GRAD' ? x * 200 / Math.PI : x);
  function quarter(x) { // 각도 단위에서 정확히 90°의 배수인지 → 0..3, 아니면 -1
    if (state.angle === 'RAD') return -1;
    const full = fullTurn(), q = full / 4;
    const m = ((x % full) + full) % full;
    return m % q === 0 ? m / q : -1;
  }
  const trigSnap = (r, x) => (Math.abs(r) < 1e-15 * Math.max(1, Math.abs(x)) && Math.abs(x) > 1e-7 ? 0 : r);
  function rsin(x) { const q = quarter(x); if (q >= 0) return [0, 1, 0, -1][q]; return trigSnap(Math.sin(toRad(x)), toRad(x)); }
  function rcos(x) { const q = quarter(x); if (q >= 0) return [1, 0, -1, 0][q]; return trigSnap(Math.cos(toRad(x)), toRad(x)); }
  function rtan(x) {
    const q = quarter(x);
    if (q === 0 || q === 2) return 0;
    if (q === 1 || q === 3) err('정의되지 않음 (tan 90°)');
    const r = toRad(x);
    if (state.angle === 'RAD' && Math.abs(Math.cos(r)) < 1e-15) err('정의되지 않음');
    return trigSnap(Math.tan(r), r);
  }
  const csin = (z) => z.im === 0 ? C(rsin(z.re)) : C(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
  const ccos = (z) => z.im === 0 ? C(rcos(z.re)) : C(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
  const ctan = (z) => z.im === 0 ? C(rtan(z.re)) : div(csin(z), ccos(z));
  const csinh = (z) => C(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
  const ccosh = (z) => C(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
  const ctanh = (z) => z.im === 0 ? C(Math.tanh(z.re)) : div(csinh(z), ccosh(z));
  const I = C(0, 1);
  // 복소 역삼각 (라디안)
  const casinR = (z) => mul(C(0, -1), clog(add(mul(I, z), csqrt(sub(C(1), mul(z, z))))));
  const catanR = (z) => mul(C(0, 0.5), sub(clog(sub(C(1), mul(I, z))), clog(add(C(1), mul(I, z)))));
  function casin(z) {
    if (z.im === 0 && Math.abs(z.re) <= 1) return C(fromRad(Math.asin(z.re)));
    const r = casinR(z); return isReal(r) ? C(fromRad(r.re)) : r;
  }
  function cacos(z) {
    if (z.im === 0 && Math.abs(z.re) <= 1) return C(fromRad(Math.acos(z.re)));
    const r = sub(C(Math.PI / 2), casinR(z)); return isReal(r) ? C(fromRad(r.re)) : r;
  }
  function catan(z) {
    if (z.im === 0) return C(fromRad(Math.atan(z.re)));
    if (z.re === 0 && Math.abs(z.im) === 1) err('정의역 오류');
    return catanR(z);
  }
  const casinh = (z) => z.im === 0 ? C(Math.asinh(z.re)) : clog(add(z, csqrt(add(mul(z, z), C(1)))));
  const cacosh = (z) => (z.im === 0 && z.re >= 1) ? C(Math.acosh(z.re)) : clog(add(z, mul(csqrt(add(z, C(1))), csqrt(sub(z, C(1))))));
  function catanh(z) {
    if (z.im === 0 && Math.abs(z.re) === 1) err('정의역 오류');
    if (z.im === 0 && Math.abs(z.re) < 1) return C(Math.atanh(z.re));
    return mul(C(0.5), clog(div(add(C(1), z), sub(C(1), z))));
  }

  /* ───────────── 특수 함수 ───────────── */
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (Number.isInteger(x)) {
      if (x <= 0) err('정의역 오류: Γ(0, 음의 정수)');
      if (x <= 171) { let r = 1; for (let k = 2; k < x; k++) r *= k; return r; }
      return Infinity;
    }
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    let a = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
  }
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function erf(x) {
    if (x < 0) return -erf(-x);
    if (x < 3) {
      let sum = 0, term = x, n = 0;
      while (Math.abs(term) > 1e-17 * Math.abs(sum) || n < 3) {
        sum += term / (2 * n + 1); n++; term *= -x * x / n;
        if (n > 200) break;
      }
      return 2 / Math.sqrt(Math.PI) * sum;
    }
    return 1 - erfc(x);
  }
  function erfc(x) {
    if (x < 3) return 1 - erf(x);
    // 연분수 (Lentz)
    let f = x, Cc = x, D = 0;
    for (let n = 1; n < 300; n++) {
      const an = n / 2;
      D = x + an * D; D = 1 / D;
      Cc = x + an / Cc;
      const delta = Cc * D; f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
  }
  const normCdf = (z) => (z < 0 ? 0.5 * erfc(-z / Math.SQRT2) : 1 - 0.5 * erfc(z / Math.SQRT2));
  const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  function normInv(p) {
    if (p <= 0 || p >= 1) err('확률은 0과 1 사이여야 합니다');
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let x;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    for (let k = 0; k < 2; k++) { const e = normCdf(x) - p; x -= e / normPdf(x); }
    return x;
  }

  /* ───────────── 정수/조합 ───────────── */
  function needInt(x, name) {
    const r = Math.round(x);
    if (Math.abs(x - r) > 1e-9) err(`${name}: 정수가 필요합니다`);
    return r;
  }
  function factorial(x) {
    if (Number.isInteger(x) || Math.abs(x - Math.round(x)) < 1e-12) {
      x = Math.round(x);
      if (x < 0) err('음수의 계승은 정의되지 않습니다');
      if (x > 170) return Infinity;
      let r = 1; for (let k = 2; k <= x; k++) r *= k; return r;
    }
    return gamma(x + 1);
  }
  function nCr(n, r) {
    n = needInt(n, 'nCr'); r = needInt(r, 'nCr');
    if (r < 0 || n < 0 || r > n) return 0;
    r = Math.min(r, n - r);
    let v = 1; for (let k = 1; k <= r; k++) v = v * (n - r + k) / k;
    return v < 9e15 ? Math.round(v) : v;
  }
  function nPr(n, r) {
    n = needInt(n, 'nPr'); r = needInt(r, 'nPr');
    if (r < 0 || n < 0 || r > n) return 0;
    let v = 1; for (let k = 0; k < r; k++) v *= (n - k);
    return v;
  }
  function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  const lcm2 = (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a / gcd2(a, b) * b));
  const fmod = (a, b) => { if (b === 0) err('0으로 나눌 수 없습니다'); const r = a - b * Math.floor(a / b); return Math.abs(r - b) < 1e-12 * Math.abs(b) ? 0 : r; };
  function isPrime(n) {
    if (n < 2 || !Number.isInteger(n)) return false;
    if (n < 4) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
    return true;
  }
  function factorize(n) {
    n = needInt(n, '소인수분해');
    if (Math.abs(n) > 9007199254740991) err('수가 너무 큽니다');
    const out = []; if (n < 0) { out.push([-1, 1]); n = -n; }
    if (n < 2) return out;
    for (const p of [2, 3]) { let e = 0; while (n % p === 0) { n /= p; e++; } if (e) out.push([p, e]); }
    for (let i = 5; i * i <= n; i += 6) {
      for (const p of [i, i + 2]) { let e = 0; while (n % p === 0) { n /= p; e++; } if (e) out.push([p, e]); }
    }
    if (n > 1) out.push([n, 1]);
    return out;
  }
  function roundTo(x, n) {
    n = needInt(n, 'round');
    const s = Math.sign(x); x = Math.abs(x);
    return s * Number(Math.round(Number(x + 'e' + n)) + 'e' + (-n));
  }

  /* ───────────── 함수 표 ───────────── */
  const R = (z, name) => { if (!isReal(z)) err(`${name}: 실수 인수가 필요합니다`); return z.re; };
  const real1 = (name, fn) => ({ min: 1, max: 1, f: (a) => C(fn(R(a[0], name))) });
  const realN = (name, fn, min = 1, max = 99) => ({ min, max, f: (a) => C(fn(a.map((z) => R(z, name)))) });
  const cx1 = (fn) => ({ min: 1, max: 1, f: (a) => fn(a[0]) });
  const FUNCS = {
    sin: cx1(csin), cos: cx1(ccos), tan: cx1(ctan),
    cot: cx1((z) => div(C(1), ctan(z))), sec: cx1((z) => div(C(1), ccos(z))), csc: cx1((z) => div(C(1), csin(z))),
    asin: cx1(casin), acos: cx1(cacos), atan: cx1(catan),
    acot: cx1((z) => (z.im === 0 && z.re === 0 ? C(fromRad(Math.PI / 2)) : catan(div(C(1), z)))),
    asec: cx1((z) => cacos(div(C(1), z))), acsc: cx1((z) => casin(div(C(1), z))),
    atan2: realN('atan2', (v) => fromRad(Math.atan2(v[0], v[1])), 2, 2),
    sinh: cx1(csinh), cosh: cx1(ccosh), tanh: cx1(ctanh),
    coth: cx1((z) => div(C(1), ctanh(z))), sech: cx1((z) => div(C(1), ccosh(z))), csch: cx1((z) => div(C(1), csinh(z))),
    asinh: cx1(casinh), acosh: cx1(cacosh), atanh: cx1(catanh),
    exp: cx1(cexp), ln: cx1(clog),
    log: { min: 1, max: 2, f: (a) => (a.length === 2 ? div(clog(a[0]), clog(a[1])) : div(clog(a[0]), C(Math.LN10))) },
    log2: cx1((z) => div(clog(z), C(Math.LN2))), log10: cx1((z) => div(clog(z), C(Math.LN10))),
    sqrt: cx1(csqrt),
    cbrt: cx1((z) => (z.im === 0 ? C(Math.cbrt(z.re)) : cpow(z, C(1 / 3)))),
    root: { min: 2, max: 2, f: (a) => { if (a[1].re === 0 && a[1].im === 0) err('0제곱근은 정의되지 않습니다'); return cpow(a[0], div(C(1), a[1])); } },
    abs: cx1((z) => C(cabs(z))), sign: real1('sign', Math.sign),
    floor: real1('floor', Math.floor), ceil: real1('ceil', Math.ceil), trunc: real1('trunc', Math.trunc),
    frac: real1('frac', (x) => x - Math.trunc(x)),
    round: realN('round', (v) => roundTo(v[0], v.length > 1 ? v[1] : 0), 1, 2),
    gamma: real1('Γ', gamma), lgamma: real1('lnΓ', lgamma), fact: real1('!', factorial),
    nCr: realN('nCr', (v) => nCr(v[0], v[1]), 2, 2), nPr: realN('nPr', (v) => nPr(v[0], v[1]), 2, 2),
    gcd: realN('gcd', (v) => v.map((x) => needInt(x, 'gcd')).reduce(gcd2), 2),
    lcm: realN('lcm', (v) => v.map((x) => needInt(x, 'lcm')).reduce(lcm2), 2),
    mod: realN('mod', (v) => fmod(v[0], v[1]), 2, 2),
    isprime: real1('isprime', (x) => (isPrime(x) ? 1 : 0)),
    erf: real1('erf', erf), erfc: real1('erfc', erfc),
    normcdf: realN('normcdf', (v) => normCdf((v[0] - (v[1] || 0)) / (v.length > 2 ? v[2] : 1)), 1, 3),
    normpdf: realN('normpdf', (v) => { const s = v.length > 2 ? v[2] : 1; return normPdf((v[0] - (v[1] || 0)) / s) / s; }, 1, 3),
    invnorm: realN('invnorm', (v) => (v[1] || 0) + (v.length > 2 ? v[2] : 1) * normInv(v[0]), 1, 3),
    min: realN('min', (v) => Math.min(...v)), max: realN('max', (v) => Math.max(...v)),
    mean: realN('mean', (v) => v.reduce((s, x) => s + x, 0) / v.length),
    median: realN('median', (v) => quantile(v.slice().sort((a, b) => a - b), 0.5)),
    stdev: realN('stdev', (v) => { if (v.length < 2) err('데이터가 2개 이상 필요합니다'); return Math.sqrt(variance(v, 1)); }),
    stdevp: realN('stdevp', (v) => Math.sqrt(variance(v, 0))),
    total: { min: 1, max: 99, f: (a) => a.reduce((s, z) => add(s, z), C(0)) },
    hypot: realN('hypot', (v) => Math.hypot(...v), 1),
    rand: { min: 0, max: 0, f: () => C(Math.random()) },
    randint: realN('randint', (v) => { const a = Math.ceil(v[0]), b = Math.floor(v[1]); return a + Math.floor(Math.random() * (b - a + 1)); }, 2, 2),
    re: cx1((z) => C(z.re)), im: cx1((z) => C(z.im)), arg: cx1((z) => C(fromRad(carg(z)))), conj: cx1((z) => C(z.re, -z.im)),
    deg: real1('deg', (x) => x * 180 / Math.PI), rad: real1('rad', (x) => x * Math.PI / 180),
    // 지연 평가 함수 (x를 더미 변수로 사용)
    sum: { min: 3, max: 3, lazy: true, f: (g, env) => seriesOp(g, env, false) },
    prod: { min: 3, max: 3, lazy: true, f: (g, env) => seriesOp(g, env, true) },
    integ: { min: 3, max: 3, lazy: true, f: (g, env) => { const lo = R(g[1](env), '∫'), hi = R(g[2](env), '∫'); return C(integrate(realFn(g[0], env), lo, hi).value); } },
    deriv: { min: 2, max: 3, lazy: true, f: (g, env) => { const x0 = R(g[1](env), 'd/dx'); const n = g[2] ? needInt(R(g[2](env), 'd/dx'), 'd/dx') : 1; return C(derivative(realFn(g[0], env), x0, n)); } },
  };
  function realFn(g, env) {
    const e = Object.create(env);
    return (x) => { e.x = C(x); const z = g(e); return isReal(z) ? z.re : NaN; };
  }
  function seriesOp(g, env, isProd) {
    const a = needInt(R(g[1](env), 'Σ'), 'Σ'), b = needInt(R(g[2](env), 'Σ'), 'Σ');
    if (b - a > 1e6) err('반복 횟수가 너무 많습니다 (최대 10⁶)');
    const e = Object.create(env);
    let acc = C(isProd ? 1 : 0);
    for (let k = a; k <= b; k++) { e.x = C(k); e.n = e.x; const v = g[0](e); acc = isProd ? mul(acc, v) : add(acc, v); }
    return acc;
  }

  const CONSTS = { pi: Math.PI, e: Math.E, i: null, inf: Infinity, phi: (1 + Math.sqrt(5)) / 2, tau: 2 * Math.PI };
  const VARS = ['x', 'y', 't', 'n', 'θ', 'Ans', 'M', 'A', 'B', 'C', 'D', 'X', 'Y'];

  /* ───────────── 토크나이저 ───────────── */
  const UNI = { '×': '*', '·': '*', '∙': '*', '÷': '/', '−': '-', '–': '-', '÷': '/' };
  const isLetter = (ch) => /[A-Za-zθ_]/.test(ch);
  function splitIdent(word) {
    // 알 수 없는 식별자를 아는 이름들의 연결로 분해 (예: "pix" → pi·x)
    const names = Object.keys(FUNCS).concat(Object.keys(CONSTS), VARS, ['mod']);
    const memo = new Map();
    function go(s) {
      if (s === '') return [];
      if (memo.has(s)) return memo.get(s);
      let best = null;
      for (let L = s.length; L >= 1; L--) {
        const head = s.slice(0, L);
        if (names.includes(head)) { const rest = go(s.slice(L)); if (rest) { best = [head, ...rest]; break; } }
      }
      memo.set(s, best); return best;
    }
    return go(word);
  }
  function tokenize(src) {
    const s = src.replace(/[×·∙÷−–]/g, (c) => UNI[c]);
    const t = []; let i = 0;
    const push = (type, v) => t.push({ t: type, v });
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\n' || ch === '\t') { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        let numStr = s.slice(i, j);
        if ((numStr.match(/\./g) || []).length > 1) err('잘못된 숫자: ' + numStr);
        if (s[j] === 'E' && /[0-9+\-]/.test(s[j + 1] || '')) {
          let k = j + 1; if (s[k] === '+' || s[k] === '-') k++;
          if (!/[0-9]/.test(s[k] || '')) err('지수 표기 오류');
          while (k < s.length && /[0-9]/.test(s[k])) k++;
          numStr = s.slice(i, k); j = k;
        }
        if (numStr === '.') err('잘못된 숫자');
        push('num', parseFloat(numStr)); i = j; continue;
      }
      if (isLetter(ch)) {
        let j = i; while (j < s.length && isLetter(s[j])) j++;
        let w = s.slice(i, j);
        // log2 / log10 / atan2 처럼 숫자가 붙는 함수명
        const m = /^[0-9]+/.exec(s.slice(j));
        if (m && FUNCS[w + m[0]]) { w += m[0]; j += m[0].length; }
        i = j;
        if (FUNCS[w] || w in CONSTS || VARS.includes(w) || w === 'mod') { push('id', w); continue; }
        const parts = splitIdent(w);
        if (!parts) err('알 수 없는 이름: ' + w);
        parts.forEach((p) => push('id', p));
        continue;
      }
      i++;
      switch (ch) {
        case '+': case '-': case '*': case '/': case '^': case '!': case '%': case '°': case '∠':
          push('op', ch); break;
        case '(': case '[': push('lp'); break;
        case ')': case ']': push('rp'); break;
        case ',': case ';': push('comma'); break;
        case '√': push('id', 'sqrt'); break;
        case '∛': push('id', 'cbrt'); break;
        case 'π': push('id', 'pi'); break;
        case 'φ': push('id', 'phi'); break;
        case '∞': push('id', 'inf'); break;
        case 'Σ': case '∑': push('id', 'sum'); break;
        case 'Π': case '∏': push('id', 'prod'); break;
        case '∫': push('id', 'integ'); break;
        case 'Γ': push('id', 'gamma'); break;
        case '²': push('op', '^'); push('num', 2); break;
        case '³': push('op', '^'); push('num', 3); break;
        case '⁻':
          if (s[i] === '¹') { i++; push('op', '^'); push('num', -1); break; }
          err('구문 오류');
          break;
        case '=': err('수식에 = 를 쓸 수 없습니다'); break;
        default: err('알 수 없는 기호: ' + ch);
      }
    }
    return t;
  }

  /* ───────────── 파서 (재귀 하강) ───────────── */
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => { const t = toks[p]; return t && t.t === 'op' && t.v === v; };
    const isFn = (t) => t && t.t === 'id' && FUNCS[t.v];
    function parseAdd() {
      let a = parseMul();
      while (isOp('+') || isOp('-')) { const op = toks[p++].v; a = { t: 'bin', op, a, b: parseMul() }; }
      return a;
    }
    function parseMul() {
      let a = parseImplicit();
      for (;;) {
        const t = peek();
        if (t && t.t === 'op' && (t.v === '*' || t.v === '/' || t.v === '∠')) { p++; a = { t: 'bin', op: t.v, a, b: parseImplicit() }; }
        else if (t && t.t === 'id' && t.v === 'mod') { p++; a = { t: 'bin', op: 'mod', a, b: parseImplicit() }; }
        else break;
      }
      return a;
    }
    const startsPrimary = (t) => t && (t.t === 'num' || t.t === 'lp' || (t.t === 'id' && t.v !== 'mod'));
    function parseImplicit() {
      let a = parseUnary();
      while (startsPrimary(peek())) a = { t: 'bin', op: '*', a, b: parsePower() };
      return a;
    }
    function parseUnary() {
      if (isOp('-')) { p++; return { t: 'neg', a: parseUnary() }; }
      if (isOp('+')) { p++; return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      const base = parsePostfix();
      if (isOp('^')) { p++; return { t: 'bin', op: '^', a: base, b: parseUnary() }; }
      return base;
    }
    function parsePostfix() {
      let a = parsePrimary();
      for (;;) {
        if (isOp('!')) { p++; a = { t: 'call', f: 'fact', args: [a] }; }
        else if (isOp('%')) { p++; a = { t: 'bin', op: '/', a, b: { t: 'num', v: C(100) } }; }
        else if (isOp('°')) { p++; a = { t: 'deg', a }; }
        else break;
      }
      return a;
    }
    function closeParen() {
      const t = peek();
      if (!t) return; // 자동으로 괄호 닫기
      if (t.t !== 'rp') err('괄호가 맞지 않습니다');
      p++;
    }
    function parsePrimary() {
      const t = toks[p];
      if (!t) err('식이 완성되지 않았습니다');
      if (t.t === 'num') { p++; return { t: 'num', v: C(t.v) }; }
      if (t.t === 'lp') { p++; const e = parseAdd(); closeParen(); return e; }
      if (t.t === 'id') {
        p++;
        const w = t.v;
        if (w in CONSTS) return { t: 'num', v: w === 'i' ? C(0, 1) : C(CONSTS[w]) };
        if (FUNCS[w]) {
          const def = FUNCS[w];
          let args = [];
          if (peek() && peek().t === 'lp') {
            p++;
            if (peek() && peek().t === 'rp') { p++; }
            else if (!peek()) { /* 미완성 */ }
            else {
              args.push(parseAdd());
              while (peek() && peek().t === 'comma') { p++; args.push(parseAdd()); }
              closeParen();
            }
          } else if (def.max > 0) {
            args = [parseUnary()];
          }
          if (args.length < def.min || args.length > def.max) {
            err(`${w}: 인수 개수 오류 (${def.min === def.max ? def.min : def.min + '~' + def.max}개)`);
          }
          return { t: 'call', f: w, args };
        }
        return { t: 'var', n: w };
      }
      if (t.t === 'rp') err('괄호가 맞지 않습니다');
      if (t.t === 'comma') err('쉼표 위치 오류');
      err('구문 오류');
    }
    if (!toks.length) err('빈 수식');
    const ast = parseAdd();
    if (p < toks.length) err(toks[p].t === 'rp' ? '괄호가 맞지 않습니다' : '구문 오류');
    return ast;
  }

  /* ───────────── 컴파일 ───────────── */
  const BIN = {
    '+': add, '-': sub, '*': mul, '/': div, '^': cpow,
    mod: (a, b) => C(fmod(R(a, 'mod'), R(b, 'mod'))),
    '∠': (r, th) => { const t = toRad(R(th, '∠')); const m = R(r, '∠'); return C(trigSnap(m * Math.cos(t), m), trigSnap(m * Math.sin(t), m)); },
  };
  function compileNode(n) {
    switch (n.t) {
      case 'num': { const v = n.v; return () => v; }
      case 'var': {
        const name = n.n;
        return (env) => { const v = env[name]; if (v === undefined) err(`변수 ${name} 에 값이 없습니다`); return v; };
      }
      case 'neg': { const a = compileNode(n.a); return (env) => neg(a(env)); }
      case 'deg': { const a = compileNode(n.a); return (env) => mul(a(env), C(fullTurn() / 360)); }
      case 'bin': { const a = compileNode(n.a), b = compileNode(n.b), f = BIN[n.op]; return (env) => f(a(env), b(env)); }
      case 'call': {
        const def = FUNCS[n.f]; const args = n.args.map(compileNode);
        if (def.lazy) return (env) => def.f(args, env);
        return (env) => def.f(args.map((g) => g(env)));
      }
    }
    err('내부 오류');
  }
  const cache = new Map();
  function compile(src) {
    let f = cache.get(src);
    if (!f) { f = compileNode(parse(src)); if (cache.size > 300) cache.clear(); cache.set(src, f); }
    return f;
  }
  const globals = {};  // Ans, M, A.. 등
  function makeEnv(extra) { const e = Object.assign({}, globals); if (extra) Object.assign(e, extra); return e; }
  function evaluate(src, extra) {
    const z = compile(src)(makeEnv(extra));
    if (!isFinite(z.re) || !isFinite(z.im)) {
      if (Number.isNaN(z.re) || Number.isNaN(z.im)) err('정의되지 않음');
    }
    return isReal(z) ? C(z.re) : z;
  }
  function evalReal(src, extra) {
    if (src === undefined || String(src).trim() === '') err('값을 입력하세요');
    const z = evaluate(String(src), extra);
    if (!isReal(z)) err('실수 값이 필요합니다');
    return z.re;
  }
  // f(var) → 실수 (오류 시 NaN), 그래프·수치해석용
  function makeFn(src, v = 'x') {
    const g = compile(src);
    const env = makeEnv();
    return (x) => {
      env[v] = C(x);
      try { const z = g(env); return isReal(z) ? z.re : NaN; } catch (e) { return NaN; }
    };
  }
  // 방정식 "lhs = rhs" → lhs-rhs 함수
  function makeEquation(src, v = 'x') {
    const parts = String(src).split('=');
    if (parts.length > 2) err('= 는 하나만 사용하세요');
    const expr = parts.length === 2 ? `(${parts[0]})-(${parts[1] || 0})` : parts[0];
    compile(expr); // 구문 검사
    return makeFn(expr, v);
  }

  /* ───────────── 수치해석 ───────────── */
  const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926, 0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961, 0.207784955007898467600689403773245, 0];
  const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518, 0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014, 0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
  const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];
  function gk15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    const fc = f(c);
    let rk = fc * WGK[7], rg = fc * WG[3];
    for (let j = 0; j < 7; j++) {
      const dx = h * XGK[j];
      const s = f(c - dx) + f(c + dx);
      rk += WGK[j] * s;
      if (j % 2 === 1) rg += WG[(j - 1) / 2] * s;
    }
    return { v: rk * h, e: Math.abs((rk - rg) * h) };
  }
  function integrate(f, a, b, tol = 1e-11) {
    if (a === b) return { value: 0, error: 0 };
    if (a > b) { const r = integrate(f, b, a, tol); return { value: -r.value, error: r.error }; }
    let g = f, lo = a, hi = b;
    if (!isFinite(a) && !isFinite(b)) { g = (t) => { const x = t / (1 - t * t); return f(x) * (1 + t * t) / ((1 - t * t) ** 2); }; lo = -1; hi = 1; }
    else if (!isFinite(b)) { g = (t) => f(a + t / (1 - t)) / ((1 - t) ** 2); lo = 0; hi = 1; }
    else if (!isFinite(a)) { g = (t) => f(b - (1 - t) / t) / (t * t); lo = 0; hi = 1; }
    const segs = [];
    const first = gk15(g, lo, hi); segs.push({ a: lo, b: hi, v: first.v, e: first.e });
    let total = first.v, errSum = first.e, it = 0;
    while (errSum > Math.max(tol, tol * Math.abs(total)) && it < 2000) {
      let k = 0; for (let j = 1; j < segs.length; j++) if (segs[j].e > segs[k].e) k = j;
      const s = segs[k], m = (s.a + s.b) / 2;
      const L = gk15(g, s.a, m), Rr = gk15(g, m, s.b);
      segs.splice(k, 1, { a: s.a, b: m, v: L.v, e: L.e }, { a: m, b: s.b, v: Rr.v, e: Rr.e });
      total = 0; errSum = 0; for (const q of segs) { total += q.v; errSum += q.e; }
      it++;
    }
    if (!isFinite(total)) err('적분이 발산하거나 정의되지 않습니다');
    return { value: total, error: errSum };
  }
  function derivative(f, x, n = 1) {
    if (n < 1 || n > 4) err('미분 차수는 1~4');
    const stencil = {
      1: (h) => (f(x + h) - f(x - h)) / (2 * h),
      2: (h) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h),
      3: (h) => (f(x + 2 * h) - 2 * f(x + h) + 2 * f(x - h) - f(x - 2 * h)) / (2 * h * h * h),
      4: (h) => (f(x + 2 * h) - 4 * f(x + h) + 6 * f(x) - 4 * f(x - h) + f(x - 2 * h)) / (h ** 4),
    }[n];
    let h = (n === 1 ? 0.1 : n === 2 ? 0.2 : 0.4) * Math.max(1, Math.abs(x));
    const T = [];
    let best = NaN, bestErr = Infinity;
    for (let i = 0; i < 10; i++) {
      T[i] = [stencil(h)];
      for (let j = 1; j <= i; j++) T[i][j] = T[i][j - 1] + (T[i][j - 1] - T[i - 1][j - 1]) / (4 ** j - 1);
      if (i > 0) {
        const e = Math.abs(T[i][i] - T[i - 1][i - 1]);
        if (e < bestErr) { bestErr = e; best = T[i][i]; }
        else if (e > 2 * bestErr) break;
      }
      h /= 2;
    }
    if (!isFinite(best)) err('이 점에서 미분할 수 없습니다');
    const r = Math.round(best);
    return Math.abs(best - r) < 1e-9 * Math.max(1, Math.abs(best)) ? r : best;
  }
  function bisect(f, a, b, fa, fb) {
    for (let i = 0; i < 200; i++) {
      const m = (a + b) / 2, fm = f(m);
      if (fm === 0 || (b - a) / 2 < 1e-15 * Math.max(1, Math.abs(m))) return m;
      if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; }
    }
    return (a + b) / 2;
  }
  function golden(g, a, b) { // g 최소화
    const r = (Math.sqrt(5) - 1) / 2;
    let c = b - r * (b - a), d = a + r * (b - a), gc = g(c), gd = g(d);
    for (let i = 0; i < 120; i++) {
      if (gc < gd) { b = d; d = c; gd = gc; c = b - r * (b - a); gc = g(c); }
      else { a = c; c = d; gc = gd; d = a + r * (b - a); gd = g(d); }
    }
    return (a + b) / 2;
  }
  function cleanNum(x) {
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-10 * Math.max(1, Math.abs(x))) return r;
    return x;
  }
  function findRoots(f, a, b, n = 4000) {
    const roots = [];
    const h = (b - a) / n;
    let xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const x = a + i * h; xs.push(x); ys.push(f(x)); }
    let scale = 0; ys.forEach((y) => { if (isFinite(y)) scale = Math.max(scale, Math.abs(y)); });
    const addRoot = (r) => {
      if (!isFinite(r)) return;
      const fr = f(r);
      if (!isFinite(fr) || Math.abs(fr) > 1e-6 * Math.max(1, scale * 1e-3)) return;
      r = cleanNum(r);
      if (!roots.some((q) => Math.abs(q - r) < Math.max(1e-9, h * 1e-3))) roots.push(r);
    };
    for (let i = 0; i < n; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      if (!isFinite(y0) || !isFinite(y1)) continue;
      if (y0 === 0) { addRoot(xs[i]); continue; }
      if (Math.sign(y0) !== Math.sign(y1) && y1 !== 0) addRoot(bisect(f, xs[i], xs[i + 1], y0, y1));
      if (i > 0 && isFinite(ys[i - 1])) { // 접하는 근(중근) 탐색
        const ym = ys[i - 1];
        if (Math.abs(y0) <= Math.abs(ym) && Math.abs(y0) <= Math.abs(y1) && Math.sign(ym) === Math.sign(y0) && Math.sign(y0) === Math.sign(y1)) {
          const r = golden((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
          if (Math.abs(f(r)) < 1e-10) addRoot(r);
        }
      }
    }
    if (isFinite(ys[n]) && ys[n] === 0) addRoot(xs[n]);
    return roots.sort((p, q) => p - q);
  }
  function findExtrema(f, a, b, n = 2000) {
    const out = [];
    const h = (b - a) / n;
    let prev = f(a), cur = f(a + h);
    for (let i = 1; i < n; i++) {
      const x = a + i * h, nxt = f(x + h);
      if (isFinite(prev) && isFinite(cur) && isFinite(nxt)) {
        if (cur > prev && cur >= nxt) { const r = golden((t) => -f(t), x - h, x + h); out.push({ x: cleanNum(r), y: f(r), type: 'max' }); }
        else if (cur < prev && cur <= nxt) { const r = golden(f, x - h, x + h); out.push({ x: cleanNum(r), y: f(r), type: 'min' }); }
      }
      prev = cur; cur = nxt;
    }
    return out;
  }
  function limit(f, a, side) {
    const seq = [];
    for (let k = 1; k <= 8; k++) {
      const x = !isFinite(a) ? Math.sign(a) * Math.pow(10, k) : a + side * Math.pow(10, -k) * Math.max(1, Math.abs(a) * 0.1);
      seq.push(f(x));
    }
    const last = seq[seq.length - 1], prev = seq[seq.length - 2];
    if (!isFinite(last)) return last === Infinity || last === -Infinity ? last : NaN;
    if (Math.abs(last) > 1e6 && Math.abs(last) > Math.abs(prev) * 5) return Math.sign(last) * Infinity;
    if (seq.some((v) => !isFinite(v))) return NaN;
    // 리처드슨 외삽 (오차 ∝ h)
    const R = []; for (let k = 0; k + 1 < seq.length; k++) R.push((10 * seq[k + 1] - seq[k]) / 9);
    let bi = 1, bd = Infinity;
    for (let i = 1; i < R.length; i++) { const d = Math.abs(R[i] - R[i - 1]); if (d < bd) { bd = d; bi = i; } }
    const best = R[bi];
    if (bd > 1e-4 * Math.max(1, Math.abs(best))) return NaN;
    return cleanNum(Number(best.toPrecision(10)));
  }
  // 테일러 계수: 코시 적분 공식(복소 원주 위 사다리꼴)
  function taylor(src, a, order) {
    const g = compile(src);
    const saved = state.angle; state.angle = 'RAD';
    try {
      const N = 64, r = 0.5;
      const env = makeEnv();
      const vals = [];
      for (let j = 0; j < N; j++) {
        const th = 2 * Math.PI * j / N;
        env.x = C(a + r * Math.cos(th), r * Math.sin(th));
        const z = g(env);
        if (!isFinite(z.re) || !isFinite(z.im)) err('이 점 근방에서 해석적이지 않습니다');
        vals.push(z);
      }
      const co = [];
      for (let k = 0; k <= order; k++) {
        let s = C(0);
        for (let j = 0; j < N; j++) { const th = -2 * Math.PI * j * k / N; s = add(s, mul(vals[j], C(Math.cos(th), Math.sin(th)))); }
        let c = s.re / N / Math.pow(r, k);
        if (Math.abs(c) < 1e-12) c = 0;
        co.push(cleanNum(Number(c.toPrecision(11))));
      }
      return co;
    } finally { state.angle = saved; }
  }

  /* 다항식 근 (Durand–Kerner + 뉴턴 보정), 계수는 높은 차수부터 */
  function polyRoots(coef) {
    let c = coef.slice();
    while (c.length && Math.abs(c[0]) === 0) c.shift();
    const n = c.length - 1;
    if (n < 1) err('최고차 계수가 0입니다');
    let zeroRoots = 0;
    while (c.length > 1 && c[c.length - 1] === 0) { c.pop(); zeroRoots++; }
    const roots = [];
    for (let k = 0; k < zeroRoots; k++) roots.push(C(0));
    const m = c.length - 1;
    if (m === 1) roots.push(C(-c[1] / c[0]));
    else if (m === 2) {
      const [A, B, Cc] = c; const D = B * B - 4 * A * Cc;
      if (D >= 0) { const q = -0.5 * (B + Math.sign(B || 1) * Math.sqrt(D)); roots.push(C(q / A), C(q === 0 ? 0 : Cc / q)); }
      else { const s = Math.sqrt(-D) / (2 * A); roots.push(C(-B / (2 * A), s), C(-B / (2 * A), -s)); }
    } else if (m > 2) {
      const a = c.map((v) => C(v / c[0]));
      const ev = (z) => { let r = C(1); for (let i = 1; i <= m; i++) r = add(mul(r, z), a[i]); return r; };
      const evd = (z) => { let r = C(m); for (let i = 1; i < m; i++) r = add(mul(r, z), C(a[i].re * (m - i), a[i].im * (m - i))); return r; };
      let bound = 1; for (let i = 1; i <= m; i++) bound = Math.max(bound, Math.pow(cabs(a[i]), 1 / i) * 2);
      let z = []; for (let k = 0; k < m; k++) z.push(cpow(C(0.4, 0.9), C(k)));
      z = z.map((v) => mul(v, C(bound * 0.5)));
      for (let it = 0; it < 2000; it++) {
        let delta = 0;
        for (let i = 0; i < m; i++) {
          let den = C(1);
          for (let j = 0; j < m; j++) if (j !== i) den = mul(den, sub(z[i], z[j]));
          if (den.re === 0 && den.im === 0) den = C(1e-12);
          const step = div(ev(z[i]), den);
          z[i] = sub(z[i], step);
          delta = Math.max(delta, cabs(step));
        }
        if (delta < 1e-15) break;
      }
      z = z.map((r) => { for (let k = 0; k < 3; k++) { const d = evd(r); if (cabs(d) === 0) break; const s = div(ev(r), d); if (!isFinite(s.re)) break; r = sub(r, s); } return r; });
      roots.push(...z);
    }
    return roots.map((r) => {
      let re = r.re, im = r.im;
      if (Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re))) im = 0;
      if (Math.abs(re) < 1e-12 * Math.max(1, Math.abs(im))) re = 0;
      return C(cleanNum(re), im === 0 ? 0 : cleanNum(im));
    }).sort((p, q) => ((p.im === 0 ? 0 : 1) - (q.im === 0 ? 0 : 1)) || (p.re - q.re) || (q.im - p.im));
  }

  /* ───────────── 행렬 ───────────── */
  const Mx = {
    zeros: (r, c) => Array.from({ length: r }, () => new Array(c).fill(0)),
    eye: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))),
    clone: (A) => A.map((r) => r.slice()),
    dims: (A) => [A.length, A[0].length],
    add(A, B, s = 1) { const [r, c] = Mx.dims(A); const [r2, c2] = Mx.dims(B); if (r !== r2 || c !== c2) err('행렬 크기가 같아야 합니다'); return A.map((row, i) => row.map((v, j) => v + s * B[i][j])); },
    scale: (A, k) => A.map((r) => r.map((v) => v * k)),
    mul(A, B) {
      const [r, n] = Mx.dims(A), [n2, c] = Mx.dims(B);
      if (n !== n2) err(`곱셈 불가: (${r}×${n})·(${n2}×${c})`);
      const out = Mx.zeros(r, c);
      for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let k = 0; k < n; k++) s += A[i][k] * B[k][j]; out[i][j] = s; }
      return out;
    },
    T: (A) => A[0].map((_, j) => A.map((r) => r[j])),
    square(A) { if (A.length !== A[0].length) err('정사각행렬이 필요합니다'); },
    lu(A) {
      const n = A.length, M = Mx.clone(A); const perm = [...Array(n).keys()]; let sign = 1;
      for (let k = 0; k < n; k++) {
        let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
        if (M[p][k] === 0) return { M, perm, sign, singular: true };
        if (p !== k) { [M[p], M[k]] = [M[k], M[p]]; [perm[p], perm[k]] = [perm[k], perm[p]]; sign = -sign; }
        for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; M[i][k] = f; for (let j = k + 1; j < n; j++) M[i][j] -= f * M[k][j]; }
      }
      return { M, perm, sign, singular: false };
    },
    det(A) { Mx.square(A); const { M, sign, singular } = Mx.lu(A); if (singular) return 0; let d = sign; for (let i = 0; i < A.length; i++) d *= M[i][i]; return cleanNum(d); },
    inv(A) {
      Mx.square(A);
      const n = A.length; const M = A.map((r, i) => r.concat(Mx.eye(n)[i]));
      const scale = Math.max(...A.flat().map(Math.abs), 1e-300);
      for (let k = 0; k < n; k++) {
        let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
        if (Math.abs(M[p][k]) < 1e-13 * scale) err('역행렬이 존재하지 않습니다 (특이행렬)');
        [M[p], M[k]] = [M[k], M[p]];
        const piv = M[k][k]; for (let j = 0; j < 2 * n; j++) M[k][j] /= piv;
        for (let i = 0; i < n; i++) if (i !== k) { const f = M[i][k]; if (f) for (let j = 0; j < 2 * n; j++) M[i][j] -= f * M[k][j]; }
      }
      return M.map((r) => r.slice(n));
    },
    rref(A) {
      const M = Mx.clone(A); const [r, c] = Mx.dims(M); let lead = 0; const pivots = [];
      const scale = Math.max(...A.flat().map(Math.abs), 1e-300);
      for (let i = 0; i < r && lead < c; lead++) {
        let p = i; for (let k = i + 1; k < r; k++) if (Math.abs(M[k][lead]) > Math.abs(M[p][lead])) p = k;
        if (Math.abs(M[p][lead]) < 1e-11 * scale) { for (let k = i; k < r; k++) M[k][lead] = 0; continue; }
        [M[p], M[i]] = [M[i], M[p]];
        const piv = M[i][lead]; for (let j = 0; j < c; j++) M[i][j] /= piv;
        for (let k = 0; k < r; k++) if (k !== i) { const f = M[k][lead]; if (f) for (let j = 0; j < c; j++) M[k][j] -= f * M[i][j]; }
        pivots.push(lead); i++;
      }
      return { M: M.map((row) => row.map((v) => (Math.abs(v) < 1e-12 * scale ? 0 : cleanNum(v)))), pivots };
    },
    rank: (A) => Mx.rref(A).pivots.length,
    trace(A) { Mx.square(A); return A.reduce((s, r, i) => s + r[i], 0); },
    pow(A, k) {
      Mx.square(A); k = needInt(k, '거듭제곱');
      let base = k < 0 ? Mx.inv(A) : A, r = Mx.eye(A.length); k = Math.abs(k);
      while (k > 0) { if (k & 1) r = Mx.mul(r, base); base = Mx.mul(base, base); k >>= 1; }
      return r;
    },
    charPoly(A) { // Faddeev–LeVerrier, λ^n + c1 λ^(n-1) + ...
      Mx.square(A); const n = A.length; let M = Mx.zeros(n, n); const c = [1];
      for (let k = 1; k <= n; k++) {
        M = Mx.add(Mx.mul(A, M), Mx.scale(Mx.eye(n), c[k - 1]));
        const AM = Mx.mul(A, M);
        c.push(-Mx.trace(AM) / k);
      }
      return c;
    },
    eigen(A) {
      const cp = Mx.charPoly(A);
      const vals = polyRoots(cp);
      const n = A.length;
      const vecs = vals.map((l) => {
        if (l.im !== 0) return null;
        const B = A.map((r, i) => r.map((v, j) => v - (i === j ? l.re : 0)));
        const { M, pivots } = Mx.rref(B);
        let free = [...Array(n).keys()].filter((j) => !pivots.includes(j));
        if (!free.length) { // 수치 오차 → 가장 작은 피벗을 자유변수로
          free = [pivots[pivots.length - 1]];
        }
        const f = free[0]; const v = new Array(n).fill(0); v[f] = 1;
        pivots.forEach((pc, i) => { if (pc !== f) v[pc] = -M[i][f]; });
        const norm = Math.hypot(...v);
        return v.map((x) => cleanNum(x / norm));
      });
      return { vals, vecs, cp };
    },
    solve(A, b) { // A x = b
      const n = A.length;
      const aug = A.map((r, i) => r.concat([b[i]]));
      const { M, pivots } = Mx.rref(aug);
      if (pivots.includes(n)) return { status: 'none' };
      if (pivots.length < n) return { status: 'many', M };
      return { status: 'ok', x: M.map((r) => r[n]) };
    },
  };

  /* ───────────── 통계 ───────────── */
  function variance(v, ddof) { const m = v.reduce((s, x) => s + x, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - ddof); }
  function quantile(sorted, q) { // 선형 보간 (Excel QUARTILE.INC 방식)
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function stats1(v) {
    const n = v.length; if (!n) err('데이터가 없습니다');
    const s = v.slice().sort((a, b) => a - b);
    const sum = v.reduce((a, b) => a + b, 0), sum2 = v.reduce((a, b) => a + b * b, 0);
    const mean = sum / n;
    const m2 = v.reduce((a, x) => a + (x - mean) ** 2, 0);
    const m3 = v.reduce((a, x) => a + (x - mean) ** 3, 0), m4 = v.reduce((a, x) => a + (x - mean) ** 4, 0);
    const sdp = Math.sqrt(m2 / n), sds = n > 1 ? Math.sqrt(m2 / (n - 1)) : NaN;
    const counts = new Map(); v.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    const maxC = Math.max(...counts.values());
    const modes = maxC > 1 ? [...counts.entries()].filter(([, c]) => c === maxC).map(([x]) => x).sort((a, b) => a - b) : [];
    const geo = s[0] > 0 ? Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / n) : NaN;
    const harm = s[0] > 0 ? n / v.reduce((a, x) => a + 1 / x, 0) : NaN;
    return {
      n, sum, sum2, mean, median: quantile(s, 0.5), modes, min: s[0], max: s[n - 1], range: s[n - 1] - s[0],
      q1: quantile(s, 0.25), q3: quantile(s, 0.75), iqr: quantile(s, 0.75) - quantile(s, 0.25),
      sdp, sds, varp: m2 / n, vars: n > 1 ? m2 / (n - 1) : NaN, cv: sds / mean,
      skew: sdp ? (m3 / n) / sdp ** 3 : NaN, kurt: sdp ? (m4 / n) / sdp ** 4 - 3 : NaN, geo, harm,
      sem: sds / Math.sqrt(n), sorted: s,
    };
  }
  function linfit(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    if (sxx === 0) err('x 값이 모두 같습니다');
    const b = sxy / sxx, a = my - b * mx;
    const r = syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy);
    return { a, b, r };
  }
  function regression(xs, ys, type) {
    const n = xs.length; if (n < 2 || ys.length !== n) err('x, y 데이터 개수가 같고 2개 이상이어야 합니다');
    let model, fn, eq;
    const rsq = (f) => { const my = ys.reduce((a, b) => a + b, 0) / n; let ssr = 0, sst = 0; ys.forEach((y, i) => { ssr += (y - f(xs[i])) ** 2; sst += (y - my) ** 2; }); return sst === 0 ? 1 : 1 - ssr / sst; };
    switch (type) {
      case 'lin': { const { a, b, r } = linfit(xs, ys); fn = (x) => a + b * x; model = { a, b, r }; eq = ['y = a + b·x', { a, b }]; break; }
      case 'quad': {
        if (n < 3) err('2차 회귀는 3개 이상의 점이 필요합니다');
        const S = (p) => xs.reduce((s, x) => s + x ** p, 0), Sy = (p) => xs.reduce((s, x, i) => s + x ** p * ys[i], 0);
        const M = [[n, S(1), S(2)], [S(1), S(2), S(3)], [S(2), S(3), S(4)]];
        const sol = Mx.solve(M, [Sy(0), Sy(1), Sy(2)]); if (sol.status !== 'ok') err('회귀 계산 불가');
        const [a, b, c] = sol.x; fn = (x) => a + b * x + c * x * x; model = { a, b, c }; eq = ['y = a + b·x + c·x²', { a, b, c }]; break;
      }
      case 'exp': {
        if (ys.some((y) => y <= 0)) err('지수 회귀: y > 0 이어야 합니다');
        const { a, b } = linfit(xs, ys.map(Math.log)); const A = Math.exp(a); fn = (x) => A * Math.exp(b * x); model = { a: A, b }; eq = ['y = a·eᵇˣ', { a: A, b }]; break;
      }
      case 'pow': {
        if (ys.some((y) => y <= 0) || xs.some((x) => x <= 0)) err('거듭제곱 회귀: x, y > 0 이어야 합니다');
        const { a, b } = linfit(xs.map(Math.log), ys.map(Math.log)); const A = Math.exp(a); fn = (x) => A * Math.pow(x, b); model = { a: A, b }; eq = ['y = a·xᵇ', { a: A, b }]; break;
      }
      case 'log': {
        if (xs.some((x) => x <= 0)) err('로그 회귀: x > 0 이어야 합니다');
        const { a, b } = linfit(xs.map(Math.log), ys); fn = (x) => a + b * Math.log(x); model = { a, b }; eq = ['y = a + b·ln x', { a, b }]; break;
      }
      default: err('회귀 유형 오류');
    }
    const r2 = rsq(fn);
    return { fn, model, eq, r2, r: type === 'lin' ? model.r : Math.sign(model.b || 1) * Math.sqrt(Math.max(0, r2)) };
  }

  /* ───────────── 확률분포 ───────────── */
  const Dist = {
    normal: { pdf: (x, m, s) => normPdf((x - m) / s) / s, cdf: (x, m, s) => normCdf((x - m) / s), inv: (p, m, s) => m + s * normInv(p) },
    binomPmf(k, n, p) { if (k < 0 || k > n) return 0; if (p === 0) return k === 0 ? 1 : 0; if (p === 1) return k === n ? 1 : 0; return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p)); },
    binomCdf(k, n, p) { let s = 0; for (let i = 0; i <= Math.min(k, n); i++) s += Dist.binomPmf(i, n, p); return Math.min(1, s); },
    poisPmf(k, l) { if (k < 0) return 0; return Math.exp(-l + k * Math.log(l) - lgamma(k + 1)); },
    poisCdf(k, l) { let s = 0; for (let i = 0; i <= k; i++) s += Dist.poisPmf(i, l); return Math.min(1, s); },
    tPdf: (t, v) => Math.exp(lgamma((v + 1) / 2) - lgamma(v / 2)) / Math.sqrt(v * Math.PI) * Math.pow(1 + t * t / v, -(v + 1) / 2),
    tCdf(t, v) { if (t === 0) return 0.5; const I = integrate((x) => Dist.tPdf(x, v), 0, Math.abs(t), 1e-13).value; return t > 0 ? 0.5 + I : 0.5 - I; },
    tInv(p, v) { if (p <= 0 || p >= 1) err('확률은 0과 1 사이'); let x = normInv(p); for (let i = 0; i < 60; i++) { const e = Dist.tCdf(x, v) - p; const d = Dist.tPdf(x, v); const s = e / d; x -= s; if (Math.abs(s) < 1e-13 * Math.max(1, Math.abs(x))) break; } return x; },
    chiPdf: (x, k) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lgamma(k / 2))),
    chiCdf(x, k) { if (x <= 0) return 0; return Math.min(1, gammaP(k / 2, x / 2)); },
    expPdf: (x, l) => (x < 0 ? 0 : l * Math.exp(-l * x)),
    expCdf: (x, l) => (x < 0 ? 0 : 1 - Math.exp(-l * x)),
  };
  function gammaP(a, x) { // 정규화 하불완전감마
    if (x < a + 1) { let sum = 1 / a, term = sum; for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-16) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }

  /* ───────────── 표시 형식 ───────────── */
  const fmtOpt = { mode: 'NORM', digits: 4, sep: false, polar: false };
  function toFraction(x, maxDen = 1e6) {
    if (!isFinite(x)) return null;
    const sgn = x < 0 ? -1 : 1; x = Math.abs(x);
    if (Number.isInteger(x)) return { n: sgn * x, d: 1 };
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    for (let i = 0; i < 64; i++) {
      const a = Math.floor(b);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, x)) return { n: sgn * h1, d: k1 };
      const f = b - a; if (f < 1e-15) break; b = 1 / f;
    }
    return null;
  }
  function groupInt(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function withSep(str) {
    if (!fmtOpt.sep) return str;
    const m = /^(-?)(\d+)(.*)$/.exec(str); if (!m) return str;
    return m[1] + groupInt(m[2]) + m[3];
  }
  const trimZ = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  function sciParts(x, sig) {
    let [m, e] = x.toExponential(Math.max(0, sig - 1)).split('e');
    return { m, e: parseInt(e, 10) };
  }
  function fmtReal(x, opt = fmtOpt) {
    if (Number.isNaN(x)) return '정의되지 않음';
    if (!isFinite(x)) return x > 0 ? '∞' : '-∞';
    if (x === 0) return opt.mode === 'FIX' ? (0).toFixed(opt.digits) : '0';
    const ax = Math.abs(x);
    if (opt.mode === 'FIX') {
      if (ax >= 1e15 || ax < Math.pow(10, -opt.digits) / 2) { const p = sciParts(x, opt.digits + 1); return `${p.m}E${p.e}`; }
      return withSep(x.toFixed(opt.digits));
    }
    if (opt.mode === 'SCI') { const p = sciParts(x, opt.digits); return `${p.m}E${p.e}`; }
    if (opt.mode === 'ENG') {
      let { m, e } = sciParts(x, 12); let mm = parseFloat(m);
      const e3 = Math.floor(e / 3) * 3; mm *= Math.pow(10, e - e3);
      let s = trimZ(mm.toPrecision(12)); if (Math.abs(parseFloat(s)) >= 1000) { s = trimZ((parseFloat(s) / 1000).toPrecision(12)); return `${s}E${e3 + 3}`; }
      return e3 === 0 ? s : `${s}E${e3}`;
    }
    // NORM
    const v = Number(x.toPrecision(12)), av = Math.abs(v);
    if (av >= 1e12 || av < 1e-9) { const p = sciParts(v, 12); return `${trimZ(p.m)}E${p.e}`; }
    const dec = Math.max(0, 11 - Math.floor(Math.log10(av)));
    return withSep(trimZ(v.toFixed(Math.min(20, dec))));
  }
  function fmtCx(z, opt = fmtOpt) {
    if (isReal(z)) return fmtReal(z.re, opt);
    if (opt.polar) return `${fmtReal(cabs(z), opt)}∠${fmtReal(fromRad(carg(z)), opt)}${state.angle === 'DEG' ? '°' : ''}`;
    let re = z.re, im = z.im;
    if (Math.abs(re) < 1e-12 * Math.abs(im)) re = 0;
    const ims = Math.abs(im) === 1 ? '' : fmtReal(Math.abs(im), opt);
    if (re === 0) return `${im < 0 ? '-' : ''}${ims}i`;
    return `${fmtReal(re, opt)} ${im < 0 ? '-' : '+'} ${ims}i`;
  }
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  const supify = (s) => String(s).split('').map((c) => SUP[c] || c).join('');
  // 화면 표시용 (E 표기 → ×10ⁿ, - → −)
  function pretty(s) {
    return String(s).replace(/(\d)E(-?\d+)/g, (_, d, e) => `${d}×10${supify(e)}`).replace(/-/g, '−');
  }
  function toDMS(x) {
    const s = x < 0 ? '-' : ''; x = Math.abs(x);
    let d = Math.floor(x), mf = (x - d) * 60, m = Math.floor(mf), sec = (mf - m) * 60;
    sec = Math.round(sec * 1000) / 1000; if (sec >= 60) { sec -= 60; m++; } if (m >= 60) { m -= 60; d++; }
    return `${s}${d}°${m}′${trimZ(sec.toFixed(3))}″`;
  }
  function fracString(x, mixed) {
    const f = toFraction(x, 100000);
    if (!f || f.d === 1) return null;
    if (mixed && Math.abs(f.n) > f.d) { const w = Math.trunc(f.n / f.d), r = Math.abs(f.n % f.d); return `${w} ${r}/${f.d}`; }
    return `${f.n}/${f.d}`;
  }
  function exactForms(x) {
    const out = [];
    if (!isFinite(x) || x === 0 || Number.isInteger(x) || Math.abs(x) > 1e9) return out;
    const fr = toFraction(x, 10000);
    if (fr && fr.d > 1) { out.push({ k: '분수', v: `${fr.n}/${fr.d}` }); if (Math.abs(fr.n) > fr.d) out.push({ k: '대분수', v: fracString(x, true) }); return out; }
    const fp = toFraction(x / Math.PI, 360);
    if (fp && Math.abs(fp.n) <= 720) {
      const num = fp.n === 1 ? 'π' : fp.n === -1 ? '-π' : `${fp.n}π`;
      out.push({ k: 'π 표현', v: fp.d === 1 ? num : `${num}/${fp.d}` });
    }
    const f2 = toFraction(x * x, 10000);
    if (f2 && f2.d <= 10000 && Math.abs(f2.n) < 1e7) {
      let rad = Math.abs(f2.n) * f2.d, k = 1;
      for (let p = 2; p * p <= rad; p++) while (rad % (p * p) === 0) { rad /= p * p; k *= p; }
      if (rad > 1) {
        const g = gcd2(k, f2.d), kk = k / g, dd = f2.d / g, sg = x < 0 ? '-' : '';
        out.push({ k: '근호', v: `${sg}${kk === 1 ? '' : kk}√${rad}${dd === 1 ? '' : '/' + dd}` });
      }
    }
    const fe = toFraction(Math.log(Math.abs(x)), 12);
    if (fe && fe.d <= 6 && Math.abs(fe.n) <= 24 && fe.n !== 0 && !(fe.d === 1 && fe.n === 0)) {
      out.push({ k: '지수', v: `${x < 0 ? '-' : ''}e${fe.d === 1 ? supify(fe.n) : '^(' + fe.n + '/' + fe.d + ')'}` });
    }
    return out;
  }
  const SI = [[24, 'Y'], [21, 'Z'], [18, 'E'], [15, 'P'], [12, 'T'], [9, 'G'], [6, 'M'], [3, 'k'], [0, ''], [-3, 'm'], [-6, 'µ'], [-9, 'n'], [-12, 'p'], [-15, 'f'], [-18, 'a']];
  function siString(x, unit = '') {
    if (!isFinite(x)) return fmtReal(x);
    if (x === 0) return `0 ${unit}`.trim();
    const e = Math.floor(Math.log10(Math.abs(x)) / 3) * 3;
    const p = SI.find((q) => q[0] === Math.max(-18, Math.min(24, e)));
    const v = x / Math.pow(10, p[0]);
    return `${trimZ(Number(v.toPrecision(6)).toString())} ${p[1]}${unit}`.trim();
  }

  global.Engine = {
    CalcError, Cx, C, isReal, add, sub, mul, div, cpow, cabs, carg,
    state, toRad, fromRad, compile, parse, evaluate, evalReal, makeFn, makeEquation, globals,
    FUNCS, gamma, lgamma, erf, normCdf, normInv, factorize, isPrime, gcd2, lcm2, nCr, nPr,
    integrate, derivative, findRoots, findExtrema, limit, taylor, polyRoots, cleanNum,
    Mx, stats1, regression, Dist,
    fmtOpt, fmtReal, fmtCx, pretty, toFraction, fracString, toDMS, exactForms, siString, supify, trimZ,
  };
  if (typeof module !== 'undefined') module.exports = global.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
