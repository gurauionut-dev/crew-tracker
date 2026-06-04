import { useState, useEffect } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACTIONS = [
  { key: "montaj",    label: "Montaj",    icon: "🔧", defaultBonus: 120 },
  { key: "demontaj",  label: "Demontaj",  icon: "📦", defaultBonus: 100 },
  { key: "operare",   label: "Operare",   icon: "🖥️",  defaultBonus: 150 },
  { key: "condus",    label: "Condus",    icon: "🚐", defaultBonus: 80  },
  { key: "deplasare", label: "Deplasare", icon: "🗺️",  defaultBonus: 50  },
  { key: "asistenta", label: "Asistență", icon: "🎧", defaultBonus: 60  },
];

const TEAM = [
  { id: "andrei",    name: "Andrei N.",    initials: "AN", color: "#185FA5", bg: "#E6F1FB", role: "Crew Chief", isChief: true  },
  { id: "mihai",     name: "Mihai P.",     initials: "MP", color: "#27500A", bg: "#EAF3DE", role: "Technician", isChief: false },
  { id: "radu",      name: "Radu S.",      initials: "RS", color: "#633806", bg: "#FAEEDA", role: "Technician", isChief: false },
  { id: "georgiana", name: "Georgiana T.", initials: "GT", color: "#72243E", bg: "#FBEAF0", role: "Technician", isChief: false },
];

const MOCK_EVENTS = {
  "2026-05-29": [
    { id: "ev1", title: "Samsung Fest — Montaj", start: "06:00", end: "10:00", location: "Sala Palatului, București", type: "montaj"   },
    { id: "ev2", title: "Samsung Fest — Show",   start: "18:00", end: "23:00", location: "Sala Palatului, București", type: "operare"  },
  ],
  "2026-05-30": [
    { id: "ev3", title: "Vodafone Launch Party",  start: "08:00", end: "12:00", location: "Exporom, București",       type: "montaj"   },
    { id: "ev4", title: "Untold Promo Booth",      start: "14:00", end: "17:00", location: "AFI Cotroceni",            type: "operare"  },
    { id: "ev5", title: "Vodafone — Demontaj",     start: "23:00", end: "02:00", location: "Exporom, București",       type: "demontaj" },
  ],
  "2026-05-31": [
    { id: "ev6", title: "Untold Promo — Demontaj",  start: "10:00", end: "13:00", location: "AFI Cotroceni",            type: "demontaj" },
    { id: "ev7", title: "Banca Transilvania Promo", start: "15:00", end: "20:00", location: "Grand Hotel Continental", type: "operare"  },
  ],
  "2026-06-01": [
    { id: "ev8", title: "eMAG Showcase — Montaj", start: "07:00", end: "11:00", location: "Romexpo, Pavilion C", type: "montaj"  },
    { id: "ev9", title: "eMAG Showcase — Show",   start: "16:00", end: "22:00", location: "Romexpo, Pavilion C", type: "operare" },
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

// Pre-seeded demo data
const SEED_CHECKED = {
  mihai: {
    ev6: { montaj: false, demontaj: true,  operare: false, condus: true,  deplasare: false, asistenta: false },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: false, deplasare: true,  asistenta: false },
  },
  radu: {
    ev6: { montaj: false, demontaj: true,  operare: false, condus: false, deplasare: true,  asistenta: false },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: true,  deplasare: false, asistenta: false },
  },
  georgiana: {
    ev6: { montaj: false, demontaj: true,  operare: false, condus: false, deplasare: false, asistenta: true  },
    ev7: { montaj: false, demontaj: false, operare: true,  condus: false, deplasare: true,  asistenta: false },
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toKey(d)      { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function fmtDate(d)    { return d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }); }

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function Avatar({ member, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: member.bg, color: member.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 600, flexShrink: 0,
      userSelect: "none",
    }}>
      {member.initials}
    </div>
  );
}

function Badge({ type }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.montaj;
  const a = ACTIONS.find(x => x.key === type);
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {a ? a.label : type}
    </span>
  );
}

function DayNav({ day, setDay }) {
  const isToday = toKey(day) === toKey(new Date("2026-05-31"));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <button onClick={() => setDay(addDays(day, -1))} style={S.navBtn}>←</button>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a18", textTransform: "capitalize" }}>
          {fmtDate(day)}
        </div>
        {isToday && <div style={{ fontSize: 11, color: "#0F6E56" }}>azi</div>}
      </div>
      <button onClick={() => setDay(addDays(day, 1))} style={S.navBtn}>→</button>
    </div>
  );
}

function EmptyDay() {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "#aaa", fontSize: 14 }}>
      Nicio activare în această zi
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "#1D9E75", color: "#fff", padding: "9px 22px",
      borderRadius: 24, fontSize: 13, fontWeight: 500,
      whiteSpace: "nowrap", zIndex: 9999,
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
    }}>
      {msg}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view,      setView]      = useState("login");
  const [user,      setUser]      = useState(null);
  const [day,       setDay]       = useState(new Date("2026-05-31"));
  const [tab,       setTab]       = useState("today");
  const [selEvent,  setSelEvent]  = useState(null);
  const [toast,     setToast]     = useState(null);

  const [checked,   setChecked]   = useState(() => load("ct_checked",   SEED_CHECKED));
  const [approvals, setApprovals] = useState(() => load("ct_approvals", {}));
  const [amounts,   setAmounts]   = useState(() => load("ct_amounts",   {}));
  const [bonuses,   setBonuses]   = useState(() => load("ct_bonuses",   Object.fromEntries(ACTIONS.map(a => [a.key, a.defaultBonus]))));

  useEffect(() => { save("ct_checked",   checked);   }, [checked]);
  useEffect(() => { save("ct_approvals", approvals); }, [approvals]);
  useEffect(() => { save("ct_amounts",   amounts);   }, [amounts]);
  useEffect(() => { save("ct_bonuses",   bonuses);   }, [bonuses]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2400); }

  const dayKey = toKey(day);
  const events = MOCK_EVENTS[dayKey] || [];

  const getChecked  = (uid, eid)      => checked[uid]?.[eid] || {};
  const getApproval = (uid, eid)      => approvals[uid]?.[eid]?.status ?? null;
  const getAmount   = (uid, eid, ak)  => amounts[uid]?.[eid]?.[ak] ?? bonuses[ak];

  function toggleMyAction(eid, ak) {
    if (getApproval(user.id, eid) === "approved") return;
    setChecked(prev => {
      const u = { ...(prev[user.id] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = !e[ak];
      u[eid] = e;
      return { ...prev, [user.id]: u };
    });
  }

  function setApprovalStatus(uid, eid, status) {
    setApprovals(prev => {
      const u = { ...(prev[uid] || {}) };
      u[eid] = { ...(u[eid] || {}), status };
      return { ...prev, [uid]: u };
    });
    showToast(status === "approved" ? "✅ Acțiuni aprobate!" : status === "rejected" ? "❌ Acțiuni respinse" : "↩️ Aprobare anulată");
  }

  function setActionAmount(uid, eid, ak, val) {
    setAmounts(prev => {
      const u = { ...(prev[uid] || {}) };
      const e = { ...(u[eid] || {}) };
      e[ak] = val;
      u[eid] = e;
      return { ...prev, [uid]: u };
    });
  }

  function calcBonus(uid, eid) {
    return Object.entries(getChecked(uid, eid))
      .filter(([, v]) => v)
      .reduce((s, [k]) => s + getAmount(uid, eid, k), 0);
  }

  function calcDayTotal(uid) {
    return events.reduce((s, ev) =>
      s + (getApproval(uid, ev.id) === "approved" ? calcBonus(uid, ev.id) : 0), 0);
  }

  function handleLogin(member) {
    setUser(member);
    setView("app");
    showToast(`Bun venit, ${member.name.split(" ")[0]}! 👋`);
  }

  function handleLogout() {
    setView("login");
    setUser(null);
    setTab("today");
    setSelEvent(null);
  }

  function handleDayChange(d) {
    setDay(d);
    setSelEvent(null);
  }

  // pending approvals count (for badge)
  function getPendingCount() {
    return TEAM.filter(m => !m.isChief).reduce((total, m) =>
      total + events.filter(ev =>
        Object.values(getChecked(m.id, ev.id)).some(Boolean) &&
        !getApproval(m.id, ev.id)
      ).length, 0);
  }

  const sharedProps = { user, day, setDay: handleDayChange, events, getChecked, getApproval, getAmount, calcBonus, calcDayTotal, showToast, bonuses };

  if (view === "login") return <><LoginScreen onLogin={handleLogin} /><Toast msg={toast} /></>;

  const tabs = user.isChief
    ? [{ id: "today", label: "📅 Azi" }, { id: "approve", label: "✅ Aprobare" }, { id: "settings", label: "⚙️ Setări" }]
    : [{ id: "today", label: "📅 Azi" }, { id: "settings", label: "⚙️ Setări" }];

  const pending = user.isChief ? getPendingCount() : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f0ef", display: "flex", flexDirection: "column" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e6", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "#185FA5", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚡</div>
          <span style={{ fontWeight: 600, fontSize: 16, color: "#1a1a18", letterSpacing: -0.4 }}>Crew Tracker</span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <div key={t.id} style={{ position: "relative" }}>
                <button
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid",
                    borderColor: active ? "#378ADD" : "#e0e0de",
                    background: active ? "#E6F1FB" : "transparent",
                    color: active ? "#0C447C" : "#666",
                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
                {t.id === "approve" && pending > 0 && (
                  <span style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#E24B4A", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {pending}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar member={user} size={30} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18", lineHeight: 1.2 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{user.role}</div>
          </div>
          <button onClick={handleLogout} style={{ marginLeft: 6, background: "none", border: "1px solid #e0e0de", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#888", cursor: "pointer" }}>
            Ieși
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {tab === "today"    && <TodayView    {...sharedProps} selEvent={selEvent} setSelEvent={setSelEvent} toggleMyAction={toggleMyAction} />}
        {tab === "approve"  && <ApproveView  {...sharedProps} setApprovalStatus={setApprovalStatus} setActionAmount={setActionAmount} />}
        {tab === "settings" && <SettingsView {...sharedProps} setBonuses={setBonuses} />}
      </div>

      <Toast msg={toast} />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f0f0ef", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 20 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 60, height: 60, background: "#185FA5", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 28 }}>⚡</div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#1a1a18", margin: "0 0 6px", letterSpacing: -0.5 }}>Crew Tracker</h1>
        <p style={{ fontSize: 14, color: "#888", margin: 0 }}>Selectează-ți profilul pentru a continua</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 340 }}>
        {TEAM.map(m => (
          <button
            key={m.id}
            onClick={() => onLogin(m)}
            style={{
              background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14,
              padding: "18px 12px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              transition: "box-shadow 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#378ADD"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(55,138,221,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e8e8e6"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600 }}>
              {m.initials}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{m.role}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }}></span>
        Sincronizat cu Google Calendar
      </div>
    </div>
  );
}

// ─── TODAY VIEW ───────────────────────────────────────────────────────────────

function TodayView({ user, day, setDay, events, selEvent, setSelEvent, getChecked, toggleMyAction, getApproval, getAmount, calcBonus, calcDayTotal, showToast, bonuses }) {
  const selEv   = events.find(e => e.id === selEvent);
  const myCheck = selEv ? getChecked(user.id, selEv.id) : {};
  const approval = selEv ? getApproval(user.id, selEv.id) : null;
  const isLocked = approval === "approved" || approval === "rejected";

  const myTotalEstimate = selEv
    ? Object.entries(myCheck).filter(([,v]) => v).reduce((s,[k]) => s + getAmount(user.id, selEv.id, k), 0)
    : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", minHeight: "calc(100vh - 52px)" }}>

      {/* LEFT: Event list */}
      <div style={{ padding: 20, borderRight: "1px solid #e8e8e6", overflowY: "auto" }}>
        <DayNav day={day} setDay={setDay} />

        <div style={{ background: "#E6F1FB", borderRadius: 10, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📆</span>
          <span style={{ fontSize: 12, color: "#0C447C", fontWeight: 500 }}>Google Calendar</span>
          <span style={{ fontSize: 12, color: "#185FA5", marginLeft: "auto" }}>
            {events.length} activăr{events.length === 1 ? "e" : "i"} azi
          </span>
        </div>

        {events.length === 0 && <EmptyDay />}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.map(ev => {
            const ch    = getChecked(user.id, ev.id);
            const done  = Object.entries(ch).filter(([,v]) => v).map(([k]) => k);
            const appr  = getApproval(user.id, ev.id);
            const bonus = calcBonus(user.id, ev.id);
            const active = selEvent === ev.id;

            return (
              <div
                key={ev.id}
                onClick={() => setSelEvent(active ? null : ev.id)}
                style={{
                  background: active ? "#E6F1FB" : "#fff",
                  border: active ? "1.5px solid #378ADD" : "1px solid #e8e8e6",
                  borderRadius: 14, padding: "13px 15px", cursor: "pointer",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.07)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: active ? "#0C447C" : "#1a1a18" }}>{ev.title}</span>
                  <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>{ev.start}–{ev.end}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Badge type={ev.type} />
                  <span style={{ fontSize: 12, color: "#888" }}>📍 {ev.location}</span>
                  {appr === "approved" && <span style={{ marginLeft: "auto", fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat · +{bonus} RON</span>}
                  {appr === "rejected" && <span style={{ marginLeft: "auto", fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "1px 8px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                  {!appr && done.length > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "#854F0B", fontWeight: 500 }}>⏳ în așteptare</span>}
                </div>
                {done.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                    {done.map(k => (
                      <span key={k} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>
                        ✓ {ACTIONS.find(a => a.key === k)?.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {events.length > 0 && (
          <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e8e8e6", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#888" }}>Total aprobat azi</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#0F6E56" }}>+{calcDayTotal(user.id)} RON</span>
          </div>
        )}
      </div>

      {/* RIGHT: Action panel */}
      <div style={{ padding: 20, background: "#fff", overflowY: "auto" }}>
        {!selEv ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#bbb" }}>
            <span style={{ fontSize: 40 }}>👆</span>
            <span style={{ fontSize: 14 }}>Selectează o activare</span>
            <span style={{ fontSize: 12, textAlign: "center", maxWidth: 180 }}>Bifează acțiunile pe care le-ai efectuat</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginBottom: 3 }}>{selEv.title}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{selEv.start}–{selEv.end} · {selEv.location}</div>
            </div>

            {approval && (
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: approval === "approved" ? "#E1F5EE" : "#FCEBEB",
                fontSize: 13, fontWeight: 500,
                color: approval === "approved" ? "#085041" : "#791F1F",
              }}>
                {approval === "approved"
                  ? "✅ Acțiunile tale au fost aprobate de Crew Chief."
                  : "❌ Crew Chief a respins acțiunile. Contactează-l pentru detalii."}
              </div>
            )}

            <hr style={{ border: "none", borderTop: "1px solid #f0f0ef" }} />

            <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {isLocked ? "Acțiunile bifate" : "Ce ai făcut la această activare?"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {ACTIONS.map(action => {
                const on = !!myCheck[action.key];
                return (
                  <div
                    key={action.key}
                    onClick={() => !isLocked && toggleMyAction(selEv.id, action.key)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 10,
                      border: on ? "1.5px solid #1D9E75" : "1px solid #e8e8e6",
                      background: on ? "#E1F5EE" : "#fafaf9",
                      cursor: isLocked ? "default" : "pointer",
                      opacity: isLocked && !on ? 0.4 : 1,
                      transition: "background 0.1s, border-color 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 17 }}>{action.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: on ? 500 : 400, color: on ? "#085041" : "#1a1a18" }}>
                        {action.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: on ? "#0F6E56" : "#aaa", fontWeight: on ? 500 : 400 }}>
                        +{getAmount(user.id, selEv.id, action.key)} RON
                      </span>
                      <div style={{
                        width: 22, height: 22, borderRadius: 7,
                        border: on ? "none" : "2px solid #ddd",
                        background: on ? "#1D9E75" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 13, fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {on && "✓"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!isLocked && (
              <>
                <div style={{ background: "#fafaf9", border: "1px solid #e8e8e6", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 8 }}>
                    <span>Acțiuni bifate</span>
                    <span>{Object.values(myCheck).filter(Boolean).length} din {ACTIONS.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid #ebebeb" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18" }}>Total estimat</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#0F6E56" }}>+{myTotalEstimate} RON</span>
                  </div>
                </div>

                <button
                  onClick={() => showToast("✅ Trimis spre aprobare!")}
                  style={{
                    background: "#185FA5", color: "#fff", border: "none",
                    borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 600,
                    cursor: "pointer", letterSpacing: -0.2,
                  }}
                >
                  Trimite spre aprobare →
                </button>
              </>
            )}

            <div style={{ fontSize: 11, color: "#bbb", textAlign: "center", marginTop: -4 }}>
              🔄 Sincronizat automat cu Google Calendar
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APPROVE VIEW ─────────────────────────────────────────────────────────────

function ApproveView({ user, day, setDay, events, getChecked, getApproval, setApprovalStatus, getAmount, setActionAmount, calcBonus, calcDayTotal }) {
  const [expanded,   setExpanded]   = useState(null);
  const [editAmounts, setEditAmounts] = useState({});

  function getEdit(uid, eid, ak) {
    return editAmounts[`${uid}-${eid}-${ak}`] ?? getAmount(uid, eid, ak);
  }
  function setEdit(uid, eid, ak, val) {
    setEditAmounts(prev => ({ ...prev, [`${uid}-${eid}-${ak}`]: val }));
  }
  function commitAndApprove(uid, eid) {
    Object.entries(editAmounts).forEach(([key, val]) => {
      const parts = key.split("-");
      const u = parts[0], e = parts[1], ak = parts[2];
      if (u === uid && e === eid) setActionAmount(u, e, ak, Number(val));
    });
    setApprovalStatus(uid, eid, "approved");
    setExpanded(null);
  }

  const members = TEAM.filter(m => !m.isChief);

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <DayNav day={day} setDay={setDay} />

      {events.length === 0 && <EmptyDay />}

      {members.map(member => {
        const memberEvents = events.filter(ev =>
          Object.values(getChecked(member.id, ev.id)).some(Boolean)
        );
        if (memberEvents.length === 0) return (
          <div key={member.id} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Avatar member={member} size={34} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a18" }}>{member.name}</div>
                <div style={{ fontSize: 12, color: "#aaa" }}>Nicio acțiune raportată azi</div>
              </div>
            </div>
          </div>
        );

        const dayApproved = calcDayTotal(member.id);

        return (
          <div key={member.id} style={{ marginBottom: 24 }}>
            {/* Member header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 14px", background: "#fff", borderRadius: 12, border: "1px solid #e8e8e6" }}>
              <Avatar member={member} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18" }}>{member.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{member.role}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#aaa" }}>Total aprobat azi</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: dayApproved > 0 ? "#0F6E56" : "#bbb" }}>
                  {dayApproved > 0 ? `+${dayApproved} RON` : "—"}
                </div>
              </div>
            </div>

            {/* Events */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 8 }}>
              {memberEvents.map(ev => {
                const ch = getChecked(member.id, ev.id);
                const activeActions = ACTIONS.filter(a => ch[a.key]);
                const appr = getApproval(member.id, ev.id);
                const key = `${member.id}-${ev.id}`;
                const isOpen = expanded === key;
                const editTotal = activeActions.reduce((s, a) => s + Number(getEdit(member.id, ev.id, a.key)), 0);

                return (
                  <div key={ev.id} style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 12, overflow: "hidden" }}>
                    {/* Event header */}
                    <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: isOpen ? "1px solid #f0f0ef" : "none" }}>
                      <Badge type={ev.type} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18", flex: 1, minWidth: 120 }}>{ev.title}</span>
                      <span style={{ fontSize: 12, color: "#aaa" }}>{ev.start}–{ev.end}</span>
                      {appr === "approved" && <span style={{ fontSize: 11, background: "#E1F5EE", color: "#085041", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>✓ aprobat</span>}
                      {appr === "rejected" && <span style={{ fontSize: 11, background: "#FCEBEB", color: "#791F1F", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>✗ respins</span>}
                      {!appr && <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>⏳ în așteptare</span>}
                    </div>

                    {/* Action chips + controls */}
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {activeActions.map(a => (
                        <span key={a.key} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, background: "#E1F5EE", color: "#085041", fontWeight: 500 }}>
                          {a.icon} {a.label} · {getAmount(member.id, ev.id, a.key)} RON
                        </span>
                      ))}
                      <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: appr === "approved" ? "#0F6E56" : "#666" }}>
                        +{calcBonus(member.id, ev.id)} RON
                      </span>
                      {!appr && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : key)}
                          style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid #378ADD", background: "transparent", color: "#185FA5", cursor: "pointer" }}
                        >
                          {isOpen ? "Închide" : "Revizuiește"}
                        </button>
                      )}
                      {appr === "approved" && (
                        <button onClick={() => setApprovalStatus(member.id, ev.id, null)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid #ddd", background: "transparent", color: "#aaa", cursor: "pointer" }}>
                          Anulează
                        </button>
                      )}
                    </div>

                    {/* Expanded edit panel */}
                    {isOpen && (
                      <div style={{ padding: "14px 16px", background: "#fafaf9", borderTop: "1px solid #f0f0ef" }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                          Modifică suma pentru fiecare acțiune dacă este necesar:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
                          {activeActions.map(a => (
                            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 18 }}>{a.icon}</span>
                              <span style={{ fontSize: 14, flex: 1, color: "#1a1a18", fontWeight: 500 }}>{a.label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="number"
                                  value={getEdit(member.id, ev.id, a.key)}
                                  onChange={e => setEdit(member.id, ev.id, a.key, e.target.value)}
                                  style={{
                                    width: 80, padding: "6px 10px", borderRadius: 8,
                                    border: "1px solid #e0e0de",
                                    background: "#fff", fontSize: 14, fontWeight: 600,
                                    textAlign: "right", color: "#1a1a18",
                                  }}
                                />
                                <span style={{ fontSize: 13, color: "#888", width: 28 }}>RON</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "10px 14px", background: "#E1F5EE", borderRadius: 10 }}>
                          <span style={{ fontSize: 13, color: "#085041" }}>Total de plătit</span>
                          <span style={{ fontSize: 20, fontWeight: 700, color: "#0F6E56" }}>+{editTotal} RON</span>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            onClick={() => commitAndApprove(member.id, ev.id)}
                            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                          >
                            ✓ Aprobă
                          </button>
                          <button
                            onClick={() => { setApprovalStatus(member.id, ev.id, "rejected"); setExpanded(null); }}
                            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E24B4A", background: "#FCEBEB", color: "#A32D2D", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                          >
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
  const [temp,    setTemp]    = useState({ ...bonuses });

  function save() { setBonuses(temp); setEditing(false); showToast("✅ Bonusuri salvate!"); }
  function cancel() { setTemp({ ...bonuses }); setEditing(false); }

  return (
    <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>

      {/* Bonuses */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginBottom: 3 }}>Bonusuri per acțiune</div>
            <div style={{ fontSize: 13, color: "#888" }}>
              {user.isChief ? "Valorile implicite pentru toată echipa." : "Setate de Crew Chief."}
            </div>
          </div>
          {user.isChief && !editing && (
            <button onClick={() => { setTemp({ ...bonuses }); setEditing(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e0e0de", background: "#fafaf9", color: "#1a1a18", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              ✏️ Modifică
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ACTIONS.map(a => (
            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fafaf9", border: "1px solid #e8e8e6", borderRadius: 10 }}>
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <span style={{ fontSize: 14, flex: 1, color: "#1a1a18" }}>{a.label}</span>
              {editing && user.isChief ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    value={temp[a.key]}
                    onChange={e => setTemp(p => ({ ...p, [a.key]: parseInt(e.target.value) || 0 }))}
                    style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid #e0e0de", background: "#fff", fontSize: 14, fontWeight: 600, textAlign: "right", color: "#1a1a18" }}
                  />
                  <span style={{ fontSize: 13, color: "#888" }}>RON</span>
                </div>
              ) : (
                <span style={{ fontSize: 16, fontWeight: 600, color: "#0F6E56" }}>{bonuses[a.key]} RON</span>
              )}
            </div>
          ))}
        </div>

        {editing && (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={save}   style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Salvează</button>
            <button onClick={cancel} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e0e0de", background: "transparent", color: "#666", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Anulează</button>
          </div>
        )}
      </div>

      {/* Team */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e6", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginBottom: 14 }}>Echipa</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TEAM.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fafaf9", border: "1px solid #e8e8e6", borderRadius: 10 }}>
              <Avatar member={m} size={38} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1a1a18" }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{m.role}</div>
              </div>
              {m.id === user.id && (
                <span style={{ fontSize: 11, background: "#E6F1FB", color: "#0C447C", padding: "2px 9px", borderRadius: 20, fontWeight: 500 }}>Tu</span>
              )}
              {m.isChief && m.id !== user.id && (
                <span style={{ fontSize: 11, background: "#FAEEDA", color: "#633806", padding: "2px 9px", borderRadius: 20, fontWeight: 500 }}>Chief</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar */}
      <div style={{ background: "#E6F1FB", border: "1px solid #C2D9F0", borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0C447C", marginBottom: 6 }}>📆 Google Calendar</div>
        <div style={{ fontSize: 13, color: "#185FA5", marginBottom: 10 }}>
          Evenimentele sunt importate automat din calendarul echipei.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1D9E75", display: "inline-block", flexShrink: 0 }}></span>
          <span style={{ fontSize: 13, color: "#0C447C", fontWeight: 500 }}>Conectat: crew.led.events@gmail.com</span>
        </div>
      </div>
    </div>
  );
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const S = {
  navBtn: {
    background: "none", border: "1px solid #e0e0de", borderRadius: 8,
    padding: "5px 14px", cursor: "pointer", fontSize: 14, color: "#666",
  },
};
