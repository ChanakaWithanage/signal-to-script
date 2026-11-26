// Illustrative cash-equivalent results from the strategy's historical R values.
// Fixed one-percent risk of a $100,000 starting balance per completed trade.
// R results already reflect the strategy engine's round-trip spread assumption.
// No compounding, leverage, reinvestment or invented market performance.
export const EXAMPLE_CAPITAL_USD=100000;
export const EXAMPLE_RISK_PERCENT=1;
export function illustrativeGoldResults(stats,capital=EXAMPLE_CAPITAL_USD,riskPercent=EXAMPLE_RISK_PERCENT){
 const riskUsd=capital*riskPercent/100;
 const netR=Number(stats?.netR),drawdownR=Number(stats?.maxDrawdownR);
 if(!stats||!Number.isFinite(netR)||!Number.isFinite(drawdownR)||
    !Number.isFinite(capital)||capital<=0||!Number.isFinite(riskPercent)||riskPercent<=0)
  return null;
 return {
  capitalUsd:capital,riskPercent,riskUsd,
  netUsd:Math.round(netR*riskUsd*100)/100,
  returnPercent:Math.round(netR*riskPercent*100)/100,
  maxDrawdownUsd:Math.round(drawdownR*riskUsd*100)/100,
  method:'fixed risk per trade; no compounding'
 };
}

// A trade's displayed USD result uses the same fixed dollar risk as the summary.
export function goldTradeUsd(tradeR,riskUsd=EXAMPLE_CAPITAL_USD*EXAMPLE_RISK_PERCENT/100){
 if(!Number.isFinite(tradeR)||!Number.isFinite(riskUsd)||riskUsd<=0)return null;
 return Math.round(tradeR*riskUsd*100)/100;
}
