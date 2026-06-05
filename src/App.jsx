import { useState, useEffect } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACTIONS = [
  { key: "montaj",    label: "Montaj",    icon: "🔧" },
  { key: "demontaj",  label: "Demontaj",  icon: "📦" },
  { key: "operare",   label: "Operare",   icon: "🖥️"  },
  { key: "condus",    label: "Condus",    icon: "🚐" },
  { key: "deplasare", label: "Deplasare", icon: "🗺️"  },
  { key: "asistenta", label: "Asistență", icon: "🎧" },
];

const DEFAULT_BONUSES = {
  montaj: 37.5, demontaj: 37.5, operare: 250,
  condus: 50, deplasare: 0, asistenta: 0,
};

const USER_CONFIG = {
  ionut:  { visibleActions: ["montaj","demontaj","operare","condus","deplasare","asistenta"], bonuses: { ...DEFAULT_BONUSES } },
  daniel: { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta"],          bonuses: { ...DEFAULT_BONUSES, montaj: 50, demontaj: 50 } },
  stefan: { visibleActions: ["montaj","demontaj","operare","condus","deplasare","asistenta"], bonuses: { ...DEFAULT_BONUSES } },
  gabi:   { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta"],          bonuses: { ...DEFAULT_BONUSES } },
};

const TEAM = [
  { id: "ionut",   name: "Ionuț Gurău",      email: "gurauionut@gmail.com",       password: "crew2024!",  initials: "IG",  color: "#185FA5", bg: "#DCE8F7", role: "Crew Chief",   isChief: true,  isViewer: false },
  { id: "daniel",  name: "Stancu Daniel",    email: "danielmarcel1313@gmail.com", password: "daniel2024", initials: "SD",  color: "#1a5c2a", bg: "#D6EDDC", role: "Technician",   isChief: false, isViewer: false },
  { id: "stefan",  name: "Ștefan Maricescu", email: "barosan.stefy@gmail.com",    password: "stefan2024", initials: "SM",  color: "#7a3b00", bg: "#F5E6D3", role: "Technician",   isChief: false, isViewer: false },
  { id: "gabi",    name: "Gabi Bugeanu",     email: "fymwithart@gmail.com",       password: "gabi2024",   initials: "GB",  color: "#3C3489", bg: "#E5E4F8", role: "Technician",   isChief: false, isViewer: false },
  { id: "anca",    name: "Anca Gurău",       email: "ancagurau@gmail.com",        password: "anca2024",   initials: "AG",  color: "#72243E", bg: "#F5DCE5", role: "Contabilitate", isChief: false, isViewer: true  },
  { id: "ionel",   name: "Ionel Gurău",      email: "ionelgurau.ig@gmail.com",    password: "ionel2024",  initials: "IG2", color: "#444441", bg: "#E8E8E6", role: "Contabilitate", isChief: false, isViewer: true  },
];

const CALENDAR_ID    = "p6khitulp9l3vdrasd5rt4ep68@group.calendar.google.com";
const CALENDAR_EMBED = "https://calendar.google.com/calendar/embed?src=p6khitulp9l3vdrasd5rt4ep68%40group.calendar.google.com&ctz=Europe%2FBucharest";
const CALENDAR_API_KEY = "AIzaSyAJ49QRmSGj5cDBdKXDjDJZy-Q_3PAsrEg";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)    { return new Date(d).toLocaleDateString("ro-RO", { weekday:"long", day:"numeric", month:"long" }); }
function fmtMonth(d)   { return new Date(d).toLocaleDateString("ro-RO", { month:"long", year:"numeric" }); }
function fmtRON(n)     { const v=Number(n); return v%1===0?`${v} RON`:`${v.toFixed(1)} RON`; }
function load(k,fb)    { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } }
function save(k,val)   { try { localStorage.setItem(k,JSON.stringify(val)); } catch {} }

function getUserActions(uid) {
  return ACTIONS.filter(a => (USER_CONFIG[uid]?.visibleActions || ["montaj","demontaj","operare","deplasare","asistenta"]).includes(a.key));
}
function getUserBonuses(uid) { return USER_CONFIG[uid]?.bonuses || DEFAULT_BONUSES; }

function parseDateLocal(str) {
  if (!str) return new Date();
  if (str.length === 10) { const [y,m,d]=str.split("-").map(Number); return new Date(y,m-1,d); }
  return new Date(str);
}

function parseGCalEvents(items) {
  const result = {};
  (items||[]).filter(ev=>ev.status!=="cancelled").forEach(ev => {
    const title   = ev.summary || "Eveniment";
    const loc     = ev.location || "";
    const hasTime = !!ev.start?.dateTime;
    const startStr = ev.start?.dateTime || ev.start?.date || "";
    const endStr   = ev.end?.dateTime   || ev.end?.date   || "";
    const startD   = parseDateLocal(startStr);
    const endD     = parseDateLocal(endStr);
    const startDay = new Date(startD); startDay.setHours(0,0,0,0);
    const endDay   = new Date(endD);   endDay.setHours(0,0,0,0);
    const endsAtMidnight = hasTime && endD.getHours()===0 && endD.getMinutes()===0;
    if (!hasTime || endsAtMidnight) endDay.setDate(endDay.getDate()-1);
    const totalDays = Math.max(1, Math.round((endDay-startDay)/86400000)+1);
    for (let i=0; i<totalDays; i++) {
      const thisDay = addDays(startDay,i);
      const dayKey  = toKey(thisDay);
      let startTime="", endTime="";
      if (hasTime) {
        if (i===0)           startTime = startD.toLocaleTimeString("ro-RO",{hour:"2-digit",minute:"2-digit"});
        if (i===totalDays-1) endTime   = endD.toLocaleTimeString("ro-RO",  {hour:"2-digit",minute:"2-digit"});
      }
      const dayEventId = totalDays>1 ? `${ev.id}_day${i}` : ev.id;
      const entry = { id:dayEventId, originalId:ev.id, title, location:loc, dayKey,
        start:startTime, end:endTime, dayIndex:i, totalDays, isMultiDay:totalDays>1 };
      if (!result[dayKey]) result[dayKey]=[];
      if (!result[dayKey].find(e=>e.id===dayEventId)) result[dayKey].push(entry);
    }
  });
  Object.keys(result).forEach(k => result[k].sort((a,b)=>(a.start||"").localeCompare(b.start||"")));
  return result;
}

// ─── LOGO COMPONENT ───────────────────────────────────────────────────────────

function IgVisionLogo({ size = "md" }) {
  const large = size === "lg";
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems: large?"center":"flex-start", gap: large?4:2 }}>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: large ? 28 : 16,
        fontWeight: 700,
        letterSpacing: large ? 4 : 2,
        background: "linear-gradient(135deg, #888 0%, #fff 40%, #aaa 60%, #555 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        lineHeight: 1,
        textTransform: "lowercase",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
      }}>
        ig vision<sup style={{ fontSize: large?11:7, letterSpacing:0, WebkitTextFillColor:"transparent", background:"inherit", WebkitBackgroundClip:"text", backgroundClip:"text" }}>™</sup>
      </div>
      {large && (
        <div style={{ fontSize:11, color:"#888", letterSpacing:3, textTransform:"uppercase", fontWeight:400 }}>
          crew tracker
        </div>
      )}
    </div>
  );
}

// ─── ATOMS ────────────────────────────────────────────────────────────────────

function Avatar({ member, size=32 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:member.bg, color:member.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.3, fontWeight:700, flexShrink:0, userSelect:"none" }}>
      {member.initials}
    </div>
  );
}

function MultiDayPill({ dayIndex, totalDays }) {
  return (
    <span style={{ fontSize:10, background:"#2a2a2a", color:"#ccc", padding:"2px 8px", borderRadius:20, fontWeight:600, whiteSpace:"nowrap", letterSpacing:0.3 }}>
      Ziua {dayIndex+1}/{totalDays}
    </span>
  );
}

function DayNav({ day, setDay }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = toKey(day)===toKey(today);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
      <button onClick={()=>setDay(addDays(day,-1))} style={S.navBtn}>‹</button>
      <div style={{ flex:1, textAlign:"center" }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6", textTransform:"capitalize" }}>{fmtDate(day)}</div>
        {isToday && <div style={{ fontSize:11, color:"#4ade80", marginTop:1 }}>azi</div>}
      </div>
      <button onClick={()=>setDay(addDays(day,1))} style={S.navBtn}>›</button>
    </div>
  );
}

function EmptyDay({ loading }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 0", color:"#555", fontSize:14 }}>
      {loading ? <><div style={{ fontSize:28, marginBottom:8 }}>⏳</div>Se încarcă din Google Calendar...</> : <><div style={{ fontSize:28, marginBottom:8 }}>📭</div>Nicio activare în această zi</>}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#1a1a1a", color:"#e8e8e6", padding:"10px 24px", borderRadius:24, fontSize:13, fontWeight:500, whiteSpace:"nowrap", zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.5)", border:"1px solid #333" }}>{msg}</div>;
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user,         setUser]         = useState(() => {
    // Restore session from localStorage
    const saved = load("ct_session", null);
    if (saved) { const m = TEAM.find(t=>t.id===saved); return m||null; }
    return null;
  });
  const [day,          setDay]          = useState(new Date());
  const [tab,          setTab]          = useState("today");
  const [selEvent,     setSelEvent]     = useState(null);
  const [toast,        setToast]        = useState(null);
  const [gcalEvents,   setGcalEvents]   = useState({});
  const [calLoading,   setCalLoading]   = useState(false);
  const [calError,     setCalError]     = useState(null);
  const [apiKey,       setApiKey]       = useState(()=>load("ct_apikey",""));
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [checked,      setChecked]      = useState(()=>load("ct_checked",{}));
  const [approvals,    setApprovals]    = useState(()=>load("ct_approvals",{}));
  const [amounts,      setAmounts]      = useState(()=>load("ct_amounts",{}));

  useEffect(()=>{ save("ct_checked",   checked);   },[checked]);
  useEffect(()=>{ save("ct_approvals", approvals); },[approvals]);
  useEffect(()=>{ save("ct_amounts",   amounts);   },[amounts]);
  useEffect(()=>{ save("ct_apikey",    apiKey);    },[apiKey]);
  useEffect(()=>{ if(user) save("ct_session",user.id); else localStorage.removeItem("ct_session"); },[user]);

  useEffect(()=>{

    const from = new Date(day.getFullYear(), day.getMonth()-1, 1);
    const to   = new Date(day.getFullYear(), day.getMonth()+2, 0);
    setCalLoading(true); setCalError(null);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${CALENDAR_API_KEY}&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=500`;
    fetch(url).then(r=>r.json()).then(data=>{
      if (data.error) { setCalError(data.error.message); setCalLoading(false); return; }
      setGcalEvents(parseGCalEvents(data.items));
      setCalLoading(false);
    }).catch(e=>{ setCalError(e.message); setCalLoading(false); });
  },[day.getMonth(), day.getFullYear()]);

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(null),2500); }

  const dayKey = toKey(day);
  const events = gcalEvents[dayKey]||[];

  const getChecked  = (uid,eid)    => checked[uid]?.[eid]||{};
  const getApproval = (uid,eid)    => approvals[uid]?.[eid]?.status??null;
  const getAmount   = (uid,eid,ak) => amounts[uid]?.[eid]?.[ak] ?? getUserBonuses(uid)[ak] ?? DEFAULT_BONUSES[ak];

  function toggleMyAction(eid,ak) {
    if (getApproval(user.id,eid)==="approved") return;
    setChecked(prev=>{ const u={...(prev[user.id]||{})}; const e={...(u[eid]||{})}; e[ak]=!e[ak]; u[eid]=e; return {...prev,[user.id]:u}; });
  }
  function setApprovalStatus(uid,eid,status) {
    setApprovals(prev=>{ const u={...(prev[uid]||{})}; u[eid]={...(u[eid]||{}),status}; return {...prev,[uid]:u}; });
    showToast(status==="approved"?"✓ Aprobat":status==="rejected"?"✗ Respins":"↩ Anulat");
  }
  function setActionAmount(uid,eid,ak,val) {
    setAmounts(prev=>{ const u={...(prev[uid]||{})}; const e={...(u[eid]||{})}; e[ak]=val; u[eid]=e; return {...prev,[uid]:u}; });
  }
  function calcBonus(uid,eid) {
    return Object.entries(getChecked(uid,eid)).filter(([,v])=>v).reduce((s,[k])=>s+getAmount(uid,eid,k),0);
  }
  function calcDayTotal(uid) {
    return events.reduce((s,ev)=>s+(getApproval(uid,ev.id)==="approved"?calcBonus(uid,ev.id):0),0);
  }
  function getPendingCount() {
    return TEAM.filter(m=>!m.isChief&&!m.isViewer).reduce((total,m)=>
      total+events.filter(ev=>Object.values(getChecked(m.id,ev.id)).some(Boolean)&&!getApproval(m.id,ev.id)).length,0);
  }
  function handleLogin(member)   { setUser(member); showToast(`Bun venit, ${member.name.split(" ")[0]}! 👋`); }
  function handleLogout()        { setUser(null); setTab("today"); setSelEvent(null); }
  function handleDayChange(d)    { setDay(d); setSelEvent(null); }

  const shared = { user, day, setDay:handleDayChange, events, gcalEvents, getChecked, getApproval, getAmount, calcBonus, calcDayTotal, showToast, calLoading, calError };

  if (!user) return <><LoginScreen onLogin={handleLogin}/><Toast msg={toast}/></>;

  let tabs = [];
  if      (user.isViewer) tabs=[{id:"report",label:"Raport"}];
  else if (user.isChief)  tabs=[{id:"today",label:"Azi"},{id:"approve",label:"Aprobare"},{id:"report",label:"Raport"},{id:"settings",label:"Setări"}];
  else                    tabs=[{id:"today",label:"Azi"},{id:"settings",label:"Setări"}];

  if (user.isViewer && tab!=="report") setTab("report");
  const pending = user.isChief ? getPendingCount() : 0;

  return (
    <div style={{ minHeight:"100vh", background:"#111", display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Topbar */}
      <div style={{ background:"#1a1a1a", borderBottom:"1px solid #2a2a2a", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52, position:"sticky", top:0, zIndex:100, gap:12 }}>
        <IgVisionLogo size="sm"/>

        {/* Tabs */}
        <div style={{ display:"flex", gap:2, background:"#111", borderRadius:10, padding:3 }}>
          {tabs.map(t=>{
            const active=tab===t.id;
            return (
              <div key={t.id} style={{ position:"relative" }}>
                <button onClick={()=>setTab(t.id)} style={{ padding:"5px 14px", borderRadius:8, border:"none", background:active?"#2a2a2a":"transparent", color:active?"#e8e8e6":"#666", fontSize:13, fontWeight:active?500:400, cursor:"pointer", transition:"all 0.15s" }}>
                  {t.label}
                </button>
                {t.id==="approve"&&pending>0&&<span style={{ position:"absolute", top:-4, right:-4, width:17, height:17, borderRadius:"50%", background:"#ef4444", color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{pending}</span>}
              </div>
            );
          })}
        </div>

        {/* User */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          
          <span style={{ fontSize:11, color:"#4ade80", fontWeight:500 }}>● Live</span>
          <Avatar member={user} size={28}/>
          <span style={{ fontSize:13, fontWeight:500, color:"#e8e8e6" }}>{user.name.split(" ")[0]}</span>
          <button onClick={handleLogout} style={{ background:"none", border:"1px solid #333", borderRadius:6, padding:"3px 10px", fontSize:11, color:"#666", cursor:"pointer" }}>Ieși</button>
        </div>
      </div>

      {showApiSetup&&<ApiSetupModal apiKey={apiKey} setApiKey={setApiKey} onClose={()=>setShowApiSetup(false)} showToast={showToast}/>}

      <div style={{ flex:1 }}>
        {tab==="today"   &&!user.isViewer&&<TodayView   {...shared} selEvent={selEvent} setSelEvent={setSelEvent} toggleMyAction={toggleMyAction}/>}
        {tab==="approve" && user.isChief &&<ApproveView {...shared} setApprovalStatus={setApprovalStatus} setActionAmount={setActionAmount}/>}
        {tab==="report"                  &&<ReportView  {...shared}/>}
        {tab==="settings"&&!user.isViewer&&<SettingsView {...shared} setApiKey={setApiKey} setShowApiSetup={setShowApiSetup}/>}
      </div>
      <Toast msg={toast}/>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [step,     setStep]     = useState("email");

  function handleEmailNext() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Introdu adresa de email."); return; }
    if (!TEAM.find(m=>m.email.toLowerCase()===trimmed)) { setError("Email nerecunoscut."); return; }
    setError(""); setStep("password");
  }
  function handleLogin() {
    const member = TEAM.find(m=>m.email.toLowerCase()===email.trim().toLowerCase());
    if (!member) { setStep("email"); return; }
    if (password!==member.password) { setError("Parolă incorectă."); setPassword(""); return; }
    setLoading(true);
    setTimeout(()=>{ onLogin(member); setLoading(false); },300);
  }
  const currentMember = step==="password" ? TEAM.find(m=>m.email.toLowerCase()===email.trim().toLowerCase()) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#111", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      <div style={{ width:"100%", maxWidth:360 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ marginBottom:16 }}><IgVisionLogo size="lg"/></div>
        </div>

        {/* Card */}
        <div style={{ background:"#1a1a1a", borderRadius:16, padding:28, border:"1px solid #2a2a2a", boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
          {step==="email" && (
            <>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontWeight:600, color:"#666", display:"block", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Email</label>
                <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleEmailNext()}
                  placeholder="adresa@gmail.com" autoFocus
                  style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:error?"1px solid #ef4444":"1px solid #2a2a2a", fontSize:14, color:"#e8e8e6", outline:"none", background:"#111", boxSizing:"border-box" }}/>
                {error&&<div style={{ fontSize:12, color:"#ef4444", marginTop:6 }}>⚠ {error}</div>}
              </div>
              <button onClick={handleEmailNext}
                style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background:"#e8e8e6", color:"#111", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                Continuă →
              </button>
            </>
          )}

          {step==="password" && currentMember && (
            <>
              {/* Who's logging in */}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#111", borderRadius:10, marginBottom:20, border:"1px solid #2a2a2a" }}>
                <Avatar member={currentMember} size={34}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6" }}>{currentMember.name}</div>
                  <div style={{ fontSize:11, color:"#555" }}>{currentMember.email}</div>
                </div>
                <button onClick={()=>{setStep("email");setPassword("");setError("");}} style={{ fontSize:11, color:"#888", background:"none", border:"none", cursor:"pointer" }}>Schimbă</button>
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:600, color:"#666", display:"block", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Parolă</label>
                <div style={{ position:"relative" }}>
                  <input type={showPwd?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}}
                    onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                    placeholder="••••••••" autoFocus
                    style={{ width:"100%", padding:"12px 44px 12px 14px", borderRadius:10, border:error?"1px solid #ef4444":"1px solid #2a2a2a", fontSize:14, color:"#e8e8e6", outline:"none", background:"#111", boxSizing:"border-box" }}/>
                  <button onClick={()=>setShowPwd(!showPwd)}
                    style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:15, color:"#555", padding:0 }}>
                    {showPwd?"🙈":"👁"}
                  </button>
                </div>
                {error&&<div style={{ fontSize:12, color:"#ef4444", marginTop:6 }}>⚠ {error}</div>}
              </div>

              {/* Remember me */}
              <div onClick={()=>setRememberMe(!rememberMe)}
                style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, cursor:"pointer", userSelect:"none" }}>
                <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${rememberMe?"#4ade80":"#444"}`, background:rememberMe?"#4ade80":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                  {rememberMe&&<span style={{ color:"#111", fontSize:11, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:13, color:"#888" }}>Ține-mă minte</span>
              </div>

              <button onClick={handleLogin} disabled={loading}
                style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background:loading?"#333":"#e8e8e6", color:loading?"#666":"#111", fontSize:14, fontWeight:600, cursor:loading?"default":"pointer" }}>
                {loading?"Se verifică...":"Intră în aplicație →"}
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:"#444" }}>
          www.igvision.ro
        </div>
      </div>
    </div>
  );
}

// ─── API SETUP MODAL ──────────────────────────────────────────────────────────

function ApiSetupModal({ apiKey, setApiKey, onClose, showToast }) {
  const [val,setVal]=useState(apiKey);
  function doSave() { setApiKey(val.trim()); showToast("🔑 API Key salvat!"); onClose(); }
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#1a1a1a", borderRadius:16, padding:28, maxWidth:460, width:"100%", border:"1px solid #2a2a2a", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize:16, fontWeight:600, color:"#e8e8e6", marginBottom:16 }}>🔑 Conectare Google Calendar</div>
        <div style={{ fontSize:13, color:"#888", marginBottom:20, lineHeight:1.7 }}>
          1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color:"#7eb8f7" }}>console.cloud.google.com</a> → proiectul tău<br/>
          2. APIs & Services → Credentials → Create API Key<br/>
          3. Restricționează la Google Calendar API<br/>
          4. Asigură-te că <strong style={{ color:"#e8e8e6" }}>calendarul e public</strong> în Google Calendar
        </div>
        <input type="text" value={val} onChange={e=>setVal(e.target.value)} placeholder="AIzaSy..."
          style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid #333", fontSize:14, color:"#e8e8e6", marginBottom:16, outline:"none", background:"#111", boxSizing:"border-box" }}/>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={doSave} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:"#e8e8e6", color:"#111", fontSize:14, fontWeight:600, cursor:"pointer" }}>Salvează</button>
          <button onClick={onClose} style={{ flex:1, padding:"10px", borderRadius:10, border:"1px solid #333", background:"transparent", color:"#888", fontSize:14, cursor:"pointer" }}>Anulează</button>
        </div>
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────

function TodayView({ user, day, setDay, events, selEvent, setSelEvent, getChecked, toggleMyAction, getApproval, getAmount, calcBonus, calcDayTotal, showToast, calLoading, calError }) {
  const selEv    = events.find(e=>e.id===selEvent);
  const myCheck  = selEv ? getChecked(user.id,selEv.id) : {};
  const approval = selEv ? getApproval(user.id,selEv.id) : null;
  const isLocked = approval==="approved"||approval==="rejected";
  const myActions = getUserActions(user.id);
  const myTotal   = selEv ? Object.entries(myCheck).filter(([,v])=>v).reduce((s,[k])=>s+getAmount(user.id,selEv.id,k),0) : 0;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", minHeight:"calc(100vh - 52px)" }}>

      {/* Left: event list */}
      <div style={{ padding:20, borderRight:"1px solid #1e1e1e", overflowY:"auto" }}>
        <DayNav day={day} setDay={setDay}/>

        {calError&&<div style={{ background:"#2a1515", border:"1px solid #5a2020", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#f87171" }}>
          ⚠ {calError} — Verifică dacă calendarul e public și API Key-ul e corect.
        </div>}

        {/* Calendar status bar */}
        <div style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, padding:"8px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, color:"#4ade80" }}>●</span>
          <span style={{ fontSize:12, color:"#888" }}>Google Calendar</span>
          <span style={{ fontSize:12, color:"#555", marginLeft:"auto" }}>
            {calLoading ? "Se încarcă..." : `${events.length} activăr${events.length===1?"e":"i"} azi`}
          </span>
        </div>

        {(events.length===0||calLoading)&&<EmptyDay loading={calLoading}/>}

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {events.map(ev=>{
            const ch    = getChecked(user.id,ev.id);
            const done  = Object.entries(ch).filter(([,v])=>v).map(([k])=>k);
            const appr  = getApproval(user.id,ev.id);
            const bonus = calcBonus(user.id,ev.id);
            const active = selEvent===ev.id;
            return (
              <div key={ev.id} onClick={()=>setSelEvent(active?null:ev.id)}
                style={{ background:active?"#1e2a1e":"#1a1a1a", border:`1px solid ${active?"#2d5a2d":"#2a2a2a"}`, borderRadius:12, padding:"13px 15px", cursor:"pointer", transition:"border-color 0.15s" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:500, color:active?"#86efac":"#e8e8e6" }}>{ev.title}</span>
                  {ev.start&&<span style={{ fontSize:12, color:"#555", whiteSpace:"nowrap" }}>{ev.start}{ev.end?`–${ev.end}`:""}</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  {ev.isMultiDay&&<MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays}/>}
                  {ev.location&&<span style={{ fontSize:12, color:"#555" }}>📍 {ev.location}</span>}
                </div>
                {(done.length>0||appr)&&(
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, flexWrap:"wrap" }}>
                    {appr==="approved"&&<span style={{ fontSize:11, background:"#1a2e1a", color:"#4ade80", padding:"1px 8px", borderRadius:20, fontWeight:500, border:"1px solid #2d5a2d" }}>✓ aprobat{user.isChief?` · +${fmtRON(bonus)}`:""}</span>}
                    {appr==="rejected"&&<span style={{ fontSize:11, background:"#2a1515", color:"#f87171", padding:"1px 8px", borderRadius:20, fontWeight:500, border:"1px solid #5a2020" }}>✗ respins</span>}
                    {!appr&&done.length>0&&<span style={{ fontSize:11, color:"#f59e0b", fontWeight:500 }}>⏳ în așteptare</span>}
                    {done.map(k=><span key={k} style={{ fontSize:10, padding:"1px 7px", borderRadius:20, background:"#1a2e1a", color:"#4ade80", fontWeight:500 }}>✓ {ACTIONS.find(a=>a.key===k)?.label}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {events.length>0&&user.isChief&&(
          <div style={{ marginTop:16, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#555" }}>Total aprobat azi</span>
            <span style={{ fontSize:18, fontWeight:700, color:"#4ade80" }}>+{fmtRON(calcDayTotal(user.id))}</span>
          </div>
        )}
      </div>

      {/* Right: action panel */}
      <div style={{ background:"#151515", overflowY:"auto", borderLeft:"1px solid #1e1e1e" }}>
        {!selEv ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:12, color:"#333" }}>
            <span style={{ fontSize:36 }}>←</span>
            <span style={{ fontSize:14, color:"#555" }}>Selectează o activare</span>
          </div>
        ) : (
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:600, color:"#e8e8e6", marginBottom:4 }}>{selEv.title}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                {selEv.isMultiDay&&<MultiDayPill dayIndex={selEv.dayIndex} totalDays={selEv.totalDays}/>}
                {selEv.location&&<span style={{ fontSize:12, color:"#555" }}>📍 {selEv.location}</span>}
              </div>
            </div>

            {approval&&(
              <div style={{ padding:"10px 14px", borderRadius:10, background:approval==="approved"?"#1a2e1a":"#2a1515", fontSize:13, fontWeight:500, color:approval==="approved"?"#4ade80":"#f87171", border:`1px solid ${approval==="approved"?"#2d5a2d":"#5a2020"}` }}>
                {approval==="approved"?"✅ Acțiunile tale au fost aprobate.":"❌ Acțiunile au fost respinse. Contactează Crew Chief."}
              </div>
            )}

            <div style={{ height:1, background:"#222" }}/>

            <div style={{ fontSize:11, fontWeight:600, color:"#444", textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {isLocked?"Acțiunile bifate":"Ce ai făcut AZI?"}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {myActions.map(action=>{
                const on  = !!myCheck[action.key];
                const amt = getAmount(user.id,selEv.id,action.key);
                return (
                  <div key={action.key} onClick={()=>!isLocked&&toggleMyAction(selEv.id,action.key)}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderRadius:10, border:`1px solid ${on?"#2d5a2d":"#222"}`, background:on?"#1a2e1a":"#1a1a1a", cursor:isLocked?"default":"pointer", opacity:isLocked&&!on?0.35:1, transition:"all 0.12s" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:17 }}>{action.icon}</span>
                      <span style={{ fontSize:14, fontWeight:on?500:400, color:on?"#86efac":"#ccc" }}>{action.label}</span>
                    </div>
                    <div style={{ width:22, height:22, borderRadius:7, border:on?"none":"1.5px solid #333", background:on?"#4ade80":"transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"#111", fontSize:13, fontWeight:700, flexShrink:0 }}>
                      {on&&"✓"}
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLocked&&(
              <>
                <div style={{ background:"#1a1a1a", border:"1px solid #222", borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#555" }}>
                    <span>Acțiuni bifate</span>
                    <span style={{ fontWeight:600, color:"#888" }}>{Object.values(myCheck).filter(Boolean).length} / {myActions.length}</span>
                  </div>
                  {user.isChief&&myTotal>0&&(
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, marginTop:8, borderTop:"1px solid #222" }}>
                      <span style={{ fontSize:13, color:"#888" }}>Total estimat</span>
                      <span style={{ fontSize:18, fontWeight:700, color:"#4ade80" }}>+{fmtRON(myTotal)}</span>
                    </div>
                  )}
                </div>
                <button onClick={()=>showToast("✅ Trimis spre aprobare!")}
                  style={{ background:"#e8e8e6", color:"#111", border:"none", borderRadius:10, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Trimite spre aprobare →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APPROVE VIEW ─────────────────────────────────────────────────────────────

function ApproveView({ user, day, setDay, events, getChecked, getApproval, setApprovalStatus, getAmount, setActionAmount, calcBonus, calcDayTotal, calLoading }) {
  const [expanded,    setExpanded]    = useState(null);
  const [editAmounts, setEditAmounts] = useState({});
  function getEdit(uid,eid,ak) { return editAmounts[`${uid}-${eid}-${ak}`]??getAmount(uid,eid,ak); }
  function setEdit(uid,eid,ak,val) { setEditAmounts(prev=>({...prev,[`${uid}-${eid}-${ak}`]:val})); }
  function commitAndApprove(uid,eid) {
    Object.entries(editAmounts).forEach(([key,val])=>{ const p=key.split("-"); if(p[0]===uid&&p[1]===eid) setActionAmount(uid,eid,p[2],Number(val)); });
    setApprovalStatus(uid,eid,"approved"); setExpanded(null);
  }
  const members = TEAM.filter(m=>!m.isChief&&!m.isViewer);

  return (
    <div style={{ padding:20, maxWidth:780, margin:"0 auto" }}>
      <DayNav day={day} setDay={setDay}/>
      {calLoading&&<EmptyDay loading/>}
      {!calLoading&&events.length===0&&<EmptyDay/>}
      {members.map(member=>{
        const memberEvs   = events.filter(ev=>Object.values(getChecked(member.id,ev.id)).some(Boolean));
        const userActions = getUserActions(member.id);
        return (
          <div key={member.id} style={{ marginBottom:24 }}>
            {/* Member header */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, padding:"12px 16px", background:"#1a1a1a", borderRadius:12, border:"1px solid #2a2a2a" }}>
              <Avatar member={member} size={38}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6" }}>{member.name}</div>
                <div style={{ fontSize:12, color:"#555" }}>{member.email}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"#444" }}>Total aprobat azi</div>
                <div style={{ fontSize:18, fontWeight:700, color:calcDayTotal(member.id)>0?"#4ade80":"#333" }}>
                  {calcDayTotal(member.id)>0?`+${fmtRON(calcDayTotal(member.id))}`:"—"}
                </div>
              </div>
            </div>
            {memberEvs.length===0&&<div style={{ padding:"8px 16px", marginLeft:8, fontSize:13, color:"#444" }}>Nicio acțiune raportată azi.</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginLeft:8 }}>
              {memberEvs.map(ev=>{
                const ch        = getChecked(member.id,ev.id);
                const activeActs= userActions.filter(a=>ch[a.key]);
                const appr      = getApproval(member.id,ev.id);
                const key       = `${member.id}-${ev.id}`;
                const isOpen    = expanded===key;
                const editTotal = activeActs.reduce((s,a)=>s+Number(getEdit(member.id,ev.id,a.key)),0);
                return (
                  <div key={ev.id} style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, overflow:"hidden" }}>
                    <div style={{ padding:"11px 14px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      {ev.isMultiDay&&<MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays}/>}
                      <span style={{ fontSize:13, fontWeight:500, color:"#e8e8e6", flex:1, minWidth:100 }}>{ev.title}</span>
                      {ev.start&&<span style={{ fontSize:12, color:"#555" }}>{ev.start}{ev.end?`–${ev.end}`:""}</span>}
                      {appr==="approved"&&<span style={{ fontSize:11, background:"#1a2e1a", color:"#4ade80", padding:"2px 10px", borderRadius:20, fontWeight:500, border:"1px solid #2d5a2d" }}>✓ aprobat</span>}
                      {appr==="rejected"&&<span style={{ fontSize:11, background:"#2a1515", color:"#f87171", padding:"2px 10px", borderRadius:20, fontWeight:500 }}>✗ respins</span>}
                      {!appr&&<span style={{ fontSize:11, background:"#2a2000", color:"#f59e0b", padding:"2px 10px", borderRadius:20, fontWeight:500 }}>⏳ așteptare</span>}
                    </div>
                    <div style={{ padding:"0 14px 12px", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                      {activeActs.map(a=><span key={a.key} style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"#1a2e1a", color:"#4ade80", fontWeight:500 }}>{a.icon} {a.label} · {fmtRON(getAmount(member.id,ev.id,a.key))}</span>)}
                      <span style={{ marginLeft:"auto", fontSize:14, fontWeight:700, color:appr==="approved"?"#4ade80":"#555" }}>+{fmtRON(calcBonus(member.id,ev.id))}</span>
                      {!appr&&<button onClick={()=>setExpanded(isOpen?null:key)} style={{ fontSize:12, padding:"4px 12px", borderRadius:8, border:"1px solid #333", background:"transparent", color:"#888", cursor:"pointer" }}>{isOpen?"Închide":"Revizuiește"}</button>}
                      {appr==="approved"&&<button onClick={()=>setApprovalStatus(member.id,ev.id,null)} style={{ fontSize:11, padding:"3px 10px", borderRadius:8, border:"1px solid #333", background:"transparent", color:"#555", cursor:"pointer" }}>Anulează</button>}
                    </div>
                    {isOpen&&(
                      <div style={{ padding:"14px 16px", background:"#111", borderTop:"1px solid #222" }}>
                        <div style={{ fontSize:12, color:"#666", marginBottom:12 }}>Modifică suma per acțiune dacă e necesar:</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                          {activeActs.map(a=>(
                            <div key={a.key} style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <span style={{ fontSize:17 }}>{a.icon}</span>
                              <span style={{ fontSize:14, flex:1, color:"#e8e8e6", fontWeight:500 }}>{a.label}</span>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <input type="number" value={getEdit(member.id,ev.id,a.key)} onChange={e=>setEdit(member.id,ev.id,a.key,e.target.value)}
                                  style={{ width:80, padding:"6px 10px", borderRadius:8, border:"1px solid #333", background:"#1a1a1a", fontSize:14, fontWeight:600, textAlign:"right", color:"#e8e8e6" }}/>
                                <span style={{ fontSize:13, color:"#555" }}>RON</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, padding:"10px 14px", background:"#1a2e1a", borderRadius:10, border:"1px solid #2d5a2d" }}>
                          <span style={{ fontSize:13, color:"#4ade80" }}>Total de plătit</span>
                          <span style={{ fontSize:20, fontWeight:700, color:"#4ade80" }}>+{fmtRON(editTotal)}</span>
                        </div>
                        <div style={{ display:"flex", gap:10 }}>
                          <button onClick={()=>commitAndApprove(member.id,ev.id)} style={{ flex:1, padding:"11px", borderRadius:10, border:"none", background:"#4ade80", color:"#111", fontSize:14, fontWeight:700, cursor:"pointer" }}>✓ Aprobă</button>
                          <button onClick={()=>{setApprovalStatus(member.id,ev.id,"rejected");setExpanded(null);}} style={{ flex:1, padding:"11px", borderRadius:10, border:"1px solid #ef4444", background:"transparent", color:"#ef4444", fontSize:14, fontWeight:600, cursor:"pointer" }}>✗ Respinge</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── REPORT VIEW ──────────────────────────────────────────────────────────────

function ReportView({ gcalEvents, getChecked, getApproval, getAmount }) {
  const [reportMonth, setReportMonth] = useState(()=>{ const t=new Date(); return new Date(t.getFullYear(),t.getMonth(),1); });
  const monthStart = new Date(reportMonth.getFullYear(),reportMonth.getMonth(),1);
  const monthEnd   = new Date(reportMonth.getFullYear(),reportMonth.getMonth()+1,0);
  const monthEvents = [];
  for (let d=new Date(monthStart);d<=monthEnd;d.setDate(d.getDate()+1)) {
    const k=toKey(new Date(d)); (gcalEvents[k]||[]).forEach(ev=>monthEvents.push({...ev,dayKey:k}));
  }
  const crew = TEAM.filter(m=>!m.isChief&&!m.isViewer);
  function getMemberDetail(uid) {
    return monthEvents.filter(ev=>getApproval(uid,ev.id)==="approved"&&Object.values(getChecked(uid,ev.id)).some(Boolean))
      .map(ev=>{ const ch=getChecked(uid,ev.id); const acts=getUserActions(uid).filter(a=>ch[a.key]); const total=acts.reduce((s,a)=>s+getAmount(uid,ev.id,a.key),0); return {ev,acts,total}; });
  }

  return (
    <div style={{ padding:20, maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24 }}>
        <button onClick={()=>setReportMonth(new Date(reportMonth.getFullYear(),reportMonth.getMonth()-1,1))} style={S.navBtn}>‹</button>
        <div style={{ flex:1, textAlign:"center", fontSize:16, fontWeight:600, color:"#e8e8e6", textTransform:"capitalize" }}>{fmtMonth(reportMonth)}</div>
        <button onClick={()=>setReportMonth(new Date(reportMonth.getFullYear(),reportMonth.getMonth()+1,1))} style={S.navBtn}>›</button>
        <button onClick={()=>window.print()} style={{ padding:"6px 16px", borderRadius:8, border:"1px solid #333", background:"transparent", color:"#888", fontSize:13, cursor:"pointer", marginLeft:8 }}>🖨 Print</button>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
        {crew.map(member=>{
          const details=getMemberDetail(member.id);
          const total=details.reduce((s,d)=>s+d.total,0);
          return (
            <div key={member.id} style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14, padding:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <Avatar member={member} size={36}/>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6" }}>{member.name}</div>
                  <div style={{ fontSize:11, color:"#555" }}>{details.length} zile lucrate</div>
                </div>
              </div>
              <div style={{ fontSize:26, fontWeight:700, color:total>0?"#4ade80":"#333", marginBottom:8 }}>
                {total>0?`+${fmtRON(total)}`:"—"}
              </div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {ACTIONS.filter(a=>a.key!=="deplasare"&&a.key!=="asistenta").map(a=>{
                  const count=details.filter(d=>d.acts.some(x=>x.key===a.key)).length;
                  if (!count) return null;
                  return <span key={a.key} style={{ fontSize:10, padding:"1px 7px", borderRadius:20, background:"#222", color:"#888", fontWeight:500 }}>{a.icon} ×{count}</span>;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed tables */}
      {crew.map(member=>{
        const details=getMemberDetail(member.id);
        if (!details.length) return null;
        const total=details.reduce((s,d)=>s+d.total,0);
        return (
          <div key={member.id} style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14, marginBottom:16, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #222", display:"flex", alignItems:"center", gap:12 }}>
              <Avatar member={member} size={34}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#e8e8e6" }}>{member.name}</div>
                <div style={{ fontSize:12, color:"#555" }}>{member.email}</div>
              </div>
              <div style={{ fontSize:22, fontWeight:700, color:"#4ade80" }}>+{fmtRON(total)}</div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#111" }}>
                  <th style={S.th}>Data</th>
                  <th style={S.th}>Eveniment</th>
                  <th style={S.th}>Locație</th>
                  <th style={S.th}>Acțiuni</th>
                  <th style={{...S.th,textAlign:"right"}}>Sumă</th>
                </tr>
              </thead>
              <tbody>
                {details.map(({ev,acts,total:evT},i)=>(
                  <tr key={`${ev.id}-${i}`} style={{ borderBottom:"1px solid #1e1e1e", background:i%2===0?"#1a1a1a":"#161616" }}>
                    <td style={S.td}>
                      <div style={{ fontSize:13, fontWeight:500, color:"#e8e8e6", whiteSpace:"nowrap" }}>
                        {new Date(ev.dayKey+"T12:00:00").toLocaleDateString("ro-RO",{day:"numeric",month:"short"})}
                      </div>
                      {ev.isMultiDay&&<div style={{ fontSize:10, color:"#555" }}>Ziua {ev.dayIndex+1}/{ev.totalDays}</div>}
                    </td>
                    <td style={S.td}><div style={{ fontSize:13, color:"#ccc", fontWeight:500 }}>{ev.title}</div></td>
                    <td style={S.td}><div style={{ fontSize:12, color:"#555" }}>{ev.location||"—"}</div></td>
                    <td style={S.td}>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {acts.map(a=><span key={a.key} style={{ fontSize:10, padding:"1px 7px", borderRadius:20, background:"#1a2e1a", color:"#4ade80", fontWeight:500 }}>{a.icon} {a.label}</span>)}
                      </div>
                    </td>
                    <td style={{...S.td,textAlign:"right",fontWeight:700,color:"#4ade80",fontSize:14,whiteSpace:"nowrap"}}>+{fmtRON(evT)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:"#1a2e1a" }}>
                  <td colSpan={4} style={{ padding:"10px 20px", fontSize:13, fontWeight:600, color:"#4ade80" }}>TOTAL {fmtMonth(reportMonth).toUpperCase()}</td>
                  <td style={{ padding:"10px 20px", textAlign:"right", fontSize:17, fontWeight:700, color:"#4ade80" }}>+{fmtRON(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
      {crew.every(m=>getMemberDetail(m.id).length===0)&&(
        <div style={{ textAlign:"center", padding:"48px 0", color:"#444", fontSize:14 }}>Nicio activare aprobată în această lună.</div>
      )}
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────

function SettingsView({ user, apiKey, setApiKey, setShowApiSetup }) {
  return (
    <div style={{ padding:20, maxWidth:500, margin:"0 auto" }}>

      <div style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6", marginBottom:16 }}>Bonusuri configurate</div>
        {TEAM.filter(m=>!m.isViewer).map(m=>{
          const acts=getUserActions(m.id); const bns=getUserBonuses(m.id);
          return (
            <div key={m.id} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <Avatar member={m} size={24}/>
                <span style={{ fontSize:13, fontWeight:500, color:"#ccc" }}>{m.name}</span>
                {m.isChief&&<span style={{ fontSize:9, background:"#1e3a5f", color:"#7eb8f7", padding:"1px 7px", borderRadius:20, fontWeight:600, letterSpacing:1 }}>CHIEF</span>}
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginLeft:32 }}>
                {acts.map(a=><span key={a.key} style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:bns[a.key]>0?"#1a2e1a":"#222", color:bns[a.key]>0?"#4ade80":"#555", fontWeight:500 }}>{a.icon} {a.label}: {bns[a.key]>0?fmtRON(bns[a.key]):"—"}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#e8e8e6", marginBottom:14 }}>Echipa</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {TEAM.map(m=>(
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#111", border:"1px solid #222", borderRadius:10 }}>
              <Avatar member={m} size={34}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:"#ccc" }}>{m.name}</div>
                <div style={{ fontSize:11, color:"#555" }}>{m.email}</div>
              </div>
              <span style={{ fontSize:9, background:m.isChief?"#1e3a5f":m.isViewer?"#222":"#1a2e1a", color:m.isChief?"#7eb8f7":m.isViewer?"#666":"#4ade80", padding:"2px 8px", borderRadius:20, fontWeight:600, letterSpacing:1 }}>
                {m.isChief?"CHIEF":m.isViewer?"VIEWER":"TECH"}
              </span>
              {m.id===user.id&&<span style={{ fontSize:10, color:"#444" }}>← tu</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:"#111", border:"1px solid #1e3a5f", borderRadius:14, padding:18 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#7eb8f7", marginBottom:10 }}>📆 Google Calendar</div>
        <div style={{ fontSize:11, color:"#555", marginBottom:10, wordBreak:"break-all" }}>
          ID: <code style={{ background:"#1a1a1a", padding:"2px 6px", borderRadius:4, color:"#888" }}>{CALENDAR_ID}</code>
        </div>
        {apiKey ? (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#4ade80" }}>● API Key activ</span>
            {user.isChief&&<button onClick={()=>setShowApiSetup(true)} style={{ marginLeft:"auto", fontSize:11, padding:"3px 10px", borderRadius:7, border:"1px solid #1e3a5f", background:"transparent", color:"#7eb8f7", cursor:"pointer" }}>Schimbă</button>}
          </div>
        ) : (
          user.isChief&&<button onClick={()=>setShowApiSetup(true)} style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:"#7eb8f7", color:"#111", fontSize:13, fontWeight:600, cursor:"pointer" }}>🔑 Conectează Google Calendar</button>
        )}
        <a href={CALENDAR_EMBED} target="_blank" rel="noreferrer" style={{ fontSize:11, color:"#555", display:"block", marginTop:10 }}>→ Deschide calendarul în browser</a>
      </div>
    </div>
  );
}

const S = {
  navBtn: { background:"none", border:"1px solid #2a2a2a", borderRadius:8, padding:"5px 16px", cursor:"pointer", fontSize:16, color:"#666" },
  th: { padding:"8px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"#444", textTransform:"uppercase", letterSpacing:"0.06em" },
  td: { padding:"10px 16px", fontSize:13, color:"#ccc", verticalAlign:"middle" },
};
