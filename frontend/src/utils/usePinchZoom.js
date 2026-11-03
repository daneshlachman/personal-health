import { useCallback, useEffect, useRef, useState } from "react";

const IDENTITY = { scale: 1, x: 0, y: 0 };
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;

// Pinch to zoom, drag to pan and double-tap to zoom/reset on a container. Touch events are
// handled directly (non-passive, like Leaflet) so iOS doesn't zoom the page instead.
// Put `ref` on the container and `style` on the content inside it.
export function usePinchZoom({ min = 1, max = 5 } = {}) {
  const ref = useRef(null);
  const current = useRef(IDENTITY);
  const [t, setT] = useState(IDENTITY);

  const update = useCallback((next) => {
    const el = ref.current;
    const scale = Math.min(max, Math.max(min, next.scale));
    // Keep the content covering the container: no panning past its edges
    const maxX = el ? ((scale - 1) * el.clientWidth) / 2 : 0;
    const maxY = el ? ((scale - 1) * el.clientHeight) / 2 : 0;
    const clamped = {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
    current.current = clamped;
    setT(clamped);
  }, [min, max]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let gesture = null;
    let lastTap = 0;

    // Touch point relative to the container's center (the transform origin)
    const point = (touch) => {
      const r = el.getBoundingClientRect();
      return { x: touch.clientX - r.left - r.width / 2, y: touch.clientY - r.top - r.height / 2 };
    };
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    const begin = (touches) => {
      const start = current.current;
      if (touches.length >= 2) {
        const a = point(touches[0]);
        const b = point(touches[1]);
        gesture = { pinch: true, mid: midpoint(a, b), dist: distance(a, b), start };
      } else if (touches.length === 1) {
        gesture = { pinch: false, from: point(touches[0]), start };
      } else {
        gesture = null;
      }
    };

    const onStart = (e) => {
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < DOUBLE_TAP_MS) {
          lastTap = 0;
          gesture = null;
          const { scale, x, y } = current.current;
          if (scale > 1) return update(IDENTITY);
          // Zoom in on the tapped point
          const p = point(e.touches[0]);
          return update({ scale: DOUBLE_TAP_SCALE, x: p.x - (DOUBLE_TAP_SCALE * (p.x - x)) / scale, y: p.y - (DOUBLE_TAP_SCALE * (p.y - y)) / scale });
        }
        lastTap = now;
      }
      begin(e.touches);
    };

    const onMove = (e) => {
      if (!gesture) return;
      const { start } = gesture;
      if (gesture.pinch && e.touches.length >= 2) {
        e.preventDefault();
        const a = point(e.touches[0]);
        const b = point(e.touches[1]);
        const m = midpoint(a, b);
        const scale = Math.min(max, Math.max(min, (start.scale * distance(a, b)) / gesture.dist));
        // The content point that was under the fingers stays under them while they move
        update({
          scale,
          x: m.x - (scale * (gesture.mid.x - start.x)) / start.scale,
          y: m.y - (scale * (gesture.mid.y - start.y)) / start.scale,
        });
      } else if (!gesture.pinch && e.touches.length === 1 && start.scale > 1) {
        e.preventDefault();
        const p = point(e.touches[0]);
        update({ scale: start.scale, x: start.x + p.x - gesture.from.x, y: start.y + p.y - gesture.from.y });
      }
    };

    // Lifting one finger of a pinch continues as a pan with the other
    const onEnd = (e) => begin(e.touches);
    // iOS Safari's own page-zoom gesture
    const stopPageZoom = (e) => e.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("gesturestart", stopPageZoom);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopPageZoom);
    };
  }, [min, max, update]);

  // For +/- buttons: zoom around the center
  const zoomBy = useCallback((factor) => {
    const { scale, x, y } = current.current;
    const next = Math.min(max, Math.max(min, scale * factor));
    update({ scale: next, x: (x * next) / scale, y: (y * next) / scale });
  }, [min, max, update]);

  const reset = useCallback(() => update(IDENTITY), [update]);

  const style = {
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
    transformOrigin: "center center",
    willChange: "transform",
  };

  return { ref, style, zoomBy, reset, scale: t.scale };
}
