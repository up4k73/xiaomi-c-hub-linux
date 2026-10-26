# Troubleshooting

## Speaker not found

Power the speaker from its own supply and use a USB data cable. Check
`lsusb -d 2717:d007`. If it is absent, the app cannot control it. Once connected,
select **Refresh**. Bluetooth audio alone does not provide this USB control path.

## USB access denied

Install the rule in the [installation guide](INSTALL.md), reconnect the
speaker's USB cable and launch the app from your active desktop session.
Do not run Electron as root.

## Interface busy or unexpected interface

Close other software that controls the same speaker. The adapter deliberately
does not detach kernel drivers or change USB configuration. A different
interface layout may indicate an unsupported hardware revision.

## A control changed, but success was not confirmed

The write may have reached the speaker even if its reply was lost. The app
stops the connection instead of repeating the write. Use **Refresh** to inspect
the current state before changing anything else. Previous settings are saved
in the user-data `backups/` directory. Backups are not automatically restored.

## Physical button changes do not immediately appear

The interface shows the last confirmed state. Select **Refresh** after using
the speaker's buttons. Repeated UI display updates do not poll the USB device.

## Sound or microphone routing

Choose the speaker in your desktop's audio settings. C-HUB controls the
speaker's internal settings; it does not select the system output/input,
install audio filters or alter PipeWire/PulseAudio configuration.

## Unsupported controls

The original interface still contains firmware, restart and reset controls.
The Linux adapter rejects those commands and shows a status message. A
six-value EQ request is also rejected: B03 requires all ten values. Refresh
the state before trying the EQ again.

## Import or startup problems

The importer currently accepts only C-HUB 2.4.3. An `.exe` Store bootstrapper is
not the application package. Missing shared-library errors at launch require
your distribution's Electron/Chromium desktop runtime dependencies. Do not
disable the Chromium sandbox to bypass a system setup problem.

For a bug report include the application version, distribution, desktop,
USB VID/PID, connection type and exact error. Remove personal paths and serial
numbers from logs. Never attach the proprietary vendor package.
