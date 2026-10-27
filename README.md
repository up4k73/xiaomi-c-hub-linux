# Xiaomi C-HUB for Linux

Control **Xiaomi Desktop Speaker Pro Set** lighting, sound modes, EQ, volume
and inputs from Linux, using the original C-HUB interface.

[Русский](README.ru.md) · [Installation](docs/INSTALL.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)

![C-HUB running on Linux](docs/images/lighting.png)

## Download

| Package | Use |
| --- | --- |
| [**AppImage — Linux x86-64**](https://github.com/up4k73/xiaomi-c-hub-linux/releases/latest/download/Xiaomi-C-HUB-Linux-x86_64.AppImage) | Download and run. Allow execution in your file manager if prompted. |
| [**Debian / Ubuntu installer**](https://github.com/up4k73/xiaomi-c-hub-linux/releases/latest/download/xiaomi-c-hub-linux_amd64.deb) | Open with your software installer, then launch Xiaomi C-HUB for Linux from the application menu. |
| [Portable archive](https://github.com/up4k73/xiaomi-c-hub-linux/releases/latest/download/xiaomi-c-hub-linux-x86_64.tar.gz) | Extract and run the included xiaomi-c-hub-linux executable. |

**No Node.js, npm, Windows or manual package extraction is needed for these downloads.**

The first launch automatically retrieves about **40 MB** of official interface
files directly from Microsoft, verifies them and opens the app. Internet is
needed for this one-time setup. The downloaded interface is cached locally
for later offline use.

Connect the powered speaker with a USB data cable. Debian/Ubuntu installation
sets up device access. With a portable package, use **Enable USB access** if
the app asks for authorization. That button configures access only for this
speaker model.

## Features

- RGB on/off, brightness and lighting effects.
- Sound modes and ten-band graphic EQ.
- Speaker volume, USB/Bluetooth/AUX selection and mixed input.
- Speaker sleep/standby timers and notification sounds.
- Pre-change backups and a command-line interface.

Changes are acknowledged and read back from the speaker before success is
reported. **Refresh** rereads settings after reconnecting the device or using
its physical buttons. Firmware updates, factory reset and device restart are
not supported. Linux continues to manage audio playback and microphone routing.

## Compatibility

| Component | Tested configuration |
| --- | --- |
| Speaker | Xiaomi Desktop Speaker Pro Set, USB 2717:d007, B03 |
| Desktop | Debian 13 / KDE X11, x86-64 |
| Connection | Direct USB and a Genesys Logic USB hub |
| Interface | Xiaomi C-HUB 2.4.3 |
| Runtime | Electron 36.8.1, node-usb 2.16.0 |

RGB, brightness and EQ were checked on hardware; the original RGB control was
also checked through a hub. Other settings have not all been exercised on
hardware. Other models, Wayland and ARM are untested. [Validation details](docs/VALIDATION.md).

## Build from source

For developers: Node.js 22+, npm and Python 3 are required.

~~~bash
git clone https://github.com/up4k73/xiaomi-c-hub-linux.git
cd xiaomi-c-hub-linux
npm ci
npm test
npm run package
~~~

The build produces AppImage, .deb and portable .tar.gz files in **dist/**.
It downloads and verifies the pinned build tools automatically. Debian package
creation requires dpkg-deb. See [sources and packaging](docs/SOURCES.md).

For development, **npm start** runs the app and performs the same automatic
interface setup. **npm run preview** uses simulated speaker state and never
opens USB. The preview still needs the interface on its first launch.

## Command line

Close the GUI before opening the device from the CLI.

~~~bash
npm run speaker -- read
npm run speaker -- rgb off rgb-change.json
npm run speaker -- set brightness 5 brightness-change.json
~~~

Writes require a new output filename and create pre-change and trace sidecars.
[Protocol and setting reference](docs/PROTOCOL.md).

## License

Independent project, not an official Xiaomi release. The adapter is
[MIT licensed](LICENSE). Xiaomi's interface and assets retain their own rights
and are retrieved from Microsoft on the user's machine.
[Third-party notices](NOTICE.md).
