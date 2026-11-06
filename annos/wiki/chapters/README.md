# Wiki 按 32 个 chapter 拆分

生成命令：`python3 scripts/split-wiki-annotations.py`。原始 wiki.json 保持不变。

每份 JSON 对应一个现有 chapter，保留原条目的描述、来源、图片等字段；targets 只收录归属本章的规则。跨章条目会重复出现。

`mapping.locations` 包含匹配处附近的法文短摘录、行号、章内段号和定位依据；完整段落按 raw_file/raw_line 查阅，避免长段落在多个条目中重复膨胀。`translation_file` 指向对应中文开发稿，但尚未对齐中文句子或写入注释。

- `located_by_text`：在七卷范围内，结合同一外部段落的其他匹配词或前后唯一锚点后，选出一个文本候选；仍需核验语义和外部段落边界。
- `candidate`：指定外部段落仍有多处本地文本候选，保留供复核。
- `paragraph_located_match_missing`：同编号其他规则定位到了段落，但本规则的词句未匹配，可能有版本差异。
- `text_match_candidate`：原规则未指定段落，按词句收录全部本地候选，不保证每次出现都指同一对象。
- `unresolved_excludes`：外部排除段落尚未准确定位，未擅自删除本地候选。

匹配忽略大小写、重音、空白和标点，同时要求词边界。七卷搜索范围：t1→vol1–2，t2→vol3–5，t3→vol6–8，t4→vol9–10，t5→vol11–12，t6→vol13，t7→vol14–15。

源条目 968；源规则 1107；至少分配至一章的规则 1100；未分配规则 7。

| chapter | 条目数 | 规则数 |
| --- | ---: | ---: |
| [vol1-1](vol1-1.json) | 39 | 42 |
| [vol1-2](vol1-2.json) | 71 | 78 |
| [vol1-3](vol1-3.json) | 15 | 16 |
| [vol2-1](vol2-1.json) | 102 | 116 |
| [vol2-2](vol2-2.json) | 20 | 21 |
| [vol3-1](vol3-1.json) | 123 | 128 |
| [vol4-1](vol4-1.json) | 120 | 130 |
| [vol5-1](vol5-1.json) | 85 | 91 |
| [vol6-1](vol6-1.json) | 72 | 72 |
| [vol7-1](vol7-1.json) | 114 | 122 |
| [vol7-2](vol7-2.json) | 12 | 12 |
| [vol7-3](vol7-3.json) | 13 | 13 |
| [vol8-1](vol8-1.json) | 224 | 242 |
| [vol9-1](vol9-1.json) | 13 | 15 |
| [vol9-2](vol9-2.json) | 69 | 73 |
| [vol9-3](vol9-3.json) | 38 | 43 |
| [vol9-4](vol9-4.json) | 58 | 63 |
| [vol10-1](vol10-1.json) | 100 | 106 |
| [vol10-2](vol10-2.json) | 85 | 88 |
| [vol10-3](vol10-3.json) | 4 | 4 |
| [vol11-1](vol11-1.json) | 81 | 90 |
| [vol11-2](vol11-2.json) | 14 | 16 |
| [vol12-1](vol12-1.json) | 112 | 120 |
| [vol12-2](vol12-2.json) | 61 | 68 |
| [vol13-1](vol13-1.json) | 22 | 22 |
| [vol13-2](vol13-2.json) | 21 | 24 |
| [vol13-3](vol13-3.json) | 22 | 22 |
| [vol13-4](vol13-4.json) | 15 | 15 |
| [vol14-1](vol14-1.json) | 45 | 47 |
| [vol14-2](vol14-2.json) | 116 | 123 |
| [vol14-3](vol14-3.json) | 6 | 6 |
| [vol15-1](vol15-1.json) | 97 | 100 |

## 未定位的规则或外部段落

以下列表引用原始 wiki.json 的条目 ID 和从 0 起的 target 索引；未猜测归属。部分规则已分配其他外部段落，仍可能在本列表出现。

| 条目 ID | target 索引 | 匹配词 | 外部段落 | 原因 |
| --- | ---: | --- | --- | --- |
| gaston-calmette | 0 | GASTON CALMETTE |  | match_not_found |
| jacques-riviere | 0 | Jacques Rivière |  | match_not_found |
| jacques-thibaud | 1 | Thibaut |  | match_not_found |
| martyre-pelerins-funerailles-sainte-ursule-carpaccio | 0 | Ste Ursule de Carpaccio | t6-p0224 | external_paragraph_not_located |
| miracle-croix-rialto-carpaccio | 0 | Le Patriarche du Grado exorcisant un possédé | t6-p0224 | external_paragraph_not_located |
| narcisse-achille-de-salvandy | 0 | Salvandry |  | match_not_found |
| robert-proust | 0 | Dr Robert Proust |  | match_not_found |
