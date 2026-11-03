import { useEffect, useState } from "react";
import { API } from "../utils/api";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";

// Recovery and sleep for one day, the week up to it, and how it compares to the 30-day average

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => toLocalISO(new Date());

function shiftDay(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

export function recoveryColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 67) return "#22c55e";
  if (score >= 34) return "#eab308";
  return "#ef4444";
}

export function sleepColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#60a5fa";
  return "#ef4444";
}

// 7.73 → "7:44"
function fmtHours(h) {
  if (h == null) return "—";
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const fmtClock = (iso) => (iso ? iso.slice(11, 16) : "—");

function BigRing({ value, color, label }) {
  const size = 168;
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = value != null ? Math.min(value / 100, 1) * circ : 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={12} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.4s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-gray-900 leading-none">
          {value != null ? Math.round(value) : "—"}<span className="text-lg font-semibold text-gray-400">%</span>
        </span>
        <span className="text-[11px] text-gray-500 uppercase tracking-wide mt-1">{label}</span>
      </div>
    </div>
  );
}

// One metric against its 30-day average. `better`: "up", "down" or null (no judgement)
function MetricRow({ label, value, baseline, unit = "", better = null, format = (v) => v }) {
  const diff = value != null && baseline != null ? value - baseline : null;
  const same = diff == null || Math.abs(diff) < Math.max(0.05 * Math.abs(baseline || 0), 0.1);
  const good = better && !same ? (better === "up") === diff > 0 : null;
  const arrowColor = good == null ? "text-gray-400" : good ? "text-green-500" : "text-orange-500";
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-base font-bold text-gray-900 leading-tight">
            {value != null ? format(value) : "—"}{value != null && unit && <span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>}
          </p>
          <p className="text-[10px] text-gray-400 leading-tight">30d avg {baseline != null ? format(baseline) : "—"}</p>
        </div>
        <span className={`text-xs w-3 ${arrowColor}`}>{same ? "•" : diff > 0 ? "▲" : "▼"}</span>
      </div>
    </div>
  );
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      {title && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

const axisTick = { fontSize: 10, fill: "#9ca3af" };
const dayLabel = (iso) => `${DAY_NAMES[new Date(iso + "T12:00:00").getDay()]} ${Number(iso.slice(8))}`;

function WeekBars({ week, dataKey, colorFn, unit = "%" }) {
  const data = week.map((d) => ({ day: dayLabel(d.date), value: d[dataKey] ?? null }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={18}>
          {data.map((d, i) => <Cell key={i} fill={colorFn(d.value)} />)}
          <LabelList dataKey="value" position="top" formatter={(v) => (v != null ? `${Math.round(v)}${unit}` : "")} style={{ fontSize: 10, fill: "#9ca3af" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WeekLine({ week, dataKey, color, format = (v) => v }) {
  const data = week.map((d) => ({ day: dayLabel(d.date), value: d[dataKey] ?? null }));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <LineChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: 14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} connectNulls
          dot={{ r: 3, fill: "#fff", stroke: color, strokeWidth: 2 }}>
          <LabelList dataKey="value" position="top" formatter={(v) => (v != null ? format(v) : "")} style={{ fontSize: 10, fill: "#9ca3af" }} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

// Hours slept vs needed per night
function WeekSleepHours({ week }) {
  const data = week.map((d) => ({ day: dayLabel(d.date), slept: d.asleep_hours ?? null, needed: d.sleep_needed_hours ?? null }));
  return (
    <>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: 14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
          <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Line type="monotone" dataKey="needed" stroke="#22c55e" strokeWidth={2} connectNulls dot={{ r: 3, fill: "#fff", stroke: "#22c55e", strokeWidth: 2 }}>
            <LabelList dataKey="needed" position="top" formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 9, fill: "#22c55e" }} />
          </Line>
          <Line type="monotone" dataKey="slept" stroke="#818cf8" strokeWidth={2} connectNulls dot={{ r: 3, fill: "#fff", stroke: "#818cf8", strokeWidth: 2 }}>
            <LabelList dataKey="slept" position="bottom" formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 9, fill: "#818cf8" }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-4 justify-center mt-1">
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#818cf8" }} />Slept</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#22c55e" }} />Needed</span>
      </div>
    </>
  );
}

// Bed and wake times as bars on a clock axis running from 20:00 (top) to 12:00 (bottom)
function WeekBedtimes({ week }) {
  const AXIS_START = 20;
  const toAxis = (iso) => {
    if (!iso) return null;
    const h = Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;
    return (h - AXIS_START + 24) % 24;
  };
  const data = week.map((d) => {
    const s = toAxis(d.bed_start);
    const e = toAxis(d.bed_end);
    return { day: dayLabel(d.date), range: s != null && e != null ? [s, e] : null, start: d.bed_start, end: d.bed_end };
  });
  const ticks = [0, 4, 8, 12, 16];
  const tickLabel = (v) => `${String((v + AXIS_START) % 24).padStart(2, "0")}:00`;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
        <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <YAxis reversed domain={[0, 16]} ticks={ticks} tickFormatter={tickLabel} tick={axisTick} tickLine={false} axisLine={false} width={40} />
        <Bar dataKey="range" fill="#818cf8" radius={4} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StageBar({ label, hours, total, color }) {
  const pct = hours != null && total ? Math.round((100 * hours) / total) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-gray-700">
          {label} <span className="text-xs font-semibold ml-1" style={{ color }}>{pct != null ? `${pct}%` : ""}</span>
        </span>
        <span className="text-sm font-semibold text-gray-900">{fmtHours(hours)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

function RecoveryView({ day, week, baseline }) {
  return (
    <>
      <Card>
        <BigRing value={day?.recovery_score} color={recoveryColor(day?.recovery_score)} label="Recovery" />
        <div className="divide-y divide-gray-50 mt-3">
          <MetricRow label="Heart rate variability" value={day?.hrv_ms} baseline={baseline.hrv_ms} unit="ms" better="up" format={(v) => Math.round(v)} />
          <MetricRow label="Resting heart rate" value={day?.resting_hr} baseline={baseline.resting_hr} unit="bpm" better="down" format={(v) => Math.round(v)} />
          <MetricRow label="Respiratory rate" value={day?.respiratory_rate} baseline={baseline.respiratory_rate} unit="rpm" better="down" format={(v) => v.toFixed(1)} />
          {day?.spo2_pct != null && <MetricRow label="Blood oxygen" value={day.spo2_pct} baseline={baseline.spo2_pct} unit="%" better="up" format={(v) => v.toFixed(1)} />}
          {day?.skin_temp_c != null && <MetricRow label="Skin temperature" value={day.skin_temp_c} baseline={baseline.skin_temp_c} unit="°C" format={(v) => v.toFixed(1)} />}
          <MetricRow label="Sleep performance" value={day?.sleep_score} baseline={baseline.sleep_score} unit="%" better="up" format={(v) => Math.round(v)} />
        </div>
      </Card>
      <Card title="Recovery · last 7 days"><WeekBars week={week} dataKey="recovery_score" colorFn={recoveryColor} /></Card>
      <Card title="Heart rate variability (ms)"><WeekLine week={week} dataKey="hrv_ms" color="#0ea5e9" format={(v) => Math.round(v)} /></Card>
      <Card title="Resting heart rate (bpm)"><WeekLine week={week} dataKey="resting_hr" color="#f43f5e" format={(v) => Math.round(v)} /></Card>
      <Card title="Respiratory rate (rpm)"><WeekLine week={week} dataKey="respiratory_rate" color="#a855f7" format={(v) => v.toFixed(1)} /></Card>
    </>
  );
}

function SleepView({ day, week, baseline }) {
  const stages = day?.stages;
  const need = day?.need;
  return (
    <>
      <Card>
        <BigRing value={day?.sleep_score} color={sleepColor(day?.sleep_score)} label="Sleep performance" />
        <div className="divide-y divide-gray-50 mt-3">
          <MetricRow label="Hours vs. needed" value={day?.hours_vs_needed_pct} baseline={baseline.hours_vs_needed_pct} unit="%" better="up" format={(v) => Math.round(v)} />
          <MetricRow label="Sleep consistency" value={day?.sleep_consistency_pct} baseline={baseline.sleep_consistency_pct} unit="%" better="up" format={(v) => Math.round(v)} />
          <MetricRow label="Sleep efficiency" value={day?.sleep_efficiency_pct} baseline={baseline.sleep_efficiency_pct} unit="%" better="up" format={(v) => Math.round(v)} />
          <MetricRow label="Disturbances" value={day?.disturbances} baseline={baseline.disturbances} better="down" format={(v) => Math.round(v)} />
        </div>
      </Card>

      <Card title="Last night">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Asleep</p>
            <p className="text-lg font-bold text-gray-900">{fmtHours(day?.asleep_hours)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">In bed</p>
            <p className="text-lg font-bold text-gray-900">{fmtHours(day?.in_bed_hours)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Bed → up</p>
            <p className="text-lg font-bold text-gray-900">{fmtClock(day?.bed_start)}–{fmtClock(day?.bed_end)}</p>
          </div>
        </div>
        {stages ? (
          <div className="space-y-3">
            <StageBar label="Awake" hours={stages.awake} total={day.in_bed_hours} color="#9ca3af" />
            <StageBar label="Light" hours={stages.light} total={day.in_bed_hours} color="#a5b4fc" />
            <StageBar label="Deep (SWS)" hours={stages.deep} total={day.in_bed_hours} color="#f472b6" />
            <StageBar label="REM" hours={stages.rem} total={day.in_bed_hours} color="#a855f7" />
            {day.sleep_cycles != null && <p className="text-[11px] text-gray-400">{day.sleep_cycles} sleep cycles</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No sleep stages for this night yet.</p>
        )}
      </Card>

      {need && (
        <Card title="Sleep needed" right={<span className="text-sm font-bold text-gray-900">{fmtHours(day.sleep_needed_hours)}</span>}>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Baseline</span><span className="font-medium text-gray-900">{fmtHours(need.baseline)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Recent strain</span><span className="font-medium text-gray-900">+{fmtHours(need.strain)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Sleep debt</span><span className="font-medium text-gray-900">+{fmtHours(need.debt)}</span></div>
            {need.nap < 0 && <div className="flex justify-between"><span className="text-gray-600">Recent nap</span><span className="font-medium text-gray-900">−{fmtHours(-need.nap)}</span></div>}
          </div>
        </Card>
      )}

      <Card title="Sleep performance · last 7 days"><WeekBars week={week} dataKey="sleep_score" colorFn={sleepColor} /></Card>
      <Card title="Hours slept vs. needed"><WeekSleepHours week={week} /></Card>
      <Card title="Bed and wake times"><WeekBedtimes week={week} /></Card>
    </>
  );
}

export default function WhoopDay({ initialDate, initialTab = "recovery", onBack, onLongTerm }) {
  const [date, setDate] = useState(initialDate || todayISO());
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/whoop/details?date=${date}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  const isToday = date >= todayISO();
  const label = new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <div className="flex-1 flex items-center justify-center gap-1">
          <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl">‹</button>
          <span className="text-sm font-semibold text-gray-800 w-28 text-center">{label}</span>
          <button onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl disabled:opacity-20">›</button>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1">
        {[["recovery", "Recovery"], ["sleep", "Sleep"]].map(([value, text]) => (
          <button key={value} onClick={() => setTab(value)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${tab === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            {text}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <p className="text-center text-gray-400 py-12">Loading…</p>
      ) : !data?.day ? (
        <Card><p className="text-sm text-gray-400 text-center py-6">No Whoop data for this day.</p></Card>
      ) : tab === "recovery" ? (
        <RecoveryView day={data.day} week={data.week} baseline={data.baseline} />
      ) : (
        <SleepView day={data.day} week={data.week} baseline={data.baseline} />
      )}

      <button onClick={() => onLongTerm(tab)} className="w-full text-sm text-brand-500 font-medium py-2">
        Long-term trends →
      </button>
    </div>
  );
}
