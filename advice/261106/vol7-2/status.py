#!/usr/bin/env python3
"""Report per-paragraph completion status."""
import json
import os
import sys

ADIR = os.path.dirname(os.path.abspath(__file__))
PDIR = os.path.join(ADIR, "paragraphs")
IDX = os.path.join(ADIR, "paragraph-index.json")


def main():
    n = json.load(open(IDX, encoding="utf-8"))["count"]
    have = {int(f[1:4]) for f in os.listdir(PDIR)
            if f.startswith("p") and f.endswith(".json") and f[1:4].isdigit()}
    missing = [i for i in range(1, n + 1) if i not in have]
    print(f"{len(have)}/{n}")
    if missing:
        rng, start, prev = [], missing[0], missing[0]
        for m in missing[1:]:
            if m == prev + 1:
                prev = m
                continue
            rng.append((start, prev))
            start = prev = m
        rng.append((start, prev))
        print("missing:", ",".join(f"{a}" if a == b else f"{a}-{b}" for a, b in rng))
        if len(sys.argv) > 1:
            print("next:", ",".join(str(x) for x in missing[:int(sys.argv[1])]))


if __name__ == "__main__":
    main()