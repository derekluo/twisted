const time = window.Date();
const bytes = new window.TextEncoder().encode(time);
const digest = await window.crypto.subtle.digest("SHA-256", bytes);
const digestBytes = new window.Uint8Array(digest);
const fp32 = "0x" + new window.DataView(digest).getUint32(0, false).toString(16);
fp32