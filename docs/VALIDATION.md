# Compatibility and validation

Hardware observations recorded on 26–27 October 2026:

| Check | Result |
| --- | --- |
| Direct USB, brightness 10 → 9 → 10 | Echo and independent readback matched |
| Direct USB, RGB on → off → on | Echo and independent readback matched |
| Direct USB, EQ first band 6 → 5 → 6 | Other nine bands unchanged; full original state restored |
| Original interface RGB switch, direct USB | Real setting changed and original state restored |
| Original interface RGB switch, Genesys Logic hub | Real setting changed and original state restored |
| Shared hub peripherals during the RGB check | USB addresses unchanged; audio playback continued |

Hardware: Xiaomi Desktop Speaker Pro Set `2717:d007`, B03; Debian 13 / KDE X11,
Linux 6.12.113, x86-64. Hub: Genesys Logic `05e3:0610`. C-HUB interface version
2.4.3, Electron 36.8.1, node-usb 2.16.0.

These are bounded checks on one hardware setup. They do not establish
power-loss persistence, universal hub compatibility, long-duration stability,
microphone quality or room-response calibration. Other setting controls have
not all received real-device round-trip tests. Other models and platforms are
untested.

Automated tests cover report sizes/setup, TLV parsing, malformed replies,
echo/readback disagreement, no automatic retry, backup failures, EQ length,
channel selection, cached renderer queries, device selection and renderer
import boundaries. They use synthetic devices and packages. An optional GUI
smoke test exercises the imported original interface with simulated state;
it is not hardware validation.
