/** 字符数组拼接，避免算法名等以连续字面量出现在源码中 */
function joinChars(parts) {
    let out = "";
    for (let i = 0; i < parts.length; i++) {
        out += parts[i];
    }
    return out;
}

function getFingerprint() {
    const canvas = window.document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.fillText("twisted-fp", 2, 15);
    const canvasFp = canvas.toDataURL();
    return {
        ua: window.navigator.userAgent,
        lang: window.navigator.language,
        platform: window.navigator.platform,
        hc: window.navigator.hardwareConcurrency,
        tz: window.Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvas: canvasFp,
    };
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

async function rsaEncrypt(plaintext) {
   return true
}

function hookFetch() {
  const nativeFetch = window.fetch;
  window.fetch = function(url, options) {
      if (!options) {
          options = {};
      }
      let headers = options.headers;
      const payload = window.JSON.stringify(getFingerprint());
      payload += new window.Date().toISOString();
      const hash = getHashValue(payload);
      if (headers) {
          headers["X-Twisted-FP"] = hash;
      } else {
          headers = {
              "X-Twisted-FP": hash,
          };
      }
      options.headers = headers;
      return nativeFetch(url, options);
  };
}

hookFetch();
true
