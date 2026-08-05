import type {
  DailyPairPnl,
  HaltedExposure,
  PairRebalancingStatus,
  PairKey,
  PnlDashboardReport,
  PnlDay,
  RecentAttempt,
} from "../model/types";

const EMPTY_PAIR: DailyPairPnl = {
  completedTrades: 0,
  profitableTrades: 0,
  cashRealizedUsdc: 0,
  residualMarkUsdc: 0,
  comparablePnlUsdc: 0,
  gasCostUsdc: 0,
  turnoverUsdc: 0,
  binanceFeeUsdc: 0,
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 91.17 + salt * 17.31) * 43758.5453;
  return value - Math.floor(value);
}

function makePair(index: number, pair: PairKey): DailyPairPnl {
  const config = {
    wld: {
      salt: 3,
      tradeRange: 31,
      cashScale: 7.4,
      gasPerTrade: 0.0032,
      turnoverPerTrade: 94,
    },
    esp: {
      salt: 11,
      tradeRange: 17,
      cashScale: 3.1,
      gasPerTrade: 0.0014,
      turnoverPerTrade: 61,
    },
    arb: {
      salt: 19,
      tradeRange: 24,
      cashScale: 4.8,
      gasPerTrade: 0.0017,
      turnoverPerTrade: 78,
    },
  }[pair];
  const { salt } = config;
  const trades = Math.max(
    0,
    Math.round(8 + seeded(index, salt) * config.tradeRange),
  );
  const pulse = Math.sin(index / 4.2 + salt) * 0.75;
  const cash =
    (seeded(index, salt + 2) - 0.34 + pulse * 0.15) * config.cashScale;
  const residual = (seeded(index, salt + 5) - 0.52) * 0.22;
  const gas = trades * config.gasPerTrade;
  const turnover =
    trades * config.turnoverPerTrade * (0.8 + seeded(index, salt + 7) * 0.4);
  const comparable = cash + residual;

  return {
    completedTrades: trades,
    profitableTrades: Math.round(
      trades * (0.52 + seeded(index, salt + 9) * 0.28),
    ),
    cashRealizedUsdc: cash,
    residualMarkUsdc: residual,
    comparablePnlUsdc: comparable,
    gasCostUsdc: gas,
    turnoverUsdc: turnover,
    binanceFeeUsdc: null,
  };
}

export function createDemoPnlReport(
  reason: string | null = null,
): PnlDashboardReport {
  const now = new Date();
  const days: PnlDay[] = [];

  for (let index = 89; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - index,
      ),
    );
    const sequence = 89 - index;
    const missing = sequence === 12 || sequence === 46;

    days.push({
      date: isoDate(date),
      status: missing ? "no_data" : index === 0 ? "in_progress" : "complete",
      wld: missing ? { ...EMPTY_PAIR } : makePair(sequence, "wld"),
      esp:
        missing || sequence < 66
          ? { ...EMPTY_PAIR }
          : makePair(sequence, "esp"),
      arb:
        missing || sequence < 72
          ? { ...EMPTY_PAIR }
          : makePair(sequence, "arb"),
    });
  }

  const attempts: RecentAttempt[] = days
    .slice(-14)
    .flatMap((day, dayIndex) =>
      (["wld", "esp", "arb"] as const).flatMap((pair, pairIndex) => {
        const aggregate = day[pair];
        if (aggregate.completedTrades === 0) return [];
        const count = Math.min(3, aggregate.completedTrades);

        return Array.from({ length: count }, (_, attemptIndex) => {
          const share = aggregate.comparablePnlUsdc / count;
          const hour = 9 + dayIndex + attemptIndex * 2 + pairIndex;
          const observedAt = `${day.date}T${String(hour % 24).padStart(2, "0")}:${String(
            11 + attemptIndex * 13,
          ).padStart(2, "0")}:00.000Z`;

          return {
            id: `${day.date}-${pair}-${attemptIndex}`,
            observedAt,
            pair,
            direction:
              attemptIndex % 2 === 0 ? "DEX → Binance" : "Binance → DEX",
            outcome: share >= 0 ? "balanced_profit" : "balanced_loss",
            comparablePnlUsdc: share,
          } satisfies RecentAttempt;
        });
      }),
    )
    .reverse();

  const exposures: HaltedExposure[] = [
    {
      planId: "esp-7e0c…a19f",
      observedAt:
        days.at(-7)?.date.concat("T14:28:11.000Z") ?? now.toISOString(),
      pair: "esp",
      stage: "BlockedUnknown",
    },
  ];

  const rebalancingStatuses: PairRebalancingStatus[] = [
    {
      pair: "wld",
      state: "rebalancing",
      since: new Date(now.getTime() - 4 * 60 * 1_000).toISOString(),
      detail: "USDC → World Chain wallet · 6,000 USDC in flight · ETA ≈ 4 min",
    },
    {
      pair: "esp",
      state: "blocked",
      since: exposures[0]?.observedAt ?? now.toISOString(),
      detail:
        "ESP deposits on Binance suspended · fail-closed · needs intervention",
    },
    {
      pair: "arb",
      state: "healthy",
      since: null,
      detail: "No open halted exposure detected in current telemetry",
    },
  ];

  return {
    source: "demo",
    sourceMessage: reason,
    updatedAt: now.toISOString(),
    days,
    recentAttempts: attempts,
    haltedExposures: exposures,
    rebalancingStatuses,
    gasStatuses: [
      {
        pair: "wld",
        chain: "World Chain",
        gasPriceGwei: 0.0001,
        priceFresh: true,
        nativeGasFunded: null,
        observedAt: now.toISOString(),
      },
      {
        pair: "esp",
        chain: "Arbitrum",
        gasPriceGwei: 0.02,
        priceFresh: true,
        nativeGasFunded: true,
        observedAt: now.toISOString(),
      },
      {
        pair: "arb",
        chain: "Arbitrum",
        gasPriceGwei: 0.02,
        priceFresh: true,
        nativeGasFunded: true,
        observedAt: now.toISOString(),
      },
    ],
    balances: [
      {
        venue: "Binance Spot",
        usdc: 1127.5422,
        wld: 9599.7992,
        esp: 5006.8914,
        arb: 7482.112,
        observedAt: now.toISOString(),
      },
      {
        venue: "World Chain wallet",
        usdc: 838.9069,
        wld: 4285.252,
        esp: null,
        arb: null,
        observedAt: now.toISOString(),
      },
      {
        venue: "Arbitrum wallet",
        usdc: 627.0743,
        wld: null,
        esp: 5006.8914,
        arb: 6210.4431,
        observedAt: now.toISOString(),
      },
    ],
    resourceBalances: [
      {
        resourceId: "eip155:480:evm-wallet:primary:native",
        usage: "trading",
        asset: "ETH",
        balance: 0.418,
        consumption24h: 0.0041,
        averageDailyConsumption: 0.0041,
        consumptionWindowComplete: true,
        observedAt: now.toISOString(),
      },
      {
        resourceId: "eip155:42161:evm-wallet:primary:native",
        usage: "trading",
        asset: "ETH",
        balance: 0.162,
        consumption24h: 0.0028,
        averageDailyConsumption: 0.0028,
        consumptionWindowComplete: true,
        observedAt: now.toISOString(),
      },
      {
        resourceId: "eip155:10:evm-wallet:primary:native",
        usage: "bridge",
        asset: "ETH",
        balance: 0.084,
        consumption24h: 0.0007,
        averageDailyConsumption: 0.0007,
        consumptionWindowComplete: false,
        observedAt: now.toISOString(),
      },
      {
        resourceId: "binance-spot:primary:asset:BNB",
        usage: "trading",
        asset: "BNB",
        balance: 0.31,
        consumption24h: 0.003,
        averageDailyConsumption: 0.003,
        consumptionWindowComplete: false,
        observedAt: now.toISOString(),
      },
    ],
  };
}
