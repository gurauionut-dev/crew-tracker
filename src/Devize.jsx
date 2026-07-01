import { useState, useEffect } from "react";
import { db } from "./firebase";
import { QUERROUND_B64 } from "./querround_font";
import {
  collection, doc, setDoc, onSnapshot,
  deleteDoc, serverTimestamp
} from "firebase/firestore";

// ─── CATALOG PREDEFINIT ───────────────────────────────────────────────────────

const CATALOG_ECHIPAMENTE = [
  { denumire: "Ecran LED 2.6 4/2.5m",        unitate: "mp",   pret: 75  },
  { denumire: "Ecran LED 3.9 4/2.5m",        unitate: "mp",   pret: 60  },
  { denumire: "Ecran LED 5.6 outdoor",        unitate: "mp",   pret: 45  },
  { denumire: "Procesor Ecran VX1000",        unitate: "item", pret: 25  },
  { denumire: "Procesor Ecran NovaStar",      unitate: "item", pret: 30  },
  { denumire: "Mixer Kit Video + Laptop",     unitate: "item", pret: 100 },
  { denumire: "Grila Eurotruss FD34 2m",      unitate: "ml",   pret: 10  },
  { denumire: "Cablu semnal 20m",             unitate: "item", pret: 5   },
  { denumire: "Distributie semnal 1:4",       unitate: "item", pret: 15  },
  { denumire: "UPS 2kVA",                     unitate: "item", pret: 20  },
];

const CATALOG_MANOPERA = [
  { specialitate: "Montaj-Demontaj LED TECH", pret: 200 },
  { specialitate: "Operator LED",             pret: 250 },
  { specialitate: "Tehnician Audio-Video",    pret: 180 },
  { specialitate: "Rigging specialist",       pret: 220 },
];

const CATALOG_TRANSPORT = [
  { vehicul: "Duba 3.5T",   pret: 200 },
  { vehicul: "TIR 7.5T",    pret: 400 },
  { vehicul: "Auto personal", pret: 50 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function ro(s) {
  if (!s) return "";
  return String(s)
    .replace(/ș/g,"s").replace(/Ș/g,"S").replace(/ț/g,"t").replace(/Ț/g,"T")
    .replace(/ă/g,"a").replace(/Ă/g,"A").replace(/î/g,"i").replace(/Î/g,"I")
    .replace(/â/g,"a").replace(/Â/g,"A");
}
function fmtEUR(n) { return Number(n||0).toFixed(2); }

function emptyEchip()    { return { id:uid(), denumire:"", unitate:"", pret:"", zile:"", total:0 }; }
function emptyManopera() { return { id:uid(), specialitate:"", unitate:"", pret:"", zile:"", total:0 }; }
function emptyTransport(){ return { id:uid(), vehicul:"", unitate:"", pret:"", nr:"", total:0 }; }

function calcRow(r, isTransport=false) {
  const p = parseFloat(r.pret)||0;
  const u = parseFloat(r.unitate)||0;
  const mult = parseFloat(isTransport ? r.nr : r.zile)||0;
  return p * u * mult;
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────

async function exportDevizPDF(deviz) {
  if (!window.jspdf) {
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  // Register Querround font
  if (!window._querroundRegistered) {
    const _tmp = new jsPDF();
    _tmp.addFileToVFS("Querround.ttf", QUERROUND_B64);
    _tmp.addFont("Querround.ttf", "Querround", "normal");
    window._querroundRegistered = true;
  }
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  doc.addFileToVFS("Querround.ttf", QUERROUND_B64);
  doc.addFont("Querround.ttf", "Querround", "normal");
  const pw=210, m=14, cw=pw-m*2;
  let y=0;

  const C = {
    dark:[15,15,15], mid:[50,50,50], gray:[120,120,120], light:[200,200,200],
    white:[255,255,255], blue:[0,102,204], blueL:[230,240,255],
    green:[29,158,117], row1:[255,255,255], row2:[245,247,250],
  };

  function hline(yy, col=C.light) { doc.setDrawColor(...col); doc.setLineWidth(0.3); doc.line(m,yy,m+cw,yy); }
  function checkY(n=10) { if(y+n>275){ doc.addPage(); y=16; footer(); } }
  function footer() {
    doc.setFontSize(7.5); doc.setTextColor(...C.gray); doc.setFont("helvetica","normal");
    doc.text("office@igvision.ro   |   0732302810   |   igvision.ro",pw/2,289,{align:"center"});
    doc.text("#ledscreen #ledscreenrental #igvision #events",pw/2,293,{align:"center"});
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Top blue bar
  doc.setFillColor(...C.blue); doc.rect(0,0,pw,18,"F");
  // Logo — Querround font
  doc.setFont("Querround","normal");
  doc.setFontSize(16); doc.setTextColor(...C.white);
  doc.text("ig vision", m, 12);
  const lw = doc.getTextWidth("ig vision");
  doc.setFont("helvetica","normal");
  doc.setFontSize(6); doc.setTextColor(...C.light);
  doc.text("TM", m + lw + 0.5, 7);
  // RENT badge
  doc.setFontSize(20); doc.setTextColor(...C.white); doc.setFont("helvetica","bold");
  doc.text("RENT", pw/2, 13, {align:"center"});

  y=24;

  // OFERTA DE PRET title
  doc.setFontSize(16); doc.setTextColor(...C.dark); doc.setFont("helvetica","bold");
  doc.text(ro("OFERTA DE PRET"),m,y); y+=8;

  // Info block
  const infoLabels = ["BENEFICIAR:","EVENIMENT:","LOCATIE:","PRODUCTION MANAGER:"];
  const infoValues = [
    ro(deviz.beneficiar||""),
    ro(deviz.eveniment||""),
    ro(deviz.locatie||""),
    ro("IONUT GURAU  0732 302 813"),
  ];
  infoLabels.forEach((lbl,i)=>{
    doc.setFontSize(9); doc.setTextColor(...C.dark); doc.setFont("helvetica","bold");
    doc.text(lbl,m,y);
    doc.setFont("helvetica","normal");
    doc.text(infoValues[i], m+52, y);
    y+=6;
  });
  y+=4;

  // ── SECTION TABLE ─────────────────────────────────────────────────────────
  function sectionHeader(title) {
    checkY(16);
    doc.setFillColor(...C.blue); doc.rect(m,y,cw,8,"F");
    doc.setFontSize(10); doc.setTextColor(...C.white); doc.setFont("helvetica","bold");
    doc.text(ro(title),pw/2,y+5.5,{align:"center"});
    y+=8;
  }

  function tableHeader(cols) {
    doc.setFillColor(...C.blueL); doc.rect(m,y,cw,7,"F");
    doc.setFontSize(7.5); doc.setTextColor(...C.mid); doc.setFont("helvetica","bold");
    let cx=m;
    cols.forEach(col=>{
      doc.text(ro(col.label), cx + col.w/2, y+5, {align:"center"});
      cx+=col.w;
    });
    y+=7;
  }

  function tableRow(cols, values, rowIdx) {
    const rowH=8;
    checkY(rowH+1);
    doc.setFillColor(...(rowIdx%2===0?C.row1:C.row2));
    doc.rect(m,y,cw,rowH,"F");
    doc.setFontSize(8); doc.setTextColor(...C.dark); doc.setFont("helvetica","normal");
    let cx=m;
    cols.forEach((col,i)=>{
      const val=ro(String(values[i]||""));
      const align=col.align||"center";
      if(align==="left") doc.text(val,cx+2,y+5.5);
      else if(align==="right") doc.text(val,cx+col.w-2,y+5.5,{align:"right"});
      else doc.text(val,cx+col.w/2,y+5.5,{align:"center"});
      cx+=col.w;
    });
    hline(y+rowH);
    y+=rowH;
  }

  function totalRow(label, value) {
    doc.setFillColor(...C.blueL); doc.rect(m,y,cw,8,"F");
    doc.setFontSize(9); doc.setTextColor(...C.mid); doc.setFont("helvetica","bold");
    doc.text(ro(label),m+cw-40,y+5.5,{align:"right"});
    doc.setTextColor(...C.dark);
    doc.text(ro(String(value)),m+cw-2,y+5.5,{align:"right"});
    y+=8;
  }

  // ── ECHIPAMENTE ──────────────────────────────────────────────────────────
  const echipRows = (deviz.echipamente||[]).filter(r=>r.denumire);
  if(echipRows.length>0){
    sectionHeader("ECHIPAMENTE");
    const echipCols=[
      {label:"Nr.Crt.",w:14},{label:"Denumire echipament",w:68,align:"left"},
      {label:"Unitate\n(mp/ml/item)",w:22},{label:"Pret (EUR)/\nUnitate",w:22},
      {label:"Nr. Zile",w:18},{label:"Pret total\n(EUR)",w:22}
    ];
    tableHeader(echipCols);
    let totalEchip=0;
    echipRows.forEach((r,i)=>{
      const tot=calcRow(r);
      totalEchip+=tot;
      tableRow(echipCols,[i+1,r.denumire,r.unitate,fmtEUR(r.pret),r.zile,fmtEUR(tot)],i);
    });
    y+=2;
    totalRow("Total",fmtEUR(totalEchip));
    y+=6;
  }

  // ── MANOPERA ─────────────────────────────────────────────────────────────
  const manopRows = (deviz.manopera||[]).filter(r=>r.specialitate);
  if(manopRows.length>0){
    sectionHeader("MANOPERA");
    const manopCols=[
      {label:"Nr.Crt.",w:14},{label:"Specialitatea",w:68,align:"left"},
      {label:"Unitate\n(pers.)",w:22},{label:"Pret (EUR)/\nUnitate",w:22},
      {label:"Nr. Zile",w:18},{label:"Pret total\n(EUR)",w:22}
    ];
    tableHeader(manopCols);
    let totalManop=0;
    manopRows.forEach((r,i)=>{
      const tot=calcRow(r);
      totalManop+=tot;
      tableRow(manopCols,[i+1,r.specialitate,r.unitate,fmtEUR(r.pret),r.zile,fmtEUR(tot)],i);
    });
    y+=2;
    totalRow("Total",fmtEUR(totalManop));
    y+=6;
  }

  // ── TRANSPORT ────────────────────────────────────────────────────────────
  const transpRows = (deviz.transport||[]).filter(r=>r.vehicul);
  if(transpRows.length>0){
    sectionHeader("TRANSPORT");
    const transpCols=[
      {label:"Nr.Crt.",w:14},{label:"Tip vehicul",w:68,align:"left"},
      {label:"Unitate\n(item/km)",w:22},{label:"Pret (EUR)/\nUnitate",w:22},
      {label:"Nr.\nVehicule",w:18},{label:"Pret total\n(EUR)",w:22}
    ];
    tableHeader(transpCols);
    let totalTransp=0;
    transpRows.forEach((r,i)=>{
      const tot=parseFloat(r.pret||0)*parseFloat(r.nr||0);
      totalTransp+=tot;
      tableRow(transpCols,[i+1,r.vehicul,r.unitate||"",fmtEUR(r.pret),r.nr,fmtEUR(tot)],i);
    });
    y+=2;
    totalRow("Total",fmtEUR(totalTransp));
    y+=6;
  }

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const totEchip  = (deviz.echipamente||[]).filter(r=>r.denumire).reduce((s,r)=>s+calcRow(r),0);
  const totManop  = (deviz.manopera||[]).filter(r=>r.specialitate).reduce((s,r)=>s+calcRow(r),0);
  const totTransp = (deviz.transport||[]).filter(r=>r.vehicul).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||0)),0);
  const valTotal  = totEchip+totManop+totTransp;
  const tva       = valTotal*0.21;
  const totalGen  = valTotal+tva;

  checkY(30);
  y+=2;
  // Valoare totala
  doc.setFillColor(240,240,240); doc.rect(m,y,cw,8,"F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...C.mid);
  doc.text("VALOARE TOTALA",pw/2,y+5.5,{align:"center"});
  doc.setTextColor(...C.dark);
  doc.text(fmtEUR(valTotal)+" EUR",m+cw-2,y+5.5,{align:"right"});
  y+=8;

  doc.setFillColor(240,240,240); doc.rect(m,y,cw,8,"F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...C.mid);
  doc.text("TVA 21%",pw/2,y+5.5,{align:"center"});
  doc.setTextColor(...C.dark);
  doc.text(fmtEUR(tva)+" EUR",m+cw-2,y+5.5,{align:"right"});
  y+=8;

  doc.setFillColor(...C.blue); doc.rect(m,y,cw,10,"F");
  doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.setTextColor(...C.white);
  doc.text("TOTAL GENERAL",pw/2,y+7,{align:"center"});
  doc.text(fmtEUR(totalGen)+" EUR",m+cw-2,y+7,{align:"right"});
  y+=14;

  footer();

  const fname = "deviz-"+ro(deviz.beneficiar||"igvision").replace(/\s+/g,"-").toLowerCase()+"-"+Date.now()+".pdf";
  doc.save(fname);
}

// ─── MAIN DEVIZE COMPONENT ────────────────────────────────────────────────────

export default function DevizeView({ user }) {
  const [devize,      setDevize]      = useState([]);
  const [view,        setView]        = useState("list"); // "list" | "edit" | "new"
  const [current,     setCurrent]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [showCatalog, setShowCatalog] = useState(null); // "echip"|"manop"|"transp"

  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"devize"), snap=>{
      const list = [];
      snap.forEach(d=>list.push({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
      setDevize(list);
    });
    return ()=>unsub();
  },[]);

  function newDeviz() {
    setCurrent({
      id: uid(),
      beneficiar:"", eveniment:"", locatie:"",
      status:"draft",
      echipamente: [emptyEchip()],
      manopera:    [emptyManopera()],
      transport:   [emptyTransport()],
    });
    setView("edit");
  }

  async function saveDeviz() {
    setSaving(true);
    try {
      await setDoc(doc(db,"devize",current.id), {
        ...current,
        updatedAt: serverTimestamp(),
        createdBy: user.id,
      });
      setView("list");
    } catch(e) { alert("Eroare la salvare: "+e.message); }
    setSaving(false);
  }

  async function deleteDeviz(id) {
    if (!confirm("Ștergi devizul?")) return;
    await deleteDoc(doc(db,"devize",id));
  }

  async function exportPDF(deviz) {
    setPdfLoading(deviz.id);
    try { await exportDevizPDF(deviz); }
    catch(e) { alert("Eroare PDF: "+e.message); }
    setPdfLoading(null);
  }

  // ── Recalculate totals ─────────────────────────────────────────────────────
  function updateEchip(idx, field, val) {
    const rows = [...current.echipamente];
    rows[idx] = { ...rows[idx], [field]: val };
    setCurrent({...current, echipamente: rows});
  }
  function updateManop(idx, field, val) {
    const rows = [...current.manopera];
    rows[idx] = { ...rows[idx], [field]: val };
    setCurrent({...current, manopera: rows});
  }
  function updateTransp(idx, field, val) {
    const rows = [...current.transport];
    rows[idx] = { ...rows[idx], [field]: val };
    setCurrent({...current, transport: rows});
  }
  function addEchip()   { setCurrent({...current, echipamente:[...current.echipamente,emptyEchip()]}); }
  function addManop()   { setCurrent({...current, manopera:[...current.manopera,emptyManopera()]}); }
  function addTransp()  { setCurrent({...current, transport:[...current.transport,emptyTransport()]}); }
  function removeEchip(idx) { setCurrent({...current, echipamente:current.echipamente.filter((_,i)=>i!==idx)}); }
  function removeManop(idx) { setCurrent({...current, manopera:current.manopera.filter((_,i)=>i!==idx)}); }
  function removeTransp(idx){ setCurrent({...current, transport:current.transport.filter((_,i)=>i!==idx)}); }

  const totEchip  = (current?.echipamente||[]).reduce((s,r)=>s+calcRow(r),0);
  const totManop  = (current?.manopera||[]).reduce((s,r)=>s+calcRow(r),0);
  const totTransp = (current?.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||0)),0);
  const valTotal  = totEchip+totManop+totTransp;
  const tva       = valTotal*0.21;
  const totalGen  = valTotal+tva;

  const S = {
    input: { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #2a2a2a", background:"#111", color:"#e8e8e6", fontSize:13, outline:"none", boxSizing:"border-box" },
    numInput: { width:"100%", padding:"8px 6px", borderRadius:8, border:"1px solid #2a2a2a", background:"#111", color:"#e8e8e6", fontSize:13, outline:"none", textAlign:"right", boxSizing:"border-box" },
    label: { fontSize:10, color:"#666", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4, display:"block" },
    section: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14, padding:16, marginBottom:14 },
    sectionTitle: { fontSize:13, fontWeight:700, color:"#7eb8f7", marginBottom:12, textTransform:"uppercase", letterSpacing:"0.05em" },
    total: { fontSize:12, color:"#555", textAlign:"right" },
    totalVal: { fontSize:13, fontWeight:700, color:"#4ade80", textAlign:"right" },
  };

  // ── LIST VIEW ───────────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:700,color:"#e8e8e6"}}>Devize & Oferte</div>
        <button onClick={newDeviz}
          style={{padding:"8px 16px",borderRadius:10,border:"none",background:"#7eb8f7",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          + Deviz nou
        </button>
      </div>

      {devize.length===0&&(
        <div style={{textAlign:"center",padding:"48px 0",color:"#444"}}>
          <div style={{fontSize:36,marginBottom:12}}>📋</div>
          <div style={{fontSize:14}}>Niciun deviz salvat</div>
          <div style={{fontSize:12,color:"#555",marginTop:6}}>Apasă "+ Deviz nou" pentru a începe</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {devize.map(d=>{
          const totE=(d.echipamente||[]).reduce((s,r)=>s+calcRow(r),0);
          const totM=(d.manopera||[]).reduce((s,r)=>s+calcRow(r),0);
          const totT=(d.transport||[]).reduce((s,r)=>s+(parseFloat(r.pret||0)*parseFloat(r.nr||0)),0);
          const tot=(totE+totM+totT)*1.21;
          const statusColors={draft:["#2a2000","#f59e0b"],sent:["#1e3a5f","#7eb8f7"],approved:["#1a2e1a","#4ade80"]};
          const statusLabels={draft:"Draft",sent:"Trimis",approved:"Aprobat"};
          const [sbg,sc]=statusColors[d.status||"draft"];
          return (
            <div key={d.id} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#e8e8e6",marginBottom:2}}>{d.beneficiar||"Fără beneficiar"}</div>
                  <div style={{fontSize:12,color:"#555"}}>{d.eveniment||""}{d.locatie?` · ${d.locatie}`:""}</div>
                </div>
                <span style={{fontSize:10,background:sbg,color:sc,padding:"2px 8px",borderRadius:20,fontWeight:600,marginLeft:8,flexShrink:0}}>
                  {statusLabels[d.status||"draft"]}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#4ade80"}}>{fmtEUR(tot)} EUR</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>exportPDF(d)} disabled={pdfLoading===d.id}
                    style={{fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px solid #2a2a2a",background:"transparent",color:"#888",cursor:"pointer"}}>
                    {pdfLoading===d.id?"⏳":"📄"} PDF
                  </button>
                  <button onClick={()=>{setCurrent({...d});setView("edit");}}
                    style={{fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px solid #378ADD",background:"transparent",color:"#7eb8f7",cursor:"pointer"}}>
                    ✏️ Edit
                  </button>
                  <button onClick={()=>deleteDeviz(d.id)}
                    style={{fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px solid #5a2020",background:"transparent",color:"#f87171",cursor:"pointer"}}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── EDIT VIEW ───────────────────────────────────────────────────────────────
  return (
    <div style={{padding:"16px 16px 0"}}>
      {/* Back + actions */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,padding:0}}>
          ‹ Înapoi
        </button>
        <div style={{flex:1,fontSize:15,fontWeight:700,color:"#e8e8e6"}}>
          {current.beneficiar||"Deviz nou"}
        </div>
        <select value={current.status||"draft"} onChange={e=>setCurrent({...current,status:e.target.value})}
          style={{padding:"6px 10px",borderRadius:8,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:12,cursor:"pointer"}}>
          <option value="draft">Draft</option>
          <option value="sent">Trimis</option>
          <option value="approved">Aprobat</option>
        </select>
        <button onClick={()=>exportPDF(current)} disabled={pdfLoading==="current"}
          style={{padding:"7px 14px",borderRadius:8,border:"1px solid #2a2a2a",background:"transparent",color:"#888",fontSize:12,cursor:"pointer"}}>
          📄 PDF
        </button>
        <button onClick={saveDeviz} disabled={saving}
          style={{padding:"7px 16px",borderRadius:8,border:"none",background:"#4ade80",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {saving?"Se salvează...":"💾 Salvează"}
        </button>
      </div>

      {/* Header info */}
      <div style={S.section}>
        <div style={S.sectionTitle}>📋 Informații ofertă</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <label style={S.label}>Beneficiar</label>
            <input style={S.input} value={current.beneficiar} onChange={e=>setCurrent({...current,beneficiar:e.target.value})} placeholder="Numele clientului"/>
          </div>
          <div>
            <label style={S.label}>Eveniment</label>
            <input style={S.input} value={current.eveniment} onChange={e=>setCurrent({...current,eveniment:e.target.value})} placeholder="Tip eveniment"/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={S.label}>Locație</label>
            <input style={S.input} value={current.locatie} onChange={e=>setCurrent({...current,locatie:e.target.value})} placeholder="Locația evenimentului"/>
          </div>
        </div>
      </div>

      {/* ECHIPAMENTE */}
      <div style={S.section}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={S.sectionTitle}>🖥️ Echipamente</div>
          <button onClick={()=>setShowCatalog(showCatalog==="echip"?null:"echip")}
            style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #378ADD",background:"transparent",color:"#7eb8f7",cursor:"pointer"}}>
            📦 Catalog
          </button>
        </div>

        {showCatalog==="echip"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            <div style={{fontSize:11,color:"#7eb8f7",marginBottom:8,fontWeight:600}}>Selectează din catalog:</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {CATALOG_ECHIPAMENTE.map((item,i)=>(
                <div key={i} onClick={()=>{
                  const newRow={id:uid(),denumire:item.denumire,unitate:item.unitate,pret:item.pret,zile:1,total:item.pret};
                  setCurrent({...current,echipamente:[...current.echipamente,newRow]});
                  setShowCatalog(null);
                }} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",border:"1px solid #222"}}>
                  <span style={{fontSize:13,color:"#ccc"}}>{item.denumire}</span>
                  <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR/{item.unitate}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Column headers */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:4}}>
          {["Denumire","Unitate","Preț/U","Zile","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",textAlign:h==="Total"||h==="Preț/U"?"right":"left"}}>{h}</div>
          ))}
        </div>

        {current.echipamente.map((r,i)=>{
          const tot=calcRow(r);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.input} value={r.denumire} onChange={e=>updateEchip(i,"denumire",e.target.value)} placeholder="Denumire echipament"/>
              <input style={S.numInput} value={r.unitate} onChange={e=>updateEchip(i,"unitate",e.target.value)} placeholder="mp"/>
              <input style={S.numInput} type="number" value={r.pret} onChange={e=>updateEchip(i,"pret",e.target.value)} placeholder="0"/>
              <input style={S.numInput} type="number" value={r.zile} onChange={e=>updateEchip(i,"zile",e.target.value)} placeholder="1"/>
              <div style={{...S.numInput,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>removeEchip(i)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={addEchip} style={{marginTop:4,fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",width:"100%"}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:13,color:"#888",marginRight:12}}>Total Echipamente:</span>
          <span style={{fontSize:15,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totEchip)} EUR</span>
        </div>
      </div>

      {/* MANOPERA */}
      <div style={S.section}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={S.sectionTitle}>👷 Manoperă</div>
          <button onClick={()=>setShowCatalog(showCatalog==="manop"?null:"manop")}
            style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #378ADD",background:"transparent",color:"#7eb8f7",cursor:"pointer"}}>
            📦 Catalog
          </button>
        </div>

        {showCatalog==="manop"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            <div style={{fontSize:11,color:"#7eb8f7",marginBottom:8,fontWeight:600}}>Selectează din catalog:</div>
            {CATALOG_MANOPERA.map((item,i)=>(
              <div key={i} onClick={()=>{
                const newRow={id:uid(),specialitate:item.specialitate,unitate:"1",pret:item.pret,zile:1};
                setCurrent({...current,manopera:[...current.manopera,newRow]});
                setShowCatalog(null);
              }} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",border:"1px solid #222",marginBottom:6}}>
                <span style={{fontSize:13,color:"#ccc"}}>{item.specialitate}</span>
                <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR/zi</span>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:4}}>
          {["Specialitate","Pers.","Preț/U","Zile","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>{h}</div>
          ))}
        </div>
        {current.manopera.map((r,i)=>{
          const tot=calcRow(r);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.input} value={r.specialitate} onChange={e=>updateManop(i,"specialitate",e.target.value)} placeholder="Specialitate"/>
              <input style={S.numInput} type="number" value={r.unitate} onChange={e=>updateManop(i,"unitate",e.target.value)} placeholder="1"/>
              <input style={S.numInput} type="number" value={r.pret} onChange={e=>updateManop(i,"pret",e.target.value)} placeholder="0"/>
              <input style={S.numInput} type="number" value={r.zile} onChange={e=>updateManop(i,"zile",e.target.value)} placeholder="1"/>
              <div style={{...S.numInput,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>removeManop(i)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={addManop} style={{marginTop:4,fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",width:"100%"}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:13,color:"#888",marginRight:12}}>Total Manoperă:</span>
          <span style={{fontSize:15,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totManop)} EUR</span>
        </div>
      </div>

      {/* TRANSPORT */}
      <div style={S.section}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={S.sectionTitle}>🚚 Transport</div>
          <button onClick={()=>setShowCatalog(showCatalog==="transp"?null:"transp")}
            style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #378ADD",background:"transparent",color:"#7eb8f7",cursor:"pointer"}}>
            📦 Catalog
          </button>
        </div>

        {showCatalog==="transp"&&(
          <div style={{marginBottom:12,background:"#111",borderRadius:10,padding:10,border:"1px solid #1e3a5f"}}>
            <div style={{fontSize:11,color:"#7eb8f7",marginBottom:8,fontWeight:600}}>Selectează din catalog:</div>
            {CATALOG_TRANSPORT.map((item,i)=>(
              <div key={i} onClick={()=>{
                const newRow={id:uid(),vehicul:item.vehicul,unitate:"item",pret:item.pret,nr:1};
                setCurrent({...current,transport:[...current.transport,newRow]});
                setShowCatalog(null);
              }} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,background:"#1a1a1a",cursor:"pointer",border:"1px solid #222",marginBottom:6}}>
                <span style={{fontSize:13,color:"#ccc"}}>{item.vehicul}</span>
                <span style={{fontSize:12,color:"#4ade80",fontWeight:600}}>{item.pret} EUR</span>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:4}}>
          {["Vehicul","Unitate","Preț","Nr.","Total",""].map(h=>(
            <div key={h} style={{fontSize:10,color:"#555",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>{h}</div>
          ))}
        </div>
        {current.transport.map((r,i)=>{
          const tot=parseFloat(r.pret||0)*parseFloat(r.nr||0);
          return (
            <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 70px 60px 80px 24px",gap:4,marginBottom:6,alignItems:"center"}}>
              <input style={S.input} value={r.vehicul} onChange={e=>updateTransp(i,"vehicul",e.target.value)} placeholder="Tip vehicul"/>
              <input style={S.numInput} value={r.unitate} onChange={e=>updateTransp(i,"unitate",e.target.value)} placeholder="item"/>
              <input style={S.numInput} type="number" value={r.pret} onChange={e=>updateTransp(i,"pret",e.target.value)} placeholder="0"/>
              <input style={S.numInput} type="number" value={r.nr} onChange={e=>updateTransp(i,"nr",e.target.value)} placeholder="1"/>
              <div style={{...S.numInput,background:"transparent",border:"none",color:"#4ade80",fontWeight:600}}>{fmtEUR(tot)}</div>
              <button onClick={()=>removeTransp(i)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          );
        })}
        <button onClick={addTransp} style={{marginTop:4,fontSize:12,padding:"6px 12px",borderRadius:8,border:"1px dashed #333",background:"transparent",color:"#666",cursor:"pointer",width:"100%"}}>+ Adaugă rând</button>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:13,color:"#888",marginRight:12}}>Total Transport:</span>
          <span style={{fontSize:15,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totTransp)} EUR</span>
        </div>
      </div>

      {/* TOTAL FINAL */}
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:16,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,color:"#888"}}>Valoare totală</span>
          <span style={{fontSize:14,fontWeight:600,color:"#ccc"}}>{fmtEUR(valTotal)} EUR</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:13,color:"#888"}}>TVA 21%</span>
          <span style={{fontSize:14,fontWeight:600,color:"#ccc"}}>{fmtEUR(tva)} EUR</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:"1px solid #222"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#e8e8e6"}}>TOTAL GENERAL</span>
          <span style={{fontSize:22,fontWeight:700,color:"#4ade80"}}>{fmtEUR(totalGen)} EUR</span>
        </div>
      </div>
    </div>
  );
}
