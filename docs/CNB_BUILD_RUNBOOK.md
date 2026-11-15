# CNB 源码构建排障手册

依据 CNB `anyong-agent` 的 `6d428b4d4`、`00fbdf723` 选择性整理。
参考产品线的 Windows tag runner、下载缓存、内部更新与发布步骤不适用于本仓库。
这里的 CNB 只对 `main` 推送执行 Node 26 源码门禁；Windows x64 未签名评审包
由 GitHub Windows runner 构建。推送 `dev` 不等于运行了这些 `main` 门禁。

## 定位失败

1. 在当前仓库的 CNB 构建页面确认候选提交 SHA、分支、runner 与失败 stage，
   下载原始 UTF-8 日志；不要把参考仓库的流水线当成本仓库结果。
2. 从首个非零退出码向前找原因，而不是只看末尾的级联错误：

   ```sh
   rg -n 'exit code|failing tests|ERR_|Error|not ok' /path/to/build.log
   ```

3. 记录命令、退出码、Node/pnpm/DSH 版本与脱敏日志位置。
   不上传凭据、完整环境变量、私有配置或带认证参数的 URL。
4. 按 `.cnb.yml` 的 install / verify / build 顺序复现。
   Node、pnpm 和 DSH 的精确版本以当前仓库 manifest 与锁文件为准，
   不用参考仓库版本号替代，也不通过更新锁文件来掩盖 frozen install 失败。

## 下载或原生资源失败

- 区分下载超时、代理/镜像不可达、摘要不匹配和平台架构不匹配。
  有文件不代表可用，校验失败不得放宽为警告。
- Electron 下载由 `scripts/install-electron-runtime.mjs` 管理，
  需要匹配的二进制、`dist/version` 与 `path.txt`。
  `ELECTRON_INSTALL_ATTEMPTS`、`ELECTRON_INSTALL_TIMEOUT_MS` 必须是正整数；
  自定义镜像和缓存不改变版本、完整性与平台门禁。
- OfficeCLI、BrowserSkill 和桌面工具按本仓库各自的 manifest、下载器与摘要门禁排查。
  不引入参考产品线的 `install-cnb-*`、`vendor/bsk` 或内部缓存路径。
- 共享缓存的读取必须验证完整性，写入使用隔离临时路径后原子替换。
  不删除其他构建正在使用的目录；等待自己启动的子进程时保留进程对象及退出码，
  不把 PID 查询失败或吞掉异常当成进程已成功完成。
- Linux/macOS 源码测试或 staging 不能证明 Windows PE、ConPTY、Koffi、
  PowerShell、安装器或 ZIP 的真实行为。

## pnpm 与 profile 定位失败

- 不假设 `.pnpm` 包目录必有 peer hash 后缀。定位候选包后读取它自己的
  `package.json`，精确核对名称、版本和所需文件。
- 区分官方 DSH bundle、可选第三方扩展和本地 profile patch。
  官方必需文件缺失应失败；可选包未安装只能在明确允许的检查中显式记录跳过，
  不能把缺包当成已通过，也不能静默跳过必需功能。
- 输出候选目录与命中情况，避免仅凭目录名判断上游删除了插件。
  本仓库没有参考产品线的 `scripts/profile-overlay.test.mjs`，
  不为同步文档而复制一套平行检查。
- 官方 profile patch 的 `name` 用于匹配，不是替换插件实现。
  替换目录选择模式时应成对组合官方 backend / surface；
  当前 browse 目录选择由真实 DSH integration 的 listing RPC 验证。

## 最小复现与复核

```sh
pnpm install --frozen-lockfile
node --test scripts/ci-workflows.test.mjs
pnpm run test:dsh-integration
pnpm test
node scripts/check-migration-boundary.mjs
node scripts/check-skills-sync.mjs
pnpm audit --prod --audit-level high
pnpm run build
git diff --check
```

先跑失败范围的测试，再执行完整源码门禁。构建结束应有
`apps/desktop-electron/dist/main.js` 与 `dist/anyong-dsh/package.json`。
日志、文件存在、退出成功和远端候选提交必须分别核对，不以本地通过代替远端回执。

Windows 打包仍按 [发布流程](RELEASING.md) 手动运行 GitHub workflow。
不要使用参考产品线的 release 脚本打 tag、发布 latest 或启用自动更新。
真机验收另见 [桌面验收清单](DESKTOP_ACCEPTANCE_CHECKLIST.md)。
