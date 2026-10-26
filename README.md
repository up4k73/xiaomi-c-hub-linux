# Xiaomi C-HUB for Linux

Control the **Xiaomi Desktop Speaker Pro Set** from Linux using the original
C-HUB interface: lighting, sound modes, equalizer, volume and input selection.

[Русский](README.ru.md) · [Installation](docs/INSTALL.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Protocol](docs/PROTOCOL.md)

![The original C-HUB lighting controls running on Linux](docs/images/lighting.png)

This independent adapter runs the original interface in native Linux Electron
and handles USB communication locally. It is not an official Xiaomi release.
The Xiaomi interface is imported from your own official package and is not
included in this repository.

## Features

- RGB on/off, brightness and lighting effects.
- Sound modes and ten-band graphic EQ.
- Speaker volume, USB/Bluetooth/AUX selection and mixed input.
- Speaker sleep/standby timers and notification sounds.
- Command-line access with JSON output and pre-change backups.

Changes are acknowledged by the speaker and read back before the interface
reports success. Firmware updates, factory reset and device restart are not
supported. Audio playback and microphone routing remain managed by Linux.

## Quick start

Requires Linux, Node.js 22+, npm, Python 3, and the official **C-HUB 2.4.3**
package (`.msix`, `.appx` or `app.asar`). See [installation](docs/INSTALL.md) for
obtaining the interface and granting USB access.

```bash
git clone https://github.com/up4k73/xiaomi-c-hub-linux.git
cd xiaomi-c-hub-linux
npm ci
python3 scripts/import_renderer.py /path/to/Xiaomi-C-HUB.msix
npm start
```

Connect the powered speaker by a USB data cable. If it was connected after
startup, select **Refresh** in the bottom status bar. The same button rereads
changes made with physical speaker controls.

## Compatibility

| Component | Tested configuration |
| --- | --- |
| Speaker | Xiaomi Desktop Speaker Pro Set, USB `2717:d007`, B03 |
| Desktop | Debian 13, KDE Plasma on X11, x86-64 |
| Connection | Direct USB and a Genesys Logic USB hub |
| Interface | Xiaomi C-HUB 2.4.3, Windows package 2.4.3.0 |
| Runtime | Electron 36.8.1, node-usb 2.16.0 |

RGB, brightness and EQ were verified on hardware, including an RGB round trip
through the hub using the original interface. Other controls have protocol and
offline coverage; they have not all been exercised on hardware. Other speaker
models, Wayland and ARM are untested. See [validation](docs/VALIDATION.md).

## Command line

Close the GUI before opening the same device from the CLI.

```bash
npm run speaker -- read
npm run speaker -- rgb off rgb-change.json
npm run speaker -- set brightness 5 brightness-change.json
```

Writes require a new output filename. A `.before.json` file preserves the
previous settings; `.trace.json` records the exchange. Paths are never
overwritten. See the [setting reference](docs/PROTOCOL.md#settings).

## Development

```bash
npm test
npm run preview
```

Tests use synthetic replies and archives, without USB hardware or vendor files.
Preview requires an imported interface but never opens a USB device. Its status
bar identifies it as a preview. [Contributing](CONTRIBUTING.md) describes the
optional GUI smoke test.

## License

The adapter is [MIT licensed](LICENSE). Xiaomi's interface, branding and assets
remain under their respective terms; they are not covered by the MIT license.
See [NOTICE](NOTICE.md).
