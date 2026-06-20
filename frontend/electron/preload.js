const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  processTranscript: (llmConfig, prompt) => ipcRenderer.invoke('llm:process', { llmConfig, prompt }),
  transcribePCM: (pcmArray, sourceLang, targetLang) => ipcRenderer.invoke('asr:transcribe', { pcmArray, sourceLang, targetLang }),
  generatePrompt: (llmConfig, courseName) => ipcRenderer.invoke('llm:generatePrompt', { llmConfig, courseName })
});
