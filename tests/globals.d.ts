// 测试基础设施的最小环境声明（避免引入 @types/node）。
declare module 'node:crypto' {
  export const webcrypto: Crypto
}