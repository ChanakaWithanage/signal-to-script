// D1 candle retention. Each bar is an actual confirmed 15-minute OHLC bar.
// Gold futures and spot gold are stored separately and are never blended.
const MAX_HISTORY_DAYS=65;
const BAR_MS=900000,DAY_MS=86400000;
let schemaPromise=null;
const safeSymbol=symbol=>symbol==='GC=F'||symbol==='XAUUSD';
async function ensureArchive(db){
 if(!schemaPromise)schemaPromise=db.prepare(`CREATE TABLE IF NOT EXISTS gold_candle_history(
  symbol TEXT NOT NULL,time_ms INTEGER NOT NULL,open REAL NOT NULL,high REAL NOT NULL,
  low REAL NOT NULL,close REAL NOT NULL,source TEXT NOT NULL,
  PRIMARY KEY(symbol,time_ms)
 )`).run().catch(error=>{schemaPromise=null;throw error});
 return schemaPromise;
}
export async function getArchivedGold(db,symbol,days=30){
 if(!db||!safeSymbol(symbol))return [];
 await ensureArchive(db);
 const cutoff=Date.now()-(days+3)*DAY_MS;
 const result=await db.prepare(`SELECT time_ms,open,high,low,close
  FROM gold_candle_history WHERE symbol=? AND time_ms>=?
  ORDER BY time_ms ASC LIMIT 6500`).bind(symbol,cutoff).all();
 return (result.results||[]).map(b=>({
  time:Number(b.time_ms),open:Number(b.open),high:Number(b.high),
  low:Number(b.low),close:Number(b.close)
 }));
}
export async function storeGoldCandles(db,feed){
 if(!db||!safeSymbol(feed?.symbol)||!Array.isArray(feed?.bars)||!feed.bars.length)return;
 await ensureArchive(db);
 // Upsert only new confirmed candles, not thousands of existing bars at each refresh.
 const last=await db.prepare('SELECT MAX(time_ms) AS latest FROM gold_candle_history WHERE symbol=?')
  .bind(feed.symbol).first();
 const newest=Number(last?.latest)||0;
 const fresh=feed.bars.filter(b=>b.time>newest&&Number.isFinite(b.time)&&b.time%BAR_MS===0);
 for(let i=0;i<fresh.length;i+=50){
  const batch=fresh.slice(i,i+50);
  const placeholders=batch.map(()=>'(?,?,?,?,?,?,?)').join(',');
  const params=batch.flatMap(b=>[feed.symbol,b.time,b.open,b.high,b.low,b.close,feed.source]);
  await db.prepare(`INSERT OR IGNORE INTO gold_candle_history
   (symbol,time_ms,open,high,low,close,source) VALUES ${placeholders}`).bind(...params).run();
 }
 // Keep storage bounded. This query runs only on actual new data.
 if(fresh.length)await db.prepare('DELETE FROM gold_candle_history WHERE time_ms<?')
  .bind(Date.now()-MAX_HISTORY_DAYS*DAY_MS).run();
}
export function mergeGoldCandles(current,archive){
 const byTime=new Map();
 for(const b of archive||[])byTime.set(b.time,b);
 for(const b of current||[])byTime.set(b.time,b);
 return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
