import { Download, FileSpreadsheet, FileText, Lock, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { downloadText, parseCsvObjects } from "../lib/csv";
import { detectKind, importFiles, TEMPLATES, type Dataset, type FileKind, type UploadedFile } from "../lib/dataset";
import { downloadTemplateWorkbook, readWorkbook } from "../lib/excel";

const KIND_LABEL: Record<FileKind, string> = {
  invoices: "Invoices",
  customers: "Customers",
  payments: "Payments",
  unknown: "Not recognised"
};

const input = "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300";

export function UploadPanel({ onClose, onLoad }: { onClose: () => void; onLoad: (ds: Dataset, notes: string[]) => void }) {
  const [files, setFiles] = useState<(UploadedFile & { kind: FileKind; rows: number })[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [asOf, setAsOf] = useState("");
  const [terms, setTerms] = useState("30");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setErrors([]);
    const problems: string[] = [];
    const uploaded: UploadedFile[] = [];
    for (const f of [...list]) {
      if (/\.xlsx$/i.test(f.name)) {
        try {
          const sheets = await readWorkbook(f);
          if (!sheets.length) problems.push(`${f.name}: no sheets with data rows were found.`);
          uploaded.push(...sheets);
        } catch {
          problems.push(`${f.name}: couldn't read this workbook. Try saving it again as .xlsx, or as CSV.`);
        }
      } else if (/\.xls$/i.test(f.name)) {
        problems.push(`${f.name}: old .xls format isn't supported. Save it as .xlsx or CSV.`);
      } else {
        uploaded.push({ name: f.name, text: await f.text() });
      }
    }
    const read = uploaded.map((u) => {
      const { headers, rows } = parseCsvObjects(u.text);
      return { ...u, kind: detectKind(headers), rows: rows.length };
    });
    setErrors(problems);
    setFiles((prev) => [...prev.filter((p) => !read.some((r) => r.name === p.name)), ...read]);
  }

  function build() {
    const usable = files.filter((f) => f.kind !== "unknown");
    const result = importFiles(usable, { currency: currency.trim() || "USD", asOf: asOf || undefined, defaultTerms: Number(terms) || 30 });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onLoad(result.dataset, result.notes);
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-zinc-900">Use your own data</h2>
            <p className="text-sm text-zinc-500 mt-1">Upload Excel or CSV exports from your accounting system to build this dashboard for your receivables.</p>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 text-zinc-400 hover:text-zinc-900" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="flex gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
            Your files never leave your computer. Everything is calculated inside your browser, and nothing is uploaded or stored.
          </p>

          <div>
            <p className="text-sm font-medium text-zinc-900 mb-2">1. Choose your files</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`w-full border-2 border-dashed rounded-xl px-6 py-8 text-center transition-colors ${dragging ? "border-zinc-900 bg-zinc-50" : "border-zinc-300 hover:border-zinc-400"}`}
            >
              <Upload className="w-6 h-6 mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-700 mt-2">
                <span className="font-medium text-zinc-900">Click to choose</span> or drag files here
              </p>
              <p className="text-xs text-zinc-500 mt-1">Excel (.xlsx) or CSV · invoices required, customers and payments optional</p>
            </button>
            <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

            {files.length > 0 && (
              <ul className="mt-3 divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="flex-1 truncate text-zinc-900">{f.name}</span>
                    <span className="text-xs text-zinc-500">{f.rows.toLocaleString()} rows</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.kind === "unknown" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"}`}>{KIND_LABEL[f.kind]}</span>
                    <button onClick={() => setFiles(files.filter((x) => x.name !== f.name))} className="text-zinc-400 hover:text-zinc-900" aria-label={`Remove ${f.name}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-900 mb-2">2. Check the settings</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-xs text-zinc-500">
                Currency code
                <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className={`${input} mt-1`} placeholder="USD" />
              </label>
              <label className="text-xs text-zinc-500">
                Report date (as of)
                <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={`${input} mt-1`} />
                <span className="block mt-1">Blank: today</span>
              </label>
              <label className="text-xs text-zinc-500">
                Default terms (days)
                <input type="number" min={0} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${input} mt-1`} />
                <span className="block mt-1">Used only when due dates are missing</span>
              </label>
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1 list-disc list-inside">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          <div className="rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-medium text-zinc-900">Start from a template</p>
            <p className="text-sm text-zinc-500 mt-0.5">Download, replace the example rows with your data, then upload it above.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => downloadTemplateWorkbook()} className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-700 text-white rounded-full px-4 py-2 hover:bg-emerald-800">
                <FileSpreadsheet className="w-4 h-4" /> Excel template (.xlsx)
              </button>
              {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                <button key={k} onClick={() => downloadText(`${k}-template.csv`, TEMPLATES[k])} className="inline-flex items-center gap-1.5 text-sm border border-zinc-200 rounded-full px-3 py-2 text-zinc-700 hover:border-zinc-400">
                  <Download className="w-3.5 h-3.5" /> {k[0].toUpperCase() + k.slice(1)} CSV
                </button>
              ))}
            </div>
          </div>

          <details className="text-sm text-zinc-600 group">
            <summary className="cursor-pointer font-medium text-zinc-900">What should my files look like?</summary>
            <div className="mt-3 space-y-3">
              <p>
                One row per invoice, with columns for <strong className="font-medium text-zinc-900">customer</strong>,{" "}
                <strong className="font-medium text-zinc-900">invoice date</strong>, <strong className="font-medium text-zinc-900">due date</strong> (or payment terms) and{" "}
                <strong className="font-medium text-zinc-900">amount</strong>. Add an <strong className="font-medium text-zinc-900">outstanding</strong> (or paid) column so
                paid invoices count correctly. Common column names such as "Invoice No", "Document Date" or "Balance Due" are recognised automatically.
              </p>
              <p>
                Include paid invoices as well as open ones to get DSO and trends. A customers file adds segments, credit limits, risk ratings and account managers. A payments
                file gives exact collection history.
              </p>
            </div>
          </details>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-200 bg-zinc-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-full text-zinc-700 hover:bg-zinc-200/60">Cancel</button>
          <button
            onClick={build}
            disabled={!files.some((f) => f.kind === "invoices")}
            className="text-sm font-medium px-5 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            Build dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
