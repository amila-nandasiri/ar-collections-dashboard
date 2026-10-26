import { ArrowDownRight, ArrowLeft, ArrowUpRight, ChevronDown, Download, FileSpreadsheet, Github, Printer, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgingChart, BillingChart, DsoChart, SegmentChart } from "./components/Charts";
import { UploadPanel } from "./components/UploadPanel";
import { Worklist } from "./components/Worklist";
import { analyse, AnalysisContext } from "./lib/ar";
import { sampleDataset, type Dataset } from "./lib/dataset";
import { downloadReportWorkbook } from "./lib/excel";
import { date, money, moneyShort, pct, setCurrency } from "./lib/format";
import { downloadAgedDebtors, downloadOpenInvoices } from "./lib/reports";

const REPO = "https://github.com/amila-nandasiri/ar-collections-dashboard";
const SITE = "https://dewapriya.com";
const OFFLINE_FILE = "ar-collections-dashboard.html";
const isOffline = typeof location !== "undefined" && location.protocol === "file:";

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
    <div className="bg-white border border-zinc-200 rounded-2xl p-4 md:p-5 break-inside-avoid">
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

function ReportMenu({ onExcel, onPrint, onAged, onOpen }: { onExcel: () => void; onPrint: () => void; onAged: () => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-zinc-100";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors bg-white">
        <Download className="w-4 h-4" /> Download report <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-zinc-200 rounded-xl shadow-xl p-1.5 z-40 text-sm">
          <button className={item} onClick={pick(onExcel)}>
            <FileSpreadsheet className="w-4 h-4 mt-0.5 text-emerald-700" />
            <span><span className="block font-medium text-zinc-900">Excel report</span><span className="text-xs text-zinc-500">Summary, aged debtors and open invoices</span></span>
          </button>
          <button className={item} onClick={pick(onPrint)}>
            <Printer className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span><span className="block font-medium text-zinc-900">PDF report</span><span className="text-xs text-zinc-500">Print or "Save as PDF" this page</span></span>
          </button>
          <div className="border-t border-zinc-100 my-1" />
          <button className={item} onClick={pick(onAged)}>
            <Download className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span className="font-medium text-zinc-900">Aged debtors (CSV)</span>
          </button>
          <button className={item} onClick={pick(onOpen)}>
            <Download className="w-4 h-4 mt-0.5 text-zinc-500" />
            <span className="font-medium text-zinc-900">Open invoices (CSV)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const sample = useMemo(() => sampleDataset(), []);
  const [dataset, setDataset] = useState<Dataset>(sample);
  const [notes, setNotes] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const analysis = useMemo(() => {
    setCurrency(dataset.currency);
    return analyse(dataset);
  }, [dataset]);
  const { totals, customerRows } = analysis;
  const isSample = dataset.source === "sample";

  const kpis: Kpi[] = [
    { label: "Total receivables", value: moneyShort(totals.balance), note: `${totals.openInvoices.toLocaleString()} open invoices` },
    {
      label: "Overdue",
      value: moneyShort(totals.overdue),
      note: `${totals.balance ? pct((totals.overdue / totals.balance) * 100) : "0%"} of receivables${totals.disputed ? ` · ${moneyShort(totals.disputed)} disputed` : ""}`
    },
    totals.dso === null
      ? { label: "DSO", value: "—", note: "Needs paid invoices and 3+ months of billing" }
      : {
          label: "DSO",
          value: `${Math.round(totals.dso)} days`,
          note: "Three-month method",
          change: totals.dsoPrev === null ? undefined : changeText(Math.round(totals.dso), Math.round(totals.dsoPrev), " days", true)
        },
    totals.cei === null
      ? { label: "Collection effectiveness", value: "—", note: "Needs payment dates" }
      : {
          label: "Collection effectiveness",
          value: pct(totals.cei),
          note: totals.lastMonthLabel,
          change: totals.ceiPrev === null ? undefined : changeText(totals.cei, totals.ceiPrev, " pts", false, 1)
        },
    !analysis.hasCollections
      ? { label: "Collected", value: "—", note: "Needs payment dates or a payments file" }
      : {
          label: `Collected in ${totals.lastMonthLabel}`,
          value: moneyShort(totals.collectedMonth),
          note: "Month to date",
          change:
            totals.collectedPrev === null
              ? undefined
              : { text: `${moneyShort(totals.collectedPrev)} the month before`, good: totals.collectedMonth >= totals.collectedPrev, up: totals.collectedMonth >= totals.collectedPrev }
        },
    totals.overLimit === null
      ? { label: "Need follow-up", value: String(totals.needingAction), note: `of ${totals.customersWithBalance.toLocaleString()} customers with a balance` }
      : { label: "Over credit limit", value: String(totals.overLimit), note: `of ${customerRows.length.toLocaleString()} customers · ${totals.needingAction} need follow-up` }
  ];

  return (
    <AnalysisContext.Provider value={analysis}>
      <div className="min-h-screen">
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-zinc-500">Accounts receivable · as of {date(dataset.asOf)}</p>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 mt-1">AR Collections Dashboard</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800 transition-colors">
                <Upload className="w-4 h-4" /> Use your data
              </button>
              <ReportMenu
                onExcel={() => downloadReportWorkbook(analysis)}
                onPrint={() => window.print()}
                onAged={() => downloadAgedDebtors(analysis)}
                onOpen={() => downloadOpenInvoices(analysis)}
              />
              {!isOffline && (
                <>
                  <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm border border-zinc-200 rounded-full px-4 py-2 text-zinc-700 hover:border-zinc-400 transition-colors" title="Source code">
                    <Github className="w-4 h-4" /> <span className="hidden sm:inline">Code</span>
                  </a>
                  <a href={SITE} className="inline-flex items-center gap-1.5 text-sm bg-zinc-900 text-white rounded-full px-4 py-2 hover:bg-zinc-700 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Portfolio
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        {isSample ? (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm print:hidden">
            <p className="max-w-7xl mx-auto px-4 md:px-6 py-2.5">
              You're looking at <strong className="font-medium">fictional sample data</strong> for a Maldives seaplane operator: 100 customers and 18 months of invoices.{" "}
              <button onClick={() => setShowUpload(true)} className="underline underline-offset-2 font-medium hover:text-amber-950">
                Use your own data
              </button>{" "}
              to see your receivables. Files stay on your computer.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-sm print:hidden">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p>
                  Showing <strong className="font-medium">your data</strong> ({dataset.label}). Processed only in this browser, so nothing was uploaded.
                </p>
                {notes.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-emerald-800">Import notes ({notes.length})</summary>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-emerald-900/90">
                      {notes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </details>
                )}
              </div>
              <button
                onClick={() => {
                  setDataset(sample);
                  setNotes([]);
                }}
                className="inline-flex items-center gap-1.5 text-emerald-900 font-medium hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Back to sample data
              </button>
            </div>
          </div>
        )}

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
          <p className="hidden print:block text-sm text-zinc-600">
            Report as of {date(dataset.asOf)} · {dataset.label} · amounts in {dataset.currency} · generated {date(new Date().toISOString().slice(0, 10))}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:grid-cols-6 gap-3 md:gap-4">
            {kpis.map((k) => <KpiTile key={k.label} kpi={k} />)}
          </div>

          <div className="grid lg:grid-cols-2 print:grid-cols-2 gap-6">
            <AgingChart />
            <DsoChart />
            <BillingChart />
            <SegmentChart />
          </div>

          <Worklist key={dataset.label + dataset.asOf} />

          <section className="grid md:grid-cols-3 gap-6 text-sm text-zinc-600 pt-4 break-inside-avoid">
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

          {!isOffline && (
            <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="font-semibold text-zinc-900">Use it offline</h2>
                <p className="text-sm text-zinc-500 mt-0.5 max-w-2xl">
                  Download the whole dashboard as a single HTML file. Open it in any browser, with or without internet, and load your data. Nothing is sent anywhere.
                </p>
              </div>
              <a href={OFFLINE_FILE} download className="inline-flex items-center gap-2 text-sm font-medium bg-zinc-900 text-white rounded-full px-5 py-2.5 hover:bg-zinc-700 transition-colors">
                <Download className="w-4 h-4" /> Download HTML file
              </a>
            </section>
          )}
        </main>

        <footer className="border-t border-zinc-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
            <p>
              Built by <a href={SITE} className="text-zinc-900 hover:underline">Amila Dewapriya</a>, CMA · {money(totals.balance)} receivables analysed
            </p>
            <p className="font-mono">React · TypeScript · Recharts · Python</p>
          </div>
        </footer>
      </div>

      {showUpload && (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onLoad={(ds, n) => {
            setDataset(ds);
            setNotes(n);
            setShowUpload(false);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </AnalysisContext.Provider>
  );
}
