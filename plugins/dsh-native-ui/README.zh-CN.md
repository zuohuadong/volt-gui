# DSH Native UI

这是一个官方 DSH Web Profile Bundle，使用 `@deepseek-ai/dsh-client-ui-slots`
注册三个原生 UI 贡献点：

- 侧栏底部操作
- 会话菜单项
- 设置中的插件页签

插件不实现会话、权限、凭据或持久化，也不复制 DSH Web React 应用。
当前 Electron Svelte 工作台继续使用受限的 `dsh/native-ui` 声明式协议；
本包的 React client half 只在官方 DSH Web Profile 中运行。

安装到隔离 Profile：

```text
dsh plugin --profile web add @voltui/dsh-native-ui
```
