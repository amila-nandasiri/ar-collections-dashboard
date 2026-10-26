const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const usd = (n: number) => usd0.format(n);

// $9.6M, $412K, $850
export function usdShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return usd0.format(n);
}

export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;

export function date(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
