import "server-only";

import { z } from "zod";

import type {
  DailyPairPnl,
  GasStatus,
  HaltedExposure,
  PairKey,
  PnlDashboardReport,
  PnlDay,
  RecentAttempt,
  ResourceBalance,
  VenueBalance,
} from "../model/types";
import { createDemoPnlReport } from "./demo-pnl-report";

const PAIR_IDS: Record<PairKey, string> = {
  wld: "world-chain-usdc-wld",
  esp: "arbitrum-usdc-esp",
};

const dailyRowSchema = z.object({
  date: z.string(),
  pair_id: z.string(),
  completed_trades: z.coerce.number(),
  profitable_trades: z.coerce.number(),
  cash_realized_usdc: z.coerce.number(),
  residual_mark_usdc: z.coerce.number(),
  comparable_pnl_usdc: z.coerce.number(),
  gas_cost_usdc: z.coerce.number(),
  turnover_usdc: z.coerce.number(),
  binance_fee_usdc: z.coerce.number().nullable(),
});

const attemptRowSchema = z.object({
  plan_id: z.string(),
  observed_at: z.string(),
  pair_id: z.string(),
  direction: z.string(),
  outcome: z.string(),
  comparable_pnl_usdc: z.coerce.number(),
});

const exposureRowSchema = z.object({
  plan_id: z.string(),
  observed_at: z.string(),
  pair_id: z.string(),
  stage: z.string(),
});

const balanceRowSchema = z.object({
  kind: z.enum(["wallet_balance_snapshot", "binance_balance_snapshot"]),
  observed_at: z.string(),
  payload_json: z.string(),
});

const walletBalancePayloadSchema = z.object({
  chain_id: z.coerce.number(),
  token_balances: z.array(
    z.object({
      symbol: z.string(),
      base_units: z.string(),
    }),
  ),
});

const binanceBalancePayloadSchema = z.object({
  balances: z.array(
    z.object({
      asset: z.string(),
      free: z.string(),
      locked: z.string(),
    }),
  ),
});

const gasPriceRowSchema = z.object({
  pair_id: z.string(),
  observed_at: z.string(),
  gas_price_wei: z.coerce.number().nullable(),
  gas_price_fresh: z.coerce.number(),
});

const gasReadinessRowSchema = z.object({
  pair_id: z.string(),
  observed_at: z.string(),
  native_gas_funded: z.coerce.number(),
});

const resourceBalanceRowSchema = z.object({
  resource_id: z.string(),
  usage: z.enum(["trading", "bridge"]),
  asset: z.enum(["ETH", "BNB"]),
  balance: z.string(),
  consumption_24h: z.string(),
  average_daily_consumption: z.string(),
  consumption_window_complete: z.coerce.number(),
  observed_at: z.string(),
});

type ClickHouseConfig = {
  url: string;
  database: string;
  user: string;
  password: string;
};

function getConfig(): ClickHouseConfig | null {
  const url = process.env.CLICKHOUSE_URL?.trim();
  if (!url) return null;

  const database = process.env.CLICKHOUSE_DATABASE?.trim() || "arb_bot_prod";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    throw new Error("CLICKHOUSE_DATABASE must be a safe SQL identifier");
  }

  return {
    url,
    database,
    user: process.env.CLICKHOUSE_USER?.trim() || "default",
    password: process.env.CLICKHOUSE_PASSWORD || "",
  };
}

async function clickHouseQuery(config: ClickHouseConfig, query: string) {
  const endpoint = new URL(config.url);
  endpoint.searchParams.set("database", config.database);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.user}:${config.password}`).toString("base64")}`,
      "content-type": "text/plain; charset=utf-8",
    },
    body: `${query.trim()}\nFORMAT JSONEachRow`,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`ClickHouse returned ${response.status}`);
  }

  const body = await response.text();
  return body
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function loadResourceBalances(config: ClickHouseConfig): Promise<ResourceBalance[]> {
  const query = `
    SELECT
      resource_id,
      argMax(usage, observed_at_ms) AS usage,
      argMax(asset, observed_at_ms) AS asset,
      argMax(balance, observed_at_ms) AS balance,
      argMax(consumption_24h, observed_at_ms) AS consumption_24h,
      argMax(average_daily_consumption, observed_at_ms) AS average_daily_consumption,
      argMax(consumption_window_complete, observed_at_ms) AS consumption_window_complete,
      formatDateTime(fromUnixTimestamp64Milli(max(observed_at_ms)), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at
    FROM resource_balance_snapshots
    WHERE resource_id IN (
      'eip155:480:evm-wallet:primary:native',
      'eip155:42161:evm-wallet:primary:native',
      'eip155:10:evm-wallet:primary:native',
      'binance-spot:primary:asset:BNB'
    )
      AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 2 DAY)
    GROUP BY resource_id
    ORDER BY resource_id ASC
  `;

  try {
    const raw = await clickHouseQuery(config, query);
    return z.array(resourceBalanceRowSchema).parse(raw).flatMap((row) => {
      const balance = Number(row.balance);
      const consumption24h = Number(row.consumption_24h);
      const averageDailyConsumption = Number(row.average_daily_consumption);
      if (![balance, consumption24h, averageDailyConsumption].every(Number.isFinite)) return [];

      return [{
        resourceId: row.resource_id,
        usage: row.usage,
        asset: row.asset,
        balance,
        consumption24h,
        averageDailyConsumption,
        consumptionWindowComplete: Boolean(row.consumption_window_complete),
        observedAt: row.observed_at,
      }];
    });
  } catch {
    // Resource telemetry was added after the original dashboard. Keep the
    // established P&L feed live while the new table is being rolled out.
    return [];
  }
}

function pairKey(pairId: string): PairKey | null {
  if (pairId === PAIR_IDS.wld) return "wld";
  if (pairId === PAIR_IDS.esp) return "esp";
  return null;
}

function emptyPair(): DailyPairPnl {
  return {
    completedTrades: 0,
    profitableTrades: 0,
    cashRealizedUsdc: 0,
    residualMarkUsdc: 0,
    comparablePnlUsdc: 0,
    gasCostUsdc: 0,
    turnoverUsdc: 0,
    binanceFeeUsdc: 0,
  };
}

function createUtcDateRange(days: number) {
  const now = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - index - 1)));
    return date.toISOString().slice(0, 10);
  });
}

function tokenBalance(baseUnits: string, decimals: number) {
  const value = Number(baseUnits);
  return Number.isFinite(value) ? value / 10 ** decimals : null;
}

function latestIso(left: string | null, right: string) {
  return left === null || right > left ? right : left;
}

async function loadClickHouseReport(config: ClickHouseConfig): Promise<PnlDashboardReport> {
  const dailyQuery = `
    SELECT
      toString(toDate(fromUnixTimestamp64Milli(observed_at_ms), 'UTC')) AS date,
      JSONExtractString(payload_json, 'pair_id') AS pair_id,
      count() AS completed_trades,
      countIf(JSONExtractString(payload_json, 'outcome') = 'balanced_profit') AS profitable_trades,
      sum(toInt128OrZero(JSONExtractString(payload_json, 'realized_profit_token_a_base_units'))) / 1000000 AS cash_realized_usdc,
      sum(toInt128OrZero(JSONExtractString(payload_json, 'residual_value_token_a_base_units'))) / 1000000 AS residual_mark_usdc,
      sum(toInt128OrZero(JSONExtractString(payload_json, 'comparable_profit_token_a_base_units'))) / 1000000 AS comparable_pnl_usdc,
      sum(toInt128OrZero(JSONExtractString(payload_json, 'gas_cost_token_a_base_units'))) / 1000000 AS gas_cost_usdc,
      sum(toInt128OrZero(JSONExtractString(payload_json, 'realized_primary_cost_token_a_base_units'))) / 1000000 AS turnover_usdc,
      if(
        countIf(NOT JSONExtractBool(payload_json, 'third_asset_valuation_complete')) > 0,
        NULL,
        sum(
          -toFloat64OrZero(JSONExtractString(JSONExtractRaw(JSONExtractRaw(payload_json, 'cex'), 'third_asset_deltas'), 'BNB'))
            * toFloat64OrZero(JSONExtractString(JSONExtractRaw(JSONExtractRaw(payload_json, 'cex'), 'third_asset_prices_token_a'), 'BNB'))
          + arraySum(arrayMap(
              leg -> -toFloat64OrZero(JSONExtractString(JSONExtractRaw(leg, 'third_asset_deltas'), 'BNB'))
                * toFloat64OrZero(JSONExtractString(JSONExtractRaw(leg, 'third_asset_prices_token_a'), 'BNB')),
              JSONExtractArrayRaw(payload_json, 'recoveries')
            ))
        )
      ) AS binance_fee_usdc
    FROM runtime_telemetry
    WHERE kind = 'arbitrage_result'
      AND JSONExtractString(payload_json, 'pair_id') IN ('${PAIR_IDS.wld}', '${PAIR_IDS.esp}')
      AND JSONExtractString(payload_json, 'execution_mode') = 'dex_first'
      AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 90 DAY)
    GROUP BY date, pair_id
    ORDER BY date ASC, pair_id ASC
  `;

  const attemptsQuery = `
    SELECT
      JSONExtractString(payload_json, 'plan_id') AS plan_id,
      formatDateTime(fromUnixTimestamp64Milli(observed_at_ms), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at,
      JSONExtractString(payload_json, 'pair_id') AS pair_id,
      JSONExtractString(payload_json, 'direction') AS direction,
      JSONExtractString(payload_json, 'outcome') AS outcome,
      toInt128OrZero(JSONExtractString(payload_json, 'comparable_profit_token_a_base_units')) / 1000000 AS comparable_pnl_usdc
    FROM runtime_telemetry
    WHERE kind = 'arbitrage_result'
      AND JSONExtractString(payload_json, 'pair_id') IN ('${PAIR_IDS.wld}', '${PAIR_IDS.esp}')
      AND JSONExtractString(payload_json, 'execution_mode') = 'dex_first'
    ORDER BY observed_at_ms DESC
    LIMIT 120
  `;

  const exposuresQuery = `
    SELECT
      plan_id,
      formatDateTime(fromUnixTimestamp64Milli(blocked_at), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at,
      pair_id,
      'BlockedUnknown' AS stage
    FROM
    (
      SELECT
        JSONExtractString(payload_json, 'plan_id') AS plan_id,
        maxIf(
          observed_at_ms,
          kind = 'arbitrage_inventory_state'
            AND JSONExtractString(payload_json, 'state') = 'BlockedUnknown'
        ) AS blocked_at,
        maxIf(observed_at_ms, kind = 'arbitrage_result') AS result_at,
        maxIf(
          observed_at_ms,
          kind = 'arbitrage_terminal_state'
            AND JSONExtractString(payload_json, 'state') = 'Balanced'
        ) AS terminal_at,
        argMaxIf(
          JSONExtractString(payload_json, 'pair_id'),
          observed_at_ms,
          kind IN ('arbitrage_admitted', 'arbitrage_result', 'arbitrage_terminal_state')
            AND JSONExtractString(payload_json, 'pair_id') != ''
        ) AS pair_id
      FROM runtime_telemetry
      WHERE kind IN (
        'arbitrage_inventory_state',
        'arbitrage_admitted',
        'arbitrage_result',
        'arbitrage_terminal_state'
      )
        AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 30 DAY)
      GROUP BY plan_id
    )
    WHERE blocked_at > greatest(result_at, terminal_at)
      AND plan_id != ''
      AND pair_id IN ('${PAIR_IDS.wld}', '${PAIR_IDS.esp}')
    ORDER BY blocked_at DESC
    LIMIT 50
  `;

  const balancesQuery = `
    SELECT
      kind,
      formatDateTime(fromUnixTimestamp64Milli(max(observed_at_ms)), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at,
      argMax(payload_json, observed_at_ms) AS payload_json
    FROM
    (
      SELECT
        kind,
        observed_at_ms,
        payload_json,
        if(kind = 'wallet_balance_snapshot', JSONExtractUInt(payload_json, 'chain_id'), 0) AS venue_key
      FROM runtime_telemetry
      WHERE kind IN ('wallet_balance_snapshot', 'binance_balance_snapshot')
        AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 7 DAY)
    )
    GROUP BY kind, venue_key
    ORDER BY kind ASC, observed_at DESC
  `;

  const gasPricesQuery = `
    SELECT
      JSONExtractString(payload_json, 'pair_id') AS pair_id,
      formatDateTime(fromUnixTimestamp64Milli(observed_at_ms), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at,
      toFloat64OrNull(JSONExtractString(
        JSONExtractRaw(JSONExtractRaw(payload_json, 'candidate'), 'pretrade_cost'),
        'gas_price_wei'
      )) AS gas_price_wei,
      JSONExtractBool(
        JSONExtractRaw(JSONExtractRaw(payload_json, 'candidate'), 'pretrade_cost'),
        'gas_price_fresh'
      ) AS gas_price_fresh
    FROM runtime_telemetry
    WHERE kind = 'pretrade_cost_candidate'
      AND JSONExtractString(payload_json, 'pair_id') IN ('${PAIR_IDS.wld}', '${PAIR_IDS.esp}')
      AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 7 DAY)
    ORDER BY pair_id ASC, observed_at_ms DESC
    LIMIT 1 BY pair_id
  `;

  const gasReadinessQuery = `
    SELECT
      JSONExtractString(payload_json, 'pair_id') AS pair_id,
      formatDateTime(fromUnixTimestamp64Milli(observed_at_ms), '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS observed_at,
      JSONExtractBool(payload_json, 'native_gas_funded') AS native_gas_funded
    FROM runtime_telemetry
    WHERE kind = 'live_readiness'
      AND JSONExtractString(payload_json, 'stage') = 'arbitrum_chain'
      AND JSONExtractString(payload_json, 'pair_id') IN ('${PAIR_IDS.wld}', '${PAIR_IDS.esp}')
      AND observed_at_ms >= toUnixTimestamp64Milli(now64(3, 'UTC') - INTERVAL 7 DAY)
    ORDER BY pair_id ASC, observed_at_ms DESC
    LIMIT 1 BY pair_id
  `;

  const [dailyRaw, attemptsRaw, exposuresRaw, balancesRaw, gasPricesRaw, gasReadinessRaw, resourceBalances] = await Promise.all([
    clickHouseQuery(config, dailyQuery),
    clickHouseQuery(config, attemptsQuery),
    clickHouseQuery(config, exposuresQuery),
    clickHouseQuery(config, balancesQuery),
    clickHouseQuery(config, gasPricesQuery),
    clickHouseQuery(config, gasReadinessQuery),
    loadResourceBalances(config),
  ]);

  const dailyRows = z.array(dailyRowSchema).parse(dailyRaw);
  const attemptsRows = z.array(attemptRowSchema).parse(attemptsRaw);
  const exposureRows = z.array(exposureRowSchema).parse(exposuresRaw);
  const balanceRows = z.array(balanceRowSchema).parse(balancesRaw);
  const gasPriceRows = z.array(gasPriceRowSchema).parse(gasPricesRaw);
  const gasReadinessRows = z.array(gasReadinessRowSchema).parse(gasReadinessRaw);
  const daysByDate = new Map<string, PnlDay>();
  const today = new Date().toISOString().slice(0, 10);

  for (const date of createUtcDateRange(90)) {
    daysByDate.set(date, {
      date,
      status: date === today ? "in_progress" : "no_data",
      wld: emptyPair(),
      esp: emptyPair(),
    });
  }

  for (const row of dailyRows) {
    const key = pairKey(row.pair_id);
    const day = daysByDate.get(row.date);
    if (!key || !day) continue;

    day.status = row.date === today ? "in_progress" : "complete";
    day[key] = {
      completedTrades: row.completed_trades,
      profitableTrades: row.profitable_trades,
      cashRealizedUsdc: row.cash_realized_usdc,
      residualMarkUsdc: row.residual_mark_usdc,
      comparablePnlUsdc: row.comparable_pnl_usdc,
      gasCostUsdc: row.gas_cost_usdc,
      turnoverUsdc: row.turnover_usdc,
      binanceFeeUsdc: row.binance_fee_usdc,
    };
  }

  const recentAttempts: RecentAttempt[] = attemptsRows.flatMap((row) => {
    const pair = pairKey(row.pair_id);
    if (!pair) return [];
    return [
      {
        id: row.plan_id,
        observedAt: row.observed_at,
        pair,
        direction: row.direction,
        outcome: row.outcome,
        comparablePnlUsdc: row.comparable_pnl_usdc,
      },
    ];
  });

  const haltedExposures: HaltedExposure[] = exposureRows.flatMap((row) => {
    const pair = pairKey(row.pair_id);
    if (!pair) return [];
    return [{ planId: row.plan_id, observedAt: row.observed_at, pair, stage: row.stage }];
  });

  const balances: VenueBalance[] = balanceRows.flatMap((row) => {
    if (row.kind === "wallet_balance_snapshot") {
      const payload = walletBalancePayloadSchema.parse(JSON.parse(row.payload_json));
      const venue = payload.chain_id === 480
        ? "World Chain wallet"
        : payload.chain_id === 42161
          ? "Arbitrum wallet"
          : null;
      if (!venue) return [];

      const amount = (symbol: "USDC" | "WLD" | "ESP") => {
        const token = payload.token_balances.find((item) => item.symbol.toUpperCase() === symbol);
        if (!token) return null;
        return tokenBalance(token.base_units, symbol === "USDC" ? 6 : 18);
      };

      return [{
        venue,
        usdc: amount("USDC"),
        wld: amount("WLD"),
        esp: amount("ESP"),
        observedAt: row.observed_at,
      }];
    }

    const payload = binanceBalancePayloadSchema.parse(JSON.parse(row.payload_json));
    const amount = (asset: "USDC" | "WLD" | "ESP") => {
      const balance = payload.balances.find((item) => item.asset.toUpperCase() === asset);
      if (!balance) return null;
      const value = Number(balance.free) + Number(balance.locked);
      return Number.isFinite(value) ? value : null;
    };

    return [{
      venue: "Binance Spot",
      usdc: amount("USDC"),
      wld: amount("WLD"),
      esp: amount("ESP"),
      observedAt: row.observed_at,
    }];
  }).sort((left, right) => {
    const order = ["Binance Spot", "World Chain wallet", "Arbitrum wallet"];
    return order.indexOf(left.venue) - order.indexOf(right.venue);
  });

  const gasByPair = new Map<PairKey, GasStatus>([
    ["wld", { pair: "wld", chain: "World Chain", gasPriceGwei: null, priceFresh: null, nativeGasFunded: null, observedAt: null }],
    ["esp", { pair: "esp", chain: "Arbitrum", gasPriceGwei: null, priceFresh: null, nativeGasFunded: null, observedAt: null }],
  ]);

  for (const row of gasPriceRows) {
    const key = pairKey(row.pair_id);
    const status = key ? gasByPair.get(key) : null;
    if (!status) continue;
    status.gasPriceGwei = row.gas_price_wei === null ? null : row.gas_price_wei / 1_000_000_000;
    status.priceFresh = Boolean(row.gas_price_fresh);
    status.observedAt = latestIso(status.observedAt, row.observed_at);
  }

  for (const row of gasReadinessRows) {
    const key = pairKey(row.pair_id);
    const status = key ? gasByPair.get(key) : null;
    if (!status) continue;
    status.nativeGasFunded = Boolean(row.native_gas_funded);
    status.observedAt = latestIso(status.observedAt, row.observed_at);
  }

  return {
    source: "clickhouse",
    sourceMessage: null,
    updatedAt: new Date().toISOString(),
    days: [...daysByDate.values()],
    recentAttempts,
    haltedExposures,
    gasStatuses: [...gasByPair.values()],
    balances,
    resourceBalances,
  };
}

export async function getPnlDashboard(): Promise<PnlDashboardReport> {
  const config = getConfig();
  if (!config) return createDemoPnlReport("CLICKHOUSE_URL is not configured");

  try {
    return await loadClickHouseReport(config);
  } catch (error) {
    if (process.env.CLICKHOUSE_REQUIRED === "1") throw error;
    const message = error instanceof Error ? error.message : "ClickHouse is unavailable";
    return createDemoPnlReport(message);
  }
}
