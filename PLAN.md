# IPHelper - macOS 网络快速切换工具

## 项目目标
macOS 原生桌面应用，实现多套网络配置存档、一键切换静态IP/DHCP。
底层通过 `networksetup` / `ifconfig` / `netstat` 系统命令实现。

## 技术栈
- **框架**: Electron 22+ (native macOS .app)
- **前端**: 纯 HTML5 + CSS3 + Vanilla JavaScript
- **系统调用**: Node.js child_process.execFile
- **权限**: osascript with administrator privileges
- **存储**: 本地 JSON 文件 (configs/ 目录)
- **打包**: electron-builder --mac

## 架构 (三层)

### 1. 系统命令层 (system-commands.js)
封装所有 macOS 原生命令：

| 功能 | 命令 |
|------|------|
| 获取网卡列表 | `networksetup -listallhardwareports` |
| 读当前IP/掩码 | `ifconfig <iface>` |
| 读默认网关 | `netstat -rn -f inet` |
| 读DNS | `networksetup -getdnsservers <iface>` |
| 设静态IP | `networksetup -setmanual <iface> <ip> <mask> <gw>` |
| 设DHCP | `networksetup -setdhcp <iface>` |
| 设DNS | `networksetup -setdnsservers <iface> <dns1> <dns2>` |
| 清空DNS | `networksetup -setdnsservers <iface> Empty` |

所有写入命令通过 `osascript -e 'do shell script "..." with administrator privileges'` 提升权限。

### 2. 业务逻辑层 (ipc-handlers.js)
- 配置 CRUD (读/写/删 configs/*.json)
- 实时抓取当前网络参数
- 应用配置（先设IP → 再设DNS → 记录日志）
- 异常捕获、输入校验（IP格式、掩码格式、接口存在性）

### 3. UI 层 (index.html)
固定布局，4个区域：
- **顶部**: 网卡下拉框 + [抓取当前] [保存配置]
- **中部**: 配置列表 (可点击选中)
- **底部**: [应用配置] [恢复DHCP] [刷新] [删除]
- **日志区**: 操作记录

## 数据结构
```json
{
  "name": "办公静态网络",
  "interface": "en0",
  "mode": "static",
  "ip": "192.168.1.100",
  "netmask": "255.255.255.0",
  "gateway": "192.168.1.1",
  "dns": ["223.5.5.5", "114.114.114.114"]
}
```

## 文件结构
```
iphelper/
├── index.html           # 主界面
├── main.js              # Electron 主进程 + IPC handlers
├── preload.js           # contextBridge API
├── package.json         # Electron 配置
├── renderer.js          # 前端逻辑 (可选，或内联到 index.html)
├── configs/             # 用户配置存档 (运行时生成)
└── log.txt              # 操作日志 (运行时生成)
```

## 关键实现细节
1. **sudo**: 写操作通过 AppleScript 弹系统授权框
2. **网卡过滤**: 仅显示物理网卡 (en0, en1...)，排除 lo0, bridge, vmnet
3. **配置去重**: 同名文件拒绝覆盖
4. **输入校验**: IP/掩码格式校验 + 网卡存在性检查
5. **深色模式**: CSS media query 适配系统主题
6. **应用配置顺序**: 先设IP/掩码/网关 → 再设DNS (分开调用，便于错误定位)

## 构建
```bash
cd electron/
npm install
npx electron-builder --mac --arm64 --x64
# 输出: output/iphelper-*.zip 和 .dmg
```
