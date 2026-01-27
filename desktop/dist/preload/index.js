"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const applyInitialZoom = async () => {
    try {
        const savedZoom = await electron_1.ipcRenderer.invoke('zoom:get');
        if (typeof savedZoom === 'number') {
            electron_1.webFrame.setZoomLevel(savedZoom);
        }
    }
    catch {
        // Ignore zoom initialization errors
    }
};
// Run at document-start to avoid zoom flicker on refresh
void applyInitialZoom();
// 暴露安全的 API 给渲染进程
electron_1.contextBridge.exposeInMainWorld('electron', {
    invoke: (channel, ...args) => {
        return electron_1.ipcRenderer.invoke(channel, ...args);
    },
    // Stream support
    on: (channel, callback) => {
        const subscription = (_event, ...args) => callback(...args);
        electron_1.ipcRenderer.on(channel, subscription);
        return () => electron_1.ipcRenderer.removeListener(channel, subscription);
    },
    removeListener: (channel, callback) => {
        electron_1.ipcRenderer.removeListener(channel, callback);
    },
    // Platform info - use process.platform which is available in preload
    platform: process.platform,
});
