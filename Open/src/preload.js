const { contextBridge, ipcRenderer } = require('electron');
let outCb = () => {}, fwCb = () => {};
ipcRenderer.on('tool-out', (_e, text) => outCb(text));
ipcRenderer.on('fw-progress', (_e, p) => fwCb(p));
contextBridge.exposeInMainWorld('native', {
  run: (tool, args = []) => ipcRenderer.invoke('tool', tool, args),
  onOutput: cb => { outCb = cb; },
  onFwProgress: cb => { fwCb = cb; },
  pickDir: () => ipcRenderer.invoke('pick-dir'),
  fwDownload: req => ipcRenderer.invoke('fw-download', req),
  fwCancel: () => ipcRenderer.invoke('fw-cancel'),
  crashCollect: udid => ipcRenderer.invoke('crash-collect', String(udid || '')),
  crashOpen: kind => ipcRenderer.invoke('crash-open', String(kind)),
  savePdf: (html, name) => ipcRenderer.invoke('save-pdf', String(html), String(name || '')),
  checkUpdates: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdate: cb => ipcRenderer.on('update', (_e, info) => cb(info)),
  muxDevices: () => ipcRenderer.invoke('mux-devices'),
  muxInfo: id => ipcRenderer.invoke('mux-info', Number(id)),
  toolsStatus: () => ipcRenderer.invoke('tools-status'),
  driverStatus: () => ipcRenderer.invoke('driver-status'),
  openStore: () => ipcRenderer.invoke('open-store'),
  platform: process.platform
});
