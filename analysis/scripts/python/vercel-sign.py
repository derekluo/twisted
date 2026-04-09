#!/usr/bin/env python3
"""
Twisted VM X-Twisted-Sign 签名生成器 (纯 Python)

基于 twisted/example/fingerprint.js 源码实现。
生成与 Vercel 版 runtime.js 完全一致的 X-Twisted-Sign header。

Usage:
    python3 scripts/python/vercel-sign.py                       # 生成签名
    python3 scripts/python/vercel-sign.py --json                # JSON 输出
    python3 scripts/python/vercel-sign.py --fetch URL           # 带签名发起请求
    python3 scripts/python/vercel-sign.py --ua "Chrome/146"     # 自定义 UA
"""

import argparse
import hashlib
import json
import os
import random
import sys
import time
import urllib.request
import urllib.error
from dataclasses import asdict, dataclass, field
from typing import Optional


# ── 指纹配置 ────────────────────────────────────────────────────

@dataclass
class BrowserFingerprint:
    """浏览器指纹 — 对应 getFingerprint() 的 10 个维度"""

    ua: str = ""
    lang: str = "zh-CN"
    platform: str = "MacIntel"
    hc: int = 8
    tz: str = "Asia/Shanghai"
    canvas: str = ""       # Canvas 2D → SHA-256 hash
    webgl: str = ""        # vendor|renderer|extensions
    gpu: str = ""          # UNMASKED_RENDERER_WEBGL
    plugins: str = ""      # navigator.plugins 枚举
    fonts: str = ""        # 字体检测结果
    net: str = ""          # effectiveType|downlink|rtt


@dataclass
class AntiDebugData:
    """反调试数据 — 必须返回"正常"值"""

    debugger: list = field(default_factory=lambda: [49.5, 0, False])
    automation: list = field(default_factory=lambda: [
        "",       # dectectCdp() 返回值
        False,    # navigator.webdriver
        False,    # !ua.includes("HeadlessChrome")
        False,    # !ua.includes("Headless")
        1920,     # outerWidth
        1080,     # outerHeight
        0,        # screenX
        0,        # screenY
        False,    # _Selenium_IDE_Anchor
        False,    # callPhantom
        False,    # __puppeteer_evaluation_script__
        False,    # __playwright_evaluation_script__
    ])
    hook: list = field(default_factory=lambda: [
        False,    # !(console.toString() === "[object console]")
        False,    # !(eval.toString() === "function eval() { [native code] }")
        False,    # !(eval.name === "eval")
        False,    # (eval.length === 0)  ← 注意: JS 源码中是 (eval.length === 0), 正常浏览器的 eval.length 就是 0
    ])


# ── 默认指纹模板 ────────────────────────────────────────────────

UA_TEMPLATES = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ver}.0.{build}.{patch} Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ver}.0.{build}.{patch} Safari/537.36",
]

PLATFORMS = {
    "MacIntel": {"tz": ["Asia/Shanghai", "America/New_York"], "hc": [4, 8, 10, 12]},
    "Win32": {"tz": ["Asia/Shanghai", "America/New_York"], "hc": [4, 8, 12, 16]},
    "Linux x86_64": {"tz": ["Asia/Shanghai", "America/New_York"], "hc": [2, 4, 8, 16]},
}

# 常见 GPU 渲染器 (Mac)
GPU_RENDERERS = [
    "Apple M1",
    "Apple M1 Pro",
    "Apple M1 Max",
    "Apple M2",
    "Apple M2 Pro",
    "Apple M2 Max",
    "Apple M3",
    "Apple M3 Pro",
]

WEBGL_VENDORS = ["Google Inc. (Apple)", "Google Inc. (Intel)", "Google Inc. (NVIDIA)"]

WEBGL_EXTENSIONS = [
    "ANGLE_instanced_arrays,EXT_blend_minmax,EXT_color_buffer_half_float,EXT_float_blend,"
    "EXT_frag_depth,EXT_shader_texture_lod,EXT_texture_compression_bzip2,"
    "EXT_texture_filter_anisotropic,EXT_sRGB,OES_element_index_uint,"
    "OES_fbo_render_mipmap,OES_standard_derivatives,OES_texture_float,"
    "OES_texture_float_linear,OES_texture_half_float,OES_texture_half_float_linear,"
    "OES_vertex_array_object,WEBGL_color_buffer_float,WEBGL_compressed_texture_s3tc,"
    "WEBGL_compressed_texture_s3tc_srgb,WEBGL_debug_renderer_info,WEBGL_depth_texture,"
    "WEBGL_draw_buffers,WEBGL_lose_context,WEBGL_multi_draw"
]


def random_chrome_version():
    ver = random.choice([120, 121, 122, 123, 124, 125, 126, 130, 131, 132, 133, 134,
                         135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146])
    return ver, random.randint(5000, 9999), random.randint(50, 300)


def random_canvas_hash():
    """模拟 Canvas SHA-256 hash (64 位十六进制)"""
    return hashlib.sha256(os.urandom(64)).hexdigest()


def random_fingerprint() -> BrowserFingerprint:
    platform = random.choice(list(PLATFORMS.keys()))
    config = PLATFORMS[platform]
    ver, build, patch = random_chrome_version()
    ua = random.choice(UA_TEMPLATES).format(ver=ver, build=build, patch=patch)
    gpu = random.choice(GPU_RENDERERS)
    vendor = random.choice(WEBGL_VENDORS)
    exts = random.choice(WEBGL_EXTENSIONS)

    return BrowserFingerprint(
        ua=ua,
        lang="zh-CN",
        platform=platform,
        hc=random.choice(config["hc"]),
        tz=random.choice(config["tz"]),
        canvas=random_canvas_hash(),
        webgl=f"{vendor}|{gpu}|{exts}",
        gpu=gpu,
        plugins="PDF Viewer,Chrome PDF Plugin,Chrome PDF Viewer",
        fonts="Arial,Verdana",
        net="4g|10|50",
    )


# ── 签名计算 ────────────────────────────────────────────────────

def sha256_hex(data: str) -> str:
    """对应 JS 的 getHashValue()"""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_sign(fp: BrowserFingerprint, anti_debug: AntiDebugData) -> dict:
    """
    对应 JS 的 getSign():
      payload = { fingerprint, debugger, automation, hook }
      signString = JSON.stringify(payload) + "|" + Date.now() + "|" + Math.floor(Math.random() * 10000)
      return SHA-256(signString)
    """
    payload = {
        "fingerprint": {
            "ua": fp.ua,
            "lang": fp.lang,
            "platform": fp.platform,
            "hc": fp.hc,
            "tz": fp.tz,
            "canvas": fp.canvas,
            "webgl": fp.webgl,
            "gpu": fp.gpu,
            "plugins": fp.plugins,
            "fonts": fp.fonts,
            "net": fp.net,
        },
        "debugger": anti_debug.debugger,
        "automation": anti_debug.automation,
        "hook": anti_debug.hook,
    }

    # JSON.stringify 默认行为: 键不排序, 无空格
    # JS 的 JSON.stringify 会按照对象字面量顺序输出
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    # Date.now() 毫秒时间戳 + Math.floor(Math.random() * 10000)
    timestamp = str(int(time.time() * 1000))
    nonce = str(random.randint(0, 9999))

    sign_string = f"{payload_json}|{timestamp}|{nonce}"
    sign = sha256_hex(sign_string)

    return {
        "sign": sign,
        "sign_string": sign_string,
        "payload": payload,
        "timestamp": timestamp,
        "nonce": nonce,
    }


# ── HTTP 请求 ────────────────────────────────────────────────────

def fetch_with_sign(url: str, sign_result: dict, method: str = "GET") -> dict:
    """带 X-Twisted-Sign header 发起 HTTP 请求"""
    req = urllib.request.Request(url, method=method)
    req.add_header("X-Twisted-Sign", sign_result["sign"])
    req.add_header("User-Agent", sign_result["payload"]["fingerprint"]["ua"])

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "status": resp.status,
                "headers": dict(resp.headers),
                "body": body[:2000],
                "sign": sign_result["sign"],
            }
    except urllib.error.HTTPError as e:
        return {
            "status": e.code,
            "error": str(e),
            "sign": sign_result["sign"],
        }
    except Exception as e:
        return {
            "status": 0,
            "error": str(e),
            "sign": sign_result["sign"],
        }


# ── CLI ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Twisted VM X-Twisted-Sign 签名生成器")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    parser.add_argument("--fetch", metavar="URL", help="带签名发起 HTTP 请求")
    parser.add_argument("--ua", help="自定义 User-Agent")
    parser.add_argument("--lang", default="zh-CN", help="语言")
    parser.add_argument("--platform", help="平台 (MacIntel/Win32/Linux x86_64)")
    parser.add_argument("--hc", type=int, help="CPU 核心数")
    parser.add_argument("--tz", default="Asia/Shanghai", help="时区")
    parser.add_argument("--canvas-hash", help="自定义 Canvas hash (64位十六进制)")
    parser.add_argument("-n", type=int, default=1, help="生成 N 个签名")
    parser.add_argument("--pretty", action="store_true", help="Pretty print")
    args = parser.parse_args()

    indent = 2 if args.pretty else None

    for _ in range(args.n):
        fp = random_fingerprint()
        if args.ua:
            fp.ua = args.ua
        if args.platform:
            fp.platform = args.platform
        if args.hc:
            fp.hc = args.hc
        if args.canvas_hash:
            fp.canvas = args.canvas_hash

        anti_debug = AntiDebugData()
        result = compute_sign(fp, anti_debug)

        if args.fetch:
            resp = fetch_with_sign(args.fetch, result)
            print(json.dumps(resp, indent=indent, ensure_ascii=False))
        elif args.json or args.n > 1:
            print(json.dumps(result, indent=indent, ensure_ascii=False))
        else:
            print(f"X-Twisted-Sign: {result['sign']}")
            print(f"Timestamp:      {result['timestamp']}")
            print(f"Nonce:          {result['nonce']}")
            print(f"UA:             {fp.ua}")
            print(f"Platform:       {fp.platform}")
            print(f"TZ:             {fp.tz}")
            print(f"Canvas:         {fp.canvas[:32]}...")


if __name__ == "__main__":
    main()
