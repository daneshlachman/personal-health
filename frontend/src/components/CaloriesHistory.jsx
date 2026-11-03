import { useEffect, useState } from "react";
import { API } from "../utils/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend,
} from "recharts";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const todayISO = toLocalISO(new Date());

function KPI({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">{label}</span>
      <span className="text-lg font-bold text-gray-900" style={color ? { color } : undefined}>{value ?? "—"}</span>
      {sub && <span className="text-[10px] text-gray-400 block mt-0.5">{sub}</span>}
    </div>
  );
}

// Days of history needed to cover the 1st of the given month
function daysSince(year, month) {
  return Math.ceil((new Date(todayISO + "T12:00:00") - new Date(year, month, 1, 12)) / 86400000) + 1;
}

function CalendarHeatmap({ data, onNeedDays }) {
  const byDate = Object.fromEntries(data.map(d => [d.date, d]));
  const today = new Date(todayISO + "T12:00:00");
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const { year, month } = view;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const [selected, setSelected] = useState(null);

  const shiftMonth = (n) => {
    const d = new Date(year, month + n, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(null);
    onNeedDays(daysSince(d.getFullYear(), d.getMonth()));
  };
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  const days = ["Mo","Tu","We","Th","Fr","Sa","Su"];

  function dayColor(iso) {
    const d = byDate[iso];
    if (!d || d.balance === null) return "bg-gray-100 text-gray-400";
    if (d.balance < -300) return "bg-green-500 text-white";
    if (d.balance < 0) return "bg-green-200 text-green-800";
    if (d.balance < 300) return "bg-orange-200 text-orange-800";
    return "bg-orange-500 text-white";
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">‹</button>
          <span className="text-sm font-semibold text-gray-800 w-20 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={() => shiftMonth(1)} disabled={isCurrentMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-20">›</button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Deficit
          <span className="w-3 h-3 rounded-sm bg-orange-500 inline-block ml-1" /> Surplus
          <span className="w-3 h-3 rounded-sm bg-gray-100 inline-block ml-1" /> Not logged
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {days.map(d => <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array(startOffset).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {Array(daysInMonth).fill(null).map((_, i) => {
          const day = i + 1;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isFuture = iso > todayISO;
          return (
            <div
              key={day}
              onClick={() => !isFuture && setSelected(selected === iso ? null : iso)}
              className={`rounded-lg text-xs py-1 text-center font-medium transition-all flex flex-col items-center justify-center ${isFuture ? "text-gray-200" : "cursor-pointer " + dayColor(iso)} ${selected === iso ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
            >
              <span>{day}</span>
              {iso === todayISO
                ? <span className="block w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: byDate[iso] ? "rgba(255,255,255,0.8)" : "#0ea5e9" }} />
                : <span className="block w-1 h-1 mt-0.5" />
              }
            </div>
          );
        })}
      </div>
      {selected && byDate[selected] && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">
            {new Date(selected + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Burned</p>
              <p className="text-sm font-bold text-gray-900">{byDate[selected].burned.toLocaleString()} kcal</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Consumed</p>
              <p className="text-sm font-bold text-gray-900">{byDate[selected].consumed > 0 ? `${byDate[selected].consumed.toLocaleString()} kcal` : "—"}</p>
              {!byDate[selected].complete && selected !== todayISO && <p className="text-[10px] text-gray-400">Not fully logged</p>}
            </div>
            {byDate[selected].balance !== null && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Balance</p>
                <p className={`text-sm font-bold ${byDate[selected].balance < 0 ? "text-green-600" : "text-orange-500"}`}>
                  {byDate[selected].balance > 0 ? "+" : ""}{byDate[selected].balance.toLocaleString()} kcal
                  <span className={`text-[10px] font-normal ml-1 ${byDate[selected].balance < 0 ? "text-green-500" : "text-orange-400"}`}>{byDate[selected].balance < 0 ? "deficit" : "surplus"}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Estimated burn vs what the weight trend says was really burned
function CalibrationCard() {
  const [c, setC] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/calories/calibration`)
      .then(r => r.json())
      .then(setC)
      .catch(console.error);
  }, []);

  if (!c) return null;
  if (!c.ready) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-1">Reality check</p>
        <p className="text-xs text-gray-400">
          Needs {c.min_logged_days} fully logged days (now {c.logged_days}) and {c.min_weigh_ins} weigh-ins
          (now {c.weigh_ins}) in the last {c.days} days.
        </p>
      </div>
    );
  }

  const diffPct = Math.round((c.factor - 1) * 100);
  const trend = c.weight_change_kg_per_week;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-800 mb-3">Reality check · last {c.days} days</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Estimated burn</p>
          <p className="text-sm font-bold text-gray-900">{c.avg_burned_estimated.toLocaleString()} kcal</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">From weight trend</p>
          <p className="text-sm font-bold text-gray-900">{c.avg_burned_measured.toLocaleString()} kcal</p>
        </div>
      </div>
      <p className={`text-xs font-medium ${Math.abs(diffPct) <= 5 ? "text-green-600" : "text-orange-500"}`}>
        {Math.abs(diffPct) <= 5
          ? "Estimate matches your weight trend"
          : `Estimate is ~${Math.abs(diffPct)}% too ${diffPct < 0 ? "high" : "low"} (factor ${c.factor})`}
      </p>
      <p className="text-[10px] text-gray-400 mt-1">
        {c.logged_days} logged days · {c.weigh_ins} weigh-ins · weight {trend > 0 ? "+" : ""}{trend} kg/week ·
        avg intake {c.avg_intake.toLocaleString()} kcal
      </p>
      <p className="text-[11px] text-gray-500 mt-2 border-t border-gray-100 pt-2">
        {c.adaptive
          ? c.applied_factor !== 1
            ? `Applied to all burn numbers: ×${c.applied_factor}${c.applied_since ? ` (updated ${new Date(c.applied_since + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, refreshed weekly)` : ""}`
            : "Adaptive burn is on; the correction starts once there's enough data."
          : "Adaptive burn is off (Settings)."}
      </p>
    </div>
  );
}

function WeeklyChart({ data }) {
  const weeks = [];
  let current = [];
  data.forEach((d, i) => {
    current.push(d);
    const dow = new Date(d.date + "T12:00:00").getDay();
    if (dow === 0 || i === data.length - 1) {
      const n = current.length;
      const burned = Math.round(current.reduce((s, x) => s + x.burned, 0) / n);
      const daysWithFood = current.filter(x => x.complete);
      const consumed = daysWithFood.length
        ? Math.round(daysWithFood.reduce((s, x) => s + x.consumed, 0) / daysWithFood.length)
        : 0;
      const startDate = new Date(current[0].date + "T12:00:00");
      const startDay = startDate.getDate();
      // Label each week by its first day: short enough that the axis never drops it
      const label = `${startDay} ${MONTH_NAMES[startDate.getMonth()]}`;
      weeks.push({ week: label, burned, consumed });
      current = [];
    }
  });

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-800 mb-3">Avg daily calories per week</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={16} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={42} />
          <Tooltip
            cursor={{ fill: "transparent" }}
            contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: "1px solid #f0f0f0" }}
            formatter={(v, name) => [`${v.toLocaleString()} kcal`, name === "burned" ? "Burned" : "Consumed"]}
          />
          <Bar dataKey="burned" fill="#bfdbfe" radius={[3,3,0,0]} name="burned" />
          <Bar dataKey="consumed" fill="#0ea5e9" radius={[3,3,0,0]} name="consumed" />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-center">
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 inline-block" />Burned</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500 inline-block" />Consumed</span>
      </div>
    </div>
  );
}

export default function CaloriesHistory({ onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpiDays, setKpiDays] = useState(7);
  // Grows when the calendar pages back to a month the loaded history doesn't cover
  const [historyDays, setHistoryDays] = useState(Math.max(30, daysSince(new Date().getFullYear(), new Date().getMonth())));

  useEffect(() => {
    fetch(`${API}/api/calories/history?days=${historyDays}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [historyDays]);

  const last30 = data.slice(-30);
  const kpiData = kpiDays === 7 ? data.slice(-7) : last30;
  // Only fully logged days say anything about intake (backend: services/logging_status.py)
  const daysWithData = kpiData.filter(d => d.complete);
  // Burned is known for every day; consumed only for days with logged food
  const avgBurned = kpiData.length ? Math.round(kpiData.reduce((s, d) => s + d.burned, 0) / kpiData.length) : null;
  const avgConsumed = daysWithData.length ? Math.round(daysWithData.reduce((s, d) => s + d.consumed, 0) / daysWithData.length) : null;

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
          <h1 className="text-xl font-bold text-gray-900">Calories</h1>
          <span className="text-xs text-gray-400">last 30 days</span>
        </div>
        <div className="flex gap-1">
          {[7, 30].map(d => (
            <button
              key={d}
              onClick={() => setKpiDays(d)}
              className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${kpiDays === d ? "bg-brand-500 text-white" : "text-gray-400 hover:text-gray-600"}`}
            >{d}d</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Avg burned" value={avgBurned ? `${avgBurned.toLocaleString()} kcal` : null} />
            <KPI label="Avg consumed" value={avgConsumed ? `${avgConsumed.toLocaleString()} kcal` : null}
              sub={`${daysWithData.length} of ${kpiData.length} days fully logged`} />
          </div>

          <CalendarHeatmap data={data} onNeedDays={(n) => setHistoryDays(d => Math.max(d, n))} />
          <WeeklyChart data={last30} />
          <CalibrationCard />
        </>
      )}
    </div>
  );
}
