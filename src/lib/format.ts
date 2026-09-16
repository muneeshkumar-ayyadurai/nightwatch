const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inr2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function inr(n: number, digits: 0 | 2 = 0): string {
  return (digits === 2 ? inr2 : inr0).format(n);
}

export const usd = inr;

export function inrSigned(n: number, digits: 0 | 2 = 0): string {
  const body = (digits === 2 ? inr2 : inr0).format(Math.abs(n));
  if (n > 0.004) return `+${body}`;
  if (n < -0.004) return `−${body}`;
  return body;
}

export const usdSigned = inrSigned;

export function pct(n: number, digits = 1): string {
  const v = (n * 100).toFixed(digits);
  if (n > 0.00005) return `+${v}%`;
  if (n < -0.00005) return `−${Math.abs(n * 100).toFixed(digits)}%`;
  return `${v}%`;
}

export function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

const istFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export const START_MS = Date.UTC(2026, 8, 14, 3, 45, 0);

export function simClock(hours: number, ts?: number): string {
  const t = ts && ts > 0 ? ts : START_MS + hours * 3600_000;
  return `${istFmt.format(new Date(t))} IST`;
}

export function lakh(n: number): string {
  return `${(n / 100_000).toFixed(1)}L`;
}
