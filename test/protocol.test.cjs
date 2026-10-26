"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const p = require("../src/protocol.cjs");
const { SpeakerControl } = require("../src/control.cjs");
const { UsbTransport, findSpeaker } = require("../src/usb-transport.cjs");
const {RendererBridge,stateReply}=require("../src/renderer-bridge.cjs");

function state(enabled = false) {
  return p.outputReport(p.frame(0x70, 3, [48,1,1,49,1,10,52,1,Number(enabled),116,1,4,
    0,0,0,0,140,10,6,6,6,6,6,6,6,6,6,6,129,1,22]));
}
const ack = (command,values=[0]) => p.outputReport(p.frame(command, 2, values));
test("vendor macOS command is padded to exactly 256 USB bytes without a report-ID prefix", () => {
  const report = p.outputReport(p.rgbSetting(true));
  assert.equal(report.length, 256);
  assert.deepEqual(Array.from(report.subarray(0,8)), [165,90,252,3,52,2,1,22]);
  assert.ok(report.subarray(8).every(v => v === 0));
  assert.deepEqual(Array.from(p.stateQuery()), [165,90,252,3,112,3,0,22]);
});
test("TLV parsing retains EQ and handles a terminator-valued payload without scanning inside values", () => {
  const raw = state(); raw[3] -= 4;
  const result = p.decodeState(raw);
  assert.equal(result.rgbEnabled, false);
  assert.equal(result.fields[129][0], 22);
  assert.deepEqual(result.fields[140], Array(10).fill(6));
  assert.equal(result.brightness, 10);
});
test("reject malformed, truncated, duplicate and mismatched replies", () => {
  assert.throws(() => p.decode(Buffer.alloc(256)), /envelope/);
  assert.throws(() => p.decodeState(p.outputReport(p.frame(0x70,3,[52,1,1,49,1,10,129,2,22]))), /length/);
  assert.throws(() => p.decodeState(p.outputReport(p.frame(0x70,3,[52,1,1,49,1,10,52,1,0]))), /Duplicate/);
  assert.throws(() => p.assertAck(ack(49), 52), /acknowledge/);
  assert.throws(() => p.assertAck(p.outputReport(p.frame(52,3,[1])),52), /acknowledge/);
  assert.throws(() => p.rgbSetting(1), /boolean/);
});
test("setting requires a matching acknowledgement and independent state readback", async () => {
  const calls = [], replies = [state(false), ack(52,[1]), state(true)];
  const client = new SpeakerControl({ async exchange(packet) { calls.push(packet); return replies.shift(); } });
  const result = await client.setRgb(true);
  assert.equal(result.changed, true); assert.equal(result.after.rgbEnabled, true);
  assert.deepEqual(calls.map(b => b[4]), [112,52,112]);
  assert.ok(calls.every(b => b.length === 256));
});
test("no write when the requested setting already matches", async () => {
  let calls = 0;
  const client = new SpeakerControl({ async exchange() { calls++; return state(true); } });
  assert.equal((await client.setRgb(true)).changed, false);
  assert.equal(calls, 1);
});
test("stop on failed readback without retries or further device access", async () => {
  let calls = 0; const replies = [state(false),ack(52,[1]),state(false)];
  const client = new SpeakerControl({ async exchange() { calls++; return replies.shift(); } });
  await assert.rejects(client.setRgb(true), /readback/);
  await assert.rejects(client.readState(), /Connection stopped/);
  assert.equal(calls, 3);
});
test("transport error is not retried", async () => {
  let calls = 0;
  const client = new SpeakerControl({ async exchange() { calls++; throw new Error("USB timeout"); } });
  await assert.rejects(client.readState(), /USB timeout/);
  await assert.rejects(client.setRgb(true), /Connection stopped/);
  assert.equal(calls, 1);
});
test("USB transport claims only interface 4 and uses the vendor request/value pairs", async () => {
  const calls = [];
  const device = { busNumber:3, deviceAddress:20, deviceDescriptor:{idVendor:0x2717,idProduct:0xd007},
    configDescriptor:{bConfigurationValue:1}, open(){calls.push("open");}, close(){calls.push("close");},
    interface(n){ assert.equal(n,4); return { descriptor:{bInterfaceClass:3,bNumEndpoints:0},
      isKernelDriverActive:()=>false, claim(){calls.push("claim4");}, release(cancel, cb){assert.equal(cancel,false);calls.push("release4");cb();} }; },
    controlTransfer(type, request, value, index, data, cb){ calls.push([type,request,value,index,Buffer.isBuffer(data)?data.length:data]);cb(null,type===0xa1?state():undefined); }
  };
  const transport = new UsbTransport({getDeviceList:()=>[device]}, {bus:3,address:20});
  assert.equal(device.timeout,1000);
  await transport.exchange(p.outputReport(p.stateQuery()));
  await transport.close();
  assert.deepEqual(calls,["open","claim4",[0x21,9,0x200,4,256],[0xa1,1,0x100,4,256],"release4","close"]);
});
test("discover the exact speaker from cached sysfs on direct and hub connections", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"xiaomi-sysfs-"));
  try {
    const device=path.join(root,"1-2.2");fs.mkdirSync(device);
    for (const [name,value] of Object.entries({idVendor:"2717",idProduct:"d007",serial:"20190808",busnum:"1",devnum:"7"})) fs.writeFileSync(path.join(device,name),value);
    assert.deepEqual(findSpeaker(root),{path:"1-2.2",bus:1,address:7});
    fs.renameSync(device,path.join(root,"3-1"));
    assert.deepEqual(findSpeaker(root),{path:"3-1",bus:1,address:7});
    const second=path.join(root,"1-4");fs.cpSync(path.join(root,"3-1"),second,{recursive:true});
    fs.writeFileSync(path.join(second,"serial"),"another-unit");
    fs.writeFileSync(path.join(second,"devnum"),"8");
    assert.throws(()=>findSpeaker(root),/Multiple/);
    assert.deepEqual(findSpeaker(root,{path:"1-4"}),{path:"1-4",bus:1,address:8});
    assert.deepEqual(findSpeaker(root,{serial:"another-unit"}),{path:"1-4",bus:1,address:8});
    assert.throws(()=>findSpeaker(root,{serial:"missing"}),/No Xiaomi/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("EQ always has ten values and rejects the old six-value packet",()=>{
  const result=p.setting("eq",[6,6,6,6,6,6,6,6,6,6]);
  assert.equal(result.packet.length,17);assert.equal(result.packet[3],12);
  assert.throws(()=>p.setting("eq",Array(6).fill(6)),/range/);
  assert.throws(()=>p.setting("eq",Array(10).fill(13)),/range/);
  assert.throws(()=>p.setting("restart",0),/Unsupported/);
  assert.throws(()=>p.setting("effect",7),/range/);
});
test("backup must finish before the first setting write",async()=>{
  const order=[],replies=[state(false),ack(52,[1]),state(true)];
  const client=new SpeakerControl({async exchange(packet){order.push(packet[4]);return replies.shift();}},
    {async onBeforeChange(before,change){assert.equal(before.rgbEnabled,false);assert.equal(change.setting,"rgb");order.push("backup");}});
  await client.setRgb(true);assert.deepEqual(order,[112,"backup",52,112]);
});
test("a failed backup prevents the setting write",async()=>{
  let calls=0;
  const client=new SpeakerControl({async exchange(){calls++;return state(false);}},
    {onBeforeChange(){throw new Error("backup unavailable");}});
  await assert.rejects(client.setRgb(true),/backup unavailable/);assert.equal(calls,1);
});
test("stock C-HUB state reader receives all ten EQ values and a correct body length",()=>{
  const result=new Uint8Array(stateReply(p.decodeState(state())));
  const body=result.slice(6,6+result[3]);
  const index=body.indexOf(140);
  assert.equal(body[index+1],10);
  assert.deepEqual(Array.from(body.slice(index+2,index+12)),Array(10).fill(6));
});
test("stock renderer polling reads confirmed cache without new USB transfers",async()=>{
  let calls=0;
  const bridge=new RendererBridge({readState(){calls++;}},p.decodeState(state()));
  for(let i=0;i<5;i++)assert.ok((await bridge.report({deviceVersion:"B03",outData:Array.from(p.stateQuery())})).byteLength>0);
  assert.equal(calls,0);
  const eq=new Uint8Array(await bridge.report({deviceVersion:"B03",outData:Array.from(p.frame(140,3,[0]))}));
  assert.equal(eq[5],10);assert.deepEqual(Array.from(eq.slice(6,16)),Array(10).fill(6));
});
test("official UI cannot receive a success acknowledgement for an unverified change",async()=>{
  const bridge=new RendererBridge({async set(){throw new Error("readback mismatch");}},p.decodeState(state()));
  await assert.rejects(bridge.report({deviceVersion:"B03",outData:Array.from(p.rgbSetting(true))}),/readback/);
  await assert.rejects(bridge.report({deviceVersion:"B03",outData:[165,90,252,12,140,2,6,6,6,6,6,6,22]}),/length|Truncated/);
});
test("ordinary speaker feature bounds follow the stock B03 controls",()=>{
  assert.deepEqual(p.setting("channel",3).values,[3]);
  assert.throws(()=>p.setting("channel",4),/range/);
  assert.throws(()=>p.setting("sleepMinutes",1),/range/);
  assert.throws(()=>p.setting("standbyMinutes",46),/range/);
  assert.deepEqual(p.setting("channelPromptVolume",2).values,[2]);
});
test("channel selection verifies its active index in the four-value state field",async()=>{
  const make=active=>p.outputReport(p.frame(0x70,3,[49,1,10,52,1,1,133,4,...[0,1,2,3].map(i=>i===active?2:1)]));
  const replies=[make(0),ack(133,[1]),make(1)];
  const client=new SpeakerControl({async exchange(){return replies.shift();}});
  const result=await client.set("channel",1);
  assert.equal(result.after.fields[133][1],2);
});
