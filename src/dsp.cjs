"use strict";

const {createHash} = require("node:crypto");
const {setTimeout: delay} = require("node:timers/promises");

// The addresses are graph-local. The script hashes identify the two layouts
// read from the B03, independently of the active preset and its parameters.
const graphs = [
  {
    name: "Воспроизведение",
    digest: "01a33e232e8e0717269d619b68d33178a9a58e1ef43ac1524510bec747f9a003",
    types: ["gain_control", "gain_control", "gain_control", "gain_control", "noise_suppressor_expander",
      "gain_control", "gain_control", "eq", "harmonic_exciter", "virtual_bass_td", "three_d", "dynamic_eq",
      "eq", "eq", "eq", "pcm_delay_ms", "pcm_delay", "gain_control", "eq", "silence_detector",
      "gain_control", "downmix_2to1", "eq", "gain_control"],
    labels: ["Предусиление источника", "Усиление I²S", "Громкость подсказок", "Усиление AUX Mix",
      "Подавление тихого сигнала AUX Mix", "Усиление основного сигнала", "Усиление перед EQ приложения",
      "EQ приложения", "Гармонический эксайтер", "Виртуальный бас", "Объёмный звук", "Динамический EQ",
      "Динамический EQ · низкий уровень", "Динамический EQ · высокий уровень", "EQ воспроизведения",
      "Задержка воспроизведения, мс", "Задержка воспроизведения, отсчёты", "Усиление выхода",
      "Дополнительный EQ", "Детектор тишины", "Усиление опорного сигнала AEC", "Опорный сигнал AEC в моно",
      "EQ выхода I²S", "Усиление выхода I²S"]
  },
  {
    name: "Микрофон",
    digest: "46420513a8c089941a29495675c52e353286742d7d364ecd8603c668e27b846e",
    types: ["gain_control", "gain_control", "pcm_delay", "pcm_delay_ms", "aec", "eq",
      "noise_suppressor_expander", "eq", "drc", "gain_control", "gain_control", "pcm_delay", "pcm_delay_ms"],
    labels: ["Входное усиление", "Усиление перед AEC", "Задержка микрофона, отсчёты", "Задержка микрофона, мс",
      "Эхоподавление AEC", "EQ перед шумоподавлением", "Подавление тихого сигнала", "EQ микрофона",
      "Компрессор микрофона", "Выходное усиление", "Усиление опорного сигнала AEC",
      "Задержка опорного сигнала, отсчёты", "Задержка опорного сигнала, мс"]
  }
];

const pgaDecibels = [-11.3,-10.2,-9,-7.7,-6.5,-5.2,-4,-2.7,-1.4,0.2,1.1,2.3,3.5,4.7,6,7.3,
  8.5,9.7,10.9,12.2,13.4,14.6,15.9,17.1,18.3,19.5,20.7,21.8,23,24.2,25.3,26.5];
const hardware = {
  6: {label:"Аналоговый предусилитель микрофона", length:4, parameters:{3:{name:"Чувствительность", min:0,max:31,options:pgaDecibels.map(v=>`${v} дБ`)}}},
  7: {label:"АЦП микрофона", length:10, parameters:{2:{name:"Уровень АЦП",min:0,max:16383,scale:4096,unit:"×"}}},
  8: {label:"Автоусиление и шумовой порог АЦП", length:14, parameters:{
    0:{name:"Автоусиление (AGC)",min:0,max:1,options:["Выкл.","Вкл."]},
    1:{name:"Предельный уровень",min:0,max:31,options:Array.from({length:32},(_,i)=>`${-3-i} дБ`)},
    2:{name:"Целевой уровень",min:0,max:31,options:Array.from({length:32},(_,i)=>`${-3-i} дБ`)},
    3:{name:"Максимальное усиление",min:0,max:31,options:Array.from({length:32},(_,i)=>`${-6+1.25*i} дБ`)},
    4:{name:"Минимальное усиление",min:0,max:31,options:Array.from({length:32},(_,i)=>`${-6+1.25*i} дБ`)},
    5:{name:"Смещение усиления",min:0,max:15,options:Array.from({length:16},(_,i)=>`${(i<8?i:i-16)/2} дБ`)},
    6:{name:"Окно измерения",min:1,max:4096,unit:"мс"},
    7:{name:"Удержание уровня",min:0,max:31,unit:"кадров"},
    8:{name:"Атака AGC",min:1,max:4096,unit:"мс"},
    9:{name:"Восстановление AGC",min:1,max:4096,unit:"мс"},
    10:{name:"Шумовой порог АЦП",min:0,max:1,options:["Выкл.","Вкл."]},
    11:{name:"Порог АЦП",min:0,max:31,options:Array.from({length:32},(_,i)=>`${-90+2*i} дБ`)},
    12:{name:"Измерять уровень",min:0,max:1,options:["На выходе АЦП","На входе АЦП"]},
    13:{name:"Удержание порога",min:0,max:31,unit:"кадров"}
  }}
};

function frame(command, payload = []) {
  const packet = Buffer.alloc(256);
  Buffer.from([0xa5,0x5a,command,payload.length,...payload,0x16]).copy(packet);
  return packet;
}

function decode(packet, command) {
  const end = packet[3] + 4;
  if (packet[0] !== 0xa5 || packet[1] !== 0x5a || packet[2] !== command || end >= packet.length || packet[end] !== 0x16) return null;
  return packet.subarray(4,end);
}

function catalogParameters(bytes, wanted) {
  const result = new Map();
  let pos = 11;
  while (pos < bytes.length) {
    const end = pos + 2 + bytes.readUInt16LE(pos);
    if (end > bytes.length || end <= pos + 8) throw new Error("Invalid DSP catalog record");
    const item = bytes.subarray(pos,end);
    pos = end;
    let i = 5;
    const string = () => {
      const length = item[i++];
      if (i + length > item.length) throw new Error("Invalid DSP catalog string");
      const text = item.toString("utf8",i,i+length);
      i += length;
      return text;
    };
    const name = string();
    if (!wanted.includes(name)) continue;
    i += 2;
    const inputs = item[i++];
    for (let n=0;n<inputs;n++) { string(); i++; }
    i++;
    const count = item[i++];
    const params = [];
    for (let n=0;n<count;n++) {
      const param = {index:n+1,name:string(),kind:item[i++]};
      if (param.kind === 0) {
        Object.assign(param,{min:0,max:1,options:["Выкл.","Вкл."]});
      } else if (param.kind === 1 || param.kind === 4) {
        const choices = string().split(";");
        Object.assign(param,{min:0,max:choices.length-1,options:choices,readOnly:param.kind===4});
      } else if (param.kind === 2 || param.kind === 3) {
        param.min = item.readInt16LE(i);
        param.max = item.readInt16LE(i+2);
        i += param.kind === 2 ? 6 : 4;
        param.readOnly = param.kind === 3;
      } else {
        throw new Error("Unknown DSP parameter type");
      }
      i += 4;
      params.push(param);
    }
    // Units below come from the checked catalog. Keep other values in the
    // device's native units, including filter selection and cross-node links.
    for (const param of params) {
      if (name==="gain_control" && param.name==="gain" ||
          ["noise_suppressor_expander","dynamic_eq","drc"].includes(name) && /threshold|pregain/.test(param.name)) {
        Object.assign(param,{unit:"дБ",scale:100});
      } else if (name==="eq" && /pregain|_gain$/.test(param.name)) {
        Object.assign(param,{unit:"дБ",scale:256});
      } else if (name==="eq" && /_Q$/.test(param.name)) {
        param.scale=1024;
      } else if (name==="drc" && /^ratio_/.test(param.name)) {
        param.scale=100;
      } else if (name==="pcm_delay" && /delay/.test(param.name)) {
        param.unit="отсчётов";
      } else if (name==="pcm_delay_ms" && /delay/.test(param.name) || /attack|release/.test(param.name)) {
        param.unit="мс";
      } else if (/frequency|_f0$|^fc_/.test(param.name)) {
        param.unit="Гц";
      }
    }
    result.set(name,params);
  }
  if (wanted.some(name=>!result.has(name))) throw new Error("DSP catalog is missing configured effects");
  return result;
}

class DspControl {
  constructor(transport, saveBackup) {
    this.transport = transport;
    this.saveBackup = saveBackup;
    this.verified = new Set();
  }

  async read(command, payload = [], accepts = () => true) {
    let reply = await this.transport.exchange(frame(command,payload));
    for (let attempt=0;attempt<=8;attempt++) {
      const body = decode(reply,command);
      if (body && accepts(body)) return body;
      if (attempt===8) break;
      await delay(8);
      reply = await this.transport.transfer(0xa1,1,0x0100,256);
    }
    throw new Error(`DSP readback failed for 0x${command.toString(16)}`);
  }

  async getPosition(subtype) {
    const body = await this.read(0x80,[subtype],r=>r.length===7 && r[0]===0 && r[1]===0xff && r[2]===0 && r[3]===subtype && r[6]===1);
    return body[5];
  }

  async stream(subtype) {
    const chunks=[];
    let total=0;
    let size=0;
    for(let i=0;i<100;i++) {
      const body = await this.read(0x80,[subtype],r=>r[0]===i && (i>0 || r[1]===0xff && r[2]===0 && r[3]===subtype));
      if (i===0) {
        if (body.length<7) throw new Error("Invalid DSP stream header");
        total=body.readUInt16LE(4);
      }
      const chunk=body.subarray(i===0?6:1,-1);
      chunks.push(chunk);
      size+=chunk.length;
      if (body.at(-1)===1 && size===total) return Buffer.concat(chunks,size);
      if (body.at(-1)!==0 || size>=total) break;
    }
    throw new Error("Incomplete DSP stream");
  }

  async checkFirmware() {
    if (this.firmware) return true;
    const id = await this.read(0);
    if (id.toString("hex")!=="42000901022d05021b0102423502") return false;
    this.firmware = id.toString("hex");
    return true;
  }

  async select(graph) {
    const ack=await this.transport.exchange(frame(0x80,[8,graph]));
    if (ack[0]!==0x80) throw new Error("DSP не подтвердил выбор схемы");
    await delay(180);
    if (await this.getPosition(8)!==graph) throw new Error("DSP не переключил схему");
    await this.read(2);
  }

  async onGraph(graph, operation) {
    if (!Number.isInteger(graph) || !graphs[graph]) throw new Error("Unknown DSP graph");
    if (!await this.checkFirmware()) throw new Error("Эта версия DSP пока не поддерживается");
    const before=await this.getPosition(8);
    if (!graphs[before]) throw new Error("Unexpected current DSP graph");
    const mode=await this.getPosition(6);
    try {
      if (graph!==before) await this.select(graph);
      if (!this.verified.has(graph)) {
        const script=await this.stream(2);
        const hash=createHash("sha256").update(script).digest("hex");
        if (hash!==graphs[graph].digest) throw new Error("Схема DSP отличается от проверенной B03");
        this.verified.add(graph);
      }
      await this.read(2);
      return await operation();
    } finally {
      if (graph!==before) {
        await this.select(before);
        if (await this.getPosition(6)!==mode) throw new Error("DSP changed the playback preset during the graph switch");
      }
    }
  }

  async registers(address, length) {
    const raw=await this.read(address,[],p=>p[0]===0xff && p.length===1+2*length);
    return Array.from({length},(_,i)=>raw.readInt16LE(1+2*i));
  }

  async write(address,index,value,before) {
    if (before[index]===value) return before;
    const body=Buffer.alloc(3);
    body[0]=index;
    body.writeInt16LE(value,1);
    const ack=await this.transport.exchange(frame(address,body));
    if (ack[0]!==address) throw new Error("DSP не подтвердил запись");
    await this.read(2);
    const after=await this.registers(address,before.length);
    if (after.some((v,i)=>v!==(i===index?value:before[i]))) throw new Error("DSP вернул неожиданные значения после записи");
    return after;
  }

  async schema(graph) {
    if (!this.catalog) {
      const bytes=await this.stream(0);
      const digest=createHash("sha256").update(bytes).digest("hex");
      if (digest!=="cce1519324302496bbca7f4029372b78de3efa3fe182f20ae94ead607b1e457e") throw new Error("DSP catalog does not match the tested firmware");
      this.catalog=catalogParameters(bytes,Array.from(new Set(graphs.flatMap(g=>g.types))));
    }
    return graphs[graph].types.map((type,i)=>({address:0x81+i,type,label:graphs[graph].labels[i],parameters:this.catalog.get(type)}));
  }

  async readMicrophone() {
    return this.onGraph(1,async()=>({
      pga:(await this.registers(6,4))[3],
      pgaDecibels,
      aec:await this.registers(0x85,2),
      noise:await this.registers(0x87,5)
    }));
  }

  async setMicrophone(setting, value) {
    const controls = {
      pga:[6,3], aecEnabled:[0x85,0], aecStrength:[0x85,1],
      noiseEnabled:[0x87,0], noiseThreshold:[0x87,1]
    };
    const target=Object.hasOwn(controls,setting) && controls[setting];
    if (!target) throw new Error("Unknown microphone DSP setting");
    return this.set(1,...target,value);
  }

  async readGraph(graph) {
    return this.onGraph(graph,async()=>{
      const effects=await this.schema(graph);
      for (const effect of effects) {
        effect.values=await this.registers(effect.address,effect.parameters.length+1);
        effect.parameters=effect.parameters.map(param=>param.kind===4 ? {...param,
          references:effects.filter(node=>node.type==="eq").map(node=>({value:node.address,label:node.label}))} : param);
      }
      const inputs=[];
      if (graph===1) {
        for (const [address,meta] of Object.entries(hardware)) {
          inputs.push({address:Number(address),label:meta.label,
            parameters:Object.entries(meta.parameters).map(([index,param])=>({index:Number(index),...param})),
            values:await this.registers(Number(address),meta.length),hardware:true});
        }
      }
      return {name:graphs[graph].name,effects,inputs};
    });
  }

  async set(graph,address,index,value) {
    if (![address,index,value].every(Number.isInteger)) throw new Error("Invalid DSP setting");
    return this.onGraph(graph,async()=>{
      const effect=(await this.schema(graph)).find(e=>e.address===address);
      const input=graph===1 && hardware[address];
      const length=input?.length ?? (effect ? effect.parameters.length+1 : 0);
      const param=input ? input.parameters[index] : index===0 && effect ? {min:0,max:1} : effect?.parameters[index-1];
      const referenceAllowed=param?.kind===4 && (await this.schema(graph)).some(node=>node.address===value && node.type==="eq");
      if (!param || (!referenceAllowed && (param.readOnly || value<param.min || value>param.max))) throw new Error("Недопустимое значение DSP");
      const before=await this.registers(address,length);
      if (address===6 && (before[1]!==0 || before[2]!==1)) throw new Error("Неожиданный режим микрофонного предусилителя");
      if (address===8 && (index===3 && value<before[4] || index===4 && value>before[3])) throw new Error("Минимальное усиление должно быть не выше максимального");
      if (["pcm_delay","pcm_delay_ms"].includes(effect?.type) && (index===1 && value>before[2] || index===2 && value<before[1])) {
        throw new Error("Задержка превышает размер буфера");
      }
      if (before[index]===value) return before;
      await this.saveBackup({graph,address,index,values:before},{setting:"dsp",value});
      try {
        return await this.write(address,index,value,before);
      } catch (error) {
        const observed=await this.registers(address,length);
        await this.write(address,index,before[index],observed);
        throw error;
      }
    });
  }
}

module.exports={DspControl,catalogParameters};
