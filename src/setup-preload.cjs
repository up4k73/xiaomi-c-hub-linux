"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("setup",{
  onProgress:callback=>ipcRenderer.on("setup-progress",(_event,data)=>callback(data)),
  retry:()=>ipcRenderer.send("setup-retry")
});
