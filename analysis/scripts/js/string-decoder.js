#!/usr/bin/env node
/**
 * XHS TwistedRuntime String Decoder
 *
 * Loads runtime.js into a sandboxed VM, runs the original string decoder,
 * and exports the complete index → string lookup table.
 *
 * Usage: node scripts/js/string-decoder.js > data/decoded_strings.json
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ANALYSIS_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ANALYSIS_DIR, 'data');
const RUNTIME_PATH = path.join(ANALYSIS_DIR, 'artifacts', 'runtime.js');
const SRC = fs.readFileSync(RUNTIME_PATH, 'utf8');

// ── Minimal browser environment ────────────────────────────────
var noop = function() {};
var noopObj = function() { return {}; };
var returnNull = function() { return null; };
var returnEmptyStr = function() { return ''; };
var returnEmptyArr = function() { return []; };
var returnEmptyFn = function() { return function() {}; };
var returnFalse = function() { return false; };
var returnTrue = function() { return true; };
var returnResolved = function() { return Promise.resolve(); };

var mockElement = function() {
  return {
    getContext: returnNull,
    toDataURL: returnEmptyStr,
    style: noopObj,
    appendChild: noop,
    removeChild: noop,
  };
};

var sandbox = {
  setTimeout: function(fn, ms) { if (ms < 100) fn(); return 0; },
  setInterval: function() { return 0; },
  clearTimeout: noop,
  clearInterval: noop,
  requestAnimationFrame: function(fn) { fn(); },
  performance: { now: function() { return Date.now(); }, timing: {}, getEntriesByType: returnEmptyArr },
  crypto: {
    getRandomValues: function(a) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; },
    subtle: { digest: function() { return Promise.resolve(new ArrayBuffer(32)); } },
  },
  fetch: function() { return Promise.resolve({ ok: true, text: function() { return Promise.resolve(''); }, json: function() { return Promise.resolve({}); } }); },
  XMLHttpRequest: function() {},
  WebSocket: function() {},
  Image: function() {},
  AudioContext: function() {
    return {
      createOscillator: function() { return { connect: noop, start: noop, frequency: { setValueAtTime: noop } }; },
      createDynamicsCompressor: function() { return { connect: noop }; },
      destination: {},
      sampleRate: 44100,
      close: returnResolved,
    };
  },
  OfflineAudioContext: function() {
    return { startRendering: function() { return Promise.resolve({ getChannelData: function() { return new Float32Array(0); } }); } };
  },
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  Uint16Array: Uint16Array,
  Uint32Array: Uint32Array,
  Int8Array: Int8Array,
  Int16Array: Int16Array,
  Int32Array: Int32Array,
  Float32Array: Float32Array,
  Float64Array: Float64Array,
  ArrayBuffer: ArrayBuffer,
  DataView: DataView,
  Promise: Promise,
  Map: Map,
  Set: Set,
  Proxy: Proxy,
  Reflect: Reflect,
  Symbol: Symbol,
  JSON: JSON,
  Math: Math,
  Date: Date,
  RegExp: RegExp,
  Error: Error,
  TypeError: TypeError,
  RangeError: RangeError,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  Boolean: Boolean,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  atob: atob,
  btoa: btoa,
  matchMedia: returnFalse,
  navigator: {
    userAgent: 'test', platform: 'test', language: 'en',
    hardwareConcurrency: 8, deviceMemory: 8, webdriver: false,
    cookieEnabled: true, maxTouchPoints: 0, vendor: 'Google Inc.',
    plugins: { length: 0 },
  },
  screen: { width: 1440, height: 900, colorDepth: 24 },
  devicePixelRatio: 1,
  innerWidth: 1440,
  innerHeight: 900,
  document: {
    createElement: mockElement,
    createElementNS: returnNull,
    documentElement: { style: {} },
    cookie: '',
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    fonts: { ready: returnResolved },
    body: { appendChild: noop, removeChild: noop, style: noopObj },
    head: { appendChild: noop, removeChild: noop },
    getElementsByTagName: returnEmptyArr,
    getElementById: returnNull,
    querySelector: returnNull,
    querySelectorAll: returnEmptyArr,
    addEventListener: noop,
    removeEventListener: noop,
    createEvent: function() { return { initEvent: noop }; },
    createTextNode: function(t) { return { textContent: t }; },
    adoptNode: function(n) { return n; },
  },
  location: {
    href: 'https://www.xiaohongshu.com/',
    protocol: 'https:',
    hostname: 'www.xiaohongshu.com',
    host: 'www.xiaohongshu.com',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
  },
  sessionStorage: { getItem: returnNull, setItem: noop },
  localStorage: { getItem: returnNull, setItem: noop },
  MutationObserver: function() { return { observe: noop, disconnect: noop, takeRecords: returnEmptyArr }; },
  ResizeObserver: function() { return { observe: noop, disconnect: noop }; },
  IntersectionObserver: function() { return { observe: noop, disconnect: noop, unobserve: noop }; },
  console: { log: noop, warn: noop, error: noop, debug: noop, info: noop },
  URL: URL,
  Blob: Blob,
  Buffer: Buffer,
  AbortController: function() { return { signal: {}, abort: noop }; },
  Headers: function() {},
  Request: function() {},
  Response: function() {},
  FormData: function() {},
  addEventListener: noop,
  removeEventListener: noop,
  getComputedStyle: noopObj,
  getSelection: function() { return { toString: returnEmptyStr }; },
};

vm.createContext(sandbox);

// ── Load runtime.js ────────────────────────────────────────────
try {
  vm.runInContext(SRC, sandbox, { timeout: 30000, filename: 'runtime.js' });
} catch (e) {
  // Expected: browser-only code will throw, but _0x5cbb is already initialized
}

// ── Extract all 557 string fragments ───────────────────────────
var OFFSET = 133;
var MIN_IDX = OFFSET;
var MAX_IDX = 689;
var decoded = {};

for (var i = MIN_IDX; i <= MAX_IDX; i++) {
  try {
    var val = sandbox._0x5cbb(i, 0);
    if (val !== undefined && val !== null) {
      decoded[String(i)] = val;
    }
  } catch (e) { /* skip */ }
}

// ── Output JSON to stdout ──────────────────────────────────────
process.stdout.write(JSON.stringify(decoded, null, 2) + '\n');

// ── Summary to stderr ──────────────────────────────────────────
var keys = Object.keys(decoded);
console.error('Decoded ' + keys.length + ' string fragments (index ' + MIN_IDX + '-' + MAX_IDX + ')');

// Show recognizable fragments
var meaningful = keys.filter(function(k) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]{2,}$/.test(decoded[k]);
});
console.error('\n' + meaningful.length + ' recognizable identifier fragments:');
meaningful.slice(0, 40).forEach(function(k) { console.error('  [' + k + '] ' + decoded[k]); });
if (meaningful.length > 40) console.error('  ... and ' + (meaningful.length - 40) + ' more');

// Save to file
fs.writeFileSync(path.join(DATA_DIR, 'decoded_strings.json'), JSON.stringify(decoded, null, 2));
console.error('\nSaved to data/decoded_strings.json');
