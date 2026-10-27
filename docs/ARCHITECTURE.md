# Architecture

```text
Original Xiaomi renderer (verified and cached on first launch)
    ↕ allowlisted IPC
official-preload.cjs → main.cjs → renderer-bridge.cjs
                                    ↓
                               control.cjs
                                    ↓
                         protocol.cjs / usb-transport.cjs
                                    ↓
                         USB interface 4 → speaker
```

`protocol.cjs` builds and validates frames and setting bounds. `control.cjs`
serializes operations and requires backups, echoed acknowledgements and state
readback. `usb-transport.cjs` locates the exact USB identity in cached sysfs
metadata, then claims only the vendor interface.

`renderer-bridge.cjs` translates the original interface's requests into this
bounded controller. The original main process, updater and preload are not
loaded. The new preload exposes only the IPC channels needed by the renderer.
Node integration is disabled, context isolation and the renderer sandbox are
enabled, and HTTP(S) requests/new windows are blocked.

Unplug detection reads cached kernel metadata every two seconds. It does not
probe USB devices. A manual refresh reconnects and rereads state. Preview uses
an in-memory transport and never loads node-usb. The CLI shares the protocol,
controller and transport without requiring Electron or the vendor renderer.

vendor-bootstrap.cjs retrieves the pinned interface from Microsoft using a
bounded HTTP range request and verifies it before extraction. Native desktop
packages include Electron and production dependencies, so setup requires no
development tools. A small progress window closes when the original UI is ready.
