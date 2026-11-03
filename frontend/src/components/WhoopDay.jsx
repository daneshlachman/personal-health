import { useEffect, useState } from "react";
import { API } from "../utils/api";
import {
  BarChart, Bar, LineChart, Line, Area, ComposedChart, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";

// Recovery and sleep for one day, the week up to it, and how it compares to the 30-day average.
// Always dark, with its own palette (inline colors, so the app's light/dark overrides don't apply).

const C = {
  bgTop: "#2b333b",
  bgBottom: "#101417",
  card: "#262d33",
  cardTop: "#323a41",
  line: "#3a434b",
  track: "#3a4249",
  text: "#ffffff",
  dim: "#9aa4ad",
  faint: "#6b757e",
  good: "#22e33a",
  warn: "#ffd60a",
  bad: "#ff2d3d",
  up: "#2ee6a6",
  down: "#f5a623",
  sleep: "#7fa6c2",
  series: "#6fa8dc",
  needed: "#2ee6a6",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => toLocalISO(new Date());

function shiftDay(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

function recoveryColor(score) {
  if (score == null) return C.faint;
  if (score >= 67) return C.good;
  if (score >= 34) return C.warn;
  return C.bad;
}

const sleepColor = () => C.sleep;

// 7.73 → "7:44"
function fmtHours(h) {
  if (h == null) return "—";
  const total = Math.round(Math.abs(h) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const fmtClock = (iso) => (iso ? iso.slice(11, 16) : "—");
const caps = { letterSpacing: "0.14em", textTransform: "uppercase" };

function BigRing({ value, color, label }) {
  const size = 236;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = value != null ? Math.min(value / 100, 1) * circ : 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span style={{ color: C.text, fontSize: 64, fontWeight: 800, lineHeight: 1 }}>
          {value != null ? Math.round(value) : "—"}<span style={{ fontSize: 32, fontWeight: 700 }}>%</span>
        </span>
        <span style={{ ...caps, color: C.text, fontSize: 13, fontWeight: 700, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>{label}</span>
      </div>
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div className="rounded-2xl" style={{ background: `linear-gradient(180deg, ${C.cardTop}, ${C.card})`, ...style }}>
      {children}
    </div>
  );
}

// One metric against its 30-day average. `better`: "up", "down" or null (no judgement)
function MetricRow({ label, value, baseline, unit = "", better = null, format = (v) => v, last }) {
  const diff = value != null && baseline != null ? value - baseline : null;
  const same = diff == null || Math.abs(diff) < Math.max(0.02 * Math.abs(baseline || 0), 0.05);
  const good = better && !same ? (better === "up") === diff > 0 : null;
  const arrow = same ? "•" : diff > 0 ? "▲" : "▼";
  const arrowColor = same ? C.faint : good == null ? C.dim : good ? C.up : C.down;
  return (
    <div className="flex items-center justify-between px-5 py-4" style={last ? undefined : { borderBottom: `1px solid ${C.line}` }}>
      <span style={{ ...caps, color: C.text, fontSize: 12, fontWeight: 700 }}>{label}</span>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p style={{ color: C.text, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
            {value != null ? format(value) : "—"}{value != null && unit && <span style={{ fontSize: 16 }}>{unit}</span>}
          </p>
          <p style={{ color: C.dim, fontSize: 12, fontWeight: 600 }}>{baseline != null ? format(baseline) : "—"}{baseline != null && unit}</p>
        </div>
        <span style={{ color: arrowColor, fontSize: 11, width: 12 }}>{arrow}</span>
      </div>
    </div>
  );
}

function TrendCard({ title, children }) {
  return (
    <Panel style={{ padding: "18px 16px 12px" }}>
      <div className="flex items-center justify-between mb-2">
        <p style={{ ...caps, color: C.text, fontSize: 12, fontWeight: 700 }}>{title}</p>
        <span style={{ color: C.dim, fontSize: 18 }}>›</span>
      </div>
      {children}
    </Panel>
  );
}

const axisTick = { fontSize: 11, fill: C.dim };
const weekData = (week, map) => week.map((d) => ({ day: DAY_NAMES[new Date(d.date + "T12:00:00").getDay()], num: Number(d.date.slice(8)), ...map(d) }));

// Two-line x-axis label: weekday over day number, like "Tue / 27"
function DayTick({ x, y, payload, data }) {
  const item = data[payload.index];
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={12} textAnchor="middle" fill={C.dim} fontSize={11}>{item?.day}</text>
      <text y={26} textAnchor="middle" fill={C.dim} fontSize={11}>{item?.num}</text>
    </g>
  );
}

function WeekBars({ week, dataKey, colorFn, unit = "%" }) {
  const data = weekData(week, (d) => ({ value: d[dataKey] ?? null }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="day" tick={(p) => <DayTick {...p} data={data} />} tickLine={false} axisLine={false} interval={0} height={34} />
        <YAxis hide domain={[0, 100]} />
        <Bar dataKey="value" barSize={16} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={colorFn(d.value)} />)}
          <LabelList dataKey="value" position="top"
            content={({ x, y, width, value, index }) => value == null ? null : (
              <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={colorFn(data[index].value)}>{Math.round(value)}{unit}</text>
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
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 16 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.series} stopOpacity={0.25} />
            <stop offset="100%" stopColor={C.series} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="day" tick={(p) => <DayTick {...p} data={data} />} tickLine={false} axisLine={false} interval={0} height={34} />
        <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
        <Area type="linear" dataKey="value" stroke="none" fill={`url(#${id})`} connectNulls isAnimationActive={false} />
        <Line type="linear" dataKey="value" stroke={C.series} strokeWidth={2} connectNulls isAnimationActive={false}
          dot={{ r: 5, fill: C.card, stroke: C.series, strokeWidth: 2.5 }}>
          <LabelList dataKey="value" position="top" offset={10}
            formatter={(v) => (v != null ? format(v) : "")} style={{ fontSize: 12, fontWeight: 700, fill: C.series }} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Hours slept vs needed per night
function WeekSleepHours({ week }) {
  const data = weekData(week, (d) => ({ slept: d.asleep_hours ?? null, needed: d.sleep_needed_hours ?? null }));
  const dot = (color) => ({ r: 5, fill: C.card, stroke: color, strokeWidth: 2.5 });
  return (
    <>
      <div className="flex gap-4 justify-end mb-1">
        <span style={{ ...caps, color: C.text, fontSize: 10, fontWeight: 700 }} className="flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: 10, height: 10, border: `2px solid ${C.series}` }} />Hours of sleep
        </span>
        <span style={{ ...caps, color: C.text, fontSize: 10, fontWeight: 700 }} className="flex items-center gap-1.5">
          <span className="inline-block rounded-full" style={{ width: 10, height: 10, border: `2px solid ${C.needed}` }} />Sleep needed
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: 16 }}>
          <CartesianGrid stroke={C.line} vertical={false} />
          <XAxis dataKey="day" tick={(p) => <DayTick {...p} data={data} />} tickLine={false} axisLine={false} interval={0} height={34} />
          <YAxis hide domain={["dataMin - 1.5", "dataMax + 0.5"]} />
          <Line type="linear" dataKey="needed" stroke={C.needed} strokeWidth={2} connectNulls dot={dot(C.needed)} isAnimationActive={false}>
            <LabelList dataKey="needed" position="top" offset={10} formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 11, fontWeight: 700, fill: C.needed }} />
          </Line>
          <Line type="linear" dataKey="slept" stroke={C.series} strokeWidth={2} connectNulls dot={dot(C.series)} isAnimationActive={false}>
            <LabelList dataKey="slept" position="bottom" offset={10} formatter={(v) => (v != null ? fmtHours(v) : "")} style={{ fontSize: 11, fontWeight: 700, fill: C.series }} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
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
  const lastIndex = data.length - 1;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="day" tick={(p) => <DayTick {...p} data={data} />} tickLine={false} axisLine={false} interval={0} height={34} />
        <YAxis reversed domain={[0, 16]} ticks={[0, 4, 8, 12, 16]} tickFormatter={(v) => `${String((v + AXIS_START) % 24).padStart(2, "0")}:00`}
          tick={axisTick} tickLine={false} axisLine={false} width={44} />
        <Bar dataKey="range" barSize={18} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={i === lastIndex ? C.sleep : "#5b636b"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const hatch = `repeating-linear-gradient(135deg, #2f363c 0 6px, #262c31 6px 12px)`;

function StageRow({ label, hours, total, color }) {
  const pct = hours != null && total ? Math.round((100 * hours) / total) : null;
  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="inline-block rounded-full" style={{ width: 26, height: 26, border: `2px solid ${C.text}` }} />
          <span style={{ ...caps, color: C.text, fontSize: 13, fontWeight: 700 }}>{label}</span>
          <span style={{ color, fontSize: 13, fontWeight: 700 }}>{pct != null ? `${pct}%` : ""}</span>
        </div>
        <span style={{ color: C.text, fontSize: 18, fontWeight: 800 }}>{fmtHours(hours)}</span>
      </div>
      <div className="rounded-md overflow-hidden" style={{ height: 18, background: hatch }}>
        <div className="h-full rounded-md" style={{ width: `${Math.max(pct ?? 0, 2)}%`, background: color }} />
      </div>
    </div>
  );
}

function RecoveryView({ day, week, baseline }) {
  return (
    <>
      <BigRing value={day?.recovery_score} color={recoveryColor(day?.recovery_score)} label="Recovery" />
      <Panel>
        <MetricRow label="Heart rate variability" value={day?.hrv_ms} baseline={baseline.hrv_ms} better="up" format={(v) => Math.round(v)} />
        <MetricRow label="Resting heart rate" value={day?.resting_hr} baseline={baseline.resting_hr} better="down" format={(v) => Math.round(v)} />
        <MetricRow label="Respiratory rate" value={day?.respiratory_rate} baseline={baseline.respiratory_rate} better="down" format={(v) => v.toFixed(1).replace(".", ",")} />
        {day?.spo2_pct != null && <MetricRow label="Blood oxygen" value={day.spo2_pct} baseline={baseline.spo2_pct} unit="%" better="up" format={(v) => v.toFixed(1).replace(".", ",")} />}
        {day?.skin_temp_c != null && <MetricRow label="Skin temp" value={day.skin_temp_c} baseline={baseline.skin_temp_c} unit="°" format={(v) => v.toFixed(1).replace(".", ",")} />}
        <MetricRow label="Sleep performance" value={day?.sleep_score} baseline={baseline.sleep_score} unit="%" better="up" format={(v) => Math.round(v)} last />
        <div className="mx-4 mb-4 rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ background: C.bgBottom }}>
          <span style={{ color: C.up, fontSize: 10 }}>▲</span><span style={{ color: C.down, fontSize: 10, marginLeft: -6 }}>▼</span>
          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{fmtDay(day.date)}</span>
          <span style={{ color: C.dim, fontSize: 13 }}>vs. last 30 days</span>
        </div>
      </Panel>
      <SectionTitle>Weekly trends</SectionTitle>
      <TrendCard title="Recovery"><WeekBars week={week} dataKey="recovery_score" colorFn={recoveryColor} /></TrendCard>
      <TrendCard title="Heart rate variability"><WeekLine week={week} dataKey="hrv_ms" format={(v) => Math.round(v)} /></TrendCard>
      <TrendCard title="Resting heart rate"><WeekLine week={week} dataKey="resting_hr" format={(v) => Math.round(v)} /></TrendCard>
      <TrendCard title="Respiratory rate"><WeekLine week={week} dataKey="respiratory_rate" format={(v) => v.toFixed(1).replace(".", ",")} /></TrendCard>
    </>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div className="pt-4 px-1">
      <p style={{ color: C.text, fontSize: 24, fontWeight: 700 }}>{children}</p>
      {sub && <p style={{ color: C.dim, fontSize: 14 }}>{sub}</p>}
    </div>
  );
}

function SleepView({ day, week, baseline }) {
  const stages = day?.stages;
  const need = day?.need;
  const asleep = day?.asleep_hours;
  const needed = day?.sleep_needed_hours;
  const maxH = Math.max(asleep || 0, needed || 0) || 1;
  return (
    <>
      <BigRing value={day?.sleep_score} color={C.sleep} label={<>Sleep<br />performance</>} />
      <Panel>
        <MetricRow label="Hours vs. needed" value={day?.hours_vs_needed_pct} baseline={baseline.hours_vs_needed_pct} unit="%" better="up" format={(v) => Math.round(v)} />
        <MetricRow label="Sleep consistency" value={day?.sleep_consistency_pct} baseline={baseline.sleep_consistency_pct} unit="%" better="up" format={(v) => Math.round(v)} />
        <MetricRow label="Sleep efficiency" value={day?.sleep_efficiency_pct} baseline={baseline.sleep_efficiency_pct} unit="%" better="up" format={(v) => Math.round(v)} />
        <MetricRow label="Disturbances" value={day?.disturbances} baseline={baseline.disturbances} better="down" format={(v) => Math.round(v)} last />
      </Panel>

      <SectionTitle sub={`${fmtDay(day.date)} vs. prior 30 days`}>Last night's sleep</SectionTitle>
      <Panel style={{ padding: "18px 18px 8px" }}>
        <p style={{ ...caps, color: C.text, fontSize: 12, fontWeight: 700 }}>Hours of sleep</p>
        <p style={{ color: C.text, fontSize: 32, fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>{fmtHours(asleep)}</p>
        <p style={{ color: C.dim, fontSize: 13, fontWeight: 600 }}>{fmtHours(baseline.asleep_hours)}</p>
        <div className="flex justify-between mt-4 mb-1" style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
          <span>{fmtClock(day.bed_start)}</span>
          <span style={{ ...caps, color: C.dim, fontSize: 11 }}>Duration {fmtHours(day.in_bed_hours)}</span>
          <span>{fmtClock(day.bed_end)}</span>
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10 }}>
          {stages ? (
            <>
              <StageRow label="Awake" hours={stages.awake} total={day.in_bed_hours} color="#d9d9d9" />
              <StageRow label="Light" hours={stages.light} total={day.in_bed_hours} color="#a3a6f0" />
              <StageRow label="SWS (deep)" hours={stages.deep} total={day.in_bed_hours} color="#f79cf0" />
              <StageRow label="REM" hours={stages.rem} total={day.in_bed_hours} color="#a855f7" />
            </>
          ) : (
            <p style={{ color: C.dim, fontSize: 13, padding: "12px 0" }}>No sleep stages for this night yet.</p>
          )}
        </div>
      </Panel>

      {need && (
        <Panel style={{ padding: 18 }}>
          <p style={{ ...caps, color: C.text, fontSize: 12, fontWeight: 700 }}>Hours vs. needed</p>
          <p style={{ color: C.text, fontSize: 32, fontWeight: 800, lineHeight: 1.1, marginTop: 6 }}>{day.hours_vs_needed_pct ?? "—"}%</p>
          <p style={{ color: C.dim, fontSize: 13, fontWeight: 600 }}>{baseline.hours_vs_needed_pct != null ? `${Math.round(baseline.hours_vs_needed_pct)}%` : "—"}</p>
          <div className="flex justify-between mt-4 mb-1.5">
            <span style={{ ...caps, color: C.dim, fontSize: 11, fontWeight: 700 }}>Hours of sleep</span>
            <span style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>{fmtHours(asleep)}</span>
          </div>
          <div className="rounded-md" style={{ height: 18, width: `${(100 * (asleep || 0)) / maxH}%`, background: `linear-gradient(90deg, ${C.card}, ${C.sleep})` }} />
          <div className="flex rounded-md overflow-hidden mt-4" style={{ height: 18, width: `${(100 * (needed || 0)) / maxH}%` }}>
            <div style={{ flex: need.baseline || 0, background: `linear-gradient(90deg, ${C.card}, #5b636b)` }} />
            <div style={{ flex: need.strain || 0, background: "#1d8cf8" }} />
            <div style={{ flex: need.debt || 0, background: "#d0d4d8" }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span style={{ ...caps, color: C.dim, fontSize: 11, fontWeight: 700 }}>Sleep needed</span>
            <span style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>{fmtHours(needed)}</span>
          </div>
          <div className="rounded-xl mt-4 px-4 py-2" style={{ background: C.bgBottom }}>
            {[["Healthy minimum", need.baseline, "#5b636b", ""], ["Recent strain", need.strain, "#1d8cf8", "+"],
              ["Sleep debt", need.debt, "#d0d4d8", "+"], ...(need.nap < 0 ? [["Recent nap", need.nap, C.faint, "−"]] : [])]
              .map(([label, h, color, sign]) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-3" style={{ color: C.text, fontSize: 14 }}>
                    <span className="inline-block rounded-sm" style={{ width: 14, height: 14, background: color }} />{label}
                  </span>
                  <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{sign}{fmtHours(h)}</span>
                </div>
              ))}
          </div>
        </Panel>
      )}

      <SectionTitle>Weekly trends</SectionTitle>
      <TrendCard title="Sleep performance"><WeekBars week={week} dataKey="sleep_score" colorFn={sleepColor} /></TrendCard>
      <TrendCard title="Hours vs. needed (hours)"><WeekSleepHours week={week} /></TrendCard>
      <TrendCard title="Sleep consistency"><WeekBedtimes week={week} /></TrendCard>
    </>
  );
}

const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

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

  return (
    <div style={{ background: `linear-gradient(180deg, ${C.bgTop} 0%, ${C.bgBottom} 520px, ${C.bgBottom} 100%)`, minHeight: "100%" }}>
      <div className="px-4 pt-3 pb-8 space-y-4 max-w-lg mx-auto">
        <div className="flex items-center">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center" style={{ color: C.text, fontSize: 30, fontWeight: 300 }}>‹</button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 flex items-center justify-center" style={{ color: C.dim, fontSize: 20 }}>‹</button>
            <span style={{ ...caps, color: C.text, fontSize: 14, fontWeight: 700, minWidth: 120, textAlign: "center" }}>
              {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <button onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} className="w-8 h-8 flex items-center justify-center disabled:opacity-20" style={{ color: C.dim, fontSize: 20 }}>›</button>
          </div>
          <div className="w-10" />
        </div>

        <div className="flex rounded-xl p-1" style={{ background: C.card }}>
          {[["recovery", "Recovery"], ["sleep", "Sleep"]].map(([value, text]) => (
            <button key={value} onClick={() => setTab(value)} className="flex-1 rounded-lg py-1.5"
              style={{ ...caps, fontSize: 11, fontWeight: 700, color: tab === value ? C.text : C.dim, background: tab === value ? C.line : "transparent" }}>
              {text}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <p style={{ color: C.dim }} className="text-center py-12">Loading…</p>
        ) : !data?.day ? (
          <Panel style={{ padding: 24 }}><p style={{ color: C.dim, fontSize: 14 }} className="text-center">No data for this day.</p></Panel>
        ) : tab === "recovery" ? (
          <RecoveryView day={data.day} week={data.week} baseline={data.baseline} />
        ) : (
          <SleepView day={data.day} week={data.week} baseline={data.baseline} />
        )}

        <button onClick={() => onLongTerm(tab)} className="w-full py-3" style={{ ...caps, color: C.dim, fontSize: 11, fontWeight: 700 }}>
          Long-term trends ›
        </button>
      </div>
    </div>
  );
}
