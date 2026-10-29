<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const selectedText = ref('')
const copying = ref(false)
const notice = ref<'success' | 'error' | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const agents = [
  { name: 'TRAE web', href: 'https://work.trae.cn/', badge: '国内可用' },
  { name: 'ChatGPT web', href: 'https://chatgpt.com/' },
  { name: 'Grok web', href: 'https://grok.com/' },
  { name: '扣子 Coze web', href: 'https://www.coze.cn/', badge: '国内可用' },
  { name: '腾讯 WorkBuddy.cn web', href: 'https://www.workbuddy.cn/work/', badge: '国内可用' },
  { name: '腾讯 WorkBuddy 主页', href: 'https://www.workbuddy.cn/', badge: '国内可用' },
  { name: 'GitHub Copilot', href: 'https://github.com/copilot' },
]
let generation = 0

function updateSelection() {
  const selection = window.getSelection()
  const article = document.querySelector('.reader-chapter .vp-doc')
  if (!selection || selection.isCollapsed || !article || !selection.rangeCount) {
    selectedText.value = ''
    return
  }
  const range = selection.getRangeAt(0)
  const text = selection.toString()
  selectedText.value = article.contains(range.startContainer) && article.contains(range.endContainer) && text.trim()
    ? text
    : ''
}

async function copyPrompt() {
  if (!selectedText.value || copying.value) return
  const currentGeneration = generation
  const prompt = '进行`https://github.com/QriDoki/in-search-of-lost-time-translation-project`项目的`.ai/skills/contribute/SKILL.md`中的工作流\n```\n'
    + selectedText.value + '\n```'
  copying.value = true
  try {
    await navigator.clipboard.writeText(prompt)
    if (generation !== currentGeneration) return
    notice.value = 'success'
  } catch {
    if (generation !== currentGeneration) return
    notice.value = 'error'
  } finally {
    copying.value = false
  }
  // Keep the Agent action available until the reader dismisses it.
}

function dismissNotice() {
  notice.value = null
}

function reset() {
  generation++
  selectedText.value = ''
  dismissNotice()
  dialog.value?.close()
}

watch(() => route.path, reset)
onMounted(() => document.addEventListener('selectionchange', updateSelection))
onBeforeUnmount(() => {
  reset()
  document.removeEventListener('selectionchange', updateSelection)
})
</script>

<template>
  <Teleport to="body">
    <button
      v-if="selectedText"
      class="reader-ai-edit reader-ui"
      type="button"
      aria-label="AI编辑：复制修订提示词"
      title="AI编辑 · 复制修订提示词"
      :disabled="copying"
      @pointerdown.prevent
      @click="copyPrompt"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true">
        <path d="m7 19 12-12a2.8 2.8 0 0 1 4 4L11 23l-5 1 1-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        <path d="m17 9 4 4M7 19l4 4M6 28h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <path d="m25 16 1.5 4.5L31 22l-4.5 1.5L25 28l-1.5-4.5L19 22l4.5-1.5L25 16ZM9 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" fill="currentColor" />
      </svg>
    </button>

    <div v-if="notice" class="reader-ai-notice reader-ui" role="status" aria-live="polite">
      <span v-if="notice === 'success'">AI修订提示词已复制, 前往<button type="button" class="reader-ai-agent-action" aria-haspopup="dialog" @click="dialog?.showModal()">Agent</button>使用可以修订本书</span>
      <span v-else>复制失败，请允许浏览器访问剪切板后重试。</span>
      <button type="button" class="reader-ai-close" aria-label="关闭提示" @click="dismissNotice">×</button>
    </div>

    <dialog ref="dialog" class="reader-ai-dialog reader-ui" aria-labelledby="reader-ai-title" aria-describedby="reader-ai-instructions" @click="($event.target === dialog) && dialog?.close()">
      <div class="reader-ai-dialog__header">
        <h2 id="reader-ai-title">用 Agent 修订本书</h2>
        <button type="button" class="reader-ai-close" aria-label="关闭 Agent 浮窗" autofocus @click="dialog?.close()">×</button>
      </div>
      <p id="reader-ai-instructions">请先在所选 Agent 中安装并授权 <strong>GitHub 连接器</strong>，再粘贴已复制的提示词，开始修订。</p>
      <nav class="reader-ai-agents" aria-label="选择 Agent（新窗口打开）">
        <a v-for="agent in agents" :key="agent.name" :href="agent.href" target="_blank" rel="noopener noreferrer">
          <span>{{ agent.name }}</span>
          <span v-if="agent.badge" class="reader-ai-badge">{{ agent.badge }}</span>
          <span class="reader-ai-external" aria-hidden="true">↗</span>
        </a>
      </nav>
    </dialog>
  </Teleport>
</template>

<style scoped>
.reader-ai-edit {
  position: fixed;
  z-index: 46;
  right: max(24px, env(safe-area-inset-right));
  bottom: calc(28px + env(safe-area-inset-bottom));
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  background: var(--vp-c-bg-elv);
  color: var(--reader-accent);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--reader-accent) 20%, transparent);
  cursor: pointer;
  transition: background .18s, transform .18s;
}
.reader-ai-edit:hover { background: var(--vp-c-bg-soft); transform: translateY(-2px); }
.reader-ai-edit:disabled { cursor: wait; opacity: .65; }
.reader-ai-edit:focus-visible,
.reader-ai-dialog a:focus-visible,
.reader-ai-agent-action:focus-visible,
.reader-ai-close:focus-visible { outline: 2px solid var(--reader-accent); outline-offset: 3px; }
.reader-ai-notice {
  position: fixed;
  z-index: 65;
  right: max(24px, env(safe-area-inset-right));
  bottom: calc(100px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(460px, calc(100vw - 48px));
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  box-shadow: var(--reader-panel-shadow);
  font: 14px/1.8 var(--reader-sans);
}
.reader-ai-agent-action { margin: 0 4px; color: var(--reader-accent); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; cursor: pointer; }
.reader-ai-close { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; color: var(--vp-c-text-2); font: 24px/1 var(--reader-sans); cursor: pointer; }
.reader-ai-close:hover { background: var(--reader-accent-soft); }
.reader-ai-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  box-shadow: var(--reader-panel-shadow);
  font-family: var(--reader-sans);
}
.reader-ai-dialog::backdrop { background: rgba(20, 16, 12, .35); }
.reader-ai-dialog__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.reader-ai-dialog h2 { margin: 0; font: 600 21px/1.5 var(--reader-serif); }
.reader-ai-dialog p { margin: 14px 0 20px; color: var(--vp-c-text-2); font-size: 14px; line-height: 1.8; }
.reader-ai-dialog strong { color: var(--reader-accent); }
.reader-ai-agents { display: grid; gap: 8px; }
.reader-ai-agents a { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 1px solid var(--vp-c-divider); border-radius: 10px; color: var(--vp-c-text-1); font-size: 14px; text-decoration: none; }
.reader-ai-agents a:hover { background: var(--reader-accent-soft); border-color: var(--reader-accent); }
.reader-ai-badge { padding: 1px 7px; border-radius: 20px; background: var(--reader-accent-soft); color: var(--reader-accent); font-size: 11px; white-space: nowrap; }
.reader-ai-external { margin-left: auto; color: var(--reader-accent); }
@media (max-width: 480px) {
  .reader-ai-edit { right: max(16px, env(safe-area-inset-right)); bottom: calc(20px + env(safe-area-inset-bottom)); width: 52px; height: 52px; }
  .reader-ai-notice { right: 16px; max-width: calc(100vw - 32px); }
  .reader-ai-dialog { padding: 20px; }
}
</style>
