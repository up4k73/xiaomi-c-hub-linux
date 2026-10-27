#!/bin/sh
set -eu
if [ "$(id -u)" != 0 ]; then
    echo "Administrator authorization is required." >&2
    exit 1
fi
rule=/etc/udev/rules.d/71-xiaomi-c-hub-linux.rules
if [ -e "$rule" ]; then
    existing_rule=$(cat "$rule")
    expected_rule='SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="2717", ATTR{idProduct}=="d007", TAG+="uaccess"'
    if [ "$existing_rule" != "$expected_rule" ]; then
        cp -p "$rule" "$rule.backup-$(date +%Y%m%d%H%M%S)"
    fi
fi
install -d -m 0755 /etc/udev/rules.d
cat > "$rule" <<'RULE'
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="2717", ATTR{idProduct}=="d007", TAG+="uaccess"
RULE
chmod 0644 "$rule"
udevadm control --reload-rules
udevadm trigger --action=change --subsystem-match=usb --attr-match=idVendor=2717 --attr-match=idProduct=d007
udevadm settle --timeout=10
