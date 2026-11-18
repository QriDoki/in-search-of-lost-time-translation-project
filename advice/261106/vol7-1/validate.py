#!/usr/bin/env python3
"""Structural validation for vol7-1 polish pass."""
import hashlib
import json
import os
import re
import subprocess

ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, "../../.."))
PDIR = os.path.join(ADIR, "paragraphs")
IDX = os.path.join(ADIR, "paragraph-index.json")
DEV = os.path.join(ROOT, "polish/dev/chapters/polished-vol7-1.md")
SRC = os.path.join(ROOT, "raw-md/vol7/chapters/001.md")


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def blocks(path):
    text = open(path, encoding="utf-8").read()
    return [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]


def main():
    idx = json.load(open(IDX, encoding="utf-8"))
    n = idx["count"]
    src_blocks = blocks(SRC)
    dev_blocks = blocks(DEV)

    # replay all edits from scratch on the baseline translation
    baseline = [p["text"] for p in idx["translation"]["paragraphs"]]
    replay = list(baseline)
    replay_fail = []
    ann_delta = []
    for i in range(1, n + 1):
        jp = os.path.join(PDIR, f"p{i:03d}.json")
        if not os.path.exists(jp):
            replay_fail.append((i, "missing"))
            continue
        d = json.load(open(jp, encoding="utf-8"))
        cur = replay[i - 1]
        for e in d.get("edits") or []:
            old = e.get("old", "")
            if cur.count(old) != 1:
                replay_fail.append((i, f"old x{cur.count(old)}: {old[:40]}"))
                continue
            cur = cur.replace(old, new := e.get("new", ""), 1)
        replay[i - 1] = cur

    dev_body = dev_blocks[1:]
    replay_ok = len(dev_body) == n and all(
        a == b for a, b in zip(replay, dev_body))

    ann = re.compile(r"⊂.*?⊃≼.*?≽", re.S)
    src_ann = len(ann.findall(open(SRC, encoding="utf-8").read()))
    base_ann = sum(len(ann.findall(t)) for t in baseline)
    dev_ann = sum(len(ann.findall(t)) for t in dev_body)

    out = {
        "reports_markdown": sum(os.path.exists(os.path.join(PDIR, f"p{i:03d}.md"))
                                for i in range(1, n + 1)),
        "reports_json": sum(os.path.exists(os.path.join(PDIR, f"p{i:03d}.json"))
                            for i in range(1, n + 1)),
        "paragraph_count": n,
        "dev_paragraph_count": len(dev_body),
        "source_unchanged": sha(SRC) == idx["source"]["sha256"],
        "replay_matches_dev": replay_ok,
        "replay_failures": replay_fail[:20],
        "annotations_baseline": base_ann,
        "annotations_after": dev_ann,
        "annotation_count_preserved": base_ann == dev_ann,
        "dev_sha256": sha(DEV),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
