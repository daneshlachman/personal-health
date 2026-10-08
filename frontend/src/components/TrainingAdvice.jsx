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

const INTENSITY = {
  rust: { label: "Rust", cls: "text-gray-600" },
  laag: { label: "Laag", cls: "text-green-600" },
  gemiddeld: { label: "Gemiddeld", cls: "text-amber-600" },
  hoog: { label: "Hoog", cls: "text-orange-600" },
};

function Tile({ label, children, className = "text-gray-900" }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold truncate ${className}`}>{children}</span>
    </div>
  );
}

export default function TrainingAdvice() {
  const today = toLocalISO(new Date());
  const [advice, setAdvice] = useState(null);
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(false);
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
      if (data.recommendation) { setAdvice(data.recommendation); setSummary(data.summary); }
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
          setSummary(data.summary);
          setLoading(false);
        } else {
          generate(true);
        }
      })
      .catch(() => { setError("Kon de server niet bereiken"); setLoading(false); });
  }, [today]);

  const intensity = summary && (INTENSITY[summary.intensity] || INTENSITY.gemiddeld);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Training advies</p>
        {advice && remaining > 0 && (
          <button
            onClick={() => generate(false)}
            disabled={loading}
            className="text-xs text-brand-600 px-2 py-1 rounded-lg font-medium disabled:opacity-50 shrink-0"
          >
            {loading ? "Denken…" : `Opnieuw (${remaining})`}
          </button>
        )}
      </div>

      {loading && !advice && (
        <p className="text-sm text-gray-400 mt-3">Claude bekijkt je goals, recovery en workouts…</p>
      )}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      {advice && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className={`w-full text-left mt-3 ${loading ? "opacity-50" : ""}`}
          aria-expanded={expanded}
        >
          {summary ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Tile label="Type">{summary.type}</Tile>
                <Tile label="Duur">{summary.duration_min > 0 ? `${summary.duration_min} min` : "—"}</Tile>
                <Tile label="Intensiteit" className={intensity.cls}>{intensity.label}</Tile>
              </div>
              <p className="text-sm text-gray-600 mt-3">{summary.headline}</p>
            </>
          ) : (
            !expanded && <p className="text-sm text-gray-600 line-clamp-2">{advice.replace(/[*_#>]/g, "")}</p>
          )}
          <span className="text-xs text-brand-600 font-medium mt-2 inline-block">
            {expanded ? "Verberg analyse ▴" : "Toon analyse ▾"}
          </span>
        </button>
      )}

      {advice && expanded && (
        <div className="text-sm text-gray-700 mt-3 pt-3 border-t border-gray-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{advice}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
