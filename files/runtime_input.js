function joinChars(parts) {
    let out = "";
    for (let i = 0; i < parts.length; i++) {
        out += parts[i];
    }
    return out;
}

function getHashValue(str) {
  const encoder = new window.TextEncoder();
  const data = encoder.encode(str);
  const hash = window.crypto.subtle.digest(joinChars(["S", "H", "A", "-", "2", "5", "6"]), data);
  const hashArray = window.Array.from(new window.Uint8Array(hash));
  let hashHex = "";
  for (let i = 0; i < hashArray.length; i++) {
      const byte = hashArray[i];
      hashHex += byte.toString(16).padStart(2, "0");
  }
  return hashHex;
}

function getCanvasFingerprint() {
    const canvas = window.document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.fillText("twisted-fp", 2, 15);
    const canvasFp = canvas.toDataURL();
    return getHashValue(canvasFp);
}

/**
 * WebGL vendor / renderer / 扩展列表（字符串拼接，便于哈希）
 */
function getWebGLFingerprint() {
    const canvas = window.document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    let vendor = "";
    let renderer = "";
    if (gl) {
      const extDbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (extDbg) {
        vendor = gl.getParameter(extDbg.UNMASKED_VENDOR_WEBGL);
        renderer = gl.getParameter(extDbg.UNMASKED_RENDERER_WEBGL);
        const exts = gl.getSupportedExtensions();
        let extStr = "";

        if (exts) {
            for (let i = 0; i < exts.length; i++) {
                if (0 < i) {
                    extStr += ",";
                }
                extStr += exts[i];
            }
        }
        return vendor + "|" + renderer + "|" + extStr;
      }
    }
    return "";
}

function getGpuFingerprint() {
    // 2) 回退 WebGL
    const canvas = window.document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const extDbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (extDbg) {
        const r = gl.getParameter(extDbg.UNMASKED_RENDERER_WEBGL);
        if (r) {
          return r;
        }
      }
      const r2 = gl.getParameter(gl.RENDERER);
      if (r2) {
        return r2;
      }
    }
    return "";
}

/** navigator.plugins 名称列表（现代浏览器常为空数组） */
function getPluginListFingerprint() {
    const plugins = window.navigator.plugins;
    let s = "";
    for (let i = 0; i < plugins.length; i++) {
        if (0 < i) {
            s += ",";
        }
        s += plugins[i].name;
    }
    return s;
}

function getFontFingerprint() {
    const canvas = window.document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "72px monospace";
    const baseW = ctx.measureText("mmmmmmmmmmlli").width;
    const fonts = joinChars(["A", "r", "i", "a", "l"]);
    const fonts2 = joinChars(["V", "e", "r", "d", "a", "n", "a"]);
    const fonts3 = joinChars(["T", "i", "m", "e", "s", " ", "N", "e", "w", " ", "R", "o", "m", "a", "n"]);
    const fonts4 = joinChars(["G", "e", "o", "r", "g", "i", "a"]);
    const fonts5 = joinChars(["C", "o", "u", "r", "i", "e", "r", " ", "N", "e", "w"]);
    const fonts6 = joinChars(["T", "r", "e", "b", "u", "c", "h", "e", "t", " ", "M", "S"]);
    const fonts7 = joinChars(["C", "o", "m", "i", "c", " ", "S", "a", "n", "s", " ", "M", "S"]);
    const fonts8 = joinChars(["A", "r", "i", "a", "l", " ", "B", "l", "a", "c", "k"]);
    const list = [fonts, fonts2, fonts3, fonts4, fonts5, fonts6, fonts7, fonts8];
    let hit = "";
    for (let j = 0; j < list.length; j++) {
        const fname = list[j];
        ctx.font = "72px " + fname + ", monospace";
        const w = ctx.measureText("mmmmmmmmmmlli").width;
        if (w === baseW) {
        } else {
            if (hit === "") {
                hit = fname;
            } else {
                hit = hit + "," + fname;
            }
        }
    }
    return hit;
}

function getNetFingerprint() {
    const c = window.navigator.connection;
    if (c) {
      const et = c.effectiveType;
      const dl = c.downlink;
      const rtt = c.rtt;
      return et + "|" + dl + "|" + rtt;
    }
    return ""
}

async function getFingerprint() {
    return {
        ua: window.navigator.userAgent,
        lang: window.navigator.language,
        platform: window.navigator.platform,
        hc: window.navigator.hardwareConcurrency,
        tz: window.Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvas: getCanvasFingerprint(),
        webgl: getWebGLFingerprint(),
        gpu: getGpuFingerprint(),
        plugins: getPluginListFingerprint(),
        fonts: getFontFingerprint(),
        net: getNetFingerprint(),
    };
}

function detectDebuggerScore(rounds, thresholdMs, hitRatio) {
  let hits = 0;
  for (let i = 0; i < rounds; i++) {
      const t1 = window.performance.now();
      debugger;
      const t2 = window.performance.now();
      if (t2 - t1 > thresholdMs) {
          hits++;
      }
  }
  return hits / rounds >= hitRatio; // 例如 rounds=5, hitRatio=0.6
}

function dectectDebugger() {
    return detectDebuggerScore(5, 100, 0.6);
}


async function rsaEncrypt(plaintext) {
    return true;
}

function hookFetch() {
    const nativeFetch = window.fetch;
    window.fetch = function(url, options) {
        if (!options) {
            options = {};
        }
        let headers = options.headers;
        // window.alert(dectectDebugger());
        let payload = {
          fingerprint: getFingerprint(),
          debugger: dectectDebugger(),
          automation: false,
          headless: false,
          hook: false,
          t: window.Date.now(),
        }
        payload = window.JSON.stringify(payload);
        const hash = getHashValue(payload);
        if (headers) {
            headers["payload"] = payload;
            headers["X-Twisted-FP"] = hash;
        } else {
            headers = {
                "payload": payload,
                "X-Twisted-FP": hash,
            };
        }
        options.headers = headers;
        return nativeFetch(url, options);
    };
}

hookFetch();
true
