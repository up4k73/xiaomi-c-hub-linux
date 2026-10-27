"use strict";
const {contextBridge,ipcRenderer}=require("electron");
const allowedOn=new Set(["window-maximized","update-connect","upgrade-event","update-devices","update-log"]);
const allowedSend=new Set(["getDevices","window-min","window-close","window-maximize","send-recover"]);
const allowedSync=new Set(["sendReport","hid-getFeatureReport","getPlatform","window-is-maximized","sendUpgradeReport"]);
let message="",preview=false;
function updateBanner(){
  const node=document.querySelector("#xiaomi-linux-status-text");
  if(node)node.textContent=(preview?"Preview — no hardware connected · ":"")+message;
  const access=document.querySelector("#xiaomi-linux-usb-access");
  if(access)access.hidden=!message.includes("USB access denied");
}
ipcRenderer.on("linux-status",(_event,text,isPreview)=>{message=text;preview=Boolean(isPreview);updateBanner();});
document.addEventListener("DOMContentLoaded",()=>{
  const bar=document.createElement("div");bar.id="xiaomi-linux-status";
  bar.style.cssText="position:fixed;bottom:10px;left:14px;right:14px;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 14px;background:#23292eeF;border:1px solid #48535a;border-radius:8px;color:#dbe4e8;font:12px sans-serif;line-height:1.4;";
  const text=document.createElement("span");text.id="xiaomi-linux-status-text";
  const button=document.createElement("button");button.textContent="Refresh";
  button.style.cssText="padding:6px 12px;background:#3e4c54;border:0;border-radius:5px;color:white;cursor:pointer;";
  button.addEventListener("click",()=>ipcRenderer.send("getDevices",{refresh:true}));
  const access=document.createElement("button");access.id="xiaomi-linux-usb-access";access.textContent="Enable USB access";access.hidden=true;
  access.style.cssText=button.style.cssText;
  access.addEventListener("click",async()=>{access.disabled=true;try{await ipcRenderer.invoke("linux:install-usb-access");}catch{message="USB permission setup was cancelled or failed.";updateBanner();}finally{access.disabled=false;}});
  bar.append(text,access,button);document.body.append(bar);updateBanner();
});
contextBridge.exposeInMainWorld("electron",{ipcRenderer:{
  send:(name,...args)=>{if(allowedSend.has(name))ipcRenderer.send(name,...args);},
  sendSync:(name,...args)=>allowedSync.has(name)?ipcRenderer.sendSync(name,...args):[],
  invoke:(name,...args)=>["system:get-system","system:get-local"].includes(name)?ipcRenderer.invoke(name,...args):Promise.reject(new Error("Unsupported operation")),
  on:(name,callback)=>{if(allowedOn.has(name))ipcRenderer.on(name,(_event,...args)=>callback({},...args));},
  removeAllListeners:name=>{if(allowedOn.has(name))ipcRenderer.removeAllListeners(name);}
}});
contextBridge.exposeInMainWorld("deviceApi",{
  onUpdateConnect:callback=>{ipcRenderer.on("update-connect",(_event,...args)=>callback(...args));ipcRenderer.send("getDevices");},
  onUpgradeEvent:callback=>ipcRenderer.on("upgrade-event",(_event,...args)=>callback(...args)),
  updateDevices:callback=>ipcRenderer.on("update-devices",(_event,...args)=>callback(...args)),
  onUpdateLog:callback=>ipcRenderer.on("update-log",(_event,...args)=>callback(...args)),
  sendRecover:()=>ipcRenderer.send("send-recover")
});
contextBridge.exposeInMainWorld("systemApi",{
  getSystem:()=>ipcRenderer.invoke("system:get-system"),
  getLocal:()=>ipcRenderer.invoke("system:get-local")
});
