const assert = require('node:assert/strict');
const { attach } = require('../src/gestures.js');
function fixture() {
  const state = { lon: 45, lat: 16, zoom: 1 };
  let taps = 0;
  const canvas = { setPointerCapture() {} };
  const g = attach(canvas, {
    getView: () => state,
    setView: (x) => Object.assign(state, x),
    onTap: () => taps++,
  });
  return { state, g, taps: () => taps };
}
const e = (id, x, y = 100) => ({ pointerId: id, clientX: x, clientY: y });
{
  const f = fixture();
  f.g.down(e(1, 100));
  f.g.up(e(1, 100));
  assert.equal(f.taps(), 1);
  f.g.down(e(1, 100));
  f.g.move(e(1, 140));
  f.g.up(e(1, 140));
  assert.equal(f.taps(), 1);
  assert.equal(f.state.lon, 45 - 40 * 0.35);
}
{
  const f = fixture();
  f.g.down(e(1, 100));
  f.g.down(e(2, 180));
  f.g.move(e(1, 60));
  f.g.move(e(2, 220));
  assert.equal(f.state.zoom, 2);
  assert.equal(f.state.lon, 45);
  assert.equal(f.state.lat, 16);
  f.g.up(e(2, 220));
  f.g.move(e(1, 80));
  assert.equal(f.state.lon, 45 - (20 * 0.35) / 2);
  f.g.up(e(1, 80));
  assert.equal(f.taps(), 0, 'Pinch release must not select a port');
}
{
  const f = fixture();
  f.g.down(e(1, 100));
  f.g.down(e(2, 180));
  f.g.move(e(2, 10000));
  assert.equal(f.state.zoom, 32);
  f.g.move(e(2, 101));
  assert.equal(f.state.zoom, 0.7);
  f.g.cancel(e(1, 100));
  f.g.up(e(2, 101));
  assert.equal(f.taps(), 0);
}
{
  const state = { lon: 45, lat: 16, zoom: 1 };
  let taps = 0;
  const canvas = {
    setPointerCapture() {
      throw new Error('Pointer already cancelled');
    },
  };
  const g = attach(canvas, {
    getView: () => state,
    setView: (x) => Object.assign(state, x),
    onTap: () => taps++,
  });
  assert.doesNotThrow(() => g.down(e(1, 100)));
  g.move(e(1, 150));
  g.up(e(1, 150));
  assert.equal(taps, 0);
  assert.equal(state.lon, 45);
  canvas.setPointerCapture = () => {};
  g.down(e(1, 100));
  g.up(e(1, 100));
  assert.equal(taps, 1);
}
console.log(
  'pointer gestures: tap, drag, pinch, limits, continuation, cancellation and capture failure passed',
);
