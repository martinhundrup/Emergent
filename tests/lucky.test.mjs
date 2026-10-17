import test from 'node:test';
import assert from 'node:assert/strict';
import { luckySettingsFor, settingsFor, Simulation } from '../simulation.js';

test('Lucky samples produce active, structured worlds while preserving selected size and colors', () => {
  const current = settingsFor('soup', 1200, 42);
  current.species[0].color = '#aabbcc';
  const profiles = new Set();
  const speciesCounts = new Set(), ruleCounts = new Set();
  for (let recipe = 0; recipe < 5; recipe++) {
    for (let count = 2; count <= 6; count++) {
      let draw = 0, state = 12345 + recipe * 1729 + count * 31;
      const random = () => {
        if (draw++ === 0) return (recipe + .5) / 5;
        if (draw === 2) return (count - 2 + .5) / 5;
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      const next = luckySettingsFor(current, { count: 1200, boxSize: 60 }, recipe * 5 + count, random);
      assert.equal(next.preset, 'lucky');
      assert.equal(next.count, 1200);
      assert.equal(next.boxSize, 60);
      assert.equal(next.species.length, count);
      assert.equal(next.species[0].color, '#aabbcc');
      assert.ok(next.matrix.some(value => value > 0));
      assert.ok(next.reactions.some(rule => rule.rate > 0));
      profiles.add(next.species[0].name);
      speciesCounts.add(next.species.length);
      ruleCounts.add(next.reactions.length);

      if (count !== recipe + 2) continue;
      // Use the default density for the activity check. A larger user-selected
      // box can legitimately take longer to form encounters.
      const simulation = new Simulation({ ...next, boxSize: 48 });
      for (let step = 0; step < 300; step++) simulation.step();
      const stats = simulation.stats();
      assert.ok(stats.bonds > 10 || stats.activeFraction > .5, `${next.species[0].name} stayed gas-like`);
      assert.ok(stats.reactions > 0, `${next.species[0].name} had no conversions`);
    }
  }
  assert.equal(profiles.size, 5);
  assert.deepEqual([...speciesCounts].sort(), [2, 3, 4, 5, 6]);
  assert.ok(ruleCounts.size >= 5, 'reaction rule counts vary across samples');
});
