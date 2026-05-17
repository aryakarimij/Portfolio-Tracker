"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ViewMode = "simple" | "extended";
type TimeFrame = "day" | "week" | "month" | "ytd" | "all";
type TransactionAction = "buy" | "sell";
type AssetType = "stock" | "derivative";
type DerivativeType = "knockout" | "warrant" | "factor";

type Transaction = {
  id: number;
  action: TransactionAction;
  assetType: AssetType;
  derivativeType?: DerivativeType;
  name: string;
  ticker: string;
  quantity: number;
  price: number;
  commission: number;
  date: string;
};

type Portfolio = {
  id: number;
  name: string;
  transactions: Transaction[];
};

const initialPortfolios: Portfolio[] = [
  {
    id: 1,
    name: "My Portfolio",
    transactions: [],
  },
];

// Removed hardcoded prices, now fetched via Finnhub API

const chartData = {
  day: [
    { label: "09:00", gain: 5 },
    { label: "11:00", gain: 18 },
    { label: "13:00", gain: -8 },
    { label: "15:00", gain: 25 },
    { label: "17:00", gain: 42 },
  ],
  week: [
    { label: "Mon", gain: 20 },
    { label: "Tue", gain: -15 },
    { label: "Wed", gain: 40 },
    { label: "Thu", gain: 10 },
    { label: "Fri", gain: 55 },
  ],
  month: [
    { label: "Week 1", gain: 60 },
    { label: "Week 2", gain: 120 },
    { label: "Week 3", gain: 90 },
    { label: "Week 4", gain: 210 },
  ],
  ytd: [
    { label: "Jan", gain: 100 },
    { label: "Feb", gain: 80 },
    { label: "Mar", gain: 220 },
    { label: "Apr", gain: 190 },
    { label: "May", gain: 310 },
  ],
  all: [
    { label: "2021", gain: 300 },
    { label: "2022", gain: -120 },
    { label: "2023", gain: 500 },
    { label: "2024", gain: 850 },
    { label: "2025", gain: 1020 },
  ],
};

const chartColors = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];

function formatEuro(value: number) {
  return `€${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildHoldings(
  transactions: Transaction[],
  currentPrices: Record<string, number>,
  previousClosePrices: Record<string, number>
) {
  const grouped = new Map<string, Transaction[]>();

  transactions.forEach((transaction) => {
    const key = transaction.ticker.toUpperCase();
    const existing = grouped.get(key) || [];
    grouped.set(key, [...existing, transaction]);
  });

  const openHoldings = [];
  const closedHoldings = [];

  for (const [ticker, tickerTransactions] of grouped.entries()) {
    const buys = tickerTransactions.filter((item) => item.action === "buy");
    const sells = tickerTransactions.filter((item) => item.action === "sell");

    const totalBoughtQuantity = buys.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    const totalSoldQuantity = sells.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    const remainingQuantity = totalBoughtQuantity - totalSoldQuantity;

    const totalBuyCost = buys.reduce(
      (total, item) => total + item.quantity * item.price + item.commission,
      0,
    );

    const totalSellValue = sells.reduce(
      (total, item) => total + item.quantity * item.price - item.commission,
      0,
    );

    const averagePrice =
      totalBoughtQuantity > 0 ? totalBuyCost / totalBoughtQuantity : 0;

    const firstBuy = buys[0];
    const lastSell = sells[sells.length - 1];

    if (!firstBuy) continue;

    if (remainingQuantity > 0) {
      const currentPrice = currentPrices[ticker] || averagePrice;
      const previousClose = previousClosePrices[ticker] || currentPrice;
      const currentValue = remainingQuantity * currentPrice;
      const costBasis = remainingQuantity * averagePrice;
      const previousValue = remainingQuantity * previousClose;

      openHoldings.push({
        name: firstBuy.name,
        ticker,
        type:
          firstBuy.assetType === "derivative"
            ? titleCase(firstBuy.derivativeType || "derivative")
            : "Stock",
        assetType: firstBuy.assetType,
        derivativeType: firstBuy.derivativeType,
        quantity: remainingQuantity,
        averagePrice,
        currentPrice,
        previousClose,
        acquisitionDate: firstBuy.date,
        currentValue,
        dayGainEuro: currentValue - previousValue,
        dayGainPercent:
          previousValue > 0
            ? ((currentValue - previousValue) / previousValue) * 100
            : 0,
        totalGainEuro: currentValue - costBasis,
        totalGainPercent:
          costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0,
      });
    } else {
      closedHoldings.push({
        name: firstBuy.name,
        ticker,
        type:
          firstBuy.assetType === "derivative"
            ? titleCase(firstBuy.derivativeType || "derivative")
            : "Stock",
        assetType: firstBuy.assetType,
        derivativeType: firstBuy.derivativeType,
        quantity: totalBoughtQuantity,
        averagePrice,
        sellPrice: lastSell?.price || 0,
        acquisitionDate: firstBuy.date,
        sellingDate: lastSell?.date || "",
        realizedGainEuro: totalSellValue - totalBuyCost,
        realizedGainPercent:
          totalBuyCost > 0
            ? ((totalSellValue - totalBuyCost) / totalBuyCost) * 100
            : 0,
      });
    }
  }

  return { openHoldings, closedHoldings };
}

export default function Home() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(initialPortfolios);
  const [activePortfolioId, setActivePortfolioId] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  const [finnhubKey, setFinnhubKey] = useState("");
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [livePreviousCloses, setLivePreviousCloses] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem("finnhubKey");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (key) setFinnhubKey(key);

    const savedPortfolios = localStorage.getItem("portfolios");
    if (savedPortfolios) {
      try {
        const parsed = JSON.parse(savedPortfolios);
        if (parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPortfolios(parsed);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setActivePortfolioId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to parse saved portfolios");
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("portfolios", JSON.stringify(portfolios));
    }
  }, [portfolios, isLoaded]);

  useEffect(() => {
    if (!finnhubKey) return;
    const fetchPrices = async () => {
      setIsFetchingPrices(true);
      const currentActivePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
      const tickersToFetch = Array.from(new Set(currentActivePortfolio.transactions.map(t => t.ticker)));
      const newPrices: Record<string, number> = {};
      const newPrevCloses: Record<string, number> = {};
      
      await Promise.all(tickersToFetch.map(async (ticker) => {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.c === 'number' && data.c !== 0) {
              newPrices[ticker] = data.c;
              newPrevCloses[ticker] = data.pc;
            }
          }
        } catch (e) {
          console.error("Failed to fetch quote for", ticker, e);
        }
      }));
      setLivePrices(prev => ({ ...prev, ...newPrices }));
      setLivePreviousCloses(prev => ({ ...prev, ...newPrevCloses }));
      setIsFetchingPrices(false);
    };
    
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [finnhubKey, portfolios, activePortfolioId]);

  const activePortfolio =
    portfolios.find((portfolio) => portfolio.id === activePortfolioId) ||
    portfolios[0];

  const transactions = activePortfolio.transactions;

  const [isRenamingPortfolio, setIsRenamingPortfolio] = useState(false);
  const [portfolioNameInput, setPortfolioNameInput] = useState(
    activePortfolio.name,
  );

  const [timeFrame, setTimeFrame] = useState<TimeFrame>("day");
  const [openViewMode, setOpenViewMode] = useState<ViewMode>("simple");
  const [closedViewMode, setClosedViewMode] = useState<ViewMode>("simple");
  const [portfolioCardMode, setPortfolioCardMode] = useState<
    "value" | "invested"
  >("value");

  const [showAddForm, setShowAddForm] = useState(false);
  const [openEditMode, setOpenEditMode] = useState(false);
  const [closedEditMode, setClosedEditMode] = useState(false);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);

  const [action, setAction] = useState<TransactionAction>("buy");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [derivativeType, setDerivativeType] =
    useState<DerivativeType>("knockout");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [date, setDate] = useState("");

  const { openHoldings, closedHoldings } = useMemo(
    () => buildHoldings(transactions, livePrices, livePreviousCloses),
    [transactions, livePrices, livePreviousCloses],
  );

  const portfolioValue = openHoldings.reduce(
    (total, holding) => total + holding.currentValue,
    0,
  );

  const amountInvested = openHoldings.reduce(
    (total, holding) => total + holding.quantity * holding.averagePrice,
    0,
  );

  const dayGainEuro = openHoldings.reduce(
    (total, holding) => total + holding.dayGainEuro,
    0,
  );

  const openTotalGain = openHoldings.reduce(
    (total, holding) => total + holding.totalGainEuro,
    0,
  );

  const closedTotalGain = closedHoldings.reduce(
    (total, holding) => total + holding.realizedGainEuro,
    0,
  );

  const allTimeGain = openTotalGain + closedTotalGain;

  const allocationData = openHoldings.map((holding) => ({
    name: holding.name,
    value: holding.currentValue,
  }));

  function updateActivePortfolioTransactions(
    updater: (transactions: Transaction[]) => Transaction[],
  ) {
    setPortfolios((currentPortfolios) =>
      currentPortfolios.map((portfolio) =>
        portfolio.id === activePortfolioId
          ? { ...portfolio, transactions: updater(portfolio.transactions) }
          : portfolio,
      ),
    );
  }

  function resetForm() {
    setName("");
    setTicker("");
    setQuantity("");
    setPrice("");
    setCommission("");
    setDate("");
    setAction("buy");
    setAssetType("stock");
    setDerivativeType("knockout");
    setEditingTicker(null);
  }

  function handleCreatePortfolio() {
    const newPortfolio: Portfolio = {
      id: Date.now(),
      name: `New Portfolio ${portfolios.length + 1}`,
      transactions: [],
    };

    setPortfolios((currentPortfolios) => [...currentPortfolios, newPortfolio]);
    setActivePortfolioId(newPortfolio.id);
    setPortfolioNameInput(newPortfolio.name);
    resetForm();
    setShowAddForm(false);
  }

  function handleSavePortfolioName() {
    const trimmedName = portfolioNameInput.trim();

    if (!trimmedName) return;

    setPortfolios((currentPortfolios) =>
      currentPortfolios.map((portfolio) =>
        portfolio.id === activePortfolioId
          ? { ...portfolio, name: trimmedName }
          : portfolio,
      ),
    );

    setIsRenamingPortfolio(false);
  }

  function handleAddTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const newTransaction: Transaction = {
      id: Date.now(),
      action,
      assetType,
      derivativeType: assetType === "derivative" ? derivativeType : undefined,
      name,
      ticker: ticker.toUpperCase(),
      quantity: Number(quantity),
      price: Number(price),
      commission: Number(commission || 0),
      date,
    };

    if (editingTicker) {
      updateActivePortfolioTransactions((currentTransactions) => [
        ...currentTransactions.filter(
          (transaction) => transaction.ticker !== editingTicker,
        ),
        newTransaction,
      ]);
    } else {
      updateActivePortfolioTransactions((currentTransactions) => [
        ...currentTransactions,
        newTransaction,
      ]);
    }

    resetForm();
    setShowAddForm(false);
  }

  function handleRemoveHolding(holdingTicker: string) {
    updateActivePortfolioTransactions((currentTransactions) =>
      currentTransactions.filter(
        (transaction) => transaction.ticker !== holdingTicker,
      ),
    );
  }

  function handleEditOpenHolding(holding: (typeof openHoldings)[number]) {
    setEditingTicker(holding.ticker);
    setAction("buy");
    setAssetType(holding.assetType);
    setDerivativeType(holding.derivativeType || "knockout");
    setName(holding.name);
    setTicker(holding.ticker);
    setQuantity(String(holding.quantity));
    setPrice(String(holding.averagePrice));
    setCommission("0");
    setDate(holding.acquisitionDate);
    setShowAddForm(true);
  }

  function handleEditClosedHolding(holding: (typeof closedHoldings)[number]) {
    setEditingTicker(holding.ticker);
    setAction("sell");
    setAssetType(holding.assetType);
    setDerivativeType(holding.derivativeType || "knockout");
    setName(holding.name);
    setTicker(holding.ticker);
    setQuantity(String(holding.quantity));
    setPrice(String(holding.sellPrice));
    setCommission("0");
    setDate(holding.sellingDate);
    setShowAddForm(true);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {isRenamingPortfolio ? (
              <div className="flex flex-wrap gap-2">
                <input
                  value={portfolioNameInput}
                  onChange={(event) =>
                    setPortfolioNameInput(event.target.value)
                  }
                  className="rounded-lg bg-slate-800 px-4 py-3 text-3xl font-bold text-white"
                />

                <button
                  onClick={handleSavePortfolioName}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-bold text-slate-950"
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    setPortfolioNameInput(activePortfolio.name);
                    setIsRenamingPortfolio(false);
                  }}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-bold">{activePortfolio.name}</h1>

                <button
                  onClick={() => {
                    setPortfolioNameInput(activePortfolio.name);
                    setIsRenamingPortfolio(true);
                  }}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300"
                >
                  ✎
                </button>

                <button
                  onClick={handleCreatePortfolio}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950"
                >
                  +
                </button>

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold ${
                    showSettings ? "bg-white text-slate-950" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  ⚙️ API Key
                </button>
              </div>
            )}

            {showSettings && (
              <div className="mt-4 rounded-xl bg-slate-900 p-4 max-w-md border border-slate-800">
                <label className="text-sm font-bold text-slate-300">Finnhub API Key (Live Prices)</label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="password"
                    value={finnhubKey}
                    onChange={(e) => {
                      setFinnhubKey(e.target.value);
                      localStorage.setItem("finnhubKey", e.target.value);
                    }}
                    placeholder="Enter API Key"
                    className="flex-1 rounded-lg bg-slate-800 p-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Get a free key at <a href="https://finnhub.io" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">finnhub.io</a>. Key is saved locally.
                </p>
              </div>
            )}

            <p className="mt-4 text-slate-300">
              Track your stocks, ETFs, and derivatives in one place.
              {isFetchingPrices && <span className="ml-3 text-emerald-500 text-sm animate-pulse">Fetching live prices...</span>}
            </p>
          </div>

          <div>
            <label className="text-sm text-slate-400">Active Portfolio</label>
            <select
              value={activePortfolioId}
              onChange={(event) => {
                const selectedId = Number(event.target.value);
                const selectedPortfolio = portfolios.find(
                  (portfolio) => portfolio.id === selectedId,
                );

                setActivePortfolioId(selectedId);
                setPortfolioNameInput(selectedPortfolio?.name || "");
                resetForm();
                setShowAddForm(false);
              }}
              className="mt-2 w-full rounded-lg bg-slate-900 p-3 text-white"
            >
              {portfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-900 p-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPortfolioCardMode("value")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  portfolioCardMode === "value"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Portfolio Value
              </button>

              <button
                onClick={() => setPortfolioCardMode("invested")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  portfolioCardMode === "invested"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Amount Invested
              </button>
            </div>

            <p className="mt-5 text-sm text-slate-400">
              {portfolioCardMode === "value"
                ? "Current market value"
                : "Your own money invested"}
            </p>

            <p className="mt-2 text-3xl font-bold">
              {portfolioCardMode === "value"
                ? formatEuro(portfolioValue)
                : formatEuro(amountInvested)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Day Gain</p>
            <p className="mt-2 text-3xl font-bold">{formatEuro(dayGainEuro)}</p>
            <p className="mt-1 text-sm text-slate-400">Open holdings only</p>
          </div>

          <div className="rounded-2xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">All-Time Gain</p>
            <p className="mt-2 text-3xl font-bold">{formatEuro(allTimeGain)}</p>
            <p className="mt-1 text-sm text-slate-400">
              Open + closed holdings
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">Gain Chart</h2>

              <div className="flex flex-wrap gap-2">
                {(["day", "week", "month", "ytd", "all"] as TimeFrame[]).map(
                  (frame) => (
                    <button
                      key={frame}
                      onClick={() => setTimeFrame(frame)}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        timeFrame === frame
                          ? "bg-white text-slate-950"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {frame === "day"
                        ? "Day"
                        : frame === "week"
                          ? "Week"
                          : frame === "month"
                            ? "Month"
                            : frame === "ytd"
                              ? "YTD"
                              : "All Time"}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData[timeFrame]}>
                  <XAxis dataKey="label" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="gain" stroke="#38bdf8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">Current Allocation</h2>

            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name">
                    {allocationData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 space-y-2">
              {allocationData.map((item) => {
                const percent =
                  portfolioValue > 0 ? (item.value / portfolioValue) * 100 : 0;

                return (
                  <div
                    key={item.name}
                    className="flex justify-between text-sm text-slate-300"
                  >
                    <span>{item.name}</span>
                    <span>{formatPercent(percent)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-2xl bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-bold">Open Holdings</h2>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setOpenViewMode("simple")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  openViewMode === "simple"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Simple View
              </button>

              <button
                onClick={() => setOpenViewMode("extended")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  openViewMode === "extended"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Extended View
              </button>

              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm((current) => !current);
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950"
              >
                +
              </button>

              <button
                onClick={() => setOpenEditMode((current) => !current)}
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
                  openEditMode
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                ✎
              </button>
            </div>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleAddTransaction}
              className="mt-6 grid gap-4 rounded-2xl bg-slate-950 p-5 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <h3 className="text-xl font-bold">
                  {editingTicker ? "Edit Holding" : "Add Transaction"}
                </h3>
              </div>

              <div>
                <label className="text-sm text-slate-400">Buy or Sell</label>
                <select
                  value={action}
                  onChange={(event) =>
                    setAction(event.target.value as TransactionAction)
                  }
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-slate-400">Asset Type</label>
                <select
                  value={assetType}
                  onChange={(event) =>
                    setAssetType(event.target.value as AssetType)
                  }
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                >
                  <option value="stock">Normal Stock</option>
                  <option value="derivative">Derivative</option>
                </select>
              </div>

              {assetType === "derivative" && (
                <div>
                  <label className="text-sm text-slate-400">
                    Derivative Type
                  </label>
                  <select
                    value={derivativeType}
                    onChange={(event) =>
                      setDerivativeType(event.target.value as DerivativeType)
                    }
                    className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  >
                    <option value="knockout">Knockout</option>
                    <option value="warrant">Warrant</option>
                    <option value="factor">Factor</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm text-slate-400">Stock Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  placeholder="Apple"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Ticker</label>
                <input
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  placeholder="AAPL"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">
                  Number of Shares
                </label>
                <input
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  placeholder="10"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Price</label>
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  placeholder="180"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">Commission</label>
                <input
                  type="number"
                  step="any"
                  value={commission}
                  onChange={(event) => setCommission(event.target.value)}
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                  placeholder="2"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400">
                  Acquisition / Selling Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white"
                />
              </div>

              <div className="flex gap-3 md:col-span-2">
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-5 py-3 font-bold text-slate-950"
                >
                  {editingTicker ? "Save Changes" : "Add Transaction"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  className="rounded-lg bg-slate-800 px-5 py-3 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Current Price</th>
                  <th className="pb-3">Day Gain</th>

                  {openEditMode && <th className="pb-3">Actions</th>}

                  {openViewMode === "extended" && (
                    <>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Quantity</th>
                      <th className="pb-3">Average Price</th>
                      <th className="pb-3">Acquisition Date</th>
                      <th className="pb-3">Total Gain</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {openHoldings.map((holding) => (
                  <tr
                    key={holding.ticker}
                    className="border-t border-slate-800"
                  >
                    <td className="py-4 font-medium">{holding.name}</td>
                    <td className="py-4">{holding.ticker}</td>
                    <td className="py-4">{formatEuro(holding.currentPrice)}</td>
                    <td className="py-4">
                      {formatEuro(holding.dayGainEuro)}{" "}
                      <span className="text-slate-400">
                        ({formatPercent(holding.dayGainPercent)})
                      </span>
                    </td>

                    {openEditMode && (
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditOpenHolding(holding)}
                            className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleRemoveHolding(holding.ticker)}
                            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}

                    {openViewMode === "extended" && (
                      <>
                        <td className="py-4">{holding.type}</td>
                        <td className="py-4">{holding.quantity}</td>
                        <td className="py-4">
                          {formatEuro(holding.averagePrice)}
                        </td>
                        <td className="py-4">{holding.acquisitionDate}</td>
                        <td className="py-4">
                          {formatEuro(holding.totalGainEuro)}{" "}
                          <span className="text-slate-400">
                            ({formatPercent(holding.totalGainPercent)})
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Closed Holdings</h2>
              <p className="mt-2 text-sm text-slate-400">
                Closed holdings count toward all-time gain, but not day gain or
                current allocation.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setClosedViewMode("simple")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  closedViewMode === "simple"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Simple View
              </button>

              <button
                onClick={() => setClosedViewMode("extended")}
                className={`rounded-lg px-3 py-2 text-sm ${
                  closedViewMode === "extended"
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Extended View
              </button>

              <button
                onClick={() => setClosedEditMode((current) => !current)}
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
                  closedEditMode
                    ? "bg-white text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                ✎
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Ticker</th>
                  <th className="pb-3">Sell Price</th>
                  <th className="pb-3">Realized Gain</th>

                  {closedEditMode && <th className="pb-3">Actions</th>}

                  {closedViewMode === "extended" && (
                    <>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Quantity</th>
                      <th className="pb-3">Average Price</th>
                      <th className="pb-3">Acquisition Date</th>
                      <th className="pb-3">Selling Date</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {closedHoldings.map((holding) => (
                  <tr
                    key={holding.ticker}
                    className="border-t border-slate-800"
                  >
                    <td className="py-4 font-medium">{holding.name}</td>
                    <td className="py-4">{holding.ticker}</td>
                    <td className="py-4">{formatEuro(holding.sellPrice)}</td>
                    <td className="py-4">
                      {formatEuro(holding.realizedGainEuro)}{" "}
                      <span className="text-slate-400">
                        ({formatPercent(holding.realizedGainPercent)})
                      </span>
                    </td>

                    {closedEditMode && (
                      <td className="py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditClosedHolding(holding)}
                            className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleRemoveHolding(holding.ticker)}
                            className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}

                    {closedViewMode === "extended" && (
                      <>
                        <td className="py-4">{holding.type}</td>
                        <td className="py-4">{holding.quantity}</td>
                        <td className="py-4">
                          {formatEuro(holding.averagePrice)}
                        </td>
                        <td className="py-4">{holding.acquisitionDate}</td>
                        <td className="py-4">{holding.sellingDate}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
