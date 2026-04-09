#!/usr/bin/env python3
"""
XHS TwistedRuntime Fingerprint Generator

Generates browser fingerprint data compatible with the XHS Twisted VM
anti-scrape system. Uses the Node.js runtime.js VM to compute the hash,
or falls back to a pure Python implementation.

Usage:
    python3 scripts/python/xhs-fingerprint.py                     # Random fingerprint
    python3 scripts/python/xhs-fingerprint.py --json              # JSON output
    python3 scripts/python/xhs-fingerprint.py --ua "Chrome/146"   # Custom UA
    python3 scripts/python/xhs-fingerprint.py --canvas-hash ABC   # Custom canvas hash
"""

import argparse
import hashlib
import json
import os
import random
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).resolve().parent
ANALYSIS_DIR = SCRIPT_DIR.parents[1]
HASH_VM_JS = ANALYSIS_DIR / "scripts" / "js" / "hash-vm.js"


@dataclass
class BrowserFingerprint:
    """Browser fingerprint configuration."""

    canvas: str = ""
    tz: str = "Asia/Shanghai"
    hc: int = 8  # hardwareConcurrency
    platform: str = "MacIntel"
    lang: str = "zh-CN"
    ua: str = ""

    def to_json(self) -> str:
        fp = {
            "canvas": self.canvas,
            "tz": self.tz,
            "hc": self.hc,
            "platform": self.platform,
            "lang": self.lang,
            "ua": self.ua,
        }
        return json.dumps(fp, separators=(",", ":"))

    def to_vm_args(self) -> dict:
        """Convert to arguments for the Node.js VM runner."""
        return {
            "canvas": self.canvas,
            "tz": self.tz,
            "hc": self.hc,
            "platform": self.platform,
            "lang": self.lang,
            "ua": self.ua,
        }


# ── Realistic fingerprint profiles ────────────────────────────

CHROME_UA_TEMPLATES = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ver} Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ver} Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{ver} Safari/537.36",
]

FIREFOX_UA_TEMPLATES = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
]

PLATFORMS = {
    "MacIntel": {"tz_options": ["Asia/Shanghai", "America/New_York"], "hc_options": [4, 8, 10, 12]},
    "Win32": {"tz_options": ["Asia/Shanghai", "America/New_York", "Europe/London"], "hc_options": [4, 8, 12, 16]},
    "Linux x86_64": {"tz_options": ["Asia/Shanghai", "America/New_York"], "hc_options": [2, 4, 8, 16]},
}

LANG_OPTIONS = ["zh-CN", "zh-TW", "en-US", "en-GB", "ja-JP", "ko-KR"]


def random_chrome_version() -> str:
    """Generate a realistic Chrome version string."""
    major = random.choice([120, 121, 122, 123, 124, 125, 126, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146])
    return f"{major}.0.{random.randint(5000, 9999)}.{random.randint(50, 300)}"


def random_canvas_hash() -> str:
    """Generate a random canvas fingerprint hash."""
    return hashlib.md5(os.urandom(32)).hexdigest()[:32]


def random_fingerprint() -> BrowserFingerprint:
    """Generate a random but realistic browser fingerprint."""
    platform = random.choice(list(PLATFORMS.keys()))
    config = PLATFORMS[platform]

    if random.random() < 0.85:
        # Chrome
        ua_template = random.choice(CHROME_UA_TEMPLATES)
        ua = ua_template.format(ver=random_chrome_version())
    else:
        # Firefox
        ua = random.choice(FIREFOX_UA_TEMPLATES)

    return BrowserFingerprint(
        canvas=random_canvas_hash(),
        tz=random.choice(config["tz_options"]),
        hc=random.choice(config["hc_options"]),
        platform=platform,
        lang=random.choice(LANG_OPTIONS),
        ua=ua,
    )


# ── Hash computation via Node.js VM ───────────────────────────

def compute_hash_vm(fp: BrowserFingerprint) -> str:
    """Compute hash by piping fingerprint to hash-vm.js via stdin."""
    if not HASH_VM_JS.exists():
        return '{"error":"hash-vm.js not found"}'

    try:
        result = subprocess.run(
            ["node", str(HASH_VM_JS)],
            input=json.dumps(fp.to_vm_args()),
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(ANALYSIS_DIR),
        )
        output = result.stdout.strip()
        if output.startswith("{"):
            return output
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return '{"error":"vm_failed"}'


def generate_fingerprint(
    canvas: Optional[str] = None,
    ua: Optional[str] = None,
    lang: Optional[str] = None,
    platform: Optional[str] = None,
    hc: Optional[int] = None,
    tz: Optional[str] = None,
    use_vm: bool = True,
) -> dict:
    """Generate a complete fingerprint with hash.

    Args:
        canvas: Canvas fingerprint hash (random if not provided)
        ua: User agent string (random Chrome if not provided)
        lang: Language (random if not provided)
        platform: Platform string (random if not provided)
        hc: Hardware concurrency (random if not provided)
        tz: Timezone (random if not provided)
        use_vm: Whether to use Node.js VM for hash computation

    Returns:
        dict with 'hash' and 'fingerprint' keys
    """
    fp = BrowserFingerprint(
        canvas=canvas or random_canvas_hash(),
        tz=tz or "Asia/Shanghai",
        hc=hc or random.choice([4, 8, 12, 16]),
        platform=platform or random.choice(list(PLATFORMS.keys())),
        lang=lang or random.choice(LANG_OPTIONS),
        ua=ua or random.choice(CHROME_UA_TEMPLATES).format(ver=random_chrome_version()),
    )

    if use_vm:
        result_str = compute_hash_vm(fp)
        try:
            result = json.loads(result_str)
            return result
        except json.JSONDecodeError:
            pass

    # Fallback: return fingerprint without hash
    return {
        "hash": "0x00000000",
        "fingerprint": {
            "canvas": fp.canvas,
            "tz": fp.tz,
            "hc": fp.hc,
            "platform": fp.platform,
            "lang": fp.lang,
            "ua": fp.ua,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="XHS Fingerprint Generator")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--ua", help="Custom User-Agent")
    parser.add_argument("--canvas-hash", help="Custom canvas hash")
    parser.add_argument("--lang", help="Language (e.g., zh-CN)")
    parser.add_argument("--platform", help="Platform (e.g., MacIntel)")
    parser.add_argument("--hc", type=int, help="Hardware concurrency")
    parser.add_argument("--tz", help="Timezone (e.g., Asia/Shanghai)")
    parser.add_argument("--no-vm", action="store_true", help="Skip VM hash computation")
    parser.add_argument("-n", type=int, default=1, help="Generate N fingerprints")
    parser.add_argument("--pretty", action="store_true", help="Pretty print")
    args = parser.parse_args()

    indent = 2 if args.pretty else None

    for _ in range(args.n):
        result = generate_fingerprint(
            canvas=args.canvas_hash,
            ua=args.ua,
            lang=args.lang,
            platform=args.platform,
            hc=args.hc,
            tz=args.tz,
            use_vm=not args.no_vm,
        )

        if args.json or args.n > 1:
            print(json.dumps(result, indent=indent, ensure_ascii=False))
        else:
            fp = result.get("fingerprint", {})
            print(f"Hash:       {result.get('hash', 'N/A')}")
            print(f"Canvas:     {fp.get('canvas', 'N/A')}")
            print(f"Timezone:   {fp.get('tz', 'N/A')}")
            print(f"Cores:      {fp.get('hc', 'N/A')}")
            print(f"Platform:   {fp.get('platform', 'N/A')}")
            print(f"Language:   {fp.get('lang', 'N/A')}")
            print(f"User-Agent: {fp.get('ua', 'N/A')}")


if __name__ == "__main__":
    main()
