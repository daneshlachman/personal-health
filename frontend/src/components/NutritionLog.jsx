import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { cachedFetch, setCache } from "../utils/cache";
import { searchCommon } from "../utils/commonFoods";

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
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg font-bold">‹</button>
          <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
          <button onClick={nextMonth} disabled={viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth >= today.getMonth())} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-lg font-bold disabled:opacity-30">›</button>
        </div>
        <div className="grid grid-cols-7 mb-1">{days.map(d => <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array(startOffset).fill(null).map((_, i) => <div key={`e${i}`} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1;
            const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isFuture = iso > todayISO;
            return (
              <button key={day} disabled={isFuture} onClick={() => { onSelect(iso); onClose(); }}
                className={`text-xs py-1.5 rounded-lg font-medium transition-colors ${iso === selected ? "bg-brand-500 text-white" : iso === todayISO ? "bg-brand-50 text-brand-600 font-bold" : isFuture ? "text-gray-200" : "text-gray-700 hover:bg-gray-100"}`}>
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const GOALS = { calories: 2400, protein_g: 180, carbs_g: 240, fat_g: 80 };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

function FoodSearchModal({ meal, date, onClose, onSaved }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [grams, setGrams] = useState("100");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }

    const local = searchCommon(query);
    setResults(local);

    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`${API}/api/food/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => {
          const localNames = new Set(local.map((f) => f.product_name));
          const remote = data.filter((f) => !localNames.has(f.name));
          setResults([...local, ...remote]);
        })
        .catch(console.error)
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const g = parseFloat(grams) || 0;
  const factor = g / 100;
  // Support both local NEVO format and FatSecret format
  const cal100 = selected?.calories_100g ?? selected?.nutriments?.["energy-kcal_100g"] ?? 0;
  const pro100 = selected?.protein_100g ?? selected?.nutriments?.proteins_100g ?? 0;
  const carb100 = selected?.carbs_100g ?? selected?.nutriments?.carbohydrates_100g ?? 0;
  const fat100 = selected?.fat_100g ?? selected?.nutriments?.fat_100g ?? 0;
  const calories = Math.round(cal100 * factor);
  const protein = Math.round(pro100 * factor * 10) / 10;
  const carbs = Math.round(carb100 * factor * 10) / 10;
  const fat = Math.round(fat100 * factor * 10) / 10;

  const save = () => {
    if (!selected || !g) return;
    setSaving(true);
    const name = selected.name || selected.product_name || "";
    const brand = selected.brand || selected.brands?.split(",")[0].trim() || "";
    const description = `${name}${brand ? ` (${brand})` : ""} ${g}g`;
    fetch(`${API}/api/nutrition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, meal_type: meal, description, calories, protein_g: protein, carbs_g: carbs, fat_g: fat }),
    })
      .then((r) => r.json())
      .then((entry) => { onSaved(entry); onClose(); })
      .catch(console.error)
      .finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg shadow-xl p-4 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Add to {MEAL_LABELS[meal]}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {!selected ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search food…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {searching && <p className="text-xs text-gray-400 mt-3 text-center">Searching…</p>}
            {!searching && query.length >= 2 && results.length === 0 && (
              <p className="text-xs text-gray-400 mt-3 text-center">No results found.</p>
            )}
            <ul className="mt-2 space-y-0.5 max-h-72 overflow-y-auto">
              {results.map((p, i) => (
                <li key={i}>
                  <button
                    onClick={() => { setSelected(p); setGrams("100"); }}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-800 leading-tight">{p.name || p.product_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(p.brand || p.brands?.split(",")[0].trim()) && `${p.brand || p.brands.split(",")[0].trim()} · `}
                      {Math.round(p.calories_100g ?? p.nutriments?.["energy-kcal_100g"] ?? 0)} kcal / 100g
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <button onClick={() => setSelected(null)} className="text-xs text-brand-500 mb-3 flex items-center gap-1">
              ‹ Back
            </button>
            <p className="text-sm font-semibold text-gray-800 mb-4 leading-tight">{selected.name || selected.product_name}</p>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-gray-600">Amount</span>
              <input
                autoFocus
                type="number"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-base text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-400">g</span>
            </div>

            <div className="flex gap-2 mb-5 bg-gray-50 rounded-xl p-3">
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-gray-900">{calories}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">kcal</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-blue-500">{protein}g</p>
                <p className="text-[10px] text-gray-400 mt-0.5">protein</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-amber-500">{carbs}g</p>
                <p className="text-[10px] text-gray-400 mt-0.5">carbs</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-rose-500">{fat}g</p>
                <p className="text-[10px] text-gray-400 mt-0.5">fat</p>
              </div>
            </div>

            <button
              onClick={save}
              disabled={saving || !g}
              className="w-full bg-brand-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-brand-600 transition-colors"
            >
              {saving ? "Saving…" : `Add to ${MEAL_LABELS[meal]}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Ring({ value, goal, label, color, size = 80, showPct = true, unit = "" }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / goal, 1);
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ display: "block" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-gray-900 leading-none">
            {Math.round(value)}{showPct ? <span className="text-[9px] font-normal text-gray-400 ml-0.5">%</span> : unit ? <span className="text-[9px] font-normal text-gray-400 ml-0.5">{unit}</span> : null}
          </span>
        </div>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function MealSection({ meal, entries, onDelete, onAdd }) {
  const total = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein_g: acc.protein_g + (e.protein_g || 0),
      carbs_g: acc.carbs_g + (e.carbs_g || 0),
      fat_g: acc.fat_g + (e.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {MEAL_LABELS[meal] || meal}
        </span>
        <div className="flex items-center gap-2">
          {entries.length > 0 && <span className="text-xs text-gray-400">{Math.round(total.calories)} kcal</span>}
          <button
            onClick={onAdd}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-500 text-white text-lg leading-none hover:bg-brand-600 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-300">Nothing logged yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{entry.description}</p>
                <div className="flex gap-3 mt-0.5">
                  <span className="text-xs font-medium text-gray-600">{Math.round(entry.calories ?? 0)} kcal</span>
                  <span className="text-xs text-blue-500">P {Math.round(entry.protein_g ?? 0)}g</span>
                  <span className="text-xs text-amber-500">C {Math.round(entry.carbs_g ?? 0)}g</span>
                  <span className="text-xs text-rose-500">F {Math.round(entry.fat_g ?? 0)}g</span>
                </div>
              </div>
              <button
                onClick={() => onDelete(entry.id)}
                className="text-gray-300 hover:text-red-400 text-base leading-none mt-1 shrink-0"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 1 && (
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex gap-4">
          <span className="text-xs font-semibold text-gray-700">Total</span>
          <span className="text-xs font-semibold text-gray-700">{Math.round(total.calories)} kcal</span>
          <span className="text-xs text-blue-600 font-medium">P {Math.round(total.protein_g)}g</span>
          <span className="text-xs text-amber-600 font-medium">C {Math.round(total.carbs_g)}g</span>
          <span className="text-xs text-rose-600 font-medium">F {Math.round(total.fat_g)}g</span>
        </div>
      )}
    </div>
  );
}

export default function NutritionLog() {
  const [logs, setLogs] = useState([]);
  const [date, setDate] = useState(todayISO);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showKcal, setShowKcal] = useState(null);
  const [addingTo, setAddingTo] = useState(null); // meal type or null

  const toggleMacro = (macro) => setShowKcal(prev => prev === macro ? null : macro);

  const prevDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(toLocalISO(d)); };
  const nextDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(toLocalISO(d)); };

  const fetchLogs = (d) => {
    setLoading(true);
    cachedFetch(
      `${API}/api/nutrition?date=${d}`,
      `nutrition_${d}`,
      (data) => { setLogs(data); setLoading(false); },
      (err) => { console.error(err); setLoading(false); }
    );
  };

  useEffect(() => { fetchLogs(date); }, [date]);

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories || 0),
      protein_g: acc.protein_g + (l.protein_g || 0),
      carbs_g: acc.carbs_g + (l.carbs_g || 0),
      fat_g: acc.fat_g + (l.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const byMeal = MEAL_ORDER.reduce((acc, meal) => {
    acc[meal] = logs.filter((l) => l.meal_type === meal);
    return acc;
  }, {});

  const handleDelete = (id) => {
    fetch(`${API}/api/nutrition/${id}`, { method: "DELETE" })
      .then(() => setLogs((prev) => {
        const updated = prev.filter((l) => l.id !== id);
        setCache(`nutrition_${date}`, updated);
        return updated;
      }))
      .catch(console.error);
  };

  const handleSaved = (entry) => {
    setLogs((prev) => {
      const updated = [...prev, entry];
      setCache(`nutrition_${date}`, updated);
      return updated;
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={prevDay} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-2xl font-light">‹</button>
        <button onClick={() => setCalendarOpen(true)} className="flex flex-col items-center">
          <h1 className="text-xl font-bold text-gray-900">{dateLabel(date)}</h1>
          {date !== todayISO && <span className="text-xs text-gray-400">{new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
        </button>
        <button onClick={nextDay} disabled={date >= todayISO} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-2xl font-light disabled:opacity-0">›</button>
      </div>
      {calendarOpen && <MiniCalendar selected={date} onSelect={setDate} onClose={() => setCalendarOpen(false)} />}

      {/* Calorie + macros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-4">
        {/* Big calorie ring */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative" style={{ width: 120, height: 120 }}>
            <svg width={120} height={120} className="-rotate-90" style={{ display: "block" }}>
              <circle cx={60} cy={60} r={52} fill="none" stroke="#f0f0f0" strokeWidth={10} />
              <circle cx={60} cy={60} r={52} fill="none" stroke="#0ea5e9" strokeWidth={10}
                strokeDasharray={`${Math.min(totals.calories / GOALS.calories, 1) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                strokeLinecap="round" style={{ transition: "stroke-dasharray 0.4s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900 leading-none">{Math.round(totals.calories)}</span>
              <span className="text-xs text-gray-400 mt-0.5">kcal</span>
              <span className="text-[10px] text-gray-300 leading-none">of {GOALS.calories}</span>
            </div>
          </div>
        </div>

        {/* Macro rings row */}
        <div className="flex justify-around w-full">
          <div onClick={() => toggleMacro("protein")} className="cursor-pointer">
            <Ring
              value={showKcal === "protein" ? Math.round(totals.protein_g * 4) : totals.protein_g}
              goal={showKcal === "protein" ? GOALS.protein_g * 4 : GOALS.protein_g}
              label={showKcal === "protein" ? "Protein kcal" : "Protein"}
              color="#60a5fa" size={76} showPct={false} unit={showKcal === "protein" ? "kcal" : "g"}
            />
          </div>
          <div onClick={() => toggleMacro("carbs")} className="cursor-pointer">
            <Ring
              value={showKcal === "carbs" ? Math.round(totals.carbs_g * 4) : totals.carbs_g}
              goal={showKcal === "carbs" ? GOALS.carbs_g * 4 : GOALS.carbs_g}
              label={showKcal === "carbs" ? "Carbs kcal" : "Carbs"}
              color="#fbbf24" size={76} showPct={false} unit={showKcal === "carbs" ? "kcal" : "g"}
            />
          </div>
          <div onClick={() => toggleMacro("fat")} className="cursor-pointer">
            <Ring
              value={showKcal === "fat" ? Math.round(totals.fat_g * 9) : totals.fat_g}
              goal={showKcal === "fat" ? GOALS.fat_g * 9 : GOALS.fat_g}
              label={showKcal === "fat" ? "Fat kcal" : "Fat"}
              color="#fb7185" size={76} showPct={false} unit={showKcal === "fat" ? "kcal" : "g"}
            />
          </div>
        </div>
      </div>

      {/* Meals */}
      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading…</p>
      ) : (
        MEAL_ORDER.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={byMeal[meal]}
            onDelete={handleDelete}
            onAdd={() => setAddingTo(meal)}
          />
        ))
      )}

      {addingTo && (
        <FoodSearchModal
          meal={addingTo}
          date={date}
          onClose={() => setAddingTo(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
