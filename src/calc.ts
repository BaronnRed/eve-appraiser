import type{Row}from'./parser';
const ESI='https://esi.evetech.net/latest';
export type Lvl=[number,number];
export type Data={t:number;o:Record<number,{b:Lvl[];s:Lvl[]}>;c:Record<number,number>;n:Record<number,string>;
  bp:Record<number,[number,number,[number,number][]]>;ids:Map<string,number>}; // bp: id -> [productId, qtyPerRun, [[materialId, qty]]]
export type Cfg={instaSell:boolean;instaBuy:boolean;buyBroker:number;sellBroker:number;tax:number;facTax:number;scc:number;fw:number;
  costBonus:number;structMat:number;rigs:number;sysIdx:number;horizon:number;disc:number;share:number}; // all percentages, horizon in days
export type Px={total:number;unit:number;top:number;unfilled:number;src:'book'|'fallback'|'none';note:string};

export async function load():Promise<Data>{
  const[s,p]=await Promise.all(['sde','prices'].map(f=>fetch(`data/${f}.json`).then(r=>r.json())));
  return{...p,n:s.n,bp:s.bp,ids:new Map(Object.entries(s.n as Record<string,string>).map(([i,x])=>[x.toLowerCase(),+i]))};
}

function walk(l:Lvl[],q:number){let f=0,cost=0;for(const[p,v]of l){const t=Math.min(v,q-f);f+=t;cost+=t*p;if(f>=q)break}return{f,cost}}

// Instant trades walk the opposite book; limit orders use the best price on the side you'd list on. Unfilled depth is valued 0.
export function price(d:Data,id:number|undefined,qty:number,sell:boolean,c:Cfg):Px{
  const insta=sell?c.instaSell:c.instaBuy,bk=id?d.o[id]:undefined,lv=bk?(sell===insta?bk.b:bk.s):undefined;
  const fee=sell?c.tax+(insta?0:c.sellBroker):insta?0:c.buyBroker,k=sell?1-fee/100:1+fee/100; // sales tax applies even to insta-sells
  if(lv?.length){
    const top=lv[0][0];
    if(!insta)return{total:top*qty*k,unit:top*k,top,unfilled:0,src:'book',note:''};
    const{f,cost}=walk(lv,qty);
    return{total:cost*k,unit:f?cost/f*k:0,top,unfilled:qty-f,src:'book',note:f<qty?'insufficient depth':''};
  }
  const cp=id&&d.c[id];
  if(cp)return{total:cp*qty*k,unit:cp*k,top:cp,unfilled:0,src:'fallback',note:'CCP adjusted price'};
  return{total:0,unit:0,top:0,unfilled:qty,src:'none',note:!id?'unknown name':/abyssal|mutated/i.test(d.n[id])?'abyssal, no market':'no market'};
}

const vols=new Map<number,number>();
export async function volume(id:number){ // avg daily units over the last 30 days, The Forge region
  if(!vols.has(id)){try{const h=(await(await fetch(`${ESI}/markets/10000002/history/?type_id=${id}`)).json()).slice(-30);
    vols.set(id,h.reduce((s:number,x:any)=>s+x.volume,0)/Math.max(h.length,1))}catch{vols.set(id,0)}}
  return vols.get(id)!;
}

export async function sysIndex(name:string){
  const j=await(await fetch(`${ESI}/universe/ids/`,{method:'POST',body:JSON.stringify([name])})).json(),id=j.systems?.[0]?.id;
  if(!id)return null;
  const s=(await(await fetch(`${ESI}/industry/systems/`)).json()).find((x:any)=>x.solar_system_id==id),
    v=s?.cost_indices.find((i:any)=>i.activity=='manufacturing')?.cost_index;
  return v==null?null:v*100;
}

export function econ(d:Data,r:Row,vol:number,c:Cfg){
  const id=d.ids.get(r.name.toLowerCase()),bp=id?d.bp[id]:undefined;
  if(!bp)return null;
  const[prod,per,mats]=bp,runs=r.kind=='bpo'?1:r.runs,copies=r.kind=='bpo'?1:r.qty,k=(1-r.me/100)*(1-c.structMat/100)*(1-c.rigs/100);
  let cost=0,eiv=0,gap=false;
  for(const[m,q]of mats){
    const p=price(d,m,Math.max(runs,Math.ceil(q*runs*k-1e-9)),false,c); // ceil once, min 1 per run
    cost+=p.total;gap||=p.unfilled>0;eiv+=q*runs*(d.c[m]??0); // EIV uses base quantities (ME-independent)
  }
  // TODO verify: job cost = EIV*index*(1-bonuses) + EIV*(facility tax + SCC)
  const job=eiv*(c.sysIdx/100*(1-c.costBonus/100)*(1-c.fw/100)+(c.facTax+c.scc)/100),units=per*runs,rev=price(d,prod,units,true,c);
  const profit=rev.total-cost-job,u=vol*c.share/100,kk=Math.log(1+c.disc/100)/365;
  // NPV: constant sales flow of u units/day; BPC stops when its copies are sold out, BPO runs for the whole horizon
  const T=r.kind=='bpo'?c.horizon:Math.min(c.horizon,units*copies/(u||1)),npv=u?Math.max(0,profit/units*u*(1-Math.exp(-kk*T))/kk):0;
  const flags=[!r.meKnown&&'ME/TE assumed 0',rev.src=='fallback'&&'fallback price',rev.src=='none'&&rev.note,!u&&rev.src!='none'&&'illiquid',gap&&'material depth'].filter(Boolean);
  return{prod:d.n[prod],cost,job,rev:rev.total,profit,roi:profit/(cost+job)*100,margin:profit/rev.total*100,vol,days:u?units*copies/u:Infinity,npv,flags:flags.join(', '),tint:rev.src};
}
