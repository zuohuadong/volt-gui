# Windows 干净环境测试

桌面端是 Electron GUI 程序，推荐使用 Windows Sandbox 做发布包验收，而不是 Windows Server 容器。Windows Sandbox 每次启动都是全新的临时 Windows 用户环境，关闭窗口后会销毁本次产生的 DSH 凭据、应用设置和缓存。

## 前置条件

- Windows 专业版、企业版或教育版
- 已启用“Windows 沙盒”功能
- BIOS/UEFI 已开启硬件虚拟化
- 已经生成 `dist` 下的安装器或便携 ZIP

## 启动

```powershell
pnpm run test:clean-windows
```

也可以指定产物：

```powershell
pnpm run test:clean-windows -- "D:\path\to\anyong-windows-x64-installer-0.31.37.exe"
```

脚本会自动挂载一个只读输入目录，在沙盒登录后启动安装器或解压并启动 `Anyong.exe`。测试时不会读取宿主机的 `DSH_HOME`、`XG_GOMODEL_API_KEY` 或其他用户环境变量。

## Key 验收点

1. 首次启动不应依赖宿主机已有的 DSH 凭据。
2. 若发布包包含 `bundled.env`，应用应将它写入官方 DSH credentials service。
3. 在“管理 > 设置与凭据”中只能看到配置状态，不应回显 Key 内容。
4. 关闭沙盒后重新启动新的沙盒，环境应再次恢复为空白。
