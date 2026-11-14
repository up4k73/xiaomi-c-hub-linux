"use strict";
const {contextBridge,ipcRenderer}=require("electron");
const allowedOn=new Set(["window-maximized","update-connect","upgrade-event","update-devices","update-log"]);
const allowedSend=new Set(["getDevices","window-min","window-close","window-maximize","send-recover"]);
const allowedSync=new Set(["sendReport","hid-getFeatureReport","getPlatform","window-is-maximized","sendUpgradeReport"]);
// These selectors identify the corresponding views in the pinned C-HUB renderer.
const lightingSelector = ".right-wrapper[data-v-d3139483]";
const equalizerSelector = ".full-wrapper[data-v-a32bf8e4] > .equalizer-wrap";
const local = (ru, en) => navigator.language.startsWith("ru") ? ru : en;
const rpcError = error => error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
const stockMenuLabels = ["Колонка", "Вход и громкость", "Подсветка", "Звук", "Об устройстве", "Справка"];
let navigation = null;
let lighting = null;
let playback = null;
let message="",preview=false;
function updateBanner(){
  const node=document.querySelector("#xiaomi-linux-status-text");
  if(node)node.textContent=(preview?"Preview — no hardware connected · ":"")+message;
  const access=document.querySelector("#xiaomi-linux-usb-access");
  if(access)access.hidden=!message.includes("USB access denied");
}
ipcRenderer.on("linux-status",(_event,text,isPreview)=>{message=text;preview=Boolean(isPreview);updateBanner();});

const settingsStyle = `
  .page-container .el-menu { --el-menu-active-color: #69aeff; --el-menu-hover-text-color: #69aeff; }
  .el-main.xiaomi-mic-active > .main-wrapper,
  .xiaomi-lighting-active > .main-wrapper > :not(#xiaomi-lighting) { display: none; }
  .el-menu-item.xiaomi-previous-route .menu-icon {
    filter: grayscale(1); opacity: .64;
  }
  #xiaomi-mic-menu .menu-icon {
    display: grid; place-items: center; border-radius: 50%; background: #333; color: #ddd; flex: none;
  }
  #xiaomi-mic-menu.is-active .menu-icon { background: #0071e6; color: white; }
  #xiaomi-mic-menu svg { width: 24px; height: 24px; }
  .xiaomi-settings {
    --xiaomi-text: #f2f2f3; --xiaomi-muted: #bdbdc2; --xiaomi-line: #343438;
    --xiaomi-blue: #69aeff; --xiaomi-surface: #19191c; --xiaomi-field: #252529;
    color: var(--xiaomi-text); font-size: 26px; line-height: 1.38; accent-color: var(--xiaomi-blue);
    scrollbar-color: #606064 var(--xiaomi-surface);
  }
  .xiaomi-settings h1, .xiaomi-settings h2, .xiaomi-settings p { margin: 0; }
  .xiaomi-settings h1 { font-size: 42px; line-height: 1.15; font-weight: 600; margin-bottom: 30px; }
  .xiaomi-settings h2 { font-size: 29px; font-weight: 550; }
  .xiaomi-settings output { font-variant-numeric: tabular-nums; color: var(--xiaomi-muted); }
  .xiaomi-settings button, .xiaomi-settings select, .xiaomi-settings input { font: inherit; }
  .xiaomi-settings button, .xiaomi-settings input, .xiaomi-settings summary { cursor: pointer; }
  .xiaomi-settings :disabled { opacity: .5; cursor: default; }
  .xiaomi-settings :focus-visible, #xiaomi-mic-menu:focus-visible {
    outline: 2px solid #8ec1ff; outline-offset: 4px;
  }
  .xiaomi-page {
    box-sizing: border-box; width: 100%; height: 100%; min-width: 0; overflow-y: auto; padding: 42px 52px 52px;
  }
  .xiaomi-content { width: min(100%, 1160px); margin-inline: auto; }
  @media (max-width: 1000px) {
    .xiaomi-content { max-width: 940px; }
    .xiaomi-lighting-layout { --xiaomi-candle-width: 286px; }
  }
  .xiaomi-section {
    border-radius: 18px; background: var(--xiaomi-surface); padding: 20px 32px; margin-bottom: 20px;
  }
  .xiaomi-row, .xiaomi-dsp label {
    display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 56px;
  }
  .xiaomi-row + .xiaomi-row, .xiaomi-dsp-group + .xiaomi-dsp-group { border-top: 1px solid var(--xiaomi-line); }
  .xiaomi-settings input[type=range] { width: 100%; display: block; margin: 3px 0 10px; height: 24px; }
  .xiaomi-settings input[role=switch] {
    appearance: none; flex: none; width: 56px; height: 30px; margin: 0; position: relative;
    border-radius: 20px; background: #5b5b61;
  }
  .xiaomi-settings input[role=switch]:checked { background: #0071e6; }
  .xiaomi-settings input[role=switch]::after {
    content: ""; position: absolute; inset: 4px auto 4px 4px; width: 22px; background: white; border-radius: 50%;
  }
  .xiaomi-settings input[role=switch]:checked::after { transform: translateX(26px); }
  .xiaomi-settings [role=status] { color: var(--xiaomi-muted); font-size: 22px; margin-top: 8px; }
  .xiaomi-settings [role=status]:empty { display: none; }
  .xiaomi-dsp summary { color: var(--xiaomi-text); font-weight: 500; padding: 8px 0; }
  .xiaomi-dsp select, .xiaomi-dsp input[type=number] {
    color-scheme: dark; color: var(--xiaomi-text); background: var(--xiaomi-field);
    border: 1px solid #54545a; border-radius: 7px; padding: 4px 10px; width: 198px; flex: none;
  }
  .xiaomi-dsp-advanced { border-top: 1px solid var(--xiaomi-line); margin-top: 12px; padding-top: 8px; }
  .xiaomi-dsp-effect summary { font-size: 23px; }
  .xiaomi-dsp-effect { border-top: 1px solid var(--xiaomi-line); padding: 3px 0; }
  .xiaomi-dsp-effect label { font-size: 22px; overflow-wrap: anywhere; }
  .xiaomi-playback-dsp { margin: 22px 16px 0; }
  .xiaomi-playback-dsp .xiaomi-dsp-advanced { border: 0; margin: 0; padding: 0; }
  .xiaomi-lighting-layout { display: grid; grid-template-columns: minmax(0, 1fr) var(--xiaomi-candle-width, 340px); gap: 20px; align-items: start; }
  .xiaomi-lighting-modes { border: 0; margin: 8px 0 16px; padding: 0; min-width: 0; }
  .xiaomi-lighting-modes legend { padding: 0; margin-bottom: 12px; }
  .xiaomi-mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .xiaomi-mode-grid label { position: relative; min-width: 0; cursor: pointer; }
  .xiaomi-mode-grid input[type=radio] { position: absolute; inset: 0; opacity: 0; }
  .xiaomi-mode-grid span {
    display: grid; place-items: center; text-align: center; min-height: 58px; padding: 4px 8px;
    color: var(--xiaomi-muted); border: 1px solid #47474c; border-radius: 8px; font-size: 23px;
  }
  .xiaomi-mode-grid label:hover span { background: var(--xiaomi-field); }
  .xiaomi-mode-grid input:checked + span { color: var(--xiaomi-text); background: #23384d; border-color: var(--xiaomi-blue); }
  .xiaomi-mode-grid input:focus-visible + span { outline: 2px solid #8ec1ff; outline-offset: 2px; }
  .xiaomi-lighting-modes:disabled, .xiaomi-lighting-brightness:has(:disabled) { opacity: .54; }
  .xiaomi-candle {
    display: grid; justify-items: start; gap: 10px; text-align: left;
  }
  .xiaomi-candle p { font-size: 22px; color: var(--xiaomi-muted); }
  .xiaomi-candle button {
    margin-top: 6px; padding: 9px 16px; border: 1px solid #bc8755; border-radius: 8px;
    background: #3b2a21; color: #ffe2c8; width: 100%; font-weight: 540;
  }
  .xiaomi-candle button:hover:not(:disabled) { background: #4c3527; }
  .xiaomi-candle button[data-active=true] { background: #5c3924; opacity: 1; }
  .xiaomi-candle-preview {
    position: relative; justify-self: center; width: 16px; height: 186px; margin: 16px 0 12px;
    border-radius: 10px; overflow: hidden; background: linear-gradient(0deg, #9f4928, #39241a 72%, #201a18);
    outline: 1px solid #784a33; box-shadow: 0 3px 18px #e88d382f;
  }
  .xiaomi-candle-preview::after {
    content: ""; position: absolute; inset: auto 0 0; height: 80%;
    background: linear-gradient(0deg, #f59a42 12%, #ffd4a0 34%, #ed813852 67%, transparent);
    animation: xiaomi-candle-rise 3s ease-out infinite;
  }
  @keyframes xiaomi-candle-rise {
    0% { opacity: .55; transform: translateY(45%) scaleY(.85); }
    28% { opacity: .9; }
    100% { opacity: 0; transform: translateY(-65%) scaleY(1.15); }
  }
  @media (prefers-reduced-motion: reduce) { .xiaomi-candle-preview::after { animation: none; } }
`;

function mountMicrophone(panel) {
  panel.innerHTML = `<div class="xiaomi-content">
    <h1 id="xiaomi-mic-title">${local("Микрофон", "Microphone")}</h1>
    <section class="xiaomi-section" aria-labelledby="xiaomi-capture-title">
      <h2 id="xiaomi-capture-title">${local("Запись", "Recording")}</h2>
      <label class="xiaomi-row">${local("Микрофон включён", "Microphone enabled")}
        <input type="checkbox" role="switch" id="xiaomi-mic-enabled" disabled>
      </label>
      <div class="xiaomi-row">
        <label for="xiaomi-mic-gain">${local("Уровень USB-записи", "USB capture level")}</label>
        <output for="xiaomi-mic-gain" id="xiaomi-mic-value">—</output>
      </div>
      <input type="range" id="xiaomi-mic-gain" min="-60" max="0" step="0.5" value="0" disabled>
      <p role="status" id="xiaomi-mic-status"></p>
    </section>
  </div>`;
  const gain = panel.querySelector("#xiaomi-mic-gain");
  const level = panel.querySelector("#xiaomi-mic-value");
  const enabled = panel.querySelector("#xiaomi-mic-enabled");
  const status = panel.querySelector("#xiaomi-mic-status");
  const dsp = mountDsp(1);
  panel.firstElementChild.append(dsp.panel);

  let confirmed = null;
  let pending = false;
  function render() {
    gain.disabled = enabled.disabled = pending || !confirmed;
    enabled.checked = confirmed?.enabled ?? false;
    level.value = confirmed ? `${Number(gain.value).toLocaleString()} ${local("дБ", "dB")}` : "—";
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
      status.textContent = rpcError(error);
    } finally {
      pending = false;
      render();
    }
  }
  gain.addEventListener("input", render);
  gain.addEventListener("change", () => readOrSet("gainDb", Number(gain.value)));
  enabled.addEventListener("change", () => readOrSet("enabled", enabled.checked));
  return () => { readOrSet(); dsp.refresh(); };
}

function mountDsp(graph) {
  const panel = document.createElement("section");
  panel.className = "xiaomi-dsp xiaomi-section";
  if (graph === 1) {
    panel.innerHTML = `<h2>${local("Обработка микрофона", "Microphone processing")}</h2>
      <div class="xiaomi-dsp-group">
        <label>${local("Аналоговая чувствительность", "Analog sensitivity")} <select data-control="pga" disabled></select></label>
      </div>
      <div class="xiaomi-dsp-group">
        <label>${local("Эхоподавление (AEC)", "Echo cancellation (AEC)")} <input data-control="aecEnabled" type="checkbox" role="switch" disabled></label>
        <label>${local("Уровень AEC", "AEC level")} <input data-control="aecStrength" type="number" min="0" max="10" step="1" required disabled></label>
      </div>
      <div class="xiaomi-dsp-group">
        <label>${local("Подавление тихого сигнала", "Low-level suppression")} <input data-control="noiseEnabled" type="checkbox" role="switch" disabled></label>
        <label>${local("Порог, дБ", "Threshold, dB")} <input data-control="noiseThreshold" type="number" min="-90" max="0" step="0.01" required disabled></label>
      </div>`;
  }
  panel.insertAdjacentHTML("beforeend", `
    <details class="xiaomi-dsp-advanced">
      <summary>${graph === 1 ? local("Все параметры DSP микрофона", "All microphone DSP parameters")
        : local("Все параметры DSP воспроизведения", "All playback DSP parameters")}</summary>
      <div class="xiaomi-dsp-list"></div>
    </details>
    <p class="xiaomi-dsp-status" role="status"></p>`);
  const status=panel.querySelector(".xiaomi-dsp-status");
  const advanced=panel.querySelector(".xiaomi-dsp-advanced");
  const list=panel.querySelector(".xiaomi-dsp-list");
  const controls=Object.fromEntries(Array.from(panel.querySelectorAll("[data-control]"),node=>[node.dataset.control,node]));
  let state=null;
  let pending=false;
  let refreshQueued=false;

  function render() {
    if (state) {
      if (!controls.pga.options.length) {
        for(const [index,value] of state.pgaDecibels.entries()) {
          controls.pga.add(new Option(`${value} ${local("дБ", "dB")}`,index));
        }
      }
      controls.pga.value=String(state.pga);
      controls.aecEnabled.checked=Boolean(state.aec[0]);
      controls.aecStrength.value=String(state.aec[1]);
      controls.noiseEnabled.checked=Boolean(state.noise[0]);
      controls.noiseThreshold.value=String(state.noise[1]/100);
    }
    for(const node of Object.values(controls)) node.disabled=pending || !state;
    list.inert=pending;
    panel.setAttribute("aria-busy",String(pending));
  }

  async function run(action, message) {
    pending=true;
    status.textContent=message;
    render();
    try {
      await action();
      status.textContent="";
    } catch(error) {
      state=null;
      list.replaceChildren();
      status.textContent=rpcError(error);
    } finally {
      pending=false;
      render();
      if (refreshQueued) { refreshQueued=false; refresh(); }
    }
  }

  async function readPrimary() {
    if (graph === 1) state=await ipcRenderer.invoke("linux:dsp-mic-read");
  }

  async function readGraph() {
    if (!panel.isConnected) return;
    const data=await ipcRenderer.invoke("linux:dsp-graph-read",graph);
    const expanded = new Set(Array.from(list.querySelectorAll("details[open]"), item => item.dataset.address));
    list.replaceChildren();
    for(const block of [...data.inputs,...data.effects]){
      const item=document.createElement("details");
      item.className="xiaomi-dsp-effect";
      item.dataset.address=String(block.address);
      const title=document.createElement("summary");
      title.textContent=block.label;
      item.append(title);
      item.addEventListener("toggle",()=>{
        if(!item.open || item.children.length>1)return;
        const params=block.hardware?block.parameters:[{index:0,name:local("Эффект включён", "Effect enabled"),
          min:0,max:1,options:[local("Выкл.", "Off"),local("Вкл.", "On")]},...block.parameters];
        for(const parameter of params){
          const label=document.createElement("label");
          const text=document.createElement("span");
          text.textContent=parameter.unit?`${parameter.name}, ${parameter.unit}`:parameter.name;
          const scale=parameter.scale||1;
          let field;
          if(parameter.references){
            field=document.createElement("select");
            for(const option of parameter.references)field.add(new Option(option.label,option.value));
          }else if(parameter.options){
            field=document.createElement("select");
            for(const [i,name] of parameter.options.entries())field.add(new Option(name,i));
          }else{
            field=document.createElement("input");
            field.type="number";
            field.required=true;
            field.min=String(parameter.min/scale);
            field.max=String(parameter.max/scale);
            field.step="any";
          }
          field.value=String(block.values[parameter.index]/scale);
          field.disabled=Boolean(parameter.readOnly&&!parameter.references);
          label.append(text,field);
          item.append(label);
          field.addEventListener("change",()=>{
            if(pending||!field.reportValidity()){
              field.value=String(block.values[parameter.index]/scale);
              return;
            }
            const value=Math.round(Number(field.value)*scale);
            run(async()=>{
              block.values=await ipcRenderer.invoke("linux:dsp-graph-set",graph,block.address,parameter.index,value);
              await readPrimary();
            },local("Применяю параметр…", "Applying setting…")).finally(()=>{
              field.value=String(block.values[parameter.index]/scale);
            });
          });
        }
      });
      list.append(item);
      item.open=expanded.has(item.dataset.address);
    }
  }

  function refresh() {
    if (!panel.isConnected || (graph === 0 && !advanced.open)) return;
    if (pending) { refreshQueued=true; return; }
    run(async()=>{
      state=null;
      await readPrimary();
      if (advanced.open) await readGraph();
    },local("Читаю параметры DSP…", "Reading DSP settings…"));
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
        if(advanced.open)await readGraph();
      },local("Применяю параметр…", "Applying setting…"));
    });
  }
  advanced.addEventListener("toggle",()=>{if(advanced.open)refresh();});
  return {panel,refresh};
}

function mountLighting(host) {
  const panel = document.createElement("section");
  panel.id = "xiaomi-lighting";
  panel.className = "xiaomi-settings xiaomi-page";
  panel.setAttribute("aria-labelledby", "xiaomi-lighting-title");
  const modes = [
    local("Ритм 2.0", "Party 2.0"), local("Неон 2.0", "Rainbow 2.0"), local("Звёзды", "Starlight"),
    local("Аврора 2.0", "Aurora 2.0"), local("Камин 2.0", "Fireplace 2.0"), local("Дыхание 2.0", "Color Breath 2.0")
  ];
  panel.innerHTML = `<div class="xiaomi-content">
    <h1 id="xiaomi-lighting-title">${local("Подсветка", "Lighting")}</h1>
    <div class="xiaomi-lighting-layout">
      <div class="xiaomi-section">
        <label class="xiaomi-row">${local("Подсветка включена", "Lighting enabled")}
          <input type="checkbox" role="switch" id="xiaomi-rgb" disabled>
        </label>
        <fieldset class="xiaomi-lighting-modes" disabled>
          <legend>${local("Эффект", "Effect")}</legend>
          <div class="xiaomi-mode-grid">${modes.map((label,index)=>`
            <label><input type="radio" name="mode" value="${index+1}"><span>${label}</span></label>`).join("")}</div>
        </fieldset>
        <div class="xiaomi-lighting-brightness">
          <div class="xiaomi-row">
            <label for="xiaomi-brightness">${local("Яркость", "Brightness")}</label>
            <output for="xiaomi-brightness">—</output>
          </div>
          <input type="range" id="xiaomi-brightness" min="1" max="10" step="1" value="10" disabled>
        </div>
        <label class="xiaomi-row">${local("Озвучивать смену эффекта", "Announce effect changes")}
          <input type="checkbox" role="switch" id="xiaomi-light-prompts" disabled>
        </label>
        <p role="status"></p>
      </div>
      <section class="xiaomi-section xiaomi-candle" aria-labelledby="xiaomi-candle-title">
        <h2 id="xiaomi-candle-title">${local("Свеча", "Candle")}</h2>
        <p>${local("Камин 2.0, яркость 20%, без озвучки.", "Fireplace 2.0 at 20%, with announcements off.")}</p>
        <div class="xiaomi-candle-preview" aria-hidden="true"></div>
        <p>${local("Анимация на экране", "On-screen animation")}</p>
        <button type="button" disabled>${local("Включить свечу", "Light the candle")}</button>
      </section>
    </div>
  </div>`;
  host.append(panel);
  const rgb = panel.querySelector("#xiaomi-rgb");
  const brightness = panel.querySelector("#xiaomi-brightness");
  const level = panel.querySelector("output");
  const prompts = panel.querySelector("#xiaomi-light-prompts");
  const presets = panel.querySelector("fieldset");
  const candle = panel.querySelector("button");
  const status = panel.querySelector("[role=status]");
  let state = null;
  let pending = false;
  function render() {
    rgb.checked = state?.rgb ?? false;
    prompts.checked = state?.lightPrompts ?? false;
    const selected = state?.effect;
    for (const mode of presets.querySelectorAll("input")) mode.checked = Number(mode.value) === selected;
    rgb.disabled = prompts.disabled = pending || !state;
    presets.disabled = brightness.disabled = pending || !state?.rgb;
    level.value = state ? `${state.brightness*10}%` : "—";
    const candleOn = state?.rgb && state.effect === 5 && state.brightness === 2 && !state.lightPrompts;
    candle.disabled = pending || !state || candleOn;
    candle.dataset.active = String(Boolean(candleOn));
    candle.textContent = candleOn ? local("Свеча включена", "Candle lit") : local("Включить свечу", "Light the candle");
  }
  async function update(name, value) {
    if (pending) return;
    pending = true;
    render();
    status.textContent = "";
    try {
      state = name ? await ipcRenderer.invoke("linux:lighting-set",name,value) : await ipcRenderer.invoke("linux:lighting-read");
      brightness.value = String(state.brightness);
    } catch (error) {
      state = null;
      status.textContent = rpcError(error) + " " + local("Нажми «Обновить».", "Select Refresh.");
    } finally {
      pending = false;
      render();
    }
  }
  rgb.addEventListener("change",()=>update("rgb",rgb.checked));
  prompts.addEventListener("change",()=>update("lightPrompts",prompts.checked));
  presets.addEventListener("change",event=>update("effect",Number(event.target.value)));
  brightness.addEventListener("input",()=>{level.value=`${Number(brightness.value)*10}%`;});
  brightness.addEventListener("change",()=>update("brightness",Number(brightness.value)));
  candle.addEventListener("click",()=>update("candle"));
  return {panel,refresh:()=>update()};
}

function mountNavigation(menu, main) {
  const item = document.createElement("li");
  item.id = "xiaomi-mic-menu";
  item.className = "el-menu-item";
  item.tabIndex = 0;
  item.setAttribute("role", "menuitem");
  item.setAttribute("aria-controls", "xiaomi-microphone");
  item.innerHTML = `<div class="menu-item-wrapper">
    <span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round">
      <rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-3 0h6"></path>
    </svg></span><span class="menu-text">${local("Микрофон", "Microphone")}</span>
  </div>`;
  const stockItems = menu.querySelectorAll(":scope > li.el-menu-item");
  stockItems[1].after(item);
  const panel = document.createElement("section");
  panel.id = "xiaomi-microphone";
  panel.className = "xiaomi-settings xiaomi-page";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "xiaomi-mic-title");
  main.append(panel);
  const refresh = mountMicrophone(panel);
  let previous = null;

  function select(active) {
    if (active === !panel.hidden) return;
    panel.hidden = !active;
    main.classList.toggle("xiaomi-mic-active", active);
    item.classList.toggle("is-active", active);
    if (active) {
      previous = menu.querySelector(":scope > .is-active:not(#xiaomi-mic-menu)");
      previous?.classList.remove("is-active");
      previous?.classList.add("xiaomi-previous-route");
      item.setAttribute("aria-current", "page");
      refresh();
    } else {
      previous?.classList.remove("xiaomi-previous-route");
      previous?.classList.add("is-active");
      previous = null;
      item.removeAttribute("aria-current");
    }
  }

  function onMenu(event) {
    const entry = event.target.closest("li.el-menu-item");
    if (entry?.parentElement !== menu) return;
    if (event.type === "keydown") {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      entry.click();
      return;
    }
    if (entry === item) event.stopPropagation();
    select(entry === item);
  }
  for (const entry of stockItems) entry.tabIndex = 0;
  menu.addEventListener("click", onMenu, true);
  menu.addEventListener("keydown", onMenu, true);
  return {
    item, refresh:()=>{if(!panel.hidden)refresh();},
    remove:()=>{
      select(false);
      menu.removeEventListener("click", onMenu, true);
      menu.removeEventListener("keydown", onMenu, true);
      item.remove();
      panel.remove();
    }
  };
}

ipcRenderer.on("update-connect", (_event, status) => {
  if (status === "connect") queueMicrotask(() => {
    navigation?.refresh();
    lighting?.refresh();
    playback?.refresh();
  });
});

document.addEventListener("DOMContentLoaded",()=>{
  const style=document.createElement("style");
  style.textContent=settingsStyle;
  document.head.append(style);
  const bar=document.createElement("div");bar.id="xiaomi-linux-status";
  bar.style.cssText="position:fixed;bottom:10px;left:14px;right:14px;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 14px;background:#23292eeF;border:1px solid #48535a;border-radius:8px;color:#dbe4e8;font:12px sans-serif;line-height:1.4;";
  const text=document.createElement("span");text.id="xiaomi-linux-status-text";
  const button=document.createElement("button");button.textContent=local("Обновить", "Refresh");
  button.style.cssText="padding:6px 12px;background:#3e4c54;border:0;border-radius:5px;color:white;cursor:pointer;";
  button.addEventListener("click",()=>ipcRenderer.send("getDevices",{refresh:true}));
  const access=document.createElement("button");access.id="xiaomi-linux-usb-access";access.textContent="Enable USB access";access.hidden=true;
  access.style.cssText=button.style.cssText;
  access.addEventListener("click",async()=>{access.disabled=true;try{await ipcRenderer.invoke("linux:install-usb-access");}catch{message="USB permission setup was cancelled or failed.";updateBanner();}finally{access.disabled=false;}});
  bar.append(text,access,button);document.body.append(bar);updateBanner();
  const app=document.querySelector("#app");
  if(app){
    let lastMenu=null;
    const sync = () => {
      const menu = app.querySelector(".page-container ul.el-menu");
      const main = app.querySelector(".page-container .el-main");
      const stock = main?.querySelector(":scope > .main-wrapper");
      if (menu !== lastMenu) {
        lastMenu = menu;
        if (menu && navigator.language.startsWith("ru")) {
          for (const [index, entry] of menu.querySelectorAll(":scope > li.el-menu-item").entries()) {
            entry.querySelector(".menu-text").textContent = stockMenuLabels[index];
          }
        }
      }
      if (!navigation?.item.isConnected || !stock) {
        navigation?.remove();
        navigation = !preview && menu && stock ? mountNavigation(menu, main) : null;
      }

      const hasLighting = Boolean(stock?.querySelector(lightingSelector));
      main?.classList.toggle("xiaomi-lighting-active", hasLighting);
      if (hasLighting && !lighting?.panel.isConnected) {
        lighting = mountLighting(stock);
        lighting.refresh();
      } else if (!hasLighting && lighting) {
        lighting.panel.remove();
        lighting = null;
      }

      const equalizer = stock?.querySelector(equalizerSelector);
      if (!preview && equalizer && !playback?.panel.isConnected) {
        playback = mountDsp(0);
        playback.panel.classList.add("xiaomi-settings", "xiaomi-playback-dsp");
        equalizer.before(playback.panel);
      } else if (!equalizer) {
        playback = null;
      }
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
