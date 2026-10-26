"""
Generate a realistic, fully fictional accounts-receivable dataset for a
Maldives seaplane / aviation operator.

Outputs (in ../data):
  customers.csv  - 100 customers with terms, credit limits and risk ratings
  invoices.csv   - ~18 months of invoices with payment status as of AS_OF
  payments.csv   - every payment received against those invoices

Uses only the Python standard library. The random seed is fixed, so running
the script again produces exactly the same data.
"""

import csv
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 2026
AS_OF = date(2026, 9, 30)          # month-end snapshot the dashboard reports on
START = date(2025, 4, 1)           # first invoice month (18 months of history)
N_CUSTOMERS = 100
OUT = Path(__file__).resolve().parent.parent / "data"

rng = random.Random(SEED)

# --------------------------------------------------------------------------
# Customer segments: how many, how often they're billed, typical invoice size
# --------------------------------------------------------------------------
SEGMENTS = {
    #  name               count  invoices/month  amount range (USD)   terms options
    "Luxury Resort":      (45,   (4, 12),        (2_000, 25_000),     [30, 30, 30, 45]),
    "Tour Operator":      (20,   (2, 6),         (1_000, 12_000),     [30, 45, 45, 60]),
    "Boutique Hotel":     (15,   (1, 4),         (500, 4_000),        [15, 15, 30]),
    "Corporate":          (10,   (0, 2),         (2_000, 18_000),     [30]),
    "Liveaboard & Yacht": (10,   (0, 2),         (1_000, 8_000),      [15, 30]),
}

SERVICES = {
    "Luxury Resort":      [("Scheduled Transfer", 70), ("Private Charter", 15), ("Excess Baggage", 10), ("Cargo", 5)],
    "Tour Operator":      [("Scheduled Transfer", 80), ("Private Charter", 10), ("Excess Baggage", 10)],
    "Boutique Hotel":     [("Scheduled Transfer", 85), ("Excess Baggage", 15)],
    "Corporate":          [("Private Charter", 60), ("Cargo", 30), ("Scheduled Transfer", 10)],
    "Liveaboard & Yacht": [("Scheduled Transfer", 60), ("Private Charter", 30), ("Cargo", 10)],
}

# Payment behaviour: (share of customers, mean days paid after due, std dev,
# chance an invoice is never paid, chance it's disputed, chance of part-payment)
PROFILES = {
    "Prompt":   (0.35, -4, 4, 0.000, 0.00, 0.00),
    "Standard": (0.35, -1, 6, 0.002, 0.01, 0.03),
    "Slow":     (0.15, 22, 12, 0.010, 0.03, 0.10),
    "Problem":  (0.10, 55, 25, 0.040, 0.05, 0.20),
    "Disputer": (0.05, 20, 12, 0.020, 0.25, 0.05),
}
# Risk rating shown to the user correlates with, but doesn't reveal, the profile
RATING_ODDS = {
    "Prompt":   {"A": 70, "B": 25, "C": 5},
    "Standard": {"A": 30, "B": 55, "C": 15},
    "Slow":     {"B": 30, "C": 55, "D": 15},
    "Problem":  {"C": 35, "D": 65},
    "Disputer": {"B": 40, "C": 45, "D": 15},
}

# Maldives tourism seasonality (high season Dec-Apr, low season May-Oct)
SEASON = {1: 1.35, 2: 1.4, 3: 1.3, 4: 1.15, 5: 0.8, 6: 0.7,
          7: 0.85, 8: 0.9, 9: 0.75, 10: 0.85, 11: 1.0, 12: 1.3}

ATOLLS = ["North Malé", "South Malé", "Baa", "Raa", "Lhaviyani", "Ari (Alifu)",
          "Dhaalu", "Faafu", "Noonu", "Shaviyani", "Meemu", "Vaavu"]
TOUR_COUNTRIES = ["United Kingdom", "Germany", "Italy", "China", "United Arab Emirates",
                  "India", "Russia", "France", "Switzerland", "Japan"]
ACCOUNT_MANAGERS = ["Aisha Rasheed", "Mohamed Shifan", "Priya Fernando",
                    "Ibrahim Naseem", "Hana Waheed"]
METHODS = [("Bank Transfer", 85), ("Card", 10), ("Cheque", 5)]

# Word lists for fictional names (combinations checked for uniqueness)
NAME_PARTS = {
    "Luxury Resort": (["Azure", "Coral", "Velvet", "Moonlit", "Turtle", "Palm", "Sapphire",
                       "Hidden", "Lagoon", "Sandbar", "Pearl", "Driftwood", "Manta", "Starfish",
                       "Silver", "Sunrise", "Whale", "Ocean", "Crystal", "Serene"],
                      ["Reef", "Isle", "Atoll", "Cove", "Bay", "Sands", "Point", "Lagoon",
                       "Haven", "Shoal"],
                      ["Resort & Spa", "Island Resort", "Private Island", "Resort",
                       "Beach Retreat"]),
    "Tour Operator": (["Blue Horizon", "Island Hopper", "Equator", "Far Shores", "Wanderlust",
                       "Golden Compass", "Tropic Trails", "Seabreeze", "Atlas", "Meridian",
                       "Sunbound", "Lighthouse", "Voyager", "Northstar", "Paradise Path",
                       "Oceanic", "Silk Route", "Albatross", "Kestrel", "Bluewater"],
                      ["Holidays", "Travel", "Journeys", "Tours", "Escapes"], [""]),
    "Boutique Hotel": (["Hulhumalé", "Maafushi", "Thoddoo", "Dhigurah", "Fulidhoo", "Ukulhas",
                        "Rasdhoo", "Gulhi", "Guraidhoo", "Dharavandhoo", "Mathiveri",
                        "Fehendhoo", "Thulusdhoo", "Hangnaameedhoo", "Omadhoo"],
                       ["Beach Inn", "Guest House", "Lodge", "Boutique Hotel", "Retreat"], [""]),
    "Corporate": (["Atoll", "Island", "Indian Ocean", "Equatorial", "Harbour", "Lagoon",
                   "Coastal", "Marine", "Archipelago", "Capital"],
                  ["Engineering", "Logistics", "Telecom", "Construction", "Energy",
                   "Holdings", "Fisheries", "Trading"],
                  ["Pvt Ltd"]),
    "Liveaboard & Yacht": (["MV Ocean", "MV Coral", "MV Blue", "MV Sea", "MV Island",
                            "Yacht", "MV Reef", "MV Tide", "MV Wave", "MV Star"],
                           ["Spirit", "Explorer", "Dream", "Voyager", "Pearl", "Princess",
                            "Wanderer", "Queen"],
                           ["Liveaboard", "Cruises", "Charters"]),
}


def weighted(choices):
    items, weights = zip(*choices)
    return rng.choices(items, weights=weights, k=1)[0]


def make_name(segment, used):
    first, second, third = NAME_PARTS[segment]
    while True:
        name = " ".join(p for p in (rng.choice(first), rng.choice(second), rng.choice(third)) if p)
        if name not in used:
            used.add(name)
            return name


def slug(name):
    return "".join(c for c in name.lower() if c.isalnum())[:24]


def month_starts(start, end):
    d = start
    while d <= end:
        yield d
        d = date(d.year + (d.month // 12), d.month % 12 + 1, 1)


def money(x):
    return round(x, 2)


# --------------------------------------------------------------------------
# 1. Customers
# --------------------------------------------------------------------------
customers = []
used_names = set()
profile_names = list(PROFILES)
profile_weights = [PROFILES[p][0] for p in profile_names]

cid = 0
for segment, (count, per_month, amount_range, terms_opts) in SEGMENTS.items():
    for _ in range(count):
        cid += 1
        name = make_name(segment, used_names)
        profile = rng.choices(profile_names, weights=profile_weights, k=1)[0]
        # Each customer has its own size, so revenue is concentrated like real life
        size = rng.lognormvariate(0, 0.45)
        terms = rng.choice(terms_opts)
        avg_monthly = (sum(per_month) / 2) * (sum(amount_range) / 2) * size
        # Limit covers roughly one billing cycle plus the credit terms, with headroom
        cover = (terms / 30 + 1) * rng.uniform(1.0, 1.6)
        credit_limit = max(5_000, round(avg_monthly * cover / 5_000) * 5_000)
        country = rng.choice(TOUR_COUNTRIES) if segment == "Tour Operator" else "Maldives"
        customers.append({
            "customer_id": f"C{cid:03d}",
            "customer_name": name,
            "segment": segment,
            "country": country,
            "atoll": rng.choice(ATOLLS) if country == "Maldives" and segment != "Corporate" else "",
            "payment_terms_days": terms,
            "credit_limit_usd": credit_limit,
            "risk_rating": weighted(list(RATING_ODDS[profile].items())),
            "account_manager": rng.choice(ACCOUNT_MANAGERS),
            "contact_email": f"accounts@{slug(name)}.example",
            "customer_since": (START - timedelta(days=rng.randint(30, 3_000))).isoformat(),
            # kept out of the CSV; drives payment behaviour only
            "_profile": profile,
            "_size": size,
        })

# --------------------------------------------------------------------------
# 2. Invoices and payments
# --------------------------------------------------------------------------
invoices, payments = [], []
inv_seq = 0

for cust in customers:
    seg = cust["segment"]
    _, per_month, (lo, hi), _ = SEGMENTS[seg]
    _, mean_late, sd_late, p_never, p_dispute, p_partial = PROFILES[cust["_profile"]]

    for m in month_starts(START, AS_OF):
        n = round(rng.randint(*per_month) * SEASON[m.month])
        days_in_month = ((m.replace(day=28) + timedelta(days=4)).replace(day=1) - m).days
        for _ in range(n):
            inv_date = m + timedelta(days=rng.randrange(days_in_month))
            if inv_date > AS_OF:
                continue
            service = weighted(SERVICES[seg])
            mult = {"Private Charter": 1.8, "Cargo": 0.6, "Excess Baggage": 0.15}.get(service, 1.0)
            amount = money(rng.uniform(lo, hi) * cust["_size"] * mult)
            amount = max(amount, 75.0)
            due = inv_date + timedelta(days=cust["payment_terms_days"])

            inv_seq += 1
            inv_no = f"TMP{inv_seq}"  # renumbered in date order below
            disputed = rng.random() < p_dispute
            never = rng.random() < p_never
            # Disputes get settled much later, if at all
            delay = rng.gauss(mean_late + (60 if disputed else 0), sd_late)
            pay_date = due + timedelta(days=round(delay))
            if pay_date < inv_date:
                pay_date = inv_date + timedelta(days=rng.randint(0, 3))

            paid = 0.0
            last_pay = ""
            if not never and pay_date <= AS_OF:
                if rng.random() < p_partial:
                    # part-payment now, balance later (maybe after AS_OF)
                    first_amt = money(amount * rng.uniform(0.4, 0.9))
                    second_date = pay_date + timedelta(days=rng.randint(15, 75))
                    parts = [(pay_date, first_amt), (second_date, money(amount - first_amt))]
                else:
                    parts = [(pay_date, amount)]
                for p_date, p_amt in parts:
                    if p_date <= AS_OF:
                        payments.append({
                            "payment_id": "",
                            "customer_id": cust["customer_id"],
                            "invoice_no": inv_no,
                            "payment_date": p_date.isoformat(),
                            "amount_usd": p_amt,
                            "method": weighted(METHODS),
                        })
                        paid = money(paid + p_amt)
                        last_pay = p_date.isoformat()

            outstanding = money(amount - paid)
            if outstanding <= 0.005:
                status = "Paid"
            elif disputed and due <= AS_OF:
                status = "Disputed"
            elif paid > 0:
                status = "Partially Paid"
            else:
                status = "Open"

            invoices.append({
                "invoice_no": inv_no,
                "customer_id": cust["customer_id"],
                "invoice_date": inv_date.isoformat(),
                "due_date": due.isoformat(),
                "service_type": service,
                "amount_usd": amount,
                "paid_usd": paid,
                "outstanding_usd": max(outstanding, 0.0),
                "last_payment_date": last_pay,
                "status": status,
            })

# Number invoices sequentially by date, restarting each year, like a real ledger
invoices.sort(key=lambda r: (r["invoice_date"], int(r["invoice_no"][3:])))
renumber, per_year = {}, {}
for inv in invoices:
    year = inv["invoice_date"][:4]
    per_year[year] = per_year.get(year, 0) + 1
    renumber[inv["invoice_no"]] = f"INV-{year}-{per_year[year]:05d}"
    inv["invoice_no"] = renumber[inv["invoice_no"]]
for pmt in payments:
    pmt["invoice_no"] = renumber[pmt["invoice_no"]]

payments.sort(key=lambda r: (r["payment_date"], r["invoice_no"]))
for i, pmt in enumerate(payments, 1):
    pmt["payment_id"] = f"PMT-{i:06d}"

# --------------------------------------------------------------------------
# 3. Write CSVs
# --------------------------------------------------------------------------
OUT.mkdir(exist_ok=True)


def write(name, rows):
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[k for k in rows[0] if not k.startswith("_")],
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


write("customers.csv", customers)
write("invoices.csv", invoices)
write("payments.csv", payments)

print(f"As of {AS_OF}: {len(customers)} customers, {len(invoices)} invoices, {len(payments)} payments")
