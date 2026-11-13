import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API } from "../utils/api";
import { cachedFetch, setCache } from "../utils/cache";

function cleanReply(text) {
  return text
    .replace(/```(?:json)?\s*\[[\s\S]*?"log_nutrition"[\s\S]*?\]\s*```/g, "")
    .replace(/```(?:json)?\s*\{[\s\S]*?"log_nutrition"[\s\S]*?\}\s*```/g, "")
    .replace(/\[[\s\S]*?"log_nutrition"[\s\S]*?\]/g, "")
    .replace(/\{[^{}]*"log_nutrition"\s*:\s*true[^{}]*\}/g, "")
    .trim();
}

function Message({ role, content, nutritionLogged }) {
  const isUser = role === "user";
  const display = isUser ? content : cleanReply(content);

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-brand-500 text-white rounded-br-sm"
            : "bg-white text-gray-800 shadow-sm rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{display}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-sm">{children}</li>,
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="min-w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-200 px-3 py-1.5 text-gray-600">{children}</td>
              ),
              tr: ({ children }) => <tr className="even:bg-gray-50">{children}</tr>,
              code: ({ inline, children }) =>
                inline ? (
                  <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs font-mono">
                    {children}
                  </code>
                ) : (
                  <pre className="bg-gray-100 rounded-lg p-3 overflow-x-auto my-2">
                    <code className="text-xs font-mono text-gray-800">{children}</code>
                  </pre>
                ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 my-2">
                  {children}
                </blockquote>
              ),
            }}
          >
            {display}
          </ReactMarkdown>
        )}
      </div>
      {nutritionLogged && (
        <span className="text-xs text-green-600 mt-1 px-1">✓ Logged in Nutrition</span>
      )}
    </div>
  );
}

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

export default function Chat({ active = true }) {
  const [date, setDate] = useState(todayISO);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const bottomRef = useRef(null);
  const isToday = date === todayISO;

  useEffect(() => {
    cachedFetch(
      `${API}/api/chat/history?date=${date}`,
      `chat_history_${date}`,
      setMessages,
      console.error
    );
  }, [date]);

  const prevDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(toLocalISO(d));
  };

  const nextDay = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    setDate(toLocalISO(d));
  };

  // Stays mounted while hidden (App), so scroll down again when the tab is opened
  useEffect(() => {
    if (active) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, active]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || sendingRef.current) return;
    sendingRef.current = true;

    setInput("");
    setSending(true);
    setMessages((prev) => {
      const updated = [...prev, { role: "user", content: text, id: Date.now() }];
      setCache(`chat_history_${date}`, updated);
      return updated;
    });

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, date }),
      });
      const data = await res.json();
      setMessages((prev) => {
        const updated = [
          ...prev,
          {
            role: "assistant",
            content: data.message,
            nutritionLogged: data.nutrition_logged,
            id: Date.now() + 1,
          },
        ];
        setCache(`chat_history_${date}`, updated);
        return updated;
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          id: Date.now() + 1,
        },
      ]);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto">
      {/* Date nav */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white">
        <button onClick={prevDay} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">‹</button>
        <span className="text-sm font-semibold text-gray-700">{dateLabel(date)}</span>
        <button
          onClick={nextDay}
          disabled={isToday}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg disabled:opacity-0"
        >›</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-16">
            <p className="text-3xl mb-3">💬</p>
            {isToday ? (
              <>
                <p className="font-medium text-gray-500">Chat with your health coach.</p>
                <p className="mt-2">Tell Claude what you ate, how you feel,</p>
                <p>or ask anything about your data.</p>
              </>
            ) : (
              <p className="font-medium text-gray-500">No messages on {dateLabel(date)}.</p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={m.id ?? i} role={m.role} content={m.content} nutritionLogged={m.nutritionLogged} />
        ))}
        {sending && (
          <div className="flex justify-start mb-3">
            <div className="bg-white shadow-sm rounded-2xl rounded-bl-sm px-4 py-2.5 text-gray-400 text-sm">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-100 bg-white px-4 py-3 flex gap-2">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question…"
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          style={{ maxHeight: "120px" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="bg-brand-500 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-brand-600 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
