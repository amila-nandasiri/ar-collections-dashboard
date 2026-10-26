# Sample data

Fully fictional accounts-receivable data for a seaplane and aviation operator in the Maldives. Customer names, people and email addresses are invented. Any resemblance to real businesses is coincidental.

- **Snapshot date:** 30 September 2026 (month-end)
- **History:** April 2025 to September 2026 (18 months)
- **Currency:** USD
- **Re-create it:** `python scripts/generate_data.py` (standard library only; the fixed seed gives identical output)

| File | Rows | What it is |
|---|---|---|
| `customers.csv` | 100 | Customer master: segment, terms, credit limit, risk rating |
| `invoices.csv` | ~8,900 | Every invoice, with amount paid and balance outstanding at the snapshot date |
| `payments.csv` | ~8,500 | Every payment received, linked to an invoice |

## customers.csv

| Column | Description |
|---|---|
| `customer_id` | Unique ID, `C001`–`C100` |
| `customer_name` | Fictional business name |
| `segment` | Luxury Resort (45), Tour Operator (20), Boutique Hotel (15), Corporate (10), Liveaboard & Yacht (10) |
| `country` | Maldives, or the overseas home country for tour operators |
| `atoll` | Location for Maldives-based resorts, hotels and boats |
| `payment_terms_days` | Days from invoice to due date (15, 30, 45 or 60) |
| `credit_limit_usd` | Approved credit limit |
| `risk_rating` | Internal rating A (lowest risk) to D (highest) |
| `account_manager` | Owner of the relationship and collections follow-up |
| `contact_email` | Fictional accounts contact (`.example` domain) |
| `customer_since` | Account opening date |

## invoices.csv

| Column | Description |
|---|---|
| `invoice_no` | `INV-YYYY-NNNNN`, numbered in date order and restarting each year |
| `customer_id` | Links to `customers.csv` |
| `invoice_date`, `due_date` | Due date is the invoice date plus the customer's payment terms |
| `service_type` | Scheduled Transfer, Private Charter, Cargo or Excess Baggage |
| `amount_usd` | Invoice total |
| `paid_usd` | Total received up to the snapshot date |
| `outstanding_usd` | `amount_usd − paid_usd` |
| `last_payment_date` | Date of the latest payment, blank if unpaid |
| `status` | Paid, Open, Partially Paid or Disputed |

## payments.csv

| Column | Description |
|---|---|
| `payment_id` | `PMT-NNNNNN`, in date order |
| `customer_id`, `invoice_no` | What the payment was applied to |
| `payment_date`, `amount_usd` | When and how much |
| `method` | Bank Transfer, Card or Cheque |

## What's built into the data

These patterns let the dashboard tell a real collections story:

- **Seasonality:** billing peaks in the December–April high season and dips from May to October.
- **Concentration:** luxury resorts make up most of the revenue, and the top 10 customers hold about half of the balance outstanding.
- **Payment behaviour:** each customer silently follows one of five hidden patterns (prompt, standard, slow, problem or frequent disputer). The risk rating hints at the pattern but doesn't always match, as in real life.
- **Collections issues:** the data includes part-payments, disputed invoices, a small number of invoices that are never paid, and customers over their credit limit.

### Headline figures at 30 Sep 2026

| Measure | Value |
|---|---|
| Billing, last 12 months | ≈ $79M |
| Total outstanding | ≈ $9.6M |
| DSO | ≈ 44 days |
| Current (not yet due) | ≈ 52% of the balance |
| 90+ days overdue | ≈ 10% of the balance |
| Customers over credit limit | 22 |
