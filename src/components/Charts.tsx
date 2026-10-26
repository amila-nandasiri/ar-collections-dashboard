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
import { BUCKETS, bySegment, monthly, totals } from "../lib/ar";
import { BUCKET_COLORS, C } from "../lib/colors";
import { pct, usd, usdShort } from "../lib/format";

const axisProps = {
  stroke: C.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false
} as const;

// Shared tooltip: values in text colours, a small swatch carries series identity
function ChartTooltip({ active, payload, label, format = usd }: TooltipProps<number, string> & { format?: (n: number) => string }) {
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
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 md:p-6">
      <h2 className="font-semibold text-zinc-900">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AgingChart() {
  const data = BUCKETS.map((b, i) => ({
    bucket: b === "Current" ? "Not yet due" : `${b} days`,
    amount: totals.byBucket[b],
    share: (totals.byBucket[b] / totals.balance) * 100,
    fill: BUCKET_COLORS[i]
  }));
  return (
    <Card title="Aging" subtitle="Balance outstanding by days past due">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 96 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="bucket" width={92} {...axisProps} />
          <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
          <Bar dataKey="amount" name="Outstanding" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((d) => (
              <Cell key={d.bucket} fill={d.fill} />
            ))}
            <LabelList
              dataKey="amount"
              position="right"
              content={({ x, y, width, height, index }) => {
                const d = data[index as number];
                return (
                  <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={12}>
                    <tspan fill="#18181b" fontWeight={500}>{usdShort(d.amount)}</tspan>
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
  const data = monthly.filter((m) => m.dso !== null).map((m) => ({ label: m.label, dso: Math.round(m.dso!) }));
  // Round axis to tens with a little headroom, e.g. 30–60
  const lo = Math.floor((Math.min(...data.map((d) => d.dso)) - 5) / 10) * 10;
  const hi = Math.ceil((Math.max(...data.map((d) => d.dso)) + 5) / 10) * 10;
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  return (
    <Card title="Days Sales Outstanding" subtitle="Month-end, three-month method">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -12 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} domain={[lo, hi]} ticks={ticks} />
          <Tooltip
            cursor={{ stroke: C.axis, strokeDasharray: "3 3" }}
            content={<ChartTooltip format={(n) => `${n} days`} />}
          />
          <Line type="linear" dataKey="dso" name="DSO" stroke={C.series1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function BillingChart() {
  const data = monthly.slice(-12).map((m) => ({ label: m.label, billed: m.billed, collected: m.collected }));
  return (
    <Card title="Billed vs collected" subtitle="Last 12 months. Billing peaks in the December–April high season">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -4 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={usdShort} width={56} />
          <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#52525b" }} />
          <Bar dataKey="billed" name="Billed" fill={C.series1} radius={[4, 4, 0, 0]} />
          <Bar dataKey="collected" name="Collected" fill={C.series2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function SegmentChart() {
  return (
    <Card title="Receivables by segment" subtitle="Not yet due vs overdue">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={bySegment} layout="vertical" margin={{ left: 8, right: 56 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="segment" width={128} {...axisProps} />
          <Tooltip cursor={{ fill: "#f4f4f5" }} content={<ChartTooltip />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#52525b" }} />
          <Bar dataKey="current" name="Not yet due" stackId="a" fill={C.current} stroke="#fff" strokeWidth={2} />
          <Bar dataKey="overdue" name="Overdue" stackId="a" fill={C.overdue[1]} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="balance" position="right" formatter={(v: number) => usdShort(v)} fill="#18181b" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
