"use strict";

const REPORT_BYTES = 256;
const STATE_COMMAND = 0x70;
const RGB_COMMAND = 0x34;
const SETTINGS = Object.freeze({
  rgb: { command:0x34, boolean:true }, brightness:{command:0x31,min:0,max:10},
  effect:{command:0x30,min:1,max:6}, volume:{command:0x74,min:0,max:16},
  soundMode:{command:0x40,min:0,max:4}, lightPrompts:{command:0x32,boolean:true},
  soundPrompts:{command:0x41,boolean:true}, eq:{command:0x8c,length:10,min:0,max:12},
  sleepEnabled:{command:0x80,boolean:true}, sleepMinutes:{command:0x81,min:2,max:45},
  standbyEnabled:{command:0x83,boolean:true}, standbyMinutes:{command:0x84,min:2,max:45},
  channel:{command:0x85,min:0,max:3,activeIndex:true}, channelPrompts:{command:0x86,boolean:true},
  channelPromptVolume:{command:0x87,min:0,max:2}, powerPrompts:{command:0x8e,boolean:true},
  mixedInput:{command:0x8f,boolean:true}
});
function setting(name,value) {
  const rule=SETTINGS[name];
  if (!rule) throw new Error("Unsupported setting");
  let values;
  if (rule.boolean) {
    if (typeof value!=="boolean") throw new Error("Setting must be boolean");
    values=[Number(value)];
  } else {
    values=rule.length?value:[value];
    if (!Array.isArray(values) || values.length!==(rule.length||1)
      || values.some(v=>!Number.isInteger(v)||v<rule.min||v>rule.max)) throw new Error("Setting value is out of range");
  }
  return {command:rule.command,values,packet:frame(rule.command,2,values)};
}
function frame(command, operation, payload) {
  const values = [command, operation, ...payload];
  if (values.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error("Invalid protocol byte");
  if (values.length + 5 > REPORT_BYTES) throw new Error("Frame exceeds report size");
  return Buffer.from([0xa5, 0x5a, 0xfc, values.length, ...values, 0x16]);
}
function outputReport(packet) {
  decode(packet);
  const report = Buffer.alloc(REPORT_BYTES);
  packet.copy(report);
  return report;
}
function decode(packet) {
  const bytes = Buffer.from(packet);
  if (bytes.length < 8 || bytes.length > REPORT_BYTES || !bytes.subarray(0, 3).equals(Buffer.from([0xa5,0x5a,0xfc]))) {
    throw new Error("Invalid speaker reply envelope");
  }
  let end = bytes.length - 1;
  while (end > 6 && bytes[end] === 0) end--;
  if (bytes[end] !== 0x16 || bytes[3] < 2 || bytes[3] > end - 3) throw new Error("Truncated speaker frame");
  const command = bytes[4], operation = bytes[5];
  if (![0x70,0x90].includes(command) && bytes[3] + 4 !== end) throw new Error("Frame length mismatch");
  return { command, operation, payload: bytes.subarray(6, end), declaredLength: bytes[3] };
}
function decodeState(packet) {
  const reply = decode(packet);
  if (reply.command !== STATE_COMMAND || reply.operation !== 3) throw new Error("State response does not match query");
  const fields = {};
  let i = 0;
  while (i < reply.payload.length) {
    if (i + 2 > reply.payload.length) throw new Error("Incomplete state field header");
    const key = reply.payload[i++], length = reply.payload[i++];
    if (key === 0 && length === 0) continue;
    if (!length || length > 32 || i + length > reply.payload.length) throw new Error("Invalid state field length");
    if (Object.hasOwn(fields, key)) throw new Error("Duplicate state field");
    fields[key] = Array.from(reply.payload.subarray(i, i + length));
    i += length;
  }
  if (fields[RGB_COMMAND]?.length !== 1 || ![0,1].includes(fields[RGB_COMMAND][0])) throw new Error("Missing RGB state");
  if (fields[0x31]?.length !== 1 || fields[0x31][0] > 10) throw new Error("Missing brightness state");
  return { fields, rgbEnabled: fields[RGB_COMMAND][0] === 1, brightness: fields[0x31][0],
    effect: fields[0x30]?.[0], volume: fields[0x74]?.[0] };
}
function assertAck(packet, command, expectedPayload) {
  const reply = decode(packet);
  // The actual device echoes the setting value (brightness 9 replies with 9).
  // It is not a zero-on-success status. Readback remains independently required.
  if (reply.command !== command || reply.operation !== 2 || !reply.payload.length
      || (expectedPayload && !reply.payload.equals(Buffer.from(expectedPayload)))) {
    throw new Error("Speaker did not acknowledge the setting");
  }
}
const stateQuery = () => frame(STATE_COMMAND, 3, [0]);
const rgbSetting = enabled => {
  if (typeof enabled !== "boolean") throw new Error("RGB setting must be boolean");
  return frame(RGB_COMMAND, 2, [Number(enabled)]);
};
module.exports = { REPORT_BYTES, STATE_COMMAND, RGB_COMMAND, SETTINGS, setting, frame, outputReport, decode, decodeState, assertAck, stateQuery, rgbSetting };
