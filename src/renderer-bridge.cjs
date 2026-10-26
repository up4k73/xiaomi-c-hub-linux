"use strict";
// Compatibility boundary for the unmodified official C-HUB renderer.
const protocol=require("./protocol.cjs");
function asArrayBuffer(bytes){return Uint8Array.from(bytes).buffer;}
function stateReply(state){
  const body=Object.entries(state.fields).flatMap(([key,value])=>[Number(key),value.length,...value]);
  const reply=protocol.frame(0x70,3,body);
  // initSpeakerConfig treats byte 3 as the TLV-body length, not wire length.
  reply[3]=body.length;
  return asArrayBuffer(protocol.outputReport(reply));
}
class RendererBridge {
  constructor(client,state){this.client=client;this.state=state;}
  async report(payload){
    if(payload?.deviceVersion!=="B03") throw new Error("Unsupported renderer device version");
    const request=protocol.decode(Buffer.from(payload.outData||[]));
    if(request.operation===3&&request.command===0x70)return stateReply(this.state);
    if(request.operation===3&&request.command===0x8c){
      const values=this.state.fields[0x8c];
      if(values?.length!==10)throw new Error("Incomplete EQ state");
      // The stock initEQConfig reader expects the value count in byte 5.
      return asArrayBuffer(Buffer.from([165,90,252,12,140,10,...values,22]));
    }
    if(request.operation!==2)throw new Error("Unsupported renderer request");
    const item=Object.entries(protocol.SETTINGS).find(([,rule])=>rule.command===request.command);
    if(!item)throw new Error("This operation is not supported by the Linux adapter");
    const [name,rule]=item;
    if(request.payload.length!==(rule.length||1))throw new Error("Incomplete setting from C-HUB; refresh the state");
    let value=rule.length?Array.from(request.payload):request.payload[0];
    if(rule.boolean){if(![0,1].includes(value))throw new Error("Invalid boolean setting");value=Boolean(value);}
    const result=await this.client.set(name,value);
    this.state=result.after;
    return asArrayBuffer(protocol.outputReport(protocol.frame(request.command,2,[0])));
  }
}
module.exports={RendererBridge,stateReply};
