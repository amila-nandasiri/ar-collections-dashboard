import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { BUCKETS, useAnalysis, type CustomerRow, type Priority } from "../lib/ar";
import { BUCKET_COLORS } from "../lib/colors";
import { date, money, pct } from "../lib/format";

const PRIORITY_STYLE: Record<Priority, string> = {
  High: "bg-red-50 text-red-700 ring-red-200",
  Medium: "bg-amber-50 text-amber-800 ring-amber-200",
  Low: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  None: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};
const PRIORITY_ICON: Record<Priority, string> = { High: "▲", Medium: "■", Low: "▽", None: "✓" };

type SortKey = "score" | "balance" | "overdue" | "over90" | "utilisation" | "oldestDays" | "name";

const select = "bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300";

// Small stacked bar showing how a customer's balance splits across aging buckets
function AgingStrip({ row }: { row: CustomerRow }) {
  if (row.balance <= 0) return <span className="text-zinc-400 text-xs">—</span>;
  return (
    <div className="flex h-2 w-28 rounded-full overflow-hidden bg-zinc-100 gap-px" title={BUCKETS.map((b) => `${b}: ${money(row.buckets[b])}`).join("\n")}>
      {BUCKETS.map((b, i) =>
        row.buckets[b] > 0 ? <div key={b} style={{ width: `${(row.buckets[b] / row.balance) * 100}%`, background: BUCKET_COLORS[i] }} /> : null
      )}
    </div>
  );
}

export function Worklist() {
  const { customerRows, managers, segments, hasLimits, hasRatings } = useAnalysis();
  const columns = 9 + (hasLimits ? 1 : 0) + (hasRatings ? 1 : 0) + (managers.length > 0 ? 1 : 0);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("All");
  const [manager, setManager] = useState("All");
  const [priority, setPriority] = useState<"Needs action" | Priority | "All">("Needs action");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "score", desc: true });
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = customerRows.filter(
      (r) =>
        (segment === "All" || r.segment === segment) &&
        (manager === "All" || r.manager === manager) &&
        (priority === "All" || (priority === "Needs action" ? r.priority !== "None" : r.priority === priority)) &&
        (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    );
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) =>
      sort.key === "name" ? dir * a.name.localeCompare(b.name) : dir * (((a[sort.key] as number | null) ?? -1) - ((b[sort.key] as number | null) ?? -1))
    );
  }, [customerRows, query, segment, manager, priority, sort]);

  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-3 font-medium ${right ? "text-right" : "text-left"}`}>
      <button
        onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== "name" }))}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${sort.key === k ? "text-zinc-900" : ""}`}
      >
        {children}
        {sort.key === k && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl">
      <div className="p-5 md:p-6 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-900">Collections worklist</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Customers ranked by age-weighted overdue balance, risk rating and credit-limit breaches. Select a row to see open invoices.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-900">{rows.length}</span> customers ·{" "}
            <span className="font-medium text-zinc-900">{money(totalOverdue)}</span> overdue
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 print:hidden">
          <label className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer"
              className={`${select} w-full pl-9`}
            />
          </label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className={select} aria-label="Priority">
            <option value="Needs action">Needs action</option>
            <option value="High">High priority</option>
            <option value="Medium">Medium priority</option>
            <option value="Low">Low priority</option>
            <option value="All">All customers</option>
          </select>
          {segments.length > 1 && (
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className={select} aria-label="Segment">
              <option value="All">All segments</option>
              {segments.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {managers.length > 1 && (
            <select value={manager} onChange={(e) => setManager(e.target.value)} className={select} aria-label="Account manager">
              <option value="All">All account managers</option>
              {managers.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-sm whitespace-nowrap print:text-[9px] print:whitespace-normal">
          <thead className="text-xs text-zinc-500 border-y border-zinc-200 bg-zinc-50/60">
            <tr>
              <th className="pl-5 md:pl-6 pr-1 py-3" />
              <Th k="name">Customer</Th>
              <Th k="score">Priority</Th>
              <th className="px-3 py-3 text-left font-medium">Next action</th>
              <Th k="balance" right>Balance</Th>
              <Th k="overdue" right>Overdue</Th>
              <Th k="over90" right>90+ days</Th>
              <th className="px-3 py-3 text-left font-medium">Aging</th>
              {hasLimits && <Th k="utilisation" right>Credit used</Th>}
              {hasRatings && <th className="px-3 py-3 text-center font-medium">Rating</th>}
              <th className="px-3 py-3 text-left font-medium">Last paid</th>
              {managers.length > 0 && <th className="px-3 pr-6 py-3 text-left font-medium">Manager</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr onClick={() => setOpen(isOpen ? null : r.id)} className={`cursor-pointer hover:bg-zinc-50 ${isOpen ? "bg-zinc-50" : ""}`}>
                    <td className="pl-5 md:pl-6 pr-1 py-3 text-zinc-400">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-zinc-900">{r.name}</p>
                      <p className="text-xs text-zinc-500">{[r.id !== r.name && r.id, r.segment].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${PRIORITY_STYLE[r.priority]}`}>
                        <span aria-hidden className="text-[9px]">{PRIORITY_ICON[r.priority]}</span>
                        {r.priority === "None" ? "Up to date" : r.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-700">{r.action}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-900">{money(r.balance)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-900">{money(r.overdue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-900">{r.over90 > 0 ? money(r.over90) : <span className="text-zinc-400">—</span>}</td>
                    <td className="px-3 py-3"><AgingStrip row={r} /></td>
                    {hasLimits && (
                      <td className={`px-3 py-3 text-right tabular-nums ${r.utilisation !== null && r.utilisation > 1 ? "text-red-700 font-medium" : "text-zinc-700"}`}>
                        {r.utilisation === null ? <span className="text-zinc-400">—</span> : <>{pct(r.utilisation * 100)}{r.utilisation > 1 && " ⚠"}</>}
                      </td>
                    )}
                    {hasRatings && <td className="px-3 py-3 text-center font-mono text-xs text-zinc-700">{r.rating || "—"}</td>}
                    <td className="px-3 py-3 text-zinc-600">{date(r.lastPayment)}</td>
                    {managers.length > 0 && <td className="px-3 pr-6 py-3 text-zinc-600">{r.manager || "—"}</td>}
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-50">
                      <td colSpan={columns} className="px-5 md:px-6 pb-5 pt-1">
                        <CustomerDetail row={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-6 py-10 text-center text-zinc-500">No customers match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomerDetail({ row }: { row: CustomerRow }) {
  const { openByCustomer, hasServices } = useAnalysis();
  const invs = [...(openByCustomer.get(row.id) ?? [])].sort((a, b) => b.daysPastDue - a.daysPastDue);
  const facts: [string, React.ReactNode][] = [
    ["Terms", row.terms !== null ? `${row.terms} days` : null],
    ["Credit limit", row.creditLimit ? money(row.creditLimit) : null],
    ["Country", row.country || null],
    ["Contact", row.email || null]
  ];
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 whitespace-normal">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm mb-4">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <p key={k}><span className="text-zinc-500">{k}</span> <span className="text-zinc-900">{v}</span></p>
        ))}
        {row.disputed > 0 && <p><span className="text-zinc-500">Disputed</span> <span className="text-red-700 font-medium">{money(row.disputed)}</span></p>}
      </div>
      {invs.length === 0 ? (
        <p className="text-sm text-zinc-500">No open invoices.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="text-left font-medium py-2 pr-4">Invoice</th>
                {hasServices && <th className="text-left font-medium py-2 pr-4">Service</th>}
                <th className="text-left font-medium py-2 pr-4">Invoice date</th>
                <th className="text-left font-medium py-2 pr-4">Due</th>
                <th className="text-right font-medium py-2 pr-4">Days past due</th>
                <th className="text-right font-medium py-2 pr-4">Outstanding</th>
                <th className="text-left font-medium py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invs.map((i) => (
                <tr key={i.no}>
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-700">{i.no}</td>
                  {hasServices && <td className="py-2 pr-4 text-zinc-700">{i.service}</td>}
                  <td className="py-2 pr-4 text-zinc-600">{date(i.date)}</td>
                  <td className="py-2 pr-4 text-zinc-600">{date(i.due)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${i.daysPastDue > 90 ? "text-red-700 font-medium" : "text-zinc-700"}`}>
                    {i.daysPastDue > 0 ? i.daysPastDue : "Not due"}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-zinc-900">{money(i.outstanding)}</td>
                  <td className="py-2 text-zinc-700">{i.disputed ? "Disputed" : i.outstanding < 0 ? "Credit" : i.outstanding < i.amount ? "Partially paid" : "Open"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
