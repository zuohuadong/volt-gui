---
name: typescript
description: Use when writing, reviewing, or refactoring TypeScript, especially Bun-based CLI scripts, strict typing, Result-style error handling, module imports, and type-safe configuration.
---

# TypeScript 规范

> 改编自 [mcollina/skills/typescript-magician](https://github.com/mcollina/skills)，适配 Bun 运行时。

## 核心原则

- **消灭 `any`** — 所有 `any` 必须替换为精确类型
- **使用 `import type`** — 类型导入使用 `import type`，兼容 Bun 的 type stripping
- **优先 `const` 对象** — 用 `as const` 对象代替 `enum`
- **严格模式** — `tsconfig.json` 启用 `strict: true`

## 工作流程

```
1. 修改前先跑 bun tsc --noEmit 捕获现有错误
2. 定位根因（unsound inference / missing constraint / implicit any）
3. 用精确类型替换，确保调用方兼容
4. 再跑 bun tsc --noEmit 确认修复
```

## 类型安全模式

### 避免 `any`，用泛型约束

```typescript
// ❌
function parse(data: any): any { ... }

// ✅
function parse<T extends Record<string, unknown>>(data: T): T { ... }
```

### 使用 Discriminated Union 代替可选字段

```typescript
// ❌
interface Result {
  success?: boolean;
  data?: unknown;
  error?: string;
}

// ✅
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Brand Types 防止类型混淆

```typescript
type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

function getUser(id: UserId): Promise<User> { ... }

// 编译错误：不能把 OrderId 传给 UserId
getUser(orderId); // ✗
```

### 使用 `satisfies` 保留字面量类型

```typescript
const config = {
  port: 3000,
  host: "localhost",
} satisfies ServerConfig;
// config.port 的类型是 3000 而非 number
```

## 实用工具类型

```typescript
// 从运行时值推导类型
const ROLES = ["admin", "user", "guest"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "user" | "guest"

// 深度只读
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

// 提取函数参数/返回值类型
type Params = Parameters<typeof myFunction>;
type Return = ReturnType<typeof myFunction>;
type Resolved = Awaited<ReturnType<typeof myAsyncFunction>>;
```

## 错误处理

```typescript
// Result 模式
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function fetchData(url: string): Promise<Result<Data>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: new Error(`HTTP ${res.status}`) };
    return { ok: true, value: await res.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
```
