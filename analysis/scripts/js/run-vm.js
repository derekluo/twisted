#!/usr/bin/env node
/**
 * XHS TwistedRuntime VM Runner
 *
 * Runs runtime.js in a sandboxed VM with full browser mocks,
 * intercepts all network calls to capture the collect payload.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ANALYSIS_DIR = path.resolve(__dirname, '..', '..');
const RUNTIME_PATH = path.join(ANALYSIS_DIR, 'artifacts', 'runtime.js');
const SRC = fs.readFileSync(RUNTIME_PATH, 'utf8');

// ── Helpers ────────────────────────────────────────────────────
var noop = function() {};
var noopObj = function() { return {}; };
var returnNull = function() { return null; };
var returnEmptyStr = function() { return ''; };
var returnEmptyArr = function() { return []; };
var returnResolved = function() { return Promise.resolve(); };
var returnFalse = function() { return false; };

var fetchCalls = [];
var xhrCalls = [];

// ── WebGL mock ─────────────────────────────────────────────────
var webglParams = {};
webglParams[0x1F01] = 'WebKit';
webglParams[0x1F00] = 'WebKit WebGL';
webglParams[0x9245] = 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)';
webglParams[0x9246] = 'Google Inc. (Intel)';
webglParams[0x9244] = 'WebKit';
webglParams[0x1F02] = 'OpenGL ES 2.0';
webglParams[0x1F03] = 'OpenGL ES GLSL ES 1.0';

function makeWebGL() {
  return {
    getParameter: function(p) { return webglParams[p] || 'unknown'; },
    getExtension: returnNull,
    getSupportedExtensions: returnEmptyArr,
    createBuffer: noop, createShader: noop, shaderSource: noop,
    compileShader: noop, createProgram: noop, attachShader: noop,
    linkProgram: noop, useProgram: noop, enableVertexAttribArray: noop,
    bindBuffer: noop, bufferData: noop, vertexAttribPointer: noop,
    drawArrays: noop, getAttribLocation: function() { return 0; },
    getUniformLocation: returnNull, uniform1f: noop, viewport: noop,
    clearColor: noop, clear: noop,
    VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
    ARRAY_BUFFER: 0x8892, FLOAT: 0x1406, TRIANGLES: 0x0004,
    COLOR_BUFFER_BIT: 0x00004000,
  };
}

function makeCanvas2D() {
  return {
    fillText: noop, strokeText: noop, fillRect: noop,
    measureText: function() { return { width: 10 }; },
    getImageData: function() { return { data: new Uint8ClampedArray(4) }; },
    arc: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, fill: noop, stroke: noop, clearRect: noop,
    drawImage: noop, putImageData: noop, save: noop, restore: noop,
    createLinearGradient: function() { return { addColorStop: noop }; },
    globalCompositeOperation: '', lineWidth: 1, font: '',
    textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '',
    canvas: { width: 300, height: 150 },
  };
}

function mockElement(tag) {
  if (tag === 'canvas') {
    return {
      getContext: function(ctx) {
        if (ctx === '2d') return makeCanvas2D();
        if (ctx === 'webgl' || ctx === 'experimental-webgl') return makeWebGL();
        return null;
      },
      toDataURL: function() { return 'data:image/png;base64,AAAFakeCanvasHash'; },
      style: noopObj, appendChild: noop, removeChild: noop,
      setAttribute: noop, getAttribute: returnNull,
    };
  }
  return {
    getContext: returnNull, toDataURL: returnEmptyStr,
    style: noopObj, appendChild: noop, removeChild: noop,
    setAttribute: noop, getAttribute: returnNull,
  };
}

// ── Sandbox ────────────────────────────────────────────────────
var sandbox = {
  setTimeout: function(fn, ms) { if (ms < 100) fn(); return 0; },
  setInterval: function() { return 0; },
  clearTimeout: noop, clearInterval: noop,
  requestAnimationFrame: function(fn) { fn(); },
  performance: {
    now: function() { return Date.now(); },
    timing: {},
    getEntriesByType: returnEmptyArr,
  },
  crypto: {
    getRandomValues: function(a) {
      for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
      return a;
    },
    subtle: {
      digest: function() { return Promise.resolve(new ArrayBuffer(32)); },
    },
  },
  fetch: function(url, opts) {
    var body = null;
    if (opts && opts.body) {
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    fetchCalls.push({
      url: url,
      method: opts && opts.method ? opts.method : 'GET',
      headers: opts && opts.headers ? opts.headers : {},
      body: body,
    });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function() { return Promise.resolve('{"code":0}'); },
      json: function() { return Promise.resolve({ code: 0 }); },
    });
  },
  XMLHttpRequest: function() {
    var xhr = {
      open: function(m, u) { xhrCalls.push({ method: m, url: u }); },
      send: noop,
      setRequestHeader: noop,
      readyState: 4,
      status: 200,
      responseText: '',
    };
    return xhr;
  },
  WebSocket: function() {},
  Image: function() { return {}; },
  AudioContext: function() {
    return {
      createOscillator: function() {
        return { connect: noop, start: noop, frequency: { setValueAtTime: noop } };
      },
      createDynamicsCompressor: function() { return { connect: noop }; },
      destination: {},
      sampleRate: 44100,
      close: returnResolved,
    };
  },
  OfflineAudioContext: function() {
    return {
      startRendering: function() {
        return Promise.resolve({ getChannelData: function() { return new Float32Array(44100); } });
      },
    };
  },
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  Uint16Array: Uint16Array,
  Uint32Array: Uint32Array,
  Uint8ClampedArray: Uint8ClampedArray,
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
  WeakMap: WeakMap,
  WeakSet: WeakSet,
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
  SyntaxError: SyntaxError,
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
  escape: escape,
  unescape: unescape,
  Intl: Intl,
  matchMedia: returnFalse,
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    language: 'zh-CN',
    languages: ['zh-CN', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webdriver: false,
    cookieEnabled: true,
    maxTouchPoints: 0,
    vendor: 'Google Inc.',
    plugins: { length: 0 },
    connection: { effectiveType: '4g' },
    appVersion: '5.0',
  },
  screen: {
    width: 1440, height: 900, colorDepth: 24, pixelDepth: 24,
    availWidth: 1440, availHeight: 900,
  },
  devicePixelRatio: 1,
  innerWidth: 1440,
  innerHeight: 900,
  outerWidth: 1440,
  outerHeight: 900,
  document: {
    createElement: mockElement,
    createElementNS: returnNull,
    documentElement: { style: {}, clientWidth: 1440, clientHeight: 900 },
    cookie: 'a1=test123; web_session=test_sess; gid=xxh3_test; xsecappid=xhs-pc-web; webId=test_web_id',
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    fonts: { ready: returnResolved },
    body: { appendChild: noop, removeChild: noop, style: noopObj, clientWidth: 1440, clientHeight: 900 },
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
    origin: 'https://www.xiaohongshu.com',
  },
  sessionStorage: { getItem: returnNull, setItem: noop },
  localStorage: { getItem: returnNull, setItem: noop },
  MutationObserver: function() { return { observe: noop, disconnect: noop, takeRecords: returnEmptyArr }; },
  ResizeObserver: function() { return { observe: noop, disconnect: noop }; },
  IntersectionObserver: function() { return { observe: noop, disconnect: noop, unobserve: noop }; },
  console: { log: noop, warn: noop, error: noop, debug: noop, info: noop, table: noop, dir: noop, trace: noop },
  URL: URL,
  Blob: Blob,
  Buffer: Buffer,
  AbortController: function() { return { signal: {}, abort: noop }; },
  Headers: function() {},
  Request: function() {},
  Response: function() {},
  FormData: function() {},
  Event: function() {},
  CustomEvent: function() {},
  MessageChannel: function() { return { port1: { postMessage: noop }, port2: { onmessage: null } }; },
  addEventListener: noop,
  removeEventListener: noop,
  getComputedStyle: noopObj,
  getSelection: function() { return { toString: returnEmptyStr }; },
};

vm.createContext(sandbox);

// ── Load runtime.js ────────────────────────────────────────────
console.error('Loading runtime.js...');
try {
  vm.runInContext(SRC, sandbox, { timeout: 30000, filename: 'runtime.js' });
  console.error('Loaded OK.');
} catch (e) {
  console.error('Load error (expected):', e.message.substring(0, 100));
}

// ── Run TwistedRuntime.run() ───────────────────────────────────
console.error('Running TwistedRuntime.run()...');

sandbox.TwistedRuntime.run([sandbox, sandbox.console]).then(function(result) {
  console.error('\n=== VM EXECUTION COMPLETE ===');
  console.error('Return value:', JSON.stringify(result).substring(0, 500));

  // Output network calls as JSON to stdout
  var output = {
    result: result,
    fetchCalls: fetchCalls,
    xhrCalls: xhrCalls,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  console.error('\nFetch calls: ' + fetchCalls.length);
  fetchCalls.forEach(function(c, i) {
    console.error('  #' + i + ': ' + (c.method || 'GET') + ' ' + c.url);
    if (c.body) {
      try {
        var parsed = JSON.parse(c.body);
        console.error('    Body keys: ' + Object.keys(parsed).join(', '));
      } catch(e) {
        console.error('    Body (raw): ' + c.body.substring(0, 200));
      }
    }
  });
  console.error('\nXHR calls: ' + xhrCalls.length);
  xhrCalls.forEach(function(c, i) {
    console.error('  #' + i + ': ' + c.method + ' ' + c.url);
  });

  // Save to file
  fs.writeFileSync(path.join(__dirname, 'collect_payload.json'), JSON.stringify(output, null, 2));
  console.error('\nSaved to collect_payload.json');

}).catch(function(e) {
  console.error('\nVM error: ' + e.message);

  var output = {
    error: e.message,
    fetchCalls: fetchCalls,
    xhrCalls: xhrCalls,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  console.error('\nFetch calls before error: ' + fetchCalls.length);
  fetchCalls.forEach(function(c, i) {
    console.error('  #' + i + ': ' + (c.method || 'GET') + ' ' + c.url);
    if (c.body) {
      try {
        var parsed = JSON.parse(c.body);
        console.error('    Body keys: ' + Object.keys(parsed).join(', '));
        console.error('    Body (first 1000): ' + c.body.substring(0, 1000));
      } catch(ex) {
        console.error('    Body (raw): ' + c.body.substring(0, 200));
      }
    }
  });

  fs.writeFileSync(path.join(__dirname, 'collect_payload.json'), JSON.stringify(output, null, 2));
  console.error('\nSaved to collect_payload.json');
});
