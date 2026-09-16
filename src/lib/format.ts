const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function usd(n: number, digits: 0 | 2 = 0): string {
  return (digits === 2 ? usd2 : usd0).format(n);
}

export function usdSigned(n: number, digits: 0 | 2 = 0): string {
  const body = (digits === 2 ? usd2 : usd0).format(Math.abs(n));
  if (n > 0.004) return `+${body}`;
  if (n < -0.004) return `−${body}`;
  return body;
}

export function pct(n: number, digits = 1): string {
  const v = (n * 100).toFixed(digits);
  if (n > 0.00005) return `+${v}%`;
  if (n < -0.00005) return `−${Math.abs(n * 100).toFixed(digits)}%`;
  return `${v}%`;
}

export function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

const simFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/New_York",
});

export const START_MS = Date.UTC(2026, 8, 14, 13, 30, 0);

export function simClock(hours: number): string {
  return `${simFmt.format(new Date(START_MS + hours * 3600_000))} ET`;
}
