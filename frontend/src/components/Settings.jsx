import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { cachedFetch, setCache } from "../utils/cache";

function CalorieGoal() {
  const [saved, setSaved] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(null); // "saving" | "saved" | error message

  useEffect(() => {
    cachedFetch(`${API}/api/profile`, "profile", (p) => {
      setSaved(p.calorie_goal);
      setInput(String(p.calorie_goal ?? ""));
    });
  }, []);

  const save = async () => {
    const goal = parseInt(input, 10);
    if (!goal) return;
    setStatus("saving");
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calorie_goal: goal }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || "Save failed"); return; }
      setCache("profile", data);
      setSaved(data.calorie_goal);
      setStatus("saved");
    } catch {
      setStatus("Save failed");
    }
  };

  const dirty = input !== "" && parseInt(input, 10) !== saved;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">Daily calorie goal</p>
        <p className="text-xs text-gray-400 mt-0.5">Used for the calorie ring in Nutrition</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={input}
          onChange={(e) => { setInput(e.target.value.replace(/[^0-9]/g, "")); setStatus(null); }}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-500">kcal</span>
        <button
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="bg-brand-500 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {status && status !== "saving" && (
        <p className={`text-xs ${status === "saved" ? "text-green-600" : "text-red-500"}`}>
          {status === "saved" ? "Saved" : status}
        </p>
      )}
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

      <CalorieGoal />

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
            <a href={`${API}/api/whoop/authorize`} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg font-medium">
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
