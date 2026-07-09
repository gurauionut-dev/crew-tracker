import { useState, useEffect } from "react";
import { db } from "./firebase";
import { LOGO_B64 } from "./logo_igvision";
import { collection, doc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from "firebase/firestore";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2); }

function emptyRow() { return {id:uid(), denumire:"", unitate:"", cantitate:"1", serie:""}; }

// ─── PRINT AVIZ ──────────────────────────────────────────────────────────────
function printAviz(aviz) {
  const rows = (aviz.echipamente||[]).filter(r=>r.denumire);
  const dateLabel = aviz.dateStart
    ? new Date(aviz.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})
      +(aviz.dateEnd&&aviz.dateEnd!==aviz.dateStart?" — "+new Date(aviz.dateEnd+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"}):"")
    : "";

  const html = `<!DOCTYPE html>
<html lang="ro"><head>
<meta charset="UTF-8"/>
<title>Aviz ${aviz.beneficiar||""}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;font-size:11px;color:#1a2a3a;background:#fff;}
  .page{width:210mm;margin:0 auto;padding-bottom:20mm;}
  .header{background:#1a1a1a;padding:8px 14mm;display:flex;align-items:center;justify-content:space-between;}
  .header img{height:14mm;object-fit:contain;}
  .header-right{text-align:right;}
  .badge{background:#0057cc;color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:4px;text-transform:uppercase;}
  .date{color:#aaa;font-size:9px;margin-top:4px;}
  .title-section{padding:6mm 14mm 4mm;border-bottom:2px solid #0057cc;}
  .aviz-title{font-size:20px;font-weight:700;color:#0057cc;margin-bottom:6px;letter-spacing:1px;}
  .info-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin-top:6px;}
  .lbl{font-weight:700;font-size:10px;color:#6b7fa3;padding:2px 0;}
  .val{font-size:11px;color:#1a2a3a;padding:2px 0;}
  .section{margin:5mm 14mm 0;}
  .sec-title{background:#0057cc;color:#fff;font-size:10px;font-weight:700;padding:5px 10px;letter-spacing:1.5px;text-transform:uppercase;border-radius:4px 4px 0 0;}
  table{width:100%;border-collapse:collapse;border:1px solid #c0d4f0;}
  th{background:#dce8f8;color:#0057cc;font-weight:700;font-size:9px;text-align:center;padding:5px 6px;border:1px solid #c0d4f0;letter-spacing:0.5px;text-transform:uppercase;}
  td{padding:5px 7px;border:1px solid #e2eaf5;font-size:11px;color:#1a2a3a;}
  td.left{text-align:left;}
  td.center{text-align:center;}
  tr:nth-child(even) td{background:#f5f8ff;}
  .sign-section{margin:8mm 14mm 0;display:grid;grid-template-columns:1fr 1fr;gap:20mm;}
  .sign-box{border-top:1.5px solid #1a2a3a;padding-top:4px;}
  .sign-label{font-size:10px;color:#6b7fa3;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;}
  .footer{margin-top:8mm;border-top:1px solid #e2eaf5;padding:5px 14mm;display:flex;justify-content:space-between;}
  .footer span{font-size:9px;color:#6b7fa3;}
  .watermark{position:fixed;bottom:40mm;right:14mm;font-size:60px;color:rgba(0,87,204,0.06);font-weight:900;transform:rotate(-20deg);pointer-events:none;z-index:0;}
  @media print{
    .no-print{display:none !important;}
    @page{size:A4;margin:0;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style></head><body>
<div class="page">
  <div class="watermark">AVIZ</div>

  <div class="header">
    <img src="${LOGO_B64}" alt="IG Vision"/>
    <div class="header-right">
      <div class="badge">AVIZ DE ÎNSOȚIRE</div>
      <div class="date">Nr. ${aviz.numar||"___"} · ${new Date().toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})}</div>
    </div>
  </div>

  <div class="title-section">
    <div class="aviz-title">AVIZ DE ÎNSOȚIRE A MĂRFII</div>
    <div class="info-grid">
      <span class="lbl">EXPEDITOR:</span><span class="val">IG Vision · 0732 302 813 · office@igvision.ro</span>
      <span class="lbl">DESTINATAR:</span><span class="val">${aviz.beneficiar||"—"}</span>
      <span class="lbl">EVENIMENT:</span><span class="val">${aviz.eveniment||"—"}</span>
      <span class="lbl">LOCAȚIE:</span><span class="val">${aviz.locatie||"—"}</span>
      ${dateLabel?`<span class="lbl">PERIOADĂ:</span><span class="val">${dateLabel}</span>`:""}
    </div>
  </div>

  <div class="section">
    <div class="sec-title">Lista echipamente</div>
    <table>
      <thead><tr>
        <th width="32">Nr.</th>
        <th style="text-align:left">Denumire echipament</th>
        <th width="60">Unitate</th>
        <th width="60">Cantitate</th>
        <th width="100">Serie / Nr. inv.</th>
        <th width="80">Expediat ✓</th>
        <th width="80">Returnat ✓</th>
      </tr></thead>
      <tbody>
        ${rows.map((r,i)=>`
          <tr>
            <td class="center">${i+1}</td>
            <td class="left">${r.denumire}</td>
            <td class="center">${r.unitate||""}</td>
            <td class="center">${r.cantitate||1}</td>
            <td class="center" style="color:#888">${r.serie||""}</td>
            <td class="center"></td>
            <td class="center"></td>
          </tr>`).join("")}
        ${rows.length<10?Array(10-rows.length).fill(0).map((_,i)=>`
          <tr style="height:26px">
            <td class="center" style="color:#ddd">${rows.length+i+1}</td>
            <td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`).join(""):""}
      </tbody>
    </table>
  </div>

  <div class="sign-section">
    <div class="sign-box">
      <div class="sign-label">Expediat de (semnătură)</div>
    </div>
    <div class="sign-box">
      <div class="sign-label">Primit de (semnătură)</div>
    </div>
  </div>

  <div class="footer">
    <span>✉ office@igvision.ro</span>
    <span>📞 0732302810</span>
    <span>🌐 igvision.ro</span>
    <span>Document generat de IG Vision Crew Tracker</span>
  </div>
</div>

<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:10px;z-index:99;">
  <button onclick="window.print()" style="padding:11px 22px;background:#0057cc;color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 12px rgba(0,87,204,0.3);">🖨 Printează / Save PDF</button>
  <button onclick="window.close()" style="padding:11px 18px;background:#f0f4fa;color:#6b7fa3;border:1.5px solid #d0daea;border-radius:9px;font-size:14px;cursor:pointer;font-family:inherit;">✕</button>
</div>
</body></html>`;

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    const win = window.open();
    if (win) { win.document.write(html); win.document.close(); }
    else {
      const a = document.createElement("a");
      a.href = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      a.download = "aviz.html";
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
export default function AvizeView({ user, gcalEvents }) {
  const [avize,      setAvize]      = useState([]);
  const [catalog,    setCatalog]    = useState(null);
  const [view,       setView]       = useState("list");
  const [current,    setCurrent]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showCal,    setShowCal]    = useState(false);
  const [showCatalog,setShowCatalog]= useState(false);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"avize"),snap=>{
      const list=[]; snap.forEach(d=>list.push({id:d.id,...d.data()}));
      list.sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
      setAvize(list);
    });
    const u2=onSnapshot(doc(db,"catalog","main"),snap=>{
      setCatalog(snap.exists()?snap.data():null);
    });
    return()=>{u1();u2();};
  },[]);

  const allEchipCatalog = catalog?.echipamente||[];

  // Calendar events — last 60 days + next 30 days
  const today=new Date();
  const d60=new Date(today); d60.setDate(d60.getDate()-60);
  const d30=new Date(today); d30.setDate(d30.getDate()+30);
  const toK=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const allCalEvents=Object.values(gcalEvents||{}).flat()
    .filter((ev,i,arr)=>arr.findIndex(e=>(e.originalId||e.id)===(ev.originalId||ev.id))===i)
    .filter(ev=>(ev.dayKey||"")>=toK(d60)&&(ev.dayKey||"")<=toK(d30))
    .sort((a,b)=>(b.dayKey||"").localeCompare(a.dayKey||""));

  function newAviz() {
    setCurrent({id:uid(),beneficiar:"",eveniment:"",locatie:"",dateStart:"",dateEnd:"",
      numar:String(Date.now()).slice(-4),
      echipamente:[emptyRow(),emptyRow(),emptyRow()]});
    setView("edit");
  }
  async function saveAviz() {
    setSaving(true);
    try { await setDoc(doc(db,"avize",current.id),{...current,updatedAt:serverTimestamp(),createdBy:user.id}); setView("list"); }
    catch(e){ alert("Eroare: "+e.message); }
    setSaving(false);
  }
  async function deleteAviz() { await deleteDoc(doc(db,"avize",confirmDel)); setConfirmDel(null); }

  function selectCalEvent(ev) {
    setCurrent(p=>({...p,eveniment:ev.title,locatie:ev.location||"",dateStart:ev.dayKey,dateEnd:ev.dayKey,calEventId:ev.originalId||ev.id}));
    setShowCal(false);
  }

  // ── STYLES ─────────────────────────────────────────────────────────────────
  const C={bg:"#f0f4fa",card:"#fff",border:"#e2eaf5",blue:"#0057cc",blueL:"#e8f0ff",
            text:"#1a2a3a",sub:"#6b7fa3",green:"#1a7a4a",greenL:"#e8f5ee"};
  const inp={width:"100%",padding:"9px 11px",borderRadius:8,border:`1.5px solid ${C.border}`,
             background:C.card,color:C.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const numI={...inp,textAlign:"right"};
  const lbl={fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5,display:"block"};
  const card={background:C.card,border:`1.5px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 2px 8px rgba(0,80,200,0.06)"};
  const btnP={padding:"9px 18px",borderRadius:8,border:"none",background:C.blue,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
  const btnS={padding:"8px 16px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.card,color:C.sub,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
  const btnG={padding:"9px 18px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={{padding:16,background:C.bg,minHeight:"100vh"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:700,color:C.blue}}>Avize de Însoțire</div>
        <button onClick={newAviz} style={btnP}>+ Aviz nou</button>
      </div>

      {avize.length===0&&(
        <div style={{textAlign:"center",padding:"48px 0",color:C.sub}}>
          <div style={{fontSize:40,marginBottom:12}}>📋</div>
          <div style={{fontSize:14,color:C.text,fontWeight:500}}>Niciun aviz salvat</div>
          <div style={{fontSize:12,marginTop:4}}>Crează un aviz pentru fiecare transport dry hire</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {avize.map(a=>{
          const nrEchip=(a.echipamente||[]).filter(r=>r.denumire).length;
          return (
            <div key={a.id} style={{...card,borderLeft:"4px solid #0057cc"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <span style={{fontSize:10,background:C.blueL,color:C.blue,padding:"2px 8px",borderRadius:20,fontWeight:700}}>Nr. {a.numar||"—"}</span>
                    <span style={{fontSize:15,fontWeight:600,color:C.text}}>{a.beneficiar||"Fără beneficiar"}</span>
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginTop:2}}>{a.eveniment||""}{a.locatie?" · "+a.locatie:""}</div>
                  {a.dateStart&&<div style={{fontSize:11,color:C.sub,marginTop:2}}>📅 {new Date(a.dateStart+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short",year:"numeric"})}</div>}
                  <div style={{fontSize:11,color:C.sub,marginTop:2}}>📦 {nrEchip} echipament{nrEchip!==1?"e":""}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                <button onClick={()=>printAviz(a)} style={{...btnS,fontSize:12,padding:"6px 12px"}}>🖨 Print / PDF</button>
                <button onClick={()=>{setCurrent({...a});setView("edit");}} style={{...btnS,fontSize:12,padding:"6px 12px",color:C.blue,borderColor:C.blue}}>✏️ Edit</button>
                <button onClick={()=>setConfirmDel(a.id)} style={{...btnS,fontSize:12,padding:"6px 12px",color:"#cc3300",borderColor:"#cc3300"}}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,30,80,0.35)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:24,width:"100%",maxWidth:320,textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.1)"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗑️</div>
            <div style={{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}}>Ștergi avizul?</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:20}}>Acțiunea nu poate fi anulată.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDel(null)} style={{...btnS,flex:1}}>Anulează</button>
              <button onClick={deleteAviz} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#cc3300",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Șterge</button>
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
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:16,borderBottom:`1.5px solid ${C.border}`,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1,fontSize:15,fontWeight:700,color:C.blue}}>{current.beneficiar||"Aviz nou"} {current.numar?`· Nr. ${current.numar}`:""}</div>
        <button onClick={()=>printAviz(current)} style={btnS}>🖨 Print / PDF</button>
        <button onClick={saveAviz} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>

      {/* INFO */}
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4}}>01 · Informații aviz</div>
      <div style={{...card,borderLeft:"4px solid #0057cc"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={lbl}>Nr. Aviz</label><input style={inp} value={current.numar||""} onChange={e=>setCurrent(p=>({...p,numar:e.target.value}))} placeholder="Auto"/></div>
          <div><label style={lbl}>Beneficiar / Destinatar</label><input style={inp} value={current.beneficiar||""} onChange={e=>setCurrent(p=>({...p,beneficiar:e.target.value}))} placeholder="Numele clientului"/></div>
          <div><label style={lbl}>Eveniment</label><input style={inp} value={current.eveniment||""} onChange={e=>setCurrent(p=>({...p,eveniment:e.target.value}))} placeholder="Tip eveniment"/></div>
          <div><label style={lbl}>Locație</label><input style={inp} value={current.locatie||""} onChange={e=>setCurrent(p=>({...p,locatie:e.target.value}))} placeholder="Locația"/></div>
          <div><label style={lbl}>Data livrare</label><input type="date" style={inp} value={current.dateStart||""} onChange={e=>setCurrent(p=>({...p,dateStart:e.target.value}))}/></div>
          <div><label style={lbl}>Data retur</label><input type="date" style={inp} value={current.dateEnd||""} onChange={e=>setCurrent(p=>({...p,dateEnd:e.target.value}))}/></div>
        </div>
        {/* Calendar quick-select */}
        <button onClick={()=>setShowCal(!showCal)} style={{...btnS,fontSize:12,width:"100%",textAlign:"left"}}>
          📅 {showCal?"Închide":"Selectează din Google Calendar"}
        </button>
        {showCal&&(
          <div style={{marginTop:8,background:C.bg,borderRadius:9,padding:8,border:`1.5px solid #c0d4f0`,maxHeight:180,overflowY:"auto"}}>
            {allCalEvents.length===0&&<div style={{fontSize:12,color:C.sub,padding:"8px 0"}}>Niciun eveniment disponibil</div>}
            {allCalEvents.map(ev=>(
              <div key={ev.id} onClick={()=>selectCalEvent(ev)}
                style={{padding:"7px 10px",borderRadius:8,border:`1.5px solid ${C.border}`,background:C.card,cursor:"pointer",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
      <div style={{fontSize:10,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingLeft:4,marginTop:4}}>02 · Lista echipamente</div>
      <div style={{...card,borderLeft:"4px solid #0057cc"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:12,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.06em"}}>🖥️ Echipamente</span>
          {allEchipCatalog.length>0&&<button onClick={()=>setShowCatalog(!showCatalog)} style={{...btnS,fontSize:12}}>📦 Din catalog</button>}
        </div>
        {showCatalog&&<div style={{marginBottom:12,background:"#f0f4fa",borderRadius:9,padding:10,border:"1.5px solid #c0d4f0",maxHeight:200,overflowY:"auto"}}>
          {allEchipCatalog.map(item=>(
            <div key={item.id} onClick={()=>{
              setCurrent(p=>({...p,echipamente:[...p.echipamente,{id:uid(),denumire:item.denumire,unitate:item.unitate,cantitate:"1",serie:""}]}));
              setShowCatalog(false);
            }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,background:"#fff",cursor:"pointer",marginBottom:6,border:"1.5px solid #e2eaf5"}}>
              <span style={{fontSize:13,color:C.text}}>{item.denumire}</span>
              <span style={{fontSize:11,color:C.sub}}>{item.unitate}</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"2fr 60px 60px 1fr 22px",gap:4,marginBottom:6}}>
          {["Denumire echipament","Unit.","Cant.","Serie / Nr. inventar",""].map(h=>(
            <div key={h} style={{fontSize:9,color:C.blue,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
          ))}
        </div>
        {current.echipamente.map((r,i)=>(
          <div key={r.id} style={{display:"grid",gridTemplateColumns:"2fr 60px 60px 1fr 22px",gap:4,marginBottom:6,alignItems:"center"}}>
            <input style={inp} value={r.denumire} onChange={e=>setCurrent(p=>{ const rows=[...p.echipamente]; rows[i]={...rows[i],denumire:e.target.value}; return {...p,echipamente:rows};})} placeholder="Denumire echipament"/>
            <input style={numI} value={r.unitate} onChange={e=>setCurrent(p=>{ const rows=[...p.echipamente]; rows[i]={...rows[i],unitate:e.target.value}; return {...p,echipamente:rows};})} placeholder="mp"/>
            <input style={numI} type="number" min="0" step="0.5" value={r.cantitate} onChange={e=>setCurrent(p=>{ const rows=[...p.echipamente]; rows[i]={...rows[i],cantitate:e.target.value}; return {...p,echipamente:rows};})} placeholder="1"/>
            <input style={inp} value={r.serie||""} onChange={e=>setCurrent(p=>{ const rows=[...p.echipamente]; rows[i]={...rows[i],serie:e.target.value}; return {...p,echipamente:rows};})} placeholder="Serie / Nr. inv. (opțional)"/>
            <button onClick={()=>setCurrent(p=>({...p,echipamente:p.echipamente.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:15,padding:0}}>✕</button>
          </div>
        ))}
        <button onClick={()=>setCurrent(p=>({...p,echipamente:[...p.echipamente,emptyRow()]}))}
          style={{width:"100%",padding:"7px",borderRadius:8,border:`1.5px dashed ${C.border}`,background:C.bg,color:C.sub,cursor:"pointer",fontSize:12,marginTop:4}}>
          + Adaugă echipament
        </button>
        <div style={{marginTop:12,paddingTop:10,borderTop:`1.5px solid ${C.border}`,fontSize:12,color:C.sub}}>
          Total: <strong style={{color:C.blue}}>{(current.echipamente||[]).filter(r=>r.denumire).length} echipamente</strong> pe aviz · Fără prețuri
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:16,borderTop:`1.5px solid ${C.border}`,marginTop:8}}>
        <button onClick={()=>setView("list")} style={btnS}>‹ Înapoi</button>
        <div style={{flex:1}}/>
        <button onClick={()=>printAviz(current)} style={btnS}>🖨 Print / PDF</button>
        <button onClick={saveAviz} disabled={saving} style={btnG}>{saving?"Salvez...":"💾 Salvează"}</button>
      </div>
    </div>
  );
}
