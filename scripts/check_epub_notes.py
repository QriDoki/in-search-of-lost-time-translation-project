#!/usr/bin/env python3
"""检查 EPUB XHTML、内部链接和编号注解；仅使用 Python 标准库。"""

import argparse
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import BadZipFile, ZipFile


EPUB_TYPE = '{http://www.idpf.org/2007/ops}type'
XHTML = '{http://www.w3.org/1999/xhtml}'
RETURN_PREFIX = 'epub-note-ref-'


def has_token(element, attribute, token):
    return token in element.get(attribute, '').split()


def validate_epub(file):
    """成功时返回注解数量；结构或往返链接错误时抛出 ValueError。"""
    def require(condition, message):
        if not condition:
            raise ValueError(f'{file.name}: {message}')

    with ZipFile(file) as archive:
        names = set(archive.namelist())
        documents = {
            name: ET.fromstring(archive.read(name))
            for name in names if name.endswith('.xhtml')
        }
    require(bool(documents), '未找到 XHTML 文档')

    ids = {}
    return_ids = set()
    for name, document in documents.items():
        ids[name] = {}
        for element in document.iter():
            identifier = element.get('id')
            if identifier is None:
                continue
            require(identifier not in ids[name], f'{name}: 重复 ID {identifier}')
            ids[name][identifier] = element
            if identifier.startswith(RETURN_PREFIX):
                require(identifier not in return_ids, f'全书重复返回锚点 {identifier}')
                return_ids.add(identifier)

    def resolve(name, href):
        link = urlsplit(href)
        if link.scheme or link.netloc:
            return None
        target_name = posixpath.normpath(
            posixpath.join(posixpath.dirname(name), unquote(link.path))
        ) if link.path else name
        require(target_name in names, f'{name}: 链接文件不存在 {href}')
        fragment = unquote(link.fragment)
        if fragment:
            require(target_name in ids and fragment in ids[target_name],
                    f'{name}: 链接目标不存在 {href}')
        return target_name, fragment

    total = 0
    referenced_notes = set()
    referenced_returns = set()
    all_notes = set()
    for name, document in documents.items():
        # 同时检查目录、正文锚点等内部链接，防止分章后链接失效。
        for link in document.iter(f'{XHTML}a'):
            if link.get('href') is not None:
                resolve(name, link.get('href'))

        notes = [element for element in document.iter()
                 if has_token(element, EPUB_TYPE, 'footnote')]
        refs = [element for element in document.iter()
                if has_token(element, EPUB_TYPE, 'noteref')]
        all_notes.update((name, note.get('id')) for note in notes)
        require(len(notes) == len(refs), f'{name}: 引用与注解数量不一致')

        for ordinal, ref in enumerate(refs, 1):
            require(ref.tag == f'{XHTML}a' and has_token(ref, 'role', 'doc-noteref'),
                    f'{name}: 缺少标准注解引用语义')
            require(''.join(ref.itertext()).strip() == str(ordinal),
                    f'{name}: 引用编号应为 {ordinal}')
            target = resolve(name, ref.get('href', ''))
            require(target is not None and target[1], f'{name}: 注解必须使用内部锚点链接')
            note_name, note_id = target
            require(note_name == name, f'{name}: 注解未放在对应章节文件内')
            note = ids[note_name][note_id]
            require(has_token(note, EPUB_TYPE, 'footnote')
                    and has_token(note, 'role', 'doc-footnote'),
                    f'{name}: {note_id} 缺少标准脚注语义')
            require(target not in referenced_notes, f'{name}: 多条引用指向同一注解 {note_id}')
            referenced_notes.add(target)
            require(re.match(rf'^{ordinal}\.\s', ''.join(note.itertext()).strip()),
                    f'{name}: 注解 {note_id} 的编号与引用不一致')

            backlinks = [link for link in note.iter(f'{XHTML}a')
                         if has_token(link, 'role', 'doc-backlink')]
            require(len(backlinks) == 1, f'{name}: {note_id} 必须有一个返回链接')
            backlink = backlinks[0]
            require('返回正文' in ''.join(backlink.itertext()),
                    f'{name}: {note_id} 缺少可见的返回正文文字')
            back_target = resolve(note_name, backlink.get('href', ''))
            require(back_target is not None and back_target[0] == name
                    and back_target[1].startswith(RETURN_PREFIX),
                    f'{name}: {note_id} 返回目标错误')
            anchor = ids[name][back_target[1]]
            require(any(element is ref for element in anchor.iter()),
                    f'{name}: {note_id} 未返回对应引用位置')
            referenced_returns.add(back_target[1])
            total += 1

    require(all_notes == referenced_notes, '存在未被引用的注解')
    require(return_ids == referenced_returns, '存在未配对的返回锚点')
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='+', type=Path, help='EPUB 文件或其所在目录')
    parser.add_argument('--expect-books', type=int, help='预期电子书数量')
    args = parser.parse_args()
    files = sorted({file for item in args.paths
                    for file in (item.glob('*.epub') if item.is_dir() else [item])})
    if not files or (args.expect_books is not None and len(files) != args.expect_books):
        parser.exit(1, f'EPUB 数量错误：找到 {len(files)} 本，预期 {args.expect_books or "至少 1"} 本\n')
    failed = False
    for file in files:
        try:
            count = validate_epub(file)
            print(f'[epub-check] {file.name}: {count} 条注解，编号、结构与内部链接有效')
        except (ValueError, OSError, BadZipFile, ET.ParseError) as error:
            print(f'[epub-check] {error}', file=sys.stderr)
            failed = True
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
