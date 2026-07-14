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
function emptyEchip()  { return {id:uid(),denumire:"",unitate:"",pret:"",cantitate:"1",zile:"1"}; }
function emptyManop()  { return {id:uid(),specialitate:"",pret:"",persoane:"1",zile:"1"}; }
function emptyTransp() { return {id:uid(),vehicul:"",pret:"",nr:"1"}; }

// ─── PRINT PDF ───────────────────────────────────────────────────────────────
function printOferta(oferta) {
  const echipRows = (oferta.echipamente||[]).filter(r=>r.denumire);
  const manopRows = (oferta.manopera||[]).filter(r=>r.specialitate);
  const transpRows= (oferta.transport||[]).filter(r=>r.vehicul);

  const totE = echipRows.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*parseFloat(r.zile||1)),0);
  const totM = manopRows.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
  const totT = transpRows.reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
  const subtotal  = totE+totM+totT;
  const discE     = parseFloat(oferta.discountEchip||0)/100;
  const discM     = parseFloat(oferta.discountManop||0)/100;
  const afterDisc = totE*(1-discE)+totM*(1-discM)+totT;
  const tva       = afterDisc*0.21;
  const totalGen  = afterDisc+tva;

  const dateLabel = oferta.dateStart
    ? new Date(oferta.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})
      +(oferta.dateEnd&&oferta.dateEnd!==oferta.dateStart?" — "+new Date(oferta.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"}):"")
    : "";

  const html = `<!DOCTYPE html>
<html lang="ro"><head>
<meta charset="UTF-8"/>
<title>Oferta ${oferta.beneficiar||""}</title>
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
  .tline.after{background:#e8f0ff;border-color:#c0d4f0;font-weight:700;}
  .tline.after span:last-child{color:#0057cc;font-size:16px;font-weight:800;}
  .tline.grand{background:#f0f0f0;color:#555;font-size:13px;font-weight:600;border-color:#ddd;}
  .tline.grand span:last-child{font-size:14px;}
  .footer{margin-top:8mm;border-top:1px solid #e2eaf5;padding:5px 14mm;display:flex;justify-content:space-between;}
  .footer span{font-size:9px;color:#6b7fa3;}
  @media print{
    .no-print{display:none !important;visibility:hidden !important;}
    @page{size:A4;margin:0;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style></head><body>
<div class="page">

<div class="header">
  <img src="${LOGO_B64}" alt="IG Vision"/>
  <div class="header-right">
    <div class="type">OFERTĂ</div>
    <div class="date">${new Date().toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})}</div>
  </div>
</div>

<div class="info">
  <div class="info-grid">
    <span class="lbl">BENEFICIAR:</span><span class="val">${oferta.beneficiar||"—"}</span>
    <span class="lbl">EVENIMENT:</span><span class="val">${oferta.eveniment||"—"}</span>
    <span class="lbl">LOCAȚIE:</span><span class="val">${oferta.locatie||"—"}</span>
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
    <th width="44">Cant.</th><th width="60">Preț EUR/U</th><th width="44">Zile</th><th width="76">Total EUR</th>
  </tr></thead><tbody>
  ${echipRows.map((r,i)=>{
    const p=parseFloat(r.pret||0), c=parseFloat(r.cantitate||1);
    const rz=parseFloat(r.zile||1);
    const tot=(p*c*rz).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.denumire}</td>
      <td>${r.unitate||""}</td>
      <td>${c}</td><td>${p.toFixed(2)}</td><td>${rz}</td><td>${tot}</td>
    </tr>`;
  }).join("")}
  <tr class="tot-row"><td colspan="6" style="text-align:right;padding-right:10px;">Total</td><td>${totE.toFixed(2)} EUR</td></tr>
  </tbody></table>
</div>`:""}

${manopRows.length>0?`
<div class="section">
  <div class="sec-title">Manoperă</div>
  <table><thead><tr>
    <th width="24">Nr.</th><th style="text-align:left">Specialitate</th>
    <th width="52">Pers.</th><th width="68">Preț EUR/zi</th><th width="44">Zile</th><th width="78">Total EUR</th>
  </tr></thead><tbody>
  ${manopRows.map((r,i)=>{
    const p=parseFloat(r.pret||0), pers=parseFloat(r.persoane||1);
    const mz=parseFloat(r.zile||1);
    const tot=(p*pers*mz).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.specialitate}</td>
      <td>${pers}</td><td>${p.toFixed(2)}</td><td>${mz}</td><td>${tot}</td>
    </tr>`;
  }).join("")}
  <tr class="tot-row"><td colspan="5" style="text-align:right;padding-right:10px;">Total</td><td>${totM.toFixed(2)} EUR</td></tr>
  </tbody></table>
</div>`:""}

${transpRows.length>0?`
<div class="section">
  <div class="sec-title">Transport</div>
  <table><thead><tr>
    <th width="24">Nr.</th><th style="text-align:left">Tip vehicul</th>
    <th width="70">Preț EUR</th><th width="50">Nr.</th><th width="80">Total EUR</th>
  </tr></thead><tbody>
  ${transpRows.map((r,i)=>{
    const tot=(parseFloat(r.pret||0)*parseFloat(r.nr||1)).toFixed(2);
    return `<tr>
      <td>${i+1}</td><td class="left">${r.vehicul}</td>
      <td>${parseFloat(r.pret||0).toFixed(2)}</td><td>${r.nr||1}</td><td>${tot}</td>
    </tr>`;
  }).join("")}
  <tr class="tot-row"><td colspan="4" style="text-align:right;padding-right:10px;">Total</td><td>${totT.toFixed(2)} EUR</td></tr>
  </tbody></table>
</div>`:""}

<div class="totals">
  <div class="tline"><span>VALOARE TOTALĂ</span><span>${subtotal.toFixed(2)} EUR</span></div>
  ${discE>0?`<div class="tline disc"><span>Discount Echipamente ${oferta.discountEchip}%</span><span>-${(totE*discE).toFixed(2)} EUR</span></div>`:""}
  ${discM>0?`<div class="tline disc"><span>Discount Manoperă ${oferta.discountManop}%</span><span>-${(totM*discM).toFixed(2)} EUR</span></div>`:""}
  ${discE>0||discM>0?`<div class="tline after"><span>VALOARE DUPĂ DISCOUNT</span><span>${afterDisc.toFixed(2)} EUR</span></div>`:""}
  <div class="tline"><span>TVA 21%</span><span>${tva.toFixed(2)} EUR</span></div>
  <div class="tline grand"><span>TOTAL GENERAL</span><span>${totalGen.toFixed(2)} EUR</span></div>
</div>

<div class="footer">
  <span>✉ office@igvision.ro</span><span>📞 0732302810</span>
  <span>🌐 igvision.ro</span><span>#ledscreen #ledscreenrental #igvision #events</span>
</div>
</div>

<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:10px;z-index:9999;background:rgba(255,255,255,0.95);padding:10px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
  <button onclick="window.print()" style="padding:11px 22px;background:#0057cc;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 12px rgba(0,87,204,0.3);">🖨 Printează / Save PDF</button>
  <button onclick="window.close()" style="padding:11px 18px;background:#f0f4fa;color:#6b7fa3;border:1.5px solid #d0daea;border-radius:9px;font-size:14px;cursor:pointer;font-family:inherit;">✕ Închide</button>
</div>
</body></html>`;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    const win = window.open();
    if (win) { win.document.write(html); win.document.close(); }
    else {
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      const clientName = (oferta.beneficiar||"igvision").replace(/\s+/g,"-").toLowerCase();
      a.download = "oferta-"+clientName+".html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  } else {
    const blob = new Blob([html],{type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.target="_blank"; a.rel="noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function OferteView({ user, gcalEvents }) {
  const [oferte,     setOferte]     = useState([]);
  const [catalog,    setCatalog]    = useState(null);
  const [view,       setView]       = useState("list");
  const [current,    setCurrent]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showCat,    setShowCat]    = useState(null);
  const [showCal,    setShowCal]    = useState(false);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"oferte"),snap=>{
      const list=[]; snap.forEach(d=>list.push({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
      setOferte(list);
    });
    const u2=onSnapshot(doc(db,"catalog","main"),snap=>{
      setCatalog(snap.exists()?snap.data():null);
    });
    return()=>{u1();u2();};
  },[]);

  const cat = catalog||{echipamente:[],manopera:[],transport:[]};

  // Calendar events
  const today = new Date();
  const d30 = new Date(today); d30.setDate(d30.getDate()-30);
  const d60 = new Date(today); d60.setDate(d60.getDate()+60);
  const toK = d=>{ const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
  const allCalEvents = Object.values(gcalEvents||{}).flat()
    .filter((ev,i,arr)=>arr.findIndex(e=>(e.originalId||e.id)===(ev.originalId||ev.id))===i)
    .filter(ev=>(ev.dayKey||"")>=toK(d30)&&(ev.dayKey||"")<=toK(d60))
    .sort((a,b)=>(b.dayKey||"").localeCompare(a.dayKey||""));

  const totE = (current?.echipamente||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*parseFloat(r.zile||1)),0);
  const totM = (current?.manopera||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
  const totT = (current?.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
  const subtotal  = totE+totM+totT;
  const discE     = parseFloat(current?.discountEchip||0)/100;
  const discM     = parseFloat(current?.discountManop||0)/100;
  const afterDisc = totE*(1-discE)+totM*(1-discM)+totT;
  const tva       = afterDisc*0.21;
  const totalGen  = afterDisc+tva;

  function newOferta() {
    setCurrent({id:uid(),beneficiar:"",eveniment:"",locatie:"",dateStart:"",dateEnd:"",
      status:"draft",discountEchip:0,discountManop:0,
      echipamente:[emptyEchip()],manopera:[emptyManop()],transport:[emptyTransp()]});
    setView("edit");
  }
  async function saveOferta() {
    setSaving(true);
    try { await setDoc(doc(db,"oferte",current.id),{...current,updatedAt:serverTimestamp(),createdBy:user.id}); setView("list"); }
    catch(e){ alert("Eroare: "+e.message); }
    setSaving(false);
  }
  async function deleteOferta() { await deleteDoc(doc(db,"oferte",confirmDel)); setConfirmDel(null); }
  function selectCalEvent(ev) { setCurrent(p=>({...p,eveniment:ev.title,locatie:ev.location||"",dateStart:ev.dayKey,dateEnd:ev.dayKey})); setShowCal(false); }
  function addFromCatalog(type,item) {
    if(type==="echip") setCurrent(p=>({...p,echipamente:[...p.echipamente,{id:uid(),denumire:item.denumire,unitate:item.unitate,pret:item.pret,cantitate:"1",zile:"1"}]}));
    else if(type==="manop") setCurrent(p=>({...p,manopera:[...p.manopera,{id:uid(),specialitate:item.specialitate,pret:item.pret,persoane:"1",zile:"1"}]}));
    else setCurrent(p=>({...p,transport:[...p.transport,{id:uid(),vehicul:item.vehicul,pret:item.pret,nr:"1"}]}));
    setShowCat(null);
  }

  const C = { bg:"#f0f4fa", card:"#fff", border:"#e5e7eb", blue:"#0057cc", blueL:"#e8f0ff",
              text:"#111827", sub:"#6b7280", green:"#1a7a4a", greenL:"#f0fdf4",
              red:"#cc3300", redL:"#fef2f2" };
  const inp = {width:"100%",padding:"9px 11px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:C.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const numI= {...inp,textAlign:"right"};
  const lbl = {fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5,display:"block"};
  const card= {background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"};
  const secT= {fontSize:11,fontWeight:700,color:C.blue,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.08em"};
  const btnP= {padding:"9px 18px",borderRadius:8,border:"none",background:"#111827",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit"};
  const btnS= {padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:C.sub,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
  const btnG= {padding:"9px 18px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit"};

  function StatusBadge({status}) {
    const map = {draft:["#eff6ff","#1d4ed8","Draft"],sent:["#fef3c7","#92400e","Trimis"],approved:["#dcfce7","#166534","Acceptat"]};
    const [bg,col,lbl]=(map[status||"draft"]||map.draft);
    return <span style={{fontSize:10,background:bg,color:col,padding:"3px 9px",borderRadius:20,fontWeight:500}}>{lbl}</span>;
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={{padding:"16px 16px 24px",background:C.bg,minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:500,color:C.text,letterSpacing:"-0.3px"}}>Oferte</div>
          <div style={{fontSize:12,color:C.sub,marginTop:2}}>{oferte.length} oferte pentru clienți noi</div>
        </div>
        <button onClick={newOferta} style={{...btnP,display:"inline-flex",alignItems:"center",gap:6}}>
          <i className="ti ti-plus" style={{fontSize:14}}></i>Ofertă nouă
        </button>
      </div>

      {oferte.length===0&&(
        <div style={{textAlign:"center",padding:"48px 0",color:C.sub}}>
          <div style={{fontSize:40,marginBottom:12}}>💼</div>
          <div style={{fontSize:14,color:C.text,fontWeight:500}}>Nicio ofertă salvată</div>
          <div style={{fontSize:12,marginTop:4}}>Crează oferte rapide pentru clienți noi fără contract</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {oferte.map(o=>{
          const tE=(o.echipamente||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.cantitate||1)*parseFloat(r.zile||1)),0);
          const tM=(o.manopera||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1)),0);
          const tT=(o.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
          const dE=parseFloat(o.discountEchip||0)/100, dM=parseFloat(o.discountManop||0)/100;
          const tot=(tE*(1-dE)+tM*(1-dM)+tT)*1.21;
          return (
            <div key={o.id} style={{...card,borderLeft:"3px solid #7c3aed"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:500,color:C.text}}>{o.beneficiar||"Fără beneficiar"}</div>
                  <div style={{fontSize:12,color:C.sub,marginTop:2}}>{o.eveniment||""}{o.locatie?" · "+o.locatie:""}</div>
                  {o.dateStart&&<div style={{fontSize:11,color:C.sub,marginTop:2}}><i className="ti ti-calendar" style={{fontSize:11,marginRight:2}}></i>{new Date(o.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short",year:"numeric"})}</div>}
                </div>
                <StatusBadge status={o.status}/>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid #f3f4f6"}}>
                <div style={{fontSize:22,fontWeight:500,color:"#7c3aed"}}>{fmtEUR(tot)} <span style={{fontSize:12,color:C.sub,fontWeight:400}}>EUR</span></div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>printOferta(o)} style={{...btnS,fontSize:12,padding:"6px 12px",display:"inline-flex",alignItems:"center",gap:4}}><i className="ti ti-file-text" style={{fontSize:13}}></i>PDF</button>
                  <button onClick={()=>{setCurrent({...o});setView("edit");}} style={{...btnS,fontSize:12,padding:"6px 14px",color:"#7c3aed",borderColor:"#e9d5ff"}}>Edit</button>
                  <button onClick={()=>setConfirmDel(o.id)} style={{...btnS,fontSize:12,padding:"6px 10px",color:C.red,borderColor:"#fecaca"}}><i className="ti ti-trash" style={{fontSize:13}}></i></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,30,80,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:24,width:"100%",maxWidth:320,textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.1)"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}}>Ștergi oferta?</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:20}}>Acțiunea nu poate fi anulată.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDel(null)} style={{...btnS,flex:1}}>Anulează</button>
              <button onClick={deleteOferta} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:C.red,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Șterge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  return (
    <div style={{padding:"16px 16px 24px",background:C.bg,minHeight:"100vh"}}>
      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:16,borderBottom:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1,fontSize:15,fontWeight:600,color:"#7c3aed",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{current.beneficiar||"Ofertă nouă"}</div>
        <select value={current.status||"draft"} onChange={e=>setCurrent(p=>({...p,status:e.target.value}))} style={{...btnS,cursor:"pointer"}}>
          <option value="draft">Draft</option><option value="sent">Trimis</option><option value="approved">Acceptat</option>
        </select>
        <button onClick={()=>printOferta(current)} style={btnS}>📄 PDF</button>
        <button onClick={saveOferta} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

      {/* INFO */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4}}>01 · Detalii ofertă</div>
      <div style={{...card,borderLeft:"3px solid #7c3aed"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Beneficiar (nume client)</label><input style={inp} value={current.beneficiar||""} onChange={e=>setCurrent(p=>({...p,beneficiar:e.target.value}))} placeholder="Numele clientului nou"/></div>
          <div><label style={lbl}>Eveniment</label><input style={inp} value={current.eveniment||""} onChange={e=>setCurrent(p=>({...p,eveniment:e.target.value}))} placeholder="Tip eveniment"/></div>
          <div><label style={lbl}>Locație</label><input style={inp} value={current.locatie||""} onChange={e=>setCurrent(p=>({...p,locatie:e.target.value}))} placeholder="Locația"/></div>
          <div><label style={lbl}>Data început</label><input type="date" style={inp} value={current.dateStart||""} onChange={e=>setCurrent(p=>({...p,dateStart:e.target.value}))}/></div>
          <div><label style={lbl}>Data sfârșit</label><input type="date" style={inp} value={current.dateEnd||""} onChange={e=>setCurrent(p=>({...p,dateEnd:e.target.value}))}/></div>
        </div>
        <button onClick={()=>setShowCal(!showCal)} style={{...btnS,fontSize:12,width:"100%",textAlign:"left"}}>
          <i className="ti ti-calendar" style={{fontSize:13,marginRight:6}}></i>{showCal?"Închide calendar":"Selectează din Google Calendar"}
        </button>
        {showCal&&(
          <div style={{marginTop:8,background:C.bg,borderRadius:9,padding:8,border:`1px solid ${C.border}`,maxHeight:180,overflowY:"auto"}}>
            {allCalEvents.length===0&&<div style={{fontSize:12,color:C.sub,padding:"8px 0"}}>Niciun eveniment disponibil</div>}
            {allCalEvents.map(ev=>(
              <div key={ev.id} onClick={()=>selectCalEvent(ev)}
                style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,cursor:"pointer",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,color:C.text,fontWeight:500}}>{ev.title}</div>
                  {ev.location&&<div style={{fontSize:11,color:C.sub}}>📍 {ev.location}</div>}
                </div>
                <span style={{fontSize:11,color:C.sub,flexShrink:0,marginLeft:8}}>{new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ECHIPAMENTE */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>02 · Echipamente</div>
      <div style={{...card,borderLeft:"3px solid #0057cc"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#0057cc"}}>🖥️ Echipamente</div>
          <button onClick={()=>setShowCat(showCat==="echip"?null:"echip")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="echip"&&<div style={{marginBottom:12,background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`,maxHeight:200,overflowY:"auto"}}>
          {(cat.echipamente||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("echip",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.denumire}</span>
              <span style={{fontSize:12,color:C.blue,fontWeight:600}}>{item.pret} EUR/{item.unitate}</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 90px 22px",gap:4,marginBottom:4}}>
          {["Denumire","Cant.","Preț/U","Zile","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#0057cc",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.echipamente.map((r,i)=>{
          const p=parseFloat(r.pret||0), c2=parseFloat(r.cantitate||1), rz=parseFloat(r.zile||1);
          const tot=p*c2*rz;
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 90px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.denumire} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],denumire:e.target.value}; return {...p2,echipamente:rows};})} placeholder="Denumire"/>
              <input style={numI} type="number" step="0.01" min="0" value={r.cantitate} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],cantitate:e.target.value}; return {...p2,echipamente:rows};})}/>
              <input style={numI} type="number" step="0.01" min="0" value={r.pret||""} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p2,echipamente:rows};})}/>
              <input style={numI} type="number" step="0.5" min="0" value={r.zile||1} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],zile:e.target.value}; return {...p2,echipamente:rows};})}/>
              <div style={{fontSize:13,color:"#0057cc",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p2=>({...p2,echipamente:p2.echipamente.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,echipamente:[...p.echipamente,emptyEchip()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,color:"#0057cc",fontWeight:600}}>Total Echipamente</span>
          <span style={{fontSize:16,fontWeight:700,color:"#0057cc"}}>{fmtEUR(totE)} EUR</span>
        </div>
      </div>

      {/* MANOPERĂ */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>03 · Manoperă</div>
      <div style={{...card,borderLeft:"3px solid #7c3aed"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#7c3aed"}}>👷 Manoperă</div>
          <button onClick={()=>setShowCat(showCat==="manop"?null:"manop")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="manop"&&<div style={{marginBottom:12,background:"#faf5ff",borderRadius:9,padding:10,border:"1px solid #e9d5ff"}}>
          {(cat.manopera||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("manop",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.specialitate}</span>
              <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>{item.pret} EUR/zi</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 80px 22px",gap:4,marginBottom:4}}>
          {["Specialitate","Pers.","Preț/zi","Zile","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#7c3aed",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.manopera.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.persoane||1)*parseFloat(r.zile||1);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 55px 80px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.specialitate} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],specialitate:e.target.value}; return {...p,manopera:rows};})}/>
              <input style={numI} type="number" step="0.5" min="0" value={r.persoane} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],persoane:e.target.value}; return {...p,manopera:rows};})}/>
              <input style={numI} type="number" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,manopera:rows};})}/>
              <input style={numI} type="number" step="0.5" min="0" value={r.zile||1} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],zile:e.target.value}; return {...p,manopera:rows};})}/>
              <div style={{fontSize:13,color:"#7c3aed",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,manopera:p.manopera.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,manopera:[...p.manopera,emptyManop()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1px solid #e9d5ff"}}>
          <span style={{fontSize:12,color:"#7c3aed",fontWeight:600}}>Total Manoperă</span>
          <span style={{fontSize:16,fontWeight:700,color:"#7c3aed"}}>{fmtEUR(totM)} EUR</span>
        </div>
      </div>

      {/* TRANSPORT */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>04 · Transport</div>
      <div style={{...card,borderLeft:"3px solid #b45309"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{...secT,color:"#b45309"}}>🚚 Transport</div>
          <button onClick={()=>setShowCat(showCat==="transp"?null:"transp")} style={{...btnS,fontSize:12}}>📦 Catalog</button>
        </div>
        {showCat==="transp"&&<div style={{marginBottom:12,background:"#fffbeb",borderRadius:9,padding:10,border:"1px solid #fde68a"}}>
          {(cat.transport||[]).map(item=>(
            <div key={item.id} onClick={()=>addFromCatalog("transp",item)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:C.card,cursor:"pointer",marginBottom:6,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.text}}>{item.vehicul}</span>
              <span style={{fontSize:12,color:"#b45309",fontWeight:600}}>{item.pret} EUR</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 80px 60px 80px 22px",gap:4,marginBottom:4}}>
          {["Vehicul","Preț","Nr.","Total EUR",""].map(h=>(
            <div key={h} style={{fontSize:9,color:"#b45309",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.transport.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.nr||1);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 80px 60px 80px 22px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={inp} value={r.vehicul} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],vehicul:e.target.value}; return {...p,transport:rows};})}/>
              <input style={numI} type="number" step="0.01" min="0" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,transport:rows};})}/>
              <input style={numI} type="number" step="1" min="0" value={r.nr||1} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],nr:e.target.value}; return {...p,transport:rows};})}/>
              <div style={{fontSize:13,color:"#b45309",fontWeight:700,textAlign:"right"}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,transport:p.transport.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,transport:[...p.transport,emptyTransp()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,paddingTop:12,borderTop:"1px solid #fde68a"}}>
          <span style={{fontSize:12,color:"#b45309",fontWeight:600}}>Total Transport</span>
          <span style={{fontSize:16,fontWeight:700,color:"#b45309"}}>{fmtEUR(totT)} EUR</span>
        </div>
      </div>

      {/* DISCOUNT + TOTAL */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>05 · Discount & Total</div>
      <div style={{...card,borderLeft:"3px solid #059669"}}>
        <div style={{...secT,color:"#059669"}}>💰 Discount & Total</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div>
            <label style={lbl}>Discount Echipamente %</label>
            <input type="number" style={inp} value={current.discountEchip||""} onChange={e=>setCurrent(p=>({...p,discountEchip:parseFloat(e.target.value)||0}))}/>
            {discE>0&&<div style={{fontSize:11,color:C.red,marginTop:4}}>-{fmtEUR(totE*discE)} EUR</div>}
          </div>
          <div>
            <label style={lbl}>Discount Manoperă %</label>
            <input type="number" style={inp} value={current.discountManop||""} onChange={e=>setCurrent(p=>({...p,discountManop:parseFloat(e.target.value)||0}))}/>
            {discM>0&&<div style={{fontSize:11,color:C.red,marginTop:4}}>-{fmtEUR(totM*discM)} EUR</div>}
          </div>
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:"14px 16px",border:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.sub,marginBottom:6}}><span>Subtotal</span><span>{fmtEUR(subtotal)} EUR</span></div>
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.red,marginBottom:6}}><span>Discount</span><span>-{fmtEUR(subtotal-afterDisc)} EUR</span></div>}
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.blueL,borderRadius:9,border:`1px solid #c0d4f0`,marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:700,color:C.blue}}>Valoare după discount</span>
            <span style={{fontSize:20,fontWeight:700,color:C.blue}}>{fmtEUR(afterDisc)} EUR</span>
          </div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.sub,marginBottom:10}}><span>TVA 21%</span><span>{fmtEUR(tva)} EUR</span></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`2px solid ${C.border}`,background:"#f5f5f5",margin:"0 -4px",padding:"10px 4px",borderRadius:6}}>
            <span style={{fontSize:13,fontWeight:600,color:C.sub}}>TOTAL GENERAL (cu TVA)</span>
            <span style={{fontSize:20,fontWeight:700,color:C.sub}}>{fmtEUR(totalGen)} EUR</span>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:16,borderTop:`1px solid ${C.border}`,marginTop:8}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1}}/>
        <button onClick={()=>printOferta(current)} style={btnS}>📄 PDF</button>
        <button onClick={saveOferta} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

    </div>
  );
}
