const fs = require('fs');
let content = fs.readFileSync('app/page.tsx', 'utf8');

// 1. format functions
content = content.replace(
  /function formatEuro\(value: number\) \{\n  return `€\$\{value\.toFixed\(2\)\}`;\n\}/,
  `function formatEuro(value: number) {
  return \`€\${value.toFixed(2)}\`;
}

function formatCurrency(value: number, currency: string) {
  if (currency === "EUR") return \`€\${value.toFixed(2)}\`;
  if (currency === "USD") return \`$\${value.toFixed(2)}\`;
  if (currency === "SEK") return \`\${value.toFixed(2)} kr\`;
  if (currency === "GBP") return \`£\${value.toFixed(2)}\`;
  return \`\${value.toFixed(2)} \${currency}\`;
}`
);

// 2. buildHoldings signature
content = content.replace(
  /function buildHoldings\(\n  transactions: Transaction\[\],\n  currentPrices: Record<string, number>,\n  previousClosePrices: Record<string, number>\n\)/,
  `function buildHoldings(
  transactions: Transaction[],
  quotes: Record<string, { price: number; prevClose: number; currency: string }>,
  rates: Record<string, number>
)`
);

// 3. openHoldings logic
content = content.replace(
  /    if \(remainingQuantity > 0\) \{\n      const currentPrice = currentPrices\[ticker\] \|\| averagePrice;\n      const previousClose = previousClosePrices\[ticker\] \|\| currentPrice;\n      const currentValue = remainingQuantity \* currentPrice;\n      const costBasis = remainingQuantity \* averagePrice;\n      const previousValue = remainingQuantity \* previousClose;\n\n      openHoldings\.push\(\{\n        name: firstBuy\.name,\n        ticker,\n        type:\n          firstBuy\.assetType === "derivative"\n            \? titleCase\(firstBuy\.derivativeType \|\| "derivative"\)\n            : "Stock",\n        assetType: firstBuy\.assetType,\n        derivativeType: firstBuy\.derivativeType,\n        quantity: remainingQuantity,\n        averagePrice,\n        currentPrice,\n        previousClose,\n        acquisitionDate: firstBuy\.date,\n        currentValue,\n        dayGainEuro: currentValue - previousValue,\n        dayGainPercent:\n          previousValue > 0\n            \? \(\(currentValue - previousValue\) \/ previousValue\) \* 100\n            : 0,\n        totalGainEuro: currentValue - costBasis,\n        totalGainPercent:\n          costBasis > 0 \? \(\(currentValue - costBasis\) \/ costBasis\) \* 100 : 0,\n      \}\);/,
  `    if (remainingQuantity > 0) {
      const quote = quotes[ticker];
      const currentPrice = quote ? quote.price : averagePrice;
      const previousClose = quote ? quote.prevClose : currentPrice;
      const currency = quote ? quote.currency : "EUR";
      const rateToEur = rates[currency] || 1;

      const currentValueNative = remainingQuantity * currentPrice;
      const costBasisNative = remainingQuantity * averagePrice;
      const previousValueNative = remainingQuantity * previousClose;

      const currentValueEur = currentValueNative / rateToEur;
      const costBasisEur = costBasisNative / rateToEur;
      const previousValueEur = previousValueNative / rateToEur;

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
          costBasisEur > 0 ? ((currentValueEur - costBasisEur) / costBasisEur) * 100 : 0,
      });`
);

// 4. closedHoldings logic
content = content.replace(
  /    \} else \{\n      closedHoldings\.push\(\{\n        name: firstBuy\.name,\n        ticker,\n        type:\n          firstBuy\.assetType === "derivative"\n            \? titleCase\(firstBuy\.derivativeType \|\| "derivative"\)\n            : "Stock",\n        assetType: firstBuy\.assetType,\n        derivativeType: firstBuy\.derivativeType,\n        quantity: totalBoughtQuantity,\n        averagePrice,\n        sellPrice: lastSell\?\.price \|\| 0,\n        acquisitionDate: firstBuy\.date,\n        sellingDate: lastSell\?\.date \|\| "",\n        realizedGainEuro: totalSellValue - totalBuyCost,\n        realizedGainPercent:\n          totalBuyCost > 0\n            \? \(\(totalSellValue - totalBuyCost\) \/ totalBuyCost\) \* 100\n            : 0,\n      \}\);/,
  `    } else {
      const quote = quotes[ticker];
      const currency = quote ? quote.currency : "EUR";
      const rateToEur = rates[currency] || 1;
      
      const totalSellValueEur = totalSellValue / rateToEur;
      const totalBuyCostEur = totalBuyCost / rateToEur;

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
      });`
);

// 5. App states
content = content.replace(
  /  const \[finnhubKey, setFinnhubKey\] = useState\(""\);\n  const \[livePrices, setLivePrices\] = useState<Record<string, number>>\(\{\}\);\n  const \[livePreviousCloses, setLivePreviousCloses\] = useState<Record<string, number>>\(\{\}\);/,
  `  const [quotes, setQuotes] = useState<Record<string, { price: number; prevClose: number; currency: string }>>({});
  const [rates, setRates] = useState<Record<string, number>>({});`
);

content = content.replace(
  /  const \[historicalData, setHistoricalData\] = useState<Record<string, \{ t: number\[\]; c: number\[\] \}>\>\(\{\}\);/,
  `  const [historicalData, setHistoricalData] = useState<Record<string, { t: number[]; c: number[]; currency: string }>>({});
  const [historicalRates, setHistoricalRates] = useState<Record<string, { t: number[]; c: number[] }>>({});`
);

content = content.replace(
  /  useEffect\(\(\) => \{\n    const key = localStorage\.getItem\("finnhubKey"\);\n    \/\/ eslint-disable-next-line react-hooks\/set-state-in-effect\n    if \(key\) setFinnhubKey\(key\);\n\n    const savedPortfolios = localStorage\.getItem\("portfolios"\);\n    if \(savedPortfolios\) \{/,
  `  useEffect(() => {
    const savedPortfolios = localStorage.getItem("portfolios");
    if (savedPortfolios) {`
);

// 6. Fetch quotes effect
content = content.replace(
  /  useEffect\(\(\) => \{\n    if \(!finnhubKey\) return;\n    const fetchPrices = async \(\) => \{\n      setIsFetchingPrices\(true\);\n      const currentActivePortfolio = portfolios\.find\(p => p\.id === activePortfolioId\) \|\| portfolios\[0\];\n      const tickersToFetch = Array\.from\(new Set\(currentActivePortfolio\.transactions\.map\(t => t\.ticker\)\)\);\n      const newPrices: Record<string, number> = \{\};\n      const newPrevCloses: Record<string, number> = \{\};\n      \n      await Promise\.all\(tickersToFetch\.map\(async \(ticker\) => \{\n        try \{\n          const res = await fetch\(\`https:\/\/finnhub\.io\/api\/v1\/quote\?symbol=\$\{ticker\}&token=\$\{finnhubKey\}\`\);\n          if \(res\.ok\) \{\n            const data = await res\.json\(\);\n            if \(data && typeof data\.c === 'number' && data\.c !== 0\) \{\n              newPrices\[ticker\] = data\.c;\n              newPrevCloses\[ticker\] = data\.pc;\n            \}\n          \}\n        \} catch \(e\) \{\n          console\.error\("Failed to fetch quote for", ticker, e\);\n        \}\n      \}\)\);\n      setLivePrices\(prev => \(\{ \.\.\.prev, \.\.\.newPrices \}\)\);\n      setLivePreviousCloses\(prev => \(\{ \.\.\.prev, \.\.\.newPrevCloses \}\)\);\n      setIsFetchingPrices\(false\);\n    \};\n    \n    fetchPrices\(\);\n    const interval = setInterval\(fetchPrices, 60000\);\n    return \(\) => clearInterval\(interval\);\n  \}, \[finnhubKey, portfolios, activePortfolioId\]\);/,
  `  useEffect(() => {
    const fetchQuotes = async () => {
      setIsFetchingPrices(true);
      const currentActivePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
      if (!currentActivePortfolio || currentActivePortfolio.transactions.length === 0) {
        setIsFetchingPrices(false);
        return;
      }
      const tickersToFetch = Array.from(new Set(currentActivePortfolio.transactions.map(t => t.ticker)));
      
      try {
        const res = await fetch(\`/api/yahoo/quote?symbols=\${tickersToFetch.join(",")}\`);
        if (res.ok) {
          const data = await res.json();
          setQuotes(prev => ({ ...prev, ...data.quotes }));
          setRates(prev => ({ ...prev, ...data.rates }));
        }
      } catch (e) {
        console.error("Failed to fetch quotes", e);
      }
      setIsFetchingPrices(false);
    };
    
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, [portfolios, activePortfolioId]);`
);

// 7. Fetch history effect
content = content.replace(
  /  useEffect\(\(\) => \{\n    if \(!finnhubKey\) return;\n    const currentActivePortfolio = portfolios\.find\(p => p\.id === activePortfolioId\) \|\| portfolios\[0\];\n    if \(!currentActivePortfolio \|\| currentActivePortfolio\.transactions\.length === 0\) return;\n\n    const earliestDateStr = currentActivePortfolio\.transactions\.reduce\(\(earliest, t\) => \{\n      return t\.date < earliest \? t\.date : earliest;\n    \}, currentActivePortfolio\.transactions\[0\]\.date\);\n\n    \/\/ Subtract 3 days to account for weekends\n    const earliestTimestamp = Math\.floor\(new Date\(earliestDateStr\)\.getTime\(\) \/ 1000\) - \(3 \* 86400\);\n    const currentTimestamp = Math\.floor\(Date\.now\(\) \/ 1000\);\n\n    const tickersToFetch = Array\.from\(new Set\(currentActivePortfolio\.transactions\.map\(t => t\.ticker\)\)\);\n    \n    const fetchHistoricalData = async \(\) => \{\n      setIsFetchingHistorical\(true\);\n      const newFetchedData: Record<string, \{ t: number\[\], c: number\[\] \}> = \{\};\n      \n      await Promise\.all\(tickersToFetch\.map\(async \(ticker\) => \{\n        try \{\n          const res = await fetch\(\`https:\/\/finnhub\.io\/api\/v1\/stock\/candle\?symbol=\$\{ticker\}&resolution=D&from=\$\{earliestTimestamp\}&to=\$\{currentTimestamp\}&token=\$\{finnhubKey\}\`\);\n          if \(res\.ok\) \{\n            const data = await res\.json\(\);\n            if \(data\.s === "ok"\) \{\n              newFetchedData\[ticker\] = \{ t: data\.t, c: data\.c \};\n            \}\n          \}\n        \} catch \(e\) \{\n          console\.error\("Failed to fetch historical data for", ticker, e\);\n        \}\n      \}\)\);\n\n      if \(Object\.keys\(newFetchedData\)\.length > 0\) \{\n        setHistoricalData\(prev => \(\{ \.\.\.prev, \.\.\.newFetchedData \}\)\);\n      \}\n      setIsFetchingHistorical\(false\);\n    \};\n\n    fetchHistoricalData\(\);\n  \}, \[finnhubKey, portfolios, activePortfolioId\]\);/,
  `  useEffect(() => {
    const currentActivePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
    if (!currentActivePortfolio || currentActivePortfolio.transactions.length === 0) return;

    const earliestDateStr = currentActivePortfolio.transactions.reduce((earliest, t) => {
      return t.date < earliest ? t.date : earliest;
    }, currentActivePortfolio.transactions[0].date);

    const earliestTimestamp = Math.floor(new Date(earliestDateStr).getTime() / 1000) - (3 * 86400);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const tickersToFetch = Array.from(new Set(currentActivePortfolio.transactions.map(t => t.ticker)));
    
    const fetchHistoricalData = async () => {
      setIsFetchingHistorical(true);
      try {
        const res = await fetch(\`/api/yahoo/history?symbols=\${tickersToFetch.join(",")}&from=\${earliestTimestamp}&to=\${currentTimestamp}\`);
        if (res.ok) {
          const data = await res.json();
          setHistoricalData(prev => ({ ...prev, ...data.history }));
          setHistoricalRates(prev => ({ ...prev, ...data.ratesHistory }));
        }
      } catch (e) {
        console.error("Failed to fetch historical data", e);
      }
      setIsFetchingHistorical(false);
    };

    fetchHistoricalData();
  }, [portfolios, activePortfolioId]);`
);

// 8. dynamicChartData
content = content.replace(
  /    const getPrice = \(ticker: string, ts: number\) => \{\n      const hData = historicalData\[ticker\];\n      if \(!hData \|\| \!hData\.t \|\| hData\.t\.length === 0\) return livePrices\[ticker\] \|\| 0;\n      const targetS = Math\.floor\(ts \/ 1000\);\n      let closestPrice = hData\.c\[0\];\n      for \(let i = 0; i < hData\.t\.length; i\+\+\) \{\n        if \(hData\.t\[i\] <= targetS \+ 86400\) \{\n          closestPrice = hData\.c\[i\];\n        \} else \{\n          break;\n        \}\n      \}\n      return closestPrice;\n    \};\n    \n    dailyTimestamps\.forEach\(ts => \{\n      const dateStr = new Date\(ts\)\.toISOString\(\)\.split\('T'\)\[0\];\n      const txsToday = sortedTx\.filter\(t => t\.date === dateStr\);\n      \n      txsToday\.forEach\(tx => \{\n        if \(\!currentHoldings\[tx\.ticker\]\) currentHoldings\[tx\.ticker\] = \{ qty: 0, invested: 0 \};\n        if \(tx\.action === 'buy'\) \{\n          currentHoldings\[tx\.ticker\]\.qty \+= tx\.quantity;\n          currentHoldings\[tx\.ticker\]\.invested \+= \(tx\.quantity \* tx\.price\) \+ tx\.commission;\n        \} else if \(tx\.action === 'sell'\) \{\n          if \(currentHoldings\[tx\.ticker\]\.qty > 0\) \{\n            const avgCost = currentHoldings\[tx\.ticker\]\.invested \/ currentHoldings\[tx\.ticker\]\.qty;\n            currentHoldings\[tx\.ticker\]\.invested -= tx\.quantity \* avgCost;\n            currentHoldings\[tx\.ticker\]\.qty -= tx\.quantity;\n          \}\n        \}\n      \}\);\n      \n      let totalValue = 0;\n      let totalInvested = 0;\n      for \(const \[ticker, holding\] of Object\.entries\(currentHoldings\)\) \{\n        if \(holding\.qty > 0\) \{\n          const price = getPrice\(ticker, ts\);\n          totalValue \+= holding\.qty \* price;\n          totalInvested \+= holding\.invested;\n        \}\n      \}\n      \n      const gain = totalValue - totalInvested;\n      timelineData\.push\(\{\n        date: ts,\n        label: new Date\(ts\)\.toLocaleDateString\(undefined, \{ month: 'short', day: 'numeric', year: 'numeric' \}\),\n        gain: Math\.round\(gain \* 100\) \/ 100,\n      \}\);\n    \}\);/,
  `    const getHistoricalValue = (ticker: string, ts: number) => {
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
    
    dailyTimestamps.forEach(ts => {
      const dateStr = new Date(ts).toISOString().split('T')[0];
      const txsToday = sortedTx.filter(t => t.date === dateStr);
      
      txsToday.forEach(tx => {
        if (!currentHoldings[tx.ticker]) currentHoldings[tx.ticker] = { qty: 0, investedEur: 0 };
        const quote = quotes[tx.ticker];
        const currency = quote ? quote.currency : "EUR";
        const rateToEur = rates[currency] || 1;
        
        if (tx.action === 'buy') {
          currentHoldings[tx.ticker].qty += tx.quantity;
          const investedNative = (tx.quantity * tx.price) + tx.commission;
          currentHoldings[tx.ticker].investedEur += investedNative / rateToEur;
        } else if (tx.action === 'sell') {
          if (currentHoldings[tx.ticker].qty > 0) {
            const avgCostEur = currentHoldings[tx.ticker].investedEur / currentHoldings[tx.ticker].qty;
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
          totalValueEur += (holding.qty * priceNative) / rateToEur;
          totalInvestedEur += holding.investedEur;
        }
      }
      
      const gain = totalValueEur - totalInvestedEur;
      timelineData.push({
        date: ts,
        label: new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        gain: Math.round(gain * 100) / 100,
      });
    });`
);

// fix dependencies for dynamicChartData useMemo
content = content.replace(
  /  \}, \[portfolios, activePortfolioId, historicalData, livePrices\]\);/,
  `  }, [portfolios, activePortfolioId, historicalData, historicalRates, quotes, rates]);`
);

content = content.replace(
  /  const \{ openHoldings, closedHoldings \} = useMemo\(\n    \(\) => buildHoldings\(transactions, livePrices, livePreviousCloses\),\n    \[transactions, livePrices, livePreviousCloses\],\n  \);/,
  `  const { openHoldings, closedHoldings } = useMemo(
    () => buildHoldings(transactions, quotes, rates),
    [transactions, quotes, rates],
  );`
);

// Finnhub UI removal
content = content.replace(
  /                <button\n                  onClick=\{\(\) => setShowSettings\(!showSettings\)\}\n                  className=\{\`rounded-lg px-4 py-2 text-sm font-bold \$\{\n                    showSettings \? "bg-white text-slate-950" : "bg-slate-800 text-slate-300"\n                  \}\`\}\n                >\n                  ⚙️ API Key\n                <\/button>/,
  ``
);

content = content.replace(
  /            \{showSettings && \(\n              <div className="mt-4 rounded-xl bg-slate-900 p-4 max-w-md border border-slate-800">\n                <label className="text-sm font-bold text-slate-300">Finnhub API Key \(Live Prices\)<\/label>\n                <div className="mt-2 flex gap-2">\n                  <input\n                    type="password"\n                    value=\{finnhubKey\}\n                    onChange=\{\(e\) => \{\n                      setFinnhubKey\(e\.target\.value\);\n                      localStorage\.setItem\("finnhubKey", e\.target\.value\);\n                    \}\}\n                    placeholder="Enter API Key"\n                    className="flex-1 rounded-lg bg-slate-800 p-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"\n                  \/>\n                <\/div>\n                <p className="mt-2 text-xs text-slate-500">\n                  Get a free key at <a href="https:\/\/finnhub\.io" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">finnhub\.io<\/a>\. Key is saved locally\.\n                <\/p>\n              <\/div>\n            \)\}/,
  ``
);

// Add Transaction Form - Check currency
content = content.replace(
  /  const \[closedEditMode, setClosedEditMode\] = useState\(false\);\n  const \[editingTicker, setEditingTicker\] = useState<string \| null>\(null\);/,
  `  const [closedEditMode, setClosedEditMode] = useState(false);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [formCurrency, setFormCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (ticker.trim().length >= 2) {
      const existingQuote = quotes[ticker.toUpperCase()];
      if (existingQuote) {
        setFormCurrency(existingQuote.currency);
      } else {
        const fetchQuote = async () => {
          try {
            const res = await fetch(\`/api/yahoo/quote?symbols=\${ticker.toUpperCase()}\`);
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
  }, [ticker, quotes]);`
);

content = content.replace(
  /                <label className="text-sm text-slate-400">Price<\/label>\n                <input/,
  `                <label className="text-sm text-slate-400">Price {formCurrency ? \`(\${formCurrency})\` : ""}</label>
                <input`
);

content = content.replace(
  /                <label className="text-sm text-slate-400">Commission<\/label>\n                <input/,
  `                <label className="text-sm text-slate-400">Commission {formCurrency ? \`(\${formCurrency})\` : ""}</label>
                <input`
);

// Formatting table updates
content = content.replace(
  /                    <td className="py-4">\{formatEuro\(holding\.currentPrice\)\}<\/td>/,
  `                    <td className="py-4">{formatCurrency(holding.currentPrice, holding.currency)}</td>`
);

content = content.replace(
  /                        <td className="py-4">\n                          \{formatEuro\(holding\.averagePrice\)\}\n                        <\/td>/,
  `                        <td className="py-4">
                          {formatCurrency(holding.averagePrice, holding.currency)}
                        </td>`
);

content = content.replace(
  /                    <td className="py-4">\{formatEuro\(holding\.sellPrice\)\}<\/td>/,
  `                    <td className="py-4">{formatCurrency(holding.sellPrice, holding.currency)}</td>`
);

content = content.replace(
  /                        <td className="py-4">\n                          \{formatEuro\(holding\.averagePrice\)\}\n                        <\/td>/,
  `                        <td className="py-4">
                          {formatCurrency(holding.averagePrice, holding.currency)}
                        </td>`
);

fs.writeFileSync('app/page.tsx', content);
console.log("Updated page.tsx!");
