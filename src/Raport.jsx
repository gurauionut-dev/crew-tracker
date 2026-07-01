import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmtEUR(n) { return Number(n||0).toFixed(2); }
function fmtNum(n) { return Number(n||0).toFixed(1); }

function getYear(deviz)  {
  const d = deviz.dateStart||deviz.updatedAt?.seconds?new Date(deviz.updatedAt.seconds*1000).toISOString().slice(0,10):"";
  return d ? parseInt(d.slice(0,4)) : null;
}
function getMonth(deviz) {
  const d = deviz.dateStart||"";
  return d ? parseInt(d.slice(5,7)) : null;
}

function calcZile(s,e) {
  if (!s) return 1;
  const start=new Date(s), end=e?new Date(e):start;
  return Math.max(1, Math.round((end-start)/86400000)+1);
}
function getMultiplier(n) {
  if (n<=1) return 1.0;
  if (n===2) return 1.5;
  if (n===3) return 2.0;
  if (n>=7) return 3.5;
  return 2.0+(n-3)*(3.5-2.0)/4;
}

const LUNI = ["Ian","Feb","Mar","Apr","Mai","Iun","Iul","Aug","Sep","Oct","Nov","Dec"];
const LUNI_FULL = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function RaportBusiness() {
  const [devize, setDevize] = useState([]);
  const [tab,    setTab]    = useState("echip"); // echip | manop | overview
  const [period, setPeriod] = useState("lunar");  // lunar | anual
  const [year,   setYear]   = useState(new Date().getFullYear());
  const [month,  setMonth]  = useState(new Date().getMonth()+1);

  useEffect(()=>{
    return onSnapshot(collection(db,"devize"), snap=>{
      const list=[];
      snap.forEach(d=>{ if(d.data().status==="approved"||d.data().status==="sent") list.push({id:d.id,...d.data()}); });
      setDevize(list);
    });
  },[]);

  // Filter devize by period
  const filtered = devize.filter(d=>{
    const y=getYear(d), m=getMonth(d);
    if (!y) return false;
    if (period==="anual") return y===year;
    return y===year && m===month;
  });

  // Available years from data
  const years = [...new Set(devize.map(d=>getYear(d)).filter(Boolean))].sort((a,b)=>b-a);
  if (!years.includes(year) && years.length>0) setYear(years[0]);

  // ── EQUIPMENT STATS ───────────────────────────────────────────────────────
  const echipStats = {};
  filtered.forEach(d=>{
    const nrZ=calcZile(d.dateStart,d.dateEnd);
    const mult=getMultiplier(nrZ);
    const discE=parseFloat(d.discountEchip||0)/100;
    ;(d.echipamente||[]).filter(r=>r.denumire).forEach(r=>{
      const key=r.denumire;
      const cant=parseFloat(r.cantitate||1);
      const pret=parseFloat(r.pret||r.pretBaza||0);
      const unitate=r.unitate||"item";
      const revenue=pret*cant*nrZ*mult*(1-discE);
      if (!echipStats[key]) echipStats[key]={denumire:key,unitate,totalCant:0,totalRevenue:0,nrDevize:0,zileTotale:0};
      echipStats[key].totalCant  += cant*nrZ*mult; // mp × zile × mult
      echipStats[key].totalRevenue += revenue;
      echipStats[key].nrDevize   += 1;
      echipStats[key].zileTotale += nrZ;
    });
  });
  const echipList = Object.values(echipStats).sort((a,b)=>b.totalRevenue-a.totalRevenue);
  const totalRevenueEchip = echipList.reduce((s,e)=>s+e.totalRevenue,0);

  // ── MANOPERA STATS ────────────────────────────────────────────────────────
  const manopStats = {};
  filtered.forEach(d=>{
    const nrZ=calcZile(d.dateStart,d.dateEnd);
    const discM=parseFloat(d.discountManop||0)/100;
    ;(d.manopera||[]).filter(r=>r.specialitate).forEach(r=>{
      const key=r.specialitate;
      const pers=parseFloat(r.persoane||1);
      const pret=parseFloat(r.pret||0);
      const revenue=pret*pers*nrZ*(1-discM);
      if (!manopStats[key]) manopStats[key]={specialitate:key,totalPersZile:0,totalRevenue:0,nrDevize:0};
      manopStats[key].totalPersZile += pers*nrZ;
      manopStats[key].totalRevenue  += revenue;
      manopStats[key].nrDevize      += 1;
    });
  });
  const manopList = Object.values(manopStats).sort((a,b)=>b.totalRevenue-a.totalRevenue);
  const totalRevenueManop = manopList.reduce((s,m)=>s+m.totalRevenue,0);

  // ── TRANSPORT STATS ───────────────────────────────────────────────────────
  const totalTransport = filtered.reduce((s,d)=>{
    return s+(d.transport||[]).reduce((ss,r)=>ss+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
  },0);

  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  const totalGeneral = filtered.reduce((d,dev)=>{
    const nrZ=calcZile(dev.dateStart,dev.dateEnd);
    const mult=getMultiplier(nrZ);
    const dE=parseFloat(dev.discountEchip||0)/100;
    const dM=parseFloat(dev.discountManop||0)/100;
    const tE=(dev.echipamente||[]).filter(r=>r.denumire).reduce((s,r)=>s+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*nrZ*mult*(1-dE)),0);
    const tM=(dev.manopera||[]).filter(r=>r.specialitate).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZ*(1-dM)),0);
    const tT=(dev.transport||[]).filter(r=>r.vehicul).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
    return d+(tE+tM+tT)*1.21;
  },0);

  // Monthly breakdown for chart (annual view)
  const monthlyData = LUNI.map((_,i)=>{
    const m=i+1;
    const monthDevize=devize.filter(d=>getYear(d)===year&&getMonth(d)===m);
    const rev=monthDevize.reduce((s,d)=>{
      const nrZ=calcZile(d.dateStart,d.dateEnd);
      const mult=getMultiplier(nrZ);
      const dE=parseFloat(d.discountEchip||0)/100;
      const dM=parseFloat(d.discountManop||0)/100;
      const tE=(d.echipamente||[]).filter(r=>r.denumire).reduce((ss,r)=>ss+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*nrZ*mult*(1-dE)),0);
      const tM=(d.manopera||[]).filter(r=>r.specialitate).reduce((ss,r)=>ss+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZ*(1-dM)),0);
      const tT=(d.transport||[]).filter(r=>r.vehicul).reduce((ss,r)=>ss+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
      return s+(tE+tM+tT);
    },0);
    return { luna:LUNI[i], rev, nrDevize:monthDevize.length };
  });
  const maxRev = Math.max(...monthlyData.map(m=>m.rev), 1);

  const periodLabel = period==="anual" ? `${year}` : `${LUNI_FULL[month-1]} ${year}`;

  // ── STYLES ────────────────────────────────────────────────────────────────
  const S={
    sec:  {background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:16,marginBottom:14},
    secT: {fontSize:12,fontWeight:700,color:"#7eb8f7",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.05em"},
    card: {background:"#111",border:"1px solid #222",borderRadius:12,padding:"12px 14px",marginBottom:8},
  };

  return (
    <div style={{padding:"16px 16px 0",fontFamily:"'DM Sans',sans-serif"}}>

      {/* Period selector */}
      <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:4,background:"#1a1a1a",borderRadius:10,padding:3,border:"1px solid #2a2a2a"}}>
          {["lunar","anual"].map(p=>(
            <button key={p} onClick={()=>setPeriod(p)}
              style={{padding:"6px 14px",borderRadius:8,border:"none",background:period===p?"#2a2a2a":"transparent",color:period===p?"#e8e8e6":"#555",fontSize:12,fontWeight:period===p?600:400,cursor:"pointer",textTransform:"capitalize"}}>
              {p==="lunar"?"📅 Lunar":"📆 Anual"}
            </button>
          ))}
        </div>

        {/* Year selector */}
        <select value={year} onChange={e=>setYear(parseInt(e.target.value))}
          style={{padding:"7px 10px",borderRadius:9,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:12,cursor:"pointer"}}>
          {(years.length>0?years:[new Date().getFullYear()]).map(y=><option key={y} value={y}>{y}</option>)}
        </select>

        {/* Month selector — only for lunar */}
        {period==="lunar"&&(
          <select value={month} onChange={e=>setMonth(parseInt(e.target.value))}
            style={{padding:"7px 10px",borderRadius:9,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:12,cursor:"pointer"}}>
            {LUNI_FULL.map((l,i)=><option key={i+1} value={i+1}>{l}</option>)}
          </select>
        )}

        <div style={{marginLeft:"auto",fontSize:12,color:"#555"}}>{filtered.length} devize în {periodLabel}</div>
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[
          {label:"Echipamente",val:totalRevenueEchip,icon:"🖥️",color:"#7eb8f7"},
          {label:"Manoperă",val:totalRevenueManop,icon:"👷",color:"#4ade80"},
          {label:"Transport",val:totalTransport,icon:"🚚",color:"#f59e0b"},
        ].map(({label,val,icon,color})=>(
          <div key={label} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 12px"}}>
            <div style={{fontSize:20,marginBottom:6}}>{icon}</div>
            <div style={{fontSize:11,color:"#555",marginBottom:4}}>{label}</div>
            <div style={{fontSize:16,fontWeight:700,color}}>{fmtEUR(val)} EUR</div>
          </div>
        ))}
      </div>

      {/* Total general */}
      <div style={{...S.sec,background:"#1a2e1a",border:"1px solid #2d5a2d",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,color:"#4ade80",fontWeight:600}}>TOTAL GENERAL (cu TVA)</div>
            <div style={{fontSize:11,color:"#2d5a2d",marginTop:2}}>{periodLabel}</div>
          </div>
          <div style={{fontSize:28,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totalGeneral)} EUR</div>
        </div>
      </div>

      {/* Annual bar chart */}
      {period==="anual"&&(
        <div style={S.sec}>
          <div style={S.secT}>📊 Venituri lunare {year}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:120,marginBottom:8}}>
            {monthlyData.map(({luna,rev,nrDevize})=>{
              const h=Math.max(4, (rev/maxRev)*100);
              const isSelected=false;
              return (
                <div key={luna} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{fontSize:9,color:"#4ade80",fontWeight:600,height:14,display:"flex",alignItems:"center"}}>
                    {rev>0?`${Math.round(rev/1000)}k`:""}
                  </div>
                  <div style={{width:"100%",height:`${h}%`,background:rev>0?"#4ade80":"#222",borderRadius:"3px 3px 0 0",minHeight:4,position:"relative"}}>
                    {nrDevize>0&&<div style={{position:"absolute",top:-16,left:"50%",transform:"translateX(-50%)",fontSize:8,color:"#555",whiteSpace:"nowrap"}}>{nrDevize}d</div>}
                  </div>
                  <div style={{fontSize:9,color:"#555"}}>{luna}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div style={{display:"flex",gap:4,background:"#1a1a1a",borderRadius:10,padding:3,border:"1px solid #2a2a2a",marginBottom:16}}>
        {[{id:"echip",label:"🖥️ Echipamente"},{id:"manop",label:"👷 Manoperă"},{id:"overview",label:"📋 Devize"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"7px 4px",borderRadius:8,border:"none",background:tab===t.id?"#2a2a2a":"transparent",color:tab===t.id?"#e8e8e6":"#555",fontSize:12,fontWeight:tab===t.id?600:400,cursor:"pointer"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ECHIPAMENTE TAB ─────────────────────────────────────────────── */}
      {tab==="echip"&&(
        <div>
          {echipList.length===0&&(
            <div style={{textAlign:"center",padding:"40px 0",color:"#444"}}>
              <div style={{fontSize:32,marginBottom:8}}>📭</div>
              <div style={{fontSize:14}}>Nicio dată pentru perioada selectată</div>
              <div style={{fontSize:12,color:"#555",marginTop:4}}>Doar devizele cu status Trimis sau Aprobat sunt incluse</div>
            </div>
          )}

          {echipList.map((e,i)=>{
            const pct=(e.totalRevenue/totalRevenueEchip*100)||0;
            const isMp = e.unitate==="mp";
            return (
              <div key={e.denumire} style={S.card}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:11,background:"#1e3a5f",color:"#7eb8f7",padding:"1px 7px",borderRadius:20,fontWeight:700}}>#{i+1}</span>
                      <span style={{fontSize:14,fontWeight:500,color:"#e8e8e6"}}>{e.denumire}</span>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:12,color:"#555",marginTop:2}}>
                      <span>{e.nrDevize} devize</span>
                      {isMp&&<span style={{color:"#7eb8f7",fontWeight:600}}>{fmtNum(e.totalCant)} mp·zile</span>}
                      {!isMp&&<span style={{color:"#7eb8f7",fontWeight:600}}>{fmtNum(e.totalCant)} {e.unitate}·zile</span>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#4ade80"}}>{fmtEUR(e.totalRevenue)} EUR</div>
                    <div style={{fontSize:11,color:"#555"}}>{pct.toFixed(1)}% din total</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{height:4,background:"#222",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#7eb8f7,#4ade80)",borderRadius:2}}/>
                </div>
              </div>
            );
          })}

          {echipList.length>0&&(
            <div style={{...S.sec,marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:"#888"}}>Total revenue echipamente</span>
                <span style={{fontWeight:700,color:"#7eb8f7"}}>{fmtEUR(totalRevenueEchip)} EUR</span>
              </div>
              {echipList.filter(e=>e.unitate==="mp").length>0&&(
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6}}>
                  <span style={{color:"#888"}}>Total mp·zile închiriate</span>
                  <span style={{fontWeight:700,color:"#7eb8f7"}}>
                    {fmtNum(echipList.filter(e=>e.unitate==="mp").reduce((s,e)=>s+e.totalCant,0))} mp·zile
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MANOPERA TAB ────────────────────────────────────────────────── */}
      {tab==="manop"&&(
        <div>
          {manopList.length===0&&(
            <div style={{textAlign:"center",padding:"40px 0",color:"#444"}}>
              <div style={{fontSize:32,marginBottom:8}}>📭</div>
              <div style={{fontSize:14}}>Nicio dată pentru perioada selectată</div>
            </div>
          )}

          {manopList.map((m,i)=>{
            const pct=(m.totalRevenue/totalRevenueManop*100)||0;
            return (
              <div key={m.specialitate} style={S.card}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:11,background:"#1a2e1a",color:"#4ade80",padding:"1px 7px",borderRadius:20,fontWeight:700}}>#{i+1}</span>
                      <span style={{fontSize:14,fontWeight:500,color:"#e8e8e6"}}>{m.specialitate}</span>
                    </div>
                    <div style={{display:"flex",gap:12,fontSize:12,color:"#555",marginTop:2}}>
                      <span>{m.nrDevize} devize</span>
                      <span style={{color:"#4ade80",fontWeight:600}}>{fmtNum(m.totalPersZile)} pers·zile</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#4ade80"}}>{fmtEUR(m.totalRevenue)} EUR</div>
                    <div style={{fontSize:11,color:"#555"}}>{pct.toFixed(1)}% din total</div>
                  </div>
                </div>
                <div style={{height:4,background:"#222",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#4ade80,#86efac)",borderRadius:2}}/>
                </div>
              </div>
            );
          })}

          {manopList.length>0&&(
            <div style={S.sec}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:"#888"}}>Total revenue manoperă</span>
                <span style={{fontWeight:700,color:"#4ade80"}}>{fmtEUR(totalRevenueManop)} EUR</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6}}>
                <span style={{color:"#888"}}>Total pers·zile lucrate</span>
                <span style={{fontWeight:700,color:"#4ade80"}}>
                  {fmtNum(manopList.reduce((s,m)=>s+m.totalPersZile,0))} pers·zile
                </span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6,paddingTop:8,borderTop:"1px solid #222"}}>
                <span style={{color:"#888"}}>% din total venituri</span>
                <span style={{fontWeight:700,color:"#4ade80"}}>
                  {totalGeneral>0?((totalRevenueManop/(totalGeneral/1.21))*100).toFixed(1):0}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DEVIZE OVERVIEW TAB ─────────────────────────────────────────── */}
      {tab==="overview"&&(
        <div>
          {filtered.length===0&&(
            <div style={{textAlign:"center",padding:"40px 0",color:"#444"}}>
              <div style={{fontSize:32,marginBottom:8}}>📭</div>
              <div style={{fontSize:14}}>Niciun deviz în {periodLabel}</div>
            </div>
          )}
          {filtered.map(d=>{
            const nrZ=calcZile(d.dateStart,d.dateEnd);
            const mult=getMultiplier(nrZ);
            const dE=parseFloat(d.discountEchip||0)/100;
            const dM=parseFloat(d.discountManop||0)/100;
            const tE=(d.echipamente||[]).filter(r=>r.denumire).reduce((s,r)=>s+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*nrZ*mult*(1-dE)),0);
            const tM=(d.manopera||[]).filter(r=>r.specialitate).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZ*(1-dM)),0);
            const tT=(d.transport||[]).filter(r=>r.vehicul).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
            const tot=(tE+tM+tT)*1.21;
            const sColors={draft:["#2a2000","#f59e0b"],sent:["#1e3a5f","#7eb8f7"],approved:["#1a2e1a","#4ade80"]};
            const [sbg,sc]=sColors[d.status||"draft"];
            return (
              <div key={d.id} style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,color:"#e8e8e6"}}>{d.client?.nume||d.beneficiar||"—"}</div>
                    <div style={{fontSize:12,color:"#555",marginTop:1}}>{d.eveniment||""}{d.locatie?` · ${d.locatie}`:""}</div>
                    {d.dateStart&&<div style={{fontSize:11,color:"#555",marginTop:1}}>
                      📅 {new Date(d.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}{d.dateEnd&&d.dateEnd!==d.dateStart?" → "+new Date(d.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"}):""} · {nrZ} zile
                    </div>}
                  </div>
                  <span style={{fontSize:10,background:sbg,color:sc,padding:"2px 8px",borderRadius:20,fontWeight:600,marginLeft:8,flexShrink:0}}>
                    {d.status==="approved"?"Aprobat":d.status==="sent"?"Trimis":"Draft"}
                  </span>
                </div>
                <div style={{display:"flex",gap:10,fontSize:11,color:"#555",marginTop:6,flexWrap:"wrap"}}>
                  <span>🖥️ {fmtEUR(tE)} EUR</span>
                  <span>👷 {fmtEUR(tM)} EUR</span>
                  <span>🚚 {fmtEUR(tT)} EUR</span>
                  <span style={{marginLeft:"auto",fontSize:14,fontWeight:700,color:"#4ade80"}}>{fmtEUR(tot)} EUR</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{height:20}}/>
    </div>
  );
}
