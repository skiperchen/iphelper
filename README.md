# IPHelper - macOS 网络快速切换工具

一键切换网络配置的 macOS 原生桌面应用。支持多套静态 IP/DNS/网关配置存档，一键切换静态 IP 或 DHCP。

## 功能

- 🔌 **自动扫描网卡** — 识别所有物理网卡（Wi‑Fi / 以太网）
- 📥 **抓取当前配置** — 实时读取 IP、子网掩码、网关、DNS
- 💾 **多套配置存档** — JSON 文件本地保存，支持自定义命名
- ✅ **一键应用** — 选中配置即可切换静态网络
- 🔄 **一键 DHCP** — 快速恢复为自动获取模式
- 📜 **操作日志** — 所有操作记录，便于追溯
- 🌙 **深色模式** — 自动适配系统主题

## 技术栈

- **框架**: Electron 28
- **前端**: 纯 HTML/CSS/JS（零依赖）
- **系统调用**: `networksetup` / `ifconfig` / `netstat`
- **提权**: AppleScript `do shell script with administrator privileges`
- **存储**: 本地 JSON 文件（`configs/` 目录）

## 下载

前往 [Releases](https://github.com/skiperchen/iphelper/releases) 下载最新版本。

> ⚠️ 首次打开提示「无法验证开发者」→ 系统设置 → 隐私与安全性 → 仍要打开

## 构建（必须在 macOS 上）

```bash
git clone https://github.com/skiperchen/iphelper.git
cd iphelper
npm install

# 构建双架构
npm run build

# 或单独构建
npm run build:arm64   # Apple Silicon
npm run build:x64     # Intel Mac
```

构建产物在 `output/` 目录。

## 使用说明

1. **选择网卡** — 下拉框选择 Wi‑Fi 或以太网
2. **抓取当前** — 读取当前网络参数
3. **命名并保存** — 输入配置名称后保存
4. **应用配置** — 点击列表中的配置，再点「应用配置」
5. **恢复 DHCP** — 一键切回自动获取

## 目录结构

```
iphelper/
├── main.js          # Electron 主进程 + IPC 处理
├── preload.js       # 安全 API 桥接
├── index.html       # 前端界面
├── package.json     # 构建配置
├── configs/         # 用户配置存档（自动生成）
└── log.txt          # 操作日志（自动生成）
```

## 安全说明

- 无网络连接、无数据上传
- 所有配置文件仅存储在本地 `configs/` 目录
- 修改网络配置需要系统管理员密码（macOS 原生授权弹窗）

## 许可证

MIT License
