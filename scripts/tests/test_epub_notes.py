"""使用真实内容模型和 Pandoc 验证注解转换与 EPUB 往返导航。"""

import json
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from check_epub_notes import EPUB_TYPE, XHTML, validate_epub


class EpubNotesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='epub-notes-test-')
        cls.root = Path(cls.temp.name)
        chapters = cls.root / 'polish/261027/chapters'
        chapters.mkdir(parents=True)
        publish = cls.root / 'publish'
        publish.mkdir()
        (publish / '版权页.md').write_text('# 版权页\n\n测试版权。\n', encoding='utf-8')
        (chapters / 'one.md').write_text(
            '## 第一章\n\n'
            '### 概要⊂词语⊃≼副题 *斜体* & 说明≽≼副题第二注≽\n\n'
            '他说：“⊂你好⊃≼原文为法语≽”≼紧邻注解≽。\n\n'
            '另一段≼含有 **粗体** 和 *斜体* 的注解≽。\n', encoding='utf-8')
        (chapters / 'two.md').write_text('## 第二章\n\n正文≼第二章注解≽。\n', encoding='utf-8')
        (chapters / 'three.md').write_text('## 第三章\n\n正文≼第二卷注解≽。\n', encoding='utf-8')
        arrangement = {'book': {'title': '样例', 'children': [
            {'id': 'vol1', 'title': '第一卷', 'children': [
                {'title': '第一章', 'parts': ['one.md']},
                {'title': '第二章', 'parts': ['two.md']},
            ]},
            {'id': 'vol2', 'title': '第二卷', 'children': [
                {'title': '第三章', 'parts': ['three.md']},
            ]},
        ]}}
        (publish / 'arrange.json').write_text(json.dumps(arrangement), encoding='utf-8')
        cls.markdown = cls.render('footnote')
        cls.epub = cls.root / 'sample.epub'
        subprocess.run([
            'pandoc', '--from', 'markdown-smart+raw_html', '--to', 'epub3',
            '--split-level', '2', '--epub-title-page=false', '--metadata', 'title=注解测试',
            '--lua-filter', str(SCRIPTS / 'epub-notes.lua'),
            '--css', str(SCRIPTS / 'epub.css'), '--output', str(cls.epub),
        ], input=cls.markdown, text=True, check=True, capture_output=True)
        with ZipFile(cls.epub) as archive:
            cls.entries = {name: archive.read(name) for name in archive.namelist()}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def render(cls, style):
        code = r'''
          import { pathToFileURL } from 'node:url';
          const { buildBook } = await import(pathToFileURL(process.argv[1]));
          const book = buildBook({ root: process.argv[2], version: '261027', annotationStyle: process.argv[3] });
          process.stdout.write(book.pages.map(page => page.markdown).join('\n\n'));
        '''
        return subprocess.run([
            'node', '--input-type=module', '-e', code, str(SCRIPTS / 'lib/content.mjs'),
            str(cls.root), style,
        ], check=True, capture_output=True, text=True).stdout

    def documents(self):
        return {name: ET.fromstring(content) for name, content in self.entries.items()
                if name.endswith('.xhtml')}

    def mutated_epub(self, name, content):
        file = self.root / 'broken.epub'
        with ZipFile(file, 'w') as archive:
            for entry, data in self.entries.items():
                archive.writestr(entry, content if entry == name else data)
        return file

    def test_round_trip_and_numbering(self):
        self.assertEqual(validate_epub(self.epub), 7)
        groups = []
        for doc in self.documents().values():
            refs = [e for e in doc.iter() if e.get(EPUB_TYPE) == 'noteref']
            if refs:
                groups.append([''.join(e.itertext()) for e in refs])
        self.assertCountEqual(groups, [['1', '2', '3', '4', '5'], ['1'], ['1']])

    def test_subtitle_notes_and_emphasis(self):
        self.assertIn('你好^[原文为法语]”^[紧邻注解]', self.markdown)
        self.assertNotIn('⊂', self.markdown)
        for doc in self.documents().values():
            subtitle = next((e for e in doc.iter() if e.get('class') == 'chapter-subtitle'), None)
            if subtitle is None:
                continue
            self.assertEqual(len([e for e in subtitle.iter() if e.get(EPUB_TYPE) == 'noteref']), 2)
            self.assertFalse(any(e.tag in [f'{XHTML}h{i}' for i in range(1, 7)]
                                 for e in subtitle.iter()))
            self.assertIn('斜体', [e.text for e in doc.iter(f'{XHTML}em')])
            self.assertIn('粗体', [e.text for e in doc.iter(f'{XHTML}strong')])
            self.assertIn('& 说明', ''.join(doc.itertext()))
            break
        else:
            self.fail('副题未保留')

    def test_site_popovers_are_preserved(self):
        markdown = self.render('popover')
        self.assertIn('<p class="chapter-subtitle">', markdown)
        self.assertEqual(markdown.count('class="reader-annotation__trigger"'), 7)
        self.assertNotIn('^[', markdown)
        self.assertNotIn('epub-note-ref-', markdown)

    def test_validator_rejects_wrong_return_target(self):
        for name, content in self.entries.items():
            if b'#epub-note-ref-2"' in content:
                broken = content.replace(b'#epub-note-ref-2"', b'#epub-note-ref-1"')
                with self.assertRaisesRegex(ValueError, '未返回对应引用位置'):
                    validate_epub(self.mutated_epub(name, broken))
                return
        self.fail('未找到测试返回链接')

    def test_validator_rejects_missing_note_target(self):
        for name, content in self.entries.items():
            if b'href="#fn1"' in content:
                broken = content.replace(b'href="#fn1"', b'href="#missing-note"', 1)
                with self.assertRaisesRegex(ValueError, '链接目标不存在'):
                    validate_epub(self.mutated_epub(name, broken))
                return
        self.fail('未找到测试注解链接')

    def test_validator_rejects_wrong_note_number(self):
        for name, content in self.entries.items():
            if b'<p>2. ' in content:
                broken = content.replace(b'<p>2. ', b'<p>9. ', 1)
                with self.assertRaisesRegex(ValueError, '编号与引用不一致'):
                    validate_epub(self.mutated_epub(name, broken))
                return
        self.fail('未找到测试注解编号')


if __name__ == '__main__':
    unittest.main()
