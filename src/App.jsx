import { useState, useEffect, useRef } from "react";
import { db, saveChecked, saveApproval, listenChecked, listenApprovals, saveEventColor, listenEventColors } from "./firebase";
import { doc, setDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import DevizeView from "./Devize";
import RaportBusiness from "./Raport";
import AvizeView from "./Avize";
import { LOGO_B64 } from "./logo_igvision";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACTIONS = [
  { key: "montaj",    label: "Montaj",      icon: "🔧" },
  { key: "demontaj",  label: "Demontaj",    icon: "📦" },
  { key: "operare",   label: "Operare",     icon: "🖥️"  },
  { key: "condus",    label: "Condus x1",   icon: "🚐" },
  { key: "condus2",   label: "Condus x2",   icon: "🚐🚐" },
  { key: "deplasare", label: "Deplasare",   icon: "🗺️"  },
  { key: "asistenta",   label: "Asistență",   icon: "🎧" },
  { key: "observatii",  label: "Observații",  icon: "📝", isNote: true },
];

const DEFAULT_BONUSES = {
  montaj: 37.5, demontaj: 37.5, operare: 250, condus: 25, condus2: 50, deplasare: 0, asistenta: 0, observatii: 0,
};

const USER_CONFIG = {
  ionut:  { visibleActions: ["montaj","demontaj","operare","condus","condus2","deplasare","asistenta","observatii"], bonuses: { ...DEFAULT_BONUSES } },
  daniel: { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta","observatii"],                    bonuses: { ...DEFAULT_BONUSES, montaj: 50, demontaj: 50 } },
  stefan: { visibleActions: ["montaj","demontaj","operare","condus","condus2","deplasare","asistenta","observatii"], bonuses: { ...DEFAULT_BONUSES } },
  gabi:   { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta","observatii"],                    bonuses: { ...DEFAULT_BONUSES } },
};

const TEAM = [
  { id: "ionut",   name: "Ionuț Gurău",      email: "gurauionut@gmail.com",       password: "crew2024!",  initials: "IG",  color: "#185FA5", bg: "#DCE8F7", role: "Crew Chief",    isChief: true,  isViewer: false },
  { id: "daniel",  name: "Stancu Daniel",    email: "danielmarcel1313@gmail.com", password: "daniel2024", initials: "SD",  color: "#1a5c2a", bg: "#D6EDDC", role: "Technician",    isChief: false, isViewer: false },
  { id: "stefan",  name: "Ștefan Maricescu", email: "barosan.stefy@gmail.com",    password: "stefan2024", initials: "SM",  color: "#7a3b00", bg: "#F5E6D3", role: "Technician",    isChief: false, isViewer: false },
  { id: "gabi",    name: "Gabi Bugeanu",     email: "fymwithart@gmail.com",       password: "gabi2024",   initials: "GB",  color: "#3C3489", bg: "#E5E4F8", role: "Technician",    isChief: false, isViewer: false },
  { id: "anca",    name: "Anca Gurău",       email: "ancagurau@gmail.com",        password: "anca2024",   initials: "AG",  color: "#72243E", bg: "#F5DCE5", role: "Contabilitate",  isChief: false, isViewer: true  },
  { id: "ionel",   name: "Ionel Gurău",      email: "ionelgurau.ig@gmail.com",    password: "ionel2024",  initials: "IG2", color: "#444441", bg: "#E8E8E6", role: "Contabilitate",  isChief: false, isViewer: true  },
];

const CALENDAR_ID      = "p6khitulp9l3vdrasd5rt4ep68@group.calendar.google.com";
const CALENDAR_API_KEY = "AIzaSyAJ49QRmSGj5cDBdKXDjDJZy-Q_3PAsrEg";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function addDays(d, n)   { const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)      { return new Date(d).toLocaleDateString("ro-RO",{weekday:"long",day:"numeric",month:"long"}); }
function fmtDateShort(d) { return new Date(d).toLocaleDateString("ro-RO",{weekday:"short",day:"numeric",month:"short"}); }
function fmtMonth(d)     { return new Date(d).toLocaleDateString("ro-RO",{month:"long",year:"numeric"}); }
function fmtRON(n)       { const v=Number(n); return v%1===0?`${v} RON`:`${v.toFixed(1)} RON`; }
function load(k,fb)      { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } }
function save(k,val)     { try { localStorage.setItem(k,JSON.stringify(val)); } catch {} }
function getUserActions(uid) {
  return ACTIONS.filter(a=>(USER_CONFIG[uid]?.visibleActions||["montaj","demontaj","operare","deplasare","asistenta","observatii"]).includes(a.key));
}
function getUserBonuses(uid) { return USER_CONFIG[uid]?.bonuses||DEFAULT_BONUSES; }

function parseDateLocal(str) {
  if (!str) return new Date();
  if (str.length===10) { const [y,m,d]=str.split("-").map(Number); return new Date(y,m-1,d); }
  return new Date(str);
}

// Google Calendar color IDs → hex (matches Google's palette)
const GCAL_COLORS = {
  "1":  "#ac725e", // Tomato
  "2":  "#d06b64", // Flamingo
  "3":  "#f83a22", // Tangerine
  "4":  "#fa573c", // Banana
  "5":  "#ff7537", // Sage
  "6":  "#ffad46", // Basil
  "7":  "#42d692", // Peacock
  "8":  "#16a765", // Blueberry
  "9":  "#7bd148", // Lavender
  "10": "#b3dc6c", // Grape
  "11": "#fbe983", // Graphite
};

function parseGCalEvents(items) {
  const result = {};
  (items||[]).filter(ev=>ev.status!=="cancelled").forEach(ev=>{
    const title=ev.summary||"Eveniment", loc=ev.location||"", hasTime=!!ev.start?.dateTime;
    const startD=parseDateLocal(ev.start?.dateTime||ev.start?.date||"");
    const endD=parseDateLocal(ev.end?.dateTime||ev.end?.date||"");
    const startDay=new Date(startD); startDay.setHours(0,0,0,0);
    const endDay=new Date(endD); endDay.setHours(0,0,0,0);
    if (!hasTime||(hasTime&&endD.getHours()===0&&endD.getMinutes()===0)) endDay.setDate(endDay.getDate()-1);
    const totalDays=Math.max(1,Math.round((endDay-startDay)/86400000)+1);
    for (let i=0;i<totalDays;i++) {
      const dayKey=toKey(addDays(startDay,i));
      const dayEventId=totalDays>1?`${ev.id}_day${i}`:ev.id;
      let startTime="",endTime="";
      if (hasTime) {
        if (i===0) startTime=startD.toLocaleTimeString("ro-RO",{hour:"2-digit",minute:"2-digit"});
        if (i===totalDays-1) endTime=endD.toLocaleTimeString("ro-RO",{hour:"2-digit",minute:"2-digit"});
      }
      const evColor = ev.colorId ? (GCAL_COLORS[ev.colorId]||null) : null;
      if (!result[dayKey]) result[dayKey]=[];
      if (!result[dayKey].find(e=>e.id===dayEventId))
        result[dayKey].push({id:dayEventId,originalId:ev.id,title,location:loc,dayKey,start:startTime,end:endTime,dayIndex:i,totalDays,isMultiDay:totalDays>1,color:evColor});
    }
  });
  Object.keys(result).forEach(k=>result[k].sort((a,b)=>(a.start||"").localeCompare(b.start||"")));
  return result;
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────

function generatePDF(crew, monthEvents, getChecked, getApproval, getAmount, label, eventColors={}) {
  // Build data
  let grandTotal = 0;
  const crewData = crew.map(member=>{
    const details = monthEvents
      .filter(ev=>getApproval(member.id,ev.id)==="approved"&&Object.values(getChecked(member.id,ev.id)).some(Boolean))
      .map(ev=>{
        const ch=getChecked(member.id,ev.id);
        const acts=getUserActions(member.id).filter(a=>ch[a.key]&&a.key!=="observatii");
        const note=typeof ch["observatii"]==="string"?ch["observatii"]:"";
        const total=acts.reduce((s,a)=>s+getAmount(member.id,ev.id,a.key),0);
        return {ev,acts,note,total};
      });
    const total=details.reduce((s,d)=>s+d.total,0);
    grandTotal+=total;
    return {member,details,total};
  }).filter(d=>d.details.length>0);

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8"/>
<title>Raport ${label}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;font-size:11px;color:#111;background:#fff;}
  .page{width:210mm;margin:0 auto;}

  .header{background:#1a1a1a;padding:8px 14mm;display:flex;align-items:center;justify-content:space-between;}
  .header img{height:14mm;}
  .header-right{text-align:right;}
  .header-right .title{color:#fff;font-size:13px;font-weight:700;}
  .header-right .date{color:#aaa;font-size:10px;margin-top:3px;}

  .summary-cards{display:grid;grid-template-columns:repeat(${crewData.length},1fr);gap:6px;margin:8mm 14mm 6mm;}
  .card{background:#e8f5ee;border-left:4px solid #1D9E75;padding:8px 10px;border-radius:4px;}
  .card .name{font-size:10px;color:#555;margin-bottom:3px;}
  .card .amount{font-size:16px;font-weight:700;color:#085041;}
  .card .days{font-size:9px;color:#888;margin-top:2px;}

  .grand-total{margin:0 14mm 8mm;background:#1D9E75;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-radius:4px;}
  .grand-total .lbl{font-size:12px;font-weight:700;}
  .grand-total .val{font-size:18px;font-weight:700;}

  .member-block{margin:0 14mm 8mm;}
  .member-header{background:#2a2a2a;color:#fff;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;border-radius:4px 4px 0 0;}
  .member-header .name{font-size:12px;font-weight:700;}
  .member-header .email{font-size:9px;color:#aaa;margin-top:2px;}
  .member-header .total{font-size:14px;font-weight:700;color:#4ade80;}

  table{width:100%;border-collapse:collapse;}
  th{background:#e8e8e6;font-size:9px;font-weight:700;text-align:left;padding:5px 6px;border:1px solid #ddd;text-transform:uppercase;letter-spacing:0.04em;}
  td{padding:5px 6px;border:1px solid #eee;font-size:10px;vertical-align:middle;}
  tr:nth-child(even) td{background:#fafafa;}
  .color-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle;}
  .act-chip{display:inline-block;background:#e8f5ee;color:#085041;padding:1px 6px;border-radius:10px;font-size:9px;margin:1px;}
  .note{font-style:italic;color:#888;font-size:9px;margin-top:2px;}
  .member-total{background:#e8f5ee;font-weight:700;font-size:11px;}
  .member-total td{border-color:#c0ddd0;padding:6px;}

  .footer{margin:8mm 14mm 0;border-top:1px solid #ddd;padding:6px 0;display:flex;justify-content:space-between;}
  .footer span{font-size:9px;color:#888;}

  @media print{
    .no-print{display:none;}
    @page{size:A4;margin:0;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <img src="${LOGO_B64}" alt="IG Vision"/>
    <div class="header-right">
      <div class="title">Raport ${label}</div>
      <div class="date">Generat: ${new Date().toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})}</div>
    </div>
  </div>

  <div class="summary-cards">
    ${crewData.map(({member,details,total})=>`
      <div class="card">
        <div class="name">${member.name}</div>
        <div class="amount">+${total.toFixed(1)} RON</div>
        <div class="days">${details.length} zile lucrate</div>
      </div>`).join("")}
  </div>

  <div class="grand-total">
    <div class="lbl">TOTAL GENERAL</div>
    <div class="val">+${grandTotal.toFixed(1)} RON</div>
  </div>

  ${crewData.map(({member,details,total})=>`
  <div class="member-block">
    <div class="member-header">
      <div><div class="name">${member.name}</div><div class="email">${member.email}</div></div>
      <div class="total">+${total.toFixed(1)} RON</div>
    </div>
    <table>
      <thead><tr><th width="60">Data</th><th>Eveniment</th><th>Locație</th><th>Acțiuni</th><th width="70" style="text-align:right">Sumă</th></tr></thead>
      <tbody>
        ${details.map(({ev,acts,note,total:evT})=>{
          const color = eventColors[ev.originalId||ev.id]||"";
          const dateStr = new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"});
          return `<tr>
            <td>${dateStr}${ev.isMultiDay?` Z${ev.dayIndex+1}`:"" }</td>
            <td>${color?`<span class="color-dot" style="background:${color}"></span>`:""}${ev.title}</td>
            <td>${ev.location||"—"}</td>
            <td>
              ${acts.map(a=>`<span class="act-chip">${a.icon} ${a.label}</span>`).join("")}
              ${note?`<div class="note">📝 ${note}</div>`:""}
            </td>
            <td style="text-align:right;font-weight:600;color:#085041">+${evT.toFixed(1)} RON</td>
          </tr>`;
        }).join("")}
        <tr class="member-total">
          <td colspan="4" style="text-align:right;padding-right:10px;">TOTAL ${member.name.split(" ")[0].toUpperCase()}</td>
          <td style="text-align:right">+${total.toFixed(1)} RON</td>
        </tr>
      </tbody>
    </table>
  </div>`).join("")}

  <div class="footer">
    <span>✉ office@igvision.ro</span>
    <span>📞 0732302810</span>
    <span>🌐 igvision.ro</span>
    <span>#ledscreen #ledscreenrental #igvision #events</span>
  </div>

</div>

<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:10px;">
  <button onclick="window.print()" style="padding:12px 24px;background:#1D9E75;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">🖨 Printează / Save PDF</button>
  <button onclick="window.close()" style="padding:12px 24px;background:#333;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer;font-family:inherit;">✕ Închide</button>
</div>

</body></html>`;

  const win = window.open("","_blank","width=900,height=700");
  if (!win) { alert("Permite pop-up-urile pentru acest site!"); return; }
  win.document.write(html);
  win.document.close();
}


// ─── ATOMS ────────────────────────────────────────────────────────────────────

function Avatar({ member, size=36 }) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:member.bg,color:member.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.3,fontWeight:700,flexShrink:0,userSelect:"none"}}>
      {member.initials}
    </div>
  );
}

function Logo({ large }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:large?"center":"flex-start",gap:large?6:2}}>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:large?32:17,fontWeight:700,letterSpacing:large?5:2,background:"linear-gradient(135deg,#777 0%,#fff 40%,#aaa 60%,#555 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",lineHeight:1,filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.5))"}}>
        ig vision<sup style={{fontSize:large?12:7,WebkitTextFillColor:"transparent",background:"inherit",WebkitBackgroundClip:"text"}}>™</sup>
      </div>
      {large&&<div style={{fontSize:11,color:"#6b7280",letterSpacing:4,textTransform:"uppercase"}}>crew tracker</div>}
    </div>
  );
}

function MultiDayPill({ dayIndex, totalDays }) {
  return <span style={{fontSize:10,background:"#eff6ff",color:"#3b82f6",padding:"2px 8px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap",border:"1px solid #bfdbfe"}}>Ziua {dayIndex+1}/{totalDays}</span>;
}

function LiveDot() {
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:"#4ade80",marginRight:4,animation:"pulse 2s infinite"}}/>
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{position:"fixed",bottom:"calc(80px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"#fff",color:"#111827",padding:"10px 22px",borderRadius:24,fontSize:13,fontWeight:500,whiteSpace:"nowrap",zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.6)",border:"1px solid #e5e7eb",maxWidth:"88vw",overflow:"hidden",textOverflow:"ellipsis"}}>
      {msg}
    </div>
  );
}

function BottomNav({ tabs, tab, setTab, pendingCount }) {
  const icons = {today:"📅",approve:"✅",report:"📊",devize:"📋",avize:"📦",analytics:"📈",settings:"⚙️"};
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #e5e7eb",display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {tabs.map(t=>{
        const active=tab===t.id;
        return (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative"}}>
            <span style={{fontSize:20}}>{icons[t.id]}</span>
            <span style={{fontSize:10,fontWeight:active?600:400,color:active?"#111827":"#555"}}>{t.label}</span>
            {active&&<div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:2,background:"#111827",borderRadius:2}}/>}
            {t.id==="approve"&&pendingCount>0&&<span style={{position:"absolute",top:6,right:"22%",width:16,height:16,borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{pendingCount}</span>}
          </button>
        );
      })}
    </div>
  );
}

function DayNav({ day, setDay, compact }) {
  const today=new Date(); today.setHours(0,0,0,0);
  const isToday=toKey(day)===toKey(today);
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:compact?12:16}}>
      <button onClick={()=>setDay(addDays(day,-1))} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#6b7280",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{fontSize:compact?14:15,fontWeight:700,color:"#111827",textTransform:"capitalize"}}>{compact?fmtDateShort(day):fmtDate(day)}</div>
        {isToday&&<span style={{fontSize:10,background:"#16a34a",color:"#fff",padding:"1px 8px",borderRadius:20,fontWeight:600,display:"inline-block",marginTop:2}}>azi</span>}
      </div>
      <button onClick={()=>setDay(addDays(day,1))} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#6b7280",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
    </div>
  );
}

function EmptyDay({ loading }) {
  return (
    <div style={{textAlign:"center",padding:"48px 20px",color:"#9ca3af",fontSize:14}}>
      <div style={{fontSize:36,marginBottom:12}}>{loading?"⏳":"📭"}</div>
      {loading?"Se încarcă din Google Calendar...":"Nicio activare în această zi"}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user,       setUser]      = useState(()=>{ const s=load("ct_session",null); return s?TEAM.find(t=>t.id===s)||null:null; });
  const [day,        setDay]       = useState(new Date());
  const [tab,        setTab]       = useState("today");
  const [selEvent,   setSelEvent]  = useState(null);
  const [toast,      setToast]     = useState(null);
  const [gcalEvents, setGcalEvents]= useState({});
  const [calLoading, setCalLoading]= useState(false);
  const [calError,   setCalError]  = useState(null);

  // Firebase live state
  const [checked,     setChecked]     = useState({});
  const [approvals,   setApprovals]   = useState({});
  const [eventColors, setEventColors] = useState({});
  const prevApprovals  = useRef({});
  const prevChecked    = useRef({});
  const initialLoad    = useRef({ checked: true, approvals: true });

  // Session
  useEffect(()=>{ user?save("ct_session",user.id):localStorage.removeItem("ct_session"); },[user]);

  // Listen Firebase live
  useEffect(()=>{
    const unsub1 = listenChecked(data=>{
      if (initialLoad.current.checked) {
        initialLoad.current.checked = false;
        prevChecked.current = data;
        setChecked(data);
        return;
      }
      // Notify chief if new actions submitted
      if (user?.isChief) {
        Object.entries(data).forEach(([uid,evMap])=>{
          Object.entries(evMap).forEach(([eid,acts])=>{
            const prev = prevChecked.current[uid]?.[eid]||{};
            const prevCount = Object.values(prev).filter(Boolean).length;
            const newCount  = Object.values(acts).filter(Boolean).length;
            if (newCount > prevCount) {
              const member = TEAM.find(m=>m.id===uid);
              if (member && uid !== user.id) showToast(`🔔 ${member.name.split(" ")[0]} a bifat acțiuni noi!`, "default");
            }
          });
        });
      }
      prevChecked.current = data;
      setChecked(data);
    });
    const unsub2 = listenApprovals(data=>{
      if (initialLoad.current.approvals) {
        initialLoad.current.approvals = false;
        prevApprovals.current = data;
        setApprovals(data);
        return;
      }
      // Notify tech if their actions got approved/rejected
      if (user && !user.isChief && !user.isViewer) {
        const myPrev = prevApprovals.current[user.id]||{};
        const myNew  = data[user.id]||{};
        Object.entries(myNew).forEach(([eid,{status}])=>{
          const prevStatus = myPrev[eid]?.status;
          if (status && status!==prevStatus) {
            showToast(status==="approved"?"✅ Ionuț ți-a aprobat acțiunile!":"❌ Ionuț a respins acțiunile.", status==="approved"?"approved":"rejected");
          }
        });
      }
      prevApprovals.current = data;
      setApprovals(data);
    });
    const unsub3 = listenEventColors(data => setEventColors(data));
    return ()=>{ unsub1(); unsub2(); unsub3(); };
  },[user]);

  // Google Calendar fetch
  useEffect(()=>{
    const from=new Date(day.getFullYear(),day.getMonth()-1,1);
    const to=new Date(day.getFullYear(),day.getMonth()+2,0);
    setCalLoading(true); setCalError(null);
    fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${CALENDAR_API_KEY}&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=500`)
      .then(r=>r.json())
      .then(data=>{ if(data.error){setCalError(data.error.message);setCalLoading(false);return;} setGcalEvents(parseGCalEvents(data.items)); setCalLoading(false); })
      .catch(e=>{ setCalError(e.message); setCalLoading(false); });
  },[day.getMonth(),day.getFullYear()]);

  function playBeep(type = "default") {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "approved") {
        // Two ascending tones — approval
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.setValueAtTime(780, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === "rejected") {
        // Low descending tone — rejection
        osc.frequency.setValueAtTime(380, ctx.currentTime);
        osc.frequency.setValueAtTime(240, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        // Short neutral beep — new action notification
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }
      ctx.close();
    } catch(e) {}
  }

  function showToast(msg, sound = "default") {
    setToast(msg);
    setTimeout(()=>setToast(null),3000);
    playBeep(sound);
  }

  const dayKey = toKey(day);
  const events = gcalEvents[dayKey]||[];

  const getChecked  = (uid,eid)    => checked[uid]?.[eid]||{};
  const getApproval = (uid,eid)    => approvals[uid]?.[eid]?.status??null;
  const customBonuses = load("ct_custom_bonuses",{});
  const getAmount = (uid,eid,ak) => approvals[uid]?.[eid]?.amounts?.[ak] ?? customBonuses[uid]?.[ak] ?? getUserBonuses(uid)[ak] ?? DEFAULT_BONUSES[ak];

  async function toggleMyAction(eid, ak, textVal) {
    if (getApproval(user.id,eid)==="approved") return;
    const current = getChecked(user.id,eid);
    // For observatii: store text string; for others: toggle boolean
    const newVal = textVal !== undefined ? textVal : !current[ak];
    const updated = { ...current, [ak]: newVal };
    setChecked(prev=>{ const u={...(prev[user.id]||{})}; u[eid]=updated; return {...prev,[user.id]:u}; });
    await saveChecked(user.id, eid, updated);
  }

  async function setApprovalStatus(uid, eid, status, amounts) {
    const amts = amounts || (approvals[uid]?.[eid]?.amounts) || {};
    await saveApproval(uid, eid, status, amts);
    showToast(status==="approved"?"✓ Aprobat":status==="rejected"?"✗ Respins":"↩ Anulat", status==="approved"?"approved":status==="rejected"?"rejected":"default");
  }

  async function submitApproval(uid, eid, amounts) {
    await saveApproval(uid, eid, "approved", amounts);
    showToast("✓ Aprobat!");
  }

  function calcBonus(uid, eid) {
    return Object.entries(getChecked(uid,eid)).filter(([,v])=>v).reduce((s,[k])=>s+getAmount(uid,eid,k),0);
  }
  function calcDayTotal(uid) {
    return events.reduce((s,ev)=>s+(getApproval(uid,ev.id)==="approved"?calcBonus(uid,ev.id):0),0);
  }
  function getPendingCount() {
    return TEAM.filter(m=>!m.isChief&&!m.isViewer).reduce((t,m)=>
      t+events.filter(ev=>Object.values(getChecked(m.id,ev.id)).some(Boolean)&&!getApproval(m.id,ev.id)).length,0);
  }

  // ── Presence tracking — must be before any conditional return ────────────
  const [onlineUsers, setOnlineUsers] = useState({});
  useEffect(()=>{
    if (!user) return;
    const presRef = doc(db,"presence",user.id);
    setDoc(presRef,{uid:user.id,name:user.name,online:true,lastSeen:serverTimestamp()});
    const hb = setInterval(()=>setDoc(presRef,{uid:user.id,name:user.name,online:true,lastSeen:serverTimestamp()}),30000);
    const markOffline = ()=>setDoc(presRef,{uid:user.id,name:user.name,online:false,lastSeen:serverTimestamp()});
    window.addEventListener("beforeunload", markOffline);
    window.addEventListener("pagehide", markOffline);
    const unsub = onSnapshot(collection(db,"presence"), snap=>{
      const map={};
      snap.forEach(d=>{ const data=d.data(); if(data.online) map[d.id]=data; });
      setOnlineUsers(map);
    });
    return ()=>{ clearInterval(hb); markOffline(); window.removeEventListener("beforeunload",markOffline); window.removeEventListener("pagehide",markOffline); unsub(); };
  },[user?.id]);

  if (!user) return <><LoginScreen onLogin={m=>{setUser(m);showToast(`Bun venit, ${m.name.split(" ")[0]}! 👋`);}}/><Toast msg={toast}/></>;

  let tabs=[];
  if      (user.isViewer) tabs=[{id:"report",label:"Raport"}];
  else if (user.isChief)  tabs=[{id:"today",label:"Azi"},{id:"approve",label:"Aprobare"},{id:"report",label:"Raport"},{id:"devize",label:"Devize"},{id:"avize",label:"Avize"},{id:"analytics",label:"Business"},{id:"settings",label:"Setări"}];
  else                    tabs=[{id:"today",label:"Azi"},{id:"report",label:"Raport"},{id:"avize",label:"Avize"},{id:"settings",label:"Setări"}];
  if (user.isViewer&&!["report","devize","avize","analytics"].includes(tab)) setTab("report");
  // Viewers also get devize tab
  if (user.isViewer) tabs=[{id:"report",label:"Raport"},{id:"devize",label:"Devize"},{id:"avize",label:"Avize"},{id:"analytics",label:"Business"}];

  const pending = user.isChief?getPendingCount():0;
  const shared  = {user,day,setDay:d=>{setDay(d);setSelEvent(null);},events,gcalEvents,getChecked,getApproval,getAmount,calcBonus,calcDayTotal,showToast,calLoading,calError,eventColors,saveEventColor};
  const sidebarIcons = {
    today:"ti-calendar",approve:"ti-checks",report:"ti-chart-bar",
    devize:"ti-file-text",avize:"ti-package",analytics:"ti-trending-up",settings:"ti-settings"
  };
  const sidebarLabels = {today:"Azi",approve:"Aprobare",report:"Raport",devize:"Devize",avize:"Avize",analytics:"Business",settings:"Setări"};

  return (
    <div style={{minHeight:"100dvh",display:"flex",background:"#f0f4fa"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .nav-item{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:9px;cursor:pointer;transition:all 0.15s;color:#9ca3af;font-size:13px;font-weight:500;border:none;background:none;width:100%;text-align:left;}
        .nav-item:hover{background:rgba(255,255,255,0.07);color:#e5e7eb;}
        .nav-item.active{background:rgba(96,165,250,0.15);color:#fff;}
        .nav-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0;}
        .content-area{animation:slideIn 0.18s ease}
        @media(max-width:768px){.sidebar-wrap{display:none!important}.mobile-bar{display:flex!important}.bottom-nav-bar{display:flex!important}}
        @media(min-width:769px){.mobile-bar{display:none!important}.bottom-nav-bar{display:none!important}.sidebar-wrap{display:flex!important}}
      `}</style>

      {/* ── SIDEBAR desktop ── */}
      <div className="sidebar-wrap" style={{width:220,flexShrink:0,background:"#111827",flexDirection:"column",height:"100dvh",position:"sticky",top:0,paddingTop:"env(safe-area-inset-top)"}}>
        <div style={{padding:"18px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          <img src={LOGO_B64} alt="IG Vision" style={{height:26,objectFit:"contain",filter:"brightness(1.15)",display:"block"}}/>
          <div style={{fontSize:9,color:"#4b5563",letterSpacing:"2.5px",marginTop:6,fontWeight:600,textTransform:"uppercase"}}>Crew Tracker</div>
        </div>
        <nav style={{flex:1,padding:"10px 10px",overflowY:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`nav-item${tab===t.id?" active":""}`}>
              <i className={`ti ${sidebarIcons[t.id]}`} style={{fontSize:16,width:22,textAlign:"center",flexShrink:0}}></i>
              <span style={{flex:1}}>{sidebarLabels[t.id]||t.label}</span>
              {t.id==="approve"&&pending>0&&<span style={{background:"#ef4444",color:"#fff",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{pending}</span>}
            </button>
          ))}
        </nav>

        {/* Online members */}
        {Object.keys(onlineUsers).filter(id=>id!==user.id).length>0&&(
          <div style={{padding:"8px 12px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{fontSize:9,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,fontWeight:600}}>Online acum</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.values(onlineUsers).filter(u=>u.uid!==user.id).map(u=>{
                const member = TEAM.find(t=>t.id===u.uid);
                if (!member) return null;
                return (
                  <div key={u.uid} style={{position:"relative"}} title={member.name}>
                    <Avatar member={member} size={28}/>
                    <div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:"#22c55e",border:"2px solid #111827"}}/>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{padding:"10px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:9,background:"rgba(255,255,255,0.05)"}}>
            <Avatar member={user} size={28}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"#f9fafb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name.split(" ")[0]}</div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}><LiveDot/><span style={{fontSize:10,color:"#16a34a",fontWeight:500}}>Live</span></div>
            </div>
            <button onClick={()=>{setUser(null);setTab("today");setSelEvent(null);}} title="Ieși"
              style={{background:"none",border:"none",cursor:"pointer",color:"#6b7280",fontSize:18,padding:0,lineHeight:1}}>↩</button>
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* Mobile header */}
        <div className="mobile-bar" style={{background:"#111827",padding:"10px 16px",alignItems:"center",justifyContent:"space-between",paddingTop:"calc(10px + env(safe-area-inset-top))",position:"sticky",top:0,zIndex:50,borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          <img src={LOGO_B64} alt="IG Vision" style={{height:26,objectFit:"contain"}}/>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <LiveDot/><span style={{fontSize:10,color:"#16a34a",fontWeight:500}}>Live</span>
            <div style={{position:"relative"}}>
              <Avatar member={user} size={26}/>
              <div style={{position:"absolute",bottom:0,right:0,width:8,height:8,borderRadius:"50%",background:"#22c55e",border:"2px solid #111827"}}/>
            </div>
            <button onClick={()=>{setUser(null);setTab("today");setSelEvent(null);}} style={{background:"none",border:"1px solid #374151",borderRadius:6,padding:"3px 8px",fontSize:11,color:"#9ca3af",cursor:"pointer"}}>Ieși</button>
          </div>
        </div>

        {/* Content */}
        <div key={tab} className="content-area" style={{flex:1,overflowY:"auto",paddingBottom:"calc(72px + env(safe-area-inset-bottom))"}}>
          {tab==="today"   &&!user.isViewer&&<TodayView   {...shared} selEvent={selEvent} setSelEvent={setSelEvent} toggleMyAction={toggleMyAction}/>}
          {tab==="approve" && user.isChief &&<ApproveView gcalEvents={gcalEvents} getChecked={getChecked} getApproval={getApproval} setApprovalStatus={setApprovalStatus} submitApproval={submitApproval} getAmount={getAmount} calcBonus={calcBonus} calLoading={calLoading}/>}
          {tab==="report"                  &&<ReportView  user={user} gcalEvents={gcalEvents} getChecked={getChecked} getApproval={getApproval} getAmount={getAmount} eventColors={eventColors}/>}
          {tab==="settings"&&!user.isViewer&&<SettingsView user={user}/>}
          {tab==="devize"&&(user.isChief||user.isViewer)&&<DevizeView user={user} gcalEvents={gcalEvents}/>}
          {tab==="avize"&&<AvizeView user={user} gcalEvents={gcalEvents}/>}
          {tab==="analytics"&&(user.isChief||user.isViewer)&&<RaportBusiness/>}
        </div>

        {/* Mobile bottom nav */}
        <div className="bottom-nav-bar" style={{position:"fixed",bottom:0,left:0,right:0,background:"#111827",borderTop:"1px solid rgba(255,255,255,0.08)",zIndex:50,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {tabs.map(t=>{
            const active=tab===t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{flex:1,padding:"10px 2px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
                <i className={`ti ${sidebarIcons[t.id]}`} style={{fontSize:19,color:active?"#60a5fa":"#6b7280"}}></i>
                <span style={{fontSize:9,fontWeight:active?600:400,color:active?"#60a5fa":"#6b7280"}}>{sidebarLabels[t.id]||t.label}</span>
                {active&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:"#60a5fa",borderRadius:2}}/>}
                {t.id==="approve"&&pending>0&&<span style={{position:"absolute",top:5,right:"15%",width:14,height:14,borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{pending}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Toast msg={toast}/>
    </div>
  );
}


// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [showPwd,setShowPwd]=useState(false); const [error,setError]=useState("");
  const [loading,setLoading]=useState(false); const [step,setStep]=useState("email");

  function next() {
    const t=email.trim().toLowerCase();
    if (!t){setError("Introdu adresa de email.");return;}
    if (!TEAM.find(m=>m.email.toLowerCase()===t)){setError("Email nerecunoscut.");return;}
    setError(""); setStep("password");
  }
  function login() {
    const m=TEAM.find(x=>x.email.toLowerCase()===email.trim().toLowerCase());
    if (!m) return;
    if (password!==m.password){setError("Parolă incorectă.");setPassword("");return;}
    setLoading(true); setTimeout(()=>{onLogin(m);setLoading(false);},300);
  }
  const cur=step==="password"?TEAM.find(m=>m.email.toLowerCase()===email.trim().toLowerCase()):null;

  return (
    <div style={{minHeight:"100dvh",background:"#111827",display:"flex"}}>
      {/* Left decorative panel - desktop only */}
      <div style={{width:"45%",background:"linear-gradient(135deg,#1e3a5f 0%,#111827 100%)",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40}} className="login-left">
        <img src={LOGO_B64} alt="IG Vision" style={{height:48,objectFit:"contain",filter:"brightness(1.2)",marginBottom:24}}/>
        <div style={{fontSize:13,color:"#60a5fa",letterSpacing:4,textTransform:"uppercase",marginBottom:8}}>Crew Tracker</div>
        <div style={{fontSize:13,color:"#6b7280",textAlign:"center",maxWidth:260,lineHeight:1.6}}>Gestionează echipa, evenimentele și ofertele în timp real.</div>
      </div>
      {/* Right login form */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 20px calc(20px + env(safe-area-inset-bottom))"}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src={LOGO_B64} alt="IG Vision" style={{height:44,objectFit:"contain",marginBottom:10}}/>
          <div style={{fontSize:10,color:"#4b5563",letterSpacing:4,textTransform:"uppercase"}}>crew tracker</div>
        </div>
        <div style={{background:"#1f2937",borderRadius:16,padding:28,border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
          {step==="email"&&(
            <>
              <label style={{fontSize:11,fontWeight:600,color:"#9ca3af",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Email</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&next()} placeholder="adresa@gmail.com" autoFocus
                style={{width:"100%",padding:"13px 14px",borderRadius:10,border:error?"1px solid #ef4444":"1px solid rgba(255,255,255,0.1)",fontSize:15,color:"#f9fafb",outline:"none",background:"rgba(255,255,255,0.05)",marginBottom:error?8:16,boxSizing:"border-box"}}/>
              {error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠ {error}</div>}
              <button onClick={next} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"#3b82f6",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Continuă →</button>
            </>
          )}
          {step==="password"&&cur&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(255,255,255,0.05)",borderRadius:10,marginBottom:20,border:"1px solid rgba(255,255,255,0.08)"}}>
                <Avatar member={cur} size={36}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#f9fafb"}}>{cur.name}</div>
                  <div style={{fontSize:11,color:"#6b7280"}}>{cur.email}</div>
                </div>
                <button onClick={()=>{setStep("email");setPassword("");setError("");}} style={{fontSize:11,color:"#9ca3af",background:"none",border:"none",cursor:"pointer"}}>Schimbă</button>
              </div>
              <label style={{fontSize:11,fontWeight:600,color:"#9ca3af",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Parolă</label>
              <div style={{position:"relative",marginBottom:error?8:20}}>
                <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}}
                  onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" autoFocus
                  style={{width:"100%",padding:"13px 48px 13px 14px",borderRadius:10,border:error?"1px solid #ef4444":"1px solid rgba(255,255,255,0.1)",fontSize:15,color:"#f9fafb",outline:"none",background:"rgba(255,255,255,0.05)",boxSizing:"border-box"}}/>
                <button onClick={()=>setShowPwd(!showPwd)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#6b7280",padding:0,lineHeight:1}}>
                  {showPwd?"🙈":"👁"}
                </button>
              </div>
              {error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠ {error}</div>}
              <button onClick={login} disabled={loading}
                style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:loading?"#1e3a5f":"#3b82f6",color:"#fff",fontSize:15,fontWeight:600,cursor:loading?"default":"pointer"}}>
                {loading?"Se verifică...":"Intră →"}
              </button>
            </>
          )}
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#4b5563"}}>www.igvision.ro</div>
      </div>
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────

function TodayView({ user, day, setDay, events, selEvent, setSelEvent, getChecked, toggleMyAction, getApproval, getAmount, calcBonus, calcDayTotal, showToast, calLoading, calError, eventColors, saveEventColor }) {
  const selEv   = selEvent?events.find(e=>e.id===selEvent):null;
  const myCheck = selEv?getChecked(user.id,selEv.id):{};
  const approval= selEv?getApproval(user.id,selEv.id):null;
  const isLocked= approval==="approved"||approval==="rejected";
  const myActions=getUserActions(user.id);
  const myTotal = selEv?Object.entries(myCheck).filter(([,v])=>v).reduce((s,[k])=>s+getAmount(user.id,selEv.id,k),0):0;
  const [showColorPicker, setShowColorPicker] = useState(null); // eventId

  const COLOR_PALETTE = [
    "#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c",
    "#3498db","#9b59b6","#e91e63","#ff5722","#607d8b",
    "#795548","#00bcd4","#8bc34a","#ff9800","#9e9e9e",
  ];

  function getEvColor(ev) {
    return eventColors[ev.originalId||ev.id] || ev.color || null;
  }

  async function handleColorSelect(ev, color) {
    await saveEventColor(ev.originalId||ev.id, color);
    setShowColorPicker(null);
  }

  if (selEv) return (
    <div style={{padding:"16px 16px 24px",background:"#f0f4fa",minHeight:"100vh"}}>
      <button onClick={()=>setSelEvent(null)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,marginBottom:16,padding:0}}>
        ‹ <span>Înapoi</span>
      </button>
      <div style={{background:"#fff",borderRadius:12,marginBottom:12,border:"1px solid #e5e7eb",borderLeft:`3px solid ${getEvColor(selEv)||"#3b82f6"}`,overflow:"hidden",boxShadow:getEvColor(selEv)?`0 2px 16px ${getEvColor(selEv)}33`:"0 1px 4px rgba(0,0,0,0.06)"}}>
        
        <div style={{padding:14}}>
        <div style={{fontSize:17,fontWeight:700,color:getEvColor(selEv)||"#111827",marginBottom:6}}>{selEv.title}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {selEv.isMultiDay&&<MultiDayPill dayIndex={selEv.dayIndex} totalDays={selEv.totalDays}/>}
          {selEv.location&&<span style={{fontSize:12,color:"#6b7280"}}>📍 {selEv.location}</span>}
          {selEv.start&&<span style={{fontSize:12,color:"#6b7280"}}>{selEv.start}{selEv.end?`–${selEv.end}`:""}</span>}
        </div>
        </div>
      </div>
      {approval&&(
        <div style={{padding:"12px 16px",borderRadius:12,background:approval==="approved"?"#f0fdf4":"#fef2f2",fontSize:13,fontWeight:500,color:approval==="approved"?"#16a34a":"#dc2626",border:`1px solid ${approval==="approved"?"#bbf7d0":"#fecaca"}`,marginBottom:12}}>
          {approval==="approved"?"✅ Acțiunile tale au fost aprobate.":"❌ Acțiunile au fost respinse. Contactează Crew Chief."}
        </div>
      )}
      <div style={{fontSize:11,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
        {isLocked?"Acțiunile bifate":"Ce ai făcut AZI?"}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {myActions.map(action=>{
          const on=!!myCheck[action.key];
          // Observatii — text input
          if (action.key==="observatii") {
            const noteVal = typeof myCheck["observatii"]==="string" ? myCheck["observatii"] : "";
            return (
              <div key="observatii" style={{borderRadius:14,border:"1px solid #e5e7eb",background:"#fff",overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
                  <span style={{fontSize:20}}>📝</span>
                  <span style={{fontSize:15,color:"#374151"}}>Observații</span>
                </div>
                {!isLocked ? (
                  <textarea value={noteVal}
                    onChange={e=>toggleMyAction(selEv.id,"observatii",e.target.value)}
                    placeholder="Scrie observații..."
                    rows={3}
                    style={{width:"100%",padding:"10px 16px",background:"#f8fafc",border:"none",borderTop:"1px solid #e5e7eb",color:"#374151",fontSize:14,resize:"none",outline:"none",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.5}}
                  />
                ) : noteVal ? (
                  <div style={{padding:"8px 16px 12px",fontSize:13,color:"#6b7280",fontStyle:"italic",borderTop:"1px solid #e5e7eb"}}>"{noteVal}"</div>
                ) : null}
              </div>
            );
          }
          return (
            <div key={action.key} onClick={()=>!isLocked&&toggleMyAction(selEv.id,action.key)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:14,border:`1.5px solid ${on?"#16a34a":"#e5e7eb"}`,background:on?"#f0fdf4":"#fff",cursor:isLocked?"default":"pointer",opacity:isLocked&&!on?0.35:1,transition:"all 0.1s"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:22}}>{action.icon}</span>
                <span style={{fontSize:16,fontWeight:on?500:400,color:on?"#15803d":"#374151"}}>{action.label}</span>
              </div>
              <div style={{width:26,height:26,borderRadius:8,border:on?"none":"2px solid #333",background:on?"#16a34a":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#111",fontSize:14,fontWeight:700,flexShrink:0}}>
                {on&&"✓"}
              </div>
            </div>
          );
        })}
      </div>
      {!isLocked&&(
        <>
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280"}}>
              <span>Acțiuni bifate</span>
              <span style={{fontWeight:600,color:"#6b7280"}}>{Object.values(myCheck).filter(Boolean).length} / {myActions.length}</span>
            </div>
            {user.isChief&&myTotal>0&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,marginTop:10,borderTop:"1px solid #e5e7eb"}}>
                <span style={{fontSize:14,color:"#6b7280"}}>Total estimat</span>
                <span style={{fontSize:22,fontWeight:700,color:"#16a34a"}}>+{fmtRON(myTotal)}</span>
              </div>
            )}
          </div>
          <button onClick={()=>{showToast("✅ Trimis spre aprobare!"); setSelEvent(null);}}
            style={{width:"100%",padding:"16px",borderRadius:14,border:"none",background:"#2563eb",color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:8,boxShadow:"0 2px 8px rgba(37,99,235,0.3)"}}>
            Trimite spre aprobare →
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{padding:"16px 16px 24px",background:"#f0f4fa",minHeight:"100vh"}}>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:"#6b7280",letterSpacing:"1px",fontWeight:500,textTransform:"uppercase"}}>{new Date(day+"T12:00:00").toLocaleDateString("ro-RO",{weekday:"long"})}</div>
            <div style={{fontSize:22,fontWeight:500,color:"#111827",letterSpacing:"-0.3px"}}>{new Date(day+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setDay(prevDay(day))} style={{width:32,height:32,borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:14,color:"#6b7280",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <button onClick={()=>setDay(todayKey())} style={{padding:"0 12px",height:32,borderRadius:8,border:"1px solid #e5e7eb",background:day===todayKey()?"#111827":"#fff",color:day===todayKey()?"#fff":"#111827",fontSize:12,cursor:"pointer",fontWeight:500}}>Azi</button>
            <button onClick={()=>setDay(nextDay(day))} style={{width:32,height:32,borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:14,color:"#6b7280",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:"#6b7280",letterSpacing:"0.5px",marginBottom:4,fontWeight:500,textTransform:"uppercase"}}>Evenimente</div>
            <div style={{fontSize:22,fontWeight:500,color:"#111827"}}>{events.length}</div>
          </div>
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:"#6b7280",letterSpacing:"0.5px",marginBottom:4,fontWeight:500,textTransform:"uppercase"}}>Bifate</div>
            <div style={{fontSize:22,fontWeight:500,color:"#111827"}}>{events.filter(ev=>Object.values(getChecked(user.id,ev.id)||{}).some(Boolean)).length}<span style={{fontSize:12,color:"#9ca3af",fontWeight:400}}> / {events.length}</span></div>
          </div>
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:"#6b7280",letterSpacing:"0.5px",marginBottom:4,fontWeight:500,textTransform:"uppercase"}}>Bonus estimat</div>
            <div style={{fontSize:22,fontWeight:500,color:"#059669"}}>+{calcDayTotal(user.id).toFixed(0)}<span style={{fontSize:12,color:"#9ca3af",fontWeight:400}}> RON</span></div>
          </div>
        </div>
      </div>
      {calError&&<div style={{background:"#2a1515",border:"1px solid #5a2020",borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#f87171"}}>⚠ {calError}</div>}
      <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"8px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
        <LiveDot/><span style={{fontSize:12,color:"#9ca3af"}}>Google Calendar</span>
        <span style={{fontSize:12,color:"#9ca3af",marginLeft:"auto"}}>{calLoading?"Se încarcă...":`${events.length} activăr${events.length===1?"e":"i"}`}</span>
      </div>
      {(events.length===0||calLoading)&&<EmptyDay loading={calLoading}/>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {events.map(ev=>{
          const ch=getChecked(user.id,ev.id);
          const done=Object.entries(ch).filter(([,v])=>v).map(([k])=>k);
          const appr=getApproval(user.id,ev.id);
          const bonus=calcBonus(user.id,ev.id);
          return (
            <div key={ev.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderLeft:`3px solid ${getEvColor(ev)||"#e5e7eb"}`,borderRadius:12,overflow:"hidden",position:"relative",boxShadow:getEvColor(ev)?`0 2px 12px ${getEvColor(ev)}22`:"0 1px 4px rgba(0,0,0,0.06)"}}>
              
              <div style={{padding:"12px 14px"}} onClick={()=>setSelEvent(ev.id)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                <span style={{fontSize:15,fontWeight:600,color:getEvColor(ev)||"#111827",lineHeight:1.3}}>{ev.title}</span>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  {ev.start&&<span style={{fontSize:11,color:"#6b7280",whiteSpace:"nowrap"}}>{ev.start}{ev.end?`–${ev.end}`:""}</span>}
                  {user.isChief&&<button onClick={e=>{e.stopPropagation();setShowColorPicker(showColorPicker===ev.id?null:ev.id);}}
                    style={{width:22,height:22,borderRadius:"50%",border:getEvColor(ev)?"3px solid #fff":"2px solid #d1d5db",background:getEvColor(ev)||"#e5e7eb",cursor:"pointer",flexShrink:0,padding:0,boxShadow:getEvColor(ev)?"0 0 0 1px "+getEvColor(ev):"none"}}/>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:6}}>
                {ev.isMultiDay&&<MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays}/>}
                {ev.location&&<span style={{fontSize:12,color:"#6b7280"}}>📍 {ev.location}</span>}
              </div>
              {(done.length>0||appr)&&(
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {appr==="approved"&&<span style={{fontSize:11,background:"#f0fdf4",color:"#16a34a",padding:"2px 8px",borderRadius:20,fontWeight:500,border:"1px solid #bbf7d0"}}>✓ aprobat{user.isChief?` · +${fmtRON(bonus)}`:""}</span>}
                  {appr==="rejected"&&<span style={{fontSize:11,background:"#fef2f2",color:"#dc2626",padding:"2px 8px",borderRadius:20,fontWeight:500}}>✗ respins</span>}
                  {!appr&&done.length>0&&<span style={{fontSize:11,color:"#b45309",fontWeight:500}}>⏳ în așteptare</span>}
                  {done.map(k=><span key={k} style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#f0fdf4",color:"#166534",fontWeight:500,border:"1px solid #bbf7d0"}}>✓ {ACTIONS.find(a=>a.key===k)?.label}</span>)}
                </div>
              )}
              <div style={{textAlign:"right"}}><span style={{fontSize:12,color:"#9ca3af"}}>Bifează ›</span></div>
              </div>
              {showColorPicker===ev.id&&(
                <div style={{padding:"12px 14px",background:"#f8fafc",borderTop:"1px solid #e5e7eb"}} onClick={e=>e.stopPropagation()}>
                  <div style={{fontSize:11,color:"#9ca3af",marginBottom:8}}>Alege culoarea evenimentului:</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    {COLOR_PALETTE.map(c=>(
                      <button key={c} onClick={()=>handleColorSelect(ev,c)}
                        style={{width:28,height:28,borderRadius:"50%",border:getEvColor(ev)===c?"3px solid #fff":"2px solid transparent",background:c,cursor:"pointer",padding:0,flexShrink:0}}/>
                    ))}
                    <button onClick={()=>handleColorSelect(ev,null)}
                      style={{width:28,height:28,borderRadius:"50%",border:"2px solid #444",background:"transparent",cursor:"pointer",padding:0,fontSize:14,color:"#9ca3af",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {events.length>0&&user.isChief&&(
        <div style={{margin:"16px 0 0",background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#6b7280"}}>Total aprobat azi</span>
          <span style={{fontSize:20,fontWeight:700,color:"#16a34a"}}>+{fmtRON(calcDayTotal(user.id))}</span>
        </div>
      )}
    </div>
  );
}

// ─── APPROVE VIEW ─────────────────────────────────────────────────────────────

function ApproveView({ user, gcalEvents, getChecked, getApproval, setApprovalStatus, submitApproval, getAmount, calcBonus, calLoading }) {
  const [editOpen,  setEditOpen]   = useState(null); // "uid_eid"
  const [editAmounts,setEditAmounts]= useState({});
  const members = TEAM.filter(m=>!m.isChief&&!m.isViewer);

  // Collect ALL pending actions across all loaded calendar days
  const allDays = Object.values(gcalEvents).flat();
  const pendingItems = [];
  const approvedItems = [];

  members.forEach(member=>{
    const userActions=getUserActions(member.id);
    allDays.forEach(ev=>{
      const ch=getChecked(member.id,ev.id);
      const activeActs=userActions.filter(a=>ch[a.key]);
      if (!activeActs.length) return;
      const appr=getApproval(member.id,ev.id);
      const item={member,ev,activeActs,appr};
      if (appr==="approved") approvedItems.push(item);
      else pendingItems.push(item);
    });
  });

  function getEdit(uid,eid,ak){ return editAmounts[`${uid}-${eid}-${ak}`]??getAmount(uid,eid,ak); }
  function setEdit(uid,eid,ak,val){ setEditAmounts(p=>({...p,[`${uid}-${eid}-${ak}`]:val})); }

  async function doApprove(uid,eid,activeActs) {
    const amounts={};
    activeActs.forEach(a=>{ amounts[a.key]=Number(getEdit(uid,eid,a.key)); });
    await submitApproval(uid,eid,amounts);
    setEditOpen(null);
  }
  async function approveAll() {
    for (const {member,ev,activeActs} of pendingItems) {
      const amounts={};
      activeActs.forEach(a=>{ amounts[a.key]=getAmount(member.id,ev.id,a.key); });
      await submitApproval(member.id,ev.id,amounts);
    }
  }

  return (
    <div style={{padding:"16px 16px 24px",background:"#f0f4fa",minHeight:"100vh"}}>

      {/* Pending section */}
      {calLoading && <EmptyDay loading/>}

      {!calLoading && pendingItems.length===0 && approvedItems.length===0 && (
        <EmptyDay/>
      )}

      {pendingItems.length>0 && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em"}}>
              {pendingItems.length} în așteptare
            </div>
            <button onClick={approveAll}
              style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,cursor:"pointer"}}>
              ✓ Aprobă tot
            </button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            {pendingItems.map(({member,ev,activeActs})=>{
              const key=`${member.id}_${ev.id}`;
              const isOpen=editOpen===key;
              const editTotal=activeActs.reduce((s,a)=>s+Number(getEdit(member.id,ev.id,a.key)),0);
              const bonus=calcBonus(member.id,ev.id);
              const dateLabel=new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"});
              return (
                <div key={key} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"12px 14px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:10}}>
                    <Avatar member={member} size={34}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#111827"}}>{member.name}</div>
                      <div style={{fontSize:11,color:"#6b7280"}}>{ev.title} · {dateLabel}{ev.isMultiDay?` · Z${ev.dayIndex+1}`:""}</div>
                    </div>
                    <span style={{fontSize:11,background:"#fffbeb",color:"#b45309",padding:"2px 8px",borderRadius:20,fontWeight:500}}>⏳</span>
                  </div>
                  {/* Body */}
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                      {activeActs.map(a=>(
                        <span key={a.key} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"#1a2e1a",color:"#16a34a",fontWeight:500}}>
                          {a.icon} {a.label} · {fmtRON(getAmount(member.id,ev.id,a.key))}
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:18,fontWeight:700,color:"#16a34a"}}>+{fmtRON(bonus)}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditOpen(isOpen?null:key)}
                          style={{fontSize:12,padding:"7px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"transparent",color:"#6b7280",cursor:"pointer"}}>
                          ✏️ Modifică
                        </button>
                        <button onClick={()=>doApprove(member.id,ev.id,activeActs)}
                          style={{fontSize:12,padding:"7px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,cursor:"pointer"}}>
                          ✓ Aprobă
                        </button>
                        <button onClick={()=>setApprovalStatus(member.id,ev.id,"rejected",{})}
                          style={{fontSize:12,padding:"7px 12px",borderRadius:8,border:"1px solid #ef4444",background:"transparent",color:"#ef4444",cursor:"pointer"}}>
                          ✗
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Edit amounts panel */}
                  {isOpen && (
                    <div style={{padding:"14px",background:"#f8fafc",borderTop:"1px solid #e5e7eb"}}>
                      <div style={{fontSize:12,color:"#9ca3af",marginBottom:12}}>Modifică suma per acțiune:</div>
                      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                        {activeActs.map(a=>(
                          <div key={a.key} style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:18}}>{a.icon}</span>
                            <span style={{fontSize:14,flex:1,color:"#374151",fontWeight:500}}>{a.label}</span>
                            <input type="number" value={getEdit(member.id,ev.id,a.key)}
                              onChange={e=>setEdit(member.id,ev.id,a.key,e.target.value)}
                              style={{width:80,padding:"8px 10px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:15,fontWeight:600,textAlign:"right",color:"#111827"}}/>
                            <span style={{fontSize:12,color:"#6b7280",width:28}}>RON</span>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#1a2e1a",borderRadius:10,marginBottom:10,border:"1px solid #2d5a2d"}}>
                        <span style={{fontSize:13,color:"#16a34a"}}>Total de plătit</span>
                        <span style={{fontSize:20,fontWeight:700,color:"#16a34a"}}>+{fmtRON(editTotal)}</span>
                      </div>
                      <button onClick={()=>doApprove(member.id,ev.id,activeActs)}
                        style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#16a34a",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                        ✓ Aprobă cu sumele modificate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Approved section */}
      {approvedItems.length>0 && (
        <>
          <div style={{fontSize:12,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
            {approvedItems.length} aprobate
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {approvedItems.map(({member,ev,activeActs})=>{
              const key=`${member.id}_${ev.id}`;
              const bonus=calcBonus(member.id,ev.id);
              const dateLabel=new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"});
              return (
                <div key={key} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,opacity:0.7}}>
                  <Avatar member={member} size={30}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#374151"}}>{member.name.split(" ")[0]} · {ev.title}</div>
                    <div style={{fontSize:11,color:"#6b7280"}}>{dateLabel}</div>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,color:"#16a34a"}}>+{fmtRON(bonus)}</span>
                  <span style={{fontSize:11,background:"#f0fdf4",color:"#16a34a",padding:"2px 8px",borderRadius:20,fontWeight:500,border:"1px solid #bbf7d0"}}>✓</span>
                  <button onClick={()=>setApprovalStatus(member.id,ev.id,null,{})}
                    style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:"1px solid #e5e7eb",background:"transparent",color:"#6b7280",cursor:"pointer"}}>
                    Anulează
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── REPORT VIEW ──────────────────────────────────────────────────────────────

function ReportView({ user, gcalEvents, getChecked, getApproval, getAmount, eventColors }) {
  const [mode, setMode] = useState("lunar"); // "lunar" | "custom"
  const [rm,   setRm]   = useState(()=>{ const t=new Date(); return new Date(t.getFullYear(),t.getMonth(),1); });
  const [dateFrom, setDateFrom] = useState(toKey(addDays(new Date(),-9)));
  const [dateTo,   setDateTo]   = useState(toKey(new Date()));

  // Chief and viewers see all crew; tech sees only themselves
  const crew = (user.isChief||user.isViewer)
    ? TEAM.filter(m=>!m.isChief&&!m.isViewer)
    : TEAM.filter(m=>m.id===user.id);

  function getMonthEvents() {
    const monthStart=new Date(rm.getFullYear(),rm.getMonth(),1);
    const monthEnd=new Date(rm.getFullYear(),rm.getMonth()+1,0);
    const evs=[];
    for (let d=new Date(monthStart);d<=monthEnd;d.setDate(d.getDate()+1)) {
      const k=toKey(new Date(d)); (gcalEvents[k]||[]).forEach(ev=>evs.push({...ev,dayKey:k}));
    }
    return evs;
  }

  function getCustomEvents() {
    const start=parseDateLocal(dateFrom), end=parseDateLocal(dateTo);
    const evs=[];
    for (let d=new Date(start);d<=end;d.setDate(d.getDate()+1)) {
      const k=toKey(new Date(d)); (gcalEvents[k]||[]).forEach(ev=>evs.push({...ev,dayKey:k}));
    }
    return evs;
  }

  const monthEvents = mode==="lunar" ? getMonthEvents() : getCustomEvents();
  const label = mode==="lunar" ? fmtMonth(rm) : `${dateFrom} → ${dateTo}`;

  function getDetail(uid) {
    return monthEvents.filter(ev=>getApproval(uid,ev.id)==="approved"&&Object.values(getChecked(uid,ev.id)).some(Boolean))
      .map(ev=>{ const ch=getChecked(uid,ev.id); const acts=getUserActions(uid).filter(a=>ch[a.key]); const total=acts.reduce((s,a)=>s+getAmount(uid,ev.id,a.key),0); return {ev,acts,total}; });
  }
  const grandTotal = crew.reduce((s,m)=>s+getDetail(m.id).reduce((ss,d)=>ss+d.total,0),0);

  function downloadReport() {
    generatePDF(crew, monthEvents, getChecked, getApproval, getAmount, label, eventColors||{});
  }

  return (
    <div style={{padding:"16px 16px 24px",background:"#f0f4fa",minHeight:"100vh"}}>
      {/* Mode toggle */}
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#fff",borderRadius:12,padding:4,border:"1px solid #e5e7eb"}}>
        <button onClick={()=>setMode("lunar")} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:mode==="lunar"?"#e5e7eb":"transparent",color:mode==="lunar"?"#111827":"#555",fontSize:13,fontWeight:mode==="lunar"?600:400,cursor:"pointer"}}>📅 Lunar</button>
        <button onClick={()=>setMode("custom")} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:mode==="custom"?"#e5e7eb":"transparent",color:mode==="custom"?"#111827":"#555",fontSize:13,fontWeight:mode==="custom"?600:400,cursor:"pointer"}}>📆 Perioadă</button>
      </div>

      {/* Navigation */}
      {mode==="lunar"&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <button onClick={()=>setRm(new Date(rm.getFullYear(),rm.getMonth()-1,1))} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>
          <div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:600,color:"#111827",textTransform:"capitalize"}}>{fmtMonth(rm)}</div>
          <button onClick={()=>setRm(new Date(rm.getFullYear(),rm.getMonth()+1,1))} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>›</button>
        </div>
      )}
      {mode==="custom"&&(
        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
          <div style={{flex:1}}>
            <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>De la</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #e5e7eb",background:"#fff",color:"#111827",fontSize:14,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Până la</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #e5e7eb",background:"#fff",color:"#111827",fontSize:14,outline:"none"}}/>
          </div>
        </div>
      )}

      {/* Download button */}
      <button onClick={downloadReport} style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid #e5e7eb",background:"#fff",color:"#111827",fontSize:14,fontWeight:500,cursor:"pointer",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        "📄 Descarcă raport PDF"
      </button>

      {/* Member cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {crew.map(member=>{
          const details=getDetail(member.id);
          const total=details.reduce((s,d)=>s+d.total,0);
          return (
            <div key={member.id} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <Avatar member={member} size={40}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#111827"}}>{member.name}</div>
                  <div style={{fontSize:12,color:"#6b7280"}}>{details.length} zile lucrate</div>
                </div>
                <div style={{fontSize:22,fontWeight:700,color:total>0?"#16a34a":"#9ca3af"}}>
                  {total>0?`+${fmtRON(total)}`:"—"}
                </div>
              </div>
              {details.length>0&&(
                <div style={{borderTop:"1px solid #e5e7eb",paddingTop:10}}>
                  {details.map(({ev,acts,total:evT})=>(
                    <div key={ev.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}>
                      <div style={{flex:1,marginRight:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {eventColors[ev.originalId||ev.id]&&<div style={{width:8,height:8,borderRadius:"50%",background:eventColors[ev.originalId||ev.id],flexShrink:0}}/>}
                          <div style={{fontSize:13,color:eventColors[ev.originalId||ev.id]||"#ccc",fontWeight:500}}>{ev.title}</div>
                        </div>
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:10,color:"#6b7280"}}>{new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}{ev.isMultiDay?` · Z${ev.dayIndex+1}`:""}</span>
                          {acts.filter(a=>a.key!=="observatii").map(a=><span key={a.key} style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#1a2e1a",color:"#16a34a"}}>{a.icon} {a.label}</span>)}
                        </div>
                        {typeof getChecked(member.id,ev.id)["observatii"]==="string" && getChecked(member.id,ev.id)["observatii"] && (
                          <div style={{fontSize:11,color:"#9ca3af",fontStyle:"italic",marginTop:3}}>📝 {getChecked(member.id,ev.id)["observatii"]}</div>
                        )}
                      </div>
                      <span style={{fontSize:14,fontWeight:700,color:"#16a34a",flexShrink:0}}>+{fmtRON(evT)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,marginTop:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#9ca3af"}}>TOTAL</span>
                    <span style={{fontSize:18,fontWeight:700,color:"#16a34a"}}>+{fmtRON(total)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {grandTotal>0&&(
        <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,fontWeight:600,color:"#16a34a"}}>TOTAL GENERAL</span>
          <span style={{fontSize:26,fontWeight:700,color:"#16a34a"}}>+{fmtRON(grandTotal)}</span>
        </div>
      )}
      {crew.every(m=>getDetail(m.id).length===0)&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af",fontSize:14}}>
          <div style={{fontSize:36,marginBottom:12}}>📊</div>
          Nicio activare aprobată în această perioadă.
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────

function SettingsView({ user }) {
  const isTech = !user.isChief && !user.isViewer;

  // Editable bonuses state — chief only
  const [editing,    setEditing]    = useState(null); // uid being edited
  const [tempBonus,  setTempBonus]  = useState({});
  const [savedBonuses, setSavedBonuses] = useState(()=>load("ct_custom_bonuses",{}));

  function startEdit(uid) {
    const current = savedBonuses[uid] || getUserBonuses(uid);
    setTempBonus({ ...current });
    setEditing(uid);
  }
  function saveEdit(uid) {
    const updated = { ...savedBonuses, [uid]: tempBonus };
    setSavedBonuses(updated);
    save("ct_custom_bonuses", updated);
    // Update USER_CONFIG in memory
    if (USER_CONFIG[uid]) USER_CONFIG[uid].bonuses = { ...tempBonus };
    setEditing(null);
  }
  function getBonuses(uid) { return savedBonuses[uid] || getUserBonuses(uid); }

  return (
    <div style={{padding:"16px 16px 24px",background:"#f0f4fa",minHeight:"100vh"}}>
      {!isTech && (
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:16,marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600,color:"#111827",marginBottom:14}}>Bonusuri per persoană</div>
          {TEAM.filter(m=>!m.isViewer).map(m=>{
            const acts=getUserActions(m.id);
            const bns=getBonuses(m.id);
            const isEditingThis = editing===m.id;
            return (
              <div key={m.id} style={{marginBottom:16,padding:"12px 14px",background:"#f8fafc",borderRadius:12,border:"1px solid #e5e7eb"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <Avatar member={m} size={28}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#111827",flex:1}}>{m.name}</span>
                  {m.isChief&&<span style={{fontSize:9,background:"#1e3a5f",color:"#3b82f6",padding:"1px 7px",borderRadius:20,fontWeight:600}}>CHIEF</span>}
                  {user.isChief && !m.isChief && !isEditingThis && (
                    <button onClick={()=>startEdit(m.id)}
                      style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #e5e7eb",background:"transparent",color:"#6b7280",cursor:"pointer"}}>
                      ✏️ Editează
                    </button>
                  )}
                  {isEditingThis && (
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>saveEdit(m.id)}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,cursor:"pointer"}}>
                        ✓ Salvează
                      </button>
                      <button onClick={()=>setEditing(null)}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #e5e7eb",background:"transparent",color:"#9ca3af",cursor:"pointer"}}>
                        Anulează
                      </button>
                    </div>
                  )}
                </div>
                {isEditingThis ? (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {acts.map(a=>(
                      <div key={a.key} style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:15}}>{a.icon}</span>
                        <span style={{fontSize:13,flex:1,color:"#374151"}}>{a.label}</span>
                        <input type="number" value={tempBonus[a.key]??0}
                          onChange={e=>setTempBonus(p=>({...p,[a.key]:parseFloat(e.target.value)||0}))}
                          style={{width:75,padding:"6px 8px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:14,fontWeight:600,textAlign:"right",color:"#111827"}}/>
                        <span style={{fontSize:12,color:"#6b7280",width:28}}>RON</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {acts.map(a=><span key={a.key} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:bns[a.key]>0?"#f0fdf4":"#f3f4f6",color:bns[a.key]>0?"#16a34a":"#6b7280",fontWeight:500}}>{a.icon} {a.label}: {bns[a.key]>0?fmtRON(bns[a.key]):"—"}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:600,color:"#111827",marginBottom:14}}>Echipa</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {TEAM.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#f8fafc",border:"1px solid #e5e7eb",borderRadius:12}}>
              <Avatar member={m} size={34}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:"#374151"}}>{m.name}</div>
                <div style={{fontSize:11,color:"#6b7280"}}>{m.email}</div>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{fontSize:9,background:m.isChief?"#1e3a5f":m.isViewer?"#222":"#1a2e1a",color:m.isChief?"#7eb8f7":m.isViewer?"#555":"#4ade80",padding:"2px 8px",borderRadius:20,fontWeight:600,letterSpacing:0.5}}>
                  {m.isChief?"CHIEF":m.isViewer?"VIEWER":"TECH"}
                </span>
                {m.id===user.id&&<span style={{fontSize:10,color:"#9ca3af"}}>← tu</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"#f8fafc",border:"1px solid #1e3a5f",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:"#3b82f6",marginBottom:8}}>🔥 Firebase — Live Sync</div>
        <div style={{fontSize:11,color:"#16a34a"}}>● Conectat · Date sincronizate în timp real</div>
        <div style={{fontSize:11,color:"#6b7280",marginTop:4}}>Proiect: crew-tracker-led</div>
      </div>
      <div style={{background:"#f8fafc",border:"1px solid #1e3a5f",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:"#3b82f6",marginBottom:8}}>📆 Google Calendar</div>
        <div style={{fontSize:11,color:"#16a34a"}}>● Conectat și activ</div>
        <div style={{fontSize:11,color:"#6b7280",marginTop:4,wordBreak:"break-all"}}>{CALENDAR_ID}</div>
      </div>
      <div style={{textAlign:"center",padding:"16px 0 8px",fontSize:11,color:"#9ca3af"}}>ig vision™ crew tracker · www.igvision.ro</div>
    </div>
  );
}
