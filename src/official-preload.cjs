"use strict";
const {contextBridge,ipcRenderer}=require("electron");
const allowedOn=new Set(["window-maximized","update-connect","upgrade-event","update-devices","update-log"]);
const allowedSend=new Set(["getDevices","window-min","window-close","window-maximize","send-recover"]);
const allowedSync=new Set(["sendReport","hid-getFeatureReport","getPlatform","window-is-maximized","sendUpgradeReport"]);
// Scope ID of SpeakerStatus in the pinned C-HUB 2.4.3 renderer.
const channelPageSelector = ".right-wrapper[data-v-92dea1e1]";
let refreshMicrophone = null;
let message="",preview=false;
function updateBanner(){
  const node=document.querySelector("#xiaomi-linux-status-text");
  if(node)node.textContent=(preview?"Preview — no hardware connected · ":"")+message;
  const access=document.querySelector("#xiaomi-linux-usb-access");
  if(access)access.hidden=!message.includes("USB access denied");
}
ipcRenderer.on("linux-status",(_event,text,isPreview)=>{message=text;preview=Boolean(isPreview);updateBanner();});
function mountMicrophone(playback) {
  if (preview) return;
  const panel = document.createElement("section");
  panel.id = "xiaomi-microphone";
  panel.className = "row-wrap";
  panel.setAttribute("aria-labelledby", "xiaomi-mic-title");
  const styles = document.createElement("style");
  styles.textContent = `
    .main-wrapper .right-wrapper #xiaomi-microphone {
      padding: 14px 22px 16px; font-size: 14px; line-height: 1.4; color: #fff;
    }
    #xiaomi-microphone header, #xiaomi-microphone .mic-level {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    #xiaomi-microphone h2 { font-size: 16px; font-weight: 500; margin: 0; }
    #xiaomi-microphone .mic-level { margin-top: 12px; }
    #xiaomi-microphone input { accent-color: var(--el-color-primary, #087ee7); }
    #xiaomi-microphone input[type=range] { display: block; width: 100%; height: 18px; margin: 6px 0 0; }
    #xiaomi-microphone output { font-variant-numeric: tabular-nums; color: #b5b5b5; }
    #xiaomi-microphone [role=status] { font-size: 12px; color: #b5b5b5; margin: 6px 0 0; }
    #xiaomi-microphone [role=status]:empty { display: none; }
    #xiaomi-microphone .mic-switch { position: relative; display: flex; align-items: center; cursor: pointer; }
    #xiaomi-microphone .mic-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: inherit; }
    #xiaomi-microphone .mic-track { display: block; width: 38px; height: 20px; border-radius: 10px; background: #565656; }
    #xiaomi-microphone .mic-track::after { content: ''; display: block; width: 16px; height: 16px;
      margin: 2px; border-radius: 50%; background: #fff; }
    #xiaomi-microphone input:checked + .mic-track { background: var(--el-color-primary, #087ee7); }
    #xiaomi-microphone input:checked + .mic-track::after { transform: translateX(18px); }
    #xiaomi-microphone input:focus-visible + .mic-track { outline: 2px solid #88bcff; outline-offset: 3px; }
    #xiaomi-microphone input:disabled + .mic-track { opacity: .45; }
    ${channelPageSelector} { overflow-y: auto; min-height: 0; box-sizing: border-box; padding-bottom: 64px; }
    ${channelPageSelector} > .row-wrap { flex-shrink: 0; }`;
  panel.innerHTML = `
    <header>
      <h2 id="xiaomi-mic-title">Микрофон</h2>
      <label class="mic-switch">
        <input type="checkbox" role="switch" aria-label="Микрофон" id="xiaomi-mic-enabled" disabled>
        <span class="mic-track" aria-hidden="true"></span>
      </label>
    </header>
    <div class="mic-level">
      <label for="xiaomi-mic-gain">Уровень записи</label>
      <output for="xiaomi-mic-gain" id="xiaomi-mic-value">—</output>
    </div>
    <input type="range" id="xiaomi-mic-gain" min="-60" max="0" step="0.5" value="0" disabled>
    <p role="status" id="xiaomi-mic-status"></p>`;
  panel.prepend(styles);
  playback.after(panel);

  const gain = panel.querySelector("#xiaomi-mic-gain");
  const level = panel.querySelector("#xiaomi-mic-value");
  const enabled = panel.querySelector("#xiaomi-mic-enabled");
  const status = panel.querySelector("#xiaomi-mic-status");
  let confirmed = null;
  let pending = false;

  function render() {
    gain.disabled = enabled.disabled = pending || !confirmed;
    enabled.checked = confirmed?.enabled ?? false;
    level.value = confirmed ? `${Number(gain.value).toLocaleString("ru-RU")} дБ` : "—";
  }

  async function readOrSet(setting, value) {
    if (pending) return;
    pending = true;
    render();
    status.textContent = "";
    try {
      confirmed = setting
        ? await ipcRenderer.invoke("linux:microphone-set", setting, value)
        : await ipcRenderer.invoke("linux:microphone-read");
      gain.value = String(confirmed.gainDb);
    } catch (error) {
      confirmed = null;
      status.textContent = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
    } finally {
      pending = false;
      render();
    }
  }

  gain.addEventListener("input", render);
  gain.addEventListener("change", () => readOrSet("gainDb", Number(gain.value)));
  enabled.addEventListener("change", () => readOrSet("enabled", enabled.checked));
  refreshMicrophone = () => { if (panel.isConnected) readOrSet(); };
  readOrSet();
  mountDsp(panel);
}

function mountDsp(panel) {
  const section=document.createElement("details");
  section.className="dsp-settings";
  section.innerHTML=`<summary>Обработка микрофона</summary>
    <div class="dsp-primary" aria-busy="false">
      <label>Аналоговая чувствительность <select data-control="pga" disabled></select></label>
      <label>Эхоподавление (AEC) <input data-control="aecEnabled" type="checkbox" disabled></label>
      <label>Уровень AEC <input data-control="aecStrength" type="number" min="0" max="10" step="1" required disabled></label>
      <label>Подавление тихого сигнала <input data-control="noiseEnabled" type="checkbox" disabled></label>
      <label>Порог, дБ <input data-control="noiseThreshold" type="number" min="-90" max="0" step="0.01" required disabled></label>
      <p class="dsp-status" role="status"></p>
    </div>
    <details class="dsp-advanced"><summary>Все параметры DSP</summary>
      <label class="dsp-graph-label">Тракт <select class="dsp-graph-select"><option value="1">Микрофон</option><option value="0">Воспроизведение</option></select></label>
      <div class="dsp-effect-list"></div>
    </details>`;
  panel.append(section);
  const style=document.createElement("style");
  style.textContent=`
    #xiaomi-microphone .dsp-settings { margin-top: 13px; border-top: 1px solid #343434; padding-top: 10px; }
    #xiaomi-microphone .dsp-settings summary { cursor: pointer; color: #d0d8e0; }
    #xiaomi-microphone .dsp-primary { margin-top: 8px; }
    #xiaomi-microphone .dsp-settings label { display: flex; justify-content: space-between;
      align-items: center; gap: 10px; padding: 4px 0; }
    #xiaomi-microphone .dsp-settings input[type=number], #xiaomi-microphone .dsp-settings select {
      width: 102px; color: #fff; background: #272727; border: 1px solid #4b4b4b; border-radius: 4px; padding: 3px 5px; }
    #xiaomi-microphone .dsp-settings input:disabled, #xiaomi-microphone .dsp-settings select:disabled { opacity: .55; }
    #xiaomi-microphone .dsp-advanced { border-top: 1px solid #343434; margin-top: 8px; padding-top: 8px; }
    #xiaomi-microphone .dsp-effect { border-top: 1px solid #303030; padding: 6px 0; }
    #xiaomi-microphone .dsp-effect-list { margin-top: 4px; }
    #xiaomi-microphone .dsp-effect label { font-size: 12px; overflow-wrap: anywhere; }
    #xiaomi-microphone .dsp-effect [aria-busy=true] { opacity: .55; }`;
  section.prepend(style);
  const primary=section.querySelector(".dsp-primary");
  const status=section.querySelector(".dsp-status");
  const advanced=section.querySelector(".dsp-advanced");
  const graph=section.querySelector(".dsp-graph-select");
  const list=section.querySelector(".dsp-effect-list");
  const controls=Object.fromEntries(Array.from(primary.querySelectorAll("[data-control]"),node=>[node.dataset.control,node]));
  let state=null;
  let pending=false;
  const errorText=error=>error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");

  function render() {
    if (state) {
      if (!controls.pga.options.length) {
        for(const [index,value] of state.pgaDecibels.entries()) controls.pga.add(new Option(`${value} дБ`,index));
      }
      controls.pga.value=String(state.pga);
      controls.aecEnabled.checked=Boolean(state.aec[0]);
      controls.aecStrength.value=String(state.aec[1]);
      controls.noiseEnabled.checked=Boolean(state.noise[0]);
      controls.noiseThreshold.value=String(state.noise[1]/100);
    }
    for(const node of Object.values(controls))node.disabled=pending||!state;
    graph.disabled=pending;
    primary.setAttribute("aria-busy",String(pending));
  }

  async function run(action, message) {
    if(pending)return;
    pending=true;
    status.textContent=message;
    render();
    try {
      await action();
      status.textContent="";
    } catch(error) {
      status.textContent=errorText(error);
    } finally {
      pending=false;
      render();
    }
  }

  function readPrimary() {
    return run(async()=>{state=await ipcRenderer.invoke("linux:dsp-mic-read");},"Читаю параметры микрофона…");
  }

  async function readAdvanced() {
    await run(async()=>{
      list.replaceChildren();
      const id=Number(graph.value);
      const data=await ipcRenderer.invoke("linux:dsp-graph-read",id);
      for(const block of [...data.inputs,...data.effects]){
        const item=document.createElement("details");
        item.className="dsp-effect";
        const title=document.createElement("summary");
        title.textContent=block.label;
        item.append(title);
        item.addEventListener("toggle",()=>{
          if(!item.open || item.children.length>1)return;
          const params=block.hardware?block.parameters:[{index:0,name:"Эффект включён",min:0,max:1,options:["Выкл.","Вкл."]},...block.parameters];
          for(const p of params){
            const label=document.createElement("label");
            const text=document.createElement("span");
            text.textContent=p.unit?`${p.name}, ${p.unit}`:p.name;
            const scale=p.scale||1;
            let field;
            if(p.references){
              field=document.createElement("select");
              for(const option of p.references)field.add(new Option(option.label,option.value));
            }else if(p.options){
              field=document.createElement("select");
              for(const [i,name] of p.options.entries())field.add(new Option(name,i));
            }else{
              field=document.createElement("input");
              field.type="number";
              field.required=true;
              field.min=String(p.min/scale);
              field.max=String(p.max/scale);
              field.step="any";
            }
            field.value=String(block.values[p.index]/scale);
            field.disabled=Boolean(p.readOnly&&!p.references);
            label.append(text,field);
            item.append(label);
            field.addEventListener("change",()=>{
              if(pending||!field.reportValidity()){
                field.value=String(block.values[p.index]/scale);
                return;
              }
              const value=Math.round(Number(field.value)*scale);
              field.disabled=true;
              run(async()=>{
                block.values=await ipcRenderer.invoke("linux:dsp-graph-set",id,block.address,p.index,value);
                if(id===1)state=await ipcRenderer.invoke("linux:dsp-mic-read");
              },"Применяю параметр…").finally(()=>{
                field.value=String(block.values[p.index]/scale);
                field.disabled=Boolean(p.readOnly&&!p.references);
              });
            });
          }
        });
        list.append(item);
      }
    },"Читаю схему DSP…");
  }

  for(const [name,node] of Object.entries(controls)){
    node.addEventListener("change",()=>{
      if(!state||pending||!node.reportValidity()){render();return;}
      const value=node.type==="checkbox"?Number(node.checked):Math.round(Number(node.value)*(name==="noiseThreshold"?100:1));
      run(async()=>{
        const confirmed=await ipcRenderer.invoke("linux:dsp-mic-set",name,value);
        if(name==="pga")state.pga=confirmed[3];
        else if(name.startsWith("aec"))state.aec=confirmed;
        else state.noise=confirmed;
        list.replaceChildren();
      },"Применяю параметр…").then(()=>{if(advanced.open)readAdvanced();});
    });
  }
  section.addEventListener("toggle",()=>{if(section.open)readPrimary();});
  advanced.addEventListener("toggle",()=>{if(advanced.open)readAdvanced();});
  graph.addEventListener("change",readAdvanced);
  const refresh=refreshMicrophone;
  refreshMicrophone=()=>{
    refresh?.();
    if(section.isConnected&&section.open)readPrimary();
  };
}

ipcRenderer.on("update-connect", (_event, status) => {
  if (status === "connect") queueMicrotask(() => refreshMicrophone?.());
});

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
  const app=document.querySelector("#app");
  if(app){
    const sync = () => {
      const page = app.querySelector(channelPageSelector);
      if (!page) {
        refreshMicrophone = null;
        return;
      }
      const playback = page.querySelector(":scope > .row-wrap");
      if (playback && !page.querySelector("#xiaomi-microphone")) mountMicrophone(playback);
    };
    new MutationObserver(sync).observe(app,{childList:true,subtree:true});
    sync();
  }
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
