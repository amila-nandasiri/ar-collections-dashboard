import { ArrowDownRight, ArrowLeft, ArrowUpRight, Github } from "lucide-react";
import { AgingChart, BillingChart, DsoChart, SegmentChart } from "./components/Charts";
import { Worklist } from "./components/Worklist";
import { AS_OF, customers, monthly, totals } from "./lib/ar";
import { date, pct, usdShort } from "./lib/format";

const REPO = "https://github.com/amila-nandasiri/ar-collections-dashboard";
const SITE = "https://dewapriya.com";

type Kpi = {
  label: string;
  value: string;
  note: string;
  change?: { text: string; good: boolean; up: boolean };
};

function changeText(now: number, before: number, unit: string, lowerIsBetter: boolean, digits = 0) {
  const d = now - before;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return { text: `${sign}${Math.abs(d).toFixed(digits)}${unit} vs last month`, good: lowerIsBetter ? d <= 0 : d >= 0, up: d > 0 };
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 md:p-5">
      <p className="text-sm text-zinc-500">{kpi.label}</p>
      <p className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 mt-1 tabular-nums">{kpi.value}</p>
      {kpi.change ? (
        <p className={`text-xs mt-2 inline-flex items-center gap-1 ${kpi.change.good ? "text-emerald-700" : "text-red-700"}`}>
          {kpi.change.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {kpi.change.text}
        </p>
      ) : (
        <p className="text-xs text-zinc-500 mt-2">{kpi.note}</p>
      )}
    </div>
  );
}

export default function App() {
  const lastMonth = monthly[monthly.length - 1].label;
  const kpis: Kpi[] = [
    { label: "Total receivables", value: usdShort(totals.balance), note: `${totals.openInvoices} open invoices` },
    {
      label: "Overdue",
      value: usdShort(totals.overdue),
      note: `${pct((totals.overdue / totals.balance) * 100)} of receivables · ${usdShort(totals.disputed)} disputed`
    },
    { label: "DSO", value: `${Math.round(totals.dso)} days`, note: "", change: changeText(Math.round(totals.dso), Math.round(totals.dsoPrev), " days", true) },
    { label: "Collection effectiveness", value: pct(totals.cei), note: "", change: changeText(totals.cei, totals.ceiPrev, " pts", false, 1) },
    {
      label: `Collected in ${lastMonth}`,
      value: usdShort(totals.collectedMonth),
      note: "",
      change: { text: `${usdShort(totals.collectedPrev)} the month before`, good: totals.collectedMonth >= totals.collectedPrev, up: totals.collectedMonth >= totals.collectedPrev }
    },
    { label: "Over credit limit", value: String(totals.overLimit), note: `of ${customers.length} customers · ${totals.needingAction} need follow-up` }
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-zinc-500">Accounts receivable · as of {date(AS_OF)}</p>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 mt-1">AR Collections Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors">
              <Github className="w-4 h-4" /> Code
            </a>
            <a href={SITE} className="inline-flex items-center gap-1.5 text-sm bg-zinc-900 text-white rounded-full px-4 py-2 hover:bg-zinc-700 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Portfolio
            </a>
          </div>
        </div>
      </header>

      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
        <p className="max-w-7xl mx-auto px-4 md:px-6 py-2.5">
          Demo built on <strong className="font-medium">fictional data</strong> for a Maldives seaplane operator: 100 customers and 18 months of invoices.
          No real company or customer information is used.
        </p>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          {kpis.map((k) => <KpiTile key={k.label} kpi={k} />)}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <AgingChart />
          <DsoChart />
          <BillingChart />
          <SegmentChart />
        </div>

        <Worklist />

        <section className="grid md:grid-cols-3 gap-6 text-sm text-zinc-600 pt-4">
          <div>
            <h3 className="font-medium text-zinc-900 mb-1">DSO</h3>
            <p>Month-end receivables ÷ billing in the last three months × 91 days. Lower is better.</p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900 mb-1">Collection Effectiveness Index</h3>
            <p>
              (Opening AR + billing − closing AR) ÷ (opening AR + billing − closing current AR). It's the share of what could be
              collected in the month that actually was. Above 80% is healthy.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-900 mb-1">Worklist priority</h3>
            <p>
              Overdue balance weighted by age (1× for 1–30 days up to 4× for 90+), adjusted for risk rating and credit-limit breaches.
              The top 20% are High, the next 30% Medium.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
          <p>Built by <a href={SITE} className="text-zinc-900 hover:underline">Amila Dewapriya</a>, CMA</p>
          <p className="font-mono">React · TypeScript · Recharts · Python</p>
        </div>
      </footer>
    </div>
  );
}
