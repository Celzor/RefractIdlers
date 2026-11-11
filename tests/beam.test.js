import test from 'node:test';
import assert from 'node:assert/strict';
import { LINES, MACHINE_LINES, GARDEN_LINES, EVENTS, pickLine } from '../src/beam.js';

const pools=()=>Object.entries({...LINES,...MACHINE_LINES,...GARDEN_LINES}).map(([key,pool])=>[key,Array.isArray(pool)?pool:[pool]]);
/** A deterministic stand-in for Math.random that walks a fixed sequence. */
const sequence=(values)=>{let i=0;return()=>values[i++%values.length];};

test('every reaction has dialogue and every line fits the companion panel',()=>{
  for(const type of Object.keys(EVENTS).filter(type=>type!=='machine'))assert.ok(LINES[type],`${type} has lines`);
  for(const key of ['idle','coop','scoreboard','restday','restnight','fed','cooked'])assert.ok(LINES[key].length>=5,`${key} has enough musings to rotate through`);
  for(const [key,pool] of pools()){
    assert.ok(pool.length>0,`${key} is not empty`);
    for(const line of pool){
      assert.equal(typeof line,'string',`${key} lines are strings`);
      assert.equal(line,line.trim(),`${key} line has no stray whitespace: ${line}`);
      assert.ok(line.length>0&&line.length<=130,`${key} line fits the panel (${line.length} chars): ${line}`);
    }
  }
});

test('Beam never repeats himself within a pool and the pools do not copy each other',()=>{
  const seen=new Map();
  for(const [key,pool] of pools())for(const line of pool){
    assert.ok(!seen.has(line),`"${line}" appears in both ${seen.get(line)} and ${key}`);seen.set(line,key);
  }
});

test('pickLine covers a pool, avoids the previous line and tolerates single lines',()=>{
  const pool=['a','b','c','d'];
  const picked=new Set();
  for(let i=0;i<40;i++)picked.add(pickLine(pool,sequence([i/40])));
  assert.deepEqual([...picked].sort(),pool,'every line is reachable');
  for(let i=0;i<40;i++)assert.notEqual(pickLine(pool,sequence([i/40]),'b'),'b','the last line is skipped when there is a choice');
  assert.equal(pickLine(['only'],sequence([.99]),'only'),'only','a single line is always available');
  assert.equal(pickLine('solo',Math.random),'solo','a bare string is a one-line pool');
  assert.equal(pickLine(pool,()=>1),'d','a random value of exactly one stays in range');
});
