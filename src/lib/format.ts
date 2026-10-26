// Money is shown in the dataset's currency, set once when data is loaded
let currency = "USD";
let full = make(currency);

function make(code: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 0 });
  } catch {
    // Unknown currency code: show it as a prefix instead
    const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
    return { format: (n: number) => `${code} ${plain.format(n)}` };
  }
}

export function setCurrency(code: string) {
  currency = code.toUpperCase();
  full = make(currency);
}

export const money = (n: number) => full.format(n);

// $9.6M, $412K, $850 (or MVR 9.6M for currencies without a symbol)
export function moneyShort(n: number) {
  const abs = Math.abs(n);
  const unit = abs >= 1e6 ? { d: 1e6, s: "M", digits: abs >= 1e7 ? 1 : 2 } : abs >= 1e3 ? { d: 1e3, s: "K", digits: 0 } : null;
  if (!unit) return full.format(n);
  const scaled = (n / unit.d).toFixed(unit.digits);
  const symbol = full.format(0).replace(/[\d.,\s]/g, "");
  return symbol.length <= 2 ? `${n < 0 ? "−" : ""}${symbol}${scaled.replace("-", "")}${unit.s}` : `${currency} ${scaled}${unit.s}`;
}

export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;

export function date(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
