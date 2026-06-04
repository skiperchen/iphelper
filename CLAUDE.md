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
