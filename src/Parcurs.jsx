import { useState, useEffect } from "react";
import { db } from "./firebase";
import { LOGO_B64 } from "./logo_igvision";
import { collection, doc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from "firebase/firestore";

function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthStr = () => todayStr().slice(0,7);
const MONTHS = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];
const monthLabel = m => { const [y,mm]=m.split("-"); return `${MONTHS[+mm-1]} ${y}`; };
const fmtD = s => { const [y,m,d]=s.split("-"); return `${d}.${m}.${y}`; };
const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const num = v => { const n=parseFloat(String(v).replace(",",".")); return isNaN(n)?0:n; };
const fmtKm = n => (Math.round(n*10)/10).toLocaleString("ro-RO");

// ─── PRINT ───────────────────────────────────────────────────────────────────
function printFoaie(vehicul, month, trips) {
  const rows = [...trips].sort((a,b)=>(a.data+String(a.kmStart).padStart(9,"0")).localeCompare(b.data+String(b.kmStart).padStart(9,"0")));
  const total = rows.reduce((s,t)=>s+Math.max(0,num(t.kmEnd)-num(t.kmStart)),0);
  const kmStartLuna = rows.length?num(rows[0].kmStart):0;
  const kmEndLuna   = rows.length?num(rows[rows.length-1].kmEnd):0;
  const title = `Foaie de parcurs ${vehicul.nr} ${monthLabel(month)}`;

  const html = `<!DOCTYPE html>
<html lang="ro"><head><meta charset="UTF-8"/><title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;font-size:11px;color:#1a2a3a;background:#fff;}
  .page{width:210mm;margin:0 auto;padding-bottom:20mm;}
  .header{background:#1a1a1a;padding:8px 14mm;display:flex;align-items:center;justify-content:space-between;}
  .header img{height:14mm;object-fit:contain;}
  .badge{background:#0057cc;color:#fff;font-size:11px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:4px;text-transform:uppercase;}
  .title-section{padding:6mm 14mm 4mm;border-bottom:2px solid #0057cc;}
  .t{font-size:20px;font-weight:700;color:#0057cc;letter-spacing:1px;margin-bottom:6px;}
  .info-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 14px;margin-top:6px;}
  .lbl{font-weight:700;font-size:10px;color:#6b7fa3;padding:2px 0;}
  .val{font-size:11px;padding:2px 0;}
  .section{margin:5mm 14mm 0;}
  table{width:100%;border-collapse:collapse;border:1px solid #c0d4f0;}
  th{background:#dce8f8;color:#0057cc;font-weight:700;font-size:9px;text-align:center;padding:5px 6px;border:1px solid #c0d4f0;text-transform:uppercase;}
  td{padding:5px 7px;border:1px solid #e2eaf5;font-size:10.5px;}
  td.c{text-align:center;} td.r{text-align:right;}
  tr:nth-child(even) td{background:#f5f8ff;}
  tr{page-break-inside:avoid;}
  .tot td{background:#0057cc !important;color:#fff;font-weight:700;font-size:11px;}
  .sum{margin:5mm 14mm 0;display:flex;gap:10mm;font-size:11px;}
  .sum b{color:#0057cc;}
  .sign-section{margin:14mm 14mm 0;display:grid;grid-template-columns:1fr 1fr;gap:20mm;}
  .sign-box{border-top:1.5px solid #1a2a3a;padding-top:4px;font-size:10px;color:#6b7fa3;font-weight:600;text-transform:uppercase;}
  .footer{margin-top:8mm;border-top:1px solid #e2eaf5;padding:5px 14mm;display:flex;justify-content:space-between;font-size:9px;color:#6b7fa3;}
  @media print{.no-print{display:none !important;} @page{size:A4;margin:0;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
  <div class="header"><img src="${LOGO_B64}" alt="IG Vision"/><div class="badge">FOAIE DE PARCURS</div></div>
  <div class="title-section">
    <div class="t">FOAIE DE PARCURS — ${esc(monthLabel(month)).toUpperCase()}</div>
    <div class="info-grid">
      <span class="lbl">UNITATE:</span><span class="val">IG Vision SRL</span>
      <span class="lbl">AUTOVEHICUL:</span><span class="val">${esc(vehicul.nr)}${vehicul.model?" · "+esc(vehicul.model):""}</span>
    </div>
  </div>
  <div class="section">
    <table>
      <thead><tr>
        <th width="28">Nr.</th><th width="58">Data</th><th width="90">Șofer</th>
        <th style="text-align:left">Itinerar</th><th width="56">Km început</th><th width="56">Km sfârșit</th>
        <th width="48">Km parc.</th><th width="110">Scop</th>
      </tr></thead>
      <tbody>
        ${rows.map((t,i)=>`<tr>
          <td class="c">${i+1}</td><td class="c">${fmtD(t.data)}</td><td>${esc(t.sofer)}</td>
          <td>${esc(t.itinerar)}</td><td class="r">${fmtKm(num(t.kmStart))}</td><td class="r">${fmtKm(num(t.kmEnd))}</td>
          <td class="r"><b>${fmtKm(Math.max(0,num(t.kmEnd)-num(t.kmStart)))}</b></td><td>${esc(t.scop)}</td></tr>`).join("")}
        ${rows.length===0?`<tr><td colspan="8" class="c" style="color:#999;padding:12px">Nicio cursă înregistrată</td></tr>`:""}
        <tr class="tot"><td colspan="6" style="text-align:right">TOTAL KM LUNA</td><td class="r">${fmtKm(total)}</td><td></td></tr>
      </tbody>
    </table>
  </div>
  <div class="sum">
    <div>Km la începutul lunii: <b>${fmtKm(kmStartLuna)}</b></div>
    <div>Km la sfârșitul lunii: <b>${fmtKm(kmEndLuna)}</b></div>
    <div>Total parcurs: <b>${fmtKm(total)} km</b></div>
  </div>
  <div class="sign-section">
    <div class="sign-box">Întocmit (semnătură)</div>
    <div class="sign-box">Aprobat (semnătură / ștampilă)</div>
  </div>
  <div class="footer"><span>✉ office@igvision.ro</span><span>📞 0732302810</span><span>🌐 igvision.ro</span><span>Document generat de IG Vision Crew Tracker</span></div>
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
      a.download = "foaie-parcurs.html";
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

// ─── STYLES ──────────────────────────────────────────────────────────────────
const card = {background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:16,marginBottom:14};
const inp  = {width:"100%",padding:"9px 11px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",boxSizing:"border-box"};
const lbl  = {fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4,display:"block"};
const btnP = {padding:"10px 18px",background:"#0057cc",color:"#fff",border:"none",borderRadius:9,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"};
const btnS = {padding:"9px 14px",background:"#f0f4fa",color:"#374151",border:"1.5px solid #d0daea",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ParcursView({ user, drivers=[], showToast=()=>{} }) {
  const [flota, setFlota] = useState([]);
  const [curse, setCurse] = useState([]);
  const [sub, setSub]     = useState("curse");
  const [vId, setVId]     = useState("");
  const [month, setMonth] = useState(monthStr());
  const [form, setForm]   = useState(null);   // trip being edited/added
  const [vForm, setVForm] = useState(null);   // vehicle being edited/added
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,"flota"),s=>{const l=[];s.forEach(d=>l.push({id:d.id,...d.data()}));l.sort((a,b)=>(a.nr||"").localeCompare(b.nr||""));setFlota(l);});
    const u2=onSnapshot(collection(db,"curse"),s=>{const l=[];s.forEach(d=>l.push({id:d.id,...d.data()}));setCurse(l);});
    return()=>{u1();u2();};
  },[]);

  useEffect(()=>{ if(!vId && flota.length) setVId(flota[0].id); if(vId && !flota.find(v=>v.id===vId)) setVId(flota[0]?.id||""); },[flota,vId]);

  const vehicul = flota.find(v=>v.id===vId);
  const trips = curse.filter(t=>t.vehicul===vId && (t.data||"").startsWith(month))
    .sort((a,b)=>(a.data+String(a.kmStart).padStart(9,"0")).localeCompare(b.data+String(b.kmStart).padStart(9,"0")));
  const totalKm = trips.reduce((s,t)=>s+Math.max(0,num(t.kmEnd)-num(t.kmStart)),0);

  const lastKmEnd = () => {
    const all = curse.filter(t=>t.vehicul===vId);
    if (!all.length) return vehicul?.kmInitial||"";
    return all.sort((a,b)=>num(b.kmEnd)-num(a.kmEnd))[0].kmEnd;
  };

  const newTrip = () => setForm({id:uid(),vehicul:vId,data:todayStr(),sofer:drivers.includes(user.name)?user.name:(drivers[0]||""),itinerar:"",kmStart:String(lastKmEnd()),kmEnd:"",scop:""});

  const saveTrip = async () => {
    if(!form.data||!form.sofer||!form.itinerar.trim()||form.kmStart===""||form.kmEnd===""){showToast("Completează data, șoferul, itinerarul și km");return;}
    if(num(form.kmEnd)<num(form.kmStart)){showToast("Km sfârșit nu poate fi mai mic decât km început");return;}
    try{
      await setDoc(doc(db,"curse",form.id),{...form,vehicul:vId,updatedBy:user.id,updatedAt:serverTimestamp()});
      setMonth(form.data.slice(0,7)); setForm(null); showToast("Cursă salvată ✓");
    }catch(e){showToast("Eroare la salvare");}
  };
  const delTrip = async id => { await deleteDoc(doc(db,"curse",id)); setConfirmDel(null); showToast("Cursă ștearsă"); };

  const saveVeh = async () => {
    if(!vForm.nr.trim()){showToast("Introdu numărul de înmatriculare");return;}
    await setDoc(doc(db,"flota",vForm.id),{nr:vForm.nr.trim().toUpperCase(),model:vForm.model.trim(),kmInitial:vForm.kmInitial||"",updatedAt:serverTimestamp()});
    setVId(vForm.id); setVForm(null); showToast("Vehicul salvat ✓");
  };
  const delVeh = async id => {
    if(curse.some(t=>t.vehicul===id)){showToast("Vehiculul are curse înregistrate — nu poate fi șters");setConfirmDel(null);return;}
    await deleteDoc(doc(db,"flota",id)); setConfirmDel(null); showToast("Vehicul șters");
  };

  const setF = (k,v)=>setForm(f=>({...f,[k]:v}));
  const kmDiff = form?Math.max(0,num(form.kmEnd)-num(form.kmStart)):0;

  return (
    <div style={{padding:"20px 16px",maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <h2 style={{fontSize:22,fontWeight:700,color:"#111827",margin:0}}>Foi de parcurs</h2>
        <div style={{display:"flex",gap:6}}>
          {[["curse","Curse"],["flota","Flotă"]].map(([id,l])=>(
            <button key={id} onClick={()=>setSub(id)} style={{...btnS,background:sub===id?"#111827":"#fff",color:sub===id?"#fff":"#374151"}}>{l}</button>
          ))}
        </div>
      </div>

      {sub==="flota"&&(
        <>
          {flota.length===0&&<div style={{...card,color:"#6b7280",textAlign:"center"}}>Niciun vehicul în flotă. Adaugă primul vehicul.</div>}
          {flota.map(v=>(
            <div key={v.id} style={{...card,display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
              <i className="ti ti-car" style={{fontSize:22,color:"#0057cc"}}></i>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15}}>{v.nr}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{v.model||"—"}{v.kmInitial?` · km inițial ${fmtKm(num(v.kmInitial))}`:""}</div>
              </div>
              <button style={btnS} onClick={()=>setVForm({id:v.id,nr:v.nr,model:v.model||"",kmInitial:v.kmInitial||""})}>Editează</button>
              <button style={{...btnS,color:"#dc2626"}} onClick={()=>setConfirmDel({type:"veh",id:v.id})}>✕</button>
            </div>
          ))}
          <button style={btnP} onClick={()=>setVForm({id:uid(),nr:"",model:"",kmInitial:""})}>+ Adaugă vehicul</button>
        </>
      )}

      {sub==="curse"&&(
        flota.length===0 ? (
          <div style={{...card,textAlign:"center",color:"#6b7280"}}>
            Adaugă mai întâi un vehicul în fila „Flotă”.<br/>
            <button style={{...btnP,marginTop:12}} onClick={()=>{setSub("flota");setVForm({id:uid(),nr:"",model:"",kmInitial:""});}}>+ Adaugă vehicul</button>
          </div>
        ) : (
        <>
          <div style={{...card,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,alignItems:"end"}}>
            <div><label style={lbl}>Vehicul</label>
              <select style={inp} value={vId} onChange={e=>setVId(e.target.value)}>
                {flota.map(v=><option key={v.id} value={v.id}>{v.nr}{v.model?` — ${v.model}`:""}</option>)}
              </select></div>
            <div><label style={lbl}>Luna</label>
              <input type="month" style={inp} value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/></div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...btnP,flex:1}} onClick={newTrip}>+ Cursă</button>
              <button style={{...btnS,flex:1,background:"#16a34a",color:"#fff",border:"none"}} onClick={()=>vehicul&&printFoaie(vehicul,month,trips)}>📄 PDF</button>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
            <div style={{...card,margin:0,padding:"10px 16px",flex:1,minWidth:120}}><div style={lbl}>Curse</div><div style={{fontSize:20,fontWeight:700}}>{trips.length}</div></div>
            <div style={{...card,margin:0,padding:"10px 16px",flex:1,minWidth:120}}><div style={lbl}>Total km {monthLabel(month)}</div><div style={{fontSize:20,fontWeight:700,color:"#0057cc"}}>{fmtKm(totalKm)}</div></div>
          </div>

          {trips.length===0&&<div style={{...card,textAlign:"center",color:"#6b7280"}}>Nicio cursă în {monthLabel(month)} pentru acest vehicul.</div>}
          {trips.map(t=>(
            <div key={t.id} style={{...card,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div style={{fontWeight:700,fontSize:14}}>{fmtD(t.data)} · {t.sofer}</div>
                <div style={{fontWeight:700,color:"#0057cc"}}>{fmtKm(Math.max(0,num(t.kmEnd)-num(t.kmStart)))} km</div>
              </div>
              <div style={{fontSize:13,margin:"4px 0",color:"#111827"}}>{t.itinerar}</div>
              <div style={{fontSize:12,color:"#6b7280"}}>{fmtKm(num(t.kmStart))} → {fmtKm(num(t.kmEnd))}{t.scop?` · ${t.scop}`:""}</div>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btnS} onClick={()=>setForm({...t})}>Editează</button>
                <button style={{...btnS,color:"#dc2626"}} onClick={()=>setConfirmDel({type:"trip",id:t.id})}>Șterge</button>
              </div>
            </div>
          ))}
        </>)
      )}

      {/* Trip modal */}
      {form&&(
        <Modal onClose={()=>setForm(null)} title={curse.find(t=>t.id===form.id)?"Editează cursa":"Cursă nouă"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={lbl}>Data</label><input type="date" style={inp} value={form.data} onChange={e=>setF("data",e.target.value)}/></div>
            <div><label style={lbl}>Șofer</label>
              <select style={inp} value={form.sofer} onChange={e=>setF("sofer",e.target.value)}>
                {drivers.map(d=><option key={d}>{d}</option>)}
              </select></div>
          </div>
          <div style={{marginTop:12}}><label style={lbl}>Itinerar (plecare → sosire)</label><input style={inp} placeholder="București → Cluj-Napoca" value={form.itinerar} onChange={e=>setF("itinerar",e.target.value)}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>
            <div><label style={lbl}>Km început</label><input inputMode="decimal" style={inp} value={form.kmStart} onChange={e=>setF("kmStart",e.target.value)}/></div>
            <div><label style={lbl}>Km sfârșit</label><input inputMode="decimal" style={inp} value={form.kmEnd} onChange={e=>setF("kmEnd",e.target.value)}/></div>
          </div>
          <div style={{fontSize:13,color:"#0057cc",fontWeight:700,marginTop:6}}>Parcurși: {fmtKm(kmDiff)} km</div>
          <div style={{marginTop:12}}><label style={lbl}>Scop</label><input style={inp} placeholder="Transport echipamente eveniment" value={form.scop} onChange={e=>setF("scop",e.target.value)}/></div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <button style={{...btnP,flex:1}} onClick={saveTrip}>Salvează</button>
            <button style={btnS} onClick={()=>setForm(null)}>Anulează</button>
          </div>
        </Modal>
      )}

      {/* Vehicle modal */}
      {vForm&&(
        <Modal onClose={()=>setVForm(null)} title={flota.find(v=>v.id===vForm.id)?"Editează vehicul":"Vehicul nou"}>
          <label style={lbl}>Nr. înmatriculare</label>
          <input style={inp} placeholder="B 123 ABC" value={vForm.nr} onChange={e=>setVForm({...vForm,nr:e.target.value})}/>
          <div style={{marginTop:12}}><label style={lbl}>Model</label><input style={inp} placeholder="Ford Transit" value={vForm.model} onChange={e=>setVForm({...vForm,model:e.target.value})}/></div>
          <div style={{marginTop:12}}><label style={lbl}>Km inițial (opțional)</label><input inputMode="decimal" style={inp} value={vForm.kmInitial} onChange={e=>setVForm({...vForm,kmInitial:e.target.value})}/></div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <button style={{...btnP,flex:1}} onClick={saveVeh}>Salvează</button>
            <button style={btnS} onClick={()=>setVForm(null)}>Anulează</button>
          </div>
        </Modal>
      )}

      {confirmDel&&(
        <Modal onClose={()=>setConfirmDel(null)} title="Confirmă ștergerea">
          <div style={{fontSize:14,marginBottom:16}}>Sigur vrei să ștergi {confirmDel.type==="trip"?"această cursă":"acest vehicul"}?</div>
          <div style={{display:"flex",gap:10}}>
            <button style={{...btnP,background:"#dc2626",flex:1}} onClick={()=>confirmDel.type==="trip"?delTrip(confirmDel.id):delVeh(confirmDel.id)}>Șterge</button>
            <button style={btnS} onClick={()=>setConfirmDel(null)}>Anulează</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({title,onClose,children}){
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(17,24,39,.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:460,maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{fontSize:17,fontWeight:700,marginBottom:14,color:"#111827"}}>{title}</div>
        {children}
      </div>
    </div>
  );
}
