# USB settings protocol

This describes the normal B03 settings path observed in Xiaomi C-HUB 2.4.3
and checked against a Xiaomi Desktop Speaker Pro Set. It is not a firmware
update specification. Transfer layout was cross-checked against the vendor's
macOS branch and real-device replies.

## Transport

| Field | Value |
| --- | --- |
| USB vendor/product | `2717:d007` |
| Configuration | Must already be `1`; never changed by this application |
| Interface | `4`, HID class, zero interrupt endpoints |
| Endpoint | Control endpoint 0 |
| OUT | `bmRequestType=0x21`, `bRequest=9`, `wValue=0x0200`, `wIndex=4` |
| IN | `bmRequestType=0xa1`, `bRequest=1`, `wValue=0x0100`, `wIndex=4` |
| Report length | Exactly 256 bytes in both directions |
| Timeout | 1000 ms per transfer, chosen by the application |
| Observed device speed | USB full speed, 12 Mbit/s; not changed by the application |

The report ID is zero in `wValue`. Do not prepend a HIDAPI report-ID byte to
the control-transfer payload. OUT is zero-padded to 256 bytes. Each OUT is
followed by one IN; transactions are serialized. The audio interfaces remain
owned by the kernel. An active driver on interface 4 causes an error rather
than automatic detachment.

## Frames and verification

```text
A5 5A FC length command operation payload... 16
State query:   A5 5A FC 03 70 03 00 16
RGB enabled:   A5 5A FC 03 34 02 01 16
Brightness 9:  A5 5A FC 03 31 02 09 16
```

Operation `02` sets a value; `03` reads. A write reply echoes the command,
operation and complete requested payload. Its first payload byte is **not** a
zero-on-success status. After validating the echo, the adapter performs a
separate `0x70` state query and compares the requested setting.

State contains key/length/value fields. State frame length bytes can
under-report the complete body; the decoder validates every TLV through the
final terminator after zero padding. It does not scan inside field values for
`0x16`, because a legitimate value can also be 22. Unknown fields are retained.

A change first reads the current state, writes a backup, sends the setting,
checks the echo, then reads it back. Failure stops that connection. There are
no automatic retries, USB resets or firmware commands.

## Settings

CLI values are raw protocol units. Boolean settings take JSON `true`/`false`.

| Name | Command | Values |
| --- | --- | --- |
| `rgb` | `34` | Boolean |
| `brightness` | `31` | 0–10 |
| `effect` | `30` | 1–6 |
| `volume` | `74` | 0–16 |
| `soundMode` | `40` | 0–4: Music, Bass, Vocal, Game, Movie |
| `lightPrompts`, `soundPrompts` | `32`, `41` | Boolean |
| `eq` | `8c` | Exactly ten integers, 0–12 representing −6 to +6 dB |
| `sleepEnabled`, `standbyEnabled` | `80`, `83` | Boolean |
| `sleepMinutes`, `standbyMinutes` | `81`, `84` | 2–45 minutes |
| `channel` | `85` | 0–3: USB, Bluetooth, AUX, mixed |
| `channelPrompts` | `86` | Boolean |
| `channelPromptVolume` | `87` | 0–2 |
| `powerPrompts`, `mixedInput` | `8e`, `8f` | Boolean |

EQ centers: 31, 63, 125, 250, 500 Hz, 1, 2, 4, 8, 16 kHz. The first two bands
require subwoofer-connected state `0x79=1`. All ten values must be sent, even
when changing one band. Channel readback uses a four-element state field: the
selected index must contain `2`.

The renderer bridge supplies the stock interface with its expected TLV length
and EQ value count. Repeated UI queries read the last confirmed cache; the
Refresh button performs a physical read. A stock UI success reply is generated
only after the real exchange and readback succeed.
