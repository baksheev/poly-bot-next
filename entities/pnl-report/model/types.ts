export type PairKey = "wld" | "esp" | "arb";

export type DailyPairPnl = {
  completedTrades: number;
  profitableTrades: number;
  cashRealizedUsdc: number;
  residualMarkUsdc: number;
  comparablePnlUsdc: number;
  gasCostUsdc: number;
  turnoverUsdc: number;
  binanceFeeUsdc: number | null;
};

export type PnlDay = {
  date: string;
  status: "complete" | "in_progress" | "no_data";
  wld: DailyPairPnl;
  esp: DailyPairPnl;
  arb: DailyPairPnl;
};

export type RecentAttempt = {
  id: string;
  observedAt: string;
  pair: PairKey;
  direction: string;
  outcome: string;
  comparablePnlUsdc: number;
};

export type HaltedExposure = {
  planId: string;
  observedAt: string;
  pair: PairKey;
  stage: string;
};

export type RebalancingState =
  | "healthy"
  | "rebalance_pending"
  | "rebalancing"
  | "settling"
  | "recovering"
  | "blocked"
  | "telemetry_stale";

export type PairRebalancingStatus = {
  pair: PairKey;
  state: RebalancingState;
  since: string | null;
  detail: string;
};

export type GasStatus = {
  pair: PairKey;
  chain: string;
  gasPriceGwei: number | null;
  priceFresh: boolean | null;
  nativeGasFunded: boolean | null;
  observedAt: string | null;
};

export type VenueBalance = {
  venue: string;
  usdc: number | null;
  wld: number | null;
  esp: number | null;
  arb: number | null;
  observedAt: string;
};

export type ResourceBalance = {
  resourceId: string;
  usage: "trading" | "bridge";
  asset: "ETH" | "BNB";
  balance: number;
  consumption24h: number;
  averageDailyConsumption: number;
  consumptionWindowComplete: boolean;
  observedAt: string;
};

export type PnlDashboardReport = {
  source: "clickhouse" | "demo";
  sourceMessage: string | null;
  updatedAt: string;
  days: PnlDay[];
  recentAttempts: RecentAttempt[];
  haltedExposures: HaltedExposure[];
  rebalancingStatuses: PairRebalancingStatus[];
  gasStatuses: GasStatus[];
  balances: VenueBalance[];
  resourceBalances: ResourceBalance[];
};
