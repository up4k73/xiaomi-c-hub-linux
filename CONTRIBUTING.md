# Contributing

Keep protocol framing, state verification and renderer compatibility separate.
Run `npm test` before submitting changes. Tests require Node 22+ and Python 3;
they need neither vendor assets nor a connected speaker.

After importing the supported renderer, an optional GUI smoke test can run
under Xvfb:

```bash
mkdir -p artifacts
XIAOMI_CONTROL_DEMO=1 XIAOMI_DEMO_CHECK="$PWD/artifacts/gui" xvfb-run -a npm start
```

It clicks the original RGB switch twice, verifies simulated state restoration
and writes a JSON result and screenshot. Preview is explicitly labeled and
never opens USB. On a shared test machine, isolate `/dev` and network access
with a container or bubblewrap as an additional boundary.

Changes to transport behavior need a targeted test for the failure they fix.
Hardware results should name the model, VID/PID, environment, connection and
actual readback. Preserve the initial settings. Do not infer hardware success
from a mock, UI click or write acknowledgement alone.

Do not add USB/controller resets, kernel-driver detachment, firmware operations
or automatic write retries to error handling. Keep Xiaomi binaries, imported
assets, recordings, credentials and personal logs out of contributions.
