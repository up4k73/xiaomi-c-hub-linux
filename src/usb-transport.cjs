"use strict";
const fs = require("fs");
const path = require("path");

function findSpeaker(sysRoot = "/sys/bus/usb/devices", options = {}) {
  const found = [];
  for (const name of fs.readdirSync(sysRoot)) {
    const root = path.join(sysRoot, name);
    const read = part => fs.readFileSync(path.join(root, part), "utf8").trim();
    try {
      if (read("idVendor") === "2717" && read("idProduct") === "d007"
          && (!options.serial || read("serial") === options.serial)
          && (!options.path || name === options.path)) {
        found.push({ path: name, bus: Number(read("busnum")), address: Number(read("devnum")) });
      }
    } catch (error) { if (!["ENOENT","ENOTDIR"].includes(error.code)) throw error; }
  }
  if (found.length === 0) throw new Error("No Xiaomi Desktop Speaker Pro Set found");
  if (found.length !== 1) throw new Error("Multiple speakers found; set XIAOMI_USB_PATH or XIAOMI_USB_SERIAL");
  return found[0];
}
class UsbTransport {
  constructor(usb, identity) {
    this.trace = [];
    this.identity = identity;
    const matching = usb.getDeviceList().filter(d => d.busNumber === identity.bus && d.deviceAddress === identity.address
      && d.deviceDescriptor.idVendor === 0x2717 && d.deviceDescriptor.idProduct === 0xd007);
    if (matching.length !== 1) throw new Error("USB identity changed before open");
    this.device = matching[0];
    this.device.open();
    this.device.timeout = 1000;
    try {
      if (this.device.configDescriptor.bConfigurationValue !== 1) throw new Error("Unexpected USB configuration");
      this.iface = this.device.interface(4);
      if (this.iface.descriptor.bInterfaceClass !== 3 || this.iface.descriptor.bNumEndpoints !== 0) throw new Error("Unexpected control interface");
      if (this.iface.isKernelDriverActive()) throw new Error("Control interface already has a kernel driver; refusing detach");
      this.iface.claim();
    } catch (error) { this.device.close(); throw error; }
  }
  transfer(type, request, value, data) {
    return new Promise((resolve, reject) => {
      this.device.controlTransfer(type, request, value, 4, data, (error, result) => error ? reject(error) : resolve(result));
    });
  }
  async exchange(report) {
    if (!Buffer.isBuffer(report) || report.length !== 256) throw new Error("Expected exactly 256 output bytes");
    const entry = { time: new Date().toISOString(), output: report.toString("hex") };
    this.trace.push(entry);
    if (this.trace.length > 20) this.trace.shift();
    try { await this.transfer(0x21, 9, 0x0200, report); }
    catch (error) { entry.error = String(error); throw error; }
    let reply;
    try { reply = await this.transfer(0xa1, 1, 0x0100, 256); }
    catch (error) { entry.error = String(error); throw error; }
    entry.input = Buffer.from(reply).toString("hex");
    if (!Buffer.isBuffer(reply) || reply.length !== 256) throw new Error("Short USB input report");
    return reply;
  }
  async close() {
    if (!this.device) return;
    const device = this.device; this.device = null;
    try { await new Promise((resolve, reject) => this.iface.release(false, error => error ? reject(error) : resolve())); }
    finally { device.close(); }
  }
}
module.exports = { findSpeaker, UsbTransport };
