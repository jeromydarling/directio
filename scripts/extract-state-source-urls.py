#!/usr/bin/env python3
"""
Parse the markdown research files in /tmp/state-research/ and emit
SQL INSERT statements that populate state_source_page rows. These
are the URLs the cron monitor will hash + watch for material
changes.

Usage:
    python3 scripts/extract-state-source-urls.py [SRC_DIR] > /tmp/insert-sources.sql
    npx wrangler d1 execute directio-dev --local --file /tmp/insert-sources.sql
    # then once more with --remote
"""
import json
import os
import re
import sys
import time
import uuid

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/state-research"

def extract_urls(text: str) -> list[str]:
    # The markdown ends with a fenced JSON block titled "Source URLs"
    m = re.search(
        r"##\s*Source URLs\s*\n+```json\s*\n+(\[.*?\])\s*\n+```",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    try:
        return [u for u in json.loads(m.group(1)) if isinstance(u, str)]
    except json.JSONDecodeError:
        return []

def kind_of(url: str) -> str:
    u = url.lower()
    if "permit" in u or "learner" in u:
        return "permit"
    if "form" in u:
        return "forms"
    if "fee" in u or "cost" in u:
        return "fees"
    if "school" in u or "instructor" in u:
        return "school"
    return "gdl"

def sql_escape(s: str) -> str:
    return s.replace("'", "''")

now_ms = int(time.time() * 1000)
seen: set[tuple[str, str]] = set()
files = sorted(
    f for f in os.listdir(SRC_DIR)
    if f.endswith(".md") and len(f) == 5  # e.g. MN.md
)

if not files:
    sys.stderr.write(f"no .md files in {SRC_DIR}\n")
    sys.exit(0)

for fname in files:
    state = fname[:2].upper()
    path = os.path.join(SRC_DIR, fname)
    with open(path) as fp:
        text = fp.read()
    urls = extract_urls(text)
    for url in urls:
        url = url.strip()
        if not url.startswith("http"):
            continue
        key = (state, url)
        if key in seen:
            continue
        seen.add(key)
        sid = "src_" + uuid.uuid4().hex[:24]
        print(
            f"INSERT OR IGNORE INTO state_source_page "
            f"(id, stateCode, url, kind, active, createdAt, updatedAt) "
            f"VALUES ('{sid}', '{state}', '{sql_escape(url)}', '{kind_of(url)}', 1, {now_ms}, {now_ms});"
        )

sys.stderr.write(f"emitted INSERTs for {len(seen)} unique URLs across {len(files)} states\n")
