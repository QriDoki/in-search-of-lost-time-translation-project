#!/usr/bin/env python3
"""Apply per-paragraph edit JSONs to the dev translation.

Usage:
  python3 apply_edits.py --json 001 002 ...      # apply these paragraphs
  python3 apply_edits.py --all                   # apply all existing JSONs
  python3 apply_edits.py --optional 005          # also include optional edits
Reports which edits failed to apply (old string not found or not unique).
"""
import argparse
import json
import os
import re
import sys

ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, "../../.."))
DEV = os.path.join(ROOT, "polish/dev/chapters/polished-vol7-1.md")
PDIR = os.path.join(ADIR, "paragraphs")


def load_blocks(path):
    text = open(path, encoding="utf-8").read()
    parts = re.split(r"\n\s*\n", text)
    out = []
    line = 1
    for b in parts:
        n = b.count("\n") + 1
        out.append({"text": b, "line": line, "raw": b})
        line += n + 1
    return out, text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", nargs="*", default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--optional", nargs="*", default=[])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.all:
        ids = sorted(
            int(f[1:4]) for f in os.listdir(PDIR) if re.fullmatch(r"p\d{3}\.json", f)
        )
    else:
        ids = [int(x) for x in args.json]
    opt_ids = {int(x) for x in args.optional}

    blocks, text = load_blocks(DEV)
    # body starts at block index 1 (block 0 is heading)
    stats = {"applied": 0, "failed": 0, "paragraphs": 0, "changed": 0}
    failures = []

    for pid in ids:
        jp = os.path.join(PDIR, f"p{pid:03d}.json")
        if not os.path.exists(jp):
            failures.append((pid, "missing json", ""))
            continue
        data = json.load(open(jp, encoding="utf-8"))
        edits = list(data.get("edits") or [])
        if pid in opt_ids:
            edits += list(data.get("optional") or [])
        if not edits:
            stats["paragraphs"] += 1
            continue

        bi = pid  # body block index == paragraph id
        if bi >= len(blocks):
            failures.append((pid, "block out of range", ""))
            continue
        cur = blocks[bi]["text"]
        before = cur
        n_ok = 0
        for e in edits:
            old, new = e.get("old", ""), e.get("new", "")
            if not old:
                failures.append((pid, "empty old", ""))
                continue
            cnt = cur.count(old)
            if cnt != 1:
                failures.append((pid, f"old occurs {cnt}x", old[:60]))
                stats["failed"] += 1
                continue
            cur = cur.replace(old, new, 1)
            n_ok += 1
            stats["applied"] += 1
        blocks[bi]["text"] = cur
        stats["paragraphs"] += 1
        if cur != before:
            stats["changed"] += 1

    if not args.dry_run:
        new_text = "\n\n".join(b["text"].strip("\n") for b in blocks) + "\n"
        open(DEV, "w", encoding="utf-8").write(new_text)

    print(json.dumps(stats, ensure_ascii=False))
    for f in failures:
        print("FAIL", f[0], f[1], f[2], file=sys.stderr)


if __name__ == "__main__":
    main()
