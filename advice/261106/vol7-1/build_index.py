#!/usr/bin/env python3
"""Build paragraph-index.json and per-paragraph agent inputs for vol7-1.

Splits both files on blank lines; block 0 is the heading block and is not
numbered. Body blocks must align 1:1 between French and Chinese.
"""
import hashlib
import json
import os
import re

ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, "../../.."))
SRC = os.path.join(ROOT, "raw-md/vol7/chapters/001.md")
DEV = os.path.join(ROOT, "polish/dev/chapters/polished-vol7-1.md")


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def blocks(path):
    text = open(path, encoding="utf-8").read()
    out = []
    line = 1
    for b in re.split(r"\n\s*\n", text.strip()):
        if b.strip():
            out.append({"line": line, "text": b.strip()})
        line += b.count("\n") + 2
    return out


def kind(b):
    s = b["text"]
    if s.startswith("🥒"):
        return "break"
    if s.startswith("#"):
        return "head"
    return "body"


def main():
    src, dev = blocks(SRC), blocks(DEV)
    assert len(src) == len(dev), (len(src), len(dev))
    assert [kind(b) for b in src] == [kind(b) for b in dev], "block kinds differ"
    assert kind(src[0]) == "head"

    src_paras, dev_paras = [], []
    n = 0
    for i in range(1, len(src)):
        if kind(src[i]) != "body":
            continue
        n += 1
        src_paras.append({"paragraph": n, "line": src[i]["line"],
                          "text": src[i]["text"]})
        dev_paras.append({"paragraph": n, "line": dev[i]["line"],
                          "text": dev[i]["text"]})

    idx = {
        "source": {"path": "raw-md/vol7/chapters/001.md",
                   "sha256": sha(SRC), "paragraphs": src_paras},
        "translation": {"path": "polish/dev/chapters/polished-vol7-1.md",
                        "sha256": sha(DEV), "paragraphs": dev_paras},
        "count": n,
    }
    json.dump(idx, open(os.path.join(ADIR, "paragraph-index.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)

    idir = os.path.join(ADIR, "inputs")
    os.makedirs(idir, exist_ok=True)
    for i in range(n):
        sp, dp = src_paras[i], dev_paras[i]
        prev = dev_paras[i - 1]["text"] if i else "（本段为正文第一段，无上一段。）"
        md = f"""# 第{i + 1:03d}段审校输入

- 法文：`raw-md/vol7/chapters/001.md` 第{sp['line']}行
- 译文：`polish/dev/chapters/polished-vol7-1.md` 第{dp['line']}行

## 上一段译文（基线稿，仅供理解指代与语气，不在本次审校范围）

{prev}

## 法文原文（本段）

{sp['text']}

## 现译（本段）

{dp['text']}
"""
        open(os.path.join(idir, f"p{i + 1:03d}.md"), "w",
             encoding="utf-8").write(md)
    print(json.dumps({"count": n, "inputs": n}, ensure_ascii=False))


if __name__ == "__main__":
    main()