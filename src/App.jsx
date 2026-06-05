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

// Per-user config: which actions are visible and what bonuses apply
const USER_CONFIG = {
  ionut:  { visibleActions: ["montaj","demontaj","operare","condus","deplasare","asistenta"], bonuses: { ...DEFAULT_BONUSES } },
  daniel: { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta"],          bonuses: { ...DEFAULT_BONUSES, montaj: 50, demontaj: 50 } },
  stefan: { visibleActions: ["montaj","demontaj","operare","condus","deplasare","asistenta"], bonuses: { ...DEFAULT_BONUSES } },
  gabi:   { visibleActions: ["montaj","demontaj","operare","deplasare","asistenta"],          bonuses: { ...DEFAULT_BONUSES } },
};

const TEAM = [
  { id: "ionut",   name: "Ionuț Gurău",      email: "gurauionut@gmail.com",       initials: "IG",  color: "#185FA5", bg: "#E6F1FB", role: "Crew Chief",   isChief: true,  isViewer: false },
  { id: "daniel",  name: "Stancu Daniel",    email: "danielmarcel1313@gmail.com", initials: "SD",  color: "#27500A", bg: "#EAF3DE", role: "Technician",   isChief: false, isViewer: false },
  { id: "stefan",  name: "Ștefan Maricescu", email: "barosan.stefy@gmail.com",    initials: "SM",  color: "#633806", bg: "#FAEEDA", role: "Technician",   isChief: false, isViewer: false },
  { id: "gabi",    name: "Gabi Bugeanu",     email: "fymwithart@gmail.com",       initials: "GB",  color: "#3C3489", bg: "#EEEDFE", role: "Technician",   isChief: false, isViewer: false },
  { id: "anca",    name: "Anca Gurău",       email: "ancagurau@gmail.com",        initials: "AG",  color: "#72243E", bg: "#FBEAF0", role: "Contabilitate", isChief: false, isViewer: true  },
  { id: "ionel",   name: "Ionel Gurău",      email: "ionelgurau.ig@gmail.com",    initials: "IG2", color: "#444441", bg: "#F1EFE8", role: "Contabilitate", isChief: false, isViewer: true  },
];

const CALENDAR_ID    = "p6khitulp9l3vdrasd5rt4ep68@group.calendar.google.com";
const CALENDAR_EMBED = "https://calendar.google.com/calendar/embed?src=p6khitulp9l3vdrasd5rt4ep68%40group.calendar.google.com&ctz=Europe%2FBucharest";

const TYPE_STYLES = {
  montaj:    { bg: "#E6F1FB", color: "#0C447C" },
  demontaj:  { bg: "#FAEEDA", color: "#633806" },
  operare:   { bg: "#E1F5EE", color: "#085041" },
  deplasare: { bg: "#EEEDFE", color: "#3C3489" },
  condus:    { bg: "#FBEAF0", color: "#72243E" },
  asistenta: { bg: "#F1EFE8", color: "#444441" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toKey(d)      { return new Date(d).toISOString().slice(0, 10); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function fmtDate(d)    { return new Date(d).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }); }
function fmtMonth(d)   { return new Date(d).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }); }
function fmtRON(n)     { const v = Number(n); return v % 1 === 0 ? `${v} RON` : `${v.toFixed(1)} RON`; }
function load(k, fb)   { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function save(k, val)  { try { localStorage.setItem(k, JSON.stringify(val)); } catch {} }

function getUserActions(uid) {
  const keys = USER_CONFIG[uid]?.visibleActions || ["montaj","demontaj","operare","deplasare","asistenta"];
  return ACTIONS.filter(a => keys.includes(a.key));
}
function getUserBonuses(uid) {
  return USER_CONFIG[uid]?.bonuses || DEFAULT_BONUSES;
}

// Parse Google Calendar events — EXPAND multi-day events into one entry per day
function parseGCalEvents(items) {
  const result = {};

  (items || []).filter(ev => ev.status !== "cancelled").forEach(ev => {
    const title   = ev.summary || "Eveniment";
    const loc     = ev.location || "";
    const hasTime = !!ev.start?.dateTime;

    // Determine start and end dates
    const startStr = ev.start?.dateTime || ev.start?.date || "";
    const endStr   = ev.end?.dateTime   || ev.end?.date   || "";
    const startD   = new Date(startStr);
    // For all-day events, end date is exclusive in Google API
    const endD     = new Date(endStr);
    if (!hasTime) endD.setDate(endD.getDate() - 1); // make inclusive

    // Detect type from title
    const tl = title.toLowerCase();
    let type = "operare";
    if      (tl.includes("montaj") && !tl.includes("demont")) type = "montaj";
    else if (tl.includes("demont"))                            type = "demontaj";
    else if (tl.includes("condus") || tl.includes("transport")) type = "condus";
    else if (tl.includes("deplasare"))                         type = "deplasare";

    // Calculate total span in days
    const startDay = new Date(startD); startDay.setHours(0,0,0,0);
    const endDay   = new Date(endD);   endDay.setHours(0,0,0,0);
    const totalDays = Math.round((endDay - startDay) / 86400000) + 1;

    // Expand: create one entry per day
    for (let i = 0; i < totalDays; i++) {
      const thisDay = addDays(startDay, i);
      const dayKey  = toKey(thisDay);

      // For display: show time only on first/last day if timed event
      let startTime = "";
      let endTime   = "";
      if (hasTime) {
        if (i === 0)            startTime = startD.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
        if (i === totalDays-1)  endTime   = endD.toLocaleTimeString("ro-RO",   { hour: "2-digit", minute: "2-digit" });
      }

      // Unique ID per day: originalId + dayIndex so we can track actions per day
      const dayEventId = totalDays > 1 ? `${ev.id}_day${i}` : ev.id;

      const entry = {
        id:        dayEventId,
        originalId: ev.id,
        title,
        location:  loc,
        type,
        dayKey,
        start:     startTime,
        end:       endTime,
        dayIndex:  i,
        totalDays,
        isMultiDay: totalDays > 1,
      };

      if (!result[dayKey]) result[dayKey] = [];
      // Avoid duplicates
      if (!result[dayKey].find(e => e.id === dayEventId)) {
        result[dayKey].push(entry);
      }
    }
  });

  // Sort each day by start time
  Object.keys(result).forEach(k => {
    result[k].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  });

  return result;
}

// ─── ATOMS ────────────────────────────────────────────────────────────────────

function Avatar({ member, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: member.bg, color: member.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.3, fontWeight: 700, flexShrink: 0, userSelect: "none" }}>
      {member.initials}
    </div>
  );
}

function Badge({ type }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.operare;
  const a = ACTIONS.find(x => x.key === type);
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap" }}>{a?.label || type}</span>;
}

function MultiDayPill({ dayIndex, totalDays }) {
  return (
    <span style={{ fontSize: 10, background: "#EEEDFE", color: "#3C3489", padding: "1px 8px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap" }}>
      📅 Ziua {dayIndex + 1} din {totalDays}
    </span>
  );
}

function DayNav({ day, setDay }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = toKey(day) === toKey(today);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <button onClick={() => setDay(addDays(day, -1))} style={S.navBtn}>←</button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a18", textTransform: "capitalize" }}>{fmtDate(day)}</div>
        {isToday && <div style={{ fontSize: 11, color: "#0F6E56" }}>azi</div>}
      </div>
      <button onClick={() => setDay(addDays(day, 1))} style={S.navBtn}>→</button>
    </div>
  );
}

function EmptyDay({ loading }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "#bbb", fontSize: 14 }}>
      {loading ? <><div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>Se încarcă din Google Calendar...</> : "Nicio activare în această zi"}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1D9E75", color: "#fff", padding: "9px 22px", borderRadius: 24, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>{msg}</div>;
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view,         setView]         = useState("login");
  const [user,         setUser]         = useState(null);
  const [day,          setDay]          = useState(new Date());
  const [tab,          setTab]          = useState("today");
  const [selEvent,     setSelEvent]     = useState(null);
  const [toast,        setToast]        = useState(null);
  const [gcalEvents,   setGcalEvents]   = useState({});
  const [calLoading,   setCalLoading]   = useState(false);
  const [calError,     setCalError]     = useState(null);
  const [apiKey,       setApiKey]       = useState(() => load("ct_apikey", ""));
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [checked,      setChecked]      = useState(() => load("ct_checked",   {}));
  const [approvals,    setApprovals]    = useState(() => load("ct_approvals", {}));
  const [amounts,      setAmounts]      = useState(() => load("ct_amounts",   {}));

  useEffect(() => { save("ct_checked",   checked);   }, [checked]);
  useEffect(() => { save("ct_approvals", approvals); }, [approvals]);
  useEffect(() => { save("ct_amounts",   amounts);   }, [amounts]);
  useEffect(() => { save("ct_apikey",    apiKey);    }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    const from = new Date(day.getFullYear(), day.getMonth() - 1, 1);
    const to   = new Date(day.getFullYear(), day.getMonth() + 2, 0);
    setCalLoading(true); setCalError(null);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${apiKey}&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=500`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setCalError(data.error.message); setCalLoading(false); return; }
        setGcalEvents(parseGCalEvents(data.items));
        setCalLoading(false);
      })
      .catch(e => { setCalError(e.message); setCalLoading(false); });
  }, [apiKey, day.getMonth(), day.getFullYear()]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const dayKey = toKey(day);
  const events = gcalEvents[dayKey] || [];

  const getChecked  = (uid, eid)     => checked[uid]?.[eid] || {};
  const getApproval = (uid, eid)     => approvals[uid]?.[eid]?.status ?? null;
  const getAmount   = (uid, eid, ak) => amounts[uid]?.[eid]?.[ak] ?? getUserBonuses(uid)[ak] ?? DEFAULT_BONUSES[ak];

  function toggleMyAction(eid, ak) {
    if (getApproval(user.id, eid) === "approved") return;
    setChecked(prev => {
      const u = { ...(prev[user.id] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = !e[ak]; u[eid] = e;
      return { ...prev, [user.id]: u };
    });
  }

  function setApprovalStatus(uid, eid, status) {
    setApprovals(prev => {
      const u = { ...(prev[uid] || {}) };
      u[eid] = { ...(u[eid] || {}), status };
      return { ...prev, [uid]: u };
    });
    showToast(status === "approved" ? "✅ Aprobat!" : status === "rejected" ? "❌ Respins" : "↩️ Anulat");
  }

  function setActionAmount(uid, eid, ak, val) {
    setAmounts(prev => {
      const u = { ...(prev[uid] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = val; u[eid] = e;
      return { ...prev, [uid]: u };
    });
  }

  function calcBonus(uid, eid) {
    return Object.entries(getChecked(uid, eid)).filter(([, v]) => v).reduce((s, [k]) => s + getAmount(uid, eid, k), 0);
  }
  function calcDayTotal(uid) {
    return events.reduce((s, ev) => s + (getApproval(uid, ev.id) === "approved" ? calcBonus(uid, ev.id) : 0), 0);
  }
  function getPendingCount() {
    return TEAM.filter(m => !m.isChief && !m.isViewer).reduce((total, m) =>
      total + events.filter(ev => Object.values(getChecked(m.id, ev.id)).some(Boolean) && !getApproval(m.id, ev.id)).length, 0);
  }

  function handleLogin(member) { setUser(member); setView("app"); showToast(`Bun venit, ${member.name.split(" ")[0]}! 👋`); }
  function handleLogout()      { setView("login"); setUser(null); setTab("today"); setSelEvent(null); }
  function handleDayChange(d)  { setDay(d); setSelEvent(null); }

  const shared = { user, day, setDay: handleDayChange, events, gcalEvents, getChecked, getApproval, getAmount, calcBonus, calcDayTotal, showToast, calLoading, calError };

  if (view === "login") return <><LoginScreen onLogin={handleLogin} /><Toast msg={toast} /></>;

  let tabs = [];
  if      (user.isViewer) tabs = [{ id: "report",   label: "📊 Raport lunar" }];
  else if (user.isChief)  tabs = [{ id: "today", label: "📅 Azi" }, { id: "approve", label: "✅ Aprobare" }, { id: "report", label: "📊 Raport" }, { id: "settings", label: "⚙️ Setări" }];
  else                    tabs = [{ id: "today", label: "📅 Azi" }, { id: "settings", label: "⚙️ Setări" }];

  if (user.isViewer && tab !== "report") setTab("report");
  const pending = user.isChief ? getPendingCount() : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f0ef", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e6", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "#185FA5", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚡</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#1a1a18", letterSpacing: -0.4 }}>Crew Tracker</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <div key={t.id} style={{ position: "relative" }}>
                <button onClick={() => setTab(t.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid", borderColor: active ? "#378ADD" : "#e0e0de", background: active ? "#E6F1FB" : "transparent", color: active ? "#0C447C" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{t.label}</button>
                {t.id === "approve" && pending > 0 && <span style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#E24B4A", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{pending}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!apiKey && !user.isViewer && <button onClick={() => setShowApiSetup(true)} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E24B4A", background: "#FCEBEB", color: "#A32D2D", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>⚠️ Conectează Calendar</button>}
          {apiKey && <span style={{ fontSize: 11, color: "#1D9E75", fontWeight: 500 }}>📆 Live</span>}
          <Avatar member={user} size={30} />
          <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", lineHeight: 1.2 }}>{user.name.split(" ")[0]}</div><div style={{ fontSize: 11, color: "#888" }}>{user.role}</div></div>
          <button onClick={handleLogout} style={{ marginLeft: 4, background: "none", border: "1px solid #e0e0de", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#888", cursor: "pointer" }}>Ieși</button>
        </div>
      </div>

      {showApiSetup && <ApiSetupModal apiKey={apiKey} setApiKey={setApiKey} onClose={() => setShowApiSetup(false)} showToast={showToast} />}

      <div style={{ flex: 1 }}>
        {tab === "today"    && !user.isViewer && <TodayView    {...shared} selEvent={selEvent} setSelEvent={setSelEvent} toggleMyAction={toggleMyAction} />}
        {tab === "approve"  && user.isChief   && <ApproveView  {...shared} setApprovalStatus={setApprovalStatus} setActionAmount={setActionAmount} />}
        {tab === "report"                      && <ReportView   {...shared} />}
        {tab === "settings" && !user.isViewer  && <SettingsView {...shared} setApiKey={setApiKey} setShowApiSetup={setShowApiSetup} />}
      </div>
      <Toast msg={toast} />
    </div>
  );
}

// ─── LOGIN WITH EMAIL ─────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email,  setEmail]  = useState("");
  const [error,  setError]  = useState("");
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Introdu adresa de email."); return; }
    const member = TEAM.find(m => m.email.toLowerCase() === trimmed);
    if (!member) { setError("Email nerecunoscut. Verifică adresa introdusă."); return; }
    setLoading(true);
    setTimeout(() => { onLogin(member); setLoading(false); }, 400);
  }

  function handleKey(e) { if (e.key === "Enter") handleLogin(); }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f0ef", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, background: "#185FA5", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>⚡</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a18", margin: "0 0 6px", letterSpacing: -0.5 }}>Crew Tracker</h1>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }}>Intră cu adresa ta de email</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={handleKey}
            placeholder="adresa@gmail.com"
            autoFocus
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: error ? "1.5px solid #E24B4A" : "1.5px solid #e0e0de", fontSize: 14, color: "#1a1a18", outline: "none", background: "#fafaf9", boxSizing: "border-box" }}
          />
          {error && <div style={{ fontSize: 12, color: "#A32D2D", marginTop: 6 }}>⚠️ {error}</div>}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: loading ? "#aaa" : "#185FA5", color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", letterSpacing: -0.2 }}
        >
          {loading ? "Se verifică..." : "Intră în aplicație →"}
        </button>

        <div style={{ marginTop: 20, padding: "12px 14px", background: "#f0f0ef", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Emailuri acceptate</div>
          {TEAM.map(m => (
            <div key={m.id} onClick={() => { setEmail(m.email); setError(""); }} style={{ fontSize: 12, color: "#666", padding: "3px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{m.initials}</div>
              <span style={{ flex: 1 }}>{m.email}</span>
              <span style={{ color: "#bbb", fontSize: 10 }}>{m.role}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bbb", marginTop: 16, justifyContent: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }}></span>
          Sincronizat cu Google Calendar
        </div>
      </div>
    </div>
  );
}

// ─── API SETUP MODAL ──────────────────────────────────────────────────────────

function ApiSetupModal({ apiKey, setApiKey, onClose, showToast }) {
  const [val, setVal] = useState(apiKey);
  function doSave() { setApiKey(val.trim()); showToast("🔑 API Key salvat!"); onClose(); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a18", marginBottom: 8 }}>🔑 Conectare Google Calendar</div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.7 }}>
          1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: "#185FA5" }}>console.cloud.google.com</a> → proiectul tău<br />
          2. <strong>APIs & Services → Credentials → Create API Key</strong><br />
          3. Restricționează la <strong>Google Calendar API</strong><br />
          4. Asigură-te că calendarul e setat <strong>public</strong> în Google Calendar<br />
          5. Paste cheia mai jos:
        </div>
        <input type="text" value={val} onChange={e => setVal(e.target.value)} placeholder="AIzaSy..." style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e0e0de", fontSize: 14, color: "#1a1a18", marginBottom: 16, outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={doSave} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Salvează</button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e0e0de", background: "transparent", color: "#666", fontSize: 14, cursor: "pointer" }}>Anulează</button>
        </div>
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────

function TodayView({ user, day, setDay, events, selEvent, setSelEvent, getChecked, toggleMyAction, getApproval, getAmount, calcBonus, calcDayTotal, showToast, calLoading, calError }) {
  const selEv    = events.find(e => e.id === selEvent);
  const myCheck  = selEv ? getChecked(user.id, selEv.id) : {};
  const approval = selEv ? getApproval(user.id, selEv.id) : null;
  const isLocked = approval === "approved" || approval === "rejected";
  const myActions = getUserActions(user.id);
  const myTotal   = selEv ? Object.entries(myCheck).filter(([, v]) => v).reduce((s, [k]) => s + getAmount(user.id, selEv.id, k), 0) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: "calc(100vh - 52px)" }}>
      <div style={{ padding: 20, borderRight: "1px solid #e8e8e6", overflowY: "auto" }}>
        <DayNav day={day} setDay={setDay} />
        {calError && <div style={{ background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#A32D2D" }}>⚠️ Eroare Calendar: {calError}<br /><span style={{ fontSize: 12 }}>Asigură-te că: (1) calendarul e public, (2) API Key e corect, (3) Calendar API e activată.</span></div>}
        <div style={{ background: "#E6F1FB", borderRadius: 10, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📆</span>
          <span style={{ fontSize: 12, color: "#0C447C", fontWeight: 500 }}>Google Calendar</span>
          <span style={{ fontSize: 12, color: "#185FA5", marginLeft: "auto" }}>{calLoading ? "Se încarcă..." : `${events.length} activăr${events.length === 1 ? "e" : "i"} azi`}</span>
        </div>
        {(events.length === 0 || calLoading) && <EmptyDay loading={calLoading} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map(ev => {
            const ch    = getChecked(user.id, ev.id);
            const done  = Object.entries(ch).filter(([, v]) => v).map(([k]) => k);
            const appr  = getApproval(user.id, ev.id);
            const bonus = calcBonus(user.id, ev.id);
            const active = selEvent === ev.id;
            return (
              <div key={ev.id} onClick={() => setSelEvent(active ? null : ev.id)}
                style={{ background: active ? "#E6F1FB" : "#fff", border: active ? "1.5px solid #378ADD" : "1px solid #e8e8e6", borderRadius: 14, padding: "13px 15px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: active ? "#0C447C" : "#1a1a18" }}>{ev.title}</span>
                  {ev.start && <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{ev.start}{ev.end ? `–${ev.end}` : ""}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Badge type={ev.type} />
                  {ev.isMultiDay && <MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays} />}
                  {ev.location && <span style={{ fontSize: 12, color: "#888" }}>📍 {ev.location}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {appr === "approved" && <span style={{ fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat · +{fmtRON(bonus)}</span>}
                  {appr === "rejected" && <span style={{ fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                  {!appr && done.length > 0 && <span style={{ fontSize: 11, color: "#854F0B", fontWeight: 500 }}>⏳ în așteptare</span>}
                  {done.length > 0 && done.map(k => <span key={k} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>✓ {ACTIONS.find(a => a.key === k)?.label}</span>)}
                </div>
              </div>
            );
          })}
        </div>
        {events.length > 0 && (
          <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e8e8e6", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#888" }}>Total aprobat azi</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#0F6E56" }}>+{fmtRON(calcDayTotal(user.id))}</span>
          </div>
        )}
      </div>

      {/* Right action panel */}
      <div style={{ padding: 20, background: "#fff", overflowY: "auto" }}>
        {!selEv ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#bbb" }}>
            <span style={{ fontSize: 40 }}>👆</span>
            <span style={{ fontSize: 14 }}>Selectează o activare</span>
            <span style={{ fontSize: 12, textAlign: "center", maxWidth: 180, lineHeight: 1.5 }}>Bifează acțiunile efectuate în ziua respectivă</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginBottom: 4 }}>{selEv.title}</div>
              {selEv.isMultiDay && (
                <div style={{ marginBottom: 6 }}>
                  <MultiDayPill dayIndex={selEv.dayIndex} totalDays={selEv.totalDays} />
                  <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>Bifează doar ce ai făcut AZI</span>
                </div>
              )}
              {selEv.location && <div style={{ fontSize: 12, color: "#888" }}>📍 {selEv.location}</div>}
            </div>

            {approval && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: approval === "approved" ? "#E1F5EE" : "#FCEBEB", fontSize: 13, fontWeight: 500, color: approval === "approved" ? "#085041" : "#791F1F" }}>
                {approval === "approved" ? "✅ Acțiunile tale au fost aprobate de Ionuț." : "❌ Ionuț a respins acțiunile. Contactează-l."}
              </div>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #f0f0ef" }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {isLocked ? "Acțiunile bifate" : "Ce ai făcut AZI la această activare?"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {myActions.map(action => {
                const on  = !!myCheck[action.key];
                const amt = getAmount(user.id, selEv.id, action.key);
                return (
                  <div key={action.key} onClick={() => !isLocked && toggleMyAction(selEv.id, action.key)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, border: on ? "1.5px solid #1D9E75" : "1px solid #e8e8e6", background: on ? "#E1F5EE" : "#fafaf9", cursor: isLocked ? "default" : "pointer", opacity: isLocked && !on ? 0.4 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 17 }}>{action.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: on ? 500 : 400, color: on ? "#085041" : "#1a1a18" }}>{action.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: on ? "#0F6E56" : "#aaa", fontWeight: on ? 500 : 400 }}>{amt > 0 ? `+${fmtRON(amt)}` : "—"}</span>
                      <div style={{ width: 22, height: 22, borderRadius: 7, border: on ? "none" : "2px solid #ddd", background: on ? "#1D9E75" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{on && "✓"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLocked && (
              <>
                <div style={{ background: "#fafaf9", border: "1px solid #e8e8e6", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 8 }}>
                    <span>Acțiuni bifate azi</span>
                    <span>{Object.values(myCheck).filter(Boolean).length} din {myActions.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid #ebebeb" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18" }}>Total estimat</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#0F6E56" }}>+{fmtRON(myTotal)}</span>
                  </div>
                </div>
                <button onClick={() => showToast("✅ Trimis spre aprobare lui Ionuț!")}
                  style={{ background: "#185FA5", color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Trimite spre aprobare →
                </button>
              </>
            )}
            <div style={{ fontSize: 11, color: "#bbb", textAlign: "center" }}>🔄 Sincronizat cu Google Calendar</div>
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

  function getEdit(uid, eid, ak) { return editAmounts[`${uid}-${eid}-${ak}`] ?? getAmount(uid, eid, ak); }
  function setEdit(uid, eid, ak, val) { setEditAmounts(prev => ({ ...prev, [`${uid}-${eid}-${ak}`]: val })); }
  function commitAndApprove(uid, eid) {
    const userActions = getUserActions(uid);
    Object.entries(editAmounts).forEach(([key, val]) => {
      const parts = key.split("-");
      if (parts[0] === uid && parts[1] === eid) setActionAmount(uid, eid, parts[2], Number(val));
    });
    setApprovalStatus(uid, eid, "approved");
    setExpanded(null);
  }

  const members = TEAM.filter(m => !m.isChief && !m.isViewer);

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <DayNav day={day} setDay={setDay} />
      {calLoading && <EmptyDay loading />}
      {!calLoading && events.length === 0 && <EmptyDay />}

      {members.map(member => {
        const memberEvs   = events.filter(ev => Object.values(getChecked(member.id, ev.id)).some(Boolean));
        const userActions = getUserActions(member.id);
        return (
          <div key={member.id} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "12px 16px", background: "#fff", borderRadius: 12, border: "1px solid #e8e8e6" }}>
              <Avatar member={member} size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18" }}>{member.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{member.email}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#aaa" }}>Total aprobat azi</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: calcDayTotal(member.id) > 0 ? "#0F6E56" : "#bbb" }}>
                  {calcDayTotal(member.id) > 0 ? `+${fmtRON(calcDayTotal(member.id))}` : "—"}
                </div>
              </div>
            </div>

            {memberEvs.length === 0 && <div style={{ padding: "8px 16px", marginLeft: 8, fontSize: 13, color: "#bbb" }}>Nicio acțiune raportată azi.</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 8 }}>
              {memberEvs.map(ev => {
                const ch         = getChecked(member.id, ev.id);
                const activeActs = userActions.filter(a => ch[a.key]);
                const appr       = getApproval(member.id, ev.id);
                const key        = `${member.id}-${ev.id}`;
                const isOpen     = expanded === key;
                const editTotal  = activeActs.reduce((s, a) => s + Number(getEdit(member.id, ev.id, a.key)), 0);

                return (
                  <div key={ev.id} style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Badge type={ev.type} />
                      {ev.isMultiDay && <MultiDayPill dayIndex={ev.dayIndex} totalDays={ev.totalDays} />}
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18", flex: 1, minWidth: 100 }}>{ev.title}</span>
                      {appr === "approved" && <span style={{ fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat</span>}
                      {appr === "rejected" && <span style={{ fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                      {!appr && <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>⏳ în așteptare</span>}
                    </div>
                    <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {activeActs.map(a => <span key={a.key} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>{a.icon} {a.label} · {fmtRON(getAmount(member.id, ev.id, a.key))}</span>)}
                      <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: appr === "approved" ? "#0F6E56" : "#666" }}>+{fmtRON(calcBonus(member.id, ev.id))}</span>
                      {!appr && <button onClick={() => setExpanded(isOpen ? null : key)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid #378ADD", background: "transparent", color: "#185FA5", cursor: "pointer" }}>{isOpen ? "Închide" : "Revizuiește"}</button>}
                      {appr === "approved" && <button onClick={() => setApprovalStatus(member.id, ev.id, null)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid #ddd", background: "transparent", color: "#aaa", cursor: "pointer" }}>Anulează</button>}
                    </div>
                    {isOpen && (
                      <div style={{ padding: "14px 16px", background: "#fafaf9", borderTop: "1px solid #f0f0ef" }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Modifică suma per acțiune dacă este necesar:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                          {activeActs.map(a => (
                            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 18 }}>{a.icon}</span>
                              <span style={{ fontSize: 14, flex: 1, color: "#1a1a18", fontWeight: 500 }}>{a.label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input type="number" value={getEdit(member.id, ev.id, a.key)} onChange={e => setEdit(member.id, ev.id, a.key, e.target.value)}
                                  style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid #e0e0de", background: "#fff", fontSize: 14, fontWeight: 600, textAlign: "right", color: "#1a1a18" }} />
                                <span style={{ fontSize: 13, color: "#888" }}>RON</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "10px 14px", background: "#E1F5EE", borderRadius: 10 }}>
                          <span style={{ fontSize: 13, color: "#085041" }}>Total de plătit</span>
                          <span style={{ fontSize: 20, fontWeight: 700, color: "#0F6E56" }}>+{fmtRON(editTotal)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button onClick={() => commitAndApprove(member.id, ev.id)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>✓ Aprobă</button>
                          <button onClick={() => { setApprovalStatus(member.id, ev.id, "rejected"); setExpanded(null); }} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E24B4A", background: "#FCEBEB", color: "#A32D2D", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>✗ Respinge</button>
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

function ReportView({ gcalEvents, getChecked, getApproval, getAmount, calcBonus }) {
  const today = new Date();
  const [reportMonth, setReportMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const monthStart = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1);
  const monthEnd   = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 0);

  const monthEvents = [];
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const k = toKey(new Date(d));
    (gcalEvents[k] || []).forEach(ev => monthEvents.push({ ...ev, dayKey: k }));
  }

  const crew = TEAM.filter(m => !m.isChief && !m.isViewer);

  function getMemberDetail(uid) {
    return monthEvents
      .filter(ev => getApproval(uid, ev.id) === "approved" && Object.values(getChecked(uid, ev.id)).some(Boolean))
      .map(ev => {
        const ch    = getChecked(uid, ev.id);
        const acts  = getUserActions(uid).filter(a => ch[a.key]);
        const total = acts.reduce((s, a) => s + getAmount(uid, ev.id, a.key), 0);
        return { ev, acts, total };
      });
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setReportMonth(new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 1, 1))} style={S.navBtn}>←</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700, color: "#1a1a18", textTransform: "capitalize" }}>{fmtMonth(reportMonth)}</div>
        <button onClick={() => setReportMonth(new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 1))} style={S.navBtn}>→</button>
        <button onClick={() => window.print()} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #e0e0de", background: "#fafaf9", color: "#1a1a18", fontSize: 13, fontWeight: 500, cursor: "pointer", marginLeft: 8 }}>🖨️ Print</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {crew.map(member => {
          const details = getMemberDetail(member.id);
          const total   = details.reduce((s, d) => s + d.total, 0);
          return (
            <div key={member.id} style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Avatar member={member} size={36} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18" }}>{member.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{details.length} zile lucrate</div>
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: total > 0 ? "#0F6E56" : "#bbb", marginBottom: 6 }}>
                {total > 0 ? `+${fmtRON(total)}` : "—"}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {ACTIONS.filter(a => a.key !== "deplasare" && a.key !== "asistenta").map(a => {
                  const count = details.filter(d => d.acts.some(x => x.key === a.key)).length;
                  if (!count) return null;
                  return <span key={a.key} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#E6F1FB", color: "#0C447C", fontWeight: 500 }}>{a.icon} ×{count}</span>;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed per member */}
      {crew.map(member => {
        const details = getMemberDetail(member.id);
        if (!details.length) return null;
        const total = details.reduce((s, d) => s + d.total, 0);
        return (
          <div key={member.id} style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0ef", display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar member={member} size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18" }}>{member.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{member.email}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0F6E56" }}>+{fmtRON(total)}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafaf9" }}>
                  <th style={S.th}>Data</th>
                  <th style={S.th}>Eveniment</th>
                  <th style={S.th}>Locație</th>
                  <th style={S.th}>Acțiuni</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Sumă</th>
                </tr>
              </thead>
              <tbody>
                {details.map(({ ev, acts, total: evT }, i) => (
                  <tr key={`${ev.id}-${i}`} style={{ borderBottom: "1px solid #f0f0ef", background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                    <td style={S.td}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18", whiteSpace: "nowrap" }}>
                        {new Date(ev.dayKey + "T12:00:00").toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}
                      </div>
                      {ev.isMultiDay && <div style={{ fontSize: 10, color: "#888" }}>Ziua {ev.dayIndex + 1}/{ev.totalDays}</div>}
                    </td>
                    <td style={S.td}><div style={{ fontSize: 13, color: "#1a1a18", fontWeight: 500 }}>{ev.title}</div></td>
                    <td style={S.td}><div style={{ fontSize: 12, color: "#888" }}>{ev.location || "—"}</div></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {acts.map(a => <span key={a.key} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>{a.icon} {a.label}</span>)}
                      </div>
                    </td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#0F6E56", fontSize: 14, whiteSpace: "nowrap" }}>+{fmtRON(evT)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#E1F5EE" }}>
                  <td colSpan={4} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#085041" }}>TOTAL {fmtMonth(reportMonth).toUpperCase()}</td>
                  <td style={{ padding: "10px 20px", textAlign: "right", fontSize: 17, fontWeight: 700, color: "#0F6E56" }}>+{fmtRON(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
      {crew.every(m => getMemberDetail(m.id).length === 0) && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#bbb", fontSize: 14 }}>Nicio activare aprobată în această lună.</div>
      )}
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────

function SettingsView({ user, apiKey, setApiKey, setShowApiSetup }) {
  return (
    <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
      <div style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", marginBottom: 4 }}>Bonusuri configurate</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Tarife individuale per persoană.</div>
        {TEAM.filter(m => !m.isViewer).map(m => {
          const acts = getUserActions(m.id);
          const bns  = getUserBonuses(m.id);
          return (
            <div key={m.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Avatar member={m} size={26} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{m.name}</span>
                {m.isChief && <span style={{ fontSize: 10, background: "#E6F1FB", color: "#0C447C", padding: "1px 7px", borderRadius: 20, fontWeight: 600 }}>CHIEF</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: 34 }}>
                {acts.map(a => (
                  <span key={a.key} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: bns[a.key] > 0 ? "#E1F5EE" : "#f0f0ef", color: bns[a.key] > 0 ? "#085041" : "#aaa", fontWeight: 500 }}>
                    {a.icon} {a.label}: {bns[a.key] > 0 ? fmtRON(bns[a.key]) : "—"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", marginBottom: 14 }}>Echipa</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TEAM.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fafaf9", border: "1px solid #e8e8e6", borderRadius: 10 }}>
              <Avatar member={m} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{m.email}</div>
              </div>
              <span style={{ fontSize: 10, background: m.isChief ? "#E6F1FB" : m.isViewer ? "#F1EFE8" : "#EAF3DE", color: m.isChief ? "#0C447C" : m.isViewer ? "#444441" : "#27500A", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                {m.isChief ? "CHIEF" : m.isViewer ? "VIEWER" : "TECH"}
              </span>
              {m.id === user.id && <span style={{ fontSize: 10, color: "#aaa" }}>← tu</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#E6F1FB", border: "1px solid #C2D9F0", borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0C447C", marginBottom: 8 }}>📆 Google Calendar</div>
        <div style={{ fontSize: 12, color: "#185FA5", marginBottom: 12, wordBreak: "break-all" }}>
          ID: <code style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 10 }}>{CALENDAR_ID}</code>
        </div>
        {apiKey ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }}></span>
            <span style={{ fontSize: 13, color: "#0C447C", fontWeight: 500 }}>API Key activ</span>
            {user.isChief && <button onClick={() => setShowApiSetup(true)} style={{ marginLeft: "auto", fontSize: 12, padding: "3px 10px", borderRadius: 8, border: "1px solid #C2D9F0", background: "#fff", color: "#185FA5", cursor: "pointer" }}>Schimbă</button>}
          </div>
        ) : (
          user.isChief && <button onClick={() => setShowApiSetup(true)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔑 Conectează Google Calendar</button>
        )}
        <a href={CALENDAR_EMBED} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#185FA5", display: "block", marginTop: 8 }}>→ Deschide calendarul în browser</a>
      </div>
    </div>
  );
}

const S = {
  navBtn: { background: "none", border: "1px solid #e0e0de", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontSize: 14, color: "#666" },
  th: { padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em" },
  td: { padding: "10px 16px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
};
