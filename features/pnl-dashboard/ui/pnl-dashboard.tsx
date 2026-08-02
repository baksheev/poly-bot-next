"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";

import type {
  DailyPairPnl,
  PairKey,
  PnlDashboardReport,
  PnlDay,
} from "@/entities/pnl-report";
import { cn } from "@/shared/lib";

type Period = "7" | "30" | "90" | "custom";
type PairFilter = "all" | PairKey;
type Breakdown = "total" | "pair";

const ZERO_PAIR: DailyPairPnl = {
  completedTrades: 0,
  profitableTrades: 0,
  cashRealizedUsdc: 0,
  residualMarkUsdc: 0,
  comparablePnlUsdc: 0,
  gasCostUsdc: 0,
  recoveryLossUsdc: 0,
  binanceFeeUsdc: 0,
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const RESOURCE_ROWS = [
  {
    resourceId: "eip155:480:evm-wallet:primary:native",
    label: "World Chain",
    pair: "wld",
  },
  {
    resourceId: "eip155:42161:evm-wallet:primary:native",
    label: "Arbitrum",
    pair: "esp",
  },
  {
    resourceId: "eip155:10:evm-wallet:primary:native",
    label: "Optimism bridge",
    pair: null,
  },
  {
    resourceId: "binance-spot:primary:asset:BNB",
    label: "Binance Spot",
    pair: null,
  },
] as const;

function addPair(left: DailyPairPnl, right: DailyPairPnl): DailyPairPnl {
  return {
    completedTrades: left.completedTrades + right.completedTrades,
    profitableTrades: left.profitableTrades + right.profitableTrades,
    cashRealizedUsdc: left.cashRealizedUsdc + right.cashRealizedUsdc,
    residualMarkUsdc: left.residualMarkUsdc + right.residualMarkUsdc,
    comparablePnlUsdc: left.comparablePnlUsdc + right.comparablePnlUsdc,
    gasCostUsdc: left.gasCostUsdc + right.gasCostUsdc,
    recoveryLossUsdc: left.recoveryLossUsdc + right.recoveryLossUsdc,
    binanceFeeUsdc:
      left.binanceFeeUsdc === null || right.binanceFeeUsdc === null
        ? null
        : left.binanceFeeUsdc + right.binanceFeeUsdc,
  };
}

function pairForDay(day: PnlDay, pair: PairFilter) {
  if (pair === "wld") return day.wld;
  if (pair === "esp") return day.esp;
  return addPair(day.wld, day.esp);
}

function formatNumber(value: number, digits: number) {
  const [integer, fraction] = Math.abs(value).toFixed(digits).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined
    ? groupedInteger
    : `${groupedInteger}.${fraction}`;
}

function formatInteger(value: number) {
  return Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatMoney(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

function valueTone(value: number | null) {
  if (value === null || value === 0) return "text-muted";
  return value > 0 ? "text-profit" : "text-loss";
}

function formatDay(date: string, withWeekday = true) {
  const [year, month, day] = date.split("-").map(Number);
  const monthName = MONTHS[month - 1] ?? "—";
  const dayLabel = `${monthName} ${day}`;
  if (!withWeekday) return dayLabel;

  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "—";
  return `${weekday} · ${dayLabel}`;
}

function formatUpdated(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return "—";

  const [, year, month, day, hour, minute, second] = match;
  return `${day} ${MONTHS[Number(month) - 1] ?? "—"} ${year}, ${hour}:${minute}:${second}`;
}

function formatGasPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  const digits = value < 0.001 ? 6 : value < 0.1 ? 3 : 2;
  return `${formatNumber(value, digits)} gwei`;
}

function formatBalance(value: number | null, asset: "usdc" | "wld" | "esp") {
  if (value === null || Number.isNaN(value)) return "—";
  return formatNumber(value, asset === "usdc" ? 2 : 4);
}

function addBalance(total: number | null, value: number | null) {
  if (value === null || Number.isNaN(value)) return total;
  return (total ?? 0) + value;
}

function formatResourceAmount(value: number, asset: "ETH" | "BNB") {
  const digits =
    value >= 1
      ? 4
      : value >= 0.1
        ? 3
        : value >= 0.01
          ? 5
          : value >= 0.001
            ? 6
            : 8;
  return `${formatNumber(value, digits)} ${asset}`;
}

function formatRunwayDays(balance: number, averageDailyConsumption: number) {
  if (averageDailyConsumption <= 0) return "—";
  const days = balance / averageDailyConsumption;
  return `≈ ${formatNumber(days, days < 10 ? 1 : 0)} days`;
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("segment-button", active && "segment-button-active")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className="panel kpi-card">
      <div className="eyebrow">{label}</div>
      <div className={cn("kpi-value", tone)}>{value}</div>
      <div className="kpi-detail">{detail}</div>
    </article>
  );
}

export function PnlDashboard({
  headerAction,
  report,
}: {
  headerAction?: React.ReactNode;
  report: PnlDashboardReport;
}) {
  const [tab, setTab] = useState<"overview" | "diagnostics">("overview");
  const [pair, setPair] = useState<PairFilter>("all");
  const [period, setPeriod] = useState<Period>("30");
  const [breakdown, setBreakdown] = useState<Breakdown>("pair");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);
  const [customFrom, setCustomFrom] = useState(
    report.days.at(-30)?.date ?? report.days[0]?.date ?? "",
  );
  const [customTo, setCustomTo] = useState(report.days.at(-1)?.date ?? "");

  const selectedDays = useMemo(() => {
    if (period === "custom") {
      return report.days.filter(
        (day) => day.date >= customFrom && day.date <= customTo,
      );
    }
    return report.days.slice(-Number(period));
  }, [customFrom, customTo, period, report.days]);

  const summary = useMemo(() => {
    let total = { ...ZERO_PAIR };
    let missing = 0;

    for (const day of selectedDays) {
      if (day.status === "no_data") {
        missing += 1;
        continue;
      }
      total = addPair(total, pairForDay(day, pair));
    }

    return { total, missing };
  }, [pair, selectedDays]);

  const balanceTotals = useMemo(
    () =>
      report.balances.reduce(
        (totals, balance) => ({
          usdc: addBalance(totals.usdc, balance.usdc),
          wld: addBalance(totals.wld, balance.wld),
          esp: addBalance(totals.esp, balance.esp),
        }),
        { usdc: null, wld: null, esp: null } as Record<
          "usdc" | "wld" | "esp",
          number | null
        >,
      ),
    [report.balances],
  );

  const today = report.days.at(-1);
  const todayPnl =
    today && today.status !== "no_data" ? pairForDay(today, pair) : null;
  const activeDay =
    activeChartIndex === null ? null : selectedDays[activeChartIndex];
  const periodLabel = period === "custom" ? "custom range" : `${period} days`;
  const periodRange = selectedDays.length
    ? `${formatDay(selectedDays[0].date, false)} – ${formatDay(selectedDays.at(-1)!.date, false)}`
    : "—";

  const chartScale = useMemo(() => {
    let positive = 0;
    let negative = 0;

    for (const day of selectedDays) {
      if (day.status === "no_data") continue;
      const values =
        breakdown === "pair" && pair === "all"
          ? [day.wld.comparablePnlUsdc, day.esp.comparablePnlUsdc]
          : [pairForDay(day, pair).comparablePnlUsdc];
      positive = Math.max(
        positive,
        values
          .filter((value) => value > 0)
          .reduce((sum, value) => sum + value, 0),
      );
      negative = Math.max(
        negative,
        Math.abs(
          values
            .filter((value) => value < 0)
            .reduce((sum, value) => sum + value, 0),
        ),
      );
    }

    // Leave a little headroom without forcing small-P&L pairs onto the same
    // 0.5 USDC floor as larger pairs. The old floor moved ESP's zero line far
    // above its real −0.03 USDC range.
    positive = Math.max(0.05, positive * 1.08);
    negative = Math.max(0.05, negative * 1.08);

    return { positive, negative, total: positive + negative };
  }, [breakdown, pair, selectedDays]);

  const recentAttempts = report.recentAttempts.filter(
    (attempt) => pair === "all" || attempt.pair === pair,
  );
  const haltedDates = new Set(
    report.haltedExposures.map((exposure) => exposure.observedAt.slice(0, 10)),
  );
  const chartLabelEvery = Math.max(
    1,
    Math.ceil(selectedDays.length / (selectedDays.length > 30 ? 9 : 12)),
  );

  return (
    <div className="dashboard-frame">
      <header className="dashboard-header">
        <div className="brand-block">
          <svg
            className="brand-mark"
            width="26"
            height="26"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Poly Bot"
          >
            <polygon
              points="14,2.5 24.5,8.25 24.5,19.75 14,25.5 3.5,19.75 3.5,8.25"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <polygon
              points="14,9 18.5,11.5 18.5,16.5 14,19 9.5,16.5 9.5,11.5"
              fill="currentColor"
            />
          </svg>
          <div>
            <h1>Poly Bot</h1>
            <p>Comparable P&amp;L, all pairs in USDC · UTC</p>
          </div>
        </div>

        <nav className="top-tabs" aria-label="Dashboard views">
          <button
            className={cn(tab === "overview" && "top-tab-active")}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            className={cn(tab === "diagnostics" && "top-tab-active")}
            onClick={() => setTab("diagnostics")}
          >
            Diagnostics
            {report.haltedExposures.length > 0 && (
              <span className="alert-dot" />
            )}
          </button>
        </nav>

        <div className="updated-block">
          <span>Updated {formatUpdated(report.updatedAt)} UTC</span>
          {headerAction}
        </div>
      </header>

      <section className="toolbar" aria-label="P&L filters">
        <div className="segment-group">
          <SegmentedButton
            active={pair === "all"}
            onClick={() => setPair("all")}
          >
            All pairs
          </SegmentedButton>
          <SegmentedButton
            active={pair === "wld"}
            onClick={() => setPair("wld")}
          >
            WLD/USDC
          </SegmentedButton>
          <SegmentedButton
            active={pair === "esp"}
            onClick={() => setPair("esp")}
          >
            ESP/USDC
          </SegmentedButton>
        </div>
        <div className="segment-group">
          {(["7", "30", "90"] as const).map((value) => (
            <SegmentedButton
              key={value}
              active={period === value}
              onClick={() => setPeriod(value)}
            >
              {value}d
            </SegmentedButton>
          ))}
          <SegmentedButton
            active={period === "custom"}
            onClick={() => setPeriod("custom")}
          >
            Custom
          </SegmentedButton>
        </div>
        {period === "custom" && (
          <div className="date-range">
            <input
              aria-label="Start date"
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <span>→</span>
            <input
              aria-label="End date"
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        )}
        <div className="utc-pill">UTC</div>
      </section>

      {report.source === "demo" && (
        <div className="demo-notice" role="status">
          <Radio size={14} />
          <span>
            Showing deterministic demo data. Add ClickHouse variables to switch
            this same UI to live telemetry.
          </span>
          {report.sourceMessage && (
            <span className="demo-reason">{report.sourceMessage}</span>
          )}
        </div>
      )}

      {tab === "overview" ? (
        <main className="dashboard-content">
          <section className="kpi-grid" aria-label="P&L summary">
            <KpiCard
              label="P&L today"
              value={formatMoney(todayPnl?.comparablePnlUsdc ?? null)}
              detail={
                todayPnl
                  ? `in progress · ${todayPnl.completedTrades} trades so far`
                  : "no data recorded"
              }
              tone={valueTone(todayPnl?.comparablePnlUsdc ?? null)}
            />
            <KpiCard
              label={`P&L · ${periodLabel}`}
              value={formatMoney(summary.total.comparablePnlUsdc)}
              detail={`${periodRange} · ${selectedDays.length} days${summary.missing ? ` · ${summary.missing} missing` : ""}`}
              tone={valueTone(summary.total.comparablePnlUsdc)}
            />
            <KpiCard
              label="Completed trades"
              value={formatInteger(summary.total.completedTrades)}
              detail={
                summary.total.completedTrades
                  ? `${Math.round((summary.total.profitableTrades / summary.total.completedTrades) * 100)}% profitable`
                  : "—"
              }
            />
            <KpiCard
              label="Avg P&L / trade"
              value={formatMoney(
                summary.total.completedTrades
                  ? summary.total.comparablePnlUsdc /
                      summary.total.completedTrades
                  : null,
                3,
              )}
              detail="per completed trade"
              tone={valueTone(
                summary.total.completedTrades
                  ? summary.total.comparablePnlUsdc /
                      summary.total.completedTrades
                  : null,
              )}
            />
            <button
              type="button"
              className={cn(
                "panel kpi-card exposure-card",
                report.haltedExposures.length > 0 && "exposure-card-alert",
              )}
              onClick={() => setTab("diagnostics")}
            >
              <div className="eyebrow">Unknown / halted exposure</div>
              <div
                className={cn(
                  "kpi-value",
                  report.haltedExposures.length > 0
                    ? "text-warning"
                    : "text-muted",
                )}
              >
                {report.haltedExposures.length
                  ? `${report.haltedExposures.length} halted`
                  : "None"}
              </div>
              <div className="kpi-detail">
                {report.haltedExposures.length
                  ? `${report.haltedExposures[0]?.pair.toUpperCase()}/USDC · details in Diagnostics`
                  : "no unknown or halted exposure"}
              </div>
            </button>
          </section>

          <section className="panel chart-panel">
            <div className="panel-heading">
              <h2>
                Daily comparable P&amp;L <span>USDC</span>
              </h2>
              {breakdown === "pair" && pair === "all" && (
                <div className="chart-legend">
                  <span>
                    <i className="legend-wld" />
                    WLD/USDC
                  </span>
                  <span>
                    <i className="legend-esp" />
                    ESP/USDC
                  </span>
                  <span className="legend-note">red shades = loss</span>
                </div>
              )}
              <div className="segment-group segment-group-small">
                <SegmentedButton
                  active={breakdown === "total"}
                  onClick={() => setBreakdown("total")}
                >
                  Total
                </SegmentedButton>
                <SegmentedButton
                  active={breakdown === "pair"}
                  onClick={() => setBreakdown("pair")}
                >
                  By pair
                </SegmentedButton>
              </div>
            </div>

            <div
              className="chart-wrap"
              onMouseLeave={() => setActiveChartIndex(null)}
            >
              <span className="y-label y-label-top">
                +{chartScale.positive.toFixed(chartScale.positive < 3 ? 1 : 0)}
              </span>
              <span className="y-label y-label-bottom">
                −{chartScale.negative.toFixed(chartScale.negative < 3 ? 1 : 0)}
              </span>
              <div
                className="zero-line"
                style={{
                  top: `${(chartScale.positive / chartScale.total) * 100}%`,
                }}
              />
              <div
                className="bars"
                role="img"
                aria-label={`Daily P&L chart for ${periodLabel}`}
              >
                {selectedDays.map((day, index) => {
                  const values =
                    breakdown === "pair" && pair === "all"
                      ? [
                          {
                            pair: "wld" as const,
                            value: day.wld.comparablePnlUsdc,
                          },
                          {
                            pair: "esp" as const,
                            value: day.esp.comparablePnlUsdc,
                          },
                        ]
                      : [
                          {
                            pair:
                              pair === "esp"
                                ? ("esp" as const)
                                : ("wld" as const),
                            value: pairForDay(day, pair).comparablePnlUsdc,
                          },
                        ];
                  // Zero is an absence of P&L, not a tiny positive bar. Keeping
                  // it in the stack made inactive ESP days render as a dashed
                  // line because every segment has a one-pixel minimum height.
                  const positive = values.filter(({ value }) => value > 0);
                  const negative = values.filter(({ value }) => value < 0);
                  return (
                    <button
                      type="button"
                      key={day.date}
                      className={cn(
                        "bar-column",
                        day.status === "no_data" && "bar-column-missing",
                      )}
                      onMouseEnter={() => setActiveChartIndex(index)}
                      onFocus={() => setActiveChartIndex(index)}
                      aria-label={`${formatDay(day.date)}: ${formatMoney(pairForDay(day, pair).comparablePnlUsdc)} USDC`}
                    >
                      <span
                        className="bar-positive"
                        style={{
                          height: `${(chartScale.positive / chartScale.total) * 100}%`,
                        }}
                      >
                        {positive.map((item, itemIndex) => (
                          <i
                            key={`${item.pair}-${itemIndex}`}
                            className={cn(
                              "bar-segment",
                              `bar-${item.pair}-profit`,
                            )}
                            style={{
                              height: `${Math.max(1, (item.value / chartScale.positive) * 100)}%`,
                            }}
                          />
                        ))}
                      </span>
                      <span
                        className="bar-negative"
                        style={{
                          height: `${(chartScale.negative / chartScale.total) * 100}%`,
                        }}
                      >
                        {negative.map((item, itemIndex) => (
                          <i
                            key={`${item.pair}-${itemIndex}`}
                            className={cn(
                              "bar-segment",
                              `bar-${item.pair}-loss`,
                            )}
                            style={{
                              height: `${Math.max(1, (Math.abs(item.value) / chartScale.negative) * 100)}%`,
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeDay && (
                <div
                  className="chart-tooltip"
                  style={{
                    left: `${Math.min(82, Math.max(8, (((activeChartIndex ?? 0) + 0.5) / selectedDays.length) * 100))}%`,
                  }}
                >
                  <strong>{formatDay(activeDay.date)}</strong>
                  <span>
                    {activeDay.status === "no_data"
                      ? "No data recorded"
                      : activeDay.status === "in_progress"
                        ? "Day in progress (UTC)"
                        : "Complete"}
                  </span>
                  <dl>
                    <div>
                      <dt>Total</dt>
                      <dd
                        className={valueTone(
                          pairForDay(activeDay, pair).comparablePnlUsdc,
                        )}
                      >
                        {formatMoney(
                          pairForDay(activeDay, pair).comparablePnlUsdc,
                        )}
                      </dd>
                    </div>
                    {pair === "all" && (
                      <div>
                        <dt>WLD/USDC</dt>
                        <dd
                          className={valueTone(activeDay.wld.comparablePnlUsdc)}
                        >
                          {formatMoney(activeDay.wld.comparablePnlUsdc)}
                        </dd>
                      </div>
                    )}
                    {pair === "all" && (
                      <div>
                        <dt>ESP/USDC</dt>
                        <dd
                          className={valueTone(activeDay.esp.comparablePnlUsdc)}
                        >
                          {formatMoney(activeDay.esp.comparablePnlUsdc)}
                        </dd>
                      </div>
                    )}
                    <div className="tooltip-trades">
                      <dt>Trades</dt>
                      <dd>
                        {activeDay.status === "no_data"
                          ? "—"
                          : formatInteger(
                              pairForDay(activeDay, pair).completedTrades,
                            )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
            <div className="chart-axis" aria-hidden="true">
              {selectedDays.map((day, index) => (
                <div key={day.date}>
                  <i
                    className={cn(
                      haltedDates.has(day.date)
                        ? "chart-status-warning"
                        : day.status === "in_progress" && "chart-status-live",
                    )}
                  />
                  <span>
                    {index % chartLabelEvery === 0
                      ? formatDay(day.date, false)
                      : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="chart-note">
              <span>
                <i className="chart-status-warning" /> partial day / halted
                exposure
              </span>
              <span>
                <i className="chart-status-live" /> in progress
              </span>
              <span>hatched = no data recorded</span>
            </div>
          </section>

          <section className="panel table-panel" aria-label="Daily statement">
            <div className="pnl-table" role="table">
              <div className="table-row table-header" role="row">
                <div>Date</div>
                <div>Total P&amp;L</div>
                <div>WLD/USDC</div>
                <div>ESP/USDC</div>
                <div>Trades</div>
                <div>Avg/trade</div>
                <div />
              </div>
              {[...selectedDays].reverse().map((day) => {
                const aggregate = pairForDay(day, pair);
                const expanded = expandedDate === day.date;

                return (
                  <div key={day.date} className="table-group">
                    <button
                      type="button"
                      className={cn(
                        "table-row table-data",
                        expanded && "table-data-active",
                      )}
                      onClick={() =>
                        setExpandedDate(expanded ? null : day.date)
                      }
                      disabled={day.status === "no_data"}
                      aria-expanded={expanded}
                    >
                      <div className="date-cell">{formatDay(day.date)}</div>
                      <div className={valueTone(aggregate.comparablePnlUsdc)}>
                        {day.status === "no_data"
                          ? "—"
                          : formatMoney(aggregate.comparablePnlUsdc)}
                      </div>
                      <div
                        className={cn(
                          valueTone(day.wld.comparablePnlUsdc),
                          pair === "esp" && "dimmed",
                        )}
                      >
                        {day.status === "no_data"
                          ? "—"
                          : formatMoney(day.wld.comparablePnlUsdc)}
                      </div>
                      <div
                        className={cn(
                          valueTone(day.esp.comparablePnlUsdc),
                          pair === "wld" && "dimmed",
                        )}
                      >
                        {day.status === "no_data"
                          ? "—"
                          : formatMoney(day.esp.comparablePnlUsdc)}
                      </div>
                      <div>
                        {day.status === "no_data"
                          ? "—"
                          : formatInteger(aggregate.completedTrades)}
                      </div>
                      <div
                        className={valueTone(
                          aggregate.completedTrades
                            ? aggregate.comparablePnlUsdc /
                                aggregate.completedTrades
                            : null,
                        )}
                      >
                        {day.status === "no_data" || !aggregate.completedTrades
                          ? "—"
                          : formatMoney(
                              aggregate.comparablePnlUsdc /
                                aggregate.completedTrades,
                              3,
                            )}
                      </div>
                      <div className="chevron-cell">
                        {day.status !== "complete" && (
                          <em className="status-badge">
                            {day.status === "no_data"
                              ? "no data"
                              : "in progress"}
                          </em>
                        )}
                        {day.status !== "no_data" &&
                          (expanded ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          ))}
                      </div>
                    </button>
                    {expanded && (
                      <div className="expanded-row">
                        <div className="decomposition-heading">
                          P&amp;L decomposition ·{" "}
                          {pair === "all"
                            ? "all pairs"
                            : `${pair.toUpperCase()}/USDC`}
                        </div>
                        <div className="accounting-grid">
                          <div className="accounting-card">
                            <span>Cash realized</span>
                            <strong
                              className={valueTone(aggregate.cashRealizedUsdc)}
                            >
                              {formatMoney(aggregate.cashRealizedUsdc)}
                            </strong>
                          </div>
                          <div className="accounting-card">
                            <span>Residual mark</span>
                            <strong
                              className={valueTone(aggregate.residualMarkUsdc)}
                            >
                              {formatMoney(aggregate.residualMarkUsdc)}
                            </strong>
                          </div>
                          <div className="accounting-card">
                            <span>
                              Gas <small>incl. in cash</small>
                            </span>
                            <strong className="text-secondary">
                              {formatMoney(-aggregate.gasCostUsdc)}
                            </strong>
                          </div>
                          <div className="accounting-card">
                            <span>
                              Binance/BNB fees <small>incl.</small>
                            </span>
                            <strong
                              className={
                                aggregate.binanceFeeUsdc
                                  ? "text-secondary"
                                  : "text-muted"
                              }
                            >
                              {aggregate.binanceFeeUsdc === null
                                ? "Unavailable"
                                : formatMoney(-aggregate.binanceFeeUsdc)}
                            </strong>
                          </div>
                          <div className="accounting-card">
                            <span>Recovery loss</span>
                            <strong
                              className={
                                aggregate.recoveryLossUsdc
                                  ? "text-loss"
                                  : "text-muted"
                              }
                            >
                              {formatMoney(-aggregate.recoveryLossUsdc)}
                            </strong>
                          </div>
                          <div className="accounting-card accounting-card-total">
                            <span>Comparable P&amp;L</span>
                            <strong
                              className={valueTone(aggregate.comparablePnlUsdc)}
                            >
                              {formatMoney(aggregate.comparablePnlUsdc)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <p className="accounting-note">
            Comparable P&amp;L = cash realized (after gas and valued Binance
            fees) + conservative mark of residual token inventory, in USDC. Gas
            and fee columns are diagnostic breakouts already reflected in cash
            realized. Days with no recorded data are marked explicitly, not
            shown as zero.
          </p>
        </main>
      ) : (
        <main className="dashboard-content diagnostics-content">
          <p className="diagnostics-intro">
            Investigation tools — raw attempts, balances and gas. Nothing here
            changes the P&amp;L statement on the Overview.
          </p>
          <section
            className={cn(
              "panel exposure-list",
              report.haltedExposures.length > 0 && "exposure-list-alert",
            )}
          >
            <h2 className="exposure-heading">
              Unknown / halted exposure · {report.haltedExposures.length} open
            </h2>
            {report.haltedExposures.length ? (
              report.haltedExposures.map((exposure) => (
                <div className="exposure-line" key={exposure.planId}>
                  <span>{formatUpdated(exposure.observedAt)} UTC</span>
                  <strong>{exposure.pair.toUpperCase()}/USDC</strong>
                  <code>{exposure.planId}</code>
                  <em>{exposure.stage}</em>
                </div>
              ))
            ) : (
              <div className="empty-state">
                No currently blocked inventory state was found.
              </div>
            )}
          </section>

          <section className="panel attempts-panel">
            <div className="panel-heading">
              <h2>
                Recent arbitrage attempts{" "}
                <span>
                  last {Math.min(10, recentAttempts.length)} · live feed
                </span>
              </h2>
            </div>
            <div className="attempts-table">
              <div className="attempt-line attempt-header">
                <span>Time</span>
                <span>Pair</span>
                <span>Route</span>
                <span>Status</span>
                <span>P&amp;L</span>
              </div>
              {recentAttempts.slice(0, 10).map((attempt) => (
                <div className="attempt-line" key={attempt.id}>
                  <span>{formatUpdated(attempt.observedAt)}</span>
                  <span>{attempt.pair.toUpperCase()}/USDC</span>
                  <span>{attempt.direction}</span>
                  <span
                    className={
                      attempt.outcome === "balanced_profit"
                        ? "text-muted"
                        : "text-warning"
                    }
                  >
                    {attempt.outcome.replaceAll("_", " ")}
                  </span>
                  <strong className={valueTone(attempt.comparablePnlUsdc)}>
                    {formatMoney(attempt.comparablePnlUsdc, 4)}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section
            className="diagnostics-live-grid"
            aria-label="Gas and balance telemetry"
          >
            <article className="panel live-telemetry-panel">
              <div className="panel-heading">
                <div>
                  <h2>Gas status</h2>
                </div>
              </div>
              <div className="live-table-scroll">
                <div className="live-table gas-table" role="table">
                  <div className="gas-line live-table-header" role="row">
                    <span>Chain</span>
                    <span>Price</span>
                    <span>Balance</span>
                    <span>Runway</span>
                    <span />
                  </div>
                  {RESOURCE_ROWS.map((resourceRow) => {
                    const status =
                      resourceRow.pair === null
                        ? null
                        : (report.gasStatuses.find(
                            (item) => item.pair === resourceRow.pair,
                          ) ?? null);
                    const resource =
                      report.resourceBalances.find(
                        (item) => item.resourceId === resourceRow.resourceId,
                      ) ?? null;
                    const ageMs = resource
                      ? new Date(report.updatedAt).getTime() -
                        new Date(resource.observedAt).getTime()
                      : Number.POSITIVE_INFINITY;
                    const stale = ageMs > 3 * 60 * 1_000;
                    const check =
                      status?.priceFresh === false ||
                      status?.nativeGasFunded === false;
                    const state =
                      resource === null
                        ? "NO DATA"
                        : stale
                          ? "STALE"
                          : check
                            ? "CHECK"
                            : "OK";
                    return (
                      <div
                        className="gas-line"
                        role="row"
                        key={resourceRow.resourceId}
                      >
                        <strong>{resourceRow.label}</strong>
                        <code>
                          {formatGasPrice(status?.gasPriceGwei ?? null)}
                        </code>
                        <code className={resource ? undefined : "text-muted"}>
                          {resource
                            ? formatResourceAmount(
                                resource.balance,
                                resource.asset,
                              )
                            : "—"}
                        </code>
                        <span className="gas-runway">
                          <strong>
                            {resource
                              ? formatRunwayDays(
                                  resource.balance,
                                  resource.averageDailyConsumption,
                                )
                              : "—"}
                          </strong>
                          {resource && (
                            <small
                              className={
                                !resource.consumptionWindowComplete
                                  ? "text-warning"
                                  : undefined
                              }
                            >
                              {formatResourceAmount(
                                resource.averageDailyConsumption,
                                resource.asset,
                              )}
                              /day
                              {!resource.consumptionWindowComplete &&
                                " · preliminary"}
                            </small>
                          )}
                        </span>
                        <strong
                          className={cn(
                            "gas-health",
                            state !== "OK" && "gas-health-warning",
                          )}
                          title={
                            resource
                              ? `Observed ${formatUpdated(resource.observedAt)} UTC`
                              : "No resource snapshot received"
                          }
                        >
                          {state}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>

            <article className="panel live-telemetry-panel">
              <div className="panel-heading">
                <div>
                  <h2>Balances</h2>
                  <p>Latest wallet and Binance snapshots</p>
                </div>
              </div>
              <div className="live-table-scroll">
                <div className="live-table balances-table" role="table">
                  <div className="balance-line live-table-header" role="row">
                    <span>Venue</span>
                    <span>USDC</span>
                    <span>WLD</span>
                    <span>ESP</span>
                    <span>Updated UTC</span>
                  </div>
                  {report.balances.map((balance) => (
                    <div
                      className="balance-line"
                      role="row"
                      key={balance.venue}
                    >
                      <strong>{balance.venue}</strong>
                      <code>{formatBalance(balance.usdc, "usdc")}</code>
                      <code>{formatBalance(balance.wld, "wld")}</code>
                      <code>{formatBalance(balance.esp, "esp")}</code>
                      <time>{formatUpdated(balance.observedAt)}</time>
                    </div>
                  ))}
                  <div className="balance-line balance-total-line" role="row">
                    <strong>Totals</strong>
                    <code>{formatBalance(balanceTotals.usdc, "usdc")}</code>
                    <code>{formatBalance(balanceTotals.wld, "wld")}</code>
                    <code>{formatBalance(balanceTotals.esp, "esp")}</code>
                    <time>—</time>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </main>
      )}
    </div>
  );
}
