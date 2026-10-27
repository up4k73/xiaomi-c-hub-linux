# Installation

## Ready-made packages

Download an [AppImage or Debian/Ubuntu package](https://github.com/up4k73/xiaomi-c-hub-linux/releases/latest).
The native Linux Electron runtime and USB adapter are included.

- **AppImage:** allow execution in the file manager if required, then open it.
- **Debian/Ubuntu:** open the .deb with your software installer and launch the app from the application menu.
- **Portable archive:** extract it and open the xiaomi-c-hub-linux executable.

The first launch downloads the pinned original interface directly from Microsoft
(about 40 MB), checks the archive and every renderer asset, and caches the result.
No Windows installation, Node.js, npm or separate Xiaomi download is needed.
After setup, the app can use the cached interface without network access.

Packages target Linux x86-64. Electron still needs the desktop libraries supplied
by your distribution; the .deb declares these dependencies for the package manager.
If your distribution restricts AppImage execution or Chromium user namespaces,
use the Debian/Ubuntu installer where applicable. The app does not disable the
Chromium sandbox.

## USB access

The .deb configures a narrowly matched udev rule during installation.
Portable builds show **Enable USB access** when access is denied. Select it and
authorize the system prompt. It installs the same rule and refreshes the
matching speaker's permissions. It does not reset the USB controller, detach
drivers or grant access to unrelated devices.

If your desktop does not provide pkexec/PolicyKit, an administrator can install
the rule from the source distribution:

~~~bash
sudo install -m 0644 packaging/71-xiaomi-c-hub.rules /etc/udev/rules.d/71-xiaomi-c-hub-linux.rules
sudo udevadm control --reload-rules
~~~

Reconnect only the speaker's USB cable after manual rule installation.

## Daily use

Power the speaker from its own supply and connect a USB data cable.
Use **Refresh** after connecting the device or changing settings with its
physical buttons. Close other controller applications before using this one.

Pre-change settings are saved under the application's user-data directory,
normally ~/.config/xiaomi-c-hub-linux/backups/. The downloaded interface is
under the same directory in vendor/2.4.3/. The app does not upload these files.

## Developer configuration

| Variable | Purpose |
| --- | --- |
| XIAOMI_USB_PATH | Select a sysfs USB path when several matching speakers exist |
| XIAOMI_USB_SERIAL | Filter by a serial reported in sysfs |
| XIAOMI_VENDOR_RENDERER | Absolute path to an already extracted renderer index.html |
| XIAOMI_USB_MODULE | Override the node-usb module path for development |
| XIAOMI_CONTROL_DEMO=1 | Simulated preview without USB access |

Manual import remains available for development or an offline machine where
you already possess the official package:

~~~bash
python3 scripts/import_renderer.py /path/to/Xiaomi-C-HUB.msix
npm start
~~~

The importer accepts C-HUB 2.4.3 MSIX, APPX or app.asar, copies only the renderer,
and refuses to overwrite an existing destination.

## Uninstall

Remove the .deb through the package manager, or delete the portable download.
The user-data directory remains so settings backups and cached interface files
are preserved. Remove it separately if desired. Speaker settings already
written to the device are not reverted by uninstalling the application.
