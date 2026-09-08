const assert = require('node:assert/strict');
const D = require('../src/discovery.js');
const places = [
  { id: 'a', name: 'Singapore' },
  { id: 'b', name: 'Other' },
];
assert.equal(D.landing(places), 'a');
assert.equal(D.landing(places.slice(1)), 'b');
const pool = D.candidates(
  [{ id: 'e', places: ['a'] }],
  [
    { id: 's', place: 'b', qualifies: true },
    { id: 'old', place: 'a', qualifies: false },
  ],
  places,
);
assert.equal(pool.length, 2);
assert.deepEqual(
  pool.map((e) => e.key),
  ['event:e', 'shift:s'],
);
assert.deepEqual(D.candidates([{ id: 'empty', places: [] }], [], places), []);
assert.equal(D.pick(pool, 'event:e', () => 0).id, 's');
assert.equal(D.pick(pool, 'shift:s', () => 0.99).id, 'e');
assert.equal(D.pick([], null), null);
assert.equal(D.pick(pool.slice(0, 1), 'event:e', () => 0).id, 'e');
assert.equal(D.candidates([{ id: 'bad', places: ['missing'] }], [], places).length, 0);
console.log('discovery selection: ok');
