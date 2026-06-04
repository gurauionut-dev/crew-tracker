import { useState, useEffect } from "react";

const ACTIONS = [
  { key: "montaj",    label: "Montaj",    icon: "🔧", defaultBonus: 120 },
  { key: "demontaj",  label: "Demontaj",  icon: "📦", defaultBonus: 100 },
  { key: "operare",   label: "Operare",   icon: "🖥️", defaultBonus: 150 },
  { key: "condus",    label: "Condus",    icon: "🚐", defaultBonus: 80  },
  { key: "deplasare", label: "Deplasare", icon: "🗺️", defaultBonus: 50  },
  { key: "asistenta", label: "Asistență", icon: "🎧", defaultBonus: 60  },
];

const TEAM = [
  { id: "andrei",    name: "Andrei N.",    initials: "AN", color: "#185FA5", bg: "#E6F1FB", role: "Crew Chief", isChief: true },
  { id: "mihai",     name: "Mihai P.",     initials: "MP", color: "#27500A", bg: "#EAF3DE", role: "Technician" },
  { id: "radu",      name: "Radu S.",      initials: "RS", color: "#633806", bg: "#FAEEDA", role: "Technician" },
  { id: "georgiana", name: "Georgiana T.", initials: "GT", color: "#72243E", bg: "#FBEAF0", role: "Technician" },
];

const MOCK_EVENTS = {
  "2026-05-30": [
    { id: "ev3", title: "Vodafone Launch Party",   start: "08:00", end: "12:00", location: "Exporom, București",       type: "montaj"   },
    { id: "ev4", title: "Untold Promo Booth",       start: "14:00", end: "17:00", location: "AFI Cotroceni",            type: "operare"  },
    { id: "ev5", title: "Vodafone — Demontaj",      start: "23:00", end: "02:00", location: "Exporom, București",       type: "demontaj" },
  ],
  "2026-05-31": [
    { id: "ev6", title: "Untold Promo — Demontaj",  start: "10:00", end: "13:00", location: "AFI Cotroceni",            type: "demontaj" },
    { id: "ev7", title: "Banca Transilvania Promo", start: "15:00", end: "20:00", location: "Grand Hotel Continental", type: "operare"  },
  ],
  "2026-06-01": [
    { id: "ev8", title: "eMAG Showcase — Montaj",   start: "07:00", end: "11:00", location: "Romexpo, Pavilion C",     type: "montaj"   },
    { id: "ev9", title: "eMAG Showcase — Show",     start: "16:00", end: "22:00", location: "Romexpo, Pavilion C",     type: "operare"  },
  ],
};

const TYPE_STYLES = {
  montaj:    { bg: "#E6F1FB", color: "#0C447C" },
  demontaj:  { bg: "#FAEEDA", color: "#633806" },
  operare:   { bg: "#E1F5EE", color: "#085041" },
  deplasare: { bg: "#EEEDFE", color: "#3C3489" },
  condus:    { bg: "#FBEAF0", color: "#72243E" },
  asistenta: { bg: "#F1EFE8", color: "#444441" },
};

function toKey(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function fmtDate(d) { return d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }); }

function Avatar({ member, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: member.bg, color: member.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 600, flexShrink: 0,
    }}>{member.initials}</div>
  );
}

function Badge({ type }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.montaj;
  const a = ACTIONS.find(a => a.key === type);
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>
      {a ? a.label : type}
    </span>
  );
}

const nb = { background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontSize: 14, color: "var(--color-text-secondary)", fontFamily: "inherit" };

// ─── INITIAL STATE ────────────────────────────────────────────────────────────
// Pre-seeded so demo is not empty
const SEED_CHECKED = {
  mihai: {
    ev6: { montaj: false, demontaj: true, operare: false, condus: true,  deplasare: false, asistenta: false },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: false, deplasare: true,  asistenta: false },
  },
  radu: {
    ev6: { montaj: false, demontaj: true, operare: false, condus: false, deplasare: true,  asistenta: false },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: true,  deplasare: false, asistenta: false },
  },
  georgiana: {
    ev6: { montaj: false, demontaj: true, operare: false, condus: false, deplasare: false, asistenta: true  },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: false, deplasare: true,  asistenta: false },
  },
};
// status: null | "approved" | "rejected"
// approvedAmounts: { [userId]: { [eventId]: { [actionKey]: number } } }

export default function App() {
  const [view, setView]               = useState("login");
  const [user, setUser]               = useState(null);
  const [day, setDay]                 = useState(new Date("2026-05-31"));
  const [tab, setTab]                 = useState("today");
  const [checked, setChecked]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("ct_checked")) || SEED_CHECKED; } catch { return SEED_CHECKED; }
  });
  const [approvals, setApprovals]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("ct_approvals")) || {}; } catch { return {}; }
  });
  const [amounts, setAmounts]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("ct_amounts")) || {}; } catch { return {}; }
  });
  const [bonuses, setBonuses]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("ct_bonuses")) || Object.fromEntries(ACTIONS.map(a => [a.key, a.defaultBonus])); } catch { return Object.fromEntries(ACTIONS.map(a => [a.key, a.defaultBonus])); }
  });
  const [toast, setToast]             = useState(null);
  const [selEvent, setSelEvent]       = useState(null);

  useEffect(() => { localStorage.setItem("ct_checked",   JSON.stringify(checked));   }, [checked]);
  useEffect(() => { localStorage.setItem("ct_approvals", JSON.stringify(approvals)); }, [approvals]);
  useEffect(() => { localStorage.setItem("ct_amounts",   JSON.stringify(amounts));   }, [amounts]);
  useEffect(() => { localStorage.setItem("ct_bonuses",   JSON.stringify(bonuses));   }, [bonuses]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2400); }

  const dayKey = toKey(day);
  const events = MOCK_EVENTS[dayKey] || [];

  // getChecked(userId, eventId) → { actionKey: bool }
  const getChecked = (uid, eid) => checked[uid]?.[eid] || {};

  // getApproval(userId, eventId) → null | "approved" | "rejected"
  const getApproval = (uid, eid) => approvals[uid]?.[eid]?.status ?? null;

  // getAmount(userId, eventId, actionKey) → number (approved/custom or default bonus)
  const getAmount = (uid, eid, ak) => amounts[uid]?.[eid]?.[ak] ?? bonuses[ak];

  function toggleMyAction(eid, ak) {
    // only if not yet approved
    if (getApproval(user.id, eid) === "approved") return;
    setChecked(prev => {
      const u = { ...(prev[user.id] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = !e[ak];
      u[eid] = e; return { ...prev, [user.id]: u };
    });
  }

  function setApprovalStatus(uid, eid, status) {
    setApprovals(prev => {
      const u = { ...(prev[uid] || {}) };
      u[eid] = { ...(u[eid] || {}), status };
      return { ...prev, [uid]: u };
    });
    showToast(status === "approved" ? "✅ Acțiuni aprobate!" : "❌ Acțiuni respinse");
  }

  function setActionAmount(uid, eid, ak, val) {
    setAmounts(prev => {
      const u = { ...(prev[uid] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = val;
      u[eid] = e; return { ...prev, [uid]: u };
    });
  }

  function calcBonus(uid, eid) {
    const ch = getChecked(uid, eid);
    return Object.entries(ch).filter(([,v]) => v).reduce((s, [k]) => s + getAmount(uid, eid, k), 0);
  }
  function calcDayTotal(uid) {
    return events.reduce((s, ev) => s + (getApproval(uid, ev.id) === "approved" ? calcBonus(uid, ev.id) : 0), 0);
  }

  if (view === "login") return (
    <LoginScreen onLogin={m => { setUser(m); setView("app"); showToast(`Bun venit, ${m.name.split(" ")[0]}!`); }} />
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: 640, background: "var(--color-background-tertiary)", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Topbar */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#185FA5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text-primary)", letterSpacing: -0.3 }}>Crew Tracker</span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {(user.isChief ? ["today", "approve", "settings"] : ["today", "settings"]).map(v => {
            const labels = { today: "📅 Azi", approve: "✅ Aprobare", settings: "⚙️ Setări" };
            const active = tab === v;
            // badge for pending approvals
            let pending = 0;
            if (v === "approve") {
              TEAM.filter(m => !m.isChief).forEach(m => {
                events.forEach(ev => {
                  const ch = getChecked(m.id, ev.id);
                  const hasSomething = Object.values(ch).some(Boolean);
                  if (hasSomething && !getApproval(m.id, ev.id)) pending++;
                });
              });
            }
            return (
              <div key={v} style={{ position: "relative" }}>
                <button onClick={() => setTab(v)} style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid", borderColor: active ? "#378ADD" : "var(--color-border-tertiary)", background: active ? "#E6F1FB" : "transparent", color: active ? "#0C447C" : "var(--color-text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  {labels[v]}
                </button>
                {pending > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#E24B4A", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{pending}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar member={user} size={28} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{user.name}</span>
          {user.isChief && <span style={{ fontSize: 10, background: "#E6F1FB", color: "#0C447C", padding: "2px 7px", borderRadius: 20, fontWeight: 500 }}>Chief</span>}
          <button onClick={() => { setView("login"); setUser(null); setTab("today"); setSelEvent(null); }} style={{ background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>Ieși</button>
        </div>
      </div>

      {tab === "today"    && <TodayView    user={user} day={day} setDay={d => { setDay(d); setSelEvent(null); }} events={events} selEvent={selEvent} setSelEvent={setSelEvent} getChecked={getChecked} toggleMyAction={toggleMyAction} getApproval={getApproval} getAmount={getAmount} calcBonus={calcBonus} calcDayTotal={calcDayTotal} showToast={showToast} bonuses={bonuses} />}
      {tab === "approve"  && <ApproveView  user={user} day={day} setDay={d => { setDay(d); setSelEvent(null); }} events={events} getChecked={getChecked} getApproval={getApproval} setApprovalStatus={setApprovalStatus} getAmount={getAmount} setActionAmount={setActionAmount} calcBonus={calcBonus} calcDayTotal={calcDayTotal} bonuses={bonuses} />}
      {tab === "settings" && <SettingsView user={user} bonuses={bonuses} setBonuses={setBonuses} showToast={showToast} />}

      {toast && (
        <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1D9E75", color: "#fff", padding: "8px 20px", borderRadius: 24, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", zIndex: 100 }}>{toast}</div>
      )}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: 560, background: "var(--color-background-tertiary)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 52, height: 52, background: "#185FA5", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 26 }}>⚡</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px", letterSpacing: -0.5 }}>Crew Tracker</h1>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Selectează-ți profilul</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: 320 }}>
        {TEAM.map(m => (
          <button key={m.id} onClick={() => onLogin(m)} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 12px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: "inherit" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#378ADD"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-tertiary)"}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>{m.initials}</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{m.role}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }}></span>
        Sincronizat cu Google Calendar
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────
function TodayView({ user, day, setDay, events, selEvent, setSelEvent, getChecked, toggleMyAction, getApproval, getAmount, calcBonus, calcDayTotal, showToast, bonuses }) {
  const selEv = events.find(e => e.id === selEvent);
  const myChecked = selEv ? getChecked(user.id, selEv.id) : {};
  const approval = selEv ? getApproval(user.id, selEv.id) : null;
  const isLocked = approval === "approved" || approval === "rejected";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", minHeight: 570 }}>
      {/* Left */}
      <div style={{ padding: 16, borderRight: "0.5px solid var(--color-border-tertiary)" }}>
        <DayNav day={day} setDay={setDay} />

        <div style={{ background: "#E6F1FB", borderRadius: 8, padding: "7px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📆</span>
          <span style={{ fontSize: 12, color: "#0C447C", fontWeight: 500 }}>Google Calendar</span>
          <span style={{ fontSize: 12, color: "#185FA5", marginLeft: "auto" }}>{events.length} activăr{events.length === 1 ? "e" : "i"}</span>
        </div>

        {events.length === 0 && <EmptyDay />}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map(ev => {
            const ch = getChecked(user.id, ev.id);
            const done = Object.entries(ch).filter(([,v]) => v).map(([k]) => k);
            const appr = getApproval(user.id, ev.id);
            const bonus = calcBonus(user.id, ev.id);
            const active = selEvent === ev.id;
            return (
              <div key={ev.id} onClick={() => setSelEvent(active ? null : ev.id)} style={{ background: active ? "#E6F1FB" : "var(--color-background-primary)", border: active ? "1.5px solid #378ADD" : "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: active ? "#0C447C" : "var(--color-text-primary)" }}>{ev.title}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap", marginLeft: 8 }}>{ev.start}–{ev.end}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Badge type={ev.type} />
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>📍 {ev.location}</span>
                  {appr === "approved" && <span style={{ marginLeft: "auto", fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat · +{bonus} RON</span>}
                  {appr === "rejected" && <span style={{ marginLeft: "auto", fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                  {!appr && done.length > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "#854F0B" }}>⏳ în așteptare</span>}
                </div>
                {done.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 7, flexWrap: "wrap" }}>
                    {done.map(k => <span key={k} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>✓ {ACTIONS.find(a=>a.key===k)?.label}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {events.length > 0 && (
          <div style={{ marginTop: 14, background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Total aprobat azi</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#0F6E56" }}>+{calcDayTotal(user.id)} RON</span>
          </div>
        )}
      </div>

      {/* Right: action panel */}
      <div style={{ padding: 16, background: "var(--color-background-primary)", display: "flex", flexDirection: "column", gap: 12 }}>
        {!selEv ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--color-text-tertiary)" }}>
            <span style={{ fontSize: 36 }}>👆</span>
            <span style={{ fontSize: 14 }}>Selectează o activare</span>
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 2 }}>{selEv.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{selEv.start}–{selEv.end} · {selEv.location}</div>
            </div>

            {approval && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: approval === "approved" ? "#E1F5EE" : "#FCEBEB", fontSize: 12, fontWeight: 500, color: approval === "approved" ? "#085041" : "#791F1F" }}>
                {approval === "approved" ? "✅ Acțiunile tale au fost aprobate de Crew Chief." : "❌ Crew Chief a respins acțiunile pentru această activare."}
              </div>
            )}

            <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border-tertiary)" }} />
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {isLocked ? "Acțiunile tale" : "Bifează ce ai făcut"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ACTIONS.map(action => {
                const on = !!myChecked[action.key];
                return (
                  <div key={action.key} onClick={() => !isLocked && toggleMyAction(selEv.id, action.key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", borderRadius: 9,
                    border: on ? "1px solid #1D9E75" : "0.5px solid var(--color-border-tertiary)",
                    background: on ? "#E1F5EE" : "var(--color-background-secondary)",
                    cursor: isLocked ? "default" : "pointer",
                    opacity: isLocked && !on ? 0.45 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>{action.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: on ? 500 : 400, color: on ? "#085041" : "var(--color-text-primary)" }}>{action.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: on ? "#0F6E56" : "var(--color-text-secondary)" }}>+{getAmount(user.id, selEv.id, action.key)} RON</span>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: on ? "none" : "1.5px solid var(--color-border-secondary)", background: on ? "#1D9E75" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{on && "✓"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLocked && (
              <div style={{ marginTop: 4, background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                  <span>Acțiuni bifate</span>
                  <span>{Object.values(myChecked).filter(Boolean).length} din {ACTIONS.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "0.5px solid var(--color-border-secondary)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Total estimat</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#0F6E56" }}>+{Object.entries(myChecked).filter(([,v])=>v).reduce((s,[k])=>s+getAmount(user.id,selEv.id,k),0)} RON</span>
                </div>
              </div>
            )}

            {!isLocked && (
              <button onClick={() => showToast("✅ Trimis spre aprobare!")} style={{ background: "#185FA5", color: "#fff", border: "none", borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Trimite spre aprobare
              </button>
            )}

            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>🔄 Sincronizat cu Google Calendar</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── APPROVE VIEW (Chief only) ────────────────────────────────────────────────
function ApproveView({ user, day, setDay, events, getChecked, getApproval, setApprovalStatus, getAmount, setActionAmount, calcBonus, calcDayTotal, bonuses }) {
  const [expanded, setExpanded] = useState(null); // "userId-eventId"
  const [editAmounts, setEditAmounts] = useState({}); // local edits before saving

  function getEdit(uid, eid, ak) {
    return editAmounts[`${uid}-${eid}-${ak}`] ?? getAmount(uid, eid, ak);
  }
  function setEdit(uid, eid, ak, val) {
    setEditAmounts(prev => ({ ...prev, [`${uid}-${eid}-${ak}`]: val }));
  }
  function commitAndApprove(uid, eid) {
    Object.entries(editAmounts).forEach(([key, val]) => {
      const [u, e, ak] = key.split("-");
      if (u === uid && e === eid) setActionAmount(u, e, ak, Number(val));
    });
    setApprovalStatus(uid, eid, "approved");
    setExpanded(null);
  }

  const members = TEAM.filter(m => !m.isChief);

  return (
    <div style={{ padding: 16 }}>
      <DayNav day={day} setDay={setDay} />

      {events.length === 0 && <EmptyDay />}

      {members.map(member => {
        const evWithActions = events.filter(ev => Object.values(getChecked(member.id, ev.id)).some(Boolean));
        if (evWithActions.length === 0) return null;

        return (
          <div key={member.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: member.bg, color: member.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{member.initials}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{member.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{member.role}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#0F6E56" }}>
                Total aprobat: +{calcDayTotal(member.id)} RON
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 42 }}>
              {evWithActions.map(ev => {
                const ch = getChecked(member.id, ev.id);
                const activeActions = ACTIONS.filter(a => ch[a.key]);
                const appr = getApproval(member.id, ev.id);
                const key = `${member.id}-${ev.id}`;
                const isOpen = expanded === key;
                const totalThis = activeActions.reduce((s, a) => s + getAmount(member.id, ev.id, a.key), 0);

                return (
                  <div key={ev.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
                    {/* Header row */}
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <Badge type={ev.type} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", flex: 1 }}>{ev.title}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{ev.start}–{ev.end}</span>
                      {appr === "approved" && <span style={{ fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat</span>}
                      {appr === "rejected" && <span style={{ fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                      {!appr && <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>⏳ în așteptare</span>}
                    </div>

                    {/* Action chips summary */}
                    <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {activeActions.map(a => (
                        <span key={a.key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>
                          {a.icon} {a.label} · {getAmount(member.id, ev.id, a.key)} RON
                        </span>
                      ))}
                      <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: appr === "approved" ? "#0F6E56" : "var(--color-text-secondary)" }}>
                        +{totalThis} RON
                      </span>
                      {!appr && (
                        <button onClick={() => setExpanded(isOpen ? null : key)} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 8, border: "0.5px solid #378ADD", background: "transparent", color: "#185FA5", cursor: "pointer", fontFamily: "inherit" }}>
                          {isOpen ? "Închide" : "Revizuiește"}
                        </button>
                      )}
                      {appr === "approved" && (
                        <button onClick={() => setApprovalStatus(member.id, ev.id, null)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>Anulează</button>
                      )}
                    </div>

                    {/* Expanded edit panel */}
                    {isOpen && (
                      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: 14, background: "var(--color-background-secondary)" }}>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>Modifică sumele dacă e necesar, apoi aprobă sau respinge:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                          {activeActions.map(a => (
                            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 16 }}>{a.icon}</span>
                              <span style={{ fontSize: 13, flex: 1, color: "var(--color-text-primary)" }}>{a.label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="number"
                                  value={getEdit(member.id, ev.id, a.key)}
                                  onChange={e => setEdit(member.id, ev.id, a.key, e.target.value)}
                                  style={{ width: 70, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", fontSize: 13, fontWeight: 500, textAlign: "right", color: "var(--color-text-primary)", fontFamily: "inherit" }}
                                />
                                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>RON</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => commitAndApprove(member.id, ev.id)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: "#1D9E75", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                            ✓ Aprobă
                          </button>
                          <button onClick={() => { setApprovalStatus(member.id, ev.id, "rejected"); setExpanded(null); }} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "0.5px solid #E24B4A", background: "#FCEBEB", color: "#A32D2D", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                            ✗ Respinge
                          </button>
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

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
function SettingsView({ user, bonuses, setBonuses, showToast }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(bonuses);

  function save() { setBonuses(temp); setEditing(false); showToast("✅ Bonusuri salvate!"); }

  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>Bonusuri implicite per acțiune</div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
        {user.isChief ? "Poți modifica valorile de bază. Sumele individuale pot fi ajustate și la aprobare." : "Valorile sunt setate de Crew Chief."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {ACTIONS.map(a => (
          <div key={a.key} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{a.icon}</span>
              <span style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{a.label}</span>
            </div>
            {editing && user.isChief ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" value={temp[a.key]} onChange={e => setTemp(p => ({ ...p, [a.key]: parseInt(e.target.value)||0 }))}
                  style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", fontSize: 13, fontWeight: 500, textAlign: "right", color: "var(--color-text-primary)", fontFamily: "inherit" }} />
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>RON</span>
              </div>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 500, color: "#0F6E56" }}>{bonuses[a.key]} RON</span>
            )}
          </div>
        ))}
      </div>

      {user.isChief && (
        <div style={{ display: "flex", gap: 8 }}>
          {editing
            ? <><button onClick={save} style={btnGreen}>Salvează</button><button onClick={() => { setTemp(bonuses); setEditing(false); }} style={btnOutline}>Anulează</button></>
            : <button onClick={() => { setTemp(bonuses); setEditing(true); }} style={btnOutline}>✏️ Modifică</button>
          }
        </div>
      )}

      <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border-tertiary)", margin: "20px 0" }} />
      <div style={{ background: "#E6F1FB", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#0C447C", marginBottom: 6 }}>📆 Google Calendar</div>
        <div style={{ fontSize: 12, color: "#185FA5" }}>Evenimentele sunt importate automat din calendarul echipei.</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }}></span>
          <span style={{ fontSize: 12, color: "#0C447C" }}>Conectat: crew.led.events@gmail.com</span>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function DayNav({ day, setDay }) {
  const isToday = toKey(day) === "2026-05-31";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <button onClick={() => setDay(addDays(day, -1))} style={nb}>←</button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", textTransform: "capitalize" }}>{fmtDate(day)}</div>
        {isToday && <div style={{ fontSize: 11, color: "#0F6E56" }}>azi</div>}
      </div>
      <button onClick={() => setDay(addDays(day, 1))} style={nb}>→</button>
    </div>
  );
}
function EmptyDay() {
  return <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-tertiary)", fontSize: 14 }}>Nicio activare în această zi</div>;
}

const btnGreen  = { padding: "8px 18px", borderRadius: 8, border: "none", background: "#1D9E75", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnOutline = { padding: "8px 18px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
