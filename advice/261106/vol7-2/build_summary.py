#!/usr/bin/env python3
"""Build vol7-2.md summary + applied.json from per-paragraph reports."""
import hashlib
import json
import os

ADIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(ADIR, "../../.."))
PDIR = os.path.join(ADIR, "paragraphs")
DEV = os.path.join(ROOT, "polish/dev/chapters/polished-vol7-2.md")
IDX = os.path.join(ADIR, "paragraph-index.json")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    idx = json.load(open(IDX, encoding="utf-8"))
    n = idx["count"]
    have_md, have_json = [], []
    total_edits = 0
    total_opt = 0
    changed = []
    by_type = {}
    rows = []
    for i in range(1, n + 1):
        md = os.path.join(PDIR, f"p{i:03d}.md")
        js = os.path.join(PDIR, f"p{i:03d}.json")
        has_md, has_js = os.path.exists(md), os.path.exists(js)
        if has_md:
            have_md.append(i)
        if has_js:
            have_json.append(i)
        ne = no = 0
        types = []
        if has_js:
            d = json.load(open(js, encoding="utf-8"))
            ne = len(d.get("edits") or [])
            no = len(d.get("optional") or [])
            types = sorted({e.get("type", "?") for e in (d.get("edits") or [])})
            for e in d.get("edits") or []:
                t = e.get("type", "?")
                by_type[t] = by_type.get(t, 0) + 1
            if ne:
                changed.append(i)
        total_edits += ne
        total_opt += no
        if ne or no:
            rows.append((i, ne, no, "、".join(types) or "—"))

    applied = {
        "reviewed_paragraphs": len(have_md),
        "paragraphs_with_edits": len(changed),
        "edits": total_edits,
        "optional_suggested": total_opt,
        "by_type": by_type,
        "translation_after_sha256": sha(DEV),
        "complete": len(have_md) == n and len(have_json) == n,
        "missing_md": [i for i in range(1, n + 1) if i not in have_md],
        "missing_json": [i for i in range(1, n + 1) if i not in have_json],
    }
    json.dump(applied, open(os.path.join(ADIR, "applied.json"), "w",
                            encoding="utf-8"), ensure_ascii=False, indent=2)

    lines = [
        "# vol7-2 逐段审校汇总",
        "",
        "依据 `docs/chapter-map.md`，法文 `raw-md/vol7/chapters/002.md` 对译文 "
        "`polish/dev/chapters/polished-vol7-2.md`（《盖尔芒特家那边》第二部·第一章：外祖母的病与去世）逐段审校。",
        "",
        f"- 正文段落：**{n}**，已完成报告 **{len(have_md)}** 段。",
        f"- 明确问题合计 **{total_edits}** 项，涉及 **{len(changed)}** 段；可选润色 **{total_opt}** 项。",
        "",
        "## 逐段索引",
        "",
        "| 段 | 明确问题 | 可选润色 | 类型 | 报告 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for i, ne, no, types in rows:
        lines.append(f"| {i:03d} | {ne} | {no} | {types} | [p{i:03d}.md](./paragraphs/p{i:03d}.md) |")
    if not rows:
        lines.append("| — | — | — | — | — |")
    open(os.path.join(ADIR, "vol7-2.md"), "w",
         encoding="utf-8").write("\n".join(lines) + "\n")
    print(json.dumps({k: applied[k] for k in
                      ("reviewed_paragraphs", "paragraphs_with_edits", "edits",
                       "optional_suggested", "complete")}, ensure_ascii=False))


if __name__ == "__main__":
    main()