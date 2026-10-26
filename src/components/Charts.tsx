import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from "recharts";
import { BUCKETS, useAnalysis } from "../lib/ar";
import { BUCKET_COLORS, C } from "../lib/colors";
import { money, moneyShort, pct } from "../lib/format";

const axisProps = {
  stroke: C.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false
} as const;

// Shared tooltip: values in text colours, a small swatch carries series identity
function ChartTooltip({ active, payload, label, format = money }: TooltipProps<number, string> & { format?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-medium text-zinc-900 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-zinc-600">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />
          {p.name}: <span className="font-medium text-zinc-900 tabular-nums">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6 break-inside-avoid">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-[240px] flex items-center justify-center text-center text-sm text-zinc-500 bg-zinc-50 rounded-xl px-8">{children}</div>;
}

export function AgingChart() {
  const { totals } = useAnalysis();
  const data = BUCKETS.map((b, i) => ({
    bucket: b === "Current" ? "Not yet due" : `${b} days`,
    amount: totals.byBucket[b],
    share: totals.balance ? (totals.byBucket[b] / totals.balance) * 100 : 0,
    fill: BUCKET_COLORS[i]
  }));
  return (
    <Card title="Aging" subtitle="Balance outstanding by days past due">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 96 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="bucket" width={92} {...axisProps} />
          <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
          <Bar dataKey="amount" name="Outstanding" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.fill} />
            ))}
            <LabelList
              dataKey="amount"
              position="right"
              content={({ x, y, width, height, index }) => {
                const d = data[index as number];
                return (
                  <text x={Number(x) + Math.max(Number(width), 0) + 8} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={12}>
                    <tspan fill="#18181b" fontWeight={500}>{moneyShort(d.amount)}</tspan>
                    <tspan fill="#71717a"> · {pct(d.share)}</tspan>
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function DsoChart() {
  const { monthly, dataset } = useAnalysis();
  const data = monthly.filter((m) => m.dso !== null).map((m) => ({ label: m.label, dso: Math.round(m.dso!) }));
  if (data.length < 2) {
    return (
      <Card title="Days Sales Outstanding" subtitle="Month-end, three-month method">
        <Empty>
          {!dataset.hasBillingHistory
            ? "DSO needs billing history: include paid invoices as well as open ones."
            : "A DSO trend needs at least four months of invoices with payment dates."}
        </Empty>
      </Card>
    );
  }
  // Round axis to tens with a little headroom, e.g. 30–60
  const lo = Math.max(0, Math.floor((Math.min(...data.map((d) => d.dso)) - 5) / 10) * 10);
  const hi = Math.ceil((Math.max(...data.map((d) => d.dso)) + 5) / 10) * 10;
  const step = hi - lo > 80 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  return (
    <Card title="Days Sales Outstanding" subtitle="Month-end, three-month method">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -12 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} domain={[lo, hi]} ticks={ticks} />
          <Tooltip cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} content={<ChartTooltip format={(n) => `${n} days`} />} />
          <Line type="linear" dataKey="dso" name="DSO" stroke={C.series1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function BillingChart() {
  const { monthly, dataset } = useAnalysis();
  const data = monthly.slice(-12).map((m) => ({ label: m.label, billed: m.billed, collected: m.collected }));
  const hasCollections = data.some((d) => d.collected > 0);
  return (
    <Card title={hasCollections ? "Billed vs collected" : "Billed"} subtitle={`Last ${data.length} months${dataset.source === "sample" ? ". Billing peaks in the December–April high season" : ""}`}>
      {!dataset.hasBillingHistory ? (
        <Empty>Billing trends need the full invoice history, including invoices that are already paid.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -4 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} tickFormatter={moneyShort} width={64} />
            <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
            {hasCollections && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#52525b" }} />}
            <Bar dataKey="billed" name="Billed" fill={C.series1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            {hasCollections && <Bar dataKey="collected" name="Collected" fill={C.series2} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/** Receivables by segment, or by top customers when there are no segments */
export function SegmentChart() {
  const { bySegment, customerRows } = useAnalysis();
  const useSegments = bySegment.length > 1;
  const data = useSegments
    ? bySegment.map((s) => ({ name: s.segment, current: s.current, overdue: s.overdue, balance: s.balance }))
    : [...customerRows]
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 8)
        .map((r) => ({ name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, current: r.buckets.Current, overdue: r.overdue, balance: r.balance }));
  return (
    <Card title={useSegments ? "Receivables by segment" : "Largest balances"} subtitle={useSegments ? "Not yet due vs overdue" : "Top customers: not yet due vs overdue"}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }} barCategoryGap={useSegments ? 10 : 4}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={140} {...axisProps} interval={0} />
          <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#52525b" }} />
          <Bar dataKey="current" name="Not yet due" stackId="a" fill={C.current} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="overdue" name="Overdue" stackId="a" fill={C.overdue[1]} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="balance" position="right" formatter={(v: number) => moneyShort(v)} fill="#18181b" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
