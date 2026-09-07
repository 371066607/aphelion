#!/usr/bin/env node
/* Prototype entry must bypass the normal game before state, storage or handlers. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
let boots = 0;
const sentinel = { untouched: true };
const aph = { state: sentinel, BuildPrototype: { boot() { boots++; } } };
Object.defineProperty(aph, 'Save', { get() { throw new Error('Prototype reached persistent storage'); } });
Object.defineProperty(aph, 'CFG', { get() { throw new Error('Prototype entered normal game startup'); } });
const sandbox = { APH: aph, location: { search: '?prototype=building-v4' } };
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'main.js' });
assert.equal(boots, 1, 'prototype must boot exactly once');
assert.strictEqual(aph.state, sentinel, 'normal game state must stay untouched');
for (const query of ['', '?prototype=building-v40', '?x=prototype=building-v4']) {
  sandbox.location.search = query;
  assert.throws(() => vm.runInNewContext(source, sandbox), /normal game startup/);
}
assert.equal(boots, 1, 'unrelated query strings must not enter prototype');
console.log('prototype entry: storage isolation and exact routing passed');
