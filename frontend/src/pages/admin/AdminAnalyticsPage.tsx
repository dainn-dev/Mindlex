// PB10 — Admin platform analytics dashboard
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/store/uiStore";
import {
  Users as UsersIcon, Crown, Sparkles, TrendingUp, Wallet, RefreshCw,
  MessageSquare, FileText, Newspaper, FolderOpen, ArrowUpRight
} from "lucide-react";

interface AnalyticsResponse {
  generatedAt: string;
  totals: {
    users: number;
    activeSubscribers: number;
    conversionRate: number;
    mrr: number;
    mrrCurrency: string;
    currentMonthRevenue: number;
    totalRevenue12mo: number;
    newUsers30d: number;
    chatThreads: number;
    chatMessages7d: number;
    savedDocs: number;
    newsArticlesTotal: number;
    newsArticles30d: number;
  };
  tierBreakdown: { free: number; plus: number; premium: number };
  statusBreakdown: { active: number; pending: number; suspended: number; locked: number; deactivated: number };
  signupSeries: { date: string; count: number }[];
  revenueSeries: { month: string; label: string; amount: number }[];
  topTopics: { topic: string; count: number }[];
  recentPayments: {
    id: string; paidAt: string; paidAtDisplay: string;
    fullName: string; email?: string;
    amount: number; amountDisplay: string; currency: string;
  }[];
}

const NAVY = "#0f1e3d";
const GOLD = "#c9a96e";
const EMERALD = "#10b981";
const SLATE = "#cbd5e1";

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await api.get<AnalyticsResponse>("/admin/analytics");
      setData(r.data);
      if (isRefresh) showToast("success", "Analytics refreshed");
    } catch (e) {
      showToast("danger", apiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-64 bg-slate-100 rounded-md animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-5">
        Failed to load analytics. Please try again.
      </div>
    );
  }

  const t = data.totals;
  const tier = data.tierBreakdown;
  const status = data.statusBreakdown;
  const currencySymbol = t.mrrCurrency === "EUR" ? "€" : t.mrrCurrency === "GBP" ? "£" : "$";

  return (
    <div className="space-y-7 max-w-[1280px]">

      {/* ===== HEADER ===== */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-dark mb-2">
            <Sparkles size={12} /> Admin · Analytics
          </div>
          <h1 className="font-display text-3xl text-navy leading-tight">Platform overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live snapshot of users, revenue and engagement. Updated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => load(true)}
          loading={refreshing}
          className="inline-flex items-center gap-2"
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* ===== KPI CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          Icon={UsersIcon}
          label="Total users"
          value={fmtNum(t.users)}
          hint={`+${t.newUsers30d} in 30 days`}
          accent="bg-slate-50"
          iconColor="text-slate-700"
        />
        <KpiCard
          Icon={Crown}
          label="Active subscribers"
          value={fmtNum(t.activeSubscribers)}
          hint={`${t.conversionRate}% conversion`}
          accent="bg-amber-50"
          iconColor="text-gold-dark"
        />
        <KpiCard
          Icon={Wallet}
          label="MRR"
          value={`${currencySymbol}${fmtMoney(t.mrr)}`}
          hint={`This month ${currencySymbol}${fmtMoney(t.currentMonthRevenue)}`}
          accent="bg-emerald-50"
          iconColor="text-emerald-700"
        />
        <KpiCard
          Icon={TrendingUp}
          label="Revenue · 12 months"
          value={`${currencySymbol}${fmtMoney(t.totalRevenue12mo)}`}
          hint="Successful payments only"
          accent="bg-blue-50"
          iconColor="text-blue-700"
        />
      </div>

      {/* ===== CHART ROW 1: TIER DONUT + SIGNUPS AREA ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        {/* Tier breakdown */}
        <ChartCard title="User tiers" subtitle="Free vs paid distribution">
          <div className="flex items-center gap-6">
            <Donut
              total={tier.free + tier.plus + tier.premium}
              segments={[
                { label: "Free",    value: tier.free,    color: SLATE },
                { label: "Plus",    value: tier.plus,    color: GOLD },
                { label: "Premium", value: tier.premium, color: NAVY }
              ]}
            />
            <div className="flex-1 space-y-2.5">
              <LegendRow color={SLATE} label="Free"    value={tier.free}    total={tier.free + tier.plus + tier.premium} />
              <LegendRow color={GOLD}  label="Plus"    value={tier.plus}    total={tier.free + tier.plus + tier.premium} />
              <LegendRow color={NAVY}  label="Premium" value={tier.premium} total={tier.free + tier.plus + tier.premium} />
            </div>
          </div>
        </ChartCard>

        {/* Signups area */}
        <ChartCard
          title="New signups · last 30 days"
          subtitle={`${t.newUsers30d} new users`}
          right={
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={12} /> Live
            </span>
          }
        >
          <AreaSpark data={data.signupSeries} />
          <div className="flex justify-between text-[10px] text-slate-400 mt-2 px-1">
            <span>{fmtShortDate(data.signupSeries[0]?.date)}</span>
            <span>{fmtShortDate(data.signupSeries[Math.floor(data.signupSeries.length / 2)]?.date)}</span>
            <span>{fmtShortDate(data.signupSeries[data.signupSeries.length - 1]?.date)}</span>
          </div>
        </ChartCard>
      </div>

      {/* ===== REVENUE BAR CHART ===== */}
      <ChartCard
        title="Revenue · last 12 months"
        subtitle={`${currencySymbol}${fmtMoney(t.totalRevenue12mo)} total · Successful payments`}
      >
        <BarChart data={data.revenueSeries} currencySymbol={currencySymbol} />
      </ChartCard>

      {/* ===== ROW 2: STATUS + TOPICS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <ChartCard title="User status" subtitle="Account states across the platform">
          <div className="space-y-3">
            <BarRow label="Active"      value={status.active}      total={t.users} color={EMERALD} />
            <BarRow label="Pending"     value={status.pending}     total={t.users} color="#f59e0b" />
            <BarRow label="Suspended"   value={status.suspended}   total={t.users} color="#f97316" />
            <BarRow label="Locked"      value={status.locked}      total={t.users} color="#ef4444" />
            <BarRow label="Deactivated" value={status.deactivated} total={t.users} color={SLATE} />
          </div>
        </ChartCard>

        {/* Top topics */}
        <ChartCard
          title="Top news topics"
          subtitle={`From ${fmtNum(t.newsArticlesTotal)} articles · +${t.newsArticles30d} last 30d`}
        >
          {data.topTopics.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">
              <Newspaper size={24} className="mx-auto mb-2 text-slate-300" />
              No topic data yet — news fetchers haven't run.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.topTopics.map((tt) => (
                <BarRow
                  key={tt.topic}
                  label={tt.topic}
                  value={tt.count}
                  total={Math.max(...data.topTopics.map((x) => x.count))}
                  color={GOLD}
                  showCount
                />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ===== ENGAGEMENT MINI CARDS ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat Icon={MessageSquare} label="Chat threads"     value={fmtNum(t.chatThreads)}     accent="text-blue-700"    bg="bg-blue-50" />
        <MiniStat Icon={MessageSquare} label="Messages · 7d"    value={fmtNum(t.chatMessages7d)} accent="text-purple-700"  bg="bg-purple-50" />
        <MiniStat Icon={FolderOpen}    label="Saved docs"       value={fmtNum(t.savedDocs)}      accent="text-emerald-700" bg="bg-emerald-50" />
        <MiniStat Icon={FileText}      label="News articles"    value={fmtNum(t.newsArticlesTotal)} accent="text-rose-700"  bg="bg-rose-50" />
      </div>

      {/* ===== RECENT PAYMENTS ===== */}
      <ChartCard
        title="Recent successful payments"
        subtitle="Last 5 payments across the platform"
      >
        {data.recentPayments.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-10">
            <Wallet size={24} className="mx-auto mb-2 text-slate-300" />
            No payments yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100">
                  <th className="py-2.5 pr-4">User</th>
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center font-bold text-white text-xs shrink-0">
                          {(p.fullName || p.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-navy truncate">{p.fullName}</div>
                          {p.email && <div className="text-xs text-slate-400 truncate">{p.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{p.paidAtDisplay}</td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold text-navy">{p.amountDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

/* ===================== Helpers ===================== */

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShortDate(d?: string): string {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ===================== Sub-components ===================== */

function KpiCard({
  Icon, label, value, hint, accent, iconColor
}: {
  Icon: typeof UsersIcon;
  label: string;
  value: string;
  hint?: string;
  accent: string;
  iconColor: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-soft hover:shadow-lift transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={22} className={iconColor} />
        </div>
      </div>
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</div>
      <div className="font-display text-3xl text-navy leading-tight">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1.5">{hint}</div>}
    </div>
  );
}

function MiniStat({
  Icon, label, value, accent, bg
}: {
  Icon: typeof UsersIcon;
  label: string;
  value: string;
  accent: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={accent} />
      </div>
      <div className="min-w-0">
        <div className="font-display text-xl text-navy leading-tight">{value}</div>
        <div className="text-[11px] uppercase text-slate-400 tracking-wider font-semibold truncate">{label}</div>
      </div>
    </div>
  );
}

function ChartCard({
  title, subtitle, right, children
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h3 className="font-display text-lg text-navy">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function LegendRow({
  color, label, value, total
}: { color: string; label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-slate-700 font-medium">{label}</span>
      </span>
      <span className="text-slate-500 font-mono tabular-nums">
        {value} <span className="text-slate-300">·</span> <span className="text-slate-400">{pct}%</span>
      </span>
    </div>
  );
}

function BarRow({
  label, value, total, color, showCount
}: { label: string; value: number; total: number; color: string; showCount?: boolean }) {
  const pct = total === 0 ? 0 : Math.max(2, Math.round((value / total) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-700 font-medium truncate pr-3">{label}</span>
        <span className="text-slate-500 font-mono tabular-nums whitespace-nowrap">
          {showCount ? value : `${value} (${total === 0 ? 0 : Math.round((value / total) * 100)}%)`}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function Donut({
  segments, total
}: { segments: { label: string; value: number; color: string }[]; total: number }) {
  const safeTotal = total || 1;
  const r = 60;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width="170" height="170" viewBox="0 0 170 170" className="shrink-0">
      <circle cx="85" cy="85" r={r} fill="none" stroke="#f1f5f9" strokeWidth="22" />
      {segments.map((s, i) => {
        const len = (s.value / safeTotal) * C;
        const dash = `${len} ${C - len}`;
        const offset = -acc;
        acc += len;
        return (
          <circle
            key={i}
            cx="85" cy="85" r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="22"
            strokeDasharray={dash}
            strokeDashoffset={offset}
            transform="rotate(-90 85 85)"
          >
            <title>{s.label}: {s.value}</title>
          </circle>
        );
      })}
      <text x="85" y="82" textAnchor="middle" fontSize="22" fontWeight="700" fill={NAVY} fontFamily="serif">
        {fmtNum(total)}
      </text>
      <text x="85" y="100" textAnchor="middle" fontSize="9" fill="#94a3b8" letterSpacing="1.5" fontWeight="700">
        TOTAL
      </text>
    </svg>
  );
}

function AreaSpark({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-slate-400">No data</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 100;
  const h = 100;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => [i * stepX, h - (d.count / max) * (h - 8)] as const);
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height: 140 }}>
      <defs>
        <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.35" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#goldFade)" />
      <path d={linePath} fill="none" stroke={GOLD} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.8" fill={GOLD} vectorEffect="non-scaling-stroke">
          <title>{data[i].date}: {data[i].count}</title>
        </circle>
      ))}
    </svg>
  );
}

function BarChart({
  data, currencySymbol
}: { data: { label: string; amount: number }[]; currencySymbol: string }) {
  if (data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-sm text-slate-400">No data</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="flex items-end gap-2 h-52">
      {data.map((d, i) => {
        const pct = (d.amount / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 group min-w-0">
            <div className="w-full flex-1 flex flex-col justify-end relative">
              <div
                className="w-full bg-gradient-to-t from-gold via-amber-400 to-amber-300 rounded-t-md transition-all group-hover:from-amber-500"
                style={{ height: `${pct}%`, minHeight: pct > 0 ? "2px" : "0px" }}
              />
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 left-1/2 -translate-x-1/2 bg-navy text-white text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap pointer-events-none">
                {currencySymbol}{d.amount.toFixed(0)}
              </div>
            </div>
            <div className="text-[10px] uppercase text-slate-400 font-semibold truncate w-full text-center">
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
