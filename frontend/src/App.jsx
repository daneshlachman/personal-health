import { useEffect, useState } from "react";
import { API, getApiKey, setApiKey } from "./utils/api";
import Dashboard from "./components/Dashboard";
import NutritionLog from "./components/NutritionLog";
import Chat from "./components/Chat";
import WorkoutLog from "./components/WorkoutLog";
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "nutrition", label: "Nutrition", icon: "🥗" },
  { id: "workouts", label: "Workouts", icon: "🏋️" },
  { id: "chat", label: "Chat", icon: "💬" },
];

// Asked once per device (and again if the backend rejects the key)
function KeyPrompt({ onSaved }) {
  const [value, setValue] = useState("");
  const save = () => {
    if (!value.trim()) return;
    setApiKey(value);
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-[60] bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm p-5 w-full max-w-sm space-y-3">
        <p className="text-lg font-bold text-gray-900">API key</p>
        <p className="text-xs text-gray-400">Enter the key once on this device. It's stored only here.</p>
        <input
          autoFocus type="password" autoComplete="off" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button onClick={save} disabled={!value.trim()} className="w-full bg-brand-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  // Tapping the tab you're on goes back to its main screen (e.g. Calories → Dashboard)
  const [tabReset, setTabReset] = useState(0);
  const openTab = (id) => {
    if (id === activeTab) setTabReset((n) => n + 1);
    setActiveTab(id);
  };

  const [resumeKey, setResumeKey] = useState(0);
  const [needsKey, setNeedsKey] = useState(() => !getApiKey());

  useEffect(() => {
    const onUnauthorized = () => setNeedsKey(true);
    window.addEventListener("api-unauthorized", onUnauthorized);
    return () => window.removeEventListener("api-unauthorized", onUnauthorized);
  }, []);

  // Warmup ping — fires immediately so the container starts heating up.
  // Response is intentionally ignored; this just breaks the cold-start silence.
  useEffect(() => {
    fetch(`${API}/health`).catch(() => {});
  }, []);

  // An installed PWA on iOS resumes from the background without reloading, so mount-time
  // syncs wouldn't run again. On resume: a new day reloads the page ("today" is computed
  // at load), and after 30+ min away the active tab remounts so its sync checks run again.
  useEffect(() => {
    const loadedDay = new Date().toDateString();
    let hiddenAt = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (new Date().toDateString() !== loadedDay) {
        window.location.reload();
      } else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) {
        fetch(`${API}/health`).catch(() => {});
        setResumeKey((k) => k + 1);
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (needsKey) return <KeyPrompt onSaved={() => { setNeedsKey(false); setResumeKey((k) => k + 1); }} />;

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: "100svh" }}>
      {/* Page content */}
      <main key={resumeKey} className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <Dashboard key={tabReset} onNavigate={setActiveTab} />}
        {activeTab === "nutrition" && <NutritionLog key={tabReset} />}
        {activeTab === "workouts" && <WorkoutLog key={tabReset} />}
        {/* Always mounted, only hidden: a question still waiting for Claude keeps its
            "Thinking…" and its answer when you switch tabs in the meantime */}
        <div className={activeTab === "chat" ? "h-full" : "hidden"}>
          <Chat active={activeTab === "chat"} />
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="bg-white border-t border-gray-200 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => openTab(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-brand-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
