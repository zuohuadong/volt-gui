---
name: tailwind-v4
description: Tailwind CSS v4 最佳实践。使用 CSS-first 配置、@theme 指令、@utility 自定义工具类。适用于所有前端项目。参考来源：Lombiq/Tailwind-Agent-Skills + 官方文档。
---

# Tailwind CSS v4

> ⚠️ Tailwind CSS v4 与 v3 有重大变化，AI 训练数据可能过时。始终参考本 skill。

## 核心变化

### 配置方式

```css
/* v4: CSS-first 配置，不再需要 tailwind.config.js */
@import "tailwindcss";

/* 自定义主题 */
@theme inline {
  --color-brand: oklch(0.72 0.11 178);
  --font-display: "Inter", sans-serif;
}
```

### 安装

```bash
# Vite 项目（推荐）
bun add -D @tailwindcss/vite tailwindcss

# PostCSS 项目
bun add -D @tailwindcss/postcss tailwindcss

# CLI
bunx @tailwindcss/cli -i input.css -o output.css
```

## 常见陷阱（v3 → v4）

详见 [gotchas.md](./references/gotchas.md)

- `@import "tailwindcss"` 替代 `@tailwind base/components/utilities`
- `@utility` 替代 `@layer utilities` / `@layer components`
- Important 修饰符放在末尾：`bg-red-500!`（不是 `!bg-red-500`）
- CSS variable 语法：`bg-(--brand-color)`（不是 `bg-[--brand-color]`）
- Stacked variants 从左到右应用（与 v3 相反）
- `hover:` 只在支持 hover 的设备上生效
- 默认 border/ring 颜色改为 `currentColor`
- `space-*` / `divide-*` 行为变化，优先用 `gap`
- Transform 重置用 `scale-none` / `rotate-none`（不是 `transform-none`）

## 自定义工具类

```css
/* v4 方式 */
@utility card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-4);
  box-shadow: var(--shadow-md);
}

/* ❌ 不要用 v3 方式 */
/* @layer components { .card { ... } } */
```

## 颜色系统

```css
@theme inline {
  /* 使用 OKLCH 色彩空间 */
  --color-primary: oklch(0.6 0.2 250);
  --color-primary-light: oklch(0.8 0.15 250);
  --color-primary-dark: oklch(0.4 0.2 250);
}
```

## 与 SvelteKit 集成

```js
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
});
```

```css
/* app.css */
@import "tailwindcss";
```

## 浏览器兼容性

Safari 16.4+, Chrome 111+, Firefox 128+（不支持 IE）。
