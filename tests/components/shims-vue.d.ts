// SFC 类型 shim（D29：tsc 不检查 .vue 内部，仅解析导入）。
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}