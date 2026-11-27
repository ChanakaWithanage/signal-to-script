// Public Telegram marketing feed. Never build messages from the private model.
import {BAR_MS,DELAY_MS,releasedBars} from '../functions/_lib/access.js';
import {runGoldBreakout} from '../functions/_lib/gold-market.js';
import {goldTradeUsd} from '../functions/_lib/gold-performance.js';
import {GOLD_PLANS,money} from '../functions/_lib/plans.js';

const DAY=86400000,OFFSET=3*3600000,HOUR=3600000;
const dateAt=t=>new Date(t+OFFSET).toISOString().slice(0,10);
const dayStart=t=>Date.parse(dateAt(t)+'T00:00:00Z')-OFFSET;
const usd=n=>(n<0?'−':n>0?'+':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const price=n=>'$'+Number(n).toFixed(2);
const utc=t=>new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC';
const monthlyPrice=money(GOLD_PLANS.monthly.priceCents);
const root='https://gold.signaltoscript.com';
const tag=kind=>'utm_source=telegram&utm_medium=channel&utm_campaign=gold_room&utm_content='+encodeURIComponent(kind);
const buttons=kind=>({inline_keyboard:[
 [{text:'🔒 Join Gold VIP · '+monthlyPrice,url:root+'/?plan=monthly&'+tag(kind)+'#pricing'}],
 [{text:'View all plans',url:root+'/pricing.html?'+tag(kind)},{text:'See every trade',url:root+'/?'+tag(kind)+'#results'}]
]});
const footer='Public updates are delayed by at least 30 minutes. Gold VIP members get confirmed signals without the added delay, from '+monthlyPrice+' for 30 days.';
const modelNote='Modeled strategy P&L · $100,000 starting capital · fixed 1% risk per trade · $0.30 spread · no compounding.';
const source=feed=>feed.symbol==='GC=F'?'COMEX Gold futures (GC=F)':feed.symbol==='XAUUSD'?'Gold spot (XAUUSD)':'Gold data';
const post=(id,kind,text,due)=>({id,kind,text,due,reply_markup:buttons(kind)});

export function publicChannelConfig(env){
 const chat=String(env.PUBLIC_TELEGRAM_CHANNEL||'').trim();
 const token=String(env.PUBLIC_TELEGRAM_BOT_TOKEN||env.TELEGRAM_BOT_TOKEN||'').trim();
 // Deliberately accept only named public channels, not individual chat IDs.
 if(env.PUBLIC_TELEGRAM_ENABLED!=='true'||!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chat)||!token)return null;
 return {chat,token};
}
export function buildPublicPosts(feed,now,started){
 const bars=releasedBars(feed.bars,false,now);
 if(bars.length<56)return [];
 const model=runGoldBreakout(bars);
 const latest=bars.at(-1).time+BAR_MS;
 const posts=[];
 for(const e of model.events){
  const close=e.time+BAR_MS,due=close+DELAY_MS;
  if(due<=started||due>now||now-due>60*60000)continue;
  const action=e.type==='EXIT'?'EXIT '+e.side:e.side==='LONG'?'BUY / LONG':'SELL / SHORT';
  const trade=e.type==='EXIT'?model.trades.find(t=>t.id&&e.id==='gold-15m:'+t.id+':EXIT'):null;
  const result=trade?' \nModeled trade result: '+usd(goldTradeUsd(trade.r))+'\n'+modelNote:'';
  posts.push(post('signal:'+e.id,'signal_'+e.type.toLowerCase(),
   (e.type==='EXIT'?'🏁':e.side==='LONG'?'🟢':'🔴')+' GOLD 15M | '+action+'\n\n'+
   'Signal price: '+price(e.price)+'\n'+(e.type==='ENTRY'&&Number.isFinite(e.stop)?'Stop loss: '+price(e.stop)+'\nTake profit: EXIT will be notified (no fixed TP).\n':'')+'Confirmed: '+utc(close)+'\n'+e.reason+
   '\nInstrument: '+source(feed)+result+'\n\n'+footer,due));
 }
 const start=dayStart(now),weekday=new Date(start+OFFSET).getUTCDay(),date=dateAt(now);
 if(weekday>=1&&weekday<=5){
  const range=model.ranges.find(r=>r.day===date);
  const rangeDue=start+7*HOUR+BAR_MS+DELAY_MS;
  if(range&&latest>=range.end+BAR_MS&&rangeDue>started&&now>=rangeDue&&now-rangeDue<=90*60000){
   posts.push(post('range:'+date,'daily_range','📊 GOLD | TODAY’S BREAKOUT RANGE\n'+date+
    ' · UTC+3 session\n\nRange high: '+price(range.high)+'\nRange low: '+price(range.low)+
    '\nInstrument: '+source(feed)+'\n\nThe strategy watches the first confirmed breakout. This is a historical range update, not an entry signal.\n\n'+footer,rangeDue));
  }
  const recapDue=start+20*HOUR+BAR_MS+DELAY_MS;
  // Require the actual session-close candle and a valid range before reporting.
  if(range&&latest>=start+20*HOUR+BAR_MS&&recapDue>started&&now>=recapDue&&now-recapDue<=3*HOUR){
   const trades=model.trades.filter(t=>dateAt(t.entryTime)===date&&t.exitTime+BAR_MS<=latest);
   const entries=model.events.filter(e=>e.type==='ENTRY'&&dateAt(e.time)===date);
   const net=trades.reduce((s,t)=>s+goldTradeUsd(t.r),0);
   const detail=trades.length?'Closed trades: '+trades.length+'\nModeled net P&L: '+usd(net)+'\n'+modelNote:
    entries.length?'No completed trade in the available delayed data.':'No confirmed entry in the available session data.';
   posts.push(post('recap:'+date,'daily_recap','📋 GOLD | DAILY RECAP\n'+date+' · UTC+3 session\n\n'+detail+
    '\nInstrument: '+source(feed)+'\n\nReview the entries and exits on our dashboard.\n\n'+footer,recapDue));
  }
  const weekDue=start+21*HOUR;
  if(weekday===5&&weekDue>started&&now>=weekDue&&now-weekDue<=3*HOUR&&
     bars[0].time<=start-4*DAY&&latest>=start+20*HOUR+BAR_MS){
   const trades=model.trades.filter(t=>t.exitTime>=start-4*DAY&&t.exitTime<start+DAY);
   const wins=trades.filter(t=>t.r>0).length,losses=trades.filter(t=>t.r<0).length;
   const net=trades.reduce((s,t)=>s+goldTradeUsd(t.r),0);
   const sessions=model.ranges.filter(r=>r.end>=start-4*DAY&&r.end<start+DAY).length;
   // Don't pass off a truncated feed as a full week.
   if(sessions>=5)posts.push(post('week:'+date,'weekly_recap','📈 GOLD | WEEKLY SCORECARD\n'+dateAt(start-4*DAY)+' – '+date+
    '\n\nClosed trades: '+trades.length+'\nWins: '+wins+' · Losses: '+losses+'\nModeled net P&L: '+usd(net)+
    '\n'+modelNote+'\nInstrument: '+source(feed)+'\n\nEvery recorded win and loss counts.\n\n'+footer,weekDue));
  }
 }
 return posts.sort((a,b)=>a.due-b.due);
}
async function sendTelegram(config,payload){
 const response=await fetch('https://api.telegram.org/bot'+config.token+'/sendMessage',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({chat_id:config.chat,...payload,link_preview_options:{is_disabled:true}}),
  signal:AbortSignal.timeout(8000)
 });
 // Do not log URLs, tokens, or provider response bodies.
 if(!response.ok)throw Error('Telegram HTTP '+response.status);
 const result=await response.json();
 if(!result.ok)throw Error('Telegram rejected message');
}
export async function runPublicChannel(env,feed,now=Date.now(),sender=sendTelegram){
 const config=publicChannelConfig(env);
 if(!config)return {enabled:false,sent:0};
 const db=env.DB;
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_public_channel_state(channel TEXT PRIMARY KEY,started_ms INTEGER NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_public_channel_posts(channel TEXT NOT NULL,post_id TEXT NOT NULL,status TEXT NOT NULL,updated_ms INTEGER NOT NULL,PRIMARY KEY(channel,post_id))").run();
 await db.prepare("INSERT OR IGNORE INTO gold_public_channel_state(channel,started_ms) VALUES(?,?)").bind(config.chat,now).run();
 const state=await db.prepare("SELECT started_ms FROM gold_public_channel_state WHERE channel=?").bind(config.chat).first();
 if(!Number.isFinite(Number(state?.started_ms)))throw Error('Public channel baseline unavailable');
 const started=Number(state.started_ms);
 const posts=buildPublicPosts(feed,now,started);
 let sent=0;
 for(const p of posts){
  // Claim before the external call. An ambiguous network timeout must not
  // automatically duplicate a public message. Failed claims are inspectable in D1.
  const claim=await db.prepare("INSERT OR IGNORE INTO gold_public_channel_posts(channel,post_id,status,updated_ms) VALUES(?,?,'sending',?)").bind(config.chat,p.id,now).run();
  if(claim.meta?.changes!==1)continue;
  try{
   await sender(config,{text:p.text,reply_markup:p.reply_markup});
   await db.prepare("UPDATE gold_public_channel_posts SET status='sent',updated_ms=? WHERE channel=? AND post_id=?").bind(Date.now(),config.chat,p.id).run();
   sent++;
  }catch{
   await db.prepare("UPDATE gold_public_channel_posts SET status='failed',updated_ms=? WHERE channel=? AND post_id=?").bind(Date.now(),config.chat,p.id).run();
   console.error('Public Telegram post failed',p.id);
  }
 }
 return {enabled:true,sent};
}
