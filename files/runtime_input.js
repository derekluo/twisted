function fallbackHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
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

function getToken() {
    const fingerprint = getFingerprint();
    const payload = window.JSON.stringify(fingerprint);
    return fallbackHash(payload);
}


window.JSON.stringify({ fingerprint: getFingerprint(), token: getToken() })

const obj = { a: 1, nested: { v: 0 } };
obj.a = 42;
obj["b"] = 7;
obj.nested.v = obj.a + obj["b"];
window.JSON.stringify(obj)