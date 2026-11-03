// Light/dark theme: "auto" follows sunrise/sunset in Amsterdam, or a fixed choice.
// The choice is a per-device preference, so it lives in localStorage.
import { useEffect, useState } from "react";

const KEY = "theme";
const LAT = 52.37;
const LON = 4.9;
const RAD = Math.PI / 180;

export function getThemeSetting() {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}

export function setThemeSetting(value) {
  try { localStorage.setItem(KEY, value); } catch { /* storage unavailable */ }
  applyTheme();
}

// Sunrise and sunset for a date (NOAA sunrise equation, ~1 min accurate), as Date objects
export function sunTimes(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const g = (2 * Math.PI / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl))
    - Math.tan(LAT * RAD) * Math.tan(decl)) / RAD;
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const at = (minutes) => new Date(utcMidnight + minutes * 60000);
  return { sunrise: at(720 - 4 * (LON + ha) - eqTime), sunset: at(720 - 4 * (LON - ha) - eqTime) };
}

export function resolvedTheme(setting = getThemeSetting(), now = new Date()) {
  if (setting === "light" || setting === "dark") return setting;
  const { sunrise, sunset } = sunTimes(now);
  return now >= sunrise && now < sunset ? "light" : "dark";
}

export function applyTheme() {
  const dark = resolvedTheme() === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#0ea5e9");
}

// Re-check every minute and when the app comes back to the foreground
export function startThemeWatcher() {
  applyTheme();
  setInterval(applyTheme, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) applyTheme(); });
}

export function useThemeSetting() {
  const [setting, setSetting] = useState(getThemeSetting);
  useEffect(() => { applyTheme(); }, [setting]);
  return [setting, (v) => { setThemeSetting(v); setSetting(v); }];
}
