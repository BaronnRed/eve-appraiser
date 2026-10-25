// Builds public/data/{sde,prices}.json: Jita 4-4 order ladders, CCP prices, type names, manufacturing blueprints.
import{execSync}from'node:child_process';import{mkdirSync,writeFileSync,readFileSync}from'node:fs';
const ESI='https://esi.evetech.net/latest',JITA=60003760,LEVELS=60;

execSync('curl -fsSL https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip -o sde.zip && unzip -qo sde.zip -d sde');
const dir=execSync('dirname "$(find sde -name types.jsonl | head -1)"').toString().trim();
const jsonl=f=>readFileSync(`${dir}/${f}.jsonl`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));

const n={};for(const t of jsonl('types'))if(t.published&&t.name?.en)n[t._key]=t.name.en;
const bp={};
for(const b of jsonl('blueprints')){const m=b.activities?.manufacturing,p=m?.products?.[0];if(p)bp[b._key]=[p.typeID,p.quantity,(m.materials??[]).map(x=>[x.typeID,x.quantity])]}

const url=p=>`${ESI}/markets/10000002/orders/?order_type=all&page=${p}`,first=await fetch(url(1)),pages=+first.headers.get('x-pages'),orders=[];
const page=async p=>{const r=p==1?first:await fetch(url(p));orders.push(...(await r.json()).filter(o=>o.location_id==JITA))};
const todo=Array.from({length:pages},(_,i)=>i+1);
await Promise.all(Array.from({length:10},async()=>{for(let p;p=todo.pop();)await page(p)}));

const o={};
for(const x of orders){const e=o[x.type_id]??={b:{},s:{}},s=x.is_buy_order?e.b:e.s;s[x.price]=(s[x.price]??0)+x.volume_remain}
for(const e of Object.values(o)){
  e.b=Object.entries(e.b).map(([p,v])=>[+p,v]).sort((a,b)=>b[0]-a[0]).slice(0,LEVELS);
  e.s=Object.entries(e.s).map(([p,v])=>[+p,v]).sort((a,b)=>a[0]-b[0]).slice(0,LEVELS);
}
const c={};for(const x of await(await fetch(`${ESI}/markets/prices/`)).json())if(x.adjusted_price)c[x.type_id]=x.adjusted_price;

mkdirSync('public/data',{recursive:true});
writeFileSync('public/data/sde.json',JSON.stringify({n,bp}));
writeFileSync('public/data/prices.json',JSON.stringify({t:Date.now(),o,c}));
