// Builds public/data/{sde,prices}.json: Jita 4-4 order ladders, CCP prices, type names, manufacturing blueprints. Needs curl + bzcat.
import{execSync}from'node:child_process';import{mkdirSync,writeFileSync}from'node:fs';
const ESI='https://esi.evetech.net/latest',JITA=60003760,LEVELS=60;
const csv=f=>{const t=execSync(`curl -sL https://www.fuzzwork.co.uk/dump/latest/${f}.csv.bz2 | bzcat`,{maxBuffer:1<<30}).toString(),rows=[];let r=[],c='',q=false;
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch=='"'){if(t[i+1]=='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch=='"')q=true;else if(ch==','){r.push(c);c=''}else if(ch=='\n'){r.push(c);rows.push(r);r=[];c=''}else if(ch!='\r')c+=ch}
  return rows.slice(1)};

const n={};for(const r of csv('invTypes'))if(r[10]=='1')n[r[0]]=r[2];
const bp={};
for(const[t,a,p,q]of csv('industryActivityProducts'))if(a=='1')bp[t]=[+p,+q,[]];
for(const[t,a,m,q]of csv('industryActivityMaterials'))if(a=='1'&&bp[t])bp[t][2].push([+m,+q]);

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
