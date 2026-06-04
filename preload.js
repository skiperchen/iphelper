"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("iphelper", {
  /** 获取物理网卡列表 */
  getInterfaces: () => ipcRenderer.invoke("get-interfaces"),

  /** 抓取指定网卡的当前配置 */
  getCurrentConfig: (iface) => ipcRenderer.invoke("get-current-config", iface),

  /** 保存配置 */
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),

  /** 列出所有已保存配置 */
  listConfigs: () => ipcRenderer.invoke("list-configs"),

  /** 删除配置 */
  deleteConfig: (name) => ipcRenderer.invoke("delete-config", name),

  /** 应用静态配置 */
  applyConfig: (name) => ipcRenderer.invoke("apply-config", name),

  /** 恢复 DHCP */
  applyDHCP: (iface) => ipcRenderer.invoke("apply-dhcp", iface),

  /** 读取操作日志 */
  getLog: () => ipcRenderer.invoke("get-log"),
});
