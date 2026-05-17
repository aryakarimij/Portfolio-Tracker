import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json({ error: "Missing symbols parameter" }, { status: 400 });
  }

  const symbols = Array.from(new Set(symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)));
  
  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {}, rates: {} });
  }

  const quotes: Record<string, { price: number; prevClose: number; currency: string }> = {};
  const currencies = new Set<string>();

  // 1. Fetch quotes for all symbols
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta && meta.currency && typeof meta.regularMarketPrice === 'number') {
            quotes[symbol] = {
              price: meta.regularMarketPrice,
              prevClose: meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice,
              currency: meta.currency.toUpperCase(),
            };
            currencies.add(meta.currency.toUpperCase());
          }
        }
      } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error);
      }
    })
  );

  // 2. Fetch exchange rates for non-EUR currencies
  const rates: Record<string, number> = { EUR: 1 };
  
  const conversionPromises = Array.from(currencies)
    .filter((cur) => cur !== "EUR")
    .map(async (cur) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${cur}EUR=X?interval=1d&range=1d`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number') {
            rates[cur] = meta.regularMarketPrice;
          }
        }
      } catch (error) {
        console.error(`Error fetching rate for ${cur}EUR=X:`, error);
      }
    });

  await Promise.all(conversionPromises);

  return NextResponse.json({ quotes, rates });
}
