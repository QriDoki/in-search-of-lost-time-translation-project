#!/usr/bin/env python3
"""Build paragraph-index.json and per-paragraph agent inputs for vol7-3.

Splits both files on blank lines. The French file has two leading heading
blocks (# Chapitre premier, ### Maladie...); the dev file merges them into
one heading block. Leading heading blocks are skipped independently, then
body blocks must align 1:1 between French and Chinese.
"""
import hashlib
import json
import os
import re

ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, "../../.."))
SRC = os.path.join(ROOT, "raw-md/vol7/chapters/003.md")
DEV = os.path.join(ROOT, "polish/dev/chapters/polished-vol7-3.md")


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
    si = next(i for i, b in enumerate(src) if kind(b) == "body")
    di = next(i for i, b in enumerate(dev) if kind(b) == "body")
    assert all(kind(b) == "head" for b in src[:si]), "unexpected src prefix"
    assert all(kind(b) == "head" for b in dev[:di]), "unexpected dev prefix"
    src_body, dev_body = src[si:], dev[di:]
    assert len(src_body) == len(dev_body), (len(src_body), len(dev_body))
    assert all(kind(b) == "body" for b in src_body + dev_body), "non-body block"

    src_paras, dev_paras = [], []
    for n, (sb, db) in enumerate(zip(src_body, dev_body), 1):
        src_paras.append({"paragraph": n, "line": sb["line"], "text": sb["text"]})
        dev_paras.append({"paragraph": n, "line": db["line"], "text": db["text"]})
    n = len(src_paras)

    idx = {
        "source": {"path": "raw-md/vol7/chapters/003.md",
                   "sha256": sha(SRC), "paragraphs": src_paras},
        "translation": {"path": "polish/dev/chapters/polished-vol7-3.md",
                        "sha256": sha(DEV), "paragraphs": dev_paras},
        "count": n,
        "dev_body_start_block": di,
    }
    json.dump(idx, open(os.path.join(ADIR, "paragraph-index.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)

    idir = os.path.join(ADIR, "inputs")
    os.makedirs(idir, exist_ok=True)
    for i in range(n):
        sp, dp = src_paras[i], dev_paras[i]
        prev = dev_paras[i - 1]["text"] if i else "（本段为正文第一段，无上一段。）"
        md = f"""# 第{i + 1:03d}段审校输入

- 法文：`raw-md/vol7/chapters/003.md` 第{sp['line']}行
- 译文：`polish/dev/chapters/polished-vol7-3.md` 第{dp['line']}行

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