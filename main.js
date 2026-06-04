"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { existsSync, mkdirSync, readFileSync } = require("fs");
const { execFile } = require("child_process");

// ──────────────────────────────────────────────
// 路径常量
// ──────────────────────────────────────────────
const APP_DIR = path.join(__dirname);
const CONFIGS_DIR = path.join(APP_DIR, "configs");
const LOG_FILE = path.join(APP_DIR, "log.txt");

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 用 execFile 执行命令，返回 stdout */
function execPromise(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/** 通过 osascript + administrator privileges 执行写入命令 */
async function sudoExec(command) {
  const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `do shell script "${escaped}" with administrator privileges`;
  return execPromise("osascript", ["-e", script]);
}

/** 追加日志 */
async function appendLog(entry) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${entry}\n`;
  try {
    await fs.appendFile(LOG_FILE, line, "utf-8");
  } catch (_) {
    // 日志写入失败不阻塞主流程
  }
}

/** 确保 configs 目录存在 */
async function ensureConfigsDir() {
  try {
    await fs.mkdir(CONFIGS_DIR, { recursive: true });
  } catch (_) {
    // 已存在则忽略
  }
}

/** IP 格式校验 */
function isValidIP(ip) {
  return /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);
}

/** 安全化配置文件名 */
function safeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "unnamed";
}

// ──────────────────────────────────────────────
// 系统命令层 ─ 获取网络信息
// ──────────────────────────────────────────────

/** 解析 networksetup -listallhardwareports 输出 */
function parseHardwarePorts(raw) {
  const interfaces = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    const portMatch = block.match(/^Hardware Port:\s*(.+)$/m);
    const devMatch = block.match(/^Device:\s*(.+)$/m);
    if (portMatch && devMatch) {
      interfaces.push({
        name: devMatch[1],           // en0, en1 ...
        displayName: portMatch[1],   // Wi-Fi, Ethernet ...
      });
    }
  }
  return interfaces;
}

/** 按规则过滤：优先物理网卡（en* 开头），排除 lo0/bridge/vmnet/utun/llw/anpi/ap/awdl */
function filterPhysical(ifaces) {
  return ifaces.filter((iface) => {
    const n = iface.name;
    // 允许 en* 开头的物理网卡，同时排除已知虚拟接口
    return (
      /^en\d+$/.test(n) &&
      !/^(lo\d*|bridge\d*|gif\d*|stf\d*|vmnet\d*|utun\d*|llw\d*|anpi\d*|ap\d*|awdl\d*|pdp_ip\d*)$/.test(n)
    );
  });
}

// ──────────────────────────────────────────────
// IPC 通道注册
// ──────────────────────────────────────────────

/** get-interfaces: 获取物理网卡列表 */
ipcMain.handle("get-interfaces", async () => {
  try {
    const raw = await execPromise("networksetup", ["-listallhardwareports"]);
    const all = parseHardwarePorts(raw);
    const physical = filterPhysical(all);
    if (physical.length === 0 && all.length > 0) {
      // 没有 en* 网卡时回退到全部（用户可能在虚拟机等环境）
      return { success: true, data: all };
    }
    return { success: true, data: physical };
  } catch (e) {
    return { success: false, error: `获取网卡列表失败: ${e.message}` };
  }
});

/** get-current-config: 抓取指定网卡的当前 IP/掩码/网关/DNS */
ipcMain.handle("get-current-config", async (_event, iface) => {
  try {
    if (!iface || typeof iface !== "string") {
      return { success: false, error: "请指定网卡名称" };
    }

    // 并行获取四类信息
    const [ifconfigRaw, netstatRaw, dnsRaw] = await Promise.all([
      execPromise("ifconfig", [iface]).catch(() => ""),
      execPromise("netstat", ["-rn", "-f", "inet"]).catch(() => ""),
      execPromise("networksetup", ["-getdnsservers", iface]).catch(() => ""),
    ]);

    // 解析 IP 和掩码
    const inetMatch = ifconfigRaw.match(/inet\s+(\d+\.\d+\.\d+\.\d+)\s+netmask\s+(0x[0-9a-fA-F]+)/);
    const ip = inetMatch ? inetMatch[1] : null;
    const netmask = inetMatch ? hexToNetmask(inetMatch[2]) : null;

    // 解析默认网关
    const gwMatch = netstatRaw.match(/^default\s+(\d+\.\d+\.\d+\.\d+)/m);
    const gateway = gwMatch ? gwMatch[1] : null;

    // 解析 DNS
    let dns = [];
    if (dnsRaw && !dnsRaw.includes("There aren't any DNS Servers")) {
      dns = dnsRaw
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => isValidIP(s));
    }

    return {
      success: true,
      data: { interface: iface, ip, netmask, gateway, dns, mode: ip ? "static" : "dhcp" },
    };
  } catch (e) {
    return { success: false, error: `抓取当前配置失败: ${e.message}` };
  }
});

/** save-config: 保存配置到 configs/xxx.json（拒绝覆盖） */
ipcMain.handle("save-config", async (_event, config) => {
  try {
    await ensureConfigsDir();

    if (!config || !config.name) {
      return { success: false, error: "配置名称不能为空" };
    }
    if (!config.interface) {
      return { success: false, error: "请选择网卡" };
    }

    const fname = safeName(config.name);
    const filePath = path.join(CONFIGS_DIR, `${fname}.json`);

    // 检查是否已存在
    try {
      await fs.access(filePath);
      return { success: false, error: `配置 "${fname}" 已存在，请使用其他名称` };
    } catch (_) {
      // 不存在，可以继续
    }

    // 校验 IP 格式
    if (config.ip && !isValidIP(config.ip)) {
      return { success: false, error: `IP 地址格式无效: ${config.ip}` };
    }
    if (config.netmask && !isValidIP(config.netmask)) {
      return { success: false, error: `子网掩码格式无效: ${config.netmask}` };
    }
    if (config.gateway && !isValidIP(config.gateway)) {
      return { success: false, error: `网关地址格式无效: ${config.gateway}` };
    }

    // 校验 DNS
    if (config.dns && Array.isArray(config.dns)) {
      for (const d of config.dns) {
        if (!isValidIP(d)) {
          return { success: false, error: `DNS 地址格式无效: ${d}` };
        }
      }
    }

    const record = {
      name: config.name,
      interface: config.interface,
      mode: config.mode || "static",
      ip: config.ip || "",
      netmask: config.netmask || "",
      gateway: config.gateway || "",
      dns: config.dns || [],
    };

    await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
    await appendLog(`保存配置: ${fname}`);
    return { success: true, data: record };
  } catch (e) {
    return { success: false, error: `保存配置失败: ${e.message}` };
  }
});

/** list-configs: 列出所有已保存的配置 */
ipcMain.handle("list-configs", async () => {
  try {
    await ensureConfigsDir();
    const files = await fs.readdir(CONFIGS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const configs = [];
    for (const f of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(CONFIGS_DIR, f), "utf-8");
        const cfg = JSON.parse(raw);
        configs.push({ ...cfg, _file: f });
      } catch (_) {
        // 跳过损坏的配置文件
      }
    }
    return { success: true, data: configs };
  } catch (e) {
    return { success: false, error: `列出配置失败: ${e.message}` };
  }
});

/** delete-config: 删除指定配置 */
ipcMain.handle("delete-config", async (_event, name) => {
  try {
    if (!name) return { success: false, error: "请指定要删除的配置名称" };
    const fname = safeName(name);
    const filePath = path.join(CONFIGS_DIR, `${fname}.json`);
    await fs.unlink(filePath);
    await appendLog(`删除配置: ${fname}`);
    return { success: true };
  } catch (e) {
    if (e.code === "ENOENT") {
      return { success: false, error: `配置 "${name}" 不存在` };
    }
    return { success: false, error: `删除配置失败: ${e.message}` };
  }
});

/** apply-config: 应用静态 IP + DNS 配置 */
ipcMain.handle("apply-config", async (_event, name) => {
  try {
    if (!name) return { success: false, error: "请指定要应用的配置名称" };

    const fname = safeName(name);
    const filePath = path.join(CONFIGS_DIR, `${fname}.json`);
    let config;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      config = JSON.parse(raw);
    } catch (_) {
      return { success: false, error: `配置 "${name}" 不存在或已损坏` };
    }

    const iface = config.interface;
    const netName = iface; // networksetup 使用 BSD 设备名

    // 步骤1: 设置静态 IP/掩码/网关
    const ipCommand = `networksetup -setmanual "${netName}" "${config.ip}" "${config.netmask}" "${config.gateway}"`;
    await sudoExec(ipCommand);
    await appendLog(`设置静态IP: ${netName} → ${config.ip}/${config.netmask} gw=${config.gateway}`);

    // 步骤2: 设置 DNS
    if (config.dns && config.dns.length > 0) {
      const dnsArgs = config.dns.map((d) => `"${d}"`).join(" ");
      const dnsCommand = `networksetup -setdnsservers "${netName}" ${dnsArgs}`;
      await sudoExec(dnsCommand);
      await appendLog(`设置DNS: ${netName} → ${config.dns.join(", ")}`);
    } else {
      const dnsCommand = `networksetup -setdnsservers "${netName}" Empty`;
      await sudoExec(dnsCommand);
      await appendLog(`清空DNS: ${netName}`);
    }

    return { success: true, data: { interface: iface, message: "配置已应用" } };
  } catch (e) {
    await appendLog(`应用配置失败: ${e.message}`);
    return { success: false, error: `应用配置失败: ${e.message}` };
  }
});

/** apply-dhcp: 恢复 DHCP */
ipcMain.handle("apply-dhcp", async (_event, iface) => {
  try {
    if (!iface) return { success: false, error: "请指定网卡名称" };

    // 步骤1: 切换为 DHCP
    const dhcpCommand = `networksetup -setdhcp "${iface}"`;
    await sudoExec(dhcpCommand);
    await appendLog(`切换DHCP: ${iface}`);

    // 步骤2: 清空 DNS（让 DHCP 自动分配）
    const dnsCommand = `networksetup -setdnsservers "${iface}" Empty`;
    await sudoExec(dnsCommand);

    return { success: true, data: { interface: iface, message: "已切换为 DHCP" } };
  } catch (e) {
    await appendLog(`切换DHCP失败: ${e.message}`);
    return { success: false, error: `切换 DHCP 失败: ${e.message}` };
  }
});

/** get-log: 读取操作日志（最近 500 行） */
ipcMain.handle("get-log", async () => {
  try {
    let raw = "";
    try {
      raw = await fs.readFile(LOG_FILE, "utf-8");
    } catch (_) {
      return { success: true, data: "" };
    }
    const lines = raw.trim().split("\n");
    const recent = lines.slice(-500).join("\n");
    return { success: true, data: recent };
  } catch (e) {
    return { success: false, error: `读取日志失败: ${e.message}` };
  }
});

// ──────────────────────────────────────────────
// 辅助函数
// ──────────────────────────────────────────────

/** 十六进制掩码转点分十进制 */
function hexToNetmask(hex) {
  const n = parseInt(hex, 16);
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join(".");
}

// ──────────────────────────────────────────────
// Electron 窗口创建
// ──────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: "IPHelper - 网络切换工具",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // macOS 风格
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
  });

  win.loadFile("index.html");

  // 开发时自动打开 DevTools
  if (process.argv.includes("--dev")) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  await ensureConfigsDir();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
