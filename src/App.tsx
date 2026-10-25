import{useState,useEffect}from'preact/hooks';
import{parse}from'./parser';import{load,price,econ,volume,sysIndex,type Cfg,type Data}from'./calc';

const PRESET:Record<string,[number,number]>={'NPC Station':[0,0],Raitaru:[1,3],Azbel:[1,4],Sotiyo:[1,5],'Custom Structure':[0,0]}; // [material %, cost %]
const DEF={instaSell:true,instaBuy:true,buyBroker:1,sellBroker:1,tax:3.6,facTax:10,scc:4,fw:0,costBonus:0,rigs:0,manualIdx:0,horizon:365,disc:20,share:10,fac:'Custom Structure',sys:'Yria'};
const FIELDS:[keyof typeof DEF,string][]=[['facTax','Facility Tax %'],['scc','SCC Surcharge %'],['fw','FW Bonus %'],['costBonus','Cost Bonus %'],['rigs','Rigs %'],['manualIdx','Manual System Cost Index %'],
  ['buyBroker','Buy Broker %'],['sellBroker','Sell Broker %'],['tax','Sales Tax %']];
// FUTURE: owned materials, reprocessing, character ME.

type Cell=string|number|undefined;type R={c:Cell[];cls?:string};
const dec=(1.5).toLocaleString().includes(',')?',':'.';
const raw=(x:Cell)=>typeof x=='number'?(Number.isFinite(x)?String(+x.toFixed(2)).replace('.',dec):''):x??'';

function Tbl({title,head,rows}:{title:string;head:string[];rows:R[]}){
  return<div><h3>{title} ({rows.length}) <button onClick={()=>navigator.clipboard.writeText([head,...rows.map(r=>r.c)].map(l=>l.map(raw).join('\t')).join('\n'))}>Copy for Excel</button></h3>
    <div style="overflow-x:auto"><table><tr>{head.map(h=><th>{h}</th>)}</tr>
    {rows.map(r=><tr class={r.cls}>{r.c.map(x=><td>{typeof x=='number'?x.toLocaleString(undefined,{maximumFractionDigits:2}):x}</td>)}</tr>)}</table></div></div>;
}

export function App(){
  const[text,setText]=useState(''),[d,setD]=useState<Data>(),[err,setErr]=useState(''),[autoIdx,setAuto]=useState(0),[vols,setVols]=useState<Record<number,number>>({});
  const[s,setS]=useState({...DEF,...JSON.parse(localStorage.getItem('cfg')||'{}')});
  const set=(p:Partial<typeof DEF>)=>{const n={...s,...p};setS(n);localStorage.setItem('cfg',JSON.stringify(n))};
  const cfg:Cfg={...s,structMat:PRESET[s.fac][0],sysIdx:s.manualIdx||autoIdx};
  const{rows,bad}=parse(text),bps=rows.filter(r=>r.kind!='item'),items=rows.filter(r=>r.kind=='item');

  useEffect(()=>{load().then(setD).catch(e=>setErr('Data load failed: '+e))},[]);
  useEffect(()=>{sysIndex(s.sys).then(v=>setAuto(v??0)).catch(()=>{})},[s.sys]);
  useEffect(()=>{if(!d)return;for(const r of bps){const id=d.ids.get(r.name.toLowerCase()),p=id&&d.bp[id]?.[0];if(p&&!(p in vols))volume(p).then(v=>setVols(o=>({...o,[p]:v})))}},[d,text]);

  const other=d?items.map(r=>{
    const id=d.ids.get(r.name.toLowerCase()),p=price(d,id,r.qty,true,cfg),ask=p.top*(1-cfg.tax/100);
    return{total:p.total,r:{cls:p.src=='book'?'':p.src,c:[r.name,r.cat,r.loc,r.qty,p.unit,p.top,p.top?(1-p.unit/ask)*100:0,p.total,p.unfilled,p.src,[p.note,r.dmg&&`${r.dmg}% damaged`].filter(Boolean).join('; ')]}};
  }):[];
  const bp=d?bps.map(r=>{
    const id=d.ids.get(r.name.toLowerCase()),pid=id&&d.bp[id]?.[0],e=econ(d,r,pid?vols[pid]??0:0,cfg),h=[r.name,r.kind.toUpperCase(),r.qty,r.runs,r.me,r.te];
    return{npv:e?.npv??0,r:{cls:e?.tint=='book'?'':e?.tint,c:e?[...h,e.prod,e.cost,e.job,e.rev,e.profit,e.roi,e.margin,e.vol,e.days,e.npv,e.flags]:[...h,'','','','','','','','','','','no blueprint data (valued 0)']}};
  }).sort((a,b)=>b.npv-a.npv):[];
  const sum=(a:{total?:number;npv?:number}[])=>a.reduce((t,x)=>t+(x.total??x.npv??0),0),isk=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:0});

  return<div>
    <h2>EVE Contract Appraiser</h2>
    {err&&<p class="warn">{err}</p>}{d&&<p>Prices snapshot: {new Date(d.t).toLocaleString()} (Jita 4-4)</p>}
    <textarea placeholder="Paste contract here" value={text} onInput={e=>setText(e.currentTarget.value)}/>
    <details><summary>Settings</summary>
      <label><input type="checkbox" checked={s.instaSell} onChange={e=>set({instaSell:e.currentTarget.checked})}/>Insta sell</label>
      <label><input type="checkbox" checked={s.instaBuy} onChange={e=>set({instaBuy:e.currentTarget.checked})}/>Insta buy</label><br/>
      <label>Facility <select value={s.fac} onChange={e=>set({fac:e.currentTarget.value,costBonus:PRESET[e.currentTarget.value][1]})}>{Object.keys(PRESET).map(k=><option>{k}</option>)}</select></label>
      <label>System <input value={s.sys} onChange={e=>set({sys:e.currentTarget.value})}/> {autoIdx?`index ${autoIdx.toFixed(2)}%`:''}</label><br/>
      {FIELDS.map(([k,l])=><label>{l} <input type="number" step="any" disabled={k=='scc'} value={s[k] as number} onInput={e=>set({[k]:+e.currentTarget.value})}/></label>)}
      <details><summary>Advanced (NPV)</summary>{([['horizon','Horizon (days)'],['disc','Discount %/yr'],['share','Market share %']] as const).map(([k,l])=><label>{l} <input type="number" value={s[k]} onInput={e=>set({[k]:+e.currentTarget.value})}/></label>)}</details>
    </details>
    {bad.length>0&&<p class="warn">Unparsed lines: {bad.length}{bad.map(l=><div>{l}</div>)}</p>}
    <h3>Total: {isk(sum(other)+sum(bp))} ISK (others {isk(sum(other))} + blueprint NPV {isk(sum(bp))})</h3>
    <Tbl title="Blueprints (by NPV)" head={['Name','Type','Copies','Runs','ME','TE','Product','Material cost','Job cost','Revenue','Profit','ROI %','Margin %','Daily vol','Days to sell','NPV','Flags']} rows={bp.map(x=>x.r)}/>
    <Tbl title="Everything else" head={['Name','Category','Location','Qty','Unit price','Top of book','Impact %','Total','Unfilled','Source','Note']} rows={other.map(x=>x.r)}/>
  </div>;
}
