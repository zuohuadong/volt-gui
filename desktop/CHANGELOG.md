# Changelog

## [0.14.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.13.0...desktop-v0.14.0) (2026-07-24)


### Features

* **acp:** support mid-turn steering / 支持 ACP 回合中引导 ([#6715](https://github.com/zuohuadong/volt-gui/issues/6715)) ([29151f3](https://github.com/zuohuadong/volt-gui/commit/29151f33c9965599052dc3b54eda687e70025f2d))
* **agent:** evolve Auto mode with Auto Guard / 以 Auto Guard 强化自动模式 ([#6732](https://github.com/zuohuadong/volt-gui/issues/6732)) ([5480019](https://github.com/zuohuadong/volt-gui/commit/5480019c4f74a8cf6cf416885928eddeb3f57100))
* **agent:** Planner and sub-agent trusted MCP via stable use_capability / Planner 与子 Agent 安装即信任 MCP ([#6865](https://github.com/zuohuadong/volt-gui/issues/6865)) ([0f42b4b](https://github.com/zuohuadong/volt-gui/commit/0f42b4b65072efdf5fc3289c4c75f6c983b9e7b7))
* auto-enable matched builtin skills ([809bfec](https://github.com/zuohuadong/volt-gui/commit/809bfec57d74b5db16a6ea156994d29e0359c805))
* **cli:** add redacted machine interfaces / 增加脱敏机器接口 ([#6859](https://github.com/zuohuadong/volt-gui/issues/6859)) ([16d71aa](https://github.com/zuohuadong/volt-gui/commit/16d71aa4758765b6e7f86d8659e794bdd4a5b535))
* **cli:** support middle-click paste / 支持 CLI 中键粘贴 ([#6589](https://github.com/zuohuadong/volt-gui/issues/6589)) ([4411560](https://github.com/zuohuadong/volt-gui/commit/4411560530d007ecde6d9971477bbc432c3ba01a))
* complete deferred Reasonix feature parity ([e80b070](https://github.com/zuohuadong/volt-gui/commit/e80b070a1129bf396ff5a1340ae7b20fd174750b))
* **config:** support per-model context windows ([#6677](https://github.com/zuohuadong/volt-gui/issues/6677)) ([c77af74](https://github.com/zuohuadong/volt-gui/commit/c77af74c9646f4b7fc84630f04988589c3d40962))
* **desktop:** add About dialog with version display and update check ([dc56189](https://github.com/zuohuadong/volt-gui/commit/dc561896f2d75e3dc270bccf96648aed5b1ed8c4))
* **desktop:** add external data import ([f8ea72a](https://github.com/zuohuadong/volt-gui/commit/f8ea72ace694057434659d4149c9f64113c07f18))
* **desktop:** add home mobile-nav buttons to workbench layers / 补齐工作台移动端导航入口 ([dc0c2cc](https://github.com/zuohuadong/volt-gui/commit/dc0c2ccef551d5a309d43fa382dacf78fbd078ab))
* **desktop:** add line numbers and search to file preview ([#6557](https://github.com/zuohuadong/volt-gui/issues/6557)) / 为文件预览添加行号边栏与搜索功能 ([#6574](https://github.com/zuohuadong/volt-gui/issues/6574)) ([ef29d04](https://github.com/zuohuadong/volt-gui/commit/ef29d046fd9443c4307a77da2d43e5dc20abcccc))
* **desktop:** add pane opacity control and fix base style revert on custom theme save / 新增面板透明度控制，修复自定义主题保存后基础风格回退 ([#6645](https://github.com/zuohuadong/volt-gui/issues/6645)) ([a144e55](https://github.com/zuohuadong/volt-gui/commit/a144e55e41c4a36ec4dc64052da7dbbb99b2652a))
* **desktop:** align Review workflow with Codex ([#58](https://github.com/zuohuadong/volt-gui/issues/58)) ([2137e72](https://github.com/zuohuadong/volt-gui/commit/2137e727e66108afbae4ead296f0f17ed2f4a078))
* **desktop:** calm workbench information density ([#60](https://github.com/zuohuadong/volt-gui/issues/60)) ([691fe6e](https://github.com/zuohuadong/volt-gui/commit/691fe6ef57a7000445f210b5c5b605b3849aef05))
* **desktop:** enhance workspace file tree ([#6807](https://github.com/zuohuadong/volt-gui/issues/6807)) ([eac67a7](https://github.com/zuohuadong/volt-gui/commit/eac67a7fbf3b08b3e7cb0e25d86eeabdc456aa20))
* **desktop:** expand syntax highlighting for more languages / 拓展更多种语言的语法高亮支持 ([#6861](https://github.com/zuohuadong/volt-gui/issues/6861)) ([04c0d88](https://github.com/zuohuadong/volt-gui/commit/04c0d88f4d75dd5115bed84e55bed2c55a51bbb9))
* **desktop:** Redesign theme experience with official packs / 主题体验改造与官方主题 ([#6614](https://github.com/zuohuadong/volt-gui/issues/6614)) ([7f00d2c](https://github.com/zuohuadong/volt-gui/commit/7f00d2c260f2b7fff719ac8fccd50d4472cb1dcb))
* **desktop:** refine classic sidebar sorting, previews, and topic actions / 经典侧栏：排序、预览与会话操作 ([22aa3d3](https://github.com/zuohuadong/volt-gui/commit/22aa3d35fe3f20e4e61df78972385db19d89a8d7))
* **desktop:** refine MCP and project workflows ([cada1e1](https://github.com/zuohuadong/volt-gui/commit/cada1e1503b255d0cf013b5d1937098cde884d0b))
* **desktop:** refine task navigation and sidebar ([c86f816](https://github.com/zuohuadong/volt-gui/commit/c86f816bc13e68de76399959705ccca52113e134))
* **desktop:** refine work task execution layout ([0bd7943](https://github.com/zuohuadong/volt-gui/commit/0bd794363db54f8af9cfa0d6dd0fc9362e7e2785))
* **desktop:** release upstream sync — builtin skills auto-enable, session history pagination, upgrade recovery ([bb1ee49](https://github.com/zuohuadong/volt-gui/commit/bb1ee493b1b0398ab1bde90a4f424244a45e3998))
* **desktop:** release upstream sync — external data import, task navigation, UI stabilization ([707ec4a](https://github.com/zuohuadong/volt-gui/commit/707ec4a2a0b56a5317c983a861110faf3213d1c6))
* **desktop:** release upstream sync — Reasonix feature parity ([f7ad003](https://github.com/zuohuadong/volt-gui/commit/f7ad003e216c1c4e85aa10e38114dcdd5626e396))
* **desktop:** release upstream sync — task context convergence, layered memory, stale model recovery ([5caa598](https://github.com/zuohuadong/volt-gui/commit/5caa5989fc2acfdb1c3c0a3e98a713e610abe57e))
* **desktop:** release upstream sync — Volt GUI design language, trusted task lifecycle, code review knowledge injection ([dd86af2](https://github.com/zuohuadong/volt-gui/commit/dd86af233600ce1c21e4692d04ac028e6237288a))
* **desktop:** release upstream sync — Windows overwrite fix, Reasonix v2 kernel updates ([15aeff0](https://github.com/zuohuadong/volt-gui/commit/15aeff0fbde2c94abb8eb70bbe912e3f120ea2db))
* **desktop:** release v0.22.0 — upstream sync + issue fixes ([c6a4124](https://github.com/zuohuadong/volt-gui/commit/c6a41242035d442b8e03b94afc3bd00d138b52cc))
* **desktop:** release v0.23.0 — upstream sync + CNB issue closure ([624016e](https://github.com/zuohuadong/volt-gui/commit/624016e754f91731c47479b595ad1c14a777e612))
* **desktop:** release v0.25.0 — upstream sync (work task execution layout) ([c9de61f](https://github.com/zuohuadong/volt-gui/commit/c9de61fd48e10a8774d56f5e316c32487a453295))
* **desktop:** 办公模式/开发者模式简化交互 ([a9bf3bf](https://github.com/zuohuadong/volt-gui/commit/a9bf3bff05c61c45d79297ba68cc768e3d4e97dd))
* **desktop:** 办公模式/开发者模式简化交互，治理与工程能力上下文化 ([52bf608](https://github.com/zuohuadong/volt-gui/commit/52bf60837801456d14b2cd4baf15071e412539aa))
* **desktop:** 外部数据导入支持取消 ([74348f8](https://github.com/zuohuadong/volt-gui/commit/74348f87a348555de520f6d5f702759f27b2e3f1))
* **desktop:** 外部数据导入支持取消 ([f844255](https://github.com/zuohuadong/volt-gui/commit/f84425579aefe94e963ed5137c6b3effe0c0e3bf))
* **desktop:** 支持自定义对话框发送与换行快捷键 ([#6503](https://github.com/zuohuadong/volt-gui/issues/6503)) ([66ad218](https://github.com/zuohuadong/volt-gui/commit/66ad2185afdc2ec62973ce8ab8511d2c5f581ae5))
* **desktop:** 收敛任务上下文与分层记忆状态 ([357b8b9](https://github.com/zuohuadong/volt-gui/commit/357b8b97eee0e68a8056165671d2dd075cde97b0))
* **desktop:** 聊天区域的宽度修改add configurable conversation width (standard 960px / full 90%) ([#6590](https://github.com/zuohuadong/volt-gui/issues/6590)) ([4c1702c](https://github.com/zuohuadong/volt-gui/commit/4c1702ca46c9102b1e47971e18cb614a7914215e))
* enhance knowledge workspace ([66e7ca1](https://github.com/zuohuadong/volt-gui/commit/66e7ca15ad3fd4608a27b3af438e2e717b676223))
* **mcp:** enforce trusted execution boundaries ([c636f01](https://github.com/zuohuadong/volt-gui/commit/c636f017a8ffaa5da0af3259fcbc414eb8da1ab9))
* **mcp:** make trusted servers zero-config and reliable / 让可信 MCP 服务零配置且可靠可用 ([#6829](https://github.com/zuohuadong/volt-gui/issues/6829)) ([31f037d](https://github.com/zuohuadong/volt-gui/commit/31f037d07aa25b00aa76478c7e20fd61ad7eebfd))
* **mcp:** Trusted execution, signed catalog, and isolation / MCP 可信执行、签名目录与隔离 ([912dee6](https://github.com/zuohuadong/volt-gui/commit/912dee6902dbd784e70ef9aa7d6c13585d8e598e))
* **registry:** support plugin submissions / 支持插件类型提交 ([#6816](https://github.com/zuohuadong/volt-gui/issues/6816)) ([d97dfdc](https://github.com/zuohuadong/volt-gui/commit/d97dfdcfbf16e8bb07fb1ae6737a73fbc0035d6c))
* **release:** add bilingual product changelog ([#6576](https://github.com/zuohuadong/volt-gui/issues/6576)) ([751acd4](https://github.com/zuohuadong/volt-gui/commit/751acd4e6f359b3b028f799c28169a567a7c8a72))
* show selected text card in chat bubble with formatted preview选中引用文本卡片显示 ([#6813](https://github.com/zuohuadong/volt-gui/issues/6813)) ([ecd66a3](https://github.com/zuohuadong/volt-gui/commit/ecd66a30f9feeed50000cbdf34f48339ab43bacc))


### Bug Fixes

* **acp:** keep config rebuilds ordered and failure-atomic ([d9633fd](https://github.com/zuohuadong/volt-gui/commit/d9633fda3a56223e5cec300120b90cc1220f8811))
* **acp:** order command updates after session responses ([#6803](https://github.com/zuohuadong/volt-gui/issues/6803)) ([14e97c9](https://github.com/zuohuadong/volt-gui/commit/14e97c92a23eaccc7b988bd8da8c61360c3fe8a7))
* Add a desktop-specific install deep link, activate and scroll to its pane on page load, preserve plain #start behavior, and keep updater manifests and release checks aligned. ([94a26c3](https://github.com/zuohuadong/volt-gui/commit/94a26c36b790158bbfdd975e4eaf2f8c5961a67e))
* Add a transport-owned post-response hook and route command advertisements for session/new, session/load, and session/resume through it while preserving transcript replay and config-rebuild ordering. ([14e97c9](https://github.com/zuohuadong/volt-gui/commit/14e97c92a23eaccc7b988bd8da8c61360c3fe8a7))
* **agent,desktop:** harden final-answer recovery and report-style gate ([cd8bac3](https://github.com/zuohuadong/volt-gui/commit/cd8bac3b35a8d2748b77c69ca2e96fb14b6b85da))
* **agent:** bound edit receipts and refresh previews ([249f9e6](https://github.com/zuohuadong/volt-gui/commit/249f9e6a74ae87e658502368efb712b79c779b69))
* **agent:** enforce serial todo progress ([1a45a16](https://github.com/zuohuadong/volt-gui/commit/1a45a16400323488799f7bd472f1ccfa60546d8b))
* **agent:** enforce serial todo progress / 强制串行 Todo 推进 ([988190f](https://github.com/zuohuadong/volt-gui/commit/988190f375fd2f08d59b295a2deea9fb8b3cc0b2))
* **agent:** ground edits without forced rereads ([c8ee98e](https://github.com/zuohuadong/volt-gui/commit/c8ee98e0d5ec18d181e4c71092e8d18e8c89396a))
* **agent:** Ground edits without forced rereads / 无需强制重读即可同步编辑 ([ad9c3fc](https://github.com/zuohuadong/volt-gui/commit/ad9c3fc138b3e7b953405d94b96027b3275c4a50))
* **agent:** honour DeepSeek finish_reason=stop on reasoning-only final answer ([#6618](https://github.com/zuohuadong/volt-gui/issues/6618)) ([d3cfa5c](https://github.com/zuohuadong/volt-gui/commit/d3cfa5c264e98ba47c3104d912bbfeb451f34fbc))
* **agent:** imperative zh reasoning-language block / 强化中文思考语言注入措辞 ([b9a1f8d](https://github.com/zuohuadong/volt-gui/commit/b9a1f8d5f26de66ce2aec03da2393c36dab977e3))
* **agent:** make reader authorization tamper-proof at MCP dispatch ([9bbd138](https://github.com/zuohuadong/volt-gui/commit/9bbd138695670300491b03ef1d071a7d1514a784))
* **agent:** make the zh reasoning-language block imperative ([bed8c3f](https://github.com/zuohuadong/volt-gui/commit/bed8c3f4c4cf4b21b16c5492e739889c8b061c1d))
* **agent:** unify strict read-only MCP execution boundary ([3ff177d](https://github.com/zuohuadong/volt-gui/commit/3ff177d268878e095ce0d01ed8cbdab34a7c41d7))
* **agent:** Unify strict read-only subagent boundaries / 统一严格只读子代理边界 ([392b4a3](https://github.com/zuohuadong/volt-gui/commit/392b4a34b9b1fb6cb511b9afb5532ddd20389dd8))
* **approval:** degrade unavailable auto_review to fresh human approval ([3ad8dfa](https://github.com/zuohuadong/volt-gui/commit/3ad8dfa431000aceb870b5cbead77267789a6099))
* **ccswitch:** import MCP servers with enabled_reasonix ([#6730](https://github.com/zuohuadong/volt-gui/issues/6730)) ([0051567](https://github.com/zuohuadong/volt-gui/commit/0051567cadf1e373c2d9b35e8668712fbc0217ac))
* complete Claude hook tool_input/tool_response contract translation ([ef7e813](https://github.com/zuohuadong/volt-gui/commit/ef7e813f2e2a0e8d9c0e067eab3565fb4dca34b0))
* **config:** 修复permissions配置更新时的数据丢失问题 ([#6784](https://github.com/zuohuadong/volt-gui/issues/6784)) ([5bea38e](https://github.com/zuohuadong/volt-gui/commit/5bea38e530ec96cb6665f3d2738b73739544be92))
* **controller:** cancel foreground work during close / 关闭 Controller 时取消前台任务 ([#6679](https://github.com/zuohuadong/volt-gui/issues/6679)) ([993cee1](https://github.com/zuohuadong/volt-gui/commit/993cee10f24a1277f2c7d5802b2b27cd8bb7ce8e))
* **control:** stop auto-plan re-entry after user exits plan mode ([1f91f80](https://github.com/zuohuadong/volt-gui/commit/1f91f803edffdeb629400a75def2d309864ec588))
* **delivery:** recover readiness and isolate concurrent writers ([03b39a6](https://github.com/zuohuadong/volt-gui/commit/03b39a65543de245b6af8827172bb2c8be193ead))
* **desktop,mcp:** close settings editor and install validation gaps ([109da0a](https://github.com/zuohuadong/volt-gui/commit/109da0ab0bfc91b111a5c2e0249d120decc52d05))
* **desktop:** address classic sidebar review findings ([d82a076](https://github.com/zuohuadong/volt-gui/commit/d82a076b0374380c2ef236dc89a2027f5d03a322))
* **desktop:** align MCP details and compact layout ([30faf50](https://github.com/zuohuadong/volt-gui/commit/30faf50960b1cc29caf101cdcf8b15cad9b9a574))
* **desktop:** backport Linux WebKit startup signal repair / 移植 Linux WebKit 启动信号修复 ([#6655](https://github.com/zuohuadong/volt-gui/issues/6655)) ([d50a988](https://github.com/zuohuadong/volt-gui/commit/d50a9888f3472c8403210bfac399970fc7998bdc))
* **desktop:** close app before Windows overwrite ([f778755](https://github.com/zuohuadong/volt-gui/commit/f778755cafde4d376d2f3291a71ae959e3d8e630))
* **desktop:** close app before Windows overwrite ([35f4b5b](https://github.com/zuohuadong/volt-gui/commit/35f4b5bd5b4af396019dd41a711dce9ee3909280))
* **desktop:** dedupe exact date in topic row title and aria-label ([84a1e12](https://github.com/zuohuadong/volt-gui/commit/84a1e12ee9d45a97617b287373690c67ce20b1fc))
* **desktop:** delete the topic title last so retries keep a locator ([ca98996](https://github.com/zuohuadong/volt-gui/commit/ca989965e102ac6d1d682b69f48aefb005a400c9))
* **desktop:** dismiss only backend-drained approvals on mode switch; epoch-guard submit failures ([7515083](https://github.com/zuohuadong/volt-gui/commit/7515083239451e0707e20f12fe898960b1e80cb2))
* **desktop:** harden auto-update recovery / 加固桌面端自动更新恢复链路 ([#6764](https://github.com/zuohuadong/volt-gui/issues/6764)) ([c0ffe71](https://github.com/zuohuadong/volt-gui/commit/c0ffe7108f658efda17dc4ce3008fb44e9a5c889))
* **desktop:** harden Windows update recovery ([024e35c](https://github.com/zuohuadong/volt-gui/commit/024e35c2310eb1b315793979aea8609ba3f3b348))
* **desktop:** ignore stale approval drain results ([69ffaf7](https://github.com/zuohuadong/volt-gui/commit/69ffaf766694bff2674ce80789f6220ccbced4e2))
* **desktop:** improve first-run provider onboarding ([#6757](https://github.com/zuohuadong/volt-gui/issues/6757)) ([2c27d62](https://github.com/zuohuadong/volt-gui/commit/2c27d62326b087b8dd816b74c90400416560fa16))
* **desktop:** isolate WebView2 startup from stale proxies / 隔离 WebView2 启动残留代理 ([#6727](https://github.com/zuohuadong/volt-gui/issues/6727)) ([4cec2b0](https://github.com/zuohuadong/volt-gui/commit/4cec2b0fadcb3d04148f046ffc596fc2e0f5feff))
* **desktop:** keep pending plan approval visible across session switches / 修复切换会话后待确认审批不显示 ([d20634d](https://github.com/zuohuadong/volt-gui/commit/d20634d849f047ac264cbd2997d1adb51f7f6102))
* **desktop:** keep provider retries cancellable / 保持桌面端重试可停止 ([#6902](https://github.com/zuohuadong/volt-gui/issues/6902)) ([7663495](https://github.com/zuohuadong/volt-gui/commit/7663495c91e7d400730718e424ebd970c77ebf6e))
* **desktop:** keep Windows opener menu above transcript ([#6737](https://github.com/zuohuadong/volt-gui/issues/6737)) ([6ded2b3](https://github.com/zuohuadong/volt-gui/commit/6ded2b3c2940c1cf2377b1b603df893529da4a28))
* **desktop:** match retired-backend runtime escape reason for localization ([c051255](https://github.com/zuohuadong/volt-gui/commit/c0512555caad169c368f6a129be6728ee8f8b6fc))
* **desktop:** normalize Windows workspace paths ([c04cbfc](https://github.com/zuohuadong/volt-gui/commit/c04cbfca17a6875585d01612976941abca3c4ed4))
* **desktop:** Persist workspace panel and harden Windows openers / 持久化工作区折叠并加固 Windows 外部打开 ([#6588](https://github.com/zuohuadong/volt-gui/issues/6588)) ([9b54b9f](https://github.com/zuohuadong/volt-gui/commit/9b54b9f8937b9878d9052833bff4ab99ba7638de))
* **desktop:** preserve and paginate session history ([2200ee6](https://github.com/zuohuadong/volt-gui/commit/2200ee651d709d10025474dea402682359276580))
* **desktop:** Preserve transcript selection during plan revision / 修复计划修订焦点抢占 ([#6466](https://github.com/zuohuadong/volt-gui/issues/6466)) ([c5940f6](https://github.com/zuohuadong/volt-gui/commit/c5940f6319f35053f941c6644e60c08e044fd12e))
* **desktop:** preserve Windows paths in notices ([fabdc9e](https://github.com/zuohuadong/volt-gui/commit/fabdc9ef06b257c65ea76420c0c3bd838e8f540e))
* **desktop:** prevent archiving active sessions ([#6761](https://github.com/zuohuadong/volt-gui/issues/6761)) ([6dd57cc](https://github.com/zuohuadong/volt-gui/commit/6dd57cce98f33dd9a245cd921e5cbc7b2cdb57b5))
* **desktop:** prevent double-click race on topic archive ([#6312](https://github.com/zuohuadong/volt-gui/issues/6312)) ([e08431c](https://github.com/zuohuadong/volt-gui/commit/e08431c90a9172143c609f3e15ed866ec58e21d4))
* **desktop:** prevent model list option overlap when provider has many models / 修复供应商模型较多时设置页面模型列表选项重叠 ([#6539](https://github.com/zuohuadong/volt-gui/issues/6539)) ([9eb9511](https://github.com/zuohuadong/volt-gui/commit/9eb9511f8b2049a47ee2fef7597256151ac824cb))
* **desktop:** remove project delete button, constrain code block overflow, add monospace to code viewer ([#59](https://github.com/zuohuadong/volt-gui/issues/59)) ([af3141a](https://github.com/zuohuadong/volt-gui/commit/af3141a8490ff6eeefc01dbba30d37647c5137ce))
* **desktop:** resolve reported workbench issues ([8ea6b2d](https://github.com/zuohuadong/volt-gui/commit/8ea6b2dab3df928fa10f34b9d4fec5a927235acb))
* **desktop:** restore Windows support executable icons ([e18d8c4](https://github.com/zuohuadong/volt-gui/commit/e18d8c4451f4c78e6efaba7743dfa11d63527608))
* **desktop:** scope topic deletion cleanup to roots holding the topic ([20194d5](https://github.com/zuohuadong/volt-gui/commit/20194d525e34b442fd54ae8d46b3724eb3f0af39))
* **desktop:** show current workspace diffs ([#6733](https://github.com/zuohuadong/volt-gui/issues/6733)) ([8b44e4c](https://github.com/zuohuadong/volt-gui/commit/8b44e4cee53fd69f954e5b33637c2b3a0feb357f))
* **desktop:** Show MCP npm connection endpoints / 显示 MCP npm 连接端点 ([#6559](https://github.com/zuohuadong/volt-gui/issues/6559)) ([5c2c3d5](https://github.com/zuohuadong/volt-gui/commit/5c2c3d5d6417671dae3e1936a1c352fa3291d314))
* **desktop:** Show Windows update progress / 显示 Windows 更新进度 ([#6751](https://github.com/zuohuadong/volt-gui/issues/6751)) ([7588ffe](https://github.com/zuohuadong/volt-gui/commit/7588ffe17cee31670f6bb309ca65e715ea9495c2))
* **desktop:** stabilize verified UI flows ([e3910d6](https://github.com/zuohuadong/volt-gui/commit/e3910d690f973fada0d3cb4728a53f093c565fef))
* **desktop:** stabilize workspace tree virtualization ([#6717](https://github.com/zuohuadong/volt-gui/issues/6717)) ([610a4c3](https://github.com/zuohuadong/volt-gui/commit/610a4c3d436744e4213d3697e6946b58e23a053a))
* **desktop:** support authorized Debian package updates / 支持 Debian 安装包应用内授权更新 ([#6866](https://github.com/zuohuadong/volt-gui/issues/6866)) ([035f928](https://github.com/zuohuadong/volt-gui/commit/035f92897ff31d63b77b9c2165e1c5200a2a6d6a))
* **desktop:** surface MCP re-verification action ([#6605](https://github.com/zuohuadong/volt-gui/issues/6605)) ([0998795](https://github.com/zuohuadong/volt-gui/commit/099879592742ddeb25b312347b4c37316e8b76f9))
* **desktop:** surface residual topic cleanup failures ([01b8d12](https://github.com/zuohuadong/volt-gui/commit/01b8d12ee2669a9ce3121b50483ffad8960e3b5f))
* **desktop:** 修复 CNB issue [#22](https://github.com/zuohuadong/volt-gui/issues/22) [#23](https://github.com/zuohuadong/volt-gui/issues/23) — 模板输出混乱与工程总览冗余 ([5472d9f](https://github.com/zuohuadong/volt-gui/commit/5472d9f63523fc29ef8c05f2e40e067dbc309c40))
* **desktop:** 修复 CNB issue [#22](https://github.com/zuohuadong/volt-gui/issues/22) [#23](https://github.com/zuohuadong/volt-gui/issues/23) — 模板输出混乱与工程总览冗余 ([d3cf2d8](https://github.com/zuohuadong/volt-gui/commit/d3cf2d82ce6786d6be04abd2f444adf0c1ede3ba))
* **desktop:** 桌面客户端最大化窗口时光标卡死在 resize 形状prevent cursor stuck at resize shape when window is max… ([#6610](https://github.com/zuohuadong/volt-gui/issues/6610)) ([a46fc6f](https://github.com/zuohuadong/volt-gui/commit/a46fc6f47a00ffffeaee6184c4748cac6cc4ae7d))
* **docs:** self-host the Star History chart ([#6755](https://github.com/zuohuadong/volt-gui/issues/6755)) ([3a815ed](https://github.com/zuohuadong/volt-gui/commit/3a815ed35dc8ff8e63b10bdd4d3eb9f5bfe62659))
* finish CNB UI issue follow-ups ([de8f1f6](https://github.com/zuohuadong/volt-gui/commit/de8f1f678affa6bbda35d48458915b000b3fddd6))
* Give this single KDF-heavy integration scenario a 30-second context while leaving production timeouts and behavior unchanged. ([4cec2b0](https://github.com/zuohuadong/volt-gui/commit/4cec2b0fadcb3d04148f046ffc596fc2e0f5feff))
* **guard:** alias snapshot IDs in AI assist ([7ddd7a8](https://github.com/zuohuadong/volt-gui/commit/7ddd7a8b205a60192a52633bdca0b5823a4893c3))
* **guard:** harden diagnostic privacy and repair commits ([5b0dfb0](https://github.com/zuohuadong/volt-gui/commit/5b0dfb0621b379a415fe92db5f1d969ddaa68bae))
* **guard:** send only an allowlisted diagnostic DTO to the AI provider ([659cbb9](https://github.com/zuohuadong/volt-gui/commit/659cbb9c2f9f9a69968f6a3b8401d1c19e989384))
* harden Plan mode across controller rebuilds ([c3ab1ca](https://github.com/zuohuadong/volt-gui/commit/c3ab1caf48533664802b4ebdb55f732cbbbe0dff))
* harden release-critical provider and credential paths ([f5179b4](https://github.com/zuohuadong/volt-gui/commit/f5179b4de4fa66dde1b81eb0b41527e515acbd47))
* **hooks:** preserve Windows batch argument semantics ([1a8b6f8](https://github.com/zuohuadong/volt-gui/commit/1a8b6f827d46b2dc6d7625305755efb01e8ae775))
* **hooks:** run quoted Windows batch plugin commands ([b989035](https://github.com/zuohuadong/volt-gui/commit/b98903560fdce1e9cde33d28f0a39ed6cdac591f))
* **hooks:** Windows plugin hook compatibility ([#6550](https://github.com/zuohuadong/volt-gui/issues/6550)) ([7e32590](https://github.com/zuohuadong/volt-gui/commit/7e32590a6858f9ad9fc544be4f06916676db907a))
* isolate all stored credential env keys ([fad0933](https://github.com/zuohuadong/volt-gui/commit/fad0933b48f2c89ebee945f01a315612ba56e357))
* Keep explicit allowlists authoritative while preserving default MCP inheritance, split ExtraPlugin call and lifetime contexts, add cache-backed on-demand registration, serialize activation transactions with a cross-process lock, derive quick names from launcher operands in desktop and CLI, and scope mode-bit assertions to POSIX. ([31f037d](https://github.com/zuohuadong/volt-gui/commit/31f037d07aa25b00aa76478c7e20fd61ad7eebfd))
* Limit shell-form handling to the broken leading-quoted executable shape, preserve its argument tail verbatim, quote argv-form arguments only when required, and make the Windows runtime test assert raw %1 behavior. ([1a8b6f8](https://github.com/zuohuadong/volt-gui/commit/1a8b6f827d46b2dc6d7625305755efb01e8ae775))
* **mcp:** close approval and settings gaps ([6c13597](https://github.com/zuohuadong/volt-gui/commit/6c13597de174e732eb3d86a8952cc515bfd1fae4))
* **mcp:** close trust and lifecycle review gaps ([83639eb](https://github.com/zuohuadong/volt-gui/commit/83639eb0e57bcadfcdc362b791b39eaee535d92a))
* **mcp:** credential-aware identity fingerprints and exact launcher pins ([a753648](https://github.com/zuohuadong/volt-gui/commit/a7536482c347fc400595b64a9825e5e63d95331d))
* **mcp:** enforce live official allowlists and receipt integrity ([5092b23](https://github.com/zuohuadong/volt-gui/commit/5092b23ddb5d29adb2acb47af6cbfaec18160668))
* **mcp:** exclude credential values from cache identity ([bd149dc](https://github.com/zuohuadong/volt-gui/commit/bd149dc8d18b40cd856439731679fc10a39a4ee4))
* **mcp:** harden identity, cache, and transport trust boundaries ([3212786](https://github.com/zuohuadong/volt-gui/commit/3212786e4509977916bfdc2ff1f65e1ba8bbdd31))
* **mcp:** keep installed MCP writers on the normal permission path while planning ([a413c82](https://github.com/zuohuadong/volt-gui/commit/a413c821de2872d4ea208992826875883d0da208))
* **mcp:** migrate legacy receipts at the pre-start gate, widen credential keys ([60fc21f](https://github.com/zuohuadong/volt-gui/commit/60fc21f9d29c32fa5cfa633faa94d7e97f004599))
* **mcp:** preserve trusted reader preflight snapshots ([5fcca24](https://github.com/zuohuadong/volt-gui/commit/5fcca24382a5aead386c632217634f70f3df1953))
* Open desktop downloads for manual updates / 修复手动更新下载深链 ([06314c9](https://github.com/zuohuadong/volt-gui/commit/06314c99a21376d2e7cedfa78c320d4573609e93))
* persist switched system prompt, merge pending config axes, lock drift emitters ([7127a85](https://github.com/zuohuadong/volt-gui/commit/7127a853b37da195c3bcc1629ae37eb387fccee0))
* **plan:** separate workflow from permissions ([88be1a2](https://github.com/zuohuadong/volt-gui/commit/88be1a23cec896a5f1fe545a0737fccbc9d67bb6))
* **plugin:** MCP stdio subprocess CWD resolves against wrong project root ([#6778](https://github.com/zuohuadong/volt-gui/issues/6778)) / 修复 MCP 子进程工作目录解析到错误项目根目录 ([#6819](https://github.com/zuohuadong/volt-gui/issues/6819)) ([06e41c7](https://github.com/zuohuadong/volt-gui/commit/06e41c78265c21888b51e5718a2ac3308593d888))
* **plugins:** complete Claude hook contract adapters ([c0c9361](https://github.com/zuohuadong/volt-gui/commit/c0c93610e6fe7b5545229c755a2ec29bea8ca260))
* **plugins:** polish hook adapter semantics and deflake spawn tests ([0d5f704](https://github.com/zuohuadong/volt-gui/commit/0d5f70401bde65a4eabe891d0c7c07422f64e9c8))
* **provider:** classify MiniMax content-review errors ([#6824](https://github.com/zuohuadong/volt-gui/issues/6824)) ([9fafac0](https://github.com/zuohuadong/volt-gui/commit/9fafac05f4e9e1411fbae2fa5530a1f7e246dfcc))
* Recognize simple .cmd/.bat hook invocations in both shell and argv forms, normalize the executable path separators, and provide an exact cmd.exe /d /s /c command line through SysProcAttr. Compound and non-batch shell contracts remain unchanged. ([b989035](https://github.com/zuohuadong/volt-gui/commit/b98903560fdce1e9cde33d28f0a39ed6cdac591f))
* recover agent profiles with stale model refs ([e398863](https://github.com/zuohuadong/volt-gui/commit/e398863c4bda7d27d13ea97363bc4f395add93cf))
* **recovery:** commit repair transactions independently of the audit log ([b6537ed](https://github.com/zuohuadong/volt-gui/commit/b6537edbc407117e5dea8ad4c8e764e01200ffce))
* **recovery:** harden pre-ready exits, rollback serialization, and Safe Mode gates ([1b9ff51](https://github.com/zuohuadong/volt-gui/commit/1b9ff514d18d12d72a90e058eeca6e837449d660))
* **registry:** re-review publisher updates / 发布者更新重新进入审核 ([#6830](https://github.com/zuohuadong/volt-gui/issues/6830)) ([d9dd4aa](https://github.com/zuohuadong/volt-gui/commit/d9dd4aa0e53e4b9c2d0fa2daa1b07458010ca38d))
* **release:** allow newer catalog entries ([#6579](https://github.com/zuohuadong/volt-gui/issues/6579)) ([cc9b1f5](https://github.com/zuohuadong/volt-gui/commit/cc9b1f52e6bc787719b78e70db8d7e487fe2fdd1))
* **release:** carry reviewed notes into recoveries ([#6843](https://github.com/zuohuadong/volt-gui/issues/6843)) ([020bf6e](https://github.com/zuohuadong/volt-gui/commit/020bf6ebf75c7a36bbbc2434eb8bf69d6d936fe9))
* **release:** prevent skipped stable publishers ([#6629](https://github.com/zuohuadong/volt-gui/issues/6629)) ([e7a0f11](https://github.com/zuohuadong/volt-gui/commit/e7a0f1163b82a235fb975c85a1fe9f90ac57d1ee))
* remove obsolete desktop mode helper ([a2cb36e](https://github.com/zuohuadong/volt-gui/commit/a2cb36e819b61d06de313188ea4319085e4cb395))
* Remove the stale version assertion while retaining schema, ordering, and uniqueness validation through the catalog loader. ([cc9b1f5](https://github.com/zuohuadong/volt-gui/commit/cc9b1f52e6bc787719b78e70db8d7e487fe2fdd1))
* resolve CNB agent workflow regressions ([9df7ae3](https://github.com/zuohuadong/volt-gui/commit/9df7ae3282885c24779ea53c2a3d44ffafdc1290))
* retire automatic Plan Mode / 退役自动计划模式 ([#6734](https://github.com/zuohuadong/volt-gui/issues/6734)) ([77fd1a4](https://github.com/zuohuadong/volt-gui/commit/77fd1a47be89498febe16a940621f79cc84f0b92))
* retire hidden agent step limits ([791ec4d](https://github.com/zuohuadong/volt-gui/commit/791ec4d03c3a0d677acdc602b5f30c80c6a6ea1a))
* route manual updates to desktop downloads ([94a26c3](https://github.com/zuohuadong/volt-gui/commit/94a26c36b790158bbfdd975e4eaf2f8c5961a67e))
* **sandbox:** expose temporary MCP executable safely ([8451423](https://github.com/zuohuadong/volt-gui/commit/845142312bc24d054ad3815c70271c4cc5c42789))
* **site:** correct docs sidebar active-section highlight ([#6222](https://github.com/zuohuadong/volt-gui/issues/6222)) ([4499687](https://github.com/zuohuadong/volt-gui/commit/4499687209f6d6cd915ecfd597d44161cfa9b9fc))
* **site:** restore registry publish button layout ([#6630](https://github.com/zuohuadong/volt-gui/issues/6630)) ([840cb6c](https://github.com/zuohuadong/volt-gui/commit/840cb6cad2a2b01738141e0a0380ffdf5a707552))
* **todo:** add canonical todo state to MetaForTab so frontend reads authoritative server-side state / 修复待办面板状态：MetaForTab 传规范待办状态 ([#6774](https://github.com/zuohuadong/volt-gui/issues/6774)) ([9536edc](https://github.com/zuohuadong/volt-gui/commit/9536edce8ab3d7066ad8ee7da0e2ace720427644))
* **todo:** seed layered plans with executable child ([a906672](https://github.com/zuohuadong/volt-gui/commit/a9066729f398cc7bf8dcb03a6522e7796bd6f134))
* **tool:** Windows GBK 输出自动转 UTF-8，两种编码兼容 ([91bcb84](https://github.com/zuohuadong/volt-gui/commit/91bcb84f9b7d6876338f912d6649263b25ab7ba5))
* **tool:** Windows GBK 输出自动转 UTF-8，两种编码兼容 (CNB [#22](https://github.com/zuohuadong/volt-gui/issues/22)) ([e34d417](https://github.com/zuohuadong/volt-gui/commit/e34d417d8edac451850a161623fdc8ad46035e9b))
* **tool:** Windows 下虚拟工作区路径映射 ([74348f8](https://github.com/zuohuadong/volt-gui/commit/74348f87a348555de520f6d5f702759f27b2e3f1))
* **tool:** Windows 下虚拟工作区路径映射 ([ec5da23](https://github.com/zuohuadong/volt-gui/commit/ec5da23c8dc4636bf190c1988513a170288e3b4c))
* **tui:** 从 quickPicker 选择模型后正确返回 pendingModelSwitch 作为 tea.Cmd（解决 /model 切换模型问题） ([#6585](https://github.com/zuohuadong/volt-gui/issues/6585)) ([f590a66](https://github.com/zuohuadong/volt-gui/commit/f590a66ee99b6d048454495bc96fc995ae3ca416))
* unify strict read-only subagent execution ([d4ebb15](https://github.com/zuohuadong/volt-gui/commit/d4ebb154dad719d4fb91feb3155d50b815499290))
* Upload the preflight-rendered notes and consume that exact artifact in orchestrated CLI/Desktop publishers. Add opt-out channel switches for manual recovery while retaining public postflight verification for skipped channels. ([020bf6e](https://github.com/zuohuadong/volt-gui/commit/020bf6ebf75c7a36bbbc2434eb8bf69d6d936fe9))
* **windows:** isolate concurrent MCP ACL updates ([dd5c46f](https://github.com/zuohuadong/volt-gui/commit/dd5c46f95e27120677a6e84d9421b4a05ed4fa80))
* **windows:** preserve sandboxed MCP startup ([6348d13](https://github.com/zuohuadong/volt-gui/commit/6348d13d3a684368712e6c389b0b477dbe7d47d2))
* **windows:** scope loader grants to process startup ([938b66a](https://github.com/zuohuadong/volt-gui/commit/938b66aeaa0346ae8d12a7820ab9abb4294d65b7))
* **windows:** scope MCP AppContainer ACLs ([9b6fe02](https://github.com/zuohuadong/volt-gui/commit/9b6fe02dffc20fce231fe760570873ae01e14a17))
* **windows:** serialize ACL mutation phases ([313defe](https://github.com/zuohuadong/volt-gui/commit/313defe0cd0b38ad8ea84208623da0fe9bb5ad43))
* **windows:** stop loader-grant heap corruption and icacls cost ([53f992c](https://github.com/zuohuadong/volt-gui/commit/53f992cb34dcca57d1e332b965579a10d41b5d69))
* **worktree:** harden Windows isolation ([bfb0bf4](https://github.com/zuohuadong/volt-gui/commit/bfb0bf4d2e3faf0214c4e742f4ff263ad5a81f99))
* 支持 Review 结果作为 complete_step 证据 ([#6762](https://github.com/zuohuadong/volt-gui/issues/6762)) ([d385432](https://github.com/zuohuadong/volt-gui/commit/d385432a088006a0e33662e26b6912679698d1c6))


### Documentation

* Add VS Code extension install paths / 添加 VS Code 扩展安装入口 ([#6735](https://github.com/zuohuadong/volt-gui/issues/6735)) ([9cd6c67](https://github.com/zuohuadong/volt-gui/commit/9cd6c67a6eef69a099fbfaee3497cc3cdf1bc90f))
* align Plan and MCP approval semantics with enforcement ([2b88997](https://github.com/zuohuadong/volt-gui/commit/2b88997bab4b9af0425549a268a9038d1e9264a3))
* credit CLI clipboard co-contributor ([8395ab9](https://github.com/zuohuadong/volt-gui/commit/8395ab934bb6e48f6a3de0008f9bf7e258bdb813))
* describe the implemented strict read-only boundary precisely ([e864fc4](https://github.com/zuohuadong/volt-gui/commit/e864fc48be0a96caffe941cafcb57bc8a7f9d079))
* fix Plan and destructive-reviewer contract drift on public surfaces ([0c61f6b](https://github.com/zuohuadong/volt-gui/commit/0c61f6b544b5ef337befde311eb670d9d62a49fb))
* list the strict read-only entrances and their boundary ([fdaf89c](https://github.com/zuohuadong/volt-gui/commit/fdaf89c25013773ba93d46aadb9a82cf2a39b778))
* **release:** prepare v1.17.16 notes ([464d494](https://github.com/zuohuadong/volt-gui/commit/464d4942adb830c4321d1fb8bd7929905f33d0d7))
* **release:** prepare v1.17.17 notes ([222af64](https://github.com/zuohuadong/volt-gui/commit/222af641881fabfa739a61565fa4c934fbdea133))
* **release:** prepare v1.17.18 notes ([#6799](https://github.com/zuohuadong/volt-gui/issues/6799)) ([c53c13c](https://github.com/zuohuadong/volt-gui/commit/c53c13c178ba9d60b8ce600c24810cda0563282a))
* **release:** prepare v1.17.19 notes ([#6841](https://github.com/zuohuadong/volt-gui/issues/6841)) ([3bedc05](https://github.com/zuohuadong/volt-gui/commit/3bedc054a30f2d3d6bf8fd589276df09238030f3))
* remove clipboard attribution copy ([ec3691d](https://github.com/zuohuadong/volt-gui/commit/ec3691d01d4cefed15888cf6417c5af3322d3b01))
* **todo:** describe single current item continuity ([32c479f](https://github.com/zuohuadong/volt-gui/commit/32c479f9721726ad77b2204ce985baed8f3f7f1d))


### CI

* make NSIS setup independent of Chocolatey ([d03c89a](https://github.com/zuohuadong/volt-gui/commit/d03c89a9969ee412167a429678ea4e225bff7ac8))
* **release:** consolidate GitHub approval and retain SignPath review / 合并 GitHub 审批并保留 SignPath 手工确认 ([#6626](https://github.com/zuohuadong/volt-gui/issues/6626)) ([3637d0f](https://github.com/zuohuadong/volt-gui/commit/3637d0f028bb8223d50ba9490a0ab5140eada4f3))
* retrigger checks ([6463e6b](https://github.com/zuohuadong/volt-gui/commit/6463e6bbbd6da48733f8d1ee82d1069401746265))
* retrigger checks after Actions scheduling recovered ([c7ace72](https://github.com/zuohuadong/volt-gui/commit/c7ace7247f1ee5f70ca5b743a215ce3715da6295))
* use curl for pinned NSIS archive ([65ddec5](https://github.com/zuohuadong/volt-gui/commit/65ddec5c4329a2bcc5fe72eaf5b7fe4bd3b1da8d))


### Chores

* **deps-dev:** bump typescript in /desktop/frontend ([#41](https://github.com/zuohuadong/volt-gui/issues/41)) ([763c0ad](https://github.com/zuohuadong/volt-gui/commit/763c0ad9b0bd54f151204a4830c30c0cbcdb03fd))
* **deps:** bump astro from 7.0.7 to 7.1.1 in /site in the npm group ([#50](https://github.com/zuohuadong/volt-gui/issues/50)) ([eb14867](https://github.com/zuohuadong/volt-gui/commit/eb14867a05bde0bfc139ccc1dbc844010eb0bfe2))
* **deps:** bump github.com/wailsapp/wails/v2 ([#48](https://github.com/zuohuadong/volt-gui/issues/48)) ([c195b10](https://github.com/zuohuadong/volt-gui/commit/c195b10c9b56e95ba89b4b5ac29edeee938cefb4))
* **deps:** bump the actions group with 5 updates ([#52](https://github.com/zuohuadong/volt-gui/issues/52)) ([b90d117](https://github.com/zuohuadong/volt-gui/commit/b90d117d1e6b315be39f8dd80b43ab8681e9576b))
* **desktop:** align version metadata to v0.24.0 [skip-release] ([5c95c39](https://github.com/zuohuadong/volt-gui/commit/5c95c39359bdeb2f38e7ebebc913488f441ee8bc))
* **mcp:** credit shared contributors ([8c548f2](https://github.com/zuohuadong/volt-gui/commit/8c548f25d68486c4e5002d2bdf9a91990053c5f5))
* **plan:** remove obsolete trust helper ([af89911](https://github.com/zuohuadong/volt-gui/commit/af89911ed35fa0137a07d735ea105dc515177e02))
* **release:** prepare v1.17.15 notes ([315f6f3](https://github.com/zuohuadong/volt-gui/commit/315f6f30532f43fa95d0958b2fff2b353442fa9a))
* **sandbox:** Retire the Windows native backend / 退役 Windows 原生沙箱后端 ([95c023b](https://github.com/zuohuadong/volt-gui/commit/95c023b626afb740a19f78f821be166a2d0f984e))
* **sandbox:** retire Windows native backend ([8c02916](https://github.com/zuohuadong/volt-gui/commit/8c02916042e8b2b7f90788d8b4efd4e89bf1433a))

## [0.24.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.22.0...desktop-v0.24.0) (2026-07-22)


### Features

* **desktop:** 办公模式/开发者模式简化交互，治理与工程能力上下文化 ([52bf608](https://github.com/zuohuadong/volt-gui/commit/52bf60838a2e9f5b8b8e8d3e9a1c0b2d3e4f5a6b))
* **desktop:** 外部数据导入支持取消（CancelExternalDataImport 桥接接口 + 导入弹窗取消按钮） ([f844255](https://github.com/zuohuadong/volt-gui/commit/f8442557))
* enhance knowledge workspace ([66e7ca1](https://github.com/zuohuadong/volt-gui/commit/66e7ca15))


### Bug Fixes

* **desktop:** 修复 CNB issue #22 #23 — 模板输出混乱与工程总览冗余 ([d3cf2d](https://github.com/zuohuadong/volt-gui/commit/d3cf2d82))
* **tool:** Windows GBK 输出自动转 UTF-8，两种编码兼容 ([91bcb8](https://github.com/zuohuadong/volt-gui/commit/91bcb84f))
* **tool:** Windows 下虚拟工作区路径映射 ([ec5da2](https://github.com/zuohuadong/volt-gui/commit/ec5da23c))


### CNB Issues Closed

14 issues verified fixed and closed via CNB (#10–#23). Remaining open (#9 model
timeout, #24 emoji/GBK crash, #25 tool-param format) are non-code or
model-behavior defects out of scope for this release.


## [0.13.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.12.1...desktop-v0.13.0) (2026-07-14)


### Features

* add trusted intranet, model catalog, and workbench data enhancements ([105d19d](https://github.com/zuohuadong/volt-gui/commit/105d19da4bc1950025b7410560bd33820e7179d1))
* **design:** add Volt GUI design language ([e88c5d0](https://github.com/zuohuadong/volt-gui/commit/e88c5d0551232cea82eea8b01178bab1b3ad77e9))
* desktop-automation-workflows ([48317f9](https://github.com/zuohuadong/volt-gui/commit/48317f9ef49c7f5f96610b32631160d899bd97cf))
* **desktop:** add trusted task lifecycle experience ([923f261](https://github.com/zuohuadong/volt-gui/commit/923f2612e6ba67d81b70b4078b425f35ca09b3d1))
* **desktop:** manage automations from project chat ([2c1a77a](https://github.com/zuohuadong/volt-gui/commit/2c1a77a0bbde42fd4f04d0ec34cf475826f27907))
* **review:** inject local knowledge into code review ([3324d59](https://github.com/zuohuadong/volt-gui/commit/3324d59973398cb418923550be4160b9cd1b2cc8))
* **sync:** port reasonix upstream 85e92996a..3703cf430 + local WIP ([b129e88](https://github.com/zuohuadong/volt-gui/commit/b129e881b9d62ef9b84936efe1fccb88528db865))
* **sync:** port reasonix upstream updates + browser-login feature ([5db5406](https://github.com/zuohuadong/volt-gui/commit/5db5406c0b9298a15faad3e4903f7d4c750648ee))


### Bug Fixes

* **browser:** harden secure login flow ([3e53906](https://github.com/zuohuadong/volt-gui/commit/3e53906e512907efa81c761c0f1f7adb03b705b2))
* **desktop:** harden runtime mock cleanup ([7b74345](https://github.com/zuohuadong/volt-gui/commit/7b74345f35adb1aa7089da93daced32179905bce))
* **desktop:** stop attachment sandbox retry loops ([2a3f18f](https://github.com/zuohuadong/volt-gui/commit/2a3f18f1a7a9ada68c6301dd61f6b3d54d19b939))

## [0.12.1](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.12.0...desktop-v0.12.1) (2026-07-13)


### Bug Fixes

* **windows:** add offline prerequisite bundle ([e12d527](https://github.com/zuohuadong/volt-gui/commit/e12d52739f02e79696b0fece6098a246268630e0))


### CI

* upgrade workflows to Node.js 26 ([310604d](https://github.com/zuohuadong/volt-gui/commit/310604d5dae331268bf20d749c5eca9057afa90a))

## [0.12.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.11.2...desktop-v0.12.0) (2026-07-12)


### Features

* add default office MCP ([33ca50f](https://github.com/zuohuadong/volt-gui/commit/33ca50fc7803f2edef1b71525e94f67b3f3b0636))
* add deterministic calculation tool ([904d081](https://github.com/zuohuadong/volt-gui/commit/904d0815210e0b35f18d582e91fe71b15ac6b77b))
* add local knowledge index and capability status ([3652607](https://github.com/zuohuadong/volt-gui/commit/3652607899d4d74ead2bb0492e81a7cacdc0d5f3))
* add local usage reporting ([e0615a0](https://github.com/zuohuadong/volt-gui/commit/e0615a0567c80e80361d147b7a75ea4385b210e3))
* bundle computer-use MCP plugin ([3070b49](https://github.com/zuohuadong/volt-gui/commit/3070b49d46cf292ade09288d73c369b736c3e4bc))
* **desktop:** add Cloudflare Drop publish plugin ([1d7243c](https://github.com/zuohuadong/volt-gui/commit/1d7243cceaee1d2701b3c573f941b1b907df34fb))
* **desktop:** bundle Bun runtime for computer-use MCP ([8d10ae9](https://github.com/zuohuadong/volt-gui/commit/8d10ae9571e7c571cf4d7c4ec44ec65e0f7b9960))
* **desktop:** improve offline workbench workflows ([876031f](https://github.com/zuohuadong/volt-gui/commit/876031fd51be4e4de7138a8c45d01108aa75b96e))
* persist workbench capabilities ([b218cf4](https://github.com/zuohuadong/volt-gui/commit/b218cf40c5179ca9fbce9ae09b4b6cec52a0b602))
* **site:** add multi-page product website ([00af214](https://github.com/zuohuadong/volt-gui/commit/00af214207aa2eda1e17bfb8ad7ae2752d1b9f6a))
* **skills:** improve capability discovery metadata ([40f24f6](https://github.com/zuohuadong/volt-gui/commit/40f24f6b12d7764a0f7668970fbd6090d0e606cc))
* **skills:** improve capability discovery metadata ([51113be](https://github.com/zuohuadong/volt-gui/commit/51113bebf2bf2c6127747b5c24c38c4b5286db3b))
* sync runtime and desktop updates ([a1c8def](https://github.com/zuohuadong/volt-gui/commit/a1c8def0d60c11f1fbbb830c3c71af69455c8eee))
* sync verified upstream updates and Cloudflare Drop publish ([d2a64d4](https://github.com/zuohuadong/volt-gui/commit/d2a64d4a43ddd22a1706eb823fed6c97527cacc5))
* **sync:** port verified reasonix updates ([d9b4ffe](https://github.com/zuohuadong/volt-gui/commit/d9b4ffe7c3fa50f799cf71f58dd28815e86b86d3))


### Bug Fixes

* improve calendar scheduling interactions ([61d0224](https://github.com/zuohuadong/volt-gui/commit/61d0224db69a734b1044d0b314ebe809fc114f89))
* repair cross-platform regressions and smoke coverage ([9553777](https://github.com/zuohuadong/volt-gui/commit/95537774edf4f4a0df718c17135732643e58025e))
* **skill:** ignore title-only Claude markdown ([909fbc9](https://github.com/zuohuadong/volt-gui/commit/909fbc9f0757aa85e77a6ec89663ab1625a68352))
* stabilize desktop knowledge workflows ([b9fe986](https://github.com/zuohuadong/volt-gui/commit/b9fe986fddf6b06ff97843cebc17e1d129040f3e))
* support Bun staging on Windows ([f81f770](https://github.com/zuohuadong/volt-gui/commit/f81f7705dfec6c86b5c2c421ec6b75eca7d6ef13))


### CI

* test Bun staging changes ([fc186e6](https://github.com/zuohuadong/volt-gui/commit/fc186e6b1ba7d0f116ecf48dad6c4b7512fa78d1))


### Chores

* **deps:** bump astro from 7.0.6 to 7.0.7 in /site in the npm group ([d0dd7a9](https://github.com/zuohuadong/volt-gui/commit/d0dd7a90c9127ae558999c00c211a0e8170e7f7f))
* **deps:** bump astro from 7.0.6 to 7.0.7 in /site in the npm group ([f39d2de](https://github.com/zuohuadong/volt-gui/commit/f39d2de5133358d92d0909724e927b6c7a530068))
* **deps:** bump the go group across 1 directory with 5 updates ([1e69536](https://github.com/zuohuadong/volt-gui/commit/1e69536ed0e03faa43ef0d264cb224ed9768d28b))
* **deps:** bump the go group across 1 directory with 5 updates ([81bcb70](https://github.com/zuohuadong/volt-gui/commit/81bcb7089aef53c8affb65843e19f0b6f4703917))
* **deps:** bump the go group with 9 updates ([d45810a](https://github.com/zuohuadong/volt-gui/commit/d45810a5d666a7bd684a192149981f9e88a63fc3))
* **deps:** bump the go group with 9 updates ([800237c](https://github.com/zuohuadong/volt-gui/commit/800237c0c3bf1501fe3fc72483a0a8f56bd1de60))
* **deps:** bump the npm group in /desktop/frontend with 4 updates ([91f9bbe](https://github.com/zuohuadong/volt-gui/commit/91f9bbe66c7fcdd91a978dcd3d433c0841efd389))
* **deps:** bump the npm group in /desktop/frontend with 4 updates ([563f5f9](https://github.com/zuohuadong/volt-gui/commit/563f5f91b3965c4b88499502f186301b2b95390a))

## [0.11.2](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.11.1...desktop-v0.11.2) (2026-07-07)


### CI

* avoid desktop artifact uploads in CI ([afbbfdc](https://github.com/zuohuadong/volt-gui/commit/afbbfdc736783183ea3dbce1459fefdc7a7928d4))

## [0.11.1](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.11.0...desktop-v0.11.1) (2026-07-07)


### Bug Fixes

* **ci:** avoid desktop release artifact quota failures ([01b33d6](https://github.com/zuohuadong/volt-gui/commit/01b33d621cb71b8e3f80b16897d9e3d92a625f69))

## [0.11.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.10.0...desktop-v0.11.0) (2026-07-07)


### Features

* **desktop:** add artifact review canvas controls ([f033084](https://github.com/zuohuadong/volt-gui/commit/f033084efc468b1427dfbe98d612b4843114c058))
* **planmode:** make host automation configurable ([0d4262e](https://github.com/zuohuadong/volt-gui/commit/0d4262efaf7243b96b0ee1f66d6e3b360390b335))


### Documentation

* add marketing artifact review UX guidance ([#33](https://github.com/zuohuadong/volt-gui/issues/33)) ([b847b7d](https://github.com/zuohuadong/volt-gui/commit/b847b7d435604a7ee2359bb52519c77f71b53043))

## [0.10.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.9.1...desktop-v0.10.0) (2026-07-07)


### Features

* add desktop automation builtins ([93268a1](https://github.com/zuohuadong/volt-gui/commit/93268a1d5e05bbd2875783f4605b04c5c6971f7f))


### Chores

* align VoltUI branding and release config ([64bea6a](https://github.com/zuohuadong/volt-gui/commit/64bea6a305475d48cc8bea581bdd2afe95cbdd7d))

## [0.9.1](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.9.0...desktop-v0.9.1) (2026-07-07)


### Bug Fixes

* make desktop release publishing idempotent ([27ec32f](https://github.com/zuohuadong/volt-gui/commit/27ec32fdaec10cf3cc685640a2cea9b9578858d7))

## [0.9.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.8.0...desktop-v0.9.0) (2026-07-07)


### Features

* persist workbench business data ([96c9d87](https://github.com/zuohuadong/volt-gui/commit/96c9d875e17619d0915299f54f0f81bb6f932478))
* persist workbench data flows ([7c46cb1](https://github.com/zuohuadong/volt-gui/commit/7c46cb1c511b9ae3b27073e68d8b8e307859ebd5))
* refine workbench report form ([b5a28d8](https://github.com/zuohuadong/volt-gui/commit/b5a28d8654e6a2e76e235cd9c9b7d6a729f97ea9))


### Bug Fixes

* address upstream sync regressions ([1d79e94](https://github.com/zuohuadong/volt-gui/commit/1d79e94bf3a1f2fedef00ad6083338e5567cae10))
* **ci:** install nfpm for desktop builds ([c49f091](https://github.com/zuohuadong/volt-gui/commit/c49f09183527c00d01c446e8b82b692297d135f9))
* **desktop:** repair CI packaging build ([b601f38](https://github.com/zuohuadong/volt-gui/commit/b601f38d094543777a7dc4879ac64678d8f719d0))
* **desktop:** wire team chat to runtime ([66b41c8](https://github.com/zuohuadong/volt-gui/commit/66b41c8f7c641639e1a2a7a11451bf4548aad5b1))
* prevent re-seeding cleared data and harden workbench persistence ([392e69b](https://github.com/zuohuadong/volt-gui/commit/392e69bc624a9778485cc9835c8afa983cb542d6))
* remove installer brand residue ([4097e32](https://github.com/zuohuadong/volt-gui/commit/4097e32f922e5e7a61aaa07c067700be2491994b))


### Chores

* clean desktop worktree artifacts ([262d902](https://github.com/zuohuadong/volt-gui/commit/262d902c921899969c58bcc35f5b73b8b3d1450e))
* **deps:** bump astro from 7.0.2 to 7.0.6 in /site in the npm group ([5df158b](https://github.com/zuohuadong/volt-gui/commit/5df158bd636a83e540c4dc2cc6f7b6dd71533034))
* **deps:** bump astro from 7.0.2 to 7.0.6 in /site in the npm group ([2ea1e31](https://github.com/zuohuadong/volt-gui/commit/2ea1e31fab8449828d7a365ba26807688d1feaea))
* **deps:** bump the go group across 1 directory with 3 updates ([dd02220](https://github.com/zuohuadong/volt-gui/commit/dd0222089e2357615bbc5a4c5d393360009472cd))
* **deps:** bump the go group across 1 directory with 3 updates ([771603c](https://github.com/zuohuadong/volt-gui/commit/771603cc9389935c303eff838e2b7fdeaf5c4ef5))
* **deps:** bump the npm group in /desktop/frontend with 7 updates ([aca5d14](https://github.com/zuohuadong/volt-gui/commit/aca5d14a375959443095be9d0cd7d50b199d10a6))
* **deps:** bump the npm group in /desktop/frontend with 7 updates ([e8b4cff](https://github.com/zuohuadong/volt-gui/commit/e8b4cffa95e1b64d02a6b0a353c05603c0f69d62))

## [0.8.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.7.0...desktop-v0.8.0) (2026-07-01)


### Features

* **desktop:** refine workbench composer flow ([e988e63](https://github.com/zuohuadong/volt-gui/commit/e988e635f1b4dcff4cb23eee571702de0d64b51c))


### Bug Fixes

* **desktop:** stabilize workbench conversations ([7e43e18](https://github.com/zuohuadong/volt-gui/commit/7e43e18f800fc79af06037aa8a55bbbcb65cb47e))

## [0.7.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.6.0...desktop-v0.7.0) (2026-06-29)


### Features

* **desktop:** separate work and code workbenches ([c9cb5e1](https://github.com/zuohuadong/volt-gui/commit/c9cb5e13bb7b45e44999227b360463ec3dcfcc71))

## [0.6.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.5.1...desktop-v0.6.0) (2026-06-28)


### Features

* 过滤 image/video 非聊天模型, 完善团队运行状态与工作台交互 ([7c9fded](https://github.com/zuohuadong/volt-gui/commit/7c9fdeda078eff572e9a61056ca6e296c2b8bc51))


### Bug Fixes

* **desktop:** harden production smoke flows ([28585ab](https://github.com/zuohuadong/volt-gui/commit/28585ab6ca75461e9b916c3247d23888273a9b39))

## [0.5.1](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.5.0...desktop-v0.5.1) (2026-06-27)


### Chores

* **deps:** bump github.com/larksuite/oapi-sdk-go/v3 in the go group ([#18](https://github.com/zuohuadong/volt-gui/issues/18)) ([a4bec11](https://github.com/zuohuadong/volt-gui/commit/a4bec1172bc5321ba8692de1982dbcc275184285))
* sync upstream main-v2 updates ([8d409af](https://github.com/zuohuadong/volt-gui/commit/8d409af22692402c2f30e96a5c7325e47aee6685))

## [0.5.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.4.0...desktop-v0.5.0) (2026-06-25)


### Features

* sync upstream changes through 5dac4f6 ([0c59769](https://github.com/zuohuadong/volt-gui/commit/0c597692d3d0035969ebd02af1984b015a68c8f1))

## [0.4.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.3.1...desktop-v0.4.0) (2026-06-25)


### Features

* **desktop:** improve settings and model resolution ([e1cf06f](https://github.com/zuohuadong/volt-gui/commit/e1cf06f39c05643e2e384e97da739f48d23eadce))

## [0.3.1](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.3.0...desktop-v0.3.1) (2026-06-25)


### CI

* **desktop:** stop publishing minisign assets ([b079fe5](https://github.com/zuohuadong/volt-gui/commit/b079fe581d702ab4878a5cb56f6083f655c33543))


### Chores

* update Volt desktop icon ([60192d0](https://github.com/zuohuadong/volt-gui/commit/60192d01f23f0f4c0e9e9b3cb989511ba622edae))

## [0.3.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.2.0...desktop-v0.3.0) (2026-06-25)


### Features

* add CDP browser_navigate tool ([c79845d](https://github.com/zuohuadong/volt-gui/commit/c79845dbde07b9173da8f83fbdb8b3d78b49475a))
* add frontend i18n (zh/en auto-detect), hide debug panels, fix dev runtime ([b50ecfb](https://github.com/zuohuadong/volt-gui/commit/b50ecfb3915ca0dd2ff75b88fdd0475248bc4bef))
* add reasonix compatibility and marketing architecture ([c6667b1](https://github.com/zuohuadong/volt-gui/commit/c6667b1dd87dd60c335427e3b3d105ece9a1d388))
* add workbench product plugin framework ([54b3588](https://github.com/zuohuadong/volt-gui/commit/54b3588b28f9afc27ea43069bd2dc19db994926a))
* apply VoltUI branding on top of upstream main-v2 ([4e5b14b](https://github.com/zuohuadong/volt-gui/commit/4e5b14b8a881eddae9d4ef15847955d2755f39d1))
* **ci:** add auto-release pipeline and merge-request CI checks ([3b7e02e](https://github.com/zuohuadong/volt-gui/commit/3b7e02e099ab85f61c7d45c656e572734fbbd126))
* **desktop:** add generic OIDC auth gate ([dc72a2a](https://github.com/zuohuadong/volt-gui/commit/dc72a2aa3f2eec325c00f616c100035a38c9beda))
* **desktop:** add model provider management UI ([6e3efff](https://github.com/zuohuadong/volt-gui/commit/6e3efff57a3afd07db055ece05d2485b6be75038))
* **desktop:** add provider model discovery selection ([56d7372](https://github.com/zuohuadong/volt-gui/commit/56d73728a25689a60936506ebceb5b925c16b0a3))
* **desktop:** add Svelte code file tree ([2a91ed6](https://github.com/zuohuadong/volt-gui/commit/2a91ed68f8c1d1ac3ae49c6ae28e031544f62012))
* **desktop:** add Svelte composer attachments ([48ec958](https://github.com/zuohuadong/volt-gui/commit/48ec958b840b0e8ca750985cffc79b861cfd6bf8))
* **desktop:** add Svelte desktop prefs resource ([3d83bb7](https://github.com/zuohuadong/volt-gui/commit/3d83bb706949658ebf7666475122947812656984))
* **desktop:** add Svelte keyboard navigation ([8a4babc](https://github.com/zuohuadong/volt-gui/commit/8a4babcac35e1bcd95d58274a28ba7d435cae611))
* **desktop:** add Svelte memory shortcuts ([396ff38](https://github.com/zuohuadong/volt-gui/commit/396ff3807bdf8b6ab9a7b49cfca77be024c1e6ac))
* **desktop:** add Svelte project tree navigation ([27ca255](https://github.com/zuohuadong/volt-gui/commit/27ca255948f16edc61f02a967ab45c926b4b3dc4))
* **desktop:** add Svelte resource edit flows ([726aaaa](https://github.com/zuohuadong/volt-gui/commit/726aaaa96ebdf785afefc4d95bcaa52819b20811))
* **desktop:** add Svelte session tab actions ([3f3ef61](https://github.com/zuohuadong/volt-gui/commit/3f3ef610ae71deda268855316160b0dc31b4e36b))
* **desktop:** add Svelte update banner ([2128b85](https://github.com/zuohuadong/volt-gui/commit/2128b8556cc13e78b50cdc44a91165ae54c89d14))
* **desktop:** add Svelte work dashboard tasks ([38a093e](https://github.com/zuohuadong/volt-gui/commit/38a093ef8ad65c70f88f2f5b7566240c6d57b7b4))
* **desktop:** add Svelte workbench interaction shell ([0d5fbcb](https://github.com/zuohuadong/volt-gui/commit/0d5fbcba0c2b04bb28dd613b9e770f798e48786b))
* **desktop:** complete Svelte file reference navigation ([a539123](https://github.com/zuohuadong/volt-gui/commit/a53912372996f5760d8ed65cbc9d69e84ead6756))
* **desktop:** complete Svelte slash composer flow ([eec8d2e](https://github.com/zuohuadong/volt-gui/commit/eec8d2e942c44fbbbe6ae3c36a744ebf157d4617))
* **desktop:** configurable release URLs + unsigned asset support + missing-platform guard ([2837939](https://github.com/zuohuadong/volt-gui/commit/283793936fb21b4c1290da676a8b3190c98eb22b))
* **desktop:** cover Svelte changed-file edge cases ([74790f5](https://github.com/zuohuadong/volt-gui/commit/74790f59b3d50f5f4deb794e6e263c945058bc8f))
* **desktop:** enrich Svelte code context panel ([360fa34](https://github.com/zuohuadong/volt-gui/commit/360fa34a748541817135f58259721448be25c783))
* **desktop:** group Svelte tool subcalls ([b228b7a](https://github.com/zuohuadong/volt-gui/commit/b228b7af86c5b45285cd9122e579e8c662470dcf))
* **desktop:** hydrate Svelte workbench sessions ([ea9d947](https://github.com/zuohuadong/volt-gui/commit/ea9d947e5373db971da6a8d01d9346ebad9e278b))
* **desktop:** improve Svelte responsive layout ([1cb2d4e](https://github.com/zuohuadong/volt-gui/commit/1cb2d4ee7b1b71a87e101f17fcdd1288ea9ac206))
* **desktop:** refresh Svelte checkpoints after rewind ([71e20b0](https://github.com/zuohuadong/volt-gui/commit/71e20b043dcbe7b74d9c1c9ce24dcd40957bf9d5))
* **desktop:** render Svelte transcript math ([6ec76d4](https://github.com/zuohuadong/volt-gui/commit/6ec76d4f1383f21003e6f11de5105d3870e4b237))
* **desktop:** render Svelte workbench markdown ([f5a9837](https://github.com/zuohuadong/volt-gui/commit/f5a9837edc92efedb114adad0e60a12773d8849e))
* **desktop:** restore Svelte composer drafts on cancel ([252d8e2](https://github.com/zuohuadong/volt-gui/commit/252d8e23c3d4aef9dde1d3b839088beb148641f1))
* **desktop:** scaffold Svelte workbench shell ([8d1bce4](https://github.com/zuohuadong/volt-gui/commit/8d1bce4a386b2f759953103b18ba3b709884f889))
* **desktop:** show Svelte workspace diffs ([f2c257b](https://github.com/zuohuadong/volt-gui/commit/f2c257bff9033e9a1860105d555e766599bc3d34))
* **desktop:** verify Svelte Wails interaction parity ([8f8992f](https://github.com/zuohuadong/volt-gui/commit/8f8992f6707443e649a2990b9e6126aea5860b1a))
* **desktop:** wire Svelte goal flows ([9dcb5fa](https://github.com/zuohuadong/volt-gui/commit/9dcb5faa618f4c7196e551eaec9e9843352247ab))
* **desktop:** wire Svelte run mode permissions ([6ec1a71](https://github.com/zuohuadong/volt-gui/commit/6ec1a7167f7618ea2856f6b993ddad07a5996f55))
* **desktop:** wire Svelte workbench build path ([2b6653f](https://github.com/zuohuadong/volt-gui/commit/2b6653f74ca55ff40d4382b88fe9a6b2d03d3e61))
* refine agent task and team workbench ([73f5842](https://github.com/zuohuadong/volt-gui/commit/73f584254051fc446b199914ddbc9907fe20e1c4))
* refine desktop workbench navigation ([cb2304e](https://github.com/zuohuadong/volt-gui/commit/cb2304e88185a607abb55daf7d2128a08cb050b3))
* refine workbench UI and agent market ([2d62684](https://github.com/zuohuadong/volt-gui/commit/2d626844f3e5599b1d711098c55f3e3dfe17db12))
* replace React shell with Svelte 5 workbench ([30ef638](https://github.com/zuohuadong/volt-gui/commit/30ef6381d8852a4fef539ec7841672642005ab91))
* restore desktop workbench UI ([f4a2bff](https://github.com/zuohuadong/volt-gui/commit/f4a2bff5fe48b5fd0352c37ca17b0b86c69589e2))
* **svelte:** port OIDC login overlay from React to Svelte ([70d8266](https://github.com/zuohuadong/volt-gui/commit/70d82660a352e516d0adee0a537cc43c6ad57bed))


### Bug Fixes

* **bot:** add //go:build bot tags + fix reasonix module imports ([f48d4f6](https://github.com/zuohuadong/volt-gui/commit/f48d4f6b3d58ecb8fe283402e0bbd55304e316e8))
* **ci:** correct auto-release version bump logic and upstream links ([5fcdf4f](https://github.com/zuohuadong/volt-gui/commit/5fcdf4f75fcded050e10a423eb767f3f42d05036))
* close full feature validation gaps ([2dbe1cc](https://github.com/zuohuadong/volt-gui/commit/2dbe1cc460a69533cdb40577c1e47ee1aa787eb5))
* **desktop:** keep macOS Wails boot stable ([ca955ad](https://github.com/zuohuadong/volt-gui/commit/ca955adc170806f7ff0436e57c8bee1c780c56f2))
* **desktop:** restore default Wails test build ([480d0bb](https://github.com/zuohuadong/volt-gui/commit/480d0bb6382c3409fc922d8321fe481dbd9f3149))
* improve desktop chat and workspace interactions ([614c156](https://github.com/zuohuadong/volt-gui/commit/614c156c8777c3455f38643dfa3c92622f2dab3f))
* improve desktop skill display names ([7161ae4](https://github.com/zuohuadong/volt-gui/commit/7161ae4d4567c0445891325b22c612b5cfce0531))
* prevent OOM from unbounded transcript growth and streaming re-render storms ([2848629](https://github.com/zuohuadong/volt-gui/commit/2848629246e02ddf1a44cf8d7280ea01e14768c6))
* refine composer toolbar icons ([f55ad29](https://github.com/zuohuadong/volt-gui/commit/f55ad29ffb4a1785e932ca8058546064ddf9ad8c))
* remove orphan CLI files referencing non-existent symbols ([aaf940a](https://github.com/zuohuadong/volt-gui/commit/aaf940a6800bb45d1e5433c4a0b4b95dbcd274fb))
* remove workbench business copy residuals ([1377a80](https://github.com/zuohuadong/volt-gui/commit/1377a800adf0d3b0172d040d09d28abc065a9c66))
* resolve all test compilation failures and brand path references ([beb211f](https://github.com/zuohuadong/volt-gui/commit/beb211ffd59ca05d847a16e5abc889f1750ac400))
* restore per-subject approval grants, adopt svadmin, remove mock bridge ([6f2a139](https://github.com/zuohuadong/volt-gui/commit/6f2a139bf0780b226dfc333b6c1cb7a829bc6a09))
* revert incompatible upstream sync, improve sync script, add NotificationsConfig ([9988e28](https://github.com/zuohuadong/volt-gui/commit/9988e28ef590e9c394f40dcc858465fa0152b42f))
* **sync:** improve upstream sync script with divergent package handling ([77c8164](https://github.com/zuohuadong/volt-gui/commit/77c81648447e0c5ff5eb46e06ca9d7807021e890))


### Refactoring

* **frontend:** add office workbench shell ([7a8a8f2](https://github.com/zuohuadong/volt-gui/commit/7a8a8f2febcedd01bf477b7c47050b01b67067dc))
* **frontend:** layer workbench capabilities ([08e8019](https://github.com/zuohuadong/volt-gui/commit/08e80190ca1deab7e4a2bf2ce1beae9d2f695db9))
* **frontend:** minimal OpenLoaf-style shell ([5b91e7f](https://github.com/zuohuadong/volt-gui/commit/5b91e7f7b03d7d270e9dc4acb303495f3364e4eb))
* **frontend:** polish TRAE-style workbench ([db44a60](https://github.com/zuohuadong/volt-gui/commit/db44a6037cc8e0c1660840650c1b0adf4749b1bf))


### Documentation

* define desktop workbench migration contract ([c094329](https://github.com/zuohuadong/volt-gui/commit/c094329fe5830cde969232e2630b96a8bec92c1b))
* outline enterprise mount platform ([34bffd7](https://github.com/zuohuadong/volt-gui/commit/34bffd7108ef61fdfcce06aa2c4ea46590fde464))
* record enterprise mount review merge ([286e669](https://github.com/zuohuadong/volt-gui/commit/286e669c24e69b31c459a09a85a65ea8929ed969))
* record PR [#6](https://github.com/zuohuadong/volt-gui/issues/6) workbench plugin framework review-merge and ledger status fixes ([90d9ab6](https://github.com/zuohuadong/volt-gui/commit/90d9ab6a6468278f81f7df23bec5a73fade5a248))
* update progress with UI shell cleanup ([fb8be42](https://github.com/zuohuadong/volt-gui/commit/fb8be429a67c0aa5fd9376c8b516211b10ee61f3))


### CI

* add daily upstream sync workflow + sync script ([85e50da](https://github.com/zuohuadong/volt-gui/commit/85e50dadb1b487acbf5fef99f6604cad4d1dcaff))
* **desktop:** add GitHub desktop release automation ([951daab](https://github.com/zuohuadong/volt-gui/commit/951daab6a7627dfd2a697e6f964693db4646f5fa))
* **desktop:** enable automated release publishing ([26a93db](https://github.com/zuohuadong/volt-gui/commit/26a93db7c5fc4d7f9e70a3fe9daf28a7df015788))
* **desktop:** skip release please without PAT ([4ebead0](https://github.com/zuohuadong/volt-gui/commit/4ebead0cf152a2c8d484dbe186131d7e88e47c98))


### Chores

* **deps:** bump actions/checkout from 6 to 7 in the actions group ([#11](https://github.com/zuohuadong/volt-gui/issues/11)) ([ccc64b2](https://github.com/zuohuadong/volt-gui/commit/ccc64b23ebf9403554e383ef179a169f075cfcf5))
* **deps:** bump astro from 5.18.2 to 6.4.6 in /site ([e5c3bf6](https://github.com/zuohuadong/volt-gui/commit/e5c3bf6f0852d5200b2a888dc066fda678fa6647))
* **deps:** bump astro from 6.4.6 to 6.4.8 in /site in the npm group ([#7](https://github.com/zuohuadong/volt-gui/issues/7)) ([85ee4eb](https://github.com/zuohuadong/volt-gui/commit/85ee4eb60dc809510e08410300ed166db9a48d99))
* **deps:** bump github.com/coreos/go-oidc/v3 ([#6](https://github.com/zuohuadong/volt-gui/issues/6)) ([bee5bca](https://github.com/zuohuadong/volt-gui/commit/bee5bcad21ab40799d948732d8fdc37e971bb04d))
* **deps:** bump golang.org/x/mod from 0.36.0 to 0.37.0 ([e3987ff](https://github.com/zuohuadong/volt-gui/commit/e3987fffeb2b21cca0bfdebcf60add477896a4ba))
* **deps:** bump the actions group with 12 updates ([718b56f](https://github.com/zuohuadong/volt-gui/commit/718b56fa49956b1489321703647b5a1f50d25f15))
* **deps:** bump the go group in /desktop with 7 updates ([7f8d38b](https://github.com/zuohuadong/volt-gui/commit/7f8d38b7c90dd85e727508f1d812eb4368fc3d3e))
* **deps:** bump the go group with 5 updates ([fb20172](https://github.com/zuohuadong/volt-gui/commit/fb201725f5e00d160e6b389e31246d1e16a2541f))
* **deps:** bump the go group with 6 updates ([#8](https://github.com/zuohuadong/volt-gui/issues/8)) ([cb2fb9d](https://github.com/zuohuadong/volt-gui/commit/cb2fb9de9dd411e3ae18f279d245f43eaba24b42))
* **deps:** bump the npm group in /desktop/frontend with 3 updates ([#10](https://github.com/zuohuadong/volt-gui/issues/10)) ([7e44810](https://github.com/zuohuadong/volt-gui/commit/7e4481034d50eac47ee4519552f8f0da40fe02e0))
* **desktop:** reset release baseline to v0.1.0 ([ec50df3](https://github.com/zuohuadong/volt-gui/commit/ec50df3cc67687ade43dd6e1eb79a4507768b7dc))
* **main:** release desktop v0.2.0 ([711309a](https://github.com/zuohuadong/volt-gui/commit/711309aceb6cfcb7dbd89739eeb581aaf3e48e1c))
* **main:** release desktop v1.12.0 ([04dace2](https://github.com/zuohuadong/volt-gui/commit/04dace2269a807fd827692599bf01ee55d991807))
* **main:** release desktop v1.12.0 ([04dace2](https://github.com/zuohuadong/volt-gui/commit/04dace2269a807fd827692599bf01ee55d991807))
* **main:** release desktop v1.12.0 ([0b5a898](https://github.com/zuohuadong/volt-gui/commit/0b5a898173329d1acf572833715cecc57cba1166))
* record OIDC PR compare link ([9ce9b2a](https://github.com/zuohuadong/volt-gui/commit/9ce9b2a309b0111b3980465b0e5c6ac800b49b96))
* record PR2 PR3 merge verification ([2ccbf5a](https://github.com/zuohuadong/volt-gui/commit/2ccbf5a8bb6bf00693d7587cdf6543bd28bb471b))
* record PR4 PR5 merge and review findings fix ([2f8a03f](https://github.com/zuohuadong/volt-gui/commit/2f8a03f4d8a747596ceda7e32a05bc9f9c5c37fe))
* record reasonix sync push ([48bfb8c](https://github.com/zuohuadong/volt-gui/commit/48bfb8c91f8d9ebe3fc8f89f4ac49ee9bdd02a85))
* resubmit latest state ([76dcc9a](https://github.com/zuohuadong/volt-gui/commit/76dcc9aa0df7606f016e61b817162c3faeabbe4b))
* resubmit shared skills sync ([22987d5](https://github.com/zuohuadong/volt-gui/commit/22987d5bf5c88c49f25f7f8344f54a2d020ad20e))
* resubmit with github account ([4870d63](https://github.com/zuohuadong/volt-gui/commit/4870d635cf6ebec8197ac7047e6a139b8c43c66e))
* sync agent-team framework to latest deploy ([c983f4b](https://github.com/zuohuadong/volt-gui/commit/c983f4b1990db3dc02008054bcb68ae79d61430f))
* sync reasonix upstream ([7835a13](https://github.com/zuohuadong/volt-gui/commit/7835a13725db2c94d9196f42265f05e80085803e))
* update upstream sync marker ([2e53fac](https://github.com/zuohuadong/volt-gui/commit/2e53fac04efe41ebd7c817f5488ac3d4551782d8))

## [0.2.0](https://github.com/zuohuadong/volt-gui/compare/desktop-v0.1.0...desktop-v0.2.0) (2026-06-25)


### Features

* add CDP browser_navigate tool ([c79845d](https://github.com/zuohuadong/volt-gui/commit/c79845dbde07b9173da8f83fbdb8b3d78b49475a))
* add frontend i18n (zh/en auto-detect), hide debug panels, fix dev runtime ([b50ecfb](https://github.com/zuohuadong/volt-gui/commit/b50ecfb3915ca0dd2ff75b88fdd0475248bc4bef))
* add reasonix compatibility and marketing architecture ([c6667b1](https://github.com/zuohuadong/volt-gui/commit/c6667b1dd87dd60c335427e3b3d105ece9a1d388))
* add workbench product plugin framework ([54b3588](https://github.com/zuohuadong/volt-gui/commit/54b3588b28f9afc27ea43069bd2dc19db994926a))
* apply VoltUI branding on top of upstream main-v2 ([4e5b14b](https://github.com/zuohuadong/volt-gui/commit/4e5b14b8a881eddae9d4ef15847955d2755f39d1))
* **ci:** add auto-release pipeline and merge-request CI checks ([3b7e02e](https://github.com/zuohuadong/volt-gui/commit/3b7e02e099ab85f61c7d45c656e572734fbbd126))
* **desktop:** add generic OIDC auth gate ([dc72a2a](https://github.com/zuohuadong/volt-gui/commit/dc72a2aa3f2eec325c00f616c100035a38c9beda))
* **desktop:** add model provider management UI ([6e3efff](https://github.com/zuohuadong/volt-gui/commit/6e3efff57a3afd07db055ece05d2485b6be75038))
* **desktop:** add Svelte code file tree ([2a91ed6](https://github.com/zuohuadong/volt-gui/commit/2a91ed68f8c1d1ac3ae49c6ae28e031544f62012))
* **desktop:** add Svelte composer attachments ([48ec958](https://github.com/zuohuadong/volt-gui/commit/48ec958b840b0e8ca750985cffc79b861cfd6bf8))
* **desktop:** add Svelte desktop prefs resource ([3d83bb7](https://github.com/zuohuadong/volt-gui/commit/3d83bb706949658ebf7666475122947812656984))
* **desktop:** add Svelte keyboard navigation ([8a4babc](https://github.com/zuohuadong/volt-gui/commit/8a4babcac35e1bcd95d58274a28ba7d435cae611))
* **desktop:** add Svelte memory shortcuts ([396ff38](https://github.com/zuohuadong/volt-gui/commit/396ff3807bdf8b6ab9a7b49cfca77be024c1e6ac))
* **desktop:** add Svelte project tree navigation ([27ca255](https://github.com/zuohuadong/volt-gui/commit/27ca255948f16edc61f02a967ab45c926b4b3dc4))
* **desktop:** add Svelte resource edit flows ([726aaaa](https://github.com/zuohuadong/volt-gui/commit/726aaaa96ebdf785afefc4d95bcaa52819b20811))
* **desktop:** add Svelte session tab actions ([3f3ef61](https://github.com/zuohuadong/volt-gui/commit/3f3ef610ae71deda268855316160b0dc31b4e36b))
* **desktop:** add Svelte update banner ([2128b85](https://github.com/zuohuadong/volt-gui/commit/2128b8556cc13e78b50cdc44a91165ae54c89d14))
* **desktop:** add Svelte work dashboard tasks ([38a093e](https://github.com/zuohuadong/volt-gui/commit/38a093ef8ad65c70f88f2f5b7566240c6d57b7b4))
* **desktop:** add Svelte workbench interaction shell ([0d5fbcb](https://github.com/zuohuadong/volt-gui/commit/0d5fbcba0c2b04bb28dd613b9e770f798e48786b))
* **desktop:** complete Svelte file reference navigation ([a539123](https://github.com/zuohuadong/volt-gui/commit/a53912372996f5760d8ed65cbc9d69e84ead6756))
* **desktop:** complete Svelte slash composer flow ([eec8d2e](https://github.com/zuohuadong/volt-gui/commit/eec8d2e942c44fbbbe6ae3c36a744ebf157d4617))
* **desktop:** configurable release URLs + unsigned asset support + missing-platform guard ([2837939](https://github.com/zuohuadong/volt-gui/commit/283793936fb21b4c1290da676a8b3190c98eb22b))
* **desktop:** cover Svelte changed-file edge cases ([74790f5](https://github.com/zuohuadong/volt-gui/commit/74790f59b3d50f5f4deb794e6e263c945058bc8f))
* **desktop:** enrich Svelte code context panel ([360fa34](https://github.com/zuohuadong/volt-gui/commit/360fa34a748541817135f58259721448be25c783))
* **desktop:** group Svelte tool subcalls ([b228b7a](https://github.com/zuohuadong/volt-gui/commit/b228b7af86c5b45285cd9122e579e8c662470dcf))
* **desktop:** hydrate Svelte workbench sessions ([ea9d947](https://github.com/zuohuadong/volt-gui/commit/ea9d947e5373db971da6a8d01d9346ebad9e278b))
* **desktop:** improve Svelte responsive layout ([1cb2d4e](https://github.com/zuohuadong/volt-gui/commit/1cb2d4ee7b1b71a87e101f17fcdd1288ea9ac206))
* **desktop:** refresh Svelte checkpoints after rewind ([71e20b0](https://github.com/zuohuadong/volt-gui/commit/71e20b043dcbe7b74d9c1c9ce24dcd40957bf9d5))
* **desktop:** render Svelte transcript math ([6ec76d4](https://github.com/zuohuadong/volt-gui/commit/6ec76d4f1383f21003e6f11de5105d3870e4b237))
* **desktop:** render Svelte workbench markdown ([f5a9837](https://github.com/zuohuadong/volt-gui/commit/f5a9837edc92efedb114adad0e60a12773d8849e))
* **desktop:** restore Svelte composer drafts on cancel ([252d8e2](https://github.com/zuohuadong/volt-gui/commit/252d8e23c3d4aef9dde1d3b839088beb148641f1))
* **desktop:** scaffold Svelte workbench shell ([8d1bce4](https://github.com/zuohuadong/volt-gui/commit/8d1bce4a386b2f759953103b18ba3b709884f889))
* **desktop:** show Svelte workspace diffs ([f2c257b](https://github.com/zuohuadong/volt-gui/commit/f2c257bff9033e9a1860105d555e766599bc3d34))
* **desktop:** verify Svelte Wails interaction parity ([8f8992f](https://github.com/zuohuadong/volt-gui/commit/8f8992f6707443e649a2990b9e6126aea5860b1a))
* **desktop:** wire Svelte goal flows ([9dcb5fa](https://github.com/zuohuadong/volt-gui/commit/9dcb5faa618f4c7196e551eaec9e9843352247ab))
* **desktop:** wire Svelte run mode permissions ([6ec1a71](https://github.com/zuohuadong/volt-gui/commit/6ec1a7167f7618ea2856f6b993ddad07a5996f55))
* **desktop:** wire Svelte workbench build path ([2b6653f](https://github.com/zuohuadong/volt-gui/commit/2b6653f74ca55ff40d4382b88fe9a6b2d03d3e61))
* refine agent task and team workbench ([73f5842](https://github.com/zuohuadong/volt-gui/commit/73f584254051fc446b199914ddbc9907fe20e1c4))
* refine desktop workbench navigation ([cb2304e](https://github.com/zuohuadong/volt-gui/commit/cb2304e88185a607abb55daf7d2128a08cb050b3))
* refine workbench UI and agent market ([2d62684](https://github.com/zuohuadong/volt-gui/commit/2d626844f3e5599b1d711098c55f3e3dfe17db12))
* replace React shell with Svelte 5 workbench ([30ef638](https://github.com/zuohuadong/volt-gui/commit/30ef6381d8852a4fef539ec7841672642005ab91))
* restore desktop workbench UI ([f4a2bff](https://github.com/zuohuadong/volt-gui/commit/f4a2bff5fe48b5fd0352c37ca17b0b86c69589e2))
* **svelte:** port OIDC login overlay from React to Svelte ([70d8266](https://github.com/zuohuadong/volt-gui/commit/70d82660a352e516d0adee0a537cc43c6ad57bed))


### Bug Fixes

* **bot:** add //go:build bot tags + fix reasonix module imports ([f48d4f6](https://github.com/zuohuadong/volt-gui/commit/f48d4f6b3d58ecb8fe283402e0bbd55304e316e8))
* **ci:** correct auto-release version bump logic and upstream links ([5fcdf4f](https://github.com/zuohuadong/volt-gui/commit/5fcdf4f75fcded050e10a423eb767f3f42d05036))
* close full feature validation gaps ([2dbe1cc](https://github.com/zuohuadong/volt-gui/commit/2dbe1cc460a69533cdb40577c1e47ee1aa787eb5))
* **desktop:** keep macOS Wails boot stable ([ca955ad](https://github.com/zuohuadong/volt-gui/commit/ca955adc170806f7ff0436e57c8bee1c780c56f2))
* **desktop:** restore default Wails test build ([480d0bb](https://github.com/zuohuadong/volt-gui/commit/480d0bb6382c3409fc922d8321fe481dbd9f3149))
* improve desktop chat and workspace interactions ([614c156](https://github.com/zuohuadong/volt-gui/commit/614c156c8777c3455f38643dfa3c92622f2dab3f))
* improve desktop skill display names ([7161ae4](https://github.com/zuohuadong/volt-gui/commit/7161ae4d4567c0445891325b22c612b5cfce0531))
* prevent OOM from unbounded transcript growth and streaming re-render storms ([2848629](https://github.com/zuohuadong/volt-gui/commit/2848629246e02ddf1a44cf8d7280ea01e14768c6))
* refine composer toolbar icons ([f55ad29](https://github.com/zuohuadong/volt-gui/commit/f55ad29ffb4a1785e932ca8058546064ddf9ad8c))
* remove orphan CLI files referencing non-existent symbols ([aaf940a](https://github.com/zuohuadong/volt-gui/commit/aaf940a6800bb45d1e5433c4a0b4b95dbcd274fb))
* remove workbench business copy residuals ([1377a80](https://github.com/zuohuadong/volt-gui/commit/1377a800adf0d3b0172d040d09d28abc065a9c66))
* resolve all test compilation failures and brand path references ([beb211f](https://github.com/zuohuadong/volt-gui/commit/beb211ffd59ca05d847a16e5abc889f1750ac400))
* restore per-subject approval grants, adopt svadmin, remove mock bridge ([6f2a139](https://github.com/zuohuadong/volt-gui/commit/6f2a139bf0780b226dfc333b6c1cb7a829bc6a09))
* revert incompatible upstream sync, improve sync script, add NotificationsConfig ([9988e28](https://github.com/zuohuadong/volt-gui/commit/9988e28ef590e9c394f40dcc858465fa0152b42f))
* **sync:** improve upstream sync script with divergent package handling ([77c8164](https://github.com/zuohuadong/volt-gui/commit/77c81648447e0c5ff5eb46e06ca9d7807021e890))


### Refactoring

* **frontend:** add office workbench shell ([7a8a8f2](https://github.com/zuohuadong/volt-gui/commit/7a8a8f2febcedd01bf477b7c47050b01b67067dc))
* **frontend:** layer workbench capabilities ([08e8019](https://github.com/zuohuadong/volt-gui/commit/08e80190ca1deab7e4a2bf2ce1beae9d2f695db9))
* **frontend:** minimal OpenLoaf-style shell ([5b91e7f](https://github.com/zuohuadong/volt-gui/commit/5b91e7f7b03d7d270e9dc4acb303495f3364e4eb))
* **frontend:** polish TRAE-style workbench ([db44a60](https://github.com/zuohuadong/volt-gui/commit/db44a6037cc8e0c1660840650c1b0adf4749b1bf))


### Documentation

* define desktop workbench migration contract ([c094329](https://github.com/zuohuadong/volt-gui/commit/c094329fe5830cde969232e2630b96a8bec92c1b))
* outline enterprise mount platform ([34bffd7](https://github.com/zuohuadong/volt-gui/commit/34bffd7108ef61fdfcce06aa2c4ea46590fde464))
* record enterprise mount review merge ([286e669](https://github.com/zuohuadong/volt-gui/commit/286e669c24e69b31c459a09a85a65ea8929ed969))
* record PR [#6](https://github.com/zuohuadong/volt-gui/issues/6) workbench plugin framework review-merge and ledger status fixes ([90d9ab6](https://github.com/zuohuadong/volt-gui/commit/90d9ab6a6468278f81f7df23bec5a73fade5a248))
* update progress with UI shell cleanup ([fb8be42](https://github.com/zuohuadong/volt-gui/commit/fb8be429a67c0aa5fd9376c8b516211b10ee61f3))


### CI

* add daily upstream sync workflow + sync script ([85e50da](https://github.com/zuohuadong/volt-gui/commit/85e50dadb1b487acbf5fef99f6604cad4d1dcaff))
* **desktop:** add GitHub desktop release automation ([951daab](https://github.com/zuohuadong/volt-gui/commit/951daab6a7627dfd2a697e6f964693db4646f5fa))
* **desktop:** enable automated release publishing ([26a93db](https://github.com/zuohuadong/volt-gui/commit/26a93db7c5fc4d7f9e70a3fe9daf28a7df015788))
* **desktop:** skip release please without PAT ([4ebead0](https://github.com/zuohuadong/volt-gui/commit/4ebead0cf152a2c8d484dbe186131d7e88e47c98))


### Chores

* **deps:** bump actions/checkout from 6 to 7 in the actions group ([#11](https://github.com/zuohuadong/volt-gui/issues/11)) ([ccc64b2](https://github.com/zuohuadong/volt-gui/commit/ccc64b23ebf9403554e383ef179a169f075cfcf5))
* **deps:** bump astro from 5.18.2 to 6.4.6 in /site ([e5c3bf6](https://github.com/zuohuadong/volt-gui/commit/e5c3bf6f0852d5200b2a888dc066fda678fa6647))
* **deps:** bump astro from 6.4.6 to 6.4.8 in /site in the npm group ([#7](https://github.com/zuohuadong/volt-gui/issues/7)) ([85ee4eb](https://github.com/zuohuadong/volt-gui/commit/85ee4eb60dc809510e08410300ed166db9a48d99))
* **deps:** bump github.com/coreos/go-oidc/v3 ([#6](https://github.com/zuohuadong/volt-gui/issues/6)) ([bee5bca](https://github.com/zuohuadong/volt-gui/commit/bee5bcad21ab40799d948732d8fdc37e971bb04d))
* **deps:** bump golang.org/x/mod from 0.36.0 to 0.37.0 ([e3987ff](https://github.com/zuohuadong/volt-gui/commit/e3987fffeb2b21cca0bfdebcf60add477896a4ba))
* **deps:** bump the actions group with 12 updates ([718b56f](https://github.com/zuohuadong/volt-gui/commit/718b56fa49956b1489321703647b5a1f50d25f15))
* **deps:** bump the go group in /desktop with 7 updates ([7f8d38b](https://github.com/zuohuadong/volt-gui/commit/7f8d38b7c90dd85e727508f1d812eb4368fc3d3e))
* **deps:** bump the go group with 5 updates ([fb20172](https://github.com/zuohuadong/volt-gui/commit/fb201725f5e00d160e6b389e31246d1e16a2541f))
* **deps:** bump the go group with 6 updates ([#8](https://github.com/zuohuadong/volt-gui/issues/8)) ([cb2fb9d](https://github.com/zuohuadong/volt-gui/commit/cb2fb9de9dd411e3ae18f279d245f43eaba24b42))
* **deps:** bump the npm group in /desktop/frontend with 3 updates ([#10](https://github.com/zuohuadong/volt-gui/issues/10)) ([7e44810](https://github.com/zuohuadong/volt-gui/commit/7e4481034d50eac47ee4519552f8f0da40fe02e0))
* **desktop:** reset release baseline to v0.1.0 ([ec50df3](https://github.com/zuohuadong/volt-gui/commit/ec50df3cc67687ade43dd6e1eb79a4507768b7dc))
* **main:** release desktop v1.12.0 ([04dace2](https://github.com/zuohuadong/volt-gui/commit/04dace2269a807fd827692599bf01ee55d991807))
* **main:** release desktop v1.12.0 ([04dace2](https://github.com/zuohuadong/volt-gui/commit/04dace2269a807fd827692599bf01ee55d991807))
* **main:** release desktop v1.12.0 ([0b5a898](https://github.com/zuohuadong/volt-gui/commit/0b5a898173329d1acf572833715cecc57cba1166))
* record OIDC PR compare link ([9ce9b2a](https://github.com/zuohuadong/volt-gui/commit/9ce9b2a309b0111b3980465b0e5c6ac800b49b96))
* record PR2 PR3 merge verification ([2ccbf5a](https://github.com/zuohuadong/volt-gui/commit/2ccbf5a8bb6bf00693d7587cdf6543bd28bb471b))
* record PR4 PR5 merge and review findings fix ([2f8a03f](https://github.com/zuohuadong/volt-gui/commit/2f8a03f4d8a747596ceda7e32a05bc9f9c5c37fe))
* record reasonix sync push ([48bfb8c](https://github.com/zuohuadong/volt-gui/commit/48bfb8c91f8d9ebe3fc8f89f4ac49ee9bdd02a85))
* resubmit latest state ([76dcc9a](https://github.com/zuohuadong/volt-gui/commit/76dcc9aa0df7606f016e61b817162c3faeabbe4b))
* resubmit shared skills sync ([22987d5](https://github.com/zuohuadong/volt-gui/commit/22987d5bf5c88c49f25f7f8344f54a2d020ad20e))
* resubmit with github account ([4870d63](https://github.com/zuohuadong/volt-gui/commit/4870d635cf6ebec8197ac7047e6a139b8c43c66e))
* sync agent-team framework to latest deploy ([c983f4b](https://github.com/zuohuadong/volt-gui/commit/c983f4b1990db3dc02008054bcb68ae79d61430f))
* sync reasonix upstream ([7835a13](https://github.com/zuohuadong/volt-gui/commit/7835a13725db2c94d9196f42265f05e80085803e))
* update upstream sync marker ([2e53fac](https://github.com/zuohuadong/volt-gui/commit/2e53fac04efe41ebd7c817f5488ac3d4551782d8))

## 0.1.0 (2026-06-25)


### Features

* add CDP browser_navigate tool ([c79845d](https://github.com/zuohuadong/volt-gui/commit/c79845dbde07b9173da8f83fbdb8b3d78b49475a))
* add frontend i18n (zh/en auto-detect), hide debug panels, fix dev runtime ([b50ecfb](https://github.com/zuohuadong/volt-gui/commit/b50ecfb3915ca0dd2ff75b88fdd0475248bc4bef))
* add reasonix compatibility and marketing architecture ([c6667b1](https://github.com/zuohuadong/volt-gui/commit/c6667b1dd87dd60c335427e3b3d105ece9a1d388))
* add workbench product plugin framework ([54b3588](https://github.com/zuohuadong/volt-gui/commit/54b3588b28f9afc27ea43069bd2dc19db994926a))
* apply VoltUI branding on top of upstream main-v2 ([4e5b14b](https://github.com/zuohuadong/volt-gui/commit/4e5b14b8a881eddae9d4ef15847955d2755f39d1))
* **ci:** add auto-release pipeline and merge-request CI checks ([3b7e02e](https://github.com/zuohuadong/volt-gui/commit/3b7e02e099ab85f61c7d45c656e572734fbbd126))
* **desktop:** add generic OIDC auth gate ([dc72a2a](https://github.com/zuohuadong/volt-gui/commit/dc72a2aa3f2eec325c00f616c100035a38c9beda))
* **desktop:** add model provider management UI ([6e3efff](https://github.com/zuohuadong/volt-gui/commit/6e3efff57a3afd07db055ece05d2485b6be75038))
* **desktop:** add Svelte code file tree ([2a91ed6](https://github.com/zuohuadong/volt-gui/commit/2a91ed68f8c1d1ac3ae49c6ae28e031544f62012))
* **desktop:** add Svelte composer attachments ([48ec958](https://github.com/zuohuadong/volt-gui/commit/48ec958b840b0e8ca750985cffc79b861cfd6bf8))
* **desktop:** add Svelte desktop prefs resource ([3d83bb7](https://github.com/zuohuadong/volt-gui/commit/3d83bb706949658ebf7666475122947812656984))
* **desktop:** add Svelte keyboard navigation ([8a4babc](https://github.com/zuohuadong/volt-gui/commit/8a4babcac35e1bcd95d58274a28ba7d435cae611))
* **desktop:** add Svelte memory shortcuts ([396ff38](https://github.com/zuohuadong/volt-gui/commit/396ff3807bdf8b6ab9a7b49cfca77be024c1e6ac))
* **desktop:** add Svelte project tree navigation ([27ca255](https://github.com/zuohuadong/volt-gui/commit/27ca255948f16edc61f02a967ab45c926b4b3dc4))
* **desktop:** add Svelte resource edit flows ([726aaaa](https://github.com/zuohuadong/volt-gui/commit/726aaaa96ebdf785afefc4d95bcaa52819b20811))
* **desktop:** add Svelte session tab actions ([3f3ef61](https://github.com/zuohuadong/volt-gui/commit/3f3ef610ae71deda268855316160b0dc31b4e36b))
* **desktop:** add Svelte update banner ([2128b85](https://github.com/zuohuadong/volt-gui/commit/2128b8556cc13e78b50cdc44a91165ae54c89d14))
* **desktop:** add Svelte work dashboard tasks ([38a093e](https://github.com/zuohuadong/volt-gui/commit/38a093ef8ad65c70f88f2f5b7566240c6d57b7b4))
* **desktop:** add Svelte workbench interaction shell ([0d5fbcb](https://github.com/zuohuadong/volt-gui/commit/0d5fbcba0c2b04bb28dd613b9e770f798e48786b))
* **desktop:** complete Svelte file reference navigation ([a539123](https://github.com/zuohuadong/volt-gui/commit/a53912372996f5760d8ed65cbc9d69e84ead6756))
* **desktop:** complete Svelte slash composer flow ([eec8d2e](https://github.com/zuohuadong/volt-gui/commit/eec8d2e942c44fbbbe6ae3c36a744ebf157d4617))
* **desktop:** configurable release URLs + unsigned asset support + missing-platform guard ([2837939](https://github.com/zuohuadong/volt-gui/commit/283793936fb21b4c1290da676a8b3190c98eb22b))
* **desktop:** cover Svelte changed-file edge cases ([74790f5](https://github.com/zuohuadong/volt-gui/commit/74790f59b3d50f5f4deb794e6e263c945058bc8f))
* **desktop:** enrich Svelte code context panel ([360fa34](https://github.com/zuohuadong/volt-gui/commit/360fa34a748541817135f58259721448be25c783))
* **desktop:** group Svelte tool subcalls ([b228b7a](https://github.com/zuohuadong/volt-gui/commit/b228b7af86c5b45285cd9122e579e8c662470dcf))
* **desktop:** hydrate Svelte workbench sessions ([ea9d947](https://github.com/zuohuadong/volt-gui/commit/ea9d947e5373db971da6a8d01d9346ebad9e278b))
* **desktop:** improve Svelte responsive layout ([1cb2d4e](https://github.com/zuohuadong/volt-gui/commit/1cb2d4ee7b1b71a87e101f17fcdd1288ea9ac206))
* **desktop:** refresh Svelte checkpoints after rewind ([71e20b0](https://github.com/zuohuadong/volt-gui/commit/71e20b043dcbe7b74d9c1c9ce24dcd40957bf9d5))
* **desktop:** render Svelte transcript math ([6ec76d4](https://github.com/zuohuadong/volt-gui/commit/6ec76d4f1383f21003e6f11de5105d3870e4b237))
* **desktop:** render Svelte workbench markdown ([f5a9837](https://github.com/zuohuadong/volt-gui/commit/f5a9837edc92efedb114adad0e60a12773d8849e))
* **desktop:** restore Svelte composer drafts on cancel ([252d8e2](https://github.com/zuohuadong/volt-gui/commit/252d8e23c3d4aef9dde1d3b839088beb148641f1))
* **desktop:** scaffold Svelte workbench shell ([8d1bce4](https://github.com/zuohuadong/volt-gui/commit/8d1bce4a386b2f759953103b18ba3b709884f889))
* **desktop:** show Svelte workspace diffs ([f2c257b](https://github.com/zuohuadong/volt-gui/commit/f2c257bff9033e9a1860105d555e766599bc3d34))
* **desktop:** verify Svelte Wails interaction parity ([8f8992f](https://github.com/zuohuadong/volt-gui/commit/8f8992f6707443e649a2990b9e6126aea5860b1a))
* **desktop:** wire Svelte goal flows ([9dcb5fa](https://github.com/zuohuadong/volt-gui/commit/9dcb5faa618f4c7196e551eaec9e9843352247ab))
* **desktop:** wire Svelte run mode permissions ([6ec1a71](https://github.com/zuohuadong/volt-gui/commit/6ec1a7167f7618ea2856f6b993ddad07a5996f55))
* **desktop:** wire Svelte workbench build path ([2b6653f](https://github.com/zuohuadong/volt-gui/commit/2b6653f74ca55ff40d4382b88fe9a6b2d03d3e61))
* refine agent task and team workbench ([73f5842](https://github.com/zuohuadong/volt-gui/commit/73f584254051fc446b199914ddbc9907fe20e1c4))
* refine desktop workbench navigation ([cb2304e](https://github.com/zuohuadong/volt-gui/commit/cb2304e88185a607abb55daf7d2128a08cb050b3))
* refine workbench UI and agent market ([2d62684](https://github.com/zuohuadong/volt-gui/commit/2d626844f3e5599b1d711098c55f3e3dfe17db12))
* replace React shell with Svelte 5 workbench ([30ef638](https://github.com/zuohuadong/volt-gui/commit/30ef6381d8852a4fef539ec7841672642005ab91))
* restore desktop workbench UI ([f4a2bff](https://github.com/zuohuadong/volt-gui/commit/f4a2bff5fe48b5fd0352c37ca17b0b86c69589e2))
* **svelte:** port OIDC login overlay from React to Svelte ([70d8266](https://github.com/zuohuadong/volt-gui/commit/70d82660a352e516d0adee0a537cc43c6ad57bed))


### Bug Fixes

* **bot:** add //go:build bot tags + fix reasonix module imports ([f48d4f6](https://github.com/zuohuadong/volt-gui/commit/f48d4f6b3d58ecb8fe283402e0bbd55304e316e8))
* **ci:** correct auto-release version bump logic and upstream links ([5fcdf4f](https://github.com/zuohuadong/volt-gui/commit/5fcdf4f75fcded050e10a423eb767f3f42d05036))
* close full feature validation gaps ([2dbe1cc](https://github.com/zuohuadong/volt-gui/commit/2dbe1cc460a69533cdb40577c1e47ee1aa787eb5))
* **desktop:** keep macOS Wails boot stable ([ca955ad](https://github.com/zuohuadong/volt-gui/commit/ca955adc170806f7ff0436e57c8bee1c780c56f2))
* **desktop:** restore default Wails test build ([480d0bb](https://github.com/zuohuadong/volt-gui/commit/480d0bb6382c3409fc922d8321fe481dbd9f3149))
* improve desktop chat and workspace interactions ([614c156](https://github.com/zuohuadong/volt-gui/commit/614c156c8777c3455f38643dfa3c92622f2dab3f))
* improve desktop skill display names ([7161ae4](https://github.com/zuohuadong/volt-gui/commit/7161ae4d4567c0445891325b22c612b5cfce0531))
* prevent OOM from unbounded transcript growth and streaming re-render storms ([2848629](https://github.com/zuohuadong/volt-gui/commit/2848629246e02ddf1a44cf8d7280ea01e14768c6))
* refine composer toolbar icons ([f55ad29](https://github.com/zuohuadong/volt-gui/commit/f55ad29ffb4a1785e932ca8058546064ddf9ad8c))
* remove orphan CLI files referencing non-existent symbols ([aaf940a](https://github.com/zuohuadong/volt-gui/commit/aaf940a6800bb45d1e5433c4a0b4b95dbcd274fb))
* remove workbench business copy residuals ([1377a80](https://github.com/zuohuadong/volt-gui/commit/1377a800adf0d3b0172d040d09d28abc065a9c66))
* resolve all test compilation failures and brand path references ([beb211f](https://github.com/zuohuadong/volt-gui/commit/beb211ffd59ca05d847a16e5abc889f1750ac400))
* restore per-subject approval grants, adopt svadmin, remove mock bridge ([6f2a139](https://github.com/zuohuadong/volt-gui/commit/6f2a139bf0780b226dfc333b6c1cb7a829bc6a09))
* revert incompatible upstream sync, improve sync script, add NotificationsConfig ([9988e28](https://github.com/zuohuadong/volt-gui/commit/9988e28ef590e9c394f40dcc858465fa0152b42f))
* **sync:** improve upstream sync script with divergent package handling ([77c8164](https://github.com/zuohuadong/volt-gui/commit/77c81648447e0c5ff5eb46e06ca9d7807021e890))


### Refactoring

* **frontend:** add office workbench shell ([7a8a8f2](https://github.com/zuohuadong/volt-gui/commit/7a8a8f2febcedd01bf477b7c47050b01b67067dc))
* **frontend:** layer workbench capabilities ([08e8019](https://github.com/zuohuadong/volt-gui/commit/08e80190ca1deab7e4a2bf2ce1beae9d2f695db9))
* **frontend:** minimal OpenLoaf-style shell ([5b91e7f](https://github.com/zuohuadong/volt-gui/commit/5b91e7f7b03d7d270e9dc4acb303495f3364e4eb))
* **frontend:** polish TRAE-style workbench ([db44a60](https://github.com/zuohuadong/volt-gui/commit/db44a6037cc8e0c1660840650c1b0adf4749b1bf))


### Documentation

* define desktop workbench migration contract ([c094329](https://github.com/zuohuadong/volt-gui/commit/c094329fe5830cde969232e2630b96a8bec92c1b))
* outline enterprise mount platform ([34bffd7](https://github.com/zuohuadong/volt-gui/commit/34bffd7108ef61fdfcce06aa2c4ea46590fde464))
* record enterprise mount review merge ([286e669](https://github.com/zuohuadong/volt-gui/commit/286e669c24e69b31c459a09a85a65ea8929ed969))
* record PR [#6](https://github.com/zuohuadong/volt-gui/issues/6) workbench plugin framework review-merge and ledger status fixes ([90d9ab6](https://github.com/zuohuadong/volt-gui/commit/90d9ab6a6468278f81f7df23bec5a73fade5a248))
* update progress with UI shell cleanup ([fb8be42](https://github.com/zuohuadong/volt-gui/commit/fb8be429a67c0aa5fd9376c8b516211b10ee61f3))


### CI

* add daily upstream sync workflow + sync script ([85e50da](https://github.com/zuohuadong/volt-gui/commit/85e50dadb1b487acbf5fef99f6604cad4d1dcaff))
* **desktop:** add GitHub desktop release automation ([951daab](https://github.com/zuohuadong/volt-gui/commit/951daab6a7627dfd2a697e6f964693db4646f5fa))
* **desktop:** enable automated release publishing ([26a93db](https://github.com/zuohuadong/volt-gui/commit/26a93db7c5fc4d7f9e70a3fe9daf28a7df015788))
* **desktop:** skip release please without PAT ([4ebead0](https://github.com/zuohuadong/volt-gui/commit/4ebead0cf152a2c8d484dbe186131d7e88e47c98))


### Chores

* **deps:** bump actions/checkout from 6 to 7 in the actions group ([#11](https://github.com/zuohuadong/volt-gui/issues/11)) ([ccc64b2](https://github.com/zuohuadong/volt-gui/commit/ccc64b23ebf9403554e383ef179a169f075cfcf5))
* **deps:** bump astro from 5.18.2 to 6.4.6 in /site ([e5c3bf6](https://github.com/zuohuadong/volt-gui/commit/e5c3bf6f0852d5200b2a888dc066fda678fa6647))
* **deps:** bump astro from 6.4.6 to 6.4.8 in /site in the npm group ([#7](https://github.com/zuohuadong/volt-gui/issues/7)) ([85ee4eb](https://github.com/zuohuadong/volt-gui/commit/85ee4eb60dc809510e08410300ed166db9a48d99))
* **deps:** bump github.com/coreos/go-oidc/v3 ([#6](https://github.com/zuohuadong/volt-gui/issues/6)) ([bee5bca](https://github.com/zuohuadong/volt-gui/commit/bee5bcad21ab40799d948732d8fdc37e971bb04d))
* **deps:** bump golang.org/x/mod from 0.36.0 to 0.37.0 ([e3987ff](https://github.com/zuohuadong/volt-gui/commit/e3987fffeb2b21cca0bfdebcf60add477896a4ba))
* **deps:** bump the actions group with 12 updates ([718b56f](https://github.com/zuohuadong/volt-gui/commit/718b56fa49956b1489321703647b5a1f50d25f15))
* **deps:** bump the go group in /desktop with 7 updates ([7f8d38b](https://github.com/zuohuadong/volt-gui/commit/7f8d38b7c90dd85e727508f1d812eb4368fc3d3e))
* **deps:** bump the go group with 5 updates ([fb20172](https://github.com/zuohuadong/volt-gui/commit/fb201725f5e00d160e6b389e31246d1e16a2541f))
* **deps:** bump the go group with 6 updates ([#8](https://github.com/zuohuadong/volt-gui/issues/8)) ([cb2fb9d](https://github.com/zuohuadong/volt-gui/commit/cb2fb9de9dd411e3ae18f279d245f43eaba24b42))
* **deps:** bump the npm group in /desktop/frontend with 3 updates ([#10](https://github.com/zuohuadong/volt-gui/issues/10)) ([7e44810](https://github.com/zuohuadong/volt-gui/commit/7e4481034d50eac47ee4519552f8f0da40fe02e0))
* record OIDC PR compare link ([9ce9b2a](https://github.com/zuohuadong/volt-gui/commit/9ce9b2a309b0111b3980465b0e5c6ac800b49b96))
* record PR2 PR3 merge verification ([2ccbf5a](https://github.com/zuohuadong/volt-gui/commit/2ccbf5a8bb6bf00693d7587cdf6543bd28bb471b))
* record PR4 PR5 merge and review findings fix ([2f8a03f](https://github.com/zuohuadong/volt-gui/commit/2f8a03f4d8a747596ceda7e32a05bc9f9c5c37fe))
* record reasonix sync push ([48bfb8c](https://github.com/zuohuadong/volt-gui/commit/48bfb8c91f8d9ebe3fc8f89f4ac49ee9bdd02a85))
* resubmit latest state ([76dcc9a](https://github.com/zuohuadong/volt-gui/commit/76dcc9aa0df7606f016e61b817162c3faeabbe4b))
* resubmit shared skills sync ([22987d5](https://github.com/zuohuadong/volt-gui/commit/22987d5bf5c88c49f25f7f8344f54a2d020ad20e))
* resubmit with github account ([4870d63](https://github.com/zuohuadong/volt-gui/commit/4870d635cf6ebec8197ac7047e6a139b8c43c66e))
* sync agent-team framework to latest deploy ([c983f4b](https://github.com/zuohuadong/volt-gui/commit/c983f4b1990db3dc02008054bcb68ae79d61430f))
* sync reasonix upstream ([7835a13](https://github.com/zuohuadong/volt-gui/commit/7835a13725db2c94d9196f42265f05e80085803e))
* update upstream sync marker ([2e53fac](https://github.com/zuohuadong/volt-gui/commit/2e53fac04efe41ebd7c817f5488ac3d4551782d8))

## Changelog

Desktop release notes are maintained by release-please.
