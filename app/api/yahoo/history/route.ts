import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!symbolsParam || !fromParam || !toParam) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const symbols = Array.from(new Set(symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)));
  
  if (symbols.length === 0) {
    return NextResponse.json({ history: {}, ratesHistory: {} });
  }

  const history: Record<string, { t: number[]; c: number[]; currency: string }> = {};
  const currencies = new Set<string>();

  // 1. Fetch historical data for all symbols
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${fromParam}&period2=${toParam}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const result = data?.chart?.result?.[0];
          if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
            const currency = result.meta?.currency?.toUpperCase() || "USD";
            currencies.add(currency);
            
            history[symbol] = {
              t: result.timestamp,
              c: result.indicators.quote[0].close,
              currency,
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error);
      }
    })
  );

  // 2. Fetch historical exchange rates for non-EUR currencies
  const ratesHistory: Record<string, { t: number[]; c: number[] }> = {};
  
  const conversionPromises = Array.from(currencies)
    .filter((cur) => cur !== "EUR")
    .map(async (cur) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${cur}EUR=X?interval=1d&period1=${fromParam}&period2=${toParam}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const result = data?.chart?.result?.[0];
          if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
            ratesHistory[cur] = {
              t: result.timestamp,
              c: result.indicators.quote[0].close,
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching history for ${cur}EUR=X:`, error);
      }
    });

  await Promise.all(conversionPromises);

  return NextResponse.json({ history, ratesHistory });
}
