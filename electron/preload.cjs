const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApi', {
  getLibraries: () => ipcRenderer.invoke('get-libraries'),
  selectLibraryFolder: () => ipcRenderer.invoke('select-library-folder'),
  saveLibraries: (libsArray) => ipcRenderer.invoke('save-libraries', libsArray),
  scanAllLibraries: () => ipcRenderer.invoke('scan-all-libraries'),
  
  getContinueWatching: () => ipcRenderer.invoke('media:get-progress'),
  removeContinueWatching: (path) => ipcRenderer.invoke('store:remove-item', path),
  playMedia: (path) => ipcRenderer.invoke('media:play', path), 
  
  // New Player API
  saveProgress: (mediaPath, currentTime, duration, progressPercentage) => 
    ipcRenderer.invoke('player:save-progress', { mediaPath, currentTime, duration, progressPercentage }),
  
  onVlcClosed: (callback) => ipcRenderer.on('vlc-closed', callback) 
});