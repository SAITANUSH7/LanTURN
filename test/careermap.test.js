import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCareerMap, topicCovered } from '../src/ai/careerMap.js';
import { CAREER_DOMAINS } from '../src/data/careerRoadmaps.js';

test('topicCovered matches whole words only', () => {
  assert.equal(topicCovered('Docker basics', 'used docker daily', []), true);
  assert.equal(topicCovered('Java', 'javascript only', []), false);
});

test('career map builds a layered graph with next actions', () => {
  const m = buildCareerMap({ name: 'A', text: 'react and node.js apps with docker', skills: [{ id: 1, name: 'React', category: 'Frontend' }], domains: CAREER_DOMAINS, jobs: [] });
  assert.ok(m.graph.nodes.some((n) => n.type === 'you'));
  assert.ok(m.graph.edges.length > 5);
  assert.ok(m.domains[0].fit >= m.domains.at(-1).fit);
  assert.ok(m.nextActions.length > 0);
});

test('empty resume asks for input', () => {
  assert.equal(buildCareerMap({ name: 'A', text: '', skills: [], domains: CAREER_DOMAINS }).needsInput, true);
});
