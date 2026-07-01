import { useState, useEffect, useRef } from "react";
import { db, saveChecked, saveApproval, listenChecked, listenApprovals, saveEventColor, listenEventColors } from "./firebase";
import DevizeView from "./Devize";
import RaportBusiness from "./Raport";
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

async function generatePDF(crew, monthEvents, getChecked, getApproval, getAmount, label, eventColors={}) {
  // jsPDF doesn't support Romanian diacritics — replace them
  function ro(s) {
    if (!s) return "";
    return String(s)
      .replace(/ș/g,"s").replace(/Ș/g,"S")
      .replace(/ț/g,"t").replace(/Ț/g,"T")
      .replace(/ă/g,"a").replace(/Ă/g,"A")
      .replace(/î/g,"i").replace(/Î/g,"I")
      .replace(/â/g,"a").replace(/Â/g,"A");
  }
  // Load jsPDF via script tag if not already loaded
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const pageW=210, margin=14, colW=210-14*2;
  let y=0;
  const C={ dark:[15,15,15], mid:[40,40,40], gray:[110,110,110], light:[200,200,200],
            green:[29,158,117], greenL:[230,248,240], white:[255,255,255],
            headerBg:[20,20,20], rowAlt:[247,247,245] };
  function hexRgb(h){ if(!h)return null; return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
  function footer(){ doc.setFontSize(8);doc.setTextColor(...C.light);doc.setFont("helvetica","normal");doc.text("ig vision™ crew tracker  |  www.igvision.ro",pageW/2,289,{align:"center"}); }
  function checkY(n=10){ if(y+n>275){doc.addPage();y=16;footer();doc.setTextColor(...C.dark);} }

  // Header bar
  doc.setFillColor(...C.headerBg); doc.rect(0,0,pageW,30,"F");
  // Logo image
  doc.addImage(LOGO_B64,"JPEG", margin, 3, 55, 18);
  // Right side
  doc.setFontSize(12);doc.setTextColor(...C.white);doc.setFont("helvetica","bold");
  doc.text("Raport "+ro(label),pageW-margin,14,{align:"right"});
  doc.setFontSize(8);doc.setTextColor(...C.light);doc.setFont("helvetica","normal");
  doc.text("Generat: "+new Date().toLocaleDateString("ro-RO",{day:"numeric",month:"long",year:"numeric"}),pageW-margin,21,{align:"right"});
  y=36;

  // Build crew data
  let grandTotal=0;
  const crewData=crew.map(member=>{
    const details=monthEvents
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

  // Summary cards
  if(crewData.length>0){
    const cw=(colW-4*(crewData.length-1))/crewData.length;
    crewData.forEach(({member,total},i)=>{
      const cx=margin+i*(cw+4);
      doc.setFillColor(...C.greenL);doc.roundedRect(cx,y,cw,18,2,2,"F");
      doc.setFillColor(...C.green);doc.rect(cx,y,3,18,"F");
      doc.setFontSize(8);doc.setTextColor(...C.gray);doc.setFont("helvetica","normal");
      doc.text(ro(member.name.split(" ")[0]),cx+6,y+6.5);
      doc.setFontSize(10);doc.setTextColor(...C.green);doc.setFont("helvetica","bold");
      doc.text("+"+fmtRON(total),cx+6,y+14);
    });
    y+=22;
    doc.setFillColor(...C.green);doc.rect(margin,y,colW,9,"F");
    doc.setFontSize(9);doc.setTextColor(...C.white);doc.setFont("helvetica","bold");
    doc.text("TOTAL GENERAL",margin+4,y+6.5);
    doc.text("+"+fmtRON(grandTotal),pageW-margin-2,y+6.5,{align:"right"});
    y+=16;
  }

  // Per member tables
  crewData.forEach(({member,details,total})=>{
    checkY(30);
    // Member header
    doc.setFillColor(...C.mid);doc.rect(margin,y,colW,12,"F");
    doc.setFontSize(10);doc.setTextColor(...C.white);doc.setFont("helvetica","bold");
    doc.text(ro(member.name),margin+4,y+8);
    doc.setFontSize(7.5);doc.setTextColor(...C.light);doc.setFont("helvetica","normal");
    doc.text(ro(member.email),margin+4,y+11.5);
    doc.setFontSize(10);doc.setTextColor(...C.green);doc.setFont("helvetica","bold");
    doc.text("+"+fmtRON(total),pageW-margin-2,y+8,{align:"right"});
    y+=14;

    // Col widths
    const c={date:28,event:70,actions:50,sum:34};
    // Table header
    doc.setFillColor(...C.gray);doc.rect(margin,y,colW,7,"F");
    doc.setFontSize(7);doc.setTextColor(...C.white);doc.setFont("helvetica","bold");
    doc.text("DATA",margin+2,y+5);
    doc.text("EVENIMENT",margin+c.date+2,y+5);
    doc.text("ACTIUNI",margin+c.date+c.event+2,y+5);
    doc.text("SUMA",pageW-margin-2,y+5,{align:"right"});
    y+=8;

    details.forEach(({ev,acts,note,total:evT},i)=>{
      const rowH=note?14:8.5;
      checkY(rowH+2);
      if(i%2===0){doc.setFillColor(...C.rowAlt);doc.rect(margin,y,colW,rowH,"F");}
      const evRgb=hexRgb(eventColors[ev.originalId||ev.id]);
      if(evRgb){doc.setFillColor(...evRgb);doc.circle(margin+2.5,y+rowH/2,1.8,"F");}
      const dateStr=new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"});
      const dayInfo=ev.isMultiDay?" Z"+ev.dayIndex+1:"";
      doc.setFontSize(7.5);doc.setTextColor(...C.dark);doc.setFont("helvetica","normal");
      doc.text(dateStr+dayInfo,margin+5,y+6);
      let title=ev.title;
      const tmw=c.event-4;
      while(doc.getTextWidth(title)>tmw&&title.length>8)title=title.slice(0,-1);
      if(title!==ev.title)title+="...";
      doc.text(title,margin+c.date+2,y+6);
      doc.setFontSize(7);doc.setTextColor(...C.gray);
      let astr=ro(acts.map(a=>a.label).join(", "));
      const amw=c.actions-2;
      while(doc.getTextWidth(astr)>amw&&astr.length>5)astr=astr.slice(0,-1);
      if(astr!==acts.map(a=>a.label).join(", "))astr+="...";
      doc.text(astr,margin+c.date+c.event+2,y+6);
      doc.setFontSize(8);doc.setTextColor(...C.green);doc.setFont("helvetica","bold");
      doc.text("+"+fmtRON(evT),pageW-margin-2,y+6,{align:"right"});
      if(note){
        doc.setFontSize(7);doc.setTextColor(...C.gray);doc.setFont("helvetica","italic");
        const ns=note.length>85?note.slice(0,85)+"...":note;
        doc.text("Obs: "+ro(ns),margin+c.date+2,y+12);
      }
      doc.setDrawColor(...C.light);doc.setLineWidth(0.2);
      doc.line(margin,y+rowH,margin+colW,y+rowH);
      y+=rowH;
    });

    // Member total
    doc.setFillColor(...C.greenL);doc.rect(margin,y,colW,8,"F");
    doc.setFontSize(8);doc.setTextColor(...C.green);doc.setFont("helvetica","bold");
    doc.text("TOTAL "+ro(member.name.split(" ")[0]).toUpperCase()+" - "+details.length+" activari",margin+4,y+5.5);
    doc.text("+"+fmtRON(total),pageW-margin-2,y+5.5,{align:"right"});
    y+=14;
  });

  footer();
  doc.save("igvision-raport-"+label.replace(/[^a-z0-9]/gi,"-").toLowerCase()+".pdf");
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
      {large&&<div style={{fontSize:11,color:"#555",letterSpacing:4,textTransform:"uppercase"}}>crew tracker</div>}
    </div>
  );
}

function MultiDayPill({ dayIndex, totalDays }) {
  return <span style={{fontSize:10,background:"#252525",color:"#888",padding:"2px 8px",borderRadius:20,fontWeight:600,whiteSpace:"nowrap"}}>Ziua {dayIndex+1}/{totalDays}</span>;
}

function LiveDot() {
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:"#4ade80",marginRight:4,animation:"pulse 2s infinite"}}/>
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{position:"fixed",bottom:"calc(80px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"#1a1a1a",color:"#e8e8e6",padding:"10px 22px",borderRadius:24,fontSize:13,fontWeight:500,whiteSpace:"nowrap",zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.6)",border:"1px solid #333",maxWidth:"88vw",overflow:"hidden",textOverflow:"ellipsis"}}>
      {msg}
    </div>
  );
}

function BottomNav({ tabs, tab, setTab, pendingCount }) {
  const icons = {today:"📅",approve:"✅",report:"📊",devize:"📋",analytics:"📈",settings:"⚙️"};
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#1a1a1a",borderTop:"1px solid #2a2a2a",display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {tabs.map(t=>{
        const active=tab===t.id;
        return (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative"}}>
            <span style={{fontSize:20}}>{icons[t.id]}</span>
            <span style={{fontSize:10,fontWeight:active?600:400,color:active?"#e8e8e6":"#555"}}>{t.label}</span>
            {active&&<div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:2,background:"#e8e8e6",borderRadius:2}}/>}
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
      <button onClick={()=>setDay(addDays(day,-1))} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#888",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
      <div style={{flex:1,textAlign:"center"}}>
        <div style={{fontSize:compact?13:14,fontWeight:600,color:"#e8e8e6",textTransform:"capitalize"}}>{compact?fmtDateShort(day):fmtDate(day)}</div>
        {isToday&&<div style={{fontSize:10,color:"#4ade80"}}>azi</div>}
      </div>
      <button onClick={()=>setDay(addDays(day,1))} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#888",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
    </div>
  );
}

function EmptyDay({ loading }) {
  return (
    <div style={{textAlign:"center",padding:"48px 20px",color:"#444",fontSize:14}}>
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

  if (!user) return <><LoginScreen onLogin={m=>{setUser(m);showToast(`Bun venit, ${m.name.split(" ")[0]}! 👋`);}}/><Toast msg={toast}/></>;

  let tabs=[];
  if      (user.isViewer) tabs=[{id:"report",label:"Raport"}];
  else if (user.isChief)  tabs=[{id:"today",label:"Azi"},{id:"approve",label:"Aprobare"},{id:"report",label:"Raport"},{id:"devize",label:"Devize"},{id:"analytics",label:"Business"},{id:"settings",label:"Setări"}];
  else                    tabs=[{id:"today",label:"Azi"},{id:"report",label:"Raport"},{id:"settings",label:"Setări"}];
  if (user.isViewer&&tab!=="report"&&tab!=="devize") setTab("report");
  // Viewers also get devize tab
  if (user.isViewer) tabs=[{id:"report",label:"Raport"},{id:"devize",label:"Devize"},{id:"analytics",label:"Business"}];

  const pending = user.isChief?getPendingCount():0;
  const shared  = {user,day,setDay:d=>{setDay(d);setSelEvent(null);},events,gcalEvents,getChecked,getApproval,getAmount,calcBonus,calcDayTotal,showToast,calLoading,calError,eventColors,saveEventColor};

  return (
    <div style={{minHeight:"100dvh",background:"#111",display:"flex",flexDirection:"column"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Header */}
      <div style={{background:"#1a1a1a",borderBottom:"1px solid #222",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:"calc(10px + env(safe-area-inset-top))",position:"sticky",top:0,zIndex:100}}>
        <Logo/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"#4ade80",fontWeight:500,display:"flex",alignItems:"center"}}><LiveDot/>Live</span>
          <Avatar member={user} size={28}/>
          <button onClick={()=>{setUser(null);setTab("today");setSelEvent(null);}} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#555",cursor:"pointer"}}>Ieși</button>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",paddingBottom:"calc(72px + env(safe-area-inset-bottom))"}}>
        {tab==="today"   &&!user.isViewer&&<TodayView   {...shared} selEvent={selEvent} setSelEvent={setSelEvent} toggleMyAction={toggleMyAction}/>}
        {tab==="approve" && user.isChief &&<ApproveView gcalEvents={gcalEvents} getChecked={getChecked} getApproval={getApproval} setApprovalStatus={setApprovalStatus} submitApproval={submitApproval} getAmount={getAmount} calcBonus={calcBonus} calLoading={calLoading}/>}
        {tab==="report"                  &&<ReportView  user={user} gcalEvents={gcalEvents} getChecked={getChecked} getApproval={getApproval} getAmount={getAmount} eventColors={eventColors}/>}
        {tab==="settings"&&!user.isViewer&&<SettingsView user={user}/>}
        {tab==="devize"&&(user.isChief||user.isViewer)&&<DevizeView user={user} gcalEvents={gcalEvents}/>}
        {tab==="analytics"&&(user.isChief||user.isViewer)&&<RaportBusiness/>}
      </div>

      <BottomNav tabs={tabs} tab={tab} setTab={setTab} pendingCount={pending}/>
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
    <div style={{minHeight:"100dvh",background:"#111",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 20px calc(20px + env(safe-area-inset-bottom))"}}>
      <div style={{width:"100%",maxWidth:340}}>
        <div style={{textAlign:"center",marginBottom:36}}><Logo large/></div>
        <div style={{background:"#1a1a1a",borderRadius:18,padding:24,border:"1px solid #2a2a2a"}}>
          {step==="email"&&(
            <>
              <label style={{fontSize:11,fontWeight:600,color:"#555",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Email</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&next()} placeholder="adresa@gmail.com" autoFocus
                style={{width:"100%",padding:"14px",borderRadius:12,border:error?"1px solid #ef4444":"1px solid #2a2a2a",fontSize:16,color:"#e8e8e6",outline:"none",background:"#111",marginBottom:error?8:16,boxSizing:"border-box"}}/>
              {error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠ {error}</div>}
              <button onClick={next} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#e8e8e6",color:"#111",fontSize:15,fontWeight:700,cursor:"pointer"}}>Continuă →</button>
            </>
          )}
          {step==="password"&&cur&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#111",borderRadius:10,marginBottom:20,border:"1px solid #222"}}>
                <Avatar member={cur} size={36}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#e8e8e6"}}>{cur.name}</div>
                  <div style={{fontSize:11,color:"#555"}}>{cur.email}</div>
                </div>
                <button onClick={()=>{setStep("email");setPassword("");setError("");}} style={{fontSize:11,color:"#666",background:"none",border:"none",cursor:"pointer"}}>Schimbă</button>
              </div>
              <label style={{fontSize:11,fontWeight:600,color:"#555",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Parolă</label>
              <div style={{position:"relative",marginBottom:error?8:20}}>
                <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}}
                  onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••" autoFocus
                  style={{width:"100%",padding:"14px 48px 14px 14px",borderRadius:12,border:error?"1px solid #ef4444":"1px solid #2a2a2a",fontSize:16,color:"#e8e8e6",outline:"none",background:"#111",boxSizing:"border-box"}}/>
                <button onClick={()=>setShowPwd(!showPwd)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#555",padding:0,lineHeight:1}}>
                  {showPwd?"🙈":"👁"}
                </button>
              </div>
              {error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠ {error}</div>}
              <button onClick={login} disabled={loading}
                style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:loading?"#333":"#e8e8e6",color:loading?"#666":"#111",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer"}}>
                {loading?"Se verifică...":"Intră →"}
              </button>
            </>
          )}
        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#333"}}>www.igvision.ro</div>
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
    <div style={{padding:"16px 16px 0"}}>
      <button onClick={()=>setSelEvent(null)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:14,marginBottom:16,padding:0}}>
        ‹ <span>Înapoi</span>
      </button>
      <div style={{background:"#1a1a1a",borderRadius:16,marginBottom:12,border:"1px solid #2a2a2a",overflow:"hidden"}}>
        {getEvColor(selEv)&&<div style={{height:4,background:getEvColor(selEv)}}/>}
        <div style={{padding:16}}>
        <div style={{fontSize:16,fontWeight:600,color:getEvColor(selEv)||"#e8e8e6",marginBottom:6}}>{selEv.title}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {selEv.isMultiDay&&<MultiDayPill dayIndex={selEv.dayIndex} totalDays={selEv.totalDays}/>}
          {selEv.location&&<span style={{fontSize:12,color:"#555"}}>📍 {selEv.location}</span>}
          {selEv.start&&<span style={{fontSize:12,color:"#555"}}>{selEv.start}{selEv.end?`–${selEv.end}`:""}</span>}
        </div>
        </div>
      </div>
      {approval&&(
        <div style={{padding:"12px 16px",borderRadius:12,background:approval==="approved"?"#1a2e1a":"#2a1515",fontSize:13,fontWeight:500,color:approval==="approved"?"#4ade80":"#f87171",border:`1px solid ${approval==="approved"?"#2d5a2d":"#5a2020"}`,marginBottom:12}}>
          {approval==="approved"?"✅ Acțiunile tale au fost aprobate.":"❌ Acțiunile au fost respinse. Contactează Crew Chief."}
        </div>
      )}
      <div style={{fontSize:11,fontWeight:600,color:"#444",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
        {isLocked?"Acțiunile bifate":"Ce ai făcut AZI?"}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {myActions.map(action=>{
          const on=!!myCheck[action.key];
          // Observatii — text input
          if (action.key==="observatii") {
            const noteVal = typeof myCheck["observatii"]==="string" ? myCheck["observatii"] : "";
            return (
              <div key="observatii" style={{borderRadius:14,border:"1px solid #222",background:"#1a1a1a",overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
                  <span style={{fontSize:20}}>📝</span>
                  <span style={{fontSize:15,color:"#ccc"}}>Observații</span>
                </div>
                {!isLocked ? (
                  <textarea value={noteVal}
                    onChange={e=>toggleMyAction(selEv.id,"observatii",e.target.value)}
                    placeholder="Scrie observații..."
                    rows={3}
                    style={{width:"100%",padding:"10px 16px",background:"#111",border:"none",borderTop:"1px solid #222",color:"#ccc",fontSize:14,resize:"none",outline:"none",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.5}}
                  />
                ) : noteVal ? (
                  <div style={{padding:"8px 16px 12px",fontSize:13,color:"#888",fontStyle:"italic",borderTop:"1px solid #222"}}>"{noteVal}"</div>
                ) : null}
              </div>
            );
          }
          return (
            <div key={action.key} onClick={()=>!isLocked&&toggleMyAction(selEv.id,action.key)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:14,border:`1px solid ${on?"#2d5a2d":"#222"}`,background:on?"#1a2e1a":"#1a1a1a",cursor:isLocked?"default":"pointer",opacity:isLocked&&!on?0.35:1,transition:"all 0.1s"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:22}}>{action.icon}</span>
                <span style={{fontSize:16,fontWeight:on?500:400,color:on?"#86efac":"#ccc"}}>{action.label}</span>
              </div>
              <div style={{width:26,height:26,borderRadius:8,border:on?"none":"2px solid #333",background:on?"#4ade80":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#111",fontSize:14,fontWeight:700,flexShrink:0}}>
                {on&&"✓"}
              </div>
            </div>
          );
        })}
      </div>
      {!isLocked&&(
        <>
          <div style={{background:"#1a1a1a",border:"1px solid #222",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#555"}}>
              <span>Acțiuni bifate</span>
              <span style={{fontWeight:600,color:"#888"}}>{Object.values(myCheck).filter(Boolean).length} / {myActions.length}</span>
            </div>
            {user.isChief&&myTotal>0&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,marginTop:10,borderTop:"1px solid #222"}}>
                <span style={{fontSize:14,color:"#888"}}>Total estimat</span>
                <span style={{fontSize:22,fontWeight:700,color:"#4ade80"}}>+{fmtRON(myTotal)}</span>
              </div>
            )}
          </div>
          <button onClick={()=>{showToast("✅ Trimis spre aprobare!"); setSelEvent(null);}}
            style={{width:"100%",padding:"16px",borderRadius:14,border:"none",background:"#e8e8e6",color:"#111",fontSize:16,fontWeight:700,cursor:"pointer",marginBottom:8}}>
            Trimite spre aprobare →
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{padding:"16px 16px 0"}}>
      <DayNav day={day} setDay={setDay} compact/>
      {calError&&<div style={{background:"#2a1515",border:"1px solid #5a2020",borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#f87171"}}>⚠ {calError}</div>}
      <div style={{background:"#1a1a1a",border:"1px solid #222",borderRadius:12,padding:"8px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
        <LiveDot/><span style={{fontSize:12,color:"#666"}}>Google Calendar</span>
        <span style={{fontSize:12,color:"#444",marginLeft:"auto"}}>{calLoading?"Se încarcă...":`${events.length} activăr${events.length===1?"e":"i"}`}</span>
      </div>
      {(events.length===0||calLoading)&&<EmptyDay loading={calLoading}/>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {events.map(ev=>{
          const ch=getChecked(user.id,ev.id);
          const done=Object.entries(ch).filter(([,v])=>v).map(([k])=>k);
          const appr=getApproval(user.id,ev.id);
          const bonus=calcBonus(user.id,ev.id);
          return (
            <div key={ev.id} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:16,overflow:"hidden",position:"relative"}}>
              {getEvColor(ev)&&<div style={{height:4,background:getEvColor(ev),borderRadius:"16px 16px 0 0"}}/>}
              <div style={{padding:"13px 16px"}} onClick={()=>setSelEvent(ev.id)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                <span style={{fontSize:15,fontWeight:500,color:getEvColor(ev)||"#e8e8e6",lineHeight:1.3}}>{ev.title}</span>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  {ev.start&&<span style={{fontSize:11,color:"#555",whiteSpace:"nowrap"}}>{ev.start}{ev.end?`–${ev.end}`:""}</span>}
                  {user.isChief&&<button onClick={e=>{e.stopPropagation();setShowColorPicker(showColorPicker===ev.id?null:ev.id);}}
                    style={{width:20,height:20,borderRadius:"50%",border:"2px solid #333",background:getEvColor(ev)||"#333",cursor:"pointer",flexShrink:0,padding:0}}/>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:6}}>
                {ev.isMultiDay&&<MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays}/>}
                {ev.location&&<span style={{fontSize:12,color:"#555"}}>📍 {ev.location}</span>}
              </div>
              {(done.length>0||appr)&&(
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {appr==="approved"&&<span style={{fontSize:11,background:"#1a2e1a",color:"#4ade80",padding:"2px 8px",borderRadius:20,fontWeight:500,border:"1px solid #2d5a2d"}}>✓ aprobat{user.isChief?` · +${fmtRON(bonus)}`:""}</span>}
                  {appr==="rejected"&&<span style={{fontSize:11,background:"#2a1515",color:"#f87171",padding:"2px 8px",borderRadius:20,fontWeight:500}}>✗ respins</span>}
                  {!appr&&done.length>0&&<span style={{fontSize:11,color:"#f59e0b",fontWeight:500}}>⏳ în așteptare</span>}
                  {done.map(k=><span key={k} style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#1a2e1a",color:"#4ade80",fontWeight:500}}>✓ {ACTIONS.find(a=>a.key===k)?.label}</span>)}
                </div>
              )}
              <div style={{textAlign:"right"}}><span style={{fontSize:12,color:"#333"}}>Bifează ›</span></div>
              </div>
              {showColorPicker===ev.id&&(
                <div style={{padding:"12px 14px",background:"#111",borderTop:"1px solid #222"}} onClick={e=>e.stopPropagation()}>
                  <div style={{fontSize:11,color:"#666",marginBottom:8}}>Alege culoarea evenimentului:</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    {COLOR_PALETTE.map(c=>(
                      <button key={c} onClick={()=>handleColorSelect(ev,c)}
                        style={{width:28,height:28,borderRadius:"50%",border:getEvColor(ev)===c?"3px solid #fff":"2px solid transparent",background:c,cursor:"pointer",padding:0,flexShrink:0}}/>
                    ))}
                    <button onClick={()=>handleColorSelect(ev,null)}
                      style={{width:28,height:28,borderRadius:"50%",border:"2px solid #444",background:"transparent",cursor:"pointer",padding:0,fontSize:14,color:"#666",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {events.length>0&&user.isChief&&(
        <div style={{margin:"16px 0 0",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#555"}}>Total aprobat azi</span>
          <span style={{fontSize:20,fontWeight:700,color:"#4ade80"}}>+{fmtRON(calcDayTotal(user.id))}</span>
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
    <div style={{padding:"16px 16px 0"}}>

      {/* Pending section */}
      {calLoading && <EmptyDay loading/>}

      {!calLoading && pendingItems.length===0 && approvedItems.length===0 && (
        <EmptyDay/>
      )}

      {pendingItems.length>0 && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em"}}>
              {pendingItems.length} în așteptare
            </div>
            <button onClick={approveAll}
              style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:"none",background:"#4ade80",color:"#111",fontWeight:700,cursor:"pointer"}}>
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
                <div key={key} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"12px 14px",borderBottom:"1px solid #222",display:"flex",alignItems:"center",gap:10}}>
                    <Avatar member={member} size={34}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#e8e8e6"}}>{member.name}</div>
                      <div style={{fontSize:11,color:"#555"}}>{ev.title} · {dateLabel}{ev.isMultiDay?` · Z${ev.dayIndex+1}`:""}</div>
                    </div>
                    <span style={{fontSize:11,background:"#2a2000",color:"#f59e0b",padding:"2px 8px",borderRadius:20,fontWeight:500}}>⏳</span>
                  </div>
                  {/* Body */}
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                      {activeActs.map(a=>(
                        <span key={a.key} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"#1a2e1a",color:"#4ade80",fontWeight:500}}>
                          {a.icon} {a.label} · {fmtRON(getAmount(member.id,ev.id,a.key))}
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:18,fontWeight:700,color:"#4ade80"}}>+{fmtRON(bonus)}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditOpen(isOpen?null:key)}
                          style={{fontSize:12,padding:"7px 12px",borderRadius:8,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer"}}>
                          ✏️ Modifică
                        </button>
                        <button onClick={()=>doApprove(member.id,ev.id,activeActs)}
                          style={{fontSize:12,padding:"7px 14px",borderRadius:8,border:"none",background:"#4ade80",color:"#111",fontWeight:700,cursor:"pointer"}}>
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
                    <div style={{padding:"14px",background:"#111",borderTop:"1px solid #222"}}>
                      <div style={{fontSize:12,color:"#666",marginBottom:12}}>Modifică suma per acțiune:</div>
                      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                        {activeActs.map(a=>(
                          <div key={a.key} style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:18}}>{a.icon}</span>
                            <span style={{fontSize:14,flex:1,color:"#ccc",fontWeight:500}}>{a.label}</span>
                            <input type="number" value={getEdit(member.id,ev.id,a.key)}
                              onChange={e=>setEdit(member.id,ev.id,a.key,e.target.value)}
                              style={{width:80,padding:"8px 10px",borderRadius:8,border:"1px solid #333",background:"#1a1a1a",fontSize:15,fontWeight:600,textAlign:"right",color:"#e8e8e6"}}/>
                            <span style={{fontSize:12,color:"#555",width:28}}>RON</span>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#1a2e1a",borderRadius:10,marginBottom:10,border:"1px solid #2d5a2d"}}>
                        <span style={{fontSize:13,color:"#4ade80"}}>Total de plătit</span>
                        <span style={{fontSize:20,fontWeight:700,color:"#4ade80"}}>+{fmtRON(editTotal)}</span>
                      </div>
                      <button onClick={()=>doApprove(member.id,ev.id,activeActs)}
                        style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#4ade80",color:"#111",fontSize:14,fontWeight:700,cursor:"pointer"}}>
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
          <div style={{fontSize:12,fontWeight:600,color:"#444",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
            {approvedItems.length} aprobate
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {approvedItems.map(({member,ev,activeActs})=>{
              const key=`${member.id}_${ev.id}`;
              const bonus=calcBonus(member.id,ev.id);
              const dateLabel=new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"});
              return (
                <div key={key} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,opacity:0.7}}>
                  <Avatar member={member} size={30}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#ccc"}}>{member.name.split(" ")[0]} · {ev.title}</div>
                    <div style={{fontSize:11,color:"#555"}}>{dateLabel}</div>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>+{fmtRON(bonus)}</span>
                  <span style={{fontSize:11,background:"#1a2e1a",color:"#4ade80",padding:"2px 8px",borderRadius:20,fontWeight:500,border:"1px solid #2d5a2d"}}>✓</span>
                  <button onClick={()=>setApprovalStatus(member.id,ev.id,null,{})}
                    style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:"1px solid #333",background:"transparent",color:"#555",cursor:"pointer"}}>
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

  const [pdfLoading, setPdfLoading] = useState(false);
  async function downloadReport() {
    setPdfLoading(true);
    try {
      await generatePDF(crew, monthEvents, getChecked, getApproval, getAmount, label, eventColors||{});
    } catch(e) {
      console.error("PDF error:", e);
      alert("Eroare la generarea PDF. Verifică conexiunea și încearcă din nou.");
    }
    setPdfLoading(false);
  }

  return (
    <div style={{padding:"16px 16px 0"}}>
      {/* Mode toggle */}
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#1a1a1a",borderRadius:12,padding:4,border:"1px solid #2a2a2a"}}>
        <button onClick={()=>setMode("lunar")} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:mode==="lunar"?"#2a2a2a":"transparent",color:mode==="lunar"?"#e8e8e6":"#555",fontSize:13,fontWeight:mode==="lunar"?600:400,cursor:"pointer"}}>📅 Lunar</button>
        <button onClick={()=>setMode("custom")} style={{flex:1,padding:"8px",borderRadius:9,border:"none",background:mode==="custom"?"#2a2a2a":"transparent",color:mode==="custom"?"#e8e8e6":"#555",fontSize:13,fontWeight:mode==="custom"?600:400,cursor:"pointer"}}>📆 Perioadă</button>
      </div>

      {/* Navigation */}
      {mode==="lunar"&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <button onClick={()=>setRm(new Date(rm.getFullYear(),rm.getMonth()-1,1))} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>
          <div style={{flex:1,textAlign:"center",fontSize:14,fontWeight:600,color:"#e8e8e6",textTransform:"capitalize"}}>{fmtMonth(rm)}</div>
          <button onClick={()=>setRm(new Date(rm.getFullYear(),rm.getMonth()+1,1))} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,color:"#888",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>›</button>
        </div>
      )}
      {mode==="custom"&&(
        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
          <div style={{flex:1}}>
            <label style={{fontSize:10,color:"#555",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>De la</label>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:14,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:10,color:"#555",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Până la</label>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#e8e8e6",fontSize:14,outline:"none"}}/>
          </div>
        </div>
      )}

      {/* Download button */}
      <button onClick={downloadReport} disabled={pdfLoading}
        style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid #2a2a2a",background:pdfLoading?"#222":"#1a1a1a",color:pdfLoading?"#555":"#e8e8e6",fontSize:14,fontWeight:500,cursor:pdfLoading?"default":"pointer",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        {pdfLoading ? "⏳ Se generează PDF..." : "📄 Descarcă raport PDF"}
      </button>

      {/* Member cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {crew.map(member=>{
          const details=getDetail(member.id);
          const total=details.reduce((s,d)=>s+d.total,0);
          return (
            <div key={member.id} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:16,padding:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <Avatar member={member} size={40}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:"#e8e8e6"}}>{member.name}</div>
                  <div style={{fontSize:12,color:"#555"}}>{details.length} zile lucrate</div>
                </div>
                <div style={{fontSize:22,fontWeight:700,color:total>0?"#4ade80":"#333"}}>
                  {total>0?`+${fmtRON(total)}`:"—"}
                </div>
              </div>
              {details.length>0&&(
                <div style={{borderTop:"1px solid #222",paddingTop:10}}>
                  {details.map(({ev,acts,total:evT})=>(
                    <div key={ev.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"7px 0",borderBottom:"1px solid #1a1a1a"}}>
                      <div style={{flex:1,marginRight:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {eventColors[ev.originalId||ev.id]&&<div style={{width:8,height:8,borderRadius:"50%",background:eventColors[ev.originalId||ev.id],flexShrink:0}}/>}
                          <div style={{fontSize:13,color:eventColors[ev.originalId||ev.id]||"#ccc",fontWeight:500}}>{ev.title}</div>
                        </div>
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:10,color:"#555"}}>{new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}{ev.isMultiDay?` · Z${ev.dayIndex+1}`:""}</span>
                          {acts.filter(a=>a.key!=="observatii").map(a=><span key={a.key} style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#1a2e1a",color:"#4ade80"}}>{a.icon} {a.label}</span>)}
                        </div>
                        {typeof getChecked(member.id,ev.id)["observatii"]==="string" && getChecked(member.id,ev.id)["observatii"] && (
                          <div style={{fontSize:11,color:"#666",fontStyle:"italic",marginTop:3}}>📝 {getChecked(member.id,ev.id)["observatii"]}</div>
                        )}
                      </div>
                      <span style={{fontSize:14,fontWeight:700,color:"#4ade80",flexShrink:0}}>+{fmtRON(evT)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,marginTop:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:"#666"}}>TOTAL</span>
                    <span style={{fontSize:18,fontWeight:700,color:"#4ade80"}}>+{fmtRON(total)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {grandTotal>0&&(
        <div style={{background:"#1a2e1a",border:"1px solid #2d5a2d",borderRadius:16,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:14,fontWeight:600,color:"#4ade80"}}>TOTAL GENERAL</span>
          <span style={{fontSize:26,fontWeight:700,color:"#4ade80"}}>+{fmtRON(grandTotal)}</span>
        </div>
      )}
      {crew.every(m=>getDetail(m.id).length===0)&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#444",fontSize:14}}>
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
    <div style={{padding:"16px 16px 0"}}>
      {!isTech && (
        <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:16,padding:16,marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600,color:"#e8e8e6",marginBottom:14}}>Bonusuri per persoană</div>
          {TEAM.filter(m=>!m.isViewer).map(m=>{
            const acts=getUserActions(m.id);
            const bns=getBonuses(m.id);
            const isEditingThis = editing===m.id;
            return (
              <div key={m.id} style={{marginBottom:16,padding:"12px 14px",background:"#111",borderRadius:12,border:"1px solid #222"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <Avatar member={m} size={28}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#e8e8e6",flex:1}}>{m.name}</span>
                  {m.isChief&&<span style={{fontSize:9,background:"#1e3a5f",color:"#7eb8f7",padding:"1px 7px",borderRadius:20,fontWeight:600}}>CHIEF</span>}
                  {user.isChief && !m.isChief && !isEditingThis && (
                    <button onClick={()=>startEdit(m.id)}
                      style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #333",background:"transparent",color:"#888",cursor:"pointer"}}>
                      ✏️ Editează
                    </button>
                  )}
                  {isEditingThis && (
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>saveEdit(m.id)}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"none",background:"#4ade80",color:"#111",fontWeight:700,cursor:"pointer"}}>
                        ✓ Salvează
                      </button>
                      <button onClick={()=>setEditing(null)}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #333",background:"transparent",color:"#666",cursor:"pointer"}}>
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
                        <span style={{fontSize:13,flex:1,color:"#ccc"}}>{a.label}</span>
                        <input type="number" value={tempBonus[a.key]??0}
                          onChange={e=>setTempBonus(p=>({...p,[a.key]:parseFloat(e.target.value)||0}))}
                          style={{width:75,padding:"6px 8px",borderRadius:8,border:"1px solid #333",background:"#1a1a1a",fontSize:14,fontWeight:600,textAlign:"right",color:"#e8e8e6"}}/>
                        <span style={{fontSize:12,color:"#555",width:28}}>RON</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {acts.map(a=><span key={a.key} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:bns[a.key]>0?"#1a2e1a":"#222",color:bns[a.key]>0?"#4ade80":"#555",fontWeight:500}}>{a.icon} {a.label}: {bns[a.key]>0?fmtRON(bns[a.key]):"—"}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:600,color:"#e8e8e6",marginBottom:14}}>Echipa</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {TEAM.map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"#111",border:"1px solid #222",borderRadius:12}}>
              <Avatar member={m} size={34}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:"#ccc"}}>{m.name}</div>
                <div style={{fontSize:11,color:"#555"}}>{m.email}</div>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{fontSize:9,background:m.isChief?"#1e3a5f":m.isViewer?"#222":"#1a2e1a",color:m.isChief?"#7eb8f7":m.isViewer?"#555":"#4ade80",padding:"2px 8px",borderRadius:20,fontWeight:600,letterSpacing:0.5}}>
                  {m.isChief?"CHIEF":m.isViewer?"VIEWER":"TECH"}
                </span>
                {m.id===user.id&&<span style={{fontSize:10,color:"#333"}}>← tu</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:"#111",border:"1px solid #1e3a5f",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:"#7eb8f7",marginBottom:8}}>🔥 Firebase — Live Sync</div>
        <div style={{fontSize:11,color:"#4ade80"}}>● Conectat · Date sincronizate în timp real</div>
        <div style={{fontSize:11,color:"#555",marginTop:4}}>Proiect: crew-tracker-led</div>
      </div>
      <div style={{background:"#111",border:"1px solid #1e3a5f",borderRadius:16,padding:16,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,color:"#7eb8f7",marginBottom:8}}>📆 Google Calendar</div>
        <div style={{fontSize:11,color:"#4ade80"}}>● Conectat și activ</div>
        <div style={{fontSize:11,color:"#555",marginTop:4,wordBreak:"break-all"}}>{CALENDAR_ID}</div>
      </div>
      <div style={{textAlign:"center",padding:"16px 0 8px",fontSize:11,color:"#333"}}>ig vision™ crew tracker · www.igvision.ro</div>
    </div>
  );
}
