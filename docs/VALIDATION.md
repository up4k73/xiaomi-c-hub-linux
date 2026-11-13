# Compatibility and validation

## B03 DSP candidate 0.3.0 — 13 November 2026

The tested `2717:d007` reports BP15 `B5 0.9.1` and C-HUB firmware major 50.
The editor read both built-in graphs, 37 effect blocks and 510 effect
parameters. Analog sensitivity, AEC and the microphone expander were changed
through the GUI and read back from the device, then restored. The AppImage
ran natively on the same speaker and passed the expander on/off round trip.
The native test used the verified local C-HUB 2.4.3 renderer. The existing
bootstrap/import tests passed. The Debian package and portable archive were
built and their SHA-256 hashes were checked.

On repeated quiet speech, switching off the mic expander at its initial
−45 dB threshold raised whole-capture RMS by about 15 dB and reduced exact
zero samples from 30.61% to 0.64%. The AEC register round trip passed. The
playback experiment did not establish an improvement in echo suppression.
Other expert parameters are read and range-checked using the live catalog.
They have not each been exercised by a separate acoustic test.

## Desktop packages 0.2.0

The actual AppImage passed first launch with an empty profile, automatic retrieval
and verification of the official interface, and an original-interface RGB round
trip using simulated speaker state. A second launch passed with network access
blocked. Native AppImage/FUSE launch also passed without extraction flags.

The packaged native USB module loaded successfully. The .deb payload was compared
with the tested application, including its sandbox-helper mode and device rule.
The permission helper was executed in an isolated root/filesystem namespace with
udev calls recorded by a fixture: only the exact 2717:d007 device selector was used.
No live USB devices were accessed by these packaging checks.

The USB transport is unchanged from the hardware-tested baseline below. These
packaging checks do not constitute new hardware or firmware validation.

## Hardware baseline

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
