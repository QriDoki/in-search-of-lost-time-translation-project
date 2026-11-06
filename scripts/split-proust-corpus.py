#!/usr/bin/env python3
"""Export the untouched Proust corpus text and partition it into 32 local chapters."""
import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / 'raw-proust-corpus'
BOOK_VOLUMES = {1: (1, 2), 2: (3, 5), 3: (6, 8), 4: (9, 10),
                5: (11, 12), 6: (13, 13), 7: (14, 15)}
# These raw-md files put a synopsis before the narrative. It is only a locator;
# none of these raw-md blocks is ever copied into the output corpus.
SKIP_START_BLOCKS = {'vol9-4': 1, 'vol11-1': 1, 'vol11-2': 1,
                     'vol12-2': 1, 'vol14-2': 1, 'vol14-3': 1}
WORD = re.compile(r"\b\w+(?:[’'-]\w+)*\b")


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text).casefold()
                   if c.isalnum() and not unicodedata.combining(c))


def word_count(paragraphs):
    return sum(len(WORD.findall(p['text'])) for p in paragraphs)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                    encoding='utf-8')


def locate(block, paragraphs, end=False):
    """Vote with independent exact normalized anchors; tolerate edition typos."""
    needle = normalized(block)
    if end:
        anchors = [needle[-100:]]
    else:
        anchors = [needle[i:i + 80] for i in range(0, min(400, len(needle)), 80)
                   if len(needle[i:i + 80]) >= 30]
        if not anchors:
            anchors = [needle]
    votes = Counter()
    evidence = {}
    for anchor in anchors:
        hits = [i for i, p in enumerate(paragraphs)
                if anchor in normalized(p['text'])]
        if len(hits) == 1:
            votes[hits[0]] += 1
            evidence.setdefault(hits[0], []).append(anchor)
    assert votes, f'No unique corpus anchor for {block[:100]!r}'
    candidates = votes.most_common()
    best, score = candidates[0]
    assert len(candidates) == 1 or score > candidates[1][1], candidates
    assert score >= min(2, len(anchors)), (block[:100], candidates)
    p = paragraphs[best]
    # Start anchors must be close to the beginning of the corpus paragraph;
    # end anchors must reach its end. Never cut a sentence or HTML fragment.
    text = normalized(p['text'])
    if end:
        assert text.endswith(anchors[0]), p['id']
    else:
        assert any(text.find(a) <= 100 for a in evidence[best]), p['id']
    return best, {'paragraph_id': p['id'], 'raw_excerpt': block[-200:] if end else block[:200],
                  'matched_anchors': evidence[best]}


def main():
    chapter_map = (ROOT / 'polish/dev/chapter-map.md').read_text(encoding='utf-8')
    pairs = re.findall(r'\| (vol\d+-\d+) \|.*?\[raw-md/([^\]]+)\]', chapter_map)
    assert len(pairs) == len(set(ch for ch, _ in pairs)) == 32
    output = CORPUS / 'chapters'
    output.mkdir(exist_ok=True)
    manifest = {'source_index': 'index.json', 'text_file': 'corpus.txt',
                'text_separator': '\n\n', 'chapters': [], 'validation': {}}
    all_original, all_output = [], []
    source_hashes = {}
    for book, (low, high) in BOOK_VOLUMES.items():
        source_path = CORPUS / f'tome-{book}.json'
        source_hashes[source_path.name] = hashlib.sha256(source_path.read_bytes()).hexdigest()
        source = json.loads(source_path.read_text(encoding='utf-8'))
        original = [p for s in source['sections'] for p in s['paragraphs']]
        assert len(original) == source['paragraph_count']
        for s in source['sections']:
            assert word_count(s['paragraphs']) == s['word_count'], s['id']
        boundaries = []
        for chapter, relative in pairs:
            local_volume = int(re.search(r'vol(\d+)', chapter)[1])
            if not low <= local_volume <= high:
                continue
            raw_path = ROOT / 'raw-md' / relative
            blocks = [b.strip() for b in raw_path.read_text(encoding='utf-8').split('\n\n')
                      if b.strip() and not b.lstrip().startswith('#')]
            start, start_evidence = locate(blocks[SKIP_START_BLOCKS.get(chapter, 0)], original)
            end, end_evidence = locate(blocks[-1], original, end=True)
            boundaries.append({'chapter_id': chapter, 'raw_file': f'raw-md/{relative}',
                               'start': start, 'end': end,
                               'start_evidence': start_evidence, 'end_evidence': end_evidence})
        for i, boundary in enumerate(boundaries):
            start, end = boundary['start'], boundary['end']
            if i == 0:
                # Keep corpus-only dedication/editorial preface, absent in raw-md.
                assert start <= 1, boundary
                start = 0
            else:
                assert start == boundaries[i - 1]['end'] + 1, boundary
            if i == len(boundaries) - 1:
                assert end == len(original) - 1, boundary
            selected = original[start:end + 1]
            selected_ids = {p['id'] for p in selected}
            result = copy.deepcopy(source)
            result['sections'] = []
            for section in source['sections']:
                kept = [p for p in section['paragraphs'] if p['id'] in selected_ids]
                if not kept:
                    continue
                part = copy.deepcopy(section)
                part['paragraphs'] = copy.deepcopy(kept)
                part['word_count'] = word_count(kept)
                result['sections'].append(part)
            result['paragraph_count'] = len(selected)
            result['word_count'] = word_count(selected)
            name = boundary['chapter_id'] + '.json'
            write_json(output / name, result)
            # Read the written artifact back, checking every field of each paragraph.
            written = json.loads((output / name).read_text(encoding='utf-8'))
            recovered = [p for s in written['sections'] for p in s['paragraphs']]
            assert recovered == selected
            assert written.keys() == source.keys()
            for section in written['sections']:
                parent = next(s for s in source['sections'] if s['id'] == section['id'])
                assert section.keys() == parent.keys()
                assert {k: v for k, v in section.items() if k not in ('paragraphs', 'word_count')} == {
                    k: v for k, v in parent.items() if k not in ('paragraphs', 'word_count')}
            all_output.extend(recovered)
            manifest['chapters'].append({
                **{k: v for k, v in boundary.items() if k not in ('start', 'end')},
                'file': f'chapters/{name}', 'source_file': source_path.name,
                'first_paragraph_id': selected[0]['id'], 'last_paragraph_id': selected[-1]['id'],
                'paragraph_count': len(selected), 'word_count': result['word_count'],
                'preserved_leading_paragraphs': [p['id'] for p in original[start:boundary['start']]]})
            print(f'{name}: {selected[0]["id"]}–{selected[-1]["id"]}, {len(selected)} paragraphs')
        all_original.extend(original)
    assert all_output == all_original, 'Output must preserve every paragraph in order, byte for byte in each field'
    assert len({p['id'] for p in all_output}) == len(all_original)
    expected_text = '\n\n'.join(p['text'] for p in all_original) + '\n'
    (CORPUS / 'corpus.txt').write_text(expected_text, encoding='utf-8')
    assert (CORPUS / 'corpus.txt').read_text(encoding='utf-8') == expected_text
    assert len(list(output.glob('*.json'))) == 32
    index = json.loads((CORPUS / 'index.json').read_text(encoding='utf-8'))
    assert len(all_output) == index['total_paragraphs']
    assert word_count(all_output) == index['total_words']
    for name, digest in source_hashes.items():
        assert hashlib.sha256((CORPUS / name).read_bytes()).hexdigest() == digest
    manifest['validation'] = {'chapters': 32, 'paragraphs': len(all_output),
                              'words': word_count(all_output), 'paragraph_objects_equal': True,
                              'source_sha256': source_hashes,
                              'corpus_text_sha256': hashlib.sha256(expected_text.encode()).hexdigest()}
    write_json(CORPUS / 'chapter-map.json', manifest)
    print(f'Validated: 32 chapters, {len(all_output)} unchanged paragraphs, {word_count(all_output)} words')


if __name__ == '__main__':
    main()
