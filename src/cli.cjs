"use strict";
const fs = require("fs");
const { findSpeaker, UsbTransport } = require("./usb-transport.cjs");
const { SpeakerControl } = require("./control.cjs");
const protocol = require("./protocol.cjs");

async function main() {
  const args = process.argv.slice(2);
  const operation = args.shift();
  const settingName = operation === "set" ? args.shift() : operation === "rgb" ? "rgb" : undefined;
  const value = settingName ? args.shift() : undefined;
  const evidencePath = args.shift();
  if (operation !== "read" && !(operation === "rgb" && ["on","off"].includes(value)) && operation!=="set") {
    throw new Error("Usage: read [evidence.json] | rgb on|off evidence.json | set name JSON-value evidence.json");
  }
  if (args.length || (operation !== "read" && !evidencePath)) throw new Error("A settings change requires an evidence file path");
  const parsedValue = operation === "rgb" ? value === "on" : operation === "set" ? JSON.parse(value) : undefined;
  if (operation !== "read") protocol.setting(settingName, parsedValue);
  if (evidencePath && [evidencePath, evidencePath + ".before.json", evidencePath + ".trace.json"].some(file => fs.existsSync(file))) {
    throw new Error("Choose a new evidence filename; an output or sidecar already exists");
  }
  const identity = findSpeaker(undefined, {path:process.env.XIAOMI_USB_PATH,serial:process.env.XIAOMI_USB_SERIAL});
  const modulePath = process.env.XIAOMI_USB_MODULE || "usb";
  const transport = new UsbTransport(require(modulePath), identity);
  try {
    const client = new SpeakerControl(transport, { onBeforeChange: before => {
      fs.writeFileSync(evidencePath + ".before.json", JSON.stringify({time:new Date().toISOString(),identity,before},null,2)+"\n",{flag:"wx",mode:0o600});
    } });
    const result = operation === "read" ? await client.readState() : await client.set(settingName,parsedValue);
    const evidence = { time: new Date().toISOString(), identity, operation, result };
    if (evidencePath) fs.writeFileSync(evidencePath, JSON.stringify(evidence,null,2)+"\n",{flag:"wx",mode:0o600});
    console.log(JSON.stringify(evidence,null,2));
  } finally {
    try { await transport.close(); }
    finally { if (evidencePath) fs.writeFileSync(evidencePath + ".trace.json", JSON.stringify(transport.trace,null,2)+"\n",{flag:"wx",mode:0o600}); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
