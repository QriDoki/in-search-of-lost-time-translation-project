#!/usr/bin/env python3
"""Split wiki annotations into the 32 local chapters using French text evidence."""
import argparse
import bisect
import collections
import copy
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOK_VOLUMES = {1: (1, 2), 2: (3, 5), 3: (6, 8), 4: (9, 10),
                5: (11, 12), 6: (13, 13), 7: (14, 15)}


def normalized(text):
    text = unicodedata.normalize('NFKD', text).casefold()
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return re.findall(r'[a-z0-9]+', text)


def searchable(text):
    words = normalized(text)
    edges = {0}
    offset = 0
    for word in words:
        offset += len(word)
        edges.add(offset)
    return ''.join(words), edges


def matches(needle, paragraph):
    # Join words to tolerate Ver Meer/Vermeer, but require whole-word edges.
    text, edges = paragraph['_search']
    start = text.find(needle)
    while start >= 0:
        if start in edges and start + len(needle) in edges:
            return True
        start = text.find(needle, start + 1)
    return False


def excerpt(text, needle):
    # Keep a short context around the hit rather than repeating long Proust
    # paragraphs in every annotation in a chapter.
    chars, offsets = [], []
    for index, char in enumerate(text):
        for word in normalized(char):
            chars.extend(word)
            offsets.extend([index] * len(word))
    compact = ''.join(chars)
    pos = compact.find(needle)
    edges = searchable(text)[1]
    while pos >= 0 and not (pos in edges and pos + len(needle) in edges):
        pos = compact.find(needle, pos + 1)
    if pos < 0:
        return text[:260]
    start = max(0, offsets[pos] - 90)
    end = min(len(text), offsets[pos + len(needle) - 1] + 151)
    return ('…' if start else '') + text[start:end] + ('…' if end < len(text) else '')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'annos/wiki/chapters')
    args = parser.parse_args()
    source_path = ROOT / 'annos/wiki/wiki.json'
    source = json.loads(source_path.read_text())
    chapter_map = (ROOT / 'polish/dev/chapter-map.md').read_text()
    pairs = re.findall(r'\| (vol\d+-\d+) \| \[([^\]]+)\]\([^)]*\) \| \[([^\]]+)\]', chapter_map)
    assert len(pairs) == 32 and len({p[0] for p in pairs}) == 32
    chapters, paragraphs = {}, []
    book_ordinals = collections.Counter()
    for chapter, zh, fr in pairs:
        volume = int(re.search(r'/vol(\d+)/', fr)[1])
        book = next(b for b, (lo, hi) in BOOK_VOLUMES.items() if lo <= volume <= hi)
        chapters[chapter] = dict(chapter_id=chapter, book=book, raw_file=fr,
                                 translation_file=zh, annotations=[])
        text = (ROOT / fr).read_text()
        ordinal = 0
        for block in re.finditer(r'\S[^\n]*(?:\n(?!\s*\n)[^\n]+)*', text):
            content = block.group().strip()
            if content.startswith('#'):
                continue
            ordinal += 1
            book_ordinals[book] += 1
            paragraphs.append(dict(chapter_id=chapter, book=book,
                                   chapter_paragraph=ordinal,
                                   book_paragraph=book_ordinals[book],
                                   raw_line=text[:block.start()].count('\n') + 1,
                                   text=content, _search=searchable(content)))

    rules, hits_cache = [], {}
    source_p_rules = collections.defaultdict(list)
    for annotation_index, annotation in enumerate(source['annotations']):
        for target_index, target in enumerate(annotation['targets']):
            needle = ''.join(normalized(target['match']))
            if needle not in hits_cache:
                hits_cache[needle] = [i for i, p in enumerate(paragraphs) if matches(needle, p)]
            rule = dict(annotation_index=annotation_index, target_index=target_index,
                        target=target, hits=hits_cache[needle])
            rules.append(rule)
            for pid in target['paragraphs']:
                source_p_rules[pid].append(rule)

    # Joint evidence: all labels attached to the same external paragraph help
    # distinguish homonyms. No arithmetic conversion of external p-numbers.
    source_p_hits, methods = {}, {}
    for pid, attached in source_p_rules.items():
        book = int(re.fullmatch(r't(\d+)-p\d+', pid)[1])
        scores = collections.Counter(i for rule in attached for i in rule['hits']
                                     if paragraphs[i]['book'] == book)
        best = max(scores.values(), default=0)
        source_p_hits[pid] = sorted(i for i, score in scores.items() if score == best)
        methods[pid] = 'same_source_paragraph_cooccurrence' if best > 1 else 'match_within_book'

    # Only narrow repeated hits when unique text anchors on BOTH sides agree.
    anchors = collections.defaultdict(list)
    for pid, hits in source_p_hits.items():
        if len(hits) == 1:
            book, number = map(int, re.fullmatch(r't(\d+)-p(\d+)', pid).groups())
            anchors[book].append((number, hits[0]))
    for values in anchors.values():
        values.sort()
    for pid, hits in source_p_hits.items():
        if len(hits) < 2:
            continue
        book, number = map(int, re.fullmatch(r't(\d+)-p(\d+)', pid).groups())
        values = anchors[book]
        pos = bisect.bisect_left([v[0] for v in values], number)
        if 0 < pos < len(values):
            lo, hi = values[pos - 1][1], values[pos][1]
            narrowed = [i for i in hits if lo <= i <= hi]
            if lo <= hi and narrowed:
                source_p_hits[pid] = narrowed
                methods[pid] = 'match_between_unique_text_anchors'

    unassigned, counts = [], collections.Counter()
    coverage = set()
    for rule in rules:
        ai, ti, target = rule['annotation_index'], rule['target_index'], rule['target']
        candidates = collections.defaultdict(list)
        if target['paragraphs']:
            for pid in target['paragraphs']:
                hits = source_p_hits[pid]
                if not hits:
                    unassigned.append((ai, ti, pid, 'external_paragraph_not_located'))
                for i in hits:
                    matched = i in rule['hits']
                    status = ('located_by_text' if matched and len(hits) == 1 else
                              'candidate' if matched else 'paragraph_located_match_missing')
                    candidates[i].append(dict(source_paragraph=pid, status=status,
                                               method=methods[pid]))
        else:
            for i in rule['hits']:
                candidates[i].append(dict(source_paragraph=None, status='text_match_candidate',
                                           method='whole_word_normalized_match'))
            if not candidates:
                unassigned.append((ai, ti, '', 'match_not_found'))

        unresolved_excludes = []
        for pid in target['exclude']:
            excluded = source_p_hits.get(pid, [])
            if len(excluded) == 1:
                candidates.pop(excluded[0], None)
            else:
                unresolved_excludes.append(pid)
        by_chapter = collections.defaultdict(list)
        for i, evidence in candidates.items():
            p = paragraphs[i]
            by_chapter[p['chapter_id']].append(dict(
                chapter_paragraph=p['chapter_paragraph'], raw_line=p['raw_line'],
                text_excerpt=excerpt(p['text'], ''.join(normalized(target['match']))),
                evidence=evidence))
            counts.update(e['status'] for e in evidence)
        for chapter, locations in by_chapter.items():
            entries = chapters[chapter]['annotations']
            entry = next((a for a in entries if a['id'] == source['annotations'][ai]['id']), None)
            if entry is None:
                entry = copy.deepcopy(source['annotations'][ai])
                entry['targets'] = []
                entries.append(entry)
            mapped_target = copy.deepcopy(target)
            mapped_target['mapping'] = dict(source_target_index=ti, locations=locations,
                                            unresolved_excludes=unresolved_excludes)
            entry['targets'].append(mapped_target)
            coverage.add((ai, ti))

    args.output.mkdir(parents=True, exist_ok=True)
    for chapter, content in chapters.items():
        payload = {k: v for k, v in source.items() if k not in ('annotations', 'count')}
        payload.update(split_schema_version=1, source_file='annos/wiki/wiki.json',
                       mapping_notice='本地文本匹配结果；candidate 须核对语境。外部段落编号不等于本地段号；text_excerpt 来自 raw-md，全文按 raw_file/raw_line 查阅。原始 targets 限制保留，排除编号未定位时见 unresolved_excludes。',
                       **content, count=len(content['annotations']))
        (args.output / f'{chapter}.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')

    lines = ['# Wiki 按 32 个 chapter 拆分', '',
             '生成命令：`python3 scripts/split-wiki-annotations.py`。原始 wiki.json 保持不变。', '',
             '每份 JSON 对应一个现有 chapter，保留原条目的描述、来源、图片等字段；targets 只收录归属本章的规则。跨章条目会重复出现。', '',
             '`mapping.locations` 包含匹配处附近的法文短摘录、行号、章内段号和定位依据；完整段落按 raw_file/raw_line 查阅，避免长段落在多个条目中重复膨胀。`translation_file` 指向对应中文开发稿，但尚未对齐中文句子或写入注释。', '',
             '- `located_by_text`：在七卷范围内，结合同一外部段落的其他匹配词或前后唯一锚点后，选出一个文本候选；仍需核验语义和外部段落边界。',
             '- `candidate`：指定外部段落仍有多处本地文本候选，保留供复核。',
             '- `paragraph_located_match_missing`：同编号其他规则定位到了段落，但本规则的词句未匹配，可能有版本差异。',
             '- `text_match_candidate`：原规则未指定段落，按词句收录全部本地候选，不保证每次出现都指同一对象。',
             '- `unresolved_excludes`：外部排除段落尚未准确定位，未擅自删除本地候选。', '',
             '匹配忽略大小写、重音、空白和标点，同时要求词边界。七卷搜索范围：t1→vol1–2，t2→vol3–5，t3→vol6–8，t4→vol9–10，t5→vol11–12，t6→vol13，t7→vol14–15。', '',
             f"源条目 {len(source['annotations'])}；源规则 {len(rules)}；至少分配至一章的规则 {len(coverage)}；未分配规则 {len(rules)-len(coverage)}。", '',
             '| chapter | 条目数 | 规则数 |', '| --- | ---: | ---: |']
    for chapter, content in chapters.items():
        lines.append(f"| [{chapter}]({chapter}.json) | {len(content['annotations'])} | {sum(len(a['targets']) for a in content['annotations'])} |")
    lines += ['', '## 未定位的规则或外部段落', '',
              '以下列表引用原始 wiki.json 的条目 ID 和从 0 起的 target 索引；未猜测归属。部分规则已分配其他外部段落，仍可能在本列表出现。', '',
              '| 条目 ID | target 索引 | 匹配词 | 外部段落 | 原因 |', '| --- | ---: | --- | --- | --- |']
    for ai, ti, pid, reason in unassigned:
        a = source['annotations'][ai]
        match = a['targets'][ti]['match'].replace('|', '\\|').replace('\n', ' ')
        lines.append(f"| {a['id']} | {ti} | {match} | {pid} | {reason} |")
    (args.output / 'README.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps(dict(chapters=len(chapters), source_annotations=len(source['annotations']),
                          source_targets=len(rules), assigned_targets=len(coverage),
                          unassigned_targets=len(rules)-len(coverage),
                          unresolved_records=len(unassigned), evidence_counts=counts), ensure_ascii=False))


if __name__ == '__main__':
    main()
