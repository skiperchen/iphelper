# CLAUDE.md

## 项目：IPHelper macOS 网络快速切换工具

### 技术约束
- 纯 Electron 应用，前端零依赖 (HTML/CSS/JS)
- 所有系统调用通过 Node.js child_process.execFile
- sudo 操作通过 osascript + administrator privileges
- 不能使用 npm 网络相关包 (只依赖 macOS 原生命令)

### 代码规范
- main.js 中通过 ipcMain.handle 注册所有 IPC 通道
- preload.js 通过 contextBridge 暴露安全 API
- 前端不能直接访问 Node.js API
- 配置文件读写使用 fs.promises
- 所有异步操作有 try/catch

### 测试要点
- 网卡解析逻辑 (networksetup 输出格式)
- IP/掩码格式校验正则
- JSON 配置文件读写与异常处理
- DHCP/静态切换逻辑

### Touch ID 指纹授权（无 Developer 证书方案）
- 用 **ad-hoc 签名**打包：electron-builder 默认会自动 ad-hoc 签名（无需 Developer ID）
- `osascript do shell script with administrator privileges` 在本机 GUI 上下文运行时会显示 Touch ID 弹窗
- 前提：macOS 系统设置 → 触控 ID 与密码 已开启并录入指纹
- 若仍只弹密码框，检查：
  1. 是否在「系统设置 → 隐私与安全性 → 辅助功能」授权了 osascript
  2. 是否从「访达」双击 app 启动（GUI 会话），而非命令行/SSH 启动（无 GUI 会话则无 Touch ID）
  3. app 是否被 Gatekeeper 拦截（首次需右键-打开，或 `xattr -dr com.apple.quarantine`）

### 已知修复记录
- **网关清空问题**：apply-config 时若配置 gateway 为空，会先 `getCurrentGateway()` 读取当前网关保留，防止 `networksetup -setmanual` 传空串清空网关
