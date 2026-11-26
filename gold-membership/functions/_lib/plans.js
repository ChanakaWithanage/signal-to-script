// One shared source of truth for the standalone Gold Signal Room membership terms.
export const GOLD_PLANS=Object.freeze({
 weekly:Object.freeze({id:'weekly',label:'Weekly',days:7,priceCents:499,regularCents:1249}),
 monthly:Object.freeze({id:'monthly',label:'Monthly',days:30,priceCents:1499,regularCents:3749}),
 yearly:Object.freeze({id:'yearly',label:'Yearly',days:365,priceCents:8999,regularCents:22499})
});
export const planOf=(id)=>typeof id==='string'?GOLD_PLANS[id]||null:null;
export const planDays=(id)=>planOf(id)?.days??null;
export const money=cents=>'$'+(cents/100).toFixed(2);
