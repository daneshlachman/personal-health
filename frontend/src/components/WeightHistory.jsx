import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { API } from "../utils/api";
import { invalidateCachePrefix } from "../utils/cache";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";

const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "2M", days: 60 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All time", days: 3650 },
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatXTick(dateStr, days) {
  const [m, d] = dateStr.split("-").map(Number);
  const mon = MONTH_NAMES[m - 1];
  if (days <= 30) return `${d} ${mon}`;
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

function KPI({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">{label}</span>
      <span className="text-lg font-bold text-gray-900" style={color ? { color } : {}}>
        {value ?? "—"}
      </span>
      {sub && <span className="text-[10px] text-gray-400 block mt-0.5">{sub}</span>}
    </div>
  );
}

function compressImage(file, maxPx = 1800, quality = 0.88) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

const todayISO = new Date().toISOString().slice(0, 10);

function WeightModal({ entry, onClose, onSaved }) {
  const isNew = !entry;
  const [kg, setKg] = useState(entry ? String(entry.weight_kg) : "");
  const [date, setDate] = useState(entry ? entry.date : todayISO);
  const [photo, setPhoto] = useState(entry?.photo_data || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const pickPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto(await compressImage(file));
  };

  const save = () => {
    const w = parseFloat(kg);
    if (!w) return;
    setSaving(true);
    const url = isNew ? `${API}/api/weight` : `${API}/api/weight/${entry.id}`;
    const method = isNew ? "POST" : "PUT";
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight_kg: w, date, photo_data: photo }),
    })
      .then(r => r.json())
      .then(result => { onSaved(result, isNew); onClose(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-xl p-5 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{isNew ? "Add entry" : "Edit entry"}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Weight (kg)</label>
            <input
              autoFocus type="number" step="0.1" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Date</label>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-2 block">Photo (optional)</label>
          {photo ? (
            <div className="relative w-full rounded-xl overflow-hidden" style={{ maxHeight: 200 }}>
              <img src={photo} alt="weight" className="w-full object-cover rounded-xl" style={{ maxHeight: 200 }} />
              <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 w-7 h-7 bg-white/80 rounded-full flex items-center justify-center text-gray-600 text-sm">×</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-sm text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors">
              + Add photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        </div>

        <button onClick={save} disabled={saving || !kg} className="w-full bg-brand-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PhotoModal({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-end px-4 pt-12 pb-2 shrink-0">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white text-xl">×</button>
      </div>
      <TransformWrapper minScale={1} maxScale={5} centerOnInit>
        {({ zoomIn, zoomOut }) => (
          <>
            <TransformComponent wrapperStyle={{ flex: 1, width: "100%" }}
              contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} />
            </TransformComponent>
            <div className="flex justify-center gap-6 py-4 shrink-0">
              <button onClick={() => zoomOut()} className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-2xl font-bold">−</button>
              <button onClick={() => zoomIn()} className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-2xl font-bold">+</button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function CompareScreen({ allPhotos, initialA, initialB, onClose }) {
  const [left, setLeft] = useState(initialA);
  const [right, setRight] = useState(initialB);
  const [activeSide, setActiveSide] = useState("right");
  const [leftScale, setLeftScale] = useState(1);
  const [rightScale, setRightScale] = useState(1);

  const fmtDate = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const pickThumb = (p) => {
    if (activeSide === "left") setLeft(p);
    else setRight(p);
  };

  const diff = right && left ? (right.weight_kg - left.weight_kg).toFixed(1) : null;
  const diffColor = diff < 0 ? "#22c55e" : diff > 0 ? "#ef4444" : "#9ca3af";

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ touchAction: "none" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-lg">←</button>
        <span className="text-sm font-semibold text-gray-800">Progress</span>
        <div className="w-9" />
      </div>

      {/* Photos */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden relative bg-gray-50" onClick={() => setActiveSide("left")}>
            <img src={left.photo_data} alt="" className="w-full h-full object-contain"
              style={{ transform: `scale(${leftScale})`, transformOrigin: "center center", transition: "transform 0.2s" }} />
            <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white">BEFORE</div>
          </div>
          <div className="flex justify-center items-center gap-4 py-2 bg-white border-t border-gray-100 shrink-0">
            <button onClick={() => setLeftScale(s => Math.max(1, +(s - 0.5).toFixed(1)))} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xl font-bold leading-none">−</button>
            <button onClick={() => setLeftScale(s => Math.min(4, +(s + 0.5).toFixed(1)))} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xl font-bold leading-none">+</button>
          </div>
        </div>
        <div className="w-px bg-gray-200 shrink-0" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden relative bg-gray-50" onClick={() => setActiveSide("right")}>
            <img src={right.photo_data} alt="" className="w-full h-full object-contain"
              style={{ transform: `scale(${rightScale})`, transformOrigin: "center center", transition: "transform 0.2s" }} />
            <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white">AFTER</div>
          </div>
          <div className="flex justify-center items-center gap-4 py-2 bg-white border-t border-gray-100 shrink-0">
            <button onClick={() => setRightScale(s => Math.max(1, +(s - 0.5).toFixed(1)))} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xl font-bold leading-none">−</button>
            <button onClick={() => setRightScale(s => Math.min(4, +(s + 0.5).toFixed(1)))} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xl font-bold leading-none">+</button>
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex px-4 pt-3 pb-1 shrink-0">
        <div className="flex-1 text-center">
          <p className="text-xl font-bold text-gray-900">{left.weight_kg} kg</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(left.date)}</p>
        </div>
        {diff !== null && (
          <div className="flex flex-col items-center justify-center px-3">
            <p className="text-base font-bold" style={{ color: diffColor }}>
              {diff > 0 ? "+" : ""}{diff} kg
            </p>
          </div>
        )}
        <div className="flex-1 text-center">
          <p className="text-xl font-bold text-gray-900">{right.weight_kg} kg</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(right.date)}</p>
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="border-t border-gray-100 bg-gray-50 shrink-0">
        <div className="flex gap-2 px-3 py-3 overflow-x-auto">
          {allPhotos.map(p => {
            const isLeft = left?.id === p.id;
            const isRight = right?.id === p.id;
            const active = isLeft || isRight;
            return (
              <button key={p.id} onClick={() => pickThumb(p)}
                className="shrink-0 relative rounded-lg overflow-hidden transition-all"
                style={{ width: 64, height: 64, opacity: active ? 1 : 0.6 }}>
                <img src={p.photo_data} alt="" className="w-full h-full object-cover" />
                {active && <div className="absolute inset-0 ring-2 ring-white ring-inset rounded-lg" />}
                <div className="absolute bottom-0 inset-x-0 bg-black/50 py-0.5 text-center">
                  <p className="text-white text-[9px] font-bold leading-none">{p.weight_kg}kg</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WeightHistory({ onBack }) {
  const [days, setDays] = useState(7);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalEntry, setModalEntry] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [photoSrc, setPhotoSrc] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);

  const fetchData = () => {
    setLoading(true);
    fetch(`${API}/api/weight?days=${days}`)
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [days]);

  const data = rows.map(r => ({ date: r.date.slice(5), kg: r.weight_kg }));

  const handleDelete = (id) => {
    fetch(`${API}/api/weight/${id}`, { method: "DELETE" })
      .then(() => {
        setRows(prev => prev.filter(r => r.id !== id));
        invalidateCachePrefix("weight-");
      })
      .catch(console.error);
  };

  const handleSaved = (result, isNew) => {
    if (isNew) setRows(prev => [...prev, result]);
    else setRows(prev => prev.map(r => r.id === result.id ? result : r));
    invalidateCachePrefix("weight-");
  };

  const kgs = data.map(d => d.kg).filter(v => v != null);
  const latest = kgs[kgs.length - 1];
  const first = kgs[0];
  const change = latest != null && first != null ? +(latest - first).toFixed(1) : null;
  const changePct = change != null && first ? +((change / first) * 100).toFixed(1) : null;
  const minW = kgs.length ? Math.min(...kgs) : null;
  const maxW = kgs.length ? Math.max(...kgs) : null;
  const avg = kgs.length ? +(kgs.reduce((a, b) => a + b, 0) / kgs.length).toFixed(1) : null;

  const changeColor = change == null ? undefined : change < 0 ? "#22c55e" : change > 0 ? "#ef4444" : undefined;

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <h1 className="text-xl font-bold text-gray-900 flex-1">Weight</h1>
        <div className="relative">
          <button
            onClick={() => setPeriodOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand-500 text-white px-3 py-1.5 rounded-lg"
          >
            {PERIODS.find(p => p.days === days)?.label ?? "1W"}
            <span className="text-[10px] opacity-75">▾</span>
          </button>
          {periodOpen && (
            <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[90px]">
              {PERIODS.map(({ label, days: d }) => (
                <button key={d} onClick={() => { setDays(d); setPeriodOpen(false); }}
                  className={`w-full text-left px-4 py-1.5 text-sm hover:bg-gray-50 transition-colors ${days === d ? "text-brand-500 font-semibold" : "text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Current" value={latest ? `${latest} kg` : null} />
        <KPI
          label={`Change (${PERIODS.find(p => p.days === days)?.label})`}
          value={change != null ? `${change > 0 ? "+" : ""}${change} kg` : null}
          sub={changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}%` : null}
          color={changeColor}
        />
        <KPI label="Lowest" value={minW ? `${minW} kg` : null} />
        <KPI label="Highest" value={maxW ? `${maxW} kg` : null} />
        <KPI label="Average" value={avg ? `${avg} kg` : null} />
        <KPI label="Entries" value={kgs.length || null} sub="logged" />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No data for this period.</p>
        ) : (() => {
          const rangeKg = Math.max(...kgs) - Math.min(...kgs);
          const step = rangeKg <= 2 ? 0.5 : rangeKg <= 5 ? 1 : rangeKg <= 10 ? 2 : 2.5;
          const minT = Math.floor(Math.min(...kgs) / step) * step;
          const maxT = Math.ceil(Math.max(...kgs) / step) * step;
          const yTicks = [];
          for (let t = minT; t <= maxT + 0.01; t += step) yTicks.push(Math.round(t * 10) / 10);
          return (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={d => formatXTick(d, days)}
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
              {avg && <ReferenceLine y={avg} stroke="#0ea5e9" strokeDasharray="4 4" strokeOpacity={0.3} />}
              <Line type="monotone" dataKey="kg" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, fill: "#0ea5e9", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
          );
        })()}
      </div>

      {/* Photo gallery */}
      {(() => {
        const photos = [...rows].reverse().filter(r => r.photo_data);
        if (photos.length === 0) return null;
        const handlePhotoTap = (r) => {
          if (!compareA) { setCompareA(r); return; }
          if (compareA.id === r.id) { setCompareA(null); return; }
          setCompareB(r);
          setCompareOpen(true);
        };
        return (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {compareA ? "Tap a second photo to compare" : "Photos · tap 2 to compare"}
              </span>
              {compareA && (
                <button onClick={() => setCompareA(null)} className="text-xs text-gray-400">Cancel</button>
              )}
            </div>
            <div className="flex gap-2 px-3 py-3 overflow-x-auto">
              {photos.map(r => {
                const isA = compareA?.id === r.id;
                return (
                  <button key={r.id} onClick={() => handlePhotoTap(r)}
                    className="relative rounded-xl overflow-hidden shrink-0"
                    style={{ width: 110, height: 110 }}
                  >
                    <img src={r.photo_data} alt=""
                      className="w-full h-full object-contain" />
                    {isA && <div className="absolute inset-0 bg-brand-500/25 ring-2 ring-brand-500 ring-inset rounded-xl" />}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 py-1 px-1.5 rounded-b-xl">
                      <p className="text-white text-[10px] font-bold leading-none">{r.weight_kg} kg</p>
                      <p className="text-white/70 text-[9px] leading-none mt-0.5">
                        {(() => { const [,m,d] = r.date.split("-").map(Number); return `${d} ${MONTH_NAMES[m-1]}`; })()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Log list */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Entries</span>
            <button onClick={() => setModalEntry(null)} className="w-6 h-6 flex items-center justify-center rounded-full bg-brand-500 text-white text-base leading-none hover:bg-brand-600 transition-colors">+</button>
          </div>
          <ul className="divide-y divide-gray-50">
            {[...rows].reverse().map(r => {
              const [, m, d] = r.date.split("-").map(Number);
              const label = `${d} ${MONTH_NAMES[m - 1]}`;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  {r.photo_data ? (
                    <button onClick={() => setPhotoSrc(r.photo_data)} className="shrink-0">
                      <img src={r.photo_data} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg shrink-0">⚖</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{r.weight_kg} kg</p>
                    <p className="text-xs text-gray-400">{label} · {r.source || "manual"}</p>
                  </div>
                  <button onClick={() => setModalEntry(r)} className="text-gray-300 hover:text-brand-500 text-sm px-1">✎</button>
                  <button onClick={() => handleDelete(r.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {modalEntry !== undefined && <WeightModal entry={modalEntry} onClose={() => setModalEntry(undefined)} onSaved={handleSaved} />}
      {photoSrc && <PhotoModal src={photoSrc} onClose={() => setPhotoSrc(null)} />}
      {compareOpen && compareA && compareB && (
        <CompareScreen
          allPhotos={[...rows].reverse().filter(r => r.photo_data)}
          initialA={compareA}
          initialB={compareB}
          onClose={() => { setCompareOpen(false); setCompareA(null); setCompareB(null); }}
        />
      )}
    </div>
  );
}
