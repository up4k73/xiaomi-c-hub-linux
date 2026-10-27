"use strict";
const {app,BrowserWindow,ipcMain}=require("electron");
const fs=require("fs");
const path=require("path");
const {findSpeaker,UsbTransport}=require("./usb-transport.cjs");
const {SpeakerControl}=require("./control.cjs");
const protocol=require("./protocol.cjs");
const {RendererBridge}=require("./renderer-bridge.cjs");
const {ensureRenderer,validRenderer,SOURCE}=require("./vendor-bootstrap.cjs");
const demo=process.env.XIAOMI_CONTROL_DEMO==="1";
if (demo) app.disableHardwareAcceleration();
let transport=null, client=null, window=null, quitting=false, bridge=null, connecting=null;
let sharedSimulation=null;

function simulatedTransport() {
  const fields={48:[1],49:[7],50:[0],52:[0],64:[0],65:[0],113:[50],116:[8],119:[37],120:[37],121:[1],
    128:[1],129:[14],131:[1],132:[4],133:[2,1,1,1],134:[0],135:[1],140:Array(10).fill(6),142:[1],143:[0]};
  return { async close(){}, async exchange(report) {
    const request=protocol.decode(report);
    if (request.command===0x70) {
      const values=Object.entries(fields).flatMap(([key,value])=>[Number(key),value.length,...value]);
      return protocol.outputReport(protocol.frame(0x70,3,values));
    }
    fields[request.command]=request.command===0x85?[0,1,2,3].map(i=>i===request.payload[0]?2:1):Array.from(request.payload);
    return protocol.outputReport(protocol.frame(request.command,2,Array.from(request.payload)));
  }};
}
async function disconnect() {
  const current=transport, pending=client?.queue; transport=null;client=null;bridge=null;
  await pending;
  if(current) await current.close();
}
function readableError(error) {
  const text=String(error.message||error);
  if(text.includes("No Xiaomi")) return "Speaker not found. Connect it by USB, then select Refresh.";
  if(text.includes("LIBUSB_ERROR_ACCESS")) return "USB access denied. Select Enable USB access to authorize this speaker.";
  if(text.includes("readback")) return "The speaker did not confirm the setting. Select Refresh to read its current state.";
  if(text.includes("Connection stopped")) return "Connection stopped after an error. Select Refresh.";
  return text;
}
async function refresh() {
  await disconnect();
  if(demo) transport=sharedSimulation||(sharedSimulation=simulatedTransport());
  else {
    const identity=findSpeaker(undefined,{path:process.env.XIAOMI_USB_PATH,serial:process.env.XIAOMI_USB_SERIAL});
    const modulePath=process.env.XIAOMI_USB_MODULE || "usb";
    transport=new UsbTransport(require(modulePath),identity);
  }
  client=new SpeakerControl(transport,{onBeforeChange(before,change){
    const directory=path.join(app.getPath("userData"),"backups");fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,require("crypto").randomUUID()+"-"+change.setting+".json"),JSON.stringify({time:new Date().toISOString(),before,change},null,2)+"\n",{flag:"wx",mode:0o600});
  }});
  const state=await client.readState();
  bridge=new RendererBridge(client,state);
  return state;
}
function status(text){window?.webContents.send("linux-status",text,demo);}
async function connectOfficial(force=false){
  if(connecting)return connecting;
  connecting=(async()=>{
    try{
      if(force||!bridge)await refresh();
      window?.webContents.send("update-connect","connect","B03",0xd007);
      status("Connected. Refresh reads the current settings from the speaker.");
    }catch(error){
      await disconnect().catch(()=>{});
      window?.webContents.send("update-connect","disconnect","B03",0xd007);
      status(readableError(error));
    }
  })();
  try{await connecting;}finally{connecting=null;}
}
ipcMain.on("getDevices",(_event,options)=>connectOfficial(Boolean(options?.refresh)));
ipcMain.on("sendReport",async(event,payload)=>{
  try{
    if(!bridge)throw new Error("Speaker disconnected. Select Refresh.");
    event.returnValue=await bridge.report(payload);
    if(payload.outData[5]===2)status("Setting confirmed by the speaker.");
  }catch(error){
    event.returnValue=[];
    status(readableError(error));
    window?.webContents.send("update-connect","disconnect","B03",0xd007);
  }
});
for(const name of ["hid-getFeatureReport","sendUpgradeReport"]){ipcMain.on(name,event=>{event.returnValue=[];status("This operation is not supported by the Linux adapter.");});}
ipcMain.handle("system:get-system",()=>"linux");
ipcMain.handle("system:get-local",()=>"en-US");
ipcMain.on("getPlatform",event=>{event.returnValue="linux";});
ipcMain.on("window-is-maximized",event=>{event.returnValue=window?.isMaximized()||false;});
ipcMain.on("window-min",()=>window?.minimize());
ipcMain.on("window-close",()=>window?.close());
ipcMain.on("window-maximize",()=>{if(window?.isMaximized())window.unmaximize();else window?.maximize();window?.webContents.send("window-maximized",window.isMaximized());});
ipcMain.on("send-recover",()=>status("Firmware recovery is not supported by the Linux adapter."));
ipcMain.handle("linux:install-usb-access",async()=>{
  const directory=fs.mkdtempSync(path.join(app.getPath("temp"),"xiaomi-usb-access-"));
  const helper=path.join(directory,"install.sh");
  try{
    fs.copyFileSync(path.join(__dirname,"../packaging/install-usb-access.sh"),helper);
    fs.chmodSync(helper,0o500);
    await new Promise((resolve,reject)=>require("child_process").execFile("pkexec",
      ["/bin/sh",helper],{timeout:120000},
      error=>error?reject(new Error("USB permission setup was cancelled or failed")):resolve()));
    await connectOfficial(true);
    return true;
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

async function prepareInterface() {
  const override=process.env.XIAOMI_VENDOR_RENDERER;
  if(override){
    if(!path.isAbsolute(override)||!fs.existsSync(override))throw new Error("Configured renderer is missing");
    return {renderer:override};
  }
  const imported=path.join(__dirname,"../vendor/out/renderer/index.html");
  if(fs.existsSync(imported))return {renderer:imported};
  const cached=path.join(app.getPath("userData"),"vendor",SOURCE.version);
  if(await validRenderer(cached))return {renderer:path.join(cached,"out/renderer/index.html")};
  const setup=new BrowserWindow({width:510,height:300,resizable:false,maximizable:false,
    title:"Xiaomi C-HUB for Linux",backgroundColor:"#14181e",autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,"setup-preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  setup.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  setup.webContents.on("will-navigate",event=>event.preventDefault());
  const controller=new AbortController();
  setup.once("closed",()=>controller.abort());
  await setup.loadFile(path.join(__dirname,"setup.html"));
  while(!setup.isDestroyed()){
    try{
      const renderer=await ensureRenderer(app.getPath("userData"),data=>{
        if(!setup.isDestroyed())setup.webContents.send("setup-progress",data);
      },controller.signal);
      return {renderer,setup};
    }catch(error){
      if(setup.isDestroyed())throw error;
      console.error("Interface setup failed:",error.code||error.message);
      if(demo&&process.env.XIAOMI_DEMO_CHECK){app.exit(2);throw error;}
      setup.webContents.send("setup-progress",{error:true});
      await new Promise((resolve,reject)=>{
        const retry=event=>{if(event.sender===setup.webContents){cleanup();resolve();}};
        const closed=()=>{cleanup();reject(new Error("Setup closed"));};
        const cleanup=()=>{ipcMain.removeListener("setup-retry",retry);setup.removeListener("closed",closed);};
        ipcMain.on("setup-retry",retry);setup.once("closed",closed);
      });
    }
  }
  throw new Error("Setup closed");
}
// Observe cached kernel identity only; this sends no USB/HID requests.
setInterval(()=>{
  if(demo||!transport?.identity)return;
  const identity=transport.identity;
  try{
    const address=Number(fs.readFileSync(path.join("/sys/bus/usb/devices",identity.path,"devnum"),"utf8"));
    if(address===identity.address)return;
  }catch{}
  transport.identity=null;
  window?.webContents.send("update-connect","disconnect","B03",0xd007);
  status("Speaker disconnected. Reconnect it, then select Refresh.");
  Promise.resolve(client?.queue).then(()=>disconnect()).catch(()=>{});
},2000).unref();
if(!demo && !app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async()=>{
  const {renderer,setup}=await prepareInterface();
  window=new BrowserWindow({width:1180,height:850,minWidth:950,minHeight:700,show:false,frame:false,
    backgroundColor:"#1a1a1a",title:"Xiaomi C-HUB",autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,"official-preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  window.webContents.on("will-navigate",event=>event.preventDefault());
  window.webContents.session.webRequest.onBeforeRequest({urls:["http://*/*","https://*/*"]},(_details,callback)=>callback({cancel:true}));
  window.loadFile(renderer);
  window.once("ready-to-show",()=>{window.show();if(setup&&!setup.isDestroyed())setup.destroy();});
  app.on("second-instance",()=>{if(window){window.show();window.focus();}});
  if(demo && process.env.XIAOMI_DEMO_CHECK) {
    require("../test/gui-smoke.cjs")({app,window,getClient:()=>client,getBridge:()=>bridge});
  }
}).catch(()=>app.quit());
app.on("window-all-closed",()=>app.quit());
app.on("before-quit",event=>{
  if(transport && !quitting){event.preventDefault();quitting=true;Promise.resolve(client?.queue).then(()=>disconnect()).finally(()=>app.exit(0));}
});
process.on("SIGTERM",()=>app.quit());
