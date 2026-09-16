/** Ornstein–Uhlenbeck pair residual.

X = log(A) − α − β log(B)
X_{t+1} = C + φ X_t + ε
κ = −ln(φ) / dt
θ = C / (1 − φ)
half-life (trading days) = −ln(2) / ln(φ)  ×  (dt × 252)
*/

export interface OuFit {
  beta: number;
  alpha: number;
  kappa: number;
  theta: number;
  sigma: number;
  phi: number;
  halfLife: number;
  eqStd: number;
  r2: number;
  n: number;
}

const MIN_N = 40;

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function olsHedge(
  logA: number[],
  logB: number[],
): { alpha: number; beta: number; r2: number } | null {
  const n = Math.min(logA.length, logB.length);
  if (n < MIN_N) return null;
  const a = logA.slice(-n);
  const b = logB.slice(-n);
  const mb = mean(b);
  const ma = mean(a);
  let cov = 0;
  let vb = 0;
  let va = 0;
  for (let i = 0; i < n; i++) {
    const db = b[i]! - mb;
    const da = a[i]! - ma;
    cov += db * da;
    vb += db * db;
    va += da * da;
  }
  if (vb < 1e-16) return null;
  const beta = cov / vb;
  const alpha = ma - beta * mb;
  const r2 = va < 1e-16 ? 0 : Math.min(1, (cov * cov) / (vb * va));
  return { alpha, beta, r2 };
}

export function residual(
  logA: number[],
  logB: number[],
  alpha: number,
  beta: number,
): number[] {
  const n = Math.min(logA.length, logB.length);
  const x: number[] = [];
  for (let i = 0; i < n; i++) x.push(logA[i]! - alpha - beta * logB[i]!);
  return x;
}

export function calibrateOu(
  x: number[],
  dt: number,
): {
  kappa: number;
  theta: number;
  sigma: number;
  phi: number;
  halfLife: number;
  eqStd: number;
  n: number;
} | null {
  if (x.length < MIN_N || dt <= 0) return null;
  const y: number[] = [];
  const xx: number[] = [];
  for (let i = 1; i < x.length; i++) {
    y.push(x[i]!);
    xx.push(x[i - 1]!);
  }
  const mx = mean(xx);
  const my = mean(y);
  let cov = 0;
  let vx = 0;
  for (let i = 0; i < xx.length; i++) {
    const dx = xx[i]! - mx;
    cov += dx * (y[i]! - my);
    vx += dx * dx;
  }
  if (vx < 1e-18) return null;
  const phi = cov / vx;
  if (!(phi > 0) || phi >= 0.999) return null;
  const C = my - phi * mx;
  const theta = C / (1 - phi);
  const kappa = -Math.log(phi) / dt;
  if (!(kappa > 0) || !Number.isFinite(kappa)) return null;
  let sse = 0;
  for (let i = 0; i < y.length; i++) {
    const e = y[i]! - C - phi * xx[i]!;
    sse += e * e;
  }
  const sigE = Math.sqrt(sse / Math.max(1, y.length - 2));
  const eqStd = sigE / Math.sqrt(Math.max(1e-12, 1 - phi * phi));
  const sigma = sigE / Math.sqrt(dt);
  const halfLifeBars = -Math.LN2 / Math.log(phi);
  const halfLife = halfLifeBars * dt * 252;
  if (!Number.isFinite(halfLife) || !Number.isFinite(eqStd)) return null;
  return {
    kappa,
    theta,
    sigma,
    phi,
    halfLife,
    eqStd,
    n: x.length,
  };
}

export function fitPairOu(
  a: number[],
  b: number[],
  dt: number,
): OuFit | null {
  if (a.length < MIN_N || b.length < MIN_N) return null;
  const n = Math.min(a.length, b.length);
  const aS = a.slice(-n);
  const bS = b.slice(-n);
  const logA: number[] = [];
  const logB: number[] = [];
  for (let i = 0; i < n; i++) {
    const pa = aS[i]!;
    const pb = bS[i]!;
    if (!(pa > 0) || !(pb > 0)) return null;
    logA.push(Math.log(pa));
    logB.push(Math.log(pb));
  }
  const hedge = olsHedge(logA, logB);
  if (!hedge) return null;
  const x = residual(logA, logB, hedge.alpha, hedge.beta);
  const ou = calibrateOu(x, dt);
  if (!ou) return null;
  return {
    beta: hedge.beta,
    alpha: hedge.alpha,
    r2: hedge.r2,
    ...ou,
  };
}

export function spreadX(a: number, b: number, fit: Pick<OuFit, "alpha" | "beta">) {
  return Math.log(a) - fit.alpha - fit.beta * Math.log(b);
}

export function ouZ(x: number, fit: Pick<OuFit, "theta" | "eqStd">) {
  if (!(fit.eqStd > 1e-12)) return 0;
  return (x - fit.theta) / fit.eqStd;
}

export function isTradable(fit: OuFit): boolean {
  return (
    fit.kappa > 0 &&
    fit.phi > 0 &&
    fit.phi < 0.999 &&
    fit.halfLife >= 1 &&
    fit.halfLife <= 40 &&
    fit.r2 >= 0.35 &&
    fit.eqStd > 1e-8
  );
}

export const DT_DAILY = 1 / 252;
export const DT_HOURLY = 1 / (252 * 6);
