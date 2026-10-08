import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API } from "../utils/api";

const toLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const md = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <p className="font-semibold text-gray-900 mt-3 mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-gray-900 mt-3 mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold text-gray-900 mt-3 mb-1">{children}</p>,
};

export default function TrainingAdvice() {
  const today = toLocalISO(new Date());
  const [advice, setAdvice] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const generate = async (auto) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/workouts/recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, auto }),
      });
      const data = await res.json();
      if (data.recommendation) setAdvice(data.recommendation);
      if (data.remaining != null) setRemaining(data.remaining);
      if (!res.ok) setError(data.error || "Er ging iets mis");
    } catch {
      setError("Kon de server niet bereiken");
    } finally {
      setLoading(false);
    }
  };

  // Show today's advice; generate one automatically if there is none yet
  // (the backend caps it at 2 per day and ignores auto when one exists)
  useEffect(() => {
    fetch(`${API}/api/workouts/recommendation?date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        setRemaining(data.remaining);
        if (data.recommendation) {
          setAdvice(data.recommendation);
          setLoading(false);
        } else {
          generate(true);
        }
      })
      .catch(() => { setError("Kon de server niet bereiken"); setLoading(false); });
  }, [today]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Training advies</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Goals, recovery en workouts van 7 dagen
            {remaining != null && ` · nog ${remaining}× vandaag`}
          </p>
        </div>
        {advice && remaining > 0 && (
          <button
            onClick={() => generate(false)}
            disabled={loading}
            className="text-xs bg-brand-50 text-brand-600 border border-brand-200 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 shrink-0"
          >
            {loading ? "Denken…" : "Opnieuw"}
          </button>
        )}
      </div>

      {loading && !advice && (
        <p className="text-sm text-gray-400 mt-3">Claude bekijkt je data, dit duurt zo'n 20 seconden…</p>
      )}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      {advice && (
        <div className={`text-sm text-gray-700 mt-3 pt-3 border-t border-gray-100 ${loading ? "opacity-50" : ""}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{advice}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
