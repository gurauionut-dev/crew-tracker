import { useState, useEffect } from "react";
import { db } from "./firebase";
import { LOGO_B64 } from "./logo_igvision";
import {
  collection, doc, setDoc, onSnapshot,
  deleteDoc, serverTimestamp
} from "firebase/firestore";

// ─── MULTIPLICATORI ZILE ──────────────────────────────────────────────────────
const DAY_MULTIPLIERS = [
  { zile: 1, label: "1 zi",        mult: 1.0  },
  { zile: 2, label: "2 zile",      mult: 1.5  },
  { zile: 3, label: "3 zile",      mult: 2.0  },
  { zile: 7, label: "1 săptămână", mult: 3.5  },
];

function getMultiplier(nrZile) {
  const n = parseInt(nrZile) || 1;
  if (n <= 1) return 1.0;
  if (n === 2) return 1.5;
  if (n === 3) return 2.0;
  if (n >= 7) return 3.5;
  // interpolate for 4-6 days
  return 2.0 + (n - 3) * (3.5 - 2.0) / 4;
}

function calcZile(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return 1;
  const s = new Date(dateStart), e = new Date(dateEnd);
  const diff = Math.round((e - s) / 86400000) + 1;
  return Math.max(1, diff);
}

// ─── CATALOG DEFAULT ──────────────────────────────────────────────────────────
const DEFAULT_CATALOG = {
  echipamente: [
    { id:"e1", denumire:"LED Panels Unilumin URM III 2.6", unitate:"mp",   pret:90  },
    { id:"e2", denumire:"LED Panels Unilumin URM III 3.9", unitate:"mp",   pret:70  },
    { id:"e3", denumire:"LED Panels Fabulux Master Plus 3.9", unitate:"mp",pret:70  },
    { id:"e4", denumire:"LED Processor NovaStar",          unitate:"item", pret:120 },
    { id:"e5", denumire:"Hanging Bar / Rigging",           unitate:"item", pret:15  },
    { id:"e6", denumire:"Base Plate",                      unitate:"item", pret:20  },
    { id:"e7", denumire:"Grila Eurotruss",                 unitate:"ml",   pret:15  },
  ],
  manopera: [
    { id:"m1", specialitate:"LED Screen Technician",  pret:200 },
    { id:"m2", specialitate:"Crew Lead / Supervisor", pret:300 },
    { id:"m3", specialitate:"Travel / Setup Day",     pret:100 },
    { id:"m4", specialitate:"Overtime (1.5x/h)",      pret:30  },
  ],
  transport: [
    { id:"t1", vehicul:"Duba 3.5T",    pret:200 },
    { id:"t2", vehicul:"TIR 7.5T",     pret:400 },
    { id:"t3", vehicul:"Auto personal",pret:50  },
  ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid()     { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function fmtEUR(n) { return Number(n||0).toFixed(2); }
function ro(s) {
  if (!s) return "";
  return String(s)
    .replace(/ș/g,"s").replace(/Ș/g,"S").replace(/ț/g,"t").replace(/Ț/g,"T")
    .replace(/ă/g,"a").replace(/Ă/g,"A").replace(/î/g,"i").replace(/Î/g,"I")
    .replace(/â/g,"a").replace(/Â/g,"A");
}

function emptyEchip(cat)    { return { id:uid(), denumire:"", unitate:"", pretBaza:0, cantitate:"", pret:0, total:0, fromCatalog:false }; }
function emptyManop()       { return { id:uid(), specialitate:"", persoane:"1", pret:0, total:0 }; }
function emptyTransport()   { return { id:uid(), vehicul:"", pret:0, nr:"1", total:0 }; }

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
function exportDevizPDF(deviz) {
  const nrZile = calcZile(deviz.dateStart, deviz.dateEnd);
  const mult   = getMultiplier(nrZile);
  const discE  = parseFloat(deviz.discountEchip||0)/100;
  const discM  = parseFloat(deviz.discountManop||0)/100;

  const totE = (deviz.echipamente||[]).filter(r=>r.denumire).reduce((s,r)=>{
    return s+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*nrZile*mult*(1-discE));
  },0);
  const totM = (deviz.manopera||[]).filter(r=>r.specialitate).reduce((s,r)=>{
    return s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZile*(1-discM));
  },0);
  const totT = (deviz.transport||[]).filter(r=>r.vehicul).reduce((s,r)=>{
    return s+(parseFloat(r.pret||0)*parseFloat(r.nr||1));
  },0);
  const subtotal  = totE+totM+totT;
  const afterDisc = totE*(1-discE)+totM*(1-discM)+totT;
  const tva       = afterDisc*0.21;
  const totalGen  = afterDisc+tva;

  const dateLabel = deviz.dateStart
    ? new Date(deviz.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})
      + (deviz.dateEnd&&deviz.dateEnd!==deviz.dateStart
        ? " — "+new Date(deviz.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})
        : "")
    : "";

  function rowsHtml(items, cols, getVals) {
    return items.filter(r=>Object.values(r)[1]).map((r,i)=>`
      <tr class="${i%2===0?"":"alt"}">
        ${getVals(r,i).map(v=>`<td>${v??""}</td>`).join("")}
      </tr>`).join("");
  }

  const echipRows = (deviz.echipamente||[]).filter(r=>r.denumire);
  const manopRows = (deviz.manopera||[]).filter(r=>r.specialitate);
  const transpRows= (deviz.transport||[]).filter(r=>r.vehicul);

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8"/>
<title>Oferta ${deviz.client?.nume||deviz.beneficiar||"IG Vision"}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'DM Sans',sans-serif; font-size:11px; color:#111; background:#fff; }
  .page { width:210mm; min-height:297mm; margin:0 auto; padding:0; }

  /* HEADER */
  .header { background:#1a1a1a; padding:10px 14mm; display:flex; align-items:center; justify-content:space-between; }
  .header img { height:16mm; }
  .header .rent { color:#fff; font-size:22px; font-weight:700; letter-spacing:2px; }

  /* OFERTA TITLE */
  .oferta-title { padding:8mm 14mm 4mm; }
  .oferta-title h1 { font-size:18px; font-weight:700; margin-bottom:6px; }
  .info-grid { display:grid; grid-template-columns:auto 1fr; gap:3px 12px; }
  .info-grid .lbl { font-weight:700; font-size:11px; white-space:nowrap; }
  .info-grid .val { font-size:11px; }
  .mult-badge { display:inline-block; margin-top:8px; background:#e8f4ff; color:#0066cc; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:600; }

  /* SECTIONS */
  .section { margin:0 14mm 6mm; }
  .section-title { background:#0066cc; color:#fff; text-align:center; font-size:11px; font-weight:700; padding:5px; letter-spacing:1px; }
  table { width:100%; border-collapse:collapse; }
  thead td, thead th { background:#d9e8ff; font-weight:700; font-size:10px; text-align:center; padding:5px 4px; border:1px solid #c0d4f0; }
  tbody td { padding:4px 5px; border:1px solid #ddd; font-size:10px; text-align:center; }
  tbody td.left { text-align:left; }
  tr.alt td { background:#f5f8ff; }
  .total-row td { background:#d9e8ff; font-weight:700; font-size:11px; padding:5px; border:1px solid #c0d4f0; }

  /* TOTALS */
  .totals { margin:0 14mm; }
  .total-line { display:flex; justify-content:space-between; padding:5px 10px; font-size:11px; border:1px solid #ddd; border-top:none; }
  .total-line:first-child { border-top:1px solid #ddd; }
  .total-line.discount { color:#cc0000; }
  .total-line.after-disc { font-weight:600; }
  .total-line.tva { }
  .total-line.grand { background:#0066cc; color:#fff; font-size:14px; font-weight:700; border-color:#0066cc; }

  /* FOOTER */
  .footer { margin-top:10mm; border-top:1px solid #ddd; padding:6px 14mm; display:flex; justify-content:space-between; align-items:center; }
  .footer span { font-size:9px; color:#888; }

  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
    @page { size:A4; margin:0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <img src="${LOGO_B64}" alt="IG Vision"/>
    <div class="rent">RENT</div>
  </div>

  <!-- OFERTA TITLE + INFO -->
  <div class="oferta-title">
    <h1>OFERTĂ DE PREȚ</h1>
    <div class="info-grid">
      <span class="lbl">BENEFICIAR:</span><span class="val">${deviz.client?.nume||deviz.beneficiar||""}</span>
      <span class="lbl">EVENIMENT:</span><span class="val">${deviz.eveniment||""}</span>
      <span class="lbl">LOCAȚIE:</span><span class="val">${deviz.locatie||""}</span>
      <span class="lbl">PRODUCTION MANAGER:</span><span class="val">IONUȚ GURĂU &nbsp; 0732 302 813</span>
      ${dateLabel?`<span class="lbl">PERIOADĂ:</span><span class="val">${dateLabel}</span>`:""}
    </div>
    ${nrZile>1?`<span class="mult-badge">📅 ${nrZile} zile · multiplicator ${mult}x</span>`:""}
  </div>

  <!-- ECHIPAMENTE -->
  ${echipRows.length>0?`
  <div class="section">
    <div class="section-title">ECHIPAMENTE</div>
    <table>
      <thead><tr>
        <th width="30">Nr.</th><th>Denumire echipament</th>
        <th width="60">Unitate</th><th width="70">Preț EUR/U</th>
        <th width="50">Cant.</th><th width="50">Zile</th><th width="80">Preț total EUR</th>
      </tr></thead>
      <tbody>
        ${echipRows.map((r,i)=>{
          const p=parseFloat(r.pret||r.pretBaza||0);
          const c=parseFloat(r.cantitate||1);
          const tot=(p*c*nrZile*mult*(1-discE)).toFixed(2);
          return `<tr class="${i%2?"alt":""}">
            <td>${i+1}</td><td class="left">${r.denumire}</td>
            <td>${r.unitate||""}</td><td>${p.toFixed(2)}</td>
            <td>${c}</td><td>${nrZile}×${mult}x</td><td>${tot}</td>
          </tr>`;
        }).join("")}
        <tr class="total-row"><td colspan="6" style="text-align:right;padding-right:10px;">Total</td><td>${totE.toFixed(2)} EUR</td></tr>
      </tbody>
    </table>
  </div>`:""}

  <!-- MANOPERĂ -->
  ${manopRows.length>0?`
  <div class="section">
    <div class="section-title">MANOPERĂ</div>
    <table>
      <thead><tr>
        <th width="30">Nr.</th><th>Specialitatea</th>
        <th width="60">Persoane</th><th width="80">Preț EUR/zi</th>
        <th width="50">Zile</th><th width="80">Preț total EUR</th>
      </tr></thead>
      <tbody>
        ${manopRows.map((r,i)=>{
          const p=parseFloat(r.pret||0);
          const pers=parseFloat(r.persoane||1);
          const tot=(p*pers*nrZile*(1-discM)).toFixed(2);
          return `<tr class="${i%2?"alt":""}">
            <td>${i+1}</td><td class="left">${r.specialitate}</td>
            <td>${pers}</td><td>${p.toFixed(2)}</td>
            <td>${nrZile}</td><td>${tot}</td>
          </tr>`;
        }).join("")}
        <tr class="total-row"><td colspan="5" style="text-align:right;padding-right:10px;">Total</td><td>${totM.toFixed(2)} EUR</td></tr>
      </tbody>
    </table>
  </div>`:""}

  <!-- TRANSPORT -->
  ${transpRows.length>0?`
  <div class="section">
    <div class="section-title">TRANSPORT</div>
    <table>
      <thead><tr>
        <th width="30">Nr.</th><th>Tip vehicul</th>
        <th width="80">Preț EUR</th><th width="60">Nr.</th><th width="80">Preț total EUR</th>
      </tr></thead>
      <tbody>
        ${transpRows.map((r,i)=>{
          const tot=(parseFloat(r.pret||0)*parseFloat(r.nr||1)).toFixed(2);
          return `<tr class="${i%2?"alt":""}">
            <td>${i+1}</td><td class="left">${r.vehicul}</td>
            <td>${parseFloat(r.pret||0).toFixed(2)}</td><td>${r.nr||1}</td><td>${tot}</td>
          </tr>`;
        }).join("")}
        <tr class="total-row"><td colspan="4" style="text-align:right;padding-right:10px;">Total</td><td>${totT.toFixed(2)} EUR</td></tr>
      </tbody>
    </table>
  </div>`:""}

  <!-- TOTALS -->
  <div class="totals">
    <div class="total-line"><span>VALOARE TOTALĂ</span><span>${subtotal.toFixed(2)} EUR</span></div>
    ${discE>0?`<div class="total-line discount"><span>Discount Echipamente ${deviz.discountEchip}%</span><span>-${(totE*discE).toFixed(2)} EUR</span></div>`:""}
    ${discM>0?`<div class="total-line discount"><span>Discount Manoperă ${deviz.discountManop}%</span><span>-${(totM*discM/(1-discM)).toFixed(2)} EUR</span></div>`:""}
    ${discE>0||discM>0?`<div class="total-line after-disc"><span>VALOARE DUPĂ DISCOUNT</span><span>${afterDisc.toFixed(2)} EUR</span></div>`:""}
    <div class="total-line tva"><span>TVA 21%</span><span>${tva.toFixed(2)} EUR</span></div>
    <div class="total-line grand"><span>TOTAL GENERAL</span><span>${totalGen.toFixed(2)} EUR</span></div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>✉ office@igvision.ro</span>
    <span>📞 0732302810</span>
    <span>🌐 igvision.ro</span>
    <span>#ledscreen #ledscreenrental #igvision #events</span>
  </div>

</div>

<!-- Print button -->
<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:10px;">
  <button onclick="window.print()" style="padding:12px 24px;background:#0066cc;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">🖨 Printează / Save PDF</button>
  <button onclick="window.close()" style="padding:12px 24px;background:#333;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit;">✕ Închide</button>
</div>

</body>
</html>`;

  // Open in new window — must be synchronous for Safari
  const win = window.open("","_blank");
  if (!win) { alert("Permite pop-up-urile pentru acest site!"); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}


// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DevizeView({ user, gcalEvents }) {
  const [devize,   setDevize]   = useState([]);
  const [clienti,  setClienti]  = useState([]);
  const [catalog,  setCatalog]  = useState(null); // loaded from Firebase
  const [view,     setView]     = useState("list"); // list | edit | catalog | clienti
  const [current,  setCurrent]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // id to delete
  const [showCat,  setShowCat]  = useState(null); // echip|manop|transp
  const [catEdit,  setCatEdit]  = useState(null); // editing catalog item
  const [clientEdit, setClientEdit] = useState(null);

  // Load from Firebase
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
      if(snap.exists()) setCatalog(snap.data());
      else setCatalog(DEFAULT_CATALOG);
    });
    return()=>{ u1(); u2(); u3(); };
  },[]);

  const cat = catalog || DEFAULT_CATALOG;

  // ── Calendar events flat list ─────────────────────────────────────────────
  const allCalEvents = Object.values(gcalEvents||{}).flat()
    .filter((ev,i,arr)=>arr.findIndex(e=>e.originalId===ev.originalId)===i)
    .sort((a,b)=>a.dayKey?.localeCompare(b.dayKey||"")||0);

  // ── Calculated totals ─────────────────────────────────────────────────────
  const nrZile = current ? calcZile(current.dateStart, current.dateEnd) : 1;
  const mult   = getMultiplier(nrZile);

  const totE = (current?.echipamente||[]).reduce((s,r)=>{
    return s+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*nrZile*mult);
  },0);
  const totM = (current?.manopera||[]).reduce((s,r)=>{
    return s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZile);
  },0);
  const totT = (current?.transport||[]).reduce((s,r)=>{
    return s+(parseFloat(r.pret||0)*parseFloat(r.nr||1));
  },0);
  const subtotal   = totE+totM+totT;
  const discE      = parseFloat(current?.discountEchip||0);
  const discM      = parseFloat(current?.discountManop||0);
  const afterDisc  = totE*(1-discE/100)+totM*(1-discM/100)+totT;
  const tva        = afterDisc*0.21;
  const totalGen   = afterDisc+tva;

  // ── Actions ───────────────────────────────────────────────────────────────
  function newDeviz() {
    setCurrent({
      id:uid(), beneficiar:"", eveniment:"", locatie:"",
      dateStart:"", dateEnd:"",
      client:null, status:"draft",
      discountEchip:0, discountManop:0,
      echipamente:[emptyEchip()],
      manopera:[emptyManop()],
      transport:[emptyTransport()],
      fromCalendar:false,
    });
    setView("edit");
  }

  function selectCalendarEvent(ev) {
    setCurrent(prev=>({
      ...prev,
      eveniment: ev.title,
      locatie:   ev.location||"",
      dateStart: ev.dayKey,
      dateEnd:   ev.dayKey,
      fromCalendar: true,
      calEventId: ev.originalId||ev.id,
    }));
  }

  function selectClient(client) {
    setCurrent(prev=>({
      ...prev,
      client,
      beneficiar: client.nume,
      discountEchip: client.discountEchip||0,
      discountManop: client.discountManop||0,
    }));
  }

  async function saveDeviz() {
    setSaving(true);
    try {
      await setDoc(doc(db,"devize",current.id),{
        ...current, updatedAt:serverTimestamp(), createdBy:user.id,
      });
      setView("list");
    } catch(e){ alert("Eroare: "+e.message); }
    setSaving(false);
  }

  async function deleteDeviz(id) {
    setConfirmDelete(id);
  }
  async function confirmDeleteDeviz() {
    if (!confirmDelete) return;
    await deleteDoc(doc(db,"devize",confirmDelete));
    setConfirmDelete(null);
  }

  async function saveCatalog(newCat) {
    await setDoc(doc(db,"catalog","main"),newCat);
    setCatalog(newCat);
  }

  async function saveClient(client) {
    const id = client.id||uid();
    await setDoc(doc(db,"clienti",id),{...client,id,updatedAt:serverTimestamp()});
    setClientEdit(null);
  }

  async function deleteClient(id) {
    if(!confirm("Ștergi clientul?")) return;
    await deleteDoc(doc(db,"clienti",id));
  }

  function addFromCatalog(type, item) {
    if(type==="echip") {
      const row={id:uid(),denumire:item.denumire,unitate:item.unitate,pretBaza:item.pret,pret:item.pret,cantitate:"1"};
      setCurrent(p=>({...p,echipamente:[...p.echipamente,row]}));
    } else if(type==="manop") {
      const row={id:uid(),specialitate:item.specialitate,persoane:"1",pret:item.pret};
      setCurrent(p=>({...p,manopera:[...p.manopera,row]}));
    } else {
      const row={id:uid(),vehicul:item.vehicul,pret:item.pret,nr:"1"};
      setCurrent(p=>({...p,transport:[...p.transport,row]}));
    }
    setShowCat(null);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const S={
    inp:  {width:"100%",padding:"9px 12px",borderRadius:9,border:"1px solid #2a2a2a",background:"#111",color:"#e8e8e6",fontSize:13,outline:"none",boxSizing:"border-box"},
    numI: {width:"100%",padding:"8px 6px",borderRadius:9,border:"1px solid #2a2a2a",background:"#111",color:"#e8e8e6",fontSize:13,outline:"none",textAlign:"right",boxSizing:"border-box"},
    lbl:  {fontSize:10,color:"#666",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,display:"block"},
    sec:  {background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:16,marginBottom:14},
    secT: {fontSize:12,fontWeight:700,color:"#7eb8f7",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.05em"},
    btn:  (bg,col)=>({padding:"8px 14px",borderRadius:9,border:"none",background:bg,color:col,fontSize:12,fontWeight:600,cursor:"pointer"}),
    btnO: (col)=>({padding:"7px 12px",borderRadius:9,border:`1px solid ${col}`,background:"transparent",color:col,fontSize:12,cursor:"pointer"}),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── CATALOG VIEW ───────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  if(view==="catalog") return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:0}}>‹ Înapoi</button>
        <div style={{fontSize:15,fontWeight:700,color:"#e8e8e6",flex:1}}>Catalog Echipamente & Tarife</div>
      </div>

      {["echipamente","manopera","transport"].map(type=>{
        const items = cat[type]||[];
        const titles={echipamente:"🖥️ Echipamente",manopera:"👷 Manoperă",transport:"🚚 Transport"};
        return (
          <div key={type} style={S.sec}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={S.secT}>{titles[type]}</div>
              <button onClick={()=>setCatEdit({type,item:{id:uid(),denumire:"",specialitate:"",vehicul:"",unitate:"",pret:0},isNew:true})}
                style={S.btn("#7eb8f7","#111")}>+ Adaugă</button>
            </div>
            {items.map((item,i)=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#111",borderRadius:10,marginBottom:6,border:"1px solid #222"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:"#ccc",fontWeight:500}}>{item.denumire||item.specialitate||item.vehicul}</div>
                  <div style={{fontSize:11,color:"#555"}}>{item.unitate||""}{item.unitate?" · ":""}<span style={{color:"#4ade80"}}>{item.pret} EUR</span></div>
                </div>
                <button onClick={()=>setCatEdit({type,item:{...item},isNew:false,idx:i})} style={S.btnO("#555")}>✏️</button>
                <button onClick={async()=>{
                  const newItems=items.filter((_,j)=>j!==i);
                  await saveCatalog({...cat,[type]:newItems});
                }} style={S.btnO("#ef4444")}>🗑</button>
              </div>
            ))}
          </div>
        );
      })}

      {/* Edit modal */}
      {catEdit&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1a1a1a",borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid #2a2a2a"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#e8e8e6",marginBottom:16}}>{catEdit.isNew?"Adaugă":"Editează"} element</div>
            {catEdit.type==="echipamente"&&<>
              <label style={S.lbl}>Denumire</label>
              <input style={{...S.inp,marginBottom:10}} value={catEdit.item.denumire||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,denumire:e.target.value}}))}/>
              <label style={S.lbl}>Unitate (mp/ml/item)</label>
              <input style={{...S.inp,marginBottom:10}} value={catEdit.item.unitate||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,unitate:e.target.value}}))}/>
            </>}
            {catEdit.type==="manopera"&&<>
              <label style={S.lbl}>Specialitate</label>
              <input style={{...S.inp,marginBottom:10}} value={catEdit.item.specialitate||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,specialitate:e.target.value}}))}/>
            </>}
            {catEdit.type==="transport"&&<>
              <label style={S.lbl}>Tip vehicul</label>
              <input style={{...S.inp,marginBottom:10}} value={catEdit.item.vehicul||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,vehicul:e.target.value}}))}/>
            </>}
            <label style={S.lbl}>Preț EUR</label>
            <input type="number" style={{...S.inp,marginBottom:16}} value={catEdit.item.pret||""} onChange={e=>setCatEdit(p=>({...p,item:{...p.item,pret:parseFloat(e.target.value)||0}}))}/>
            <div style={{display:"flex",gap:10}}>
              <button onClick={async()=>{
                const items=[...( cat[catEdit.type]||[])];
                if(catEdit.isNew) items.push(catEdit.item);
                else items[catEdit.idx]=catEdit.item;
                await saveCatalog({...cat,[catEdit.type]:items});
                setCatEdit(null);
              }} style={{...S.btn("#4ade80","#111"),flex:1}}>Salvează</button>
              <button onClick={()=>setCatEdit(null)} style={{...S.btnO("#666"),flex:1}}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ── CLIENTI VIEW ──────────────────────────────────────────────════════════
  // ═══════════════════════════════════════════════════════════════════════════
  if(view==="clienti") return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:0}}>‹ Înapoi</button>
        <div style={{fontSize:15,fontWeight:700,color:"#e8e8e6",flex:1}}>Clienți</div>
        <button onClick={()=>setClientEdit({id:uid(),nume:"",email:"",telefon:"",discountEchip:0,discountManop:0})}
          style={S.btn("#7eb8f7","#111")}>+ Client nou</button>
      </div>

      {clienti.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#444"}}>
          <div style={{fontSize:36,marginBottom:12}}>👥</div>
          <div style={{fontSize:14}}>Niciun client salvat</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {clienti.map(c=>(
          <div key={c.id} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:15,fontWeight:600,color:"#e8e8e6"}}>{c.nume}</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setClientEdit({...c})} style={S.btnO("#7eb8f7")}>✏️</button>
                <button onClick={()=>deleteClient(c.id)} style={S.btnO("#ef4444")}>🗑</button>
              </div>
            </div>
            {c.email&&<div style={{fontSize:12,color:"#555",marginBottom:2}}>✉️ {c.email}</div>}
            {c.telefon&&<div style={{fontSize:12,color:"#555",marginBottom:4}}>📞 {c.telefon}</div>}
            <div style={{display:"flex",gap:8,marginTop:6}}>
              {c.discountEchip>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#1a2e1a",color:"#4ade80",fontWeight:500}}>Echip: -{c.discountEchip}%</span>}
              {c.discountManop>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#1a2e1a",color:"#4ade80",fontWeight:500}}>Manop: -{c.discountManop}%</span>}
              {!c.discountEchip&&!c.discountManop&&<span style={{fontSize:11,color:"#444"}}>Fără discount predefinit</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Client edit modal */}
      {clientEdit&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1a1a1a",borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid #2a2a2a"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#e8e8e6",marginBottom:16}}>
              {clientEdit.nume?"Editează client":"Client nou"}
            </div>
            {[["Nume *","nume","text"],["Email","email","email"],["Telefon","telefon","tel"]].map(([lbl,key,type])=>(
              <div key={key} style={{marginBottom:10}}>
                <label style={S.lbl}>{lbl}</label>
                <input type={type} style={S.inp} value={clientEdit[key]||""} onChange={e=>setClientEdit(p=>({...p,[key]:e.target.value}))}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div>
                <label style={S.lbl}>Discount Echipamente %</label>
                <input type="number" style={S.inp} value={clientEdit.discountEchip||""} onChange={e=>setClientEdit(p=>({...p,discountEchip:parseFloat(e.target.value)||0}))} placeholder="0"/>
              </div>
              <div>
                <label style={S.lbl}>Discount Manoperă %</label>
                <input type="number" style={S.inp} value={clientEdit.discountManop||""} onChange={e=>setClientEdit(p=>({...p,discountManop:parseFloat(e.target.value)||0}))} placeholder="0"/>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>saveClient(clientEdit)} style={{...S.btn("#4ade80","#111"),flex:1}}>Salvează</button>
              <button onClick={()=>setClientEdit(null)} style={{...S.btnO("#666"),flex:1}}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ── LIST VIEW ──────────────────────────────────────────════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  if(view==="list") return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700,color:"#e8e8e6"}}>Devize & Oferte</div>
        <button onClick={newDeviz} style={S.btn("#4ade80","#111")}>+ Deviz nou</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        <button onClick={()=>setView("catalog")} style={S.btnO("#7eb8f7")}>📦 Catalog</button>
        <button onClick={()=>setView("clienti")} style={S.btnO("#7eb8f7")}>👥 Clienți ({clienti.length})</button>
      </div>

      {devize.length===0&&(
        <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <div style={{fontSize:14}}>Niciun deviz salvat</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {devize.map(d=>{
          const z=calcZile(d.dateStart,d.dateEnd); const m2=getMultiplier(z);
          const tE=(d.echipamente||[]).reduce((s,r)=>s+(parseFloat(r.pret||r.pretBaza||0)*parseFloat(r.cantitate||1)*z*m2),0);
          const tM=(d.manopera||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.persoane||1)*z),0);
          const tT=(d.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||1)),0);
          const dE=parseFloat(d.discountEchip||0),dM=parseFloat(d.discountManop||0);
          const tot=(tE*(1-dE/100)+tM*(1-dM/100)+tT)*1.21;
          const sColors={draft:["#2a2000","#f59e0b"],sent:["#1e3a5f","#7eb8f7"],approved:["#1a2e1a","#4ade80"]};
          const sLabels={draft:"Draft",sent:"Trimis",approved:"Aprobat"};
          const [sbg,sc]=sColors[d.status||"draft"];
          return (
            <div key={d.id} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#e8e8e6"}}>{d.client?.nume||d.beneficiar||"Fără beneficiar"}</div>
                  <div style={{fontSize:12,color:"#555",marginTop:1}}>{d.eveniment||""}{d.locatie?` · ${d.locatie}`:""}</div>
                  {d.dateStart&&<div style={{fontSize:11,color:"#555",marginTop:1}}>📅 {new Date(d.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short",year:"numeric"})}{d.dateEnd&&d.dateEnd!==d.dateStart?" → "+new Date(d.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"}):""}</div>}
                </div>
                <span style={{fontSize:10,background:sbg,color:sc,padding:"2px 8px",borderRadius:20,fontWeight:600,marginLeft:8}}>{sLabels[d.status||"draft"]}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
                <div style={{fontSize:18,fontWeight:700,color:"#4ade80"}}>{fmtEUR(tot)} EUR</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{exportDevizPDF(d);}}
                    style={S.btnO("#888")}>"📄"</button>
                  <button onClick={()=>{setCurrent({...d});setView("edit");}} style={S.btnO("#7eb8f7")}>✏️ Edit</button>
                  <button onClick={()=>deleteDeviz(d.id)} style={S.btnO("#ef4444")}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm delete modal */}
      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#1a1a1a",borderRadius:16,padding:24,width:"100%",maxWidth:320,border:"1px solid #5a2020",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontSize:15,fontWeight:600,color:"#e8e8e6",marginBottom:8}}>Ștergi devizul?</div>
            <div style={{fontSize:13,color:"#888",marginBottom:20}}>Această acțiune nu poate fi anulată.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #333",background:"transparent",color:"#888",fontSize:14,cursor:"pointer"}}>Anulează</button>
              <button onClick={confirmDeleteDeviz} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"#ef4444",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Șterge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ── EDIT VIEW ──────────────────────────────────────════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{padding:"16px 16px 0"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:0}}>‹ Înapoi</button>
        <div style={{flex:1,fontSize:14,fontWeight:700,color:"#e8e8e6"}}>{current.client?.nume||current.beneficiar||"Deviz nou"}</div>
        <select value={current.status||"draft"} onChange={e=>setCurrent(p=>({...p,status:e.target.value}))}
          style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:12}}>
          <option value="draft">Draft</option>
          <option value="sent">Trimis</option>
          <option value="approved">Aprobat</option>
        </select>
        <button onClick={()=>{exportDevizPDF(current);}}
          style={S.btnO("#888")}>"📄 PDF"</button>
        <button onClick={saveDeviz} disabled={saving} style={S.btn("#4ade80","#111")}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

      {/* Client selector */}
      <div style={S.sec}>
        <div style={S.secT}>👤 Client</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          {clienti.map(c=>(
            <button key={c.id} onClick={()=>selectClient(c)}
              style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${current.client?.id===c.id?"#4ade80":"#2a2a2a"}`,background:current.client?.id===c.id?"#1a2e1a":"transparent",color:current.client?.id===c.id?"#4ade80":"#888",fontSize:12,cursor:"pointer"}}>
              {c.nume}
            </button>
          ))}
          <button onClick={()=>setView("clienti")} style={{...S.btnO("#555"),fontSize:11}}>+ Client nou</button>
        </div>
        {current.client&&(
          <div style={{fontSize:11,color:"#555"}}>
            Discount: Echip -{current.client.discountEchip||0}% · Manop -{current.client.discountManop||0}%
            <button onClick={()=>setCurrent(p=>({...p,client:null,beneficiar:"",discountEchip:0,discountManop:0}))} style={{marginLeft:8,background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:11}}>✕ Șterge selecția</button>
          </div>
        )}
      </div>

      {/* Info + Calendar */}
      <div style={S.sec}>
        <div style={S.secT}>📋 Informații ofertă</div>

        {/* Calendar events */}
        {allCalEvents.length>0&&(
          <div style={{marginBottom:14}}>
            <label style={S.lbl}>Selectează din Google Calendar (opțional)</label>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:140,overflowY:"auto"}}>
              {allCalEvents.slice(0,20).map(ev=>{
                const sel=current.calEventId===(ev.originalId||ev.id);
                return (
                  <div key={ev.id} onClick={()=>selectCalendarEvent(ev)}
                    style={{padding:"8px 12px",borderRadius:9,border:`1px solid ${sel?"#4ade80":"#222"}`,background:sel?"#1a2e1a":"#111",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,color:sel?"#86efac":"#ccc",fontWeight:sel?500:400}}>{ev.title}</div>
                      {ev.location&&<div style={{fontSize:11,color:"#555"}}>📍 {ev.location}</div>}
                    </div>
                    <div style={{fontSize:11,color:"#555",flexShrink:0,marginLeft:8}}>
                      {new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <label style={S.lbl}>Beneficiar</label>
            <input style={S.inp} value={current.beneficiar||current.client?.nume||""} onChange={e=>setCurrent(p=>({...p,beneficiar:e.target.value}))} placeholder="Numele clientului"/>
          </div>
          <div>
            <label style={S.lbl}>Eveniment</label>
            <input style={S.inp} value={current.eveniment} onChange={e=>setCurrent(p=>({...p,eveniment:e.target.value}))} placeholder="Tip eveniment"/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={S.lbl}>Locație</label>
            <input style={S.inp} value={current.locatie} onChange={e=>setCurrent(p=>({...p,locatie:e.target.value}))} placeholder="Locația evenimentului"/>
          </div>
          <div>
            <label style={S.lbl}>Data început</label>
            <input type="date" style={S.inp} value={current.dateStart||""} onChange={e=>setCurrent(p=>({...p,dateStart:e.target.value}))}/>
          </div>
          <div>
            <label style={S.lbl}>Data sfârșit</label>
            <input type="date" style={S.inp} value={current.dateEnd||""} onChange={e=>setCurrent(p=>({...p,dateEnd:e.target.value}))}/>
          </div>
        </div>

        {/* Zile + multiplicator indicator */}
        {current.dateStart&&(
          <div style={{padding:"8px 12px",background:"#111",borderRadius:9,border:"1px solid #1e3a5f",fontSize:12,color:"#7eb8f7"}}>
            📅 <strong>{nrZile} {nrZile===1?"zi":"zile"}</strong> → multiplicator <strong>{mult}x</strong> aplicat la echipamente
            {nrZile===2&&" (2 zile = 1.5x)"}{nrZile===3&&" (3 zile = 2x)"}{nrZile>=7&&" (1 săptămână = 3.5x)"}
          </div>
        )}
      </div>

      {/* ECHIPAMENTE */}
      <div style={S.sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={S.secT}>🖥️ Echipamente</div>
          <button onClick={()=>setShowCat(showCat==="echip"?null:"echip")} style={S.btnO("#7eb8f7")}>📦 Catalog</button>
        </div>
        {showCat==="echip"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            {(cat.echipamente||[]).map(item=>(
              <div key={item.id} onClick={()=>addFromCatalog("echip",item)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",marginBottom:6,border:"1px solid #222"}}>
                <span style={{fontSize:13,color:"#ccc"}}>{item.denumire}</span>
                <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR/{item.unitate}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"2fr 55px 65px 55px 75px 20px",gap:4,marginBottom:4}}>
          {["Denumire","Cant.","Preț/U","Zile","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase"}}>{h}</div>
          ))}
        </div>
        {current.echipamente.map((r,i)=>{
          const p=parseFloat(r.pret||r.pretBaza||0);
          const c2=parseFloat(r.cantitate||1);
          const tot=p*c2*nrZile*mult;
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 55px 65px 55px 75px 20px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.inp} value={r.denumire} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],denumire:e.target.value}; return {...p2,echipamente:rows};})} placeholder="Denumire"/>
              <input style={S.numI} type="number" step="0.01" min="0" value={r.cantitate} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],cantitate:e.target.value}; return {...p2,echipamente:rows};})} placeholder="1"/>
              <input style={S.numI} type="number" step="0.01" min="0" value={r.pret||r.pretBaza||""} onChange={e=>setCurrent(p2=>{ const rows=[...p2.echipamente]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p2,echipamente:rows};})} placeholder="0"/>
              <div style={{...S.numI,background:"transparent",border:"none",color:"#555",fontSize:11,textAlign:"center"}}>{nrZile}z·{mult}x</div>
              <div style={{...S.numI,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p2=>({...p2,echipamente:p2.echipamente.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,echipamente:[...p.echipamente,emptyEchip()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:12,color:"#555"}}>Total Echipamente (cu multiplicator {mult}x)</span>
          <span style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totE)} EUR</span>
        </div>
      </div>

      {/* MANOPERA */}
      <div style={S.sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={S.secT}>👷 Manoperă</div>
          <button onClick={()=>setShowCat(showCat==="manop"?null:"manop")} style={S.btnO("#7eb8f7")}>📦 Catalog</button>
        </div>
        {showCat==="manop"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            {(cat.manopera||[]).map(item=>(
              <div key={item.id} onClick={()=>addFromCatalog("manop",item)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",marginBottom:6,border:"1px solid #222"}}>
                <span style={{fontSize:13,color:"#ccc"}}>{item.specialitate}</span>
                <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR/zi</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"2fr 55px 65px 75px 20px",gap:4,marginBottom:4}}>
          {["Specialitate","Pers.","Preț/zi","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase"}}>{h}</div>
          ))}
        </div>
        {current.manopera.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.persoane||1)*nrZile;
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 55px 65px 75px 20px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.inp} value={r.specialitate} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],specialitate:e.target.value}; return {...p,manopera:rows};})} placeholder="Specialitate"/>
              <input style={S.numI} type="number" step="0.5" min="0" value={r.persoane} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],persoane:e.target.value}; return {...p,manopera:rows};})} placeholder="1"/>
              <input style={S.numI} type="number" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.manopera]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,manopera:rows};})} placeholder="0"/>
              <div style={{...S.numI,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,manopera:p.manopera.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,manopera:[...p.manopera,emptyManop()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:12,color:"#555"}}>Total Manoperă ({nrZile} zile)</span>
          <span style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totM)} EUR</span>
        </div>
      </div>

      {/* TRANSPORT */}
      <div style={S.sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={S.secT}>🚚 Transport</div>
          <button onClick={()=>setShowCat(showCat==="transp"?null:"transp")} style={S.btnO("#7eb8f7")}>📦 Catalog</button>
        </div>
        {showCat==="transp"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            {(cat.transport||[]).map(item=>(
              <div key={item.id} onClick={()=>addFromCatalog("transp",item)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",marginBottom:6,border:"1px solid #222"}}>
                <span style={{fontSize:13,color:"#ccc"}}>{item.vehicul}</span>
                <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR</span>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"2fr 65px 55px 75px 20px",gap:4,marginBottom:4}}>
          {["Vehicul","Preț EUR","Nr.","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase"}}>{h}</div>
          ))}
        </div>
        {current.transport.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.nr||1);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 65px 55px 75px 20px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.inp} value={r.vehicul} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],vehicul:e.target.value}; return {...p,transport:rows};})} placeholder="Tip vehicul"/>
              <input style={S.numI} type="number" value={r.pret||""} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],pret:parseFloat(e.target.value)||0}; return {...p,transport:rows};})} placeholder="0"/>
              <input style={S.numI} type="number" step="0.5" min="0" value={r.nr} onChange={e=>setCurrent(p=>{ const rows=[...p.transport]; rows[i]={...rows[i],nr:e.target.value}; return {...p,transport:rows};})} placeholder="1"/>
              <div style={{...S.numI,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>setCurrent(p=>({...p,transport:p.transport.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={()=>setCurrent(p=>({...p,transport:[...p.transport,emptyTransport()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",fontSize:12,marginTop:4}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:12,color:"#555"}}>Total Transport</span>
          <span style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totT)} EUR</span>
        </div>
      </div>

      {/* DISCOUNT + TOTAL */}
      <div style={S.sec}>
        <div style={S.secT}>💰 Discount & Total</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div>
            <label style={S.lbl}>Discount Echipamente %</label>
            <input type="number" style={S.inp} value={current.discountEchip||""} onChange={e=>setCurrent(p=>({...p,discountEchip:parseFloat(e.target.value)||0}))} placeholder="0"/>
            {discE>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>-{fmtEUR(totE*discE/100)} EUR</div>}
          </div>
          <div>
            <label style={S.lbl}>Discount Manoperă %</label>
            <input type="number" style={S.inp} value={current.discountManop||""} onChange={e=>setCurrent(p=>({...p,discountManop:parseFloat(e.target.value)||0}))} placeholder="0"/>
            {discM>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>-{fmtEUR(totM*discM/100)} EUR</div>}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#888"}}>
            <span>Subtotal</span><span>{fmtEUR(subtotal)} EUR</span>
          </div>
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#ef4444"}}>
            <span>Discount total</span><span>-{fmtEUR(subtotal-afterDisc)} EUR</span>
          </div>}
          {(discE>0||discM>0)&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#888"}}>
            <span>Valoare după discount</span><span>{fmtEUR(afterDisc)} EUR</span>
          </div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#888"}}>
            <span>TVA 21%</span><span>{fmtEUR(tva)} EUR</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:"1px solid #222",marginTop:4}}>
            <span style={{fontSize:15,fontWeight:700,color:"#e8e8e6"}}>TOTAL GENERAL</span>
            <span style={{fontSize:24,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totalGen)} EUR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
