-- 保留 Pandoc 的原生 Note，让 EPUB 阅读器自行决定弹窗或跳转。
-- 只补上注解编号与返回链接，不依赖 Pandoc 自动生成的 fnref ID。
function Pandoc(doc)
  local ordinal = 0
  local serial = 0

  -- 按文档顺序处理；普通 Header/Note 过滤器的遍历次序不保证编号重置时机。
  for index, block in ipairs(doc.blocks) do
    -- 与 build-epub.mjs 的 --split-level 2 保持一致。
    if block.t == 'Header' and block.level <= 2 then
      ordinal = 0
    end

    doc.blocks[index] = block:walk({
      Note = function(note)
        ordinal = ordinal + 1
        serial = serial + 1
        local anchor = 'epub-note-ref-' .. serial
        local label = pandoc.Str(tostring(ordinal) .. '.')
        local first = note.content[1]
        if first and (first.t == 'Para' or first.t == 'Plain') then
          first.content:insert(1, pandoc.Space())
          first.content:insert(1, label)
        else
          note.content:insert(1, pandoc.Para({label}))
        end

        local backlink = pandoc.Link('返回正文', '#' .. anchor)
        backlink.attributes['role'] = 'doc-backlink'
        backlink.attributes['aria-label'] = '返回正文注解 ' .. ordinal
        note.content:insert(pandoc.Para({backlink}))

        -- serial 在每本书内递增；合集中跨卷、跨章也不会重复。
        return pandoc.Span({note}, pandoc.Attr(anchor, {'epub-note-reference'}))
      end,
    })
  end
  return doc
end
