import { useEffect, useState } from "react";
import { API, withKey } from "../utils/api";
import { cachedFetch, setCache, invalidateCachePrefix } from "../utils/cache";
import { sunTimes, useThemeSetting } from "../utils/theme";

const THEMES = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Appearance() {
  const [theme, setTheme] = useThemeSetting();
  const { sunrise, sunset } = sunTimes();
  const fmt = (d) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Appearance</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {theme === "auto"
            ? `Light from sunrise (${fmt(sunrise)}) to sunset (${fmt(sunset)}), dark otherwise`
            : `Always ${theme}`}
        </p>
      </div>
      <div className="flex bg-gray-100 rounded-xl p-1">
        {THEMES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              theme === t.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Calorie, protein and fat goals; carbs are whatever is left of the calories
function NutritionGoals() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ calorie_goal: "", protein_goal_g: "", fat_goal_g: "" });
  const [status, setStatus] = useState(null); // "saving" | "saved" | error message

  const load = (p) => {
    setProfile(p);
    setForm({
      calorie_goal: String(p.calorie_goal ?? ""),
      protein_goal_g: String(p.protein_goal_g ?? p.macro_goals?.protein_g ?? ""),
      fat_goal_g: String(p.fat_goal_g ?? p.macro_goals?.fat_g ?? ""),
    });
  };

  useEffect(() => { cachedFetch(`${API}/api/profile`, "profile", load); }, []);

  const num = (v) => parseInt(v, 10) || 0;
  const carbs = Math.max(0, Math.round((num(form.calorie_goal) - 4 * num(form.protein_goal_g) - 9 * num(form.fat_goal_g)) / 4));
  const goals = profile?.macro_goals;
  const dirty = profile && (num(form.calorie_goal) !== profile.calorie_goal
    || num(form.protein_goal_g) !== goals?.protein_g || num(form.fat_goal_g) !== goals?.fat_g);

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calorie_goal: num(form.calorie_goal),
          protein_goal_g: num(form.protein_goal_g),
          fat_goal_g: num(form.fat_goal_g),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || "Save failed"); return; }
      setCache("profile", data);
      load(data);
      setStatus("saved");
    } catch {
      setStatus("Save failed");
    }
  };

  const field = (key, label, unit) => (
    <div>
      <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input type="text" inputMode="numeric" autoComplete="off" value={form[key]}
          onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value.replace(/[^0-9]/g, "") })); setStatus(null); }}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Nutrition goals</p>
        <p className="text-xs text-gray-400 mt-0.5">Rings in Nutrition. Default protein 2 g/kg and fat 0.8 g/kg; carbs fill the rest.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field("calorie_goal", "Calories", "kcal")}
        {field("protein_goal_g", "Protein", "g")}
        {field("fat_goal_g", "Fat", "g")}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Carbs: <span className="font-semibold text-gray-900">{carbs} g</span></span>
        <button onClick={save} disabled={!dirty || status === "saving"}
          className="bg-brand-500 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40">
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {status && status !== "saving" && (
        <p className={`text-xs ${status === "saved" ? "text-green-600" : "text-red-500"}`}>{status === "saved" ? "Saved" : status}</p>
      )}
    </div>
  );
}

// Correct every burn number with what the weight trend says (Calories → reality check)
function AdaptiveBurn() {
  const [on, setOn] = useState(null);
  useEffect(() => { cachedFetch(`${API}/api/profile`, "profile", (p) => setOn(p.adaptive_tdee !== false)); }, []);
  const toggle = async () => {
    const next = !on;
    setOn(next);
    const res = await fetch(`${API}/api/profile`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adaptive_tdee: next }),
    });
    if (res.ok) {
      setCache("profile", await res.json());
      invalidateCachePrefix("tdee");
    } else {
      setOn(!next);
    }
  };
  if (on == null) return null;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Adaptive burn</p>
        <p className="text-xs text-gray-400 mt-0.5">Adjust calories burned to your weight trend, updated weekly</p>
      </div>
      <button onClick={toggle} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? "bg-brand-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Goals() {
  const [saved, setSaved] = useState("");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    cachedFetch(`${API}/api/profile`, "profile", (p) => {
      setSaved(p.goals || "");
      setInput(p.goals || "");
    });
  }, []);

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: input }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || "Save failed"); return; }
      setCache("profile", data);
      setSaved(data.goals || "");
      setStatus("saved");
    } catch {
      setStatus("Save failed");
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Goals</p>
        <p className="text-xs text-gray-400 mt-0.5">Context for the training advice in Workouts</p>
      </div>
      <textarea
        value={input}
        onChange={(e) => { setInput(e.target.value); setStatus(null); }}
        rows={5}
        maxLength={2000}
        placeholder={"Bijv.\n- Fitter worden, knieblessure aan het afbouwen\n- Cutten naar 85 kg\n- 3× per week kracht, 1–2× hardlopen"}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${status === "saved" ? "text-green-600" : "text-red-500"}`}>
          {status === "saved" ? "Saved" : status && status !== "saving" ? status : ""}
        </span>
        <button
          onClick={save}
          disabled={input === saved || status === "saving"}
          className="bg-brand-500 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function Settings({ onBack, whoopConnected, syncing, onSync, onDisconnect }) {
  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl">←</button>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      <Appearance />

      <Goals />

      <NutritionGoals />

      <AdaptiveBurn />

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Whoop</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${whoopConnected ? "bg-green-500" : "bg-gray-300"}`} />
              {whoopConnected ? "Connected" : "Not connected"}
            </p>
          </div>
          {!whoopConnected && (
            <a href={withKey(`${API}/api/whoop/authorize`)} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg font-medium">
              Connect
            </a>
          )}
        </div>

        {whoopConnected && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex-1 text-sm bg-brand-50 text-brand-600 border border-brand-200 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={onDisconnect}
              className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:text-red-500 hover:border-red-200"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
