import { useEffect, useState } from "react";
import { API } from "../utils/api";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend,
} from "recharts";

const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

function avg(data, key) {
  const vals = data.map(d => d[key]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function Chart({ data, dataKey, color, unit, height = 130, domain = ["auto", "auto"], refLine }) {
  const chartData = data.map(d => ({ date: d.date.slice(5), value: d[dataKey] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis domain={domain} tick={{ fontSize: 9 }} unit={unit} width={38} />
        <Tooltip formatter={v => v != null ? [`${typeof v === "number" && !Number.isInteger(v) ? v.toFixed(1) : v} ${unit}`, ""] : ["—", ""]} />
        {refLine != null && <ReferenceLine y={refLine} stroke={color} strokeDasharray="4 4" strokeOpacity={0.4} />}
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SleepBarChart({ data }) {
  const chartData = data
    .filter(d => d.sleep_duration_hours != null || d.sleep_needed_hours != null)
    .map(d => ({
      date: d.date.slice(5),
      slept: d.sleep_duration_hours,
      needed: d.sleep_needed_hours,
    }));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={6} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} unit="h" width={32} />
        <Tooltip formatter={(v, name) => [`${v?.toFixed(1)}h`, name === "slept" ? "Slept" : "Needed"]} />
        <Bar dataKey="needed" fill="#e0e7ff" radius={[2, 2, 0, 0]} />
        <Bar dataKey="slept" fill="#818cf8" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Stat({ label, value, unit, color }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-lg font-bold text-gray-900" style={color ? { color } : undefined}>
        {value != null ? `${value}` : "—"}<span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

function RecoveryTab({ data, days }) {
  const latest = data[data.length - 1] || {};
  const avgRecovery = avg(data, "recovery_score");
  const avgHrv = avg(data, "hrv_ms");
  const avgRhr = avg(data, "resting_hr");
  const avgRr = avg(data, "respiratory_rate");

  return (
    <div className="space-y-4">
      {/* Today's snapshot */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Recovery" value={latest.recovery_score} unit="%" color="#22c55e" />
        <Stat label="HRV" value={latest.hrv_ms != null ? Math.round(latest.hrv_ms) : null} unit="ms" color="#60a5fa" />
        <Stat label="Resting HR" value={latest.resting_hr} unit="bpm" color="#fb7185" />
        <Stat label="Respiratory Rate" value={latest.respiratory_rate != null ? latest.respiratory_rate.toFixed(1) : null} unit="rpm" color="#f59e0b" />
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Recovery Score</span>
            {avgRecovery != null && <span className="text-[10px] text-gray-400">avg {Math.round(avgRecovery)}%</span>}
          </div>
          <Chart data={data} dataKey="recovery_score" color="#22c55e" unit="%" domain={[0, 100]} refLine={avgRecovery} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">HRV</span>
            {avgHrv != null && <span className="text-[10px] text-gray-400">avg {Math.round(avgHrv)} ms</span>}
          </div>
          <Chart data={data} dataKey="hrv_ms" color="#60a5fa" unit="ms" refLine={avgHrv} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Resting HR</span>
            {avgRhr != null && <span className="text-[10px] text-gray-400">avg {Math.round(avgRhr)} bpm</span>}
          </div>
          <Chart data={data} dataKey="resting_hr" color="#fb7185" unit="bpm" refLine={avgRhr} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Respiratory Rate</span>
            {avgRr != null && <span className="text-[10px] text-gray-400">avg {avgRr.toFixed(1)} rpm</span>}
          </div>
          <Chart data={data} dataKey="respiratory_rate" color="#f59e0b" unit="rpm" refLine={avgRr} />
        </div>
      </div>
    </div>
  );
}

function SleepTab({ data }) {
  const latest = data[data.length - 1] || {};
  const avgConsistency = avg(data, "sleep_consistency_pct");
  const avgEfficiency = avg(data, "sleep_efficiency_pct");

  return (
    <div className="space-y-4">
      {/* Today's snapshot */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Sleep Score" value={latest.sleep_score} unit="%" color="#a78bfa" />
        <Stat label="Slept" value={latest.sleep_duration_hours?.toFixed(1)} unit="h" color="#818cf8" />
        <Stat label="Needed" value={latest.sleep_needed_hours?.toFixed(1)} unit="h" color="#6366f1" />
        <Stat label="Disturbances" value={latest.sleep_disturbances} unit="" color="#f97316" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Consistency" value={latest.sleep_consistency_pct} unit="%" color="#8b5cf6" />
        <Stat label="Efficiency" value={latest.sleep_efficiency_pct} unit="%" color="#06b6d4" />
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <span className="text-xs font-semibold text-gray-700">Sleep vs Needed</span>
          <p className="text-[10px] text-gray-400 mb-1">Purple = slept · Light = needed</p>
          <SleepBarChart data={data} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Consistency</span>
            {avgConsistency != null && <span className="text-[10px] text-gray-400">avg {Math.round(avgConsistency)}%</span>}
          </div>
          <Chart data={data} dataKey="sleep_consistency_pct" color="#8b5cf6" unit="%" domain={[0, 100]} refLine={avgConsistency} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Efficiency</span>
            {avgEfficiency != null && <span className="text-[10px] text-gray-400">avg {Math.round(avgEfficiency)}%</span>}
          </div>
          <Chart data={data} dataKey="sleep_efficiency_pct" color="#06b6d4" unit="%" domain={[0, 100]} refLine={avgEfficiency} />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-gray-700">Disturbances</span>
          </div>
          <Chart data={data} dataKey="sleep_disturbances" color="#f97316" unit="" />
        </div>
      </div>
    </div>
  );
}

export default function WhoopHistory({ onBack, initialTab = "recovery" }) {
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/whoop/history?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button onClick={() => setTab("recovery")} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${tab === "recovery" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Recovery</button>
          <button onClick={() => setTab("sleep")} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${tab === "sleep" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Sleep</button>
        </div>
        <div className="flex gap-1 ml-auto">
          {PERIODS.map(({ label, days: d }) => (
            <button key={d} onClick={() => setDays(d)} className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${days === d ? "bg-brand-500 text-white" : "text-gray-400 hover:text-gray-600"}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No data for this period.</p>
      ) : tab === "recovery" ? (
        <RecoveryTab data={data} days={days} />
      ) : (
        <SleepTab data={data} />
      )}
    </div>
  );
}
