import test from 'node:test';import assert from 'node:assert/strict';import {getPracticeStreaks} from '../lib/practice-streak.mjs';
test('streak counts unique consecutive calendar days',()=>{assert.deepEqual(getPracticeStreaks(['2026-10-11T05:00:00Z','2026-10-10T04:00:00Z','2026-10-10T09:00:00Z','2026-10-07T03:00:00Z'],new Date('2026-10-11T12:00:00Z')),{current:2,best:2});});
test('yesterday maintains current streak, older activity does not',()=>{assert.equal(getPracticeStreaks(['2026-10-10T00:00:00Z'],new Date('2026-10-11T12:00:00Z')).current,1);assert.equal(getPracticeStreaks(['2026-10-08T00:00:00Z'],new Date('2026-10-11T12:00:00Z')).current,0);});
test('empty activity',()=>assert.deepEqual(getPracticeStreaks([]),{current:0,best:0}));
