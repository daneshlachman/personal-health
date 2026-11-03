// Leeg lokaal (relatieve URLs), volle URL in productie via VITE_API_BASE_URL
export const API = import.meta.env.VITE_API_BASE_URL || "";

// The API needs a shared key. It is entered once per device and kept in localStorage;
// for local development VITE_API_KEY in frontend/.env.local works too (never in the CI build).
const KEY_STORAGE = "apiKey";

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_API_KEY || ""; } catch { return import.meta.env.VITE_API_KEY || ""; }
}

export function setApiKey(key) {
  try { localStorage.setItem(KEY_STORAGE, key.trim()); } catch { /* storage unavailable */ }
}

// For URLs the browser loads itself (images, links), which can't carry a header
export function withKey(url) {
  const key = getApiKey();
  return key ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}` : url;
}

const isApiRequest = (url) => {
  const u = typeof url === "string" ? url : url?.url || "";
  return (API ? u.startsWith(API) : u.startsWith("/")) && u.includes("/api/");
};

// Adds the key to every API request and reports a rejected key, so the app can ask again
export function installApiKeyFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    if (!isApiRequest(input)) return original(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("X-API-Key", getApiKey());
    const res = await original(input, { ...init, headers });
    if (res.status === 401) window.dispatchEvent(new Event("api-unauthorized"));
    return res;
  };
}
