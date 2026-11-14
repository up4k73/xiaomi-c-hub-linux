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
    return this.setSequence([[name,value]]);
  }
  setSequence(settings) {
    const changes=settings.map(([name,value])=>({name,value,...protocol.setting(name,value)}));
    return this.run(async () => {
      const before = protocol.decodeState(await this.exchange(protocol.stateQuery()));
      let after=before;
      for (const {name,value,command,values,packet} of changes) {
        const matches=fields=>protocol.SETTINGS[name].activeIndex?fields[command]?.[value]===2
          :JSON.stringify(fields[command])===JSON.stringify(values);
        if (!after.fields[command]) throw new Error("Setting is not present in this speaker state");
        if (name==="eq" && after.fields[0x79]?.[0]!==1 && values.slice(0,2).some((v,i)=>v!==after.fields[command][i])) {
          throw new Error("Bass bands require a connected subwoofer");
        }
        if (matches(after.fields)) continue;
        await this.onBeforeChange(after, { setting: name, value });
        protocol.assertAck(await this.exchange(packet), command, values);
        after = protocol.decodeState(await this.exchange(protocol.stateQuery()));
        if (!matches(after.fields)) throw new Error("Setting readback differs from requested value");
      }
      return { before, after, changed: after!==before };
    });
  }
}
module.exports = { SpeakerControl };
