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

const chartColors = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];

function formatEuro(value: number) {
  return `€${value.toFixed(2)}`;
}

function formatCurrency(value: number, currency: string) {
  if (currency === "EUR") return `€${value.toFixed(2)}`;
  if (currency === "USD") return `${value.toFixed(2)}`;
  if (currency === "SEK") return `${value.toFixed(2)} kr`;
  if (currency === "GBP") return `£${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function getGainColor(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-slate-400";
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildHoldings(
  transactions: Transaction[],
  quotes: Record<
    string,
    { price: number; prevClose: number; currency: string }
  >,
  rates: Record<string, number>,
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
      const quote = quotes[ticker];
      const currentPrice = quote ? quote.price : averagePrice;
      const previousClose = quote ? quote.prevClose : currentPrice;
      const currency = quote ? quote.currency : "EUR";
      const rateToEur = rates[currency] || 1;

      const currentValueNative = remainingQuantity * currentPrice;
      const costBasisNative = remainingQuantity * averagePrice;
      const previousValueNative = remainingQuantity * previousClose;

      const currentValueEur = currentValueNative * rateToEur;
      const costBasisEur = costBasisNative * rateToEur;
      const previousValueEur = previousValueNative * rateToEur;

      openHoldings.push({
        name: firstBuy.name,
        ticker,
        currency,
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
        currentValue: currentValueEur,
        dayGainEuro: currentValueEur - previousValueEur,
        dayGainPercent:
          previousValueEur > 0
            ? ((currentValueEur - previousValueEur) / previousValueEur) * 100
            : 0,
        totalGainEuro: currentValueEur - costBasisEur,
        totalGainPercent:
          costBasisEur > 0
            ? ((currentValueEur - costBasisEur) / costBasisEur) * 100
            : 0,
        costBasisEur,
      });
    } else {
      const quote = quotes[ticker];
      const currency = quote ? quote.currency : "EUR";
      const rateToEur = rates[currency] || 1;

      const totalSellValueEur = totalSellValue * rateToEur;
      const totalBuyCostEur = totalBuyCost * rateToEur;

      closedHoldings.push({
        name: firstBuy.name,
        ticker,
        currency,
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
        realizedGainEuro: totalSellValueEur - totalBuyCostEur,
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

  const [quotes, setQuotes] = useState<
    Record<string, { price: number; prevClose: number; currency: string }>
  >({});
  const [rates, setRates] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [historicalData, setHistoricalData] = useState<
    Record<string, { t: number[]; c: number[]; currency: string }>
  >({});
  const [historicalRates, setHistoricalRates] = useState<
    Record<string, { t: number[]; c: number[] }>
  >({});
  const [isFetchingHistorical, setIsFetchingHistorical] = useState(false);

  useEffect(() => {
    const savedPortfolios = localStorage.getItem("portfolios");
    if (savedPortfolios) {
      try {
        const parsed = JSON.parse(savedPortfolios);
        if (parsed.length > 0) {
          setPortfolios(parsed);
          setActivePortfolioId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to parse saved portfolios");
      }
    }

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("portfolios", JSON.stringify(portfolios));
    }
  }, [portfolios, isLoaded]);

  useEffect(() => {
    const fetchQuotes = async () => {
      setIsFetchingPrices(true);

      const currentActivePortfolio =
        portfolios.find((p) => p.id === activePortfolioId) || portfolios[0];

      if (
        !currentActivePortfolio ||
        currentActivePortfolio.transactions.length === 0
      ) {
        setIsFetchingPrices(false);
        return;
      }

      const tickersToFetch = Array.from(
        new Set(currentActivePortfolio.transactions.map((t) => t.ticker)),
      );

      try {
        const res = await fetch(
          `/api/yahoo/quote?symbols=${tickersToFetch.join(",")}`,
        );

        if (res.ok) {
          const data = await res.json();
          setQuotes((prev) => ({ ...prev, ...data.quotes }));
          setRates((prev) => ({ ...prev, ...data.rates }));
        }
      } catch (e) {
        console.error("Failed to fetch quotes", e);
      }

      setIsFetchingPrices(false);
    };

    fetchQuotes();

    const interval = setInterval(fetchQuotes, 60000);

    return () => clearInterval(interval);
  }, [portfolios, activePortfolioId]);

  useEffect(() => {
    const currentActivePortfolio =
      portfolios.find((p) => p.id === activePortfolioId) || portfolios[0];

    if (
      !currentActivePortfolio ||
      currentActivePortfolio.transactions.length === 0
    ) {
      return;
    }

    const earliestDateStr = currentActivePortfolio.transactions.reduce(
      (earliest, t) => {
        return t.date < earliest ? t.date : earliest;
      },
      currentActivePortfolio.transactions[0].date,
    );

    const earliestTimestamp =
      Math.floor(new Date(earliestDateStr).getTime() / 1000) - 3 * 86400;

    const currentTimestamp = Math.floor(Date.now() / 1000);

    const tickersToFetch = Array.from(
      new Set(currentActivePortfolio.transactions.map((t) => t.ticker)),
    );

    const fetchHistoricalData = async () => {
      setIsFetchingHistorical(true);

      try {
        const res = await fetch(
          `/api/yahoo/history?symbols=${tickersToFetch.join(",")}&from=${earliestTimestamp}&to=${currentTimestamp}`,
        );

        if (res.ok) {
          const data = await res.json();
          setHistoricalData((prev) => ({ ...prev, ...data.history }));
          setHistoricalRates((prev) => ({ ...prev, ...data.ratesHistory }));
        }
      } catch (e) {
        console.error("Failed to fetch historical data", e);
      }

      setIsFetchingHistorical(false);
    };

    fetchHistoricalData();
  }, [portfolios, activePortfolioId]);

  const dynamicChartData = useMemo(() => {
    const defaultData = { day: [], week: [], month: [], ytd: [], all: [] };

    const currentActivePortfolio =
      portfolios.find((p) => p.id === activePortfolioId) || portfolios[0];

    if (
      !currentActivePortfolio ||
      currentActivePortfolio.transactions.length === 0
    ) {
      return defaultData;
    }

    const txs = currentActivePortfolio.transactions;

    const earliestDateStr = txs.reduce((earliest, t) => {
      return t.date < earliest ? t.date : earliest;
    }, txs[0].date);

    const earliestTime = new Date(`${earliestDateStr}T00:00:00Z`).getTime();
    const currentTime = Date.now();

    const dailyTimestamps: number[] = [];

    for (let t = earliestTime; t <= currentTime; t += 86400000) {
      dailyTimestamps.push(
        new Date(
          new Date(t).toISOString().split("T")[0] + "T00:00:00Z",
        ).getTime(),
      );
    }

    const todayTime = new Date(
      new Date().toISOString().split("T")[0] + "T00:00:00Z",
    ).getTime();

    if (
      dailyTimestamps.length === 0 ||
      dailyTimestamps[dailyTimestamps.length - 1] !== todayTime
    ) {
      dailyTimestamps.push(todayTime);
    }

    const sortedTx = [...txs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const timelineData: { date: number; label: string; gain: number }[] = [];

    const currentHoldings: Record<
      string,
      { qty: number; investedEur: number }
    > = {};

    const getHistoricalValue = (ticker: string, ts: number) => {
      const hData = historicalData[ticker];
      const targetS = Math.floor(ts / 1000);

      let closestPrice = quotes[ticker]?.price || 0;
      let currency = quotes[ticker]?.currency || "EUR";

      if (hData && hData.t && hData.t.length > 0) {
        currency = hData.currency;
        closestPrice = hData.c[0];

        for (let i = 0; i < hData.t.length; i++) {
          if (hData.t[i] <= targetS + 86400) {
            closestPrice = hData.c[i];
          } else {
            break;
          }
        }
      }

      let rateToEur = 1;

      if (currency !== "EUR") {
        const rData = historicalRates[currency];

        if (rData && rData.t && rData.t.length > 0) {
          rateToEur = rData.c[0];

          for (let i = 0; i < rData.t.length; i++) {
            if (rData.t[i] <= targetS + 86400) {
              rateToEur = rData.c[i];
            } else {
              break;
            }
          }
        } else {
          rateToEur = rates[currency] || 1;
        }
      }

      return { priceNative: closestPrice, rateToEur };
    };

    dailyTimestamps.forEach((ts) => {
      const dateStr = new Date(ts).toISOString().split("T")[0];

      const txsToday = sortedTx.filter((t) => t.date === dateStr);

      txsToday.forEach((tx) => {
        if (!currentHoldings[tx.ticker]) {
          currentHoldings[tx.ticker] = { qty: 0, investedEur: 0 };
        }

        const quote = quotes[tx.ticker];
        const currency = quote ? quote.currency : "EUR";
        const rateToEur = rates[currency] || 1;

        if (tx.action === "buy") {
          currentHoldings[tx.ticker].qty += tx.quantity;

          const investedNative = tx.quantity * tx.price + tx.commission;

          currentHoldings[tx.ticker].investedEur += investedNative * rateToEur;
        } else if (tx.action === "sell") {
          if (currentHoldings[tx.ticker].qty > 0) {
            const avgCostEur =
              currentHoldings[tx.ticker].investedEur /
              currentHoldings[tx.ticker].qty;

            currentHoldings[tx.ticker].investedEur -= tx.quantity * avgCostEur;

            currentHoldings[tx.ticker].qty -= tx.quantity;
          }
        }
      });

      let totalValueEur = 0;
      let totalInvestedEur = 0;

      for (const [ticker, holding] of Object.entries(currentHoldings)) {
        if (holding.qty > 0) {
          const { priceNative, rateToEur } = getHistoricalValue(ticker, ts);

          totalValueEur += holding.qty * priceNative * rateToEur;
          totalInvestedEur += holding.investedEur;
        }
      }

      const gain = totalValueEur - totalInvestedEur;

      timelineData.push({
        date: ts,
        label: new Date(ts).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        gain: Math.round(gain * 100) / 100,
      });
    });

    const all = timelineData;

    const currentYear = new Date().getFullYear();
    const ytdStart = new Date(`${currentYear}-01-01T00:00:00Z`).getTime();

    let ytd = timelineData.filter((d) => d.date >= ytdStart);

    if (ytd.length === 0 && timelineData.length > 0) {
      ytd = [timelineData[timelineData.length - 1]];
    }

    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 1);

    let month = timelineData.filter((d) => d.date >= monthStart.getTime());

    if (month.length === 0 && timelineData.length > 0) {
      month = [timelineData[timelineData.length - 1]];
    }

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    let week = timelineData.filter((d) => d.date >= weekStart.getTime());

    if (week.length === 0 && timelineData.length > 0) {
      week = [timelineData[timelineData.length - 1]];
    }

    const day = week;

    return { day, week, month, ytd, all };
  }, [
    portfolios,
    activePortfolioId,
    historicalData,
    historicalRates,
    quotes,
    rates,
  ]);

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
  const [formCurrency, setFormCurrency] = useState<string | null>(null);

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

  useEffect(() => {
    if (ticker.trim().length >= 2) {
      const existingQuote = quotes[ticker.toUpperCase()];

      if (existingQuote) {
        setFormCurrency(existingQuote.currency);
      } else {
        const fetchQuote = async () => {
          try {
            const res = await fetch(
              `/api/yahoo/quote?symbols=${ticker.toUpperCase()}`,
            );

            const data = await res.json();

            if (data.quotes && data.quotes[ticker.toUpperCase()]) {
              setFormCurrency(data.quotes[ticker.toUpperCase()].currency);
            } else {
              setFormCurrency(null);
            }
          } catch (e) {
            setFormCurrency(null);
          }
        };

        fetchQuote();
      }
    } else {
      setFormCurrency(null);
    }
  }, [ticker, quotes]);

  const { openHoldings, closedHoldings } = useMemo(
    () => buildHoldings(transactions, quotes, rates),
    [transactions, quotes, rates],
  );

  const portfolioValue = openHoldings.reduce(
    (total, holding) => total + holding.currentValue,
    0,
  );

  const amountInvested = openHoldings.reduce(
    (total, holding) => total + holding.costBasisEur,
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

  const dayGainPercent =
    amountInvested > 0 ? (dayGainEuro / amountInvested) * 100 : 0;

  const allTimeGainPercent =
    amountInvested > 0 ? (allTimeGain / amountInvested) * 100 : 0;

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
              </div>
            )}

            <p className="mt-4 text-slate-300">
              Track your stocks, ETFs, and derivatives in one place.
              {isFetchingPrices && (
                <span className="ml-3 text-emerald-500 text-sm animate-pulse">
                  Fetching live prices...
                </span>
              )}
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

            <p className="mt-2 text-3xl font-bold">
              {formatEuro(dayGainEuro)}{" "}
              <span className={`text-lg ${getGainColor(dayGainPercent)}`}>
                ({formatPercent(dayGainPercent)})
              </span>
            </p>

            <p className="mt-1 text-sm text-slate-400">Open holdings only</p>
          </div>

          <div className="rounded-2xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400">All-Time Gain</p>

            <p className="mt-2 text-3xl font-bold">
              {formatEuro(allTimeGain)}{" "}
              <span className={`text-lg ${getGainColor(allTimeGainPercent)}`}>
                ({formatPercent(allTimeGainPercent)})
              </span>
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Open + closed holdings
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                Gain Chart
                {isFetchingHistorical && (
                  <span className="text-sm font-normal text-emerald-500 animate-pulse">
                    Loading historical data...
                  </span>
                )}
              </h2>

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
                <LineChart data={dynamicChartData[timeFrame]}>
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
                <label className="text-sm text-slate-400">
                  Price {formCurrency ? `(${formCurrency})` : ""}
                </label>
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
                <label className="text-sm text-slate-400">
                  Commission {formCurrency ? `(${formCurrency})` : ""}
                </label>
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
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Current Price</th>
                  <th className="pb-3">Day Gain</th>
                  <th className="pb-3">Total Gain</th>

                  {openEditMode && <th className="pb-3">Actions</th>}

                  {openViewMode === "extended" && (
                    <>
                      <th className="pb-3">Quantity</th>
                      <th className="pb-3">Average Price</th>
                      <th className="pb-3">Acquisition Date</th>
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
                    <td className="py-4">{holding.type}</td>
                    <td className="py-4">
                      {formatCurrency(holding.currentPrice, holding.currency)}
                    </td>
                    <td className="py-4">
                      {formatEuro(holding.dayGainEuro)}{" "}
                      <span className={getGainColor(holding.dayGainPercent)}>
                        ({formatPercent(holding.dayGainPercent)})
                      </span>
                    </td>
                    <td className="py-4">
                      {formatEuro(holding.totalGainEuro)}{" "}
                      <span className={getGainColor(holding.totalGainPercent)}>
                        ({formatPercent(holding.totalGainPercent)})
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
                        <td className="py-4">{holding.quantity}</td>
                        <td className="py-4">
                          {formatCurrency(
                            holding.averagePrice,
                            holding.currency,
                          )}
                        </td>
                        <td className="py-4">{holding.acquisitionDate}</td>
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
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Sell Price</th>
                  <th className="pb-3">Realized Gain</th>

                  {closedEditMode && <th className="pb-3">Actions</th>}

                  {closedViewMode === "extended" && (
                    <>
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
                    <td className="py-4">{holding.type}</td>
                    <td className="py-4">
                      {formatCurrency(holding.sellPrice, holding.currency)}
                    </td>
                    <td className="py-4">
                      {formatEuro(holding.realizedGainEuro)}{" "}
                      <span
                        className={getGainColor(holding.realizedGainPercent)}
                      >
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
                        <td className="py-4">{holding.quantity}</td>
                        <td className="py-4">
                          {formatCurrency(
                            holding.averagePrice,
                            holding.currency,
                          )}
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
