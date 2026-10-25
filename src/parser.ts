export type Row={name:string;qty:number;group:string;cat:string;loc:string;kind:'item'|'bpc'|'bpo';runs:number;me:number;te:number;meKnown:boolean;dmg?:number};

// Columns: name, qty, group, category, details(location | blueprint info | damage). Ships have only 4 columns.
export function parse(text:string){
  const rows=new Map<string,Row>(),bad:string[]=[];
  for(const line of text.split('\n')){
    if(!line.trim())continue;
    const c=line.split('\t').map(s=>s.trim()),qty=+(c[1]??'').replace(/,/g,'');
    if(c.length<4||!c[0]||!(qty>0)){bad.push(line);continue}
    const d=c[4]??'',bpc=d.match(/COPY - Runs: (\d+) - Material Efficiency: (\d+) - Time Efficiency: (\d+)/),
      bpo=d.match(/^ORIGINAL(?: BLUEPRINT - Material Efficiency: (\d+) - Time Efficiency: (\d+))?/),dmg=d.match(/(\d+)% damaged/);
    const r:Row={name:c[0],qty,group:c[2],cat:c[3],loc:d.replace(/\s*\d+% damaged/,'').replace(/(BLUEPRINT|ORIGINAL).*/,'').trim(),
      kind:bpc?'bpc':bpo?'bpo':'item',runs:bpc?+bpc[1]:1,me:+(bpc?.[2]??bpo?.[1]??0),te:+(bpc?.[3]??bpo?.[2]??0),
      meKnown:!!(bpc||bpo?.[1]),dmg:dmg?+dmg[1]:undefined};
    const k=[r.name,r.kind,r.runs,r.me,r.te,r.loc].join('|'),e=rows.get(k);
    e?e.qty+=qty:rows.set(k,r);
  }
  return{rows:[...rows.values()],bad};
}
