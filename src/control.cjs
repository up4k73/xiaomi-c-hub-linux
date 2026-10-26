"use strict";
const protocol = require("./protocol.cjs");

class SpeakerControl {
  constructor(transport, options = {}) { this.transport = transport; this.queue = Promise.resolve(); this.failed = false; this.onBeforeChange = options.onBeforeChange || (() => {}); }
  async exchange(packet) {
    const response = await this.transport.exchange(protocol.outputReport(packet));
    return Buffer.from(response);
  }
  run(operation) {
    const pending = this.queue.then(async () => {
      if (this.failed) throw new Error("Connection stopped after an error; reconnect before another operation");
      try { return await operation(); } catch (error) { this.failed = true; throw error; }
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
  readState() { return this.run(async () => protocol.decodeState(await this.exchange(protocol.stateQuery()))); }
  setRgb(enabled) { return this.set("rgb",enabled); }
  set(name,value) {
    const {command,values,packet}=protocol.setting(name,value);
    const matches=fields=>protocol.SETTINGS[name].activeIndex?fields[command]?.[value]===2
      :JSON.stringify(fields[command])===JSON.stringify(values);
    return this.run(async () => {
      const before = protocol.decodeState(await this.exchange(protocol.stateQuery()));
      if (!before.fields[command]) throw new Error("Setting is not present in this speaker state");
      if (name==="eq" && before.fields[0x79]?.[0]!==1 && values.slice(0,2).some((v,i)=>v!==before.fields[command][i])) {
        throw new Error("Bass bands require a connected subwoofer");
      }
      if (matches(before.fields)) return { before, after: before, changed: false };
      await this.onBeforeChange(before, { setting: name, value });
      protocol.assertAck(await this.exchange(packet), command, values);
      const after = protocol.decodeState(await this.exchange(protocol.stateQuery()));
      if (!matches(after.fields)) throw new Error("Setting readback differs from requested value");
      return { before, after, changed: true };
    });
  }
}
module.exports = { SpeakerControl };
