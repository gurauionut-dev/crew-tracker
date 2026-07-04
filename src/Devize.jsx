import { useState, useEffect } from "react";
import { db } from "./firebase";
import { LOGO_B64 } from "./logo_igvision";
import { collection, doc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from "firebase/firestore";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid()     { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function fmtEUR(n) { return Number(n||0).toFixed(2); }

function calcZile(s,e) {
  if (!s) return 1;
  const start=new Date(s+"T12:00:00"), end=e?new Date(e+"T12:00:00"):start;
  return Math.max(1, Math.round((end-start)/86400000)+1);
}
function getMultiplier(n) {
  const d=parseFloat(n)||1;
  if (d<=1) return 1.0;
  if (d===2) return 1.5;
  if (d===3) return 2.0;
  if (d>=7)  return 3.5;
  return +(2.0+(d-3)*(3.5-2.0)/4).toFixed(2);
}

// ─── CATALOG DEFAULT ─────────────────────────────────────────────────────────
const DEFAULT_CATALOG = {
  echipamente: [
    {id:"e1",denumire:"LED Panels Unilumin URM III 2.6",unitate:"mp",pret:90},
    {id:"e2",denumire:"LED Panels Unilumin URM III 3.9",unitate:"mp",pret:70},
    {id:"e3",denumire:"LED Panels Fabulux Master Plus 3.9",unitate:"mp",pret:70},
    {id:"e4",denumire:"LED Processor NovaStar",unitate:"item",pret:120},
    {id:"e5",denumire:"Hanging Bar / Rigging",unitate:"item",pret:15},
    {id:"e6",denumire:"Base Plate",unitate:"item",pret:20},
    {id:"e7",denumire:"Grila Eurotruss",unitate:"ml",pret:15},
  ],
  manopera: [
    {id:"m1",specialitate:"LED Screen Technician",pret:200},
    {id:"m2",specialitate:"Crew Lead / Supervisor",pret:300},
    {id:"m3",specialitate:"Travel / Setup Day",pret:100},
    {id:"m4",specialitate:"Overtime (1.5x/h)",pret:30},
  ],
  transport: [
    {id:"t1",vehicul:"Duba 3.5T",pret:200},
    {id:"t2",vehicul:"TIR 7.5T",pret:400},
    {id:"t3",vehicul:"Auto personal",pret:50},
  ],
};

function emptyEchip()  { return {id:uid(),denumire:"",unitate:"",pret:"",cantitate:"1",zile:"1"}; }
function emptyManop()  { return {id:uid(),specialitate:"",pret:"",persoane:"1",zile:"1"}; }
function emptyTransp() { return {id:uid(),vehicul:"",pret:"",nr:"1"}; }

// ─── PRINT PDF (HTML window) ─────────────────────────────────────────────────
function printDoc(deviz, mode="deviz") { // mode: "deviz" | "aviz"
  const isAviz = mode==="aviz";
  const nrZileGlobal = deviz.nrZileManual ? parseInt(deviz.nrZileManual) : calcZile(deviz.dateStart, deviz.dateEnd);

  const echipRows = (deviz.echipamente||[]).filter(r=>r.denumire);
  const manopRows = (deviz.manopera||[]).filter(r=>r.specialitate);
  const transpRows= (deviz.transport||[]).filter(r=>r.vehicul);

  // Totals (only for deviz)
  const totE = echipRows.reduce((s,r)=>{ const rz=parseFloat(r.zile||nrZileGlobal||1); return s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*rz*getMultiplier(rz)); },0);
  const totM = manopRows.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
  const totT = transpRows.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
  const subtotal  = totE+totM+totT;
  const discE     = parseFloat(deviz.discountEchip||0)/100;
  const discM     = parseFloat(deviz.discountManop||0)/100;
  const afterDisc = totE*(1-discE)+totM*(1-discM)+totT;
  const tva       = afterDisc*0.21;
  const totalGen  = afterDisc+tva;

  const dateLabel = deviz.dateStart
    ? new Date(deviz.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})
      +(deviz.dateEnd&&deviz.dateEnd!==deviz.dateStart?" — "+new Date(deviz.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"}):"")
    : "";

  const html = `<!DOCTYPE html>
<html lang="ro"><head>
<meta charset="UTF-8"/>
<title>${isAviz?"Aviz":"Ofertă"} ${deviz.client?.nume||deviz.beneficiar||""}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;font-size:11px;color:#1a2a3a;background:#fff;}
  .page{width:210mm;margin:0 auto;padding-bottom:20mm;}
  .header{background:#1a1a1a;padding:8px 14mm;display:flex;align-items:center;justify-content:space-between;}
  .header img{height:14mm;object-fit:contain;}
  .header-right{text-align:right;}
  .header-right .type{color:#fff;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;background:#0057cc;padding:3px 10px;border-radius:4px;}
  .header-right .date{color:#aaa;font-size:9px;margin-top:4px;}
  .info{padding:6mm 14mm 4mm;}
  .info-grid{display:grid;grid-template-columns:auto 1fr;gap:2px 14px;}
  .info-grid .lbl{font-weight:700;font-size:10px;color:#6b7fa3;white-space:nowrap;padding:2px 0;}
  .info-grid .val{font-size:11px;color:#1a2a3a;padding:2px 0;}
  .badge{display:inline-block;margin-top:6px;background:#e8f0ff;color:#0057cc;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:600;}
  .section{margin:3mm 14mm 4mm;}
  .sec-title{background:#0057cc;color:#fff;text-align:center;font-size:10px;font-weight:700;padding:4px;letter-spacing:1.5px;text-transform:uppercase;}
  table{width:100%;border-collapse:collapse;font-size:10px;}
  th{background:#dce8f8;color:#0057cc;font-weight:700;font-size:9px;text-align:center;padding:4px 5px;border:1px solid #c0d4f0;letter-spacing:0.5px;}
  td{padding:4px 5px;border:1px solid #e2eaf5;text-align:center;color:#1a2a3a;}
  td.left{text-align:left;}
  tr:nth-child(even) td{background:#f5f8ff;}
  .tot-row td{background:#dce8f8;font-weight:700;font-size:10px;color:#0057cc;border-color:#c0d4f0;}
  .totals{margin:3mm 14mm 0;}
  .tline{display:flex;justify-content:space-between;padding:4px 10px;border:1px solid #e2eaf5;border-top:none;font-size:11px;}
  .tline:first-child{border-top:1px solid #e2eaf5;}
  .tline.disc{color:#cc3300;}
  .tline.after{font-weight:600;background:#f5f8ff;}
  .tline.grand{background:#0057cc;color:#fff;font-size:14px;font-weight:700;border-color:#0057cc;padding:7px 10px;}
  .footer{margin-top:8mm;border-top:1px solid #e2eaf5;padding:5px 14mm;display:flex;justify-content:space-between;}
  .footer span{font-size:9px;color:#6b7fa3;}
  @media print{
    .no-print{display:none;}
    @page{size:A4;margin:0;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style></head><body>
<div class="page">

<div class="header">
  <img src="${LOGO_B64}" alt="IG Vision"/>
  <div class="header-right">
    <div class="type">${isAviz?"AVIZ DE ÎNSOȚIRE":"RENT"}</div>
    <div class="date">${new Date().toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})}</div>
  </div>
</div>

<div class="info">
  <div class="info-grid">
    <span class="lbl">BENEFICIAR:</span><span class="val">${deviz.client?.nume||deviz.beneficiar||"—"}</span>
    <span class="lbl">EVENIMENT:</span><span class="val">${deviz.eveniment||"—"}</span>
    <span class="lbl">LOCAȚIE:</span><span class="val">${deviz.locatie||"—"}</span>
    <span class="lbl">PRODUCTION MANAGER:</span><span class="val">IONUȚ GURĂU &nbsp; 0732 302 813</span>
    ${dateLabel?`<span class="lbl">PERIOADĂ:</span><span class="val">${dateLabel}</span>`:""}
  </div>
</div>

${echipRows.length>0?`
<div class="section">
  <div class="sec-title">Echipamente</div>
  <table><thead><tr>
    <th width="24">Nr.</th><th style="text-align:left">Denumire echipament</th>
    <th width="48">Unitate</th>
    ${isAviz?`<th width="44">Cantitate</th>`:`<th width="44">Cant.</th><th width="54">Preț EUR/U</th><th width="44">Zile</th><th width="34">Mult</th><th width="68">Total EUR</th>`}
  </tr></thead><tbody>
  ${echipRows.map((r,i)=>{
    const p=parseFloat(r.pret||0), c=parseFloat(r.cantitate||1);
    const rz=parseFloat(r.zile||nrZileGlobal||1), rm=getMultiplier(rz);
    const tot=(p*c*rz*rm).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.denumire}</td>
      <td>${r.unitate||""}</td>
      ${isAviz?`<td>${c}</td>`:`<td>${c}</td><td>${p.toFixed(2)}</td><td>${rz}</td><td>${rm}x</td><td>${tot}</td>`}
    </tr>`;
  }).join("")}
  ${isAviz?"":`<tr class="tot-row"><td colspan="7" style="text-align:right;padding-right:10px;">Total</td><td>${totE.toFixed(2)} EUR</td></tr>`}
  </tbody></table>
</div>`:""}

${manopRows.length>0?`
<div class="section">
  <div class="sec-title">Manoperă</div>
  <table><thead><tr>
    <th width="24">Nr.</th><th style="text-align:left">Specialitate</th>
    ${isAviz?`<th width="60">Persoane</th>`:`<th width="52">Pers.</th><th width="68">Preț EUR/zi</th><th width="44">Zile</th><th width="78">Total EUR</th>`}
  </tr></thead><tbody>
  ${manopRows.map((r,i)=>{
    const p=parseFloat(r.pret||0), pers=parseFloat(r.persoane||1);
    const mz=parseFloat(r.zile||1);
    const tot=(p*pers*mz).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.specialitate}</td>
      ${isAviz?`<td>${pers}</td>`:`<td>${pers}</td><td>${p.toFixed(2)}</td><td>${mz}</td><td>${tot}</td>`}
    </tr>`;
  }).join("")}
  ${isAviz?"":`<tr class="tot-row"><td colspan="4" style="text-align:right;padding-right:10px;">Total</td><td>${totM.toFixed(2)} EUR</td></tr>`}
  </tbody></table>
</div>`:""}

${transpRows.length>0?`
<div class="section">
  <div class="sec-title">Transport</div>
  <table><thead><tr>
    <th width="24">Nr.</th><th style="text-align:left">Tip vehicul</th>
    ${isAviz?`<th width="60">Nr. vehicule</th>`:`<th width="70">Preț EUR</th><th width="50">Nr.</th><th width="80">Total EUR</th>`}
  </tr></thead><tbody>
  ${transpRows.map((r,i)=>{
    const tot=(parseFloat(r.pret||0)*parseFloat(r.nr||1)).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.vehicul}</td>
      ${isAviz?`<td>${r.nr||1}</td>`:`<td>${parseFloat(r.pret||0).toFixed(2)}</td><td>${r.nr||1}</td><td>${tot}</td>`}
    </tr>`;
  }).join("")}
  ${isAviz?"":`<tr class="tot-row"><td colspan="3" style="text-align:right;padding-right:10px;">Total</td><td>${totT.toFixed(2)} EUR</td></tr>`}
  </tbody></table>
</div>`:""}

${!isAviz?`
<div class="totals">
  <div class="tline"><span>VALOARE TOTALĂ</span><span>${subtotal.toFixed(2)} EUR</span></div>
  ${discE>0?`<div class="tline disc"><span>Discount Echipamente ${deviz.discountEchip}%</span><span>-${(totE*discE).toFixed(2)} EUR</span></div>`:""}
  ${discM>0?`<div class="tline disc"><span>Discount Manoperă ${deviz.discountManop}%</span><span>-${(totM*discM).toFixed(2)} EUR</span></div>`:""}
  ${discE>0||discM>0?`<div class="tline after"><span>VALOARE DUPĂ DISCOUNT</span><span>${afterDisc.toFixed(2)} EUR</span></div>`:""}
  <div class="tline"><span>TVA 21%</span><span>${tva.toFixed(2)} EUR</span></div>
  <div class="tline grand"><span>TOTAL GENERAL</span><span>${totalGen.toFixed(2)} EUR</span></div>
</div>`:""}

<div class="footer">
  <span>✉ office@igvision.ro</span><span>📞 0732302810</span>
  <span>🌐 igvision.ro</span><span>#ledscreen #ledscreenrental #igvision #events</span>
</div>
</div>

<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:10px;z-index:99;">
  <button onclick="window.print()" style="padding:11px 22px;background:#0057cc;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 12px rgba(0,87,204,0.3);">🖨 Printează / Save PDF</button>
  <button onclick="window.close()" style="padding:11px 18px;background:#f0f4fa;color:#6b7fa3;border:1.5px solid #d0daea;border-radius:9px;font-size:14px;cursor:pointer;font-family:inherit;">✕</button>
</div>
</body></html>`;

  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.target="_blank"; a.rel="noopener";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function DevizeView({ user, gcalEvents }) {
  const [devize,      setDevize]      = useState([]);
  const [clienti,     setClienti]     = useState([]);
  const [catalog,     setCatalog]     = useState(null);
  const [view,        setView]        = useState("list");
  const [current,     setCurrent]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [showCat,     setShowCat]     = useState(null);
  const [catEdit,     setCatEdit]     = useState(null);
  const [clientEdit,  setClientEdit]  = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"devize"),snap=>{
      const list=[]; snap.forEach(d=>list.push({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
      setDevize(list);
    });
    const u2=onSnapshot(collection(db,"clienti"),snap=>{
      const list=[]; snap.forEach(d=>list.push({id:d.id,...d.data()}));
      setClienti(list);
    });
    const u3=onSnapshot(doc(db,"catalog","main"),snap=>{
      setCatalog(snap.exists()?snap.data():DEFAULT_CATALOG);
    });
    return()=>{u1();u2();u3();};
  },[]);

  const cat = catalog||DEFAULT_CATALOG;

  // Calendar events — last 30 days + next 10 days
  const today = new Date();
  const d30 = new Date(today); d30.setDate(d30.getDate()-30);
  const d10 = new Date(today); d10.setDate(d10.getDate()+10);
  const toK = d=>{ const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
  const from30=toK(d30), to10=toK(d10);
  const allCalEvents = Object.values(gcalEvents||{}).flat()
    .filter((ev,i,arr)=>arr.findIndex(e=>(e.originalId||e.id)===(ev.originalId||ev.id))===i)
    .filter(ev=>(ev.dayKey||"")>=from30&&(ev.dayKey||"")<=to10)
    .sort((a,b)=>(b.dayKey||"").localeCompare(a.dayKey||""));

  // Totals for current deviz
  const nrZileGlobal = current ? (current.nrZileManual ? parseInt(current.nrZileManual) : calcZile(current.dateStart,current.dateEnd)) : 1;
  const totE = (current?.echipamente||[]).reduce((s,r)=>{ const rz=parseFloat(r.zile||nrZileGlobal||1); return s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*rz*getMultiplier(rz)); },0);
  const totM = (current?.manopera||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
  const totT = (current?.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
  const subtotal  = totE+totM+totT;
  const discE     = parseFloat(current?.discountEchip||0)/100;
  const discM     = parseFloat(current?.discountManop||0)/100;
  const afterDisc = totE*(1-discE)+totM*(1-discM)+totT;
  const tva       = afterDisc*0.21;
  const totalGen  = afterDisc+tva;

  function newDeviz() {
    setCurrent({id:uid(),beneficiar:"",eveniment:"",locatie:"",dateStart:"",dateEnd:"",
      client:null,status:"draft",discountEchip:0,discountManop:0,
      echipamente:[emptyEchip()],manopera:[emptyManop()],transport:[emptyTransp()]});
    setView("edit");
  }
  async function saveDeviz() {
    setSaving(true);
    try { await setDoc(doc(db,"devize",current.id),{...current,updatedAt:serverTimestamp(),createdBy:user.id}); setView("list"); }
    catch(e){ alert("Eroare: "+e.message); }
    setSaving(false);
  }
  async function deleteDeviz() {
    await deleteDoc(doc(db,"devize",confirmDel));
    setConfirmDel(null);
  }
  async function saveCatalog(newCat) { await setDoc(doc(db,"catalog","main"),newCat); }
  async function saveClient(c) { await setDoc(doc(db,"clienti",c.id||uid()),{...c,updatedAt:serverTimestamp()}); setClientEdit(null); }
  async function deleteClient(id) { await deleteDoc(doc(db,"clienti",id)); }

  function selectClient(c) { setCurrent(p=>({...p,client:c,beneficiar:c.nume,discountEchip:c.discountEchip||0,discountManop:c.discountManop||0})); }
  function selectCalEvent(ev) { setCurrent(p=>({...p,eveniment:ev.title,locatie:ev.location||"",dateStart:ev.dayKey,dateEnd:ev.dayKey,calEventId:ev.originalId||ev.id})); }
  function addFromCatalog(type,item) {
    if(type==="echip") setCurrent(p=>({...p,echipamente:[...p.echipamente,{id:uid(),denumire:item.denumire,unitate:item.unitate,pret:item.pret,cantitate:"1",zile:"1"}]}));
    else if(type==="manop") setCurrent(p=>({...p,manopera:[...p.manopera,{id:uid(),specialitate:item.specialitate,pret:item.pret,persoane:"1",zile:"1"}]}));
    else setCurrent(p=>({...p,transport:[...p.transport,{id:uid(),vehicul:item.vehicul,pret:item.pret,nr:"1"}]}));
    setShowCat(null);
  }

  // ── DESIGN TOKENS ──────────────────────────────────────────────────────────
  const C = { bg:"#f0f4fa", card:"#fff", border:"#e2eaf5", blue:"#0057cc", blueL:"#e8f0ff",
               text:"#1a2a3a", sub:"#6b7fa3", green:"#1a7a4a", greenL:"#e8f5ee",
               red:"#cc3300", redL:"#fff0ee" };
  const inp = {width:"100%",padding:"9px 11px",borderRadius:8,border:`1.5px solid ${C.border}`,
               background:C.card,color:C.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",
               transition:"border-color 0.15s"};
  const numI= {...inp,textAlign:"right"};
  const lbl = {fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5,display:"block"};
  const card= {background:C.card,border:`1.5px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 2px 8px rgba(0,80,200,0.07)"};
  const cardClient   = {...card, borderLeft:"4px solid #0057cc"};
  const cardCalendar = {...card, borderLeft:"4px solid #1a7a4a"};
  const cardEchip    = {...card, borderLeft:"4px solid #0057cc"};
  const cardManop    = {...card, borderLeft:"4px solid #7c3aed"};
  const cardTransp   = {...card, borderLeft:"4px solid #b45309"};
  const cardDiscount = {...card, borderLeft:"4px solid #1a7a4a"};
  const secT= {fontSize:12,fontWeight:700,color:C.blue,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.08em",display:"flex",alignItems:"center",gap:8};
  const btnP= {padding:"9px 18px",borderRadius:8,border:"none",background:C.blue,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 1px 6px rgba(0,87,204,0.2)"};
  const btnS= {padding:"8px 16px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.card,color:C.sub,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
  const btnG= {padding:"8px 16px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};

  // ── STATUS BADGE ───────────────────────────────────────────────────────────
  function StatusBadge({status}) {
    const map = {draft:[C.blueL,C.blue,"Draft"],sent:["#fff8e8","#b07000","Trimis"],approved:[C.greenL,C.green,"Aprobat"]};
    const [bg,col,lbl]=(map[status||"draft"]||map.draft);
    return <span style={{fontSize:10,background:bg,color:col,padding:"3px 9px",borderRadius:20,fontWeight:700}}>{lbl}</span>;
  }

  // ── Action bar (save + pdf + aviz buttons) used top AND bottom ─────────────
  function ActionBar({top}) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:top?"0 0 16px":"16px 0 8px",
        ...(top?{borderBottom:`1.5px solid ${C.border}`,marginBottom:16}:{borderTop:`1.5px solid ${C.border}`,marginTop:8})}}>
        {!top&&<button onClick={()=>setView("list")} style={{...btnS,marginRight:"auto"}}>‹ Înapoi</button>}
        <select value={current?.status||"draft"} onChange={e=>setCurrent(p=>({...p,status:e.target.value}))}
          style={{...btnS,cursor:"pointer"}}>
          <option value="draft">Draft</option>
          <option value="sent">Trimis</option>
          <option value="approved">Aprobat</option>
        </select>
        <button onClick={()=>printDoc(current,"aviz")} style={{...btnS}}>📋 Aviz</button>
        <button onClick={()=>printDoc(current,"deviz")} style={{...btnS}}>📄 PDF</button>
        <button onClick={saveDeviz} disabled={saving} style={{...btnG}}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATALOG VIEW
  if (view==="catalog") return (
    <div style={{padding:16,background:C.bg,minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{fontSize:17,fontWeight:700,color:C.blue,flex:1}}>Catalog echipamente & tarife</div>
      </div>
      {["echipamente","manopera","transport"].map(type=>{
        const items=cat[type]||[];
        const icons={echipamente:"🖥️",manopera:"👷",transport:"🚚"};
        const labels={echipamente:"Echipamente",manopera:"Manoperă",transport:"Transport"};
        return (
          <div key={type} style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={secT}>{icons[type]} {labels[type]}</div>
              <button onClick={()=>setCatEdit({type,item:{id:uid(),denumire:"",specialitate:"",vehicul:"",unitate:"",pret:0},isNew:true})}
                style={btnP}>+ Adaugă</button>
            </div>
            {items.map((item,i)=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:C.bg,borderRadius:9,marginBottom:6,border:`1.5px solid ${C.border}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:C.text,fontWeight:500}}>{item.denumire||item.specialitate||item.vehicul}</div>
                  <div style={{fontSize:11,color:C.sub,marginTop:1}}>{item.unitate?item.unitate+" · ":""}<span style={{color:C.blue,fontWeight:600}}>{item.pret} EUR</span></div>
                </div>
                <button onClick={()=>setCatEdit({type,item:{...item},isNew:false,idx:i})} style={{...btnS,padding:"5px 10px",fontSize:12}}>✏️</button>
                <button onClick={async()=>{ const ni=[...items].filter((_,j)=>j!==i); await saveCatalog({...cat,[type]:ni}); }}
                  style={{...btnS,padding:"5px 10px",fontSize:12,color:C.red,borderColor:C.red}}>🗑</button>
              </div>
            ))}
          </div>
        );
      })}
      {catEdit&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,30,80,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:24,width:"100%",maxWidth:380,border:`1.5px solid ${C.border}`,boxShadow:"0 8px 40px rgba(0,80,200,0.12)"}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}}>{catEdit.isNew?"Adaugă":"Editează"}</div>
            {catEdit.type==="echipamente"&&<><label style={lbl}>Denumire</label><input style={{...inp,marginBottom:10}} value={catEdit.item.denumire||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,denumire:e.target.value}}))}/><label style={lbl}>Unitate (mp/ml/item)</label><input style={{...inp,marginBottom:10}} value={catEdit.item.unitate||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,unitate:e.target.value}}))}/></>}
            {catEdit.type==="manopera"&&<><label style={lbl}>Specialitate</label><input style={{...inp,marginBottom:10}} value={catEdit.item.specialitate||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,specialitate:e.target.value}}))}/></>}
            {catEdit.type==="transport"&&<><label style={lbl}>Tip vehicul</label><input style={{...inp,marginBottom:10}} value={catEdit.item.vehicul||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,vehicul:e.target.value}}))}/></>}
            <label style={lbl}>Preț EUR</label>
            <input type="number" style={{...inp,marginBottom:16}} value={catEdit.item.pret||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,pret:parseFloat(e.target.value)||0}}))}/>
            <div style={{display:"flex",gap:10}}>
              <button onClick={async()=>{ const items=[...(cat[catEdit.type]||[])]; if(catEdit.isNew)items.push(catEdit.item); else items[catEdit.idx]=catEdit.item; await saveCatalog({...cat,[catEdit.type]:items}); setCatEdit(null); }} style={{...btnG,flex:1}}>Salvează</button>
              <button onClick={()=>setCatEdit(null)} style={{...btnS,flex:1}}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENTI VIEW
  if (view==="clienti") return (
    <div style={{padding:16,background:C.bg,minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{fontSize:17,fontWeight:700,color:C.blue,flex:1}}>Clienți</div>
        <button onClick={()=>setClientEdit({id:uid(),nume:"",email:"",telefon:"",discountEchip:0,discountManop:0})} style={btnP}>+ Client nou</button>
      </div>
      {clienti.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:C.sub}}><div style={{fontSize:36,marginBottom:8}}>👥</div>Niciun client salvat</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {clienti.map(c=>(
          <div key={c.id} style={card}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:15,fontWeight:600,color:C.text}}>{c.nume}</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setClientEdit({...c})} style={{...btnS,padding:"5px 10px",fontSize:12}}>✏️</button>
                <button onClick={()=>deleteClient(c.id)} style={{...btnS,padding:"5px 10px",fontSize:12,color:C.red,borderColor:C.red}}>🗑</button>
              </div>
            </div>
            {c.email&&<div style={{fontSize:12,color:C.sub,marginBottom:2}}>✉️ {c.email}</div>}
            {c.telefon&&<div style={{fontSize:12,color:C.sub,marginBottom:6}}>📞 {c.telefon}</div>}
            <div style={{display:"flex",gap:6}}>
              {c.discountEchip>0&&<span style={{fontSize:11,background:C.greenL,color:C.green,padding:"2px 8px",borderRadius:20,fontWeight:600}}>Echip -{c.discountEchip}%</span>}
              {c.discountManop>0&&<span style={{fontSize:11,background:C.greenL,color:C.green,padding:"2px 8px",borderRadius:20,fontWeight:600}}>Manop -{c.discountManop}%</span>}
              {!c.discountEchip&&!c.discountManop&&<span style={{fontSize:11,color:C.sub}}>Fără discount predefinit</span>}
            </div>
          </div>
        ))}
      </div>
      {clientEdit&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,30,80,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:24,width:"100%",maxWidth:380,border:`1.5px solid ${C.border}`,boxShadow:"0 8px 40px rgba(0,80,200,0.12)"}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}}>{clientEdit.nume?"Editează client":"Client nou"}</div>
            {[["Nume *","nume","text"],["Email","email","email"],["Telefon","telefon","tel"]].map(([lb,key,type])=>(
              <div key={key} style={{marginBottom:10}}><label style={lbl}>{lb}</label>
                <input type={type} style={inp} value={clientEdit[key]||""} onChange={e=>setClientEdit(p=>({...p,[key]:e.target.value}))}/></div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div><label style={lbl}>Discount Echip %</label><input type="number" style={inp} value={clientEdit.discountEchip||""} onChange={e=>setClientEdit(p=>({...p,discountEchip:parseFloat(e.target.value)||0}))}/></div>
              <div><label style={lbl}>Discount Manop %</label><input type="number" style={inp} value={clientEdit.discountManop||""} onChange={e=>setClientEdit(p=>({...p,discountManop:parseFloat(e.target.value)||0}))}/></div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>saveClient(clientEdit)} style={{...btnG,flex:1}}>Salvează</button>
              <button onClick={()=>setClientEdit(null)} style={{...btnS,flex:1}}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  if (view==="list") return (
    <div style={{padding:16,background:C.bg,minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontSize:18,fontWeight:700,color:C.blue}}>Devize & Oferte</div>
        <button onClick={newDeviz} style={btnP}>+ Deviz nou</button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>setView("catalog")} style={btnS}>📦 Catalog</button>
        <button onClick={()=>setView("clienti")} style={btnS}>👥 Clienți ({clienti.length})</button>
      </div>
      {devize.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:C.sub}}><div style={{fontSize:36,marginBottom:10}}>📋</div><div style={{fontSize:14,color:C.text}}>Niciun deviz salvat</div><div style={{fontSize:12,marginTop:4}}>Apasă "+ Deviz nou" pentru a începe</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {devize.map(d=>{
          const rz_e=d.echipamente||[], rz_m=d.manopera||[], rz_t=d.transport||[];
          const tE=rz_e.reduce((s,r)=>{ const rz=parseFloat(r.zile||1); return s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*rz*getMultiplier(rz)); },0);
          const tM=rz_m.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
          const tT=rz_t.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
          const dE=parseFloat(d.discountEchip||0)/100, dM=parseFloat(d.discountManop||0)/100;
          const tot=(tE*(1-dE)+tM*(1-dM)+tT)*1.21;
          return (
            <div key={d.id} style={card}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:C.text}}>{d.client?.nume||d.beneficiar||"Fără beneficiar"}</div>
                  <div style={{fontSize:12,color:C.sub,marginTop:2}}>{d.eveniment||""}{d.locatie?" · "+d.locatie:""}</div>
                  {d.dateStart&&<div style={{fontSize:11,color:C.sub,marginTop:2}}>📅 {new Date(d.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short",year:"numeric"})}{d.dateEnd&&d.dateEnd!==d.dateStart?" → "+new Date(d.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"}):""}</div>}
                </div>
                <StatusBadge status={d.status}/>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:20,fontWeight:700,color:C.blue}}>{fmtEUR(tot)} EUR</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>printDoc(d,"aviz")} style={{...btnS,fontSize:12,padding:"6px 10px"}}>📋 Aviz</button>
                  <button onClick={()=>printDoc(d,"deviz")} style={{...btnS,fontSize:12,padding:"6px 10px"}}>📄 PDF</button>
                  <button onClick={()=>{setCurrent({...d});setView("edit");}} style={{...btnS,fontSize:12,padding:"6px 12px",color:C.blue,borderColor:C.blue}}>✏️ Edit</button>
                  <button onClick={()=>setConfirmDel(d.id)} style={{...btnS,fontSize:12,padding:"6px 10px",color:C.red,borderColor:C.red}}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,30,80,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:24,width:"100%",maxWidth:320,border:`1.5px solid ${C.border}`,textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.1)"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}}>Ștergi devizul?</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:20}}>Această acțiune nu poate fi anulată.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDel(null)} style={{...btnS,flex:1}}>Anulează</button>
              <button onClick={deleteDeviz} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:C.red,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Șterge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // EDIT VIEW
  return (
    <div style={{padding:"16px 16px 24px",background:C.bg,minHeight:"100vh"}}>

      {/* TOP ACTION BAR */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",paddingBottom:16,borderBottom:`1.5px solid ${C.border}`,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1,fontSize:15,fontWeight:700,color:C.blue,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{current.client?.nume||current.beneficiar||"Deviz nou"}</div>
        <select value={current.status||"draft"} onChange={e=>setCurrent(p=>({...p,status:e.target.value}))} style={{...btnS,cursor:"pointer"}}>
          <option value="draft">Draft</option><option value="sent">Trimis</option><option value="approved">Aprobat</option>
        </select>
        <button onClick={()=>printDoc(current,"aviz")} style={btnS}>📋 Aviz</button>
        <button onClick={()=>printDoc(current,"deviz")} style={btnS}>📄 PDF</button>
        <button onClick={saveDeviz} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4}}>01 · Client</div>
      <div style={cardClient}>
        <div style={{...secT,color:"#0057cc"}}>👤 Client</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {clienti.map(c=>(
            <button key={c.id} onClick={()=>selectClient(c)}
              style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${current.client?.id===c.id?C.green:C.border}`,
                background:current.client?.id===c.id?C.greenL:C.card,
                color:current.client?.id===c.id?C.green:C.sub,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              {c.nume}
            </button>
          ))}
          <button onClick={()=>setView("clienti")} style={{...btnS,fontSize:12}}>+ Client nou</button>
        </div>
        {current.client&&<div style={{fontSize:11,color:C.sub}}>
          Discount: Echip -{current.client.discountEchip||0}% · Manop -{current.client.discountManop||0}%
          <button onClick={()=>setCurrent(p=>({...p,client:null,beneficiar:"",discountEchip:0,discountManop:0}))}
            style={{marginLeft:10,background:"none",border:"none",color:C.sub,cursor:"pointer",fontSize:11}}>✕ șterge</button>
        </div>}
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>02 · Eveniment & Date</div>
      <div style={cardCalendar}>
        <div style={{...secT,color:"#1a7a4a"}}>📅 Evenimente din Calendar</div>
        {allCalEvents.length===0&&<div style={{fontSize:12,color:C.sub,padding:"8px 0"}}>Niciun eveniment în ultimele 30 zile / următoarele 10 zile</div>}
        {allCalEvents.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto",marginBottom:10}}>
            {allCalEvents.map(ev=>{
              const sel=current.calEventId===(ev.originalId||ev.id);
              return (
                <div key={ev.id} onClick={()=>selectCalEvent(ev)}
                  style={{padding:"8px 12px",borderRadius:9,border:`1.5px solid ${sel?C.green:C.border}`,
                    background:sel?C.greenL:C.bg,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13,color:sel?C.green:C.text,fontWeight:sel?600:400}}>{ev.title}</div>
                    {ev.location&&<div style={{fontSize:11,color:C.sub}}>📍 {ev.location}</div>}
                  </div>
                  <div style={{fontSize:11,color:C.sub,flexShrink:0,marginLeft:8}}>
                    {new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info fields */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={lbl}>Beneficiar</label><input style={inp} value={current.beneficiar||""} onChange={e=>setCurrent(p=>({...p,beneficiar:e.target.value}))} placeholder="Numele clientului"/></div>
          <div><label style={lbl}>Eveniment</label><input style={inp} value={current.eveniment||""} onChange={e=>setCurrent(p=>({...p,eveniment:e.target.value}))} placeholder="Tip eveniment"/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Locație</label><input style={inp} value={current.locatie||""} onChange={e=>setCurrent(p=>({...p,locatie:e.target.value}))} placeholder="Locația evenimentului"/></div>
          <div><label style={lbl}>Data început</label><input type="date" style={inp} value={current.dateStart||""} onChange={e=>setCurrent(p=>({...p,dateStart:e.target.value,nrZileManual:null}))}/></div>
          <div><label style={lbl}>Data sfârșit</label><input type="date" style={inp} value={current.dateEnd||""} onChange={e=>setCurrent(p=>({...p,dateEnd:e.target.value,nrZileManual:null}))}/></div>
        </div>

        {/* Nr zile override */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:C.blueL,borderRadius:9,border:`1.5px solid #c0d4f0`}}>
          <span style={{fontSize:12,color:C.blue,fontWeight:600,flexShrink:0}}>📅 Zile devizate:</span>
          <input type="number" min="1" step="1" value={current.nrZileManual||nrZileGlobal}
            onChange={e=>setCurrent(p=>({...p,nrZileManual:e.target.value}))}
            style={{...numI,width:64,padding:"5px 8px",fontSize:15,fontWeight:700,border:`1.5px solid ${C.blue}`,textAlign:"center"}}/>
          <span style={{fontSize:12,color:C.blue}}>× multiplicator <strong>{getMultiplier(nrZileGlobal)}x</strong> la echipamente</span>
          {current.nrZileManual&&<button onClick={()=>setCurrent(p=>({...p,nrZileManual:null}))}
            style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.card,color:C.sub,cursor:"pointer",marginLeft:"auto"}}>↩ Auto</button>}
        </div>
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>03 · Echipamente</div>
      <div style={cardEchip}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#0057cc"}}>🖥️ Echipamente</div>
          <button onClick={()=>setShowCat(showCat==="echip"?null:"echip")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="echip"&&<div style={{marginBottom:12,background:C.bg,borderRadius:9,padding:10,border:`1.5px solid #c0d4f0`}}>
          {(cat.echipamente||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("echip",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1.5px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.denumire}</span>
              <span style={{fontSize:12,color:C.blue,fontWeight:600}}>{item.pret} EUR/{item.unitate}</span>
            </div>
          ))}
        </div>}
        {/* Col headers */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 50px 80px 22px",gap:4,marginBottom:4}}>
          {["Denumire","Cant.","Preț/U EUR","Zile","Mult","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#0057cc",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:h==="Total EUR"||h==="Preț/U EUR"?"right":"left"}}>{h}</div>
          ))}
        </div>
        {current.echipamente.map((r,i)=>{
          const p=parseFloat(r.pret||0), c2=parseFloat(r.cantitate||1);
          const rz=parseFloat(r.zile||nrZileGlobal||1), rm=getMultiplier(rz);
          const tot=p*c2*rz*rm;
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 50px 80px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.denumire} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],denumire:e.target.value}; return {...p2,echipamente:rows};})} placeholder="Denumire echipament"/>
              <input style={numI} type="number" step="0.01" min="0" value={r.cantitate} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],cantitate:e.target.value}; return {...p2,echipamente:rows};})} placeholder="1"/>
              <input style={numI} type="number" step="0.01" min="0" value={r.pret||""} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p2,echipamente:rows};})} placeholder="0"/>
              <input style={numI} type="number" step="0.5" min="0" value={r.zile||1} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],zile:e.target.value}; return {...p2,echipamente:rows};})} placeholder="1"/>
              <div style={{fontSize:11,color:C.sub,textAlign:"center",fontWeight:600}}>{rm}x</div>
              <div style={{fontSize:13,color:"#0057cc",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p2=>({...p2,echipamente:p2.echipamente.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0,lineHeight:1}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,echipamente:[...p.echipamente,emptyEchip()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1.5px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1.5px solid #c0d4f0"}}>
          <span style={{fontSize:12,color:"#0057cc",fontWeight:600}}>Total Echipamente</span>
          <span style={{fontSize:16,fontWeight:700,color:"#0057cc"}}>{fmtEUR(totE)} EUR</span>
        </div>
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>04 · Manoperă</div>
      <div style={cardManop}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#7c3aed"}}>👷 Manoperă</div>
          <button onClick={()=>setShowCat(showCat==="manop"?null:"manop")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="manop"&&<div style={{marginBottom:12,background:"#faf5ff",borderRadius:9,padding:10,border:"1.5px solid #e9d5ff"}}>
          {(cat.manopera||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("manop",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1.5px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.specialitate}</span>
              <span style={{fontSize:12,color:C.blue,fontWeight:600}}>{item.pret} EUR/zi</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 80px 22px",gap:4,marginBottom:4}}>
          {["Specialitate","Pers.","Preț/zi EUR","Zile","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#7c3aed",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.manopera.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 80px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.specialitate} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],specialitate:e.target.value}; return {...p,manopera:rows};})} placeholder="Specialitate"/>
              <input style={numI} type="number" step="0.5" min="0" value={r.persoane} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],persoane:e.target.value}; return {...p,manopera:rows};})} placeholder="1"/>
              <input style={numI} type="number" step="0.01" min="0" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,manopera:rows};})} placeholder="0"/>
              <input style={numI} type="number" step="0.5" min="0" value={r.zile||1} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],zile:e.target.value}; return {...p,manopera:rows};})} placeholder="1"/>
              <div style={{fontSize:13,color:"#7c3aed",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,manopera:p.manopera.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0,lineHeight:1}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,manopera:[...p.manopera,emptyManop()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1.5px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1.5px solid #e9d5ff"}}>
          <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>Total Manoperă</span>
          <span style={{fontSize:16,fontWeight:700,color:"#7c3aed"}}>{fmtEUR(totM)} EUR</span>
        </div>
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>05 · Transport</div>
      <div style={cardTransp}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#b45309"}}>🚚 Transport</div>
          <button onClick={()=>setShowCat(showCat==="transp"?null:"transp")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="transp"&&<div style={{marginBottom:12,background:"#fffbeb",borderRadius:9,padding:10,border:"1.5px solid #fde68a"}}>
          {(cat.transport||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("transp",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1.5px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.vehicul}</span>
              <span style={{fontSize:12,color:C.blue,fontWeight:600}}>{item.pret} EUR</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 80px 60px 80px 22px",gap:4,marginBottom:4}}>
          {["Vehicul","Preț EUR","Nr.","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#b45309",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.transport.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.nr||1);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 80px 60px 80px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.vehicul} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],vehicul:e.target.value}; return {...p,transport:rows};})} placeholder="Tip vehicul"/>
              <input style={numI} type="number" step="0.01" min="0" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,transport:rows};})} placeholder="0"/>
              <input style={numI} type="number" step="1" min="0" value={r.nr||1} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],nr:e.target.value}; return {...p,transport:rows};})} placeholder="1"/>
              <div style={{fontSize:13,color:"#b45309",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,transport:p.transport.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0,lineHeight:1}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,transport:[...p.transport,emptyTransp()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1.5px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1.5px solid #fde68a"}}>
          <span style={{fontSize:12,color:"#b45309",fontWeight:600}}>Total Transport</span>
          <span style={{fontSize:16,fontWeight:700,color:"#b45309"}}>{fmtEUR(totT)} EUR</span>
        </div>
      </div>

      <div style={{fontSize:10,color:"#6b7fa3",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>06 · Discount & Total</div>
      <div style={cardDiscount}>
        <div style={{...secT,color:"#1a7a4a"}}>💰 Discount & Total</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div>
            <label style={lbl}>Discount Echipamente %</label>
            <input type="number" style={inp} value={current.discountEchip||""} onChange={e=>setCurrent(p=>({...p,discountEchip:parseFloat(e.target.value)||0}))} placeholder="0"/>
            {discE>0&&<div style={{fontSize:11,color:C.red,marginTop:4}}>-{fmtEUR(totE*discE)} EUR</div>}
          </div>
          <div>
            <label style={lbl}>Discount Manoperă %</label>
            <input type="number" style={inp} value={current.discountManop||""} onChange={e=>setCurrent(p=>({...p,discountManop:parseFloat(e.target.value)||0}))} placeholder="0"/>
            {discM>0&&<div style={{fontSize:11,color:C.red,marginTop:4}}>-{fmtEUR(totM*discM)} EUR</div>}
          </div>
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:"14px 16px",border:`1.5px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.sub,marginBottom:6}}><span>Subtotal</span><span>{fmtEUR(subtotal)} EUR</span></div>
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.red,marginBottom:6}}><span>Discount</span><span>-{fmtEUR(subtotal-afterDisc)} EUR</span></div>}
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.sub,marginBottom:6}}><span>După discount</span><span>{fmtEUR(afterDisc)} EUR</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.sub,marginBottom:10}}><span>TVA 21%</span><span>{fmtEUR(tva)} EUR</span></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`2px solid ${C.border}`}}>
            <span style={{fontSize:15,fontWeight:700,color:C.text}}>TOTAL GENERAL</span>
            <span style={{fontSize:26,fontWeight:700,color:C.blue}}>{fmtEUR(totalGen)} EUR</span>
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",paddingTop:16,borderTop:`1.5px solid ${C.border}`,marginTop:8}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1}}/>
        <button onClick={()=>printDoc(current,"aviz")} style={btnS}>📋 Aviz</button>
        <button onClick={()=>printDoc(current,"deviz")} style={btnS}>📄 PDF</button>
        <button onClick={saveDeviz} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

    </div>
  );
}
