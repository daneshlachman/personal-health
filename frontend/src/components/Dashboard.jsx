import { useEffect, useRef, useState } from "react";
import { API } from "../utils/api";
import { toDecimal } from "../utils/decimal";
import { cachedFetch, getCached, setCache } from "../utils/cache";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatXTick(dateStr, days) {
  const [m, d] = dateStr.split("-").map(Number);
  const mon = MONTH_NAMES[m - 1];
  if (days <= 30) return `${d} ${mon}`;
  // For 3M+: show "Mar", "Apr" etc only on ~1st of month
  if (d <= 3) return mon;
  return "";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const [m, d] = (label || "").split("-").map(Number);
  const formatted = m && d ? `${d} ${MONTH_NAMES[m - 1]}` : label;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2">
      <p className="text-xs text-gray-400 mb-0.5">{formatted}</p>
      <p className="text-sm font-bold text-gray-900">{payload[0].value} kg</p>
    </div>
  );
};
import WhoopHistory from "./WhoopHistory";
import WeightHistory from "./WeightHistory";
import CaloriesHistory from "./CaloriesHistory";
import Settings from "./Settings";

const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

const STEP_GOAL = 10000;

function Ring({ value, goal, label, color, size = 80, inverse = false, showPct = true, unit = "", unitBelow = false, onClick }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const raw = value != null ? (inverse ? Math.max(0, goal - value) / goal : value / goal) : 0;
  const pct = Math.min(raw, 1);
  const dash = pct * circ;

  return (
    <div className={`flex flex-col items-center gap-1 ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={value != null ? color : "#e5e7eb"} strokeWidth={8}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-gray-900 leading-none">
            {value != null ? Math.round(value) : "—"}{!unitBelow && (showPct ? <span className="text-[9px] font-normal text-gray-400 ml-0.5">%</span> : unit ? <span className="text-[9px] font-normal text-gray-400 ml-0.5">{unit}</span> : null)}
          </span>
          {unitBelow && unit && <span className="text-[9px] text-gray-400 leading-none mt-0.5">{unit}</span>}
        </div>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}


function recoveryColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 67) return "#22c55e";
  if (score >= 34) return "#eab308";
  return "#ef4444";
}

function sleepColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#60a5fa";
  return "#ef4444";
}

const toLocalISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayISO = toLocalISO(new Date());

function dateLabel(iso) {
  if (iso === todayISO) return "Today";
  const yesterday = toLocalISO(new Date(Date.now() - 86400000));
  if (iso === yesterday) return "Yesterday";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function MiniCalendar({ selected, onSelect, onClose }) {
  const selDate = new Date(selected + "T12:00:00");
  const [viewYear, setViewYear] = useState(selDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selDate.getMonth());

  const today = new Date(todayISO + "T12:00:00");
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Mon=0

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg font-bold">‹</button>
          <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
          <button
            onClick={nextMonth}
            disabled={viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg font-bold disabled:opacity-30"
          >›</button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {days.map(d => <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array(startOffset).fill(null).map((_, i) => <div key={`e${i}`} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1;
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = iso === todayISO;
            const isSel = iso === selected;
            const isFuture = iso > todayISO;
            return (
              <button
                key={day}
                disabled={isFuture}
                onClick={() => { onSelect(iso); onClose(); }}
                className={`text-xs py-1.5 rounded-lg font-medium transition-colors ${
                  isSel ? "bg-brand-500 text-white" :
                  isToday ? "bg-brand-50 text-brand-600 font-bold" :
                  isFuture ? "text-gray-200" :
                  "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [date, setDate] = useState(todayISO);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState(null);
  const [showWeightHistory, setShowWeightHistory] = useState(false);
  const [showCaloriesHistory, setShowCaloriesHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addingWeight, setAddingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [whoop, setWhoop] = useState(null);
  const [weightData, setWeightData] = useState([]);
  const [whoopConnected, setWhoopConnected] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weightDays, setWeightDays] = useState(7);
  const [tdee, setTdee] = useState(null);

  const AUTO_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

  const prevDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(toLocalISO(d));
  };

  const nextDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    setDate(toLocalISO(d));
  };

  const parseWeights = (weights) =>
    weights.map((w) => ({ date: w.date.slice(5), kg: w.weight_kg }));

  const fetchWeight = (days) => {
    cachedFetch(
      `${API}/api/weight?days=${days}`,
      `weight-${days}`,
      (weights) => setWeightData(parseWeights(weights)),
    );
  };

  const handlePeriod = (days) => {
    setWeightDays(days);
    fetchWeight(days);
  };

  // Reload whoop + tdee when date changes — show cached immediately, refresh in background
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
    const whoopKey = `whoop-today-${date}`;
    const tdeeKey = `tdee-today-${date}`;

    const cached = getCached(whoopKey);
    if (cached && !cached.error) setWhoop(cached); else setWhoop(null);
    const cachedTdee = getCached(tdeeKey);
    if (cachedTdee) setTdee(cachedTdee); else setTdee(null);

    Promise.all([
      fetch(`${API}/api/whoop/today?date=${date}`).then((r) => r.json()),
      fetch(`${API}/api/tdee/today?date=${date}`).then((r) => r.json()),
    ]).then(([whoopData, tdeeData]) => {
      if (dateRef.current !== date) return; // navigated away
      setCache(whoopKey, whoopData);
      setCache(tdeeKey, tdeeData);
      if (whoopData && !whoopData.error) setWhoop(whoopData);
      setTdee(tdeeData);
    }).catch(console.error);
  }, [date]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("whoop_connected")) {
      window.history.replaceState({}, "", "/");
      triggerSync();
      return;
    }

    // Show cached weight immediately, then load fresh
    const cachedStatus = getCached("whoop-status");
    if (cachedStatus) {
      setWhoopConnected(cachedStatus.connected);
      setLoading(false);
    }

    cachedFetch(
      `${API}/api/weight?days=${weightDays}`,
      `weight-${weightDays}`,
      (weights) => setWeightData(parseWeights(weights)),
    );

    fetch(`${API}/api/whoop/status`)
      .then((r) => r.json())
      .then((status) => {
        setCache("whoop-status", status);
        setWhoopConnected(status.connected);
        if (status.connected) {
          const lastSync = parseInt(localStorage.getItem("lastWhoopSync") || "0");
          if (Date.now() - lastSync > AUTO_SYNC_INTERVAL_MS) triggerSync();
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/sync/whoop`, { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") {
        localStorage.setItem("lastWhoopSync", Date.now().toString());
        const [weights, today] = await Promise.all([
          fetch(`${API}/api/weight?days=${weightDays}`).then((r) => r.json()),
          fetch(`${API}/api/whoop/today`).then((r) => r.json()),
        ]);
        setCache(`weight-${weightDays}`, weights);
        setCache(`whoop-today-${todayISO}`, today);
        setWeightData(parseWeights(weights));
        if (today && !today.error) setWhoop(today);
        setWhoopConnected(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (historyTab) return <WhoopHistory onBack={() => setHistoryTab(null)} initialTab={historyTab} />;
  if (showWeightHistory) return <WeightHistory onBack={() => setShowWeightHistory(false)} />;
  if (showCaloriesHistory) return <CaloriesHistory onBack={() => setShowCaloriesHistory(false)} />;
  if (showSettings) return (
    <Settings
      onBack={() => setShowSettings(false)}
      whoopConnected={whoopConnected}
      syncing={syncing}
      onSync={triggerSync}
      onDisconnect={async () => {
        await fetch(`${API}/api/whoop/disconnect`, { method: "POST" });
        setWhoopConnected(false);
      }}
    />
  );

  const saveWeight = () => {
    const kg = parseFloat(weightInput.replace(",", "."));
    if (!kg || isNaN(kg)) return;
    fetch(`${API}/api/weight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight_kg: kg }),
    }).then(() => {
      setAddingWeight(false);
      setWeightInput("");
      fetchWeight(weightDays);
    }).catch(console.error);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">Loading…</div>;
  }


  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-10 h-10" />
          <button onClick={prevDay} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-2xl font-light">
            ‹
          </button>
        </div>
        <button onClick={() => setCalendarOpen(true)} className="flex flex-col items-center">
          <h1 className="text-xl font-bold text-gray-900">{dateLabel(date)}</h1>
          {date !== todayISO && (
            <span className="text-xs text-gray-400">{new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          )}
        </button>
        <div className="flex items-center">
          <button
            onClick={nextDay}
            disabled={date >= todayISO}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-2xl font-light disabled:opacity-0"
          >
            ›
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {calendarOpen && (
        <MiniCalendar
          selected={date}
          onSelect={setDate}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {/* Whoop: recovery, sleep, steps side by side */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <Ring size={84} value={whoop?.recovery_score} goal={100} label="Recovery" color={recoveryColor(whoop?.recovery_score)} showPct={false} unit="%" onClick={() => setHistoryTab("recovery")} />
          <Ring size={84} value={whoop?.sleep_score} goal={100} label="Sleep" color={sleepColor(whoop?.sleep_score)} showPct={false} unit="%" onClick={() => setHistoryTab("sleep")} />
          <Ring size={84} value={whoop?.step_count} goal={STEP_GOAL} label="Steps" color={(whoop?.step_count || 0) >= STEP_GOAL ? "#22c55e" : "#0ea5e9"} showPct={false} unit={`/ ${STEP_GOAL / 1000}k`} unitBelow={true} />
        </div>
      </div>

      {/* Calories: one compact row */}
      {tdee && (
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3.5 grid grid-cols-3 gap-2">
          <button onClick={() => setShowCaloriesHistory(true)} className="flex flex-col items-start gap-0.5 text-left">
            <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Burned</span>
            <span className="text-lg font-bold text-gray-900">{tdee.burned_now.toLocaleString()}</span>
          </button>
          <button onClick={() => onNavigate?.("nutrition")} className="flex flex-col items-start gap-0.5 text-left border-l border-gray-100 pl-3">
            <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Consumed</span>
            <span className="text-lg font-bold text-gray-900">{tdee.consumed.toLocaleString()}</span>
          </button>
          <button onClick={() => setShowCaloriesHistory(true)} className="flex flex-col items-start gap-0.5 text-left border-l border-gray-100 pl-3">
            <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Balance</span>
            <span className={`text-lg font-bold ${
              tdee.balance > 150 ? "text-orange-500" :
              tdee.balance < -150 ? "text-green-600" :
              "text-gray-700"
            }`}>
              {Math.abs(tdee.balance).toLocaleString()}
              <span className="text-xs font-medium ml-1">{tdee.balance < 0 ? "deficit" : tdee.balance > 0 ? "surplus" : ""}</span>
            </span>
          </button>
        </div>
      )}

      {/* Weight chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWeightHistory(true)} className="text-xs font-semibold text-gray-700 uppercase tracking-wide hover:text-brand-500 transition-colors">
              Weight
            </button>
            {weightData.length >= 2 && (() => {
              const diff = weightData[weightData.length - 1].kg - weightData[0].kg;
              const isDown = diff < 0;
              return (
                <span className={`text-xs font-semibold flex items-center gap-0.5 ${isDown ? "text-green-500" : "text-red-400"}`}>
                  {isDown ? "↓" : "↑"} {Math.abs(diff).toFixed(1)}kg
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-1.5">
            {[{ label: "1W", days: 7 }, { label: "1M", days: 30 }, { label: "2M", days: 60 }, { label: "3M", days: 90 }].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => handlePeriod(days)}
                className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${weightDays === days ? "bg-brand-500 text-white" : "text-gray-400 hover:text-gray-600"}`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setAddingWeight(true)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 transition-colors ml-1"
            >
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {addingWeight && (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weightInput}
              onChange={e => setWeightInput(toDecimal(e.target.value))}
              onKeyDown={e => e.key === "Enter" && saveWeight()}
              placeholder="88.5"
              autoFocus
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-500">kg</span>
            <button onClick={saveWeight} className="bg-brand-500 text-white rounded-xl px-3 py-2 text-sm font-medium">Save</button>
            <button onClick={() => { setAddingWeight(false); setWeightInput(""); }} className="text-gray-400 text-sm px-2">✕</button>
          </div>
        )}
        {weightData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No weight data for this period.</p>
        ) : (() => {
          const kgs = weightData.map(d => d.kg).filter(Boolean);
          const rangeKg = Math.max(...kgs) - Math.min(...kgs);
          const step = rangeKg <= 2 ? 0.5 : rangeKg <= 5 ? 1 : rangeKg <= 10 ? 2 : 2.5;
          const minT = Math.floor(Math.min(...kgs) / step) * step;
          const maxT = Math.ceil(Math.max(...kgs) / step) * step;
          const yTicks = [];
          for (let t = minT; t <= maxT + 0.01; t += step) yTicks.push(Math.round(t * 10) / 10);
          return (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={d => formatXTick(d, weightDays)}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minT - 0.25, maxT + 0.25]}
                ticks={yTicks}
                tickFormatter={v => Number.isInteger(v) ? `${v}` : `${v.toFixed(1)}`}
                tick={{ fontSize: 9, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                unit="kg"
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine x="03-28" stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "28 Mar", position: "top", fontSize: 9, fill: "#f59e0b" }} />
              <Line
                type="monotone"
                dataKey="kg"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={{ r: 3, fill: "#fff", stroke: "#0ea5e9", strokeWidth: 2 }}
                activeDot={{ r: 4, fill: "#0ea5e9", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          );
        })()}
      </div>

    </div>
  );
}
