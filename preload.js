// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Methods to send requests to the main process ---
    checkRclone: () => ipcRenderer.invoke('check-rclone'),
    browseMountPoint: () => ipcRenderer.invoke('browse-mount-point'),
    loadProfiles: () => ipcRenderer.invoke('load-profiles'),
    saveProfiles: (profiles) => ipcRenderer.invoke('save-profiles', profiles),
    mount: (profile) => ipcRenderer.invoke('mount', profile),
    unmount: () => ipcRenderer.invoke('unmount'),
    listBuckets: (profile) => ipcRenderer.invoke('list-buckets', profile),

    // --- Methods to receive events from the main process ---
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', (_event, value) => callback(value)),
    onMountSuccessful: (callback) => ipcRenderer.on('mount-successful', () => callback()),
    onMountTerminated: (callback) => ipcRenderer.on('mount-terminated', () => callback())
});
