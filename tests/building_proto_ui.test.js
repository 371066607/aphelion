#!/usr/bin/env node
'use strict';

/* Controller probe: intentionally runs without a browser or storage. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

class EventTarget {
  constructor() { this.listeners = {}; }
  addEventListener(type, listener) { (this.listeners[type] || (this.listeners[type] = [])).push(listener); }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter(fn => fn !== listener);
  }
  dispatch(type, event) {
    event = Object.assign({ type, target: this, preventDefault() { this.defaultPrevented = true; } }, event);
    (this.listeners[type] || []).slice().forEach(fn => fn.call(this, event));
    return event;
  }
}

function dataName(name) { return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

class Element extends EventTarget {
  constructor(tagName, document) {
    super();
    this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.dataset = {}; this.attributes = {}; this.style = {};
    this.className = ''; this.classList = { add: name => { this.className += (this.className ? ' ' : '') + name; }, remove: name => { this.className = this.className.split(' ').filter(c => c !== name).join(' '); } };
    this.textContent = ''; this.value = ''; this._innerHTML = '';
  }
  set id(value) { this._id = value; if (value) this.ownerDocument.ids[value] = this; }
  get id() { return this._id; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return this._textContent || this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) {
    value = String(value); this.attributes[name] = value;
    if (name === 'id') this.id = value;
    if (name.indexOf('data-') === 0) this.dataset[dataName(name.slice(5))] = value;
    if (name === 'value') this.value = value;
  }
  getAttribute(name) { return this.attributes[name]; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); }
  set innerHTML(value) {
    this._innerHTML = value; this.children = [];
    /* The controller's static shell only needs addressable controls. */
    const tags = /<(canvas|button|select|div|aside)\b([^>]*)>/g;
    let match;
    while ((match = tags.exec(value))) {
      const child = this.ownerDocument.createElement(match[1]);
      const attrs = match[2];
      const id = /\bid="([^"]+)"/.exec(attrs); if (id) child.id = id[1];
      const aria = /\baria-label="([^"]+)"/.exec(attrs); if (aria) child.setAttribute('aria-label', aria[1]);
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._innerHTML; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = node => {
      if (selector[0] === '#') return node.id === selector.slice(1);
      const data = /^\[data-([^\]]+)\]$/.exec(selector);
      return !!(data && Object.prototype.hasOwnProperty.call(node.dataset, dataName(data[1])));
    };
    const found = [];
    const visit = node => node.children.forEach(child => { if (matches(child)) found.push(child); visit(child); });
    visit(this); return found;
  }
  focus() { this.ownerDocument.activeElement = this; }
}

class Canvas extends Element {
  constructor(document) {
    super('canvas', document); this.width = 0; this.height = 0; this.captures = {}; this.context = new Proxy({}, { get: () => () => {} });
  }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1024, height: 768 }; }
  setPointerCapture(id) { this.captures[id] = true; }
  hasPointerCapture(id) { return !!this.captures[id]; }
  releasePointerCapture(id) { delete this.captures[id]; }
}

class Document {
  constructor() { this.ids = {}; this.title = ''; this.body = new Element('body', this); this.activeElement = null; }
  createElement(tag) { return tag === 'canvas' ? new Canvas(this) : new Element(tag, this); }
  getElementById(id) { return this.ids[id] || null; }
}

const document = new Document();
const raf = [];
global.window = global;
global.document = document;
global.devicePixelRatio = 1;
const windowEvents = new EventTarget();
global.addEventListener = windowEvents.addEventListener.bind(windowEvents);
global.removeEventListener = windowEvents.removeEventListener.bind(windowEvents);
global.dispatch = windowEvents.dispatch.bind(windowEvents);
global.requestAnimationFrame = fn => { raf.push(fn); return raf.length; };
global.cancelAnimationFrame = () => {};
let storageAccesses = 0;
Object.defineProperty(global, 'localStorage', { get() { storageAccesses++; throw new Error('controller must not use localStorage'); } });
global.location = { search: '?prototype=building-v4' };
global.Image = class { set src(value) { this._src = value; } };
window.APH = {};
// Load the exact build list, including the inert normal-game modules and real draw layer.
const build = fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8');
const order = build.match(/MODULE_ORDER = \[([\s\S]*?)\]/)[1].match(/"[\w.]+\.js"/g).map(name => name.slice(1, -1));
order.forEach(name => require(path.join(__dirname, '..', 'src', name)));

const controller = window.APH.BuildPrototype.boot();
const root = document.getElementById('building-prototype-root');
const canvas = document.getElementById('bp-canvas');
function click(node) { node.dispatch('click'); }
function key(keyName) { return window.dispatch('keydown', { key: keyName, target: canvas }); }
function pointer(button, clientX, clientY) { return canvas.dispatch('pointerdown', { button, clientX, clientY, pointerId: 1, target: canvas }); }
function tool(bid) { return root.querySelectorAll('[data-bid]').find(node => node.dataset.bid === bid); }

assert(root, 'boot must mount its dedicated root');
assert.equal(root.dataset.rooms, '2', 'demo must initially show two rooms');
assert.equal(root.dataset.pawns, '3', 'demo must initially show three residents');
assert.match(document.title, /2 间房/, 'title must expose demo room count');
assert.equal(typeof controller.getState, 'function');
assert.equal(typeof controller.reset, 'function');
assert.equal(typeof controller.command, 'function');
assert.equal(typeof controller.stop, 'function');

click(document.getElementById('bp-empty'));
assert.equal(controller.getState().rooms.length, 0, 'empty reset must remove demo rooms');
assert.equal(root.dataset.pawns, '3', 'empty reset must retain the three residents');
click(document.getElementById('bp-demo'));
assert.equal(controller.getState().rooms.length, 2, 'demo button must restore two rooms');

click(document.getElementById('bp-empty'));
click(tool('bl_bed'));
key('r');
key('Enter');
let state = controller.getState();
assert.equal(state.blueprints.length, 1, 'Enter in build context must schedule a blueprint');
assert.equal(state.blueprints[0].rotation, 1, 'R must rotate the selected construction before placement');
key('Escape');
const countAfterEscape = state.blueprints.length;
key('r'); key('Enter');
assert.equal(controller.getState().blueprints.length, countAfterEscape, 'R and Enter outside build context must not mutate state');

/* fit(empty) maps this point to ground cell (8,14), one cell from pawn_1. */
pointer(2, 306, 335);
state = controller.getState();
assert.equal(state.pawns[0].order.action, 'move', 'right-clicking ground must issue a move order');
assert.deepEqual(state.pawns[0].order.target, { gx: 8, gy: 14 });

click(tool('bl_wall'));
key('Enter');
const wall = controller.getState().blueprints.find(item => item.bid === 'bl_wall');
assert(wall, 'wall blueprint must exist before layer-specific demolition');
click(document.getElementById('bp-demolish'));
key('Enter');
assert(!controller.getState().blueprints.some(item => item.uid === wall.uid), 'structure-layer demolition must remove matching blueprint');

function runFrame(now) { const frame = raf.shift(); assert(frame, 'controller should schedule animation frames'); frame(now); }
runFrame(1000); runFrame(1100);
const runningClock = controller.getState().clock;
click(document.getElementById('bp-pause'));
runFrame(1200);
assert.equal(controller.getState().clock, runningClock, 'pause must freeze model ticks');
click(document.getElementById('bp-pause'));
runFrame(1300);
assert(controller.getState().clock > runningClock, 'resume must restart model ticks');

key('Escape');
click(document.getElementById('bp-demo'));
// Cursor remains at (8,14). Select the real bed at (11,14) without any pointer input.
key('ArrowRight'); key('ArrowRight'); key('ArrowRight'); key('Enter');
const sleepButton = document.getElementById('bp-actions').children.find(node => node.textContent === '让选中居民睡觉');
assert(sleepButton, 'keyboard selection must expose the bed action');
click(sleepButton); // Native focused button activation uses the same click handler.
assert.equal(controller.getState().pawns[0].order.action, 'sleep', 'keyboard-selected furniture must accept a real command');
const weather = document.getElementById('bp-weather');
weather.value = 'rain'; weather.dispatch('change');
assert.equal(controller.getState().weather, 'rain');
assert.equal(controller.getState().ambient, 8);
click(document.getElementById('bp-demo'));
assert.equal(weather.value, 'clear', 'reset must keep weather control and model synchronized');

controller.stop();
assert(!document.body.children.includes(root), 'stop must remove the owned DOM');
assert(!document.body.className.includes('bp-active'), 'stop must release page visibility');
assert.equal(windowEvents.listeners.keydown.length, 0, 'stop must detach input');
const restarted = window.APH.BuildPrototype.boot();
assert.notEqual(restarted, controller, 'boot after stop must create a live controller');
assert.equal(restarted.getState().rooms.length, 2);
restarted.stop();
assert.equal(storageAccesses, 0, 'even swallowed storage attempts are forbidden throughout prototype startup');
assert.equal(window.APH.state, undefined, 'prototype must not initialize normal game state');
console.log('building prototype UI controller: DOM controls and storage isolation passed');
