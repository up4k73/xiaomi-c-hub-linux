"use strict";

const {execFile} = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const {promisify} = require("node:util");

const execute = promisify(execFile);
const minGainDb = -60;
const maxGainDb = 0;

class MicrophoneControl {
  constructor(identity, {sysRoot = "/sys/bus/usb/devices", run = execute} = {}) {
    this.identity = identity;
    this.sysRoot = sysRoot;
    this.run = run;
  }

  async mixer(args) {
    const {path: usbPath, bus, address} = this.identity;
    const device = path.join(this.sysRoot, usbPath);
    const read = async name => (await fs.readFile(path.join(device, name), "utf8")).trim();
    let cards;
    try {
      const [vendor, product, busnum, devnum] = await Promise.all(
        ["idVendor", "idProduct", "busnum", "devnum"].map(read)
      );
      if (vendor !== "2717" || product !== "d007" || Number(busnum) !== bus || Number(devnum) !== address) {
        throw new Error("USB device changed");
      }
      const sound = path.join(this.sysRoot, `${usbPath}:1.0`, "sound");
      cards = (await fs.readdir(sound)).filter(name => /^card\d+$/.test(name));
    } catch (error) {
      throw new Error("Микрофон Xiaomi отключён. Подключи колонку и нажми «Обновить».", {cause:error});
    }
    if (cards.length !== 1) throw new Error("Не найден однозначный вход Xiaomi в ALSA.");

    try {
      const {stdout} = await this.run("amixer", ["-D", `hw:${cards[0].slice(4)}`, ...args], {
        env: {...process.env, LC_ALL:"C"}, timeout:3000, maxBuffer:16384
      });
      return stdout;
    } catch (error) {
      const message = error.code === "ENOENT" ? "Для управления микрофоном установи пакет alsa-utils."
        : "Не удалось обратиться к микрофону Xiaomi через ALSA.";
      throw new Error(message, {cause:error});
    }
  }

  async read() {
    const text = await this.mixer(["sget", "Mic"]);
    const range = /^\s*Limits: Capture 0 - 120$/m.test(text);
    const capture = /^\s*Mono: Capture (\d+) \[\d+%\] \[(-?\d+(?:\.\d+)?)dB\] \[(on|off)\]$/m.exec(text);
    if (!range || !capture) throw new Error("Этот вход Xiaomi не предоставил уровень и выключатель микрофона.");

    const gainDb = Number(capture[2]);
    if (gainDb < minGainDb || gainDb > maxGainDb || (gainDb-minGainDb)*2 !== Number(capture[1])) {
      throw new Error("Xiaomi вернула неожиданный диапазон уровня микрофона.");
    }
    return {gainDb, enabled:capture[3] === "on"};
  }

  async set(setting, value, saveBackup) {
    let control;
    let encoded;
    if (setting === "gainDb" && typeof value === "number" && Number.isInteger(value * 2)
        && value >= minGainDb && value <= maxGainDb) {
      control = "Mic Capture Volume";
      encoded = String((value-minGainDb)*2);
    } else if (setting === "enabled" && typeof value === "boolean") {
      control = "Mic Capture Switch";
      encoded = value ? "on" : "off";
    } else {
      throw new Error("Недопустимая настройка микрофона.");
    }

    const before = await this.read();
    if (before[setting] === value) return before;
    await saveBackup(before, {setting:setting === "gainDb" ? "mic-level" : "mic-switch", value});
    await this.mixer(["cset", `name='${control}'`, encoded]);
    const after = await this.read();
    if (after[setting] !== value) throw new Error("Микрофон не подтвердил настройку. Открой панель снова для чтения.");
    return after;
  }
}

module.exports = {MicrophoneControl};
