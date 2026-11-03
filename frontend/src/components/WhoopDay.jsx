import { useEffect, useState } from "react";
import { API } from "../utils/api";
import {
  BarChart, Bar, LineChart, Line, Area, ComposedChart, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";

// Recovery or sleep for one day, the week up to it, and how it compares to the 30-day average

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SERIES = "#0ea5e9";
const NEEDED = "#22c55e";
const GRID = "#f5f5f5";
const AXIS = "#9ca3af";

const toLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => toLocalISO(new Date());

function shiftDay(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

// Same thresholds and colors as the rings on the dashboard
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

// 7.73 → "7:44"
function fmtHours(h) {
  if (h == null) return "—";
  const total = Math.round(Math.abs(h) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const fmtClock = (iso) => (iso ? iso.slice(11, 16) : "—");
const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dec1 = (v) => v.toFixed(1);

function BigRing({ value, color, label }) {
  const size = 150;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = value != null ? Math.min(value / 100, 1) * circ : 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.4s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-gray-900 leading-none">
          {value != null ? Math.round(value) : "—"}<span className="text-lg font-semibold text-gray-400">%</span>
        </span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wide mt-1.5 text-center">{label}</span>
      </div>
    </div>
  );
}

function Card({ title, sub, children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm ${className}`}>
      {title && <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>}
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      {title && <div className="mb-2" />}
      {children}
    </div>
  );
}

// One metric against its 30-day average. `better`: "up", "down" or null (no judgement)
function MetricRow({ label, value, baseline, unit = "", better = null, format = (v) => v }) {
  const diff = value != null && baseline != null ? value - baseline : null;
  const same = diff == null || Math.abs(diff) < Math.max(0.02 * Math.abs(baseline || 0), 0.05);
  const good = better && !same ? (better === "up") === diff > 0 : null;
  const arrowColor = same ? "text-gray-300" : good == null ? "text-gray-400" : good ? "text-green-500" : "text-orange-500";
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-base font-bold text-gray-900 leading-tight">
            {value != null ? format(value) : "—"}{value != null && unit && <span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>}
          </p>
          <p className="text-[10px] text-gray-400 leading-tight">{baseline != null ? `${format(baseline)}${unit}` : "—"}</p>
        </div>
        <span className={`text-[10px] w-3 ${arrowColor}`}>{same ? "•" : diff > 0 ? "▲" : "▼"}</span>
      </div>
    </div>
  );
}

function VsAverage({ date }) {
  return (
    <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 flex items-center gap-1.5 text-xs">
      <span className="text-green-500 text-[9px]">▲</span><span className="text-orange-500 text-[9px] -ml-1">▼</span>
      <span className="font-medium text-gray-700">{fmtDay(date)}</span>
      <span className="text-gray-400">vs. last 30 days</span>
    </div>
  );
}

const weekData = (week, map) =>
  week.map((d) => ({ day: DAY_NAMES[new Date(d.date + "T12:00:00").getDay()], num: Number(d.date.slice(8)), ...map(d) }));

// Two-line x-axis label: weekday over day number
function DayTick({ x, y, payload, data }) {
  const item = data[payload.index];
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={10} textAnchor="middle" fill={AXIS} fontSize={10}>{item?.day}</text>
      <text y={22} textAnchor="middle" fill={AXIS} fontSize={10}>{item?.num}</text>
    </g>
  );
}

const xAxisFor = (data) => (
  <XAxis dataKey="day" tick={(p) => <DayTick {...p} data={data} />} tickLine={false} axisLine={false} interval={0} height={28} />
);

function WeekBars({ week, dataKey, colorFn, unit = "%" }) {
  const data = weekData(week, (d) => ({ value: d[dataKey] ?? null }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        {xAxisFor(data)}
        <YAxis hide domain={[0, 100]} />
        <Bar dataKey="value" barSize={14} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={colorFn(d.value)} />)}
          <LabelList dataKey="value" position="top"
            content={({ x, y, width, value, index }) => value == null ? null : (
              <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={colorFn(data[index].value)}>{Math.round(value)}{unit}</text>
            )} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WeekLine({ week, dataKey, format = (v) => v }) {
  const data = weekData(week, (d) => ({ value: d[dataKey] ?? null }));
  const id = `fill-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={140}>
      <ComposedChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: 14 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.15} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        {xAxisFor(data)}
        <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
        <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${id})`} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2} connectNulls isAnimationActive={false}
          dot={{ r: 3, fill: "#fff", stroke: SERIES, strokeWidth: 2 }}>
          <LabelList dataKey="value" position="top" offset={8} formatter={(v) => (v != null ? format(v) : "")} style={{ fontSize: 10, fill: AXIS }} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Hours slept vs needed per night
function WeekSleepHours({ week }) {
  const data = weekData(week, (d) => ({ slept: d.asleep_hours ?? null, needed: d.sleep_needed_hours ?? null }));
  const dot = (color) => ({ r: 3, fill: "#fff", stroke: color, strokeWidth: 2 });
  return (
    <>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 18, right: 14, bottom: 0, left: 14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          {xAxisFor(data)}
          <YAxis hide domain={["dataMin - 1.5", "dataMax + 0.5"]} />
          <Line type="monotone" dataKey="needed" stroke={NEEDED} strokeWidth={2} connectNulls dot={dot(NEEDED)} isAnimationActive={false}>
            <LabelList dataKey="needed" position="top" offset={8} formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 9, fill: NEEDED }} />
          </Line>
          <Line type="monotone" dataKey="slept" stroke={SERIES} strokeWidth={2} connectNulls dot={dot(SERIES)} isAnimationActive={false}>
            <LabelList dataKey="slept" position="bottom" offset={8} formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 9, fill: SERIES }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-4 justify-center mt-1">
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: SERIES }} />Hours of sleep</span>
        <span className="text-[10px] text-gray-400 flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: NEEDED }} />Sleep needed</span>
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
  const data = weekData(week, (d) => {
    const s = toAxis(d.bed_start);
    const e = toAxis(d.bed_end);
    return { range: s != null && e != null ? [s, e] : null };
  });
  const last = data.length - 1;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        {xAxisFor(data)}
        <YAxis reversed domain={[0, 16]} ticks={[0, 4, 8, 12, 16]} tickFormatter={(v) => `${String((v + AXIS_START) % 24).padStart(2, "0")}:00`}
          tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} width={40} />
        <Bar dataKey="range" barSize={14} radius={3} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={i === last ? SERIES : "#cbd5e1"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StageRow({ label, hours, total, color }) {
  const pct = hours != null && total ? Math.round((100 * hours) / total) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          {label} <span className="font-semibold ml-1" style={{ color }}>{pct != null ? `${pct}%` : ""}</span>
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
        <BigRing value={day.recovery_score} color={recoveryColor(day.recovery_score)} label="Recovery" />
        <div className="divide-y divide-gray-50 mt-3">
          <MetricRow label="Heart rate variability" value={day.hrv_ms} baseline={baseline.hrv_ms} unit=" ms" better="up" format={Math.round} />
          <MetricRow label="Resting heart rate" value={day.resting_hr} baseline={baseline.resting_hr} unit=" bpm" better="down" format={Math.round} />
          <MetricRow label="Respiratory rate" value={day.respiratory_rate} baseline={baseline.respiratory_rate} better="down" format={dec1} />
          {day.spo2_pct != null && <MetricRow label="Blood oxygen" value={day.spo2_pct} baseline={baseline.spo2_pct} unit="%" better="up" format={dec1} />}
          {day.skin_temp_c != null && <MetricRow label="Skin temperature" value={day.skin_temp_c} baseline={baseline.skin_temp_c} unit="°C" format={dec1} />}
          <MetricRow label="Sleep performance" value={day.sleep_score} baseline={baseline.sleep_score} unit="%" better="up" format={Math.round} />
        </div>
        <VsAverage date={day.date} />
      </Card>
      <Card title="Recovery" sub="Last 7 days"><WeekBars week={week} dataKey="recovery_score" colorFn={recoveryColor} /></Card>
      <Card title="Heart rate variability (ms)"><WeekLine week={week} dataKey="hrv_ms" format={Math.round} /></Card>
      <Card title="Resting heart rate (bpm)"><WeekLine week={week} dataKey="resting_hr" format={Math.round} /></Card>
      <Card title="Respiratory rate"><WeekLine week={week} dataKey="respiratory_rate" format={dec1} /></Card>
    </>
  );
}

function SleepView({ day, week, baseline }) {
  const { stages, need } = day;
  const asleep = day.asleep_hours;
  const needed = day.sleep_needed_hours;
  const maxH = Math.max(asleep || 0, needed || 0) || 1;
  return (
    <>
      <Card>
        <BigRing value={day.sleep_score} color={sleepColor(day.sleep_score)} label="Sleep performance" />
        <div className="divide-y divide-gray-50 mt-3">
          <MetricRow label="Hours vs. needed" value={day.hours_vs_needed_pct} baseline={baseline.hours_vs_needed_pct} unit="%" better="up" format={Math.round} />
          <MetricRow label="Sleep consistency" value={day.sleep_consistency_pct} baseline={baseline.sleep_consistency_pct} unit="%" better="up" format={Math.round} />
          <MetricRow label="Sleep efficiency" value={day.sleep_efficiency_pct} baseline={baseline.sleep_efficiency_pct} unit="%" better="up" format={Math.round} />
          <MetricRow label="Disturbances" value={day.disturbances} baseline={baseline.disturbances} better="down" format={Math.round} />
        </div>
        <VsAverage date={day.date} />
      </Card>

      <Card title="Last night's sleep" sub={`${fmtDay(day.date)} vs. prior 30 days`}>
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Hours of sleep</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight">{fmtHours(asleep)}</p>
            <p className="text-[10px] text-gray-400">{fmtHours(baseline.asleep_hours)} avg</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">In bed {fmtHours(day.in_bed_hours)}</p>
            <p className="text-sm font-semibold text-gray-900">{fmtClock(day.bed_start)} – {fmtClock(day.bed_end)}</p>
          </div>
        </div>
        {stages ? (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <StageRow label="Awake" hours={stages.awake} total={day.in_bed_hours} color="#9ca3af" />
            <StageRow label="Light" hours={stages.light} total={day.in_bed_hours} color="#a5b4fc" />
            <StageRow label="Deep (SWS)" hours={stages.deep} total={day.in_bed_hours} color="#f472b6" />
            <StageRow label="REM" hours={stages.rem} total={day.in_bed_hours} color="#a855f7" />
            {day.sleep_cycles != null && <p className="text-[11px] text-gray-400">{day.sleep_cycles} sleep cycles</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No sleep stages for this night yet.</p>
        )}
      </Card>

      {need && (
        <Card title="Hours vs. needed">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-gray-900">{day.hours_vs_needed_pct ?? "—"}%</span>
            <span className="text-[11px] text-gray-400">{baseline.hours_vs_needed_pct != null ? `${Math.round(baseline.hours_vs_needed_pct)}% avg` : ""}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500">Hours of sleep</span>
            <span className="font-semibold text-gray-900">{fmtHours(asleep)}</span>
          </div>
          <div className="h-2.5 rounded-full" style={{ width: `${(100 * (asleep || 0)) / maxH}%`, background: SERIES }} />
          <div className="flex h-2.5 rounded-full overflow-hidden mt-3" style={{ width: `${(100 * (needed || 0)) / maxH}%` }}>
            <div style={{ flex: need.baseline || 0, background: "#94a3b8" }} />
            <div style={{ flex: need.strain || 0, background: "#f97316" }} />
            <div style={{ flex: need.debt || 0, background: "#cbd5e1" }} />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-500">Sleep needed</span>
            <span className="font-semibold text-gray-900">{fmtHours(needed)}</span>
          </div>
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 space-y-1">
            {[["Baseline", need.baseline, "#94a3b8", ""], ["Recent strain", need.strain, "#f97316", "+"],
              ["Sleep debt", need.debt, "#cbd5e1", "+"], ...(need.nap < 0 ? [["Recent nap", need.nap, "#9ca3af", "−"]] : [])]
              .map(([label, h, color, sign]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-gray-600">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
                  </span>
                  <span className="font-semibold text-gray-900">{sign}{fmtHours(h)}</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      <Card title="Sleep performance" sub="Last 7 days"><WeekBars week={week} dataKey="sleep_score" colorFn={sleepColor} /></Card>
      <Card title="Hours vs. needed (hours)"><WeekSleepHours week={week} /></Card>
      <Card title="Sleep consistency" sub="Bed and wake times"><WeekBedtimes week={week} /></Card>
    </>
  );
}

export default function WhoopDay({ initialDate, initialTab = "recovery", onBack, onLongTerm }) {
  const [date, setDate] = useState(initialDate || todayISO());
  const tab = initialTab;  // opened from the recovery or the sleep ring
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

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">{tab === "recovery" ? "Recovery" : "Sleep"}</h1>
        <div className="flex-1 flex items-center justify-end gap-1">
          <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl">‹</button>
          <span className="text-sm font-semibold text-gray-800 w-24 text-center">{fmtDay(date)}</span>
          <button onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-xl disabled:opacity-20">›</button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-center text-gray-400 py-12">Loading…</p>
      ) : !data?.day ? (
        <Card><p className="text-sm text-gray-400 text-center py-6">No data for this day.</p></Card>
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
