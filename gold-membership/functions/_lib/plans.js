// One shared source of truth for the standalone Gold Signal Room membership terms.
export const GOLD_PLANS=Object.freeze({
 weekly:Object.freeze({id:'weekly',label:'Weekly',days:7,priceCents:499,regularCents:1249}),
 monthly:Object.freeze({id:'monthly',label:'Monthly',days:30,priceCents:2500,regularCents:4000}),
 yearly:Object.freeze({id:'yearly',label:'Yearly',days:365,priceCents:20000,regularCents:32000})
});
export const planOf=(id)=>typeof id==='string'&&Object.hasOwn(GOLD_PLANS,id)?GOLD_PLANS[id]:null;
export const planDays=(id)=>planOf(id)?.days??null;
export const money=cents=>'$'+(cents/100).toFixed(2);

// Weekly remains defined for previously issued requests and invoices, not new sales.
export const SALE_PLANS=Object.freeze(['monthly','yearly']);
export const salePlanOf=id=>SALE_PLANS.includes(id)?planOf(id):null;
