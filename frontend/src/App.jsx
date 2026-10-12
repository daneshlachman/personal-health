import { useEffect, useState } from "react";
import { API } from "./utils/api";
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

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const [resumeKey, setResumeKey] = useState(0);

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

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: "100svh" }}>
      {/* Page content */}
      <main key={resumeKey} className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === "nutrition" && <NutritionLog />}
        {activeTab === "workouts" && <WorkoutLog />}
        {activeTab === "chat" && <Chat />}
      </main>

      {/* Bottom tab bar */}
      <nav className="bg-white border-t border-gray-200 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
