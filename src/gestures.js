/* Pointer input only: data, rendering and page zoom remain separate. */
(function (root) {
  const clampZoom = (value) => Math.min(32, Math.max(0.7, value));
  function attach(canvas, { getView, setView, onTap }) {
    const pointers = new Map();
    let drag = null,
      pinch = null;
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    function down(e) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const view = getView();
      if (pointers.size === 1)
        drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat, moved: false };
      else if (pointers.size === 2) {
        pinch = { distance: Math.max(1, distance()), zoom: view.zoom };
        drag = null;
      }
    }
    function move(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2 && pinch) {
        setView({ zoom: clampZoom((pinch.zoom * distance()) / pinch.distance) });
        return;
      }
      if (!drag) return;
      const view = getView(),
        dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
      setView({
        lon: drag.lon - (dx * 0.35) / view.zoom,
        lat: Math.max(-80, Math.min(80, drag.lat + (dy * 0.3) / view.zoom)),
      });
    }
    function finish(e, cancelled = false) {
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      if (!cancelled && wasSingle && drag && !drag.moved) onTap(e);
      pointers.delete(e.pointerId);
      pinch = null;
      drag = null;
      // A remaining finger continues dragging without a jump or a synthetic tap.
      if (pointers.size === 1) {
        const p = [...pointers.values()][0],
          view = getView();
        drag = { x: p.x, y: p.y, lon: view.lon, lat: view.lat, moved: true };
      } else if (pointers.size >= 2)
        pinch = { distance: Math.max(1, distance()), zoom: getView().zoom };
    }
    canvas.onpointerdown = down;
    canvas.onpointermove = move;
    canvas.onpointerup = (e) => finish(e);
    canvas.onpointercancel = (e) => finish(e, true);
    return { down, move, up: (e) => finish(e), cancel: (e) => finish(e, true) };
  }
  if (typeof module !== 'undefined') module.exports = { attach, clampZoom };
  else root.PassageGestures = { attach, clampZoom };
})(typeof window !== 'undefined' ? window : globalThis);
