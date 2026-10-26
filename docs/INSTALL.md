# Installation

## Requirements

- Linux x86-64 with a graphical desktop and an active local login session.
- Node.js 22 or newer, npm and Python 3.
- A powered Xiaomi Desktop Speaker Pro Set (`2717:d007`) and a USB data cable.
- A legitimate copy of Xiaomi C-HUB **2.4.3**.

Install Node and Python through your distribution or their official installers.
`npm ci` downloads the pinned Electron runtime and node-usb dependency. If your
architecture needs to compile node-usb, its native build prerequisites apply;
only Linux x86-64 has been tested here.

## Obtain the original interface

Xiaomi distributes C-HUB through the official application stores, as described
in [its FAQ, Q31](https://www.mi.com/global/support/faq/details/KA-663132/).
The [Microsoft Store listing](https://apps.microsoft.com/detail/9N4FNDFNFCGT)
has product ID `9N4FNDFNFCGT`.

Use either an official 2.4.3.0 Windows `.msix`/`.appx` package or the
`resources/app.asar` file from an installed C-HUB 2.4.3 application. Copy that
file to Linux. The Store's small web installer `.exe` is not an MSIX package and
cannot be imported. This project does not mirror Xiaomi's software or download
it from third-party sites. If the store supplies a newer version, the importer
will reject it until compatibility has been checked.

```bash
git clone https://github.com/up4k73/xiaomi-c-hub-linux.git
cd xiaomi-c-hub-linux
npm ci
python3 scripts/import_renderer.py /path/to/app.asar
```

The importer copies only `out/renderer/`, checks the application name/version,
rejects invalid paths and records SHA-256 hashes in `vendor/manifest.json`.
It does not run the package or extract its main process, updater or firmware.
`vendor/` is ignored by Git. To replace an import, first move the existing
`vendor/` directory aside; the importer never overwrites it.

## USB permissions

Install the rule once as an administrator:

```bash
sudo install -m 0644 packaging/71-xiaomi-c-hub.rules /etc/udev/rules.d/71-xiaomi-c-hub.rules
sudo udevadm control --reload-rules
```

Reconnect the speaker's USB cable after installing the rule. This grants the
active local user access only to the matching USB device. Run the application
as your normal user. The rule relies on a desktop session using udev/logind;
headless sessions may need administrator-managed device permissions.

## Run

```bash
npm start
```

Direct ports and hubs are supported by device discovery. Connect the speaker
after starting the app, or use **Refresh** if the connection changes. Only one
controller process should access the speaker at a time; close the GUI before
using the CLI.

The application saves pre-change state under Electron's user-data directory,
normally `~/.config/xiaomi-c-hub-linux/backups/`. These local JSON files are not
uploaded. Linux audio configuration is independent of this application.

## Optional environment variables

| Variable | Purpose |
| --- | --- |
| `XIAOMI_USB_PATH` | Select a sysfs USB path, for example `1-2.2`, if multiple matching devices exist |
| `XIAOMI_USB_SERIAL` | Filter by a serial number reported in sysfs |
| `XIAOMI_VENDOR_RENDERER` | Absolute path to another imported `out/renderer/index.html` |
| `XIAOMI_USB_MODULE` | Override the node-usb module path for development |
| `XIAOMI_CONTROL_DEMO=1` | Preview with simulated state and no USB access |

The default is to require exactly one matching speaker. A selector never
bypasses the VID/PID or interface checks.

## Uninstall

Close the app, then remove its checkout. Remove the optional udev rule with
`sudo rm /etc/udev/rules.d/71-xiaomi-c-hub.rules` and reload udev rules. Keep or
remove the user-data directory separately. Uninstalling does not revert settings
already stored by the speaker.
