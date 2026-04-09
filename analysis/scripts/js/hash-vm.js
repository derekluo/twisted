#!/usr/bin/env node
/**
 * XHS TwistedRuntime Hash Computer
 *
 * Reads fingerprint JSON from stdin and outputs the VM result (hash + fingerprint) to stdout.
 *
 * Usage: echo '{"canvas":"ABC","tz":"Asia/Shanghai","hc":8,"platform":"MacIntel","lang":"zh-CN","ua":"Chrome/146"}' | node scripts/js/hash-vm.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ANALYSIS_DIR = path.resolve(__dirname, '..', '..');
const RUNTIME_PATH = path.join(ANALYSIS_DIR, 'artifacts', 'runtime.js');
const SRC = fs.readFileSync(RUNTIME_PATH, 'utf8');

var noop = function() {};
var noopObj = function() { return {}; };
var returnNull = function() { return null; };
var returnEmptyStr = function() { return ''; };
var returnEmptyArr = function() { return []; };
var returnResolved = function() { return Promise.resolve(); };
var returnFalse = function() { return false; };

// Read fingerprint from stdin
var fpStr = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk) { fpStr += chunk; });
process.stdin.on('end', function() {
  var fp;
  try {
    fp = JSON.parse(fpStr.trim());
  } catch(e) {
    process.stderr.write('Invalid JSON input\n');
    process.exit(1);
  }

  var sandbox = {
    setTimeout: function(fn, ms) { if (ms < 100) fn(); return 0; },
    setInterval: function() { return 0; },
    clearTimeout: noop,
    clearInterval: noop,
    requestAnimationFrame: function(fn) { fn(); },
    performance: {
      now: function() { return 1000000; },
      timing: {},
      getEntriesByType: returnEmptyArr,
    },
    crypto: {
      getRandomValues: function(a) {
        for (var i = 0; i < a.length; i++) a[i] = 0;
        return a;
      },
      subtle: {
        digest: function() { return Promise.resolve(new ArrayBuffer(32)); },
      },
    },
    fetch: function() {
      return Promise.resolve({
        ok: true,
        text: function() { return Promise.resolve(''); },
        json: function() { return Promise.resolve({}); },
      });
    },
    XMLHttpRequest: function() {
      return {
        open: noop, send: noop, setRequestHeader: noop,
        readyState: 4, status: 200, responseText: '',
      };
    },
    WebSocket: function() {},
    Image: function() {},
    AudioContext: function() {
      return {
        createOscillator: function() {
          return {
            connect: noop, start: noop,
            frequency: { setValueAtTime: noop },
          };
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
          return Promise.resolve({
            getChannelData: function() { return new Float32Array(0); },
          });
        },
      };
    },
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    Uint8Array: Uint8Array,
    Int8Array: Int8Array,
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
    Intl: Intl,
    matchMedia: returnFalse,
    navigator: {
      userAgent: fp.ua || '',
      platform: fp.platform || '',
      language: fp.lang || '',
      languages: [fp.lang || ''],
      hardwareConcurrency: fp.hc || 0,
      deviceMemory: 0,
      vendor: 'Google Inc.',
      plugins: { length: 0 },
      cookieEnabled: true,
      webdriver: false,
      maxTouchPoints: 0,
      connection: { effectiveType: '4g' },
    },
    screen: {
      width: 1440, height: 900, colorDepth: 24, pixelDepth: 24,
    },
    devicePixelRatio: 1,
    innerWidth: 1440,
    innerHeight: 900,
    outerWidth: 1440,
    outerHeight: 900,
    document: {
      createElement: function(tag) {
        if (tag === 'canvas') {
          return {
            getContext: function(ctx) {
              if (ctx === '2d') {
                return {
                  fillText: noop, strokeText: noop, fillRect: noop,
                  measureText: function() { return { width: 10 }; },
                  getImageData: function() {
                    return { data: new Uint8ClampedArray(4) };
                  },
                  arc: noop, beginPath: noop, closePath: noop,
                  moveTo: noop, lineTo: noop, fill: noop, stroke: noop,
                  clearRect: noop, drawImage: noop, save: noop,
                  restore: noop,
                  createLinearGradient: function() {
                    return { addColorStop: noop };
                  },
                  globalCompositeOperation: '', lineWidth: 1, font: '',
                  textAlign: '', textBaseline: '', fillStyle: '',
                  strokeStyle: '',
                  canvas: { width: 300, height: 150 },
                };
              }
              return null;
            },
            toDataURL: function() { return fp.canvas || ''; },
            style: noopObj,
            appendChild: noop,
            removeChild: noop,
          };
        }
        return {
          getContext: returnNull, toDataURL: returnEmptyStr,
          style: noopObj, appendChild: noop, removeChild: noop,
        };
      },
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
      origin: 'https://www.xiaohongshu.com',
    },
    sessionStorage: { getItem: returnNull, setItem: noop },
    localStorage: { getItem: returnNull, setItem: noop },
    MutationObserver: function() {
      return { observe: noop, disconnect: noop, takeRecords: returnEmptyArr };
    },
    ResizeObserver: function() {
      return { observe: noop, disconnect: noop };
    },
    IntersectionObserver: function() {
      return { observe: noop, disconnect: noop, unobserve: noop };
    },
    console: {
      log: noop, warn: noop, error: noop, debug: noop, info: noop,
    },
    URL: URL,
    Blob: Blob,
    Buffer: Buffer,
    AbortController: function() {
      return { signal: {}, abort: noop };
    },
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
  try {
    vm.runInContext(SRC, sandbox, { timeout: 30000 });
  } catch(e) {
    // Expected for browser-only code
  }

  sandbox.TwistedRuntime.run([sandbox, sandbox.console]).then(function(result) {
    process.stdout.write(result + '\n');
  }).catch(function(e) {
    process.stderr.write('VM error: ' + e.message + '\n');
    process.exit(1);
  });
});
