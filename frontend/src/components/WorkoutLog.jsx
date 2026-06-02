import { useEffect, useRef, useState } from "react";
import { API } from "../utils/api";
import { cachedFetch } from "../utils/cache";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const SOURCE_COLOR = {
  hevy: "bg-purple-100 text-purple-700",
  garmin: "bg-green-100 text-green-700",
  whoop: "bg-orange-100 text-orange-700",
};
const SOURCE_LABEL = { hevy: "Hevy", garmin: "Garmin", whoop: "Whoop" };

const STRENGTH_SPORT_IDS = new Set([44, 63, 70, 126, 164, 234, 304]);
const CYCLING_SPORT_IDS = new Set([2, 71, 287, 288, 289]);

const CYCLING_NAMES = new Set(["cycling", "commuting", "mountain biking", "road cycling", "indoor cycling", "bmx"]);
const STRENGTH_NAMES = new Set(["weightlifting", "functional fitness", "crossfit", "powerlifting", "olympic weightlifting", "strength training", "bodybuilding"]);
const WALKING_NAMES = new Set(["walking"]);

function workoutEmoji(w) {
  if (w.source === "hevy") return "💪";
  const name = (w.raw_json?.sport_name || w.raw_json?.activityType?.typeKey || w.title || "").toLowerCase();
  if (STRENGTH_NAMES.has(name)) return "💪";
  if (CYCLING_NAMES.has(name) || name.includes("cycling") || name.includes("bike")) return "🚲";
  return "🏃";
}
const DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MONTHS = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function CalendarMonth({ year, month, workoutsByDate, onDayClick, selectedDate }) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMonday(firstDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells = [];
  const cur = new Date(startMonday);
  while (cur <= lastDay || cells.length % 7 !== 0) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    if (cells.length > 42) break;
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          const iso = toLocalISO(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = day.getTime() === today.getTime();
          const workouts = workoutsByDate[iso] || [];
          const isSelected = selectedDate === iso;

          return (
            <button
              key={i}
              onClick={() => workouts.length > 0 && onDayClick(iso)}
              className={`flex flex-col items-center py-1 rounded-xl transition-colors
                ${!isCurrentMonth ? "opacity-25" : ""}
                ${isSelected ? "bg-brand-500" : isToday ? "bg-brand-50" : ""}
                ${workouts.length > 0 ? "cursor-pointer hover:bg-gray-100" : "cursor-default"}
              `}
            >
              <span className={`text-xs font-medium leading-none mb-0.5
                ${isSelected ? "text-white" : isToday ? "text-brand-600" : "text-gray-700"}
              `}>
                {day.getDate()}
              </span>
              <span className="text-sm leading-none flex gap-0.5">
                {[...new Set(workouts.map(workoutEmoji))].map((e, i) => <span key={i}>{e}</span>)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SetRow({ set, index }) {
  return (
    <div className="flex gap-4 text-xs text-gray-500 py-0.5">
      <span className="w-5 text-gray-300">{index + 1}</span>
      <span>{set.weight_kg != null ? `${set.weight_kg} kg` : "—"}</span>
      <span>{set.reps != null ? `${set.reps} reps` : "—"}</span>
      {set.rpe && <span className="text-gray-400">RPE {set.rpe}</span>}
    </div>
  );
}

function Stat({ label, value, sub }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col">
      <span className="text-base font-bold text-gray-900 leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      <span className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  );
}

function RouteAndCharts({ workoutId, hasPolyline, isRun }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [metrics, setMetrics] = useState([]);
  const [points, setPoints] = useState([]);

  // Effect 1: fetch data
  useEffect(() => {
    if (!hasPolyline) { setStatus("error"); return; }
    fetch(`${API}/api/workouts/${workoutId}/route`)
      .then(r => r.json())
      .then(data => {
        const pts = data.points || [];
        setMetrics((data.metrics || []).filter(m => m.hr || m.kmh));
        if (pts.length < 2) { setStatus("error"); return; }
        setPoints(pts);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [workoutId]);

  // Effect 2: init map AFTER React has rendered the div
  useEffect(() => {
    if (status !== "ready" || !mapRef.current || mapInstanceRef.current || points.length < 2) return;
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      const map = L.default.map(mapRef.current, { zoomControl: false, attributionControl: false });
      L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const poly = L.default.polyline(points, { color: "#f97316", weight: 3 }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding: [8, 8] });
      mapInstanceRef.current = map;
    });
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [status, points]);

  const hasMetrics = metrics.length > 2;

  return (
    <>
      {/* Map — always in DOM so Leaflet can measure it */}
      {status !== "error" && (
        <div className="relative rounded-xl overflow-hidden mt-3" style={{ height: 180 }}>
          <div ref={mapRef} style={{ height: "100%" }} />
          {status === "loading" && (
            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-xs text-gray-400">
              Route laden…
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      {hasMetrics && (
        <div className="mt-3 space-y-3">
          {/* Speed/Pace chart */}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
              {isRun ? "Tempo (min/km)" : "Snelheid (km/h)"}
            </p>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={metrics} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="t" hide />
                <YAxis tick={{ fontSize: 9 }} reversed={isRun} />
                <Tooltip
                  formatter={(v) => isRun
                    ? [`${Math.floor(60/v)}:${String(Math.round(60%(60/v))).padStart(2,"0")} /km`, "Tempo"]
                    : [`${v} km/h`, "Snelheid"]
                  }
                  labelFormatter={(l) => `${l} min`}
                  contentStyle={{ fontSize: 11 }}
                />
                <Line type="monotone" dataKey="kmh" stroke="#f97316" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* HR chart */}
          {metrics.some(m => m.hr) && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Hartslag (bpm)</p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={metrics} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
                  <Tooltip
                    formatter={(v) => [`${v} bpm`, "HR"]}
                    labelFormatter={(l) => `${l} min`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="hr" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function HRZones({ raw }) {
  const zones = [
    { label: "Z1", time: raw.hrTimeInZone_1, color: "bg-blue-300" },
    { label: "Z2", time: raw.hrTimeInZone_2, color: "bg-green-400" },
    { label: "Z3", time: raw.hrTimeInZone_3, color: "bg-yellow-400" },
    { label: "Z4", time: raw.hrTimeInZone_4, color: "bg-orange-400" },
    { label: "Z5", time: raw.hrTimeInZone_5, color: "bg-red-500" },
  ].filter(z => z.time > 0);
  if (zones.length === 0) return null;
  const total = zones.reduce((s, z) => s + z.time, 0);
  const fmt = s => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}u ${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  };
  return (
    <div className="mt-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Hartslagzones</p>
      <div className="space-y-1.5">
        {zones.map(z => (
          <div key={z.label} className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-500 w-5">{z.label}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${z.color}`} style={{ width: `${(z.time/total)*100}%` }} />
            </div>
            <span className="text-[10px] text-gray-500 w-16 text-right">{fmt(z.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GarminStats({ raw, workoutId }) {
  if (!raw) return null;
  const typeKey = (raw.activityType?.typeKey || "").toLowerCase();
  const title = (raw.activityName || "").toLowerCase();
  const isRun = typeKey.includes("run") || title.includes("run") || title.includes("hardloop");
  const isCycle = typeKey.includes("cycl") || typeKey.includes("bike") || title.includes("cycl") || title.includes("fiet");
  const km = raw.distance ? (raw.distance / 1000).toFixed(2) : null;
  const avgKmh = raw.averageSpeed ? (raw.averageSpeed * 3.6).toFixed(1) : null;
  const maxKmh = raw.maxSpeed ? (raw.maxSpeed * 3.6).toFixed(1) : null;
  const pacePerKm = (raw.averageSpeed > 0)
    ? (() => { const s = 1000 / raw.averageSpeed; return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`; })()
    : null;
  const teLabel = raw.trainingEffectLabel?.toLowerCase().replace(/_/g," ");

  return (
    <div>
      {/* Main stats grid */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-1">
        {km && <Stat label="Afstand" value={`${km} km`} />}
        {isRun && pacePerKm && <Stat label="Tempo" value={pacePerKm} sub="min/km" />}
        {avgKmh && <Stat label="Gem. snelheid" value={`${avgKmh} km/h`} />}
        {!isRun && maxKmh && <Stat label="Max snelheid" value={`${maxKmh} km/h`} />}
        {raw.elevationGain > 0 && <Stat label="Hoogtemeters" value={`${Math.round(raw.elevationGain)} m`} />}
        {raw.calories > 0 && <Stat label="Calorieën" value={Math.round(raw.calories)} sub="kcal" />}
        {raw.averageHR > 0 && <Stat label="Gem. HR" value={`${Math.round(raw.averageHR)} bpm`} />}
        {raw.maxHR > 0 && <Stat label="Max HR" value={`${Math.round(raw.maxHR)} bpm`} />}
        {raw.maxTemperature && <Stat label="Temperatuur" value={`${raw.minTemperature}–${raw.maxTemperature}°C`} />}
        {teLabel && <Stat label="Training effect" value={raw.aerobicTrainingEffect?.toFixed(1)} sub={teLabel} />}
      </div>

      <RouteAndCharts workoutId={workoutId} hasPolyline={raw.hasPolyline} isRun={isRun} />

      <HRZones raw={raw} />
    </div>
  );
}

function WorkoutCard({ workout }) {
  const hasExercises = workout.exercises?.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{workout.title || "Workout"}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(workout.date + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}
            {workout.duration_minutes && ` · ${workout.duration_minutes} min`}
            {hasExercises && ` · ${workout.exercises.length} oefeningen`}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${SOURCE_COLOR[workout.source] || "bg-gray-100 text-gray-500"}`}>
          {SOURCE_LABEL[workout.source] || workout.source}
        </span>
      </div>

      {workout.source === "garmin" && <GarminStats raw={workout.raw_json} workoutId={workout.id} />}

      {workout.source === "whoop" && (
        <div className="flex flex-wrap gap-4 pt-1">
          {workout.raw_json?.score?.kilojoule > 0 && (
            <Stat label="Calorieën" value={`${Math.round(workout.raw_json.score.kilojoule / 4.184)} kcal`} />
          )}
          {workout.raw_json?.score?.average_heart_rate > 0 && (
            <Stat label="Gem. HR" value={`${Math.round(workout.raw_json.score.average_heart_rate)} bpm`} />
          )}
          {workout.raw_json?.score?.max_heart_rate > 0 && (
            <Stat label="Max HR" value={`${Math.round(workout.raw_json.score.max_heart_rate)} bpm`} />
          )}
        </div>
      )}

      {hasExercises && (
        <div className="space-y-3 pt-1">
          {(workout.exercises || []).map((ex, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-gray-700 mb-1">{ex?.title || "Oefening"}</p>
              <div className="pl-1">
                <div className="flex gap-4 text-xs text-gray-400 mb-1">
                  <span className="w-5">#</span><span>Gewicht</span><span>Reps</span>
                </div>
                {(ex?.sets || []).map((set, j) => <SetRow key={j} set={set} index={j} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkoutLog() {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toLocalISO(new Date()));

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const fetchWorkouts = () => {
    setLoading(true);
    cachedFetch(
      `${API}/api/workouts?limit=100`,
      `workouts_list`,
      (data) => { setWorkouts(data); setLoading(false); },
      (err) => { console.error(err); setLoading(false); }
    );
  };

  useEffect(() => { fetchWorkouts(); }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        fetch(`${API}/api/sync/hevy`, { method: "POST" }),
        fetch(`${API}/api/sync/garmin`, { method: "POST" }),
      ]);
      fetchWorkouts();
    } finally {
      setSyncing(false);
    }
  };

  // Priority: Hevy > Garmin > Whoop
  const hevyDates = new Set(workouts.filter((w) => w.source === "hevy").map((w) => w.date));
  const garminDates = new Set(workouts.filter((w) => w.source === "garmin").map((w) => w.date));

  const isWhoop = (w) => w.source === "whoop";
  const isStrength = (w) => STRENGTH_NAMES.has((w.raw_json?.sport_name || w.title || "").toLowerCase());

  const workoutsByDate = workouts.reduce((acc, w) => {
    // Whoop strength → skip if Hevy or Garmin exists that day
    if (isWhoop(w) && isStrength(w) && (hevyDates.has(w.date) || garminDates.has(w.date))) return acc;
    // Whoop cardio → skip if Garmin exists that day
    if (isWhoop(w) && !isStrength(w) && garminDates.has(w.date)) return acc;
    // Garmin strength → skip if Hevy exists that day
    if (w.source === "garmin" && isStrength(w) && hevyDates.has(w.date)) return acc;
    const d = w.date;
    acc[d] = acc[d] ? [...acc[d], w] : [w];
    return acc;
  }, {});

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null);
  };

  const displayedWorkouts = workoutsByDate[selectedDate] || [];

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Workouts</h1>
        <button
          onClick={syncAll} disabled={syncing}
          className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600 px-2 py-1 text-lg">‹</button>
          <span className="text-sm font-semibold text-gray-800">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600 px-2 py-1 text-lg">›</button>
        </div>
        <CalendarMonth
          year={viewYear} month={viewMonth}
          workoutsByDate={workoutsByDate}
          onDayClick={(d) => setSelectedDate(d === selectedDate ? null : d)}
          selectedDate={selectedDate}
        />
        {selectedDate && (
          <p className="text-xs text-center text-gray-400 mt-2">
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        )}
      </div>

      {/* Workout list */}
      {loading ? (
        <p className="text-center text-gray-400 py-4">Loading…</p>
      ) : displayedWorkouts.length === 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-gray-400 text-sm">Geen workouts op deze dag.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedWorkouts.map((w) => <WorkoutCard key={w.id} workout={w} />)}
        </div>
      )}
    </div>
  );
}
