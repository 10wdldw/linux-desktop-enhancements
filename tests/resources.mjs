import assert from 'node:assert/strict';
import {SignalHub, ResourceScope, SharedState, TurnCache} from '../src/core/resources.js';
import {InputState} from '../src/input/state.js';
const callbacks = new Map(); let next = 1; let connections = 0;
const actor = {
  connect(_name, callback) { connections++; callbacks.set(next, callback); return next++; },
  disconnect(id) { connections--; callbacks.delete(id); },
};
const pending = new Map();
const clock = {
  idle: (_priority, callback) => { pending.set(next, callback); return next++; },
  timeout: (_priority, _ms, callback) => { pending.set(next, callback); return next++; },
  remove: id => pending.delete(id),
};
const hub = new SignalHub(); const first = new ResourceScope(clock, hub); const second = new ResourceScope(clock, hub);
let one = 0; let two = 0;
first.observe(actor, 'changed', () => one++); second.observe(actor, 'changed', () => two++);
assert.equal(connections,1); callbacks.values().next().value(); assert.equal(one,1); assert.equal(two,1);
first.dispose(); assert.equal(connections,1); callbacks.values().next().value(); assert.equal(one,1); assert.equal(two,2);
const source = second.idle(0, () => false); assert.equal(second.sources.size,1);
pending.get(source)(); pending.delete(source); assert.equal(second.sources.size,0);
second.timeout(0, 100, () => true); second.dispose(); second.dispose();
assert.equal(connections,0); assert.equal(hub.count(),0); assert.equal(pending.size,0);
assert.equal(second.idle(0, () => false),0);

// Two subscriptions of the same function still have independent lifetimes.
const errors = []; const shared = new SignalHub(error => errors.push(error));
const a = new ResourceScope(clock, shared); const b = new ResourceScope(clock, shared);
let called = 0; const listener = () => called++;
const stopA = a.observe(actor, 'same', listener); b.observe(actor, 'same', listener);
stopA(); callbacks.values().next().value(); assert.equal(called, 1);
a.observe(actor, 'same', () => { throw new Error('bad listener'); });
callbacks.values().next().value(); assert.equal(called, 2); assert.equal(errors.length, 1);
a.dispose(); b.dispose(); assert.equal(connections, 0);

// Disposing/cancelling from a callback cannot keep a repeating source alive.
const c = new ResourceScope(clock, shared);
let id = c.timeout(0, 1, () => { c.dispose(); return true; });
assert.equal(pending.get(id)(), false); pending.delete(id); assert.equal(c.sources.size, 0);
const d = new ResourceScope(clock, shared);
id = d.idle(0, () => { throw new Error('bad source'); });
assert.throws(() => pending.get(id)(), /bad source/); pending.delete(id); assert.equal(d.sources.size, 0);
let cleaned = 0; d.own(() => { throw new Error('bad cleanup'); }); d.own(() => cleaned++);
d.dispose(); assert.equal(cleaned, 1); assert.equal(errors.length, 2);

const owner = new ResourceScope(clock, shared);
let runs = 0;
const queued = owner.queue('layout', 0, () => runs++);
assert.equal(owner.queue('layout', 0, () => runs++), queued);
owner.remove(queued);
const replacement = owner.queue('layout', 0, () => runs++);
assert.notEqual(replacement, queued);
pending.get(replacement)(); pending.delete(replacement); assert.equal(runs, 1);
let reads = 0;
const channel = new SharedState(owner, () => ({revision: ++reads}));
const consumer1 = new ResourceScope(clock, shared); const consumer2 = new ResourceScope(clock, shared);
const values = []; channel.observe(consumer1, value => values.push(value)); channel.observe(consumer2, value => values.push(value));
for (let i = 0; i < 20; i++) channel.invalidate();
assert.equal(owner.sources.size, 1);
const flush = () => { for (const [source, cb] of [...pending]) if (!cb()) pending.delete(source); };
flush(); assert.equal(reads, 1); assert.equal(values.length, 2); assert.equal(values[0], values[1]);
consumer1.dispose(); channel.invalidate(); flush(); assert.equal(reads, 2); assert.equal(values.length, 3);
consumer2.dispose(); channel.invalidate(); flush(); assert.equal(reads, 2);
owner.dispose(); assert.equal(pending.size, 0);

const cache = new TurnCache(); let scans = 0;
const read = () => cache.get('icons', () => ++scans);
cache.run(() => { assert.equal(read(), 1); cache.run(() => assert.equal(read(), 1)); assert.equal(read(), 1); });
cache.run(() => assert.equal(read(), 2));
assert.throws(() => cache.run(() => { read(); throw new Error('frame failed'); }), /frame failed/);
assert.equal(cache.depth, 0); assert.equal(cache.values.size, 0);
cache.run(() => { const before = read(); cache.clear(); assert.equal(read(), before + 1); });
const state = new InputState();
state.lookup(['1','2'],['你好','世界'],[],false,true,1,1); state.signal('ShowLookupTable',[true]);
assert.equal(state.texts[state.cursor],'世界'); assert.equal(state.showLookup,true);
const revision = state.revision;
assert.equal(state.lookup(['1','2'],['你好','世界'],[],false,true,1,1), false);
assert.equal(state.signal('ShowLookupTable',[true]), false); assert.equal(state.revision, revision);
assert.equal(state.signal('UpdateLookupTableCursor',[0]), true);
assert.equal(state.signal('UnknownNotification',[]), false);
state.signal('Enable',[false]); assert.deepEqual(state.texts,[]); assert.equal(state.showLookup,false);
console.log('Shared signals, subscriber failures, independent unsubscription, keyed jobs, coalesced focus, frame cache, cleanup and duplicate candidate updates passed.');
