import { contextBridge, ipcRenderer, webFrame } from 'electron';
const applyInitialZoom = async () => {
    try {
        const savedZoom = await ipcRenderer.invoke('zoom:get');
        if (typeof savedZoom === 'number') {
            webFrame.setZoomLevel(savedZoom);
        }
    }
    catch {
        // Ignore zoom initialization errors
    }
};
// Run at document-start to avoid zoom flicker on refresh
void applyInitialZoom();
// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
    invoke: (channel, ...args) => {
        return ipcRenderer.invoke(channel, ...args);
    },
    // Stream support
    on: (channel, callback) => {
        const subscription = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    removeListener: (channel, callback) => {
        ipcRenderer.removeListener(channel, callback);
    },
    // Platform info - use process.platform which is available in preload
    platform: process.platform,
});
