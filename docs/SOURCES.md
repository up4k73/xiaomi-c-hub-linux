# Sources and reproducible inputs

The application combines this repository's USB/IPC adapter, native Linux
Electron and the original Xiaomi renderer. It does not run the Windows
application, its main process, updater or firmware tools.

## Pinned inputs

- **Xiaomi C-HUB 2.4.3**, Windows package 2.4.3.0, Microsoft Store product
  [9N4FNDFNFCGT](https://apps.microsoft.com/detail/9N4FNDFNFCGT).
- **Electron 36.8.1**, official Linux x64 archive from the Electron project.
- **node-usb 2.16.0**, locked through package-lock.json.
- **AppImage build tool and runtime**, URLs and SHA-256 digests in packaging/toolchain.json.

The original Microsoft package SHA-256 is:

~~~text
9c4124e0823a7411aa29cb4eb2b70b58f1f7678897e575a75e152d0c924fa143
~~~

vendor-source.json records its immutable Windows Update identity, exact
ASAR ZIP-entry offset and length, compressed/uncompressed SHA-256 hashes,
and the hashes of all 44 renderer files. On first launch the app requests a
fresh Microsoft CDN URL for that identity and retrieves only the necessary
archive section, instead of the entire 356 MB Windows package.

TLS verification is enabled for the Microsoft metadata endpoint. Microsoft's
returned public CDN URL can use HTTP; the exact compressed section must match
its pinned SHA-256 before it is unpacked. No account credentials are sent to
the CDN. The Microsoft Update certificate chain is used only for the metadata
endpoint and is not installed into the system trust store. The chain contains
Microsoft's Update Secure Server CA 2.1
and Root Certificate Authority 2011. Microsoft's published root certificate is
available from its [PKI endpoint](https://www.microsoft.com/pki/certs/MicRooCerAut2011_2011_03_22.crt).

The bootstrap validates the compressed section, the ASAR archive and each
copied asset. Only the renderer is retained; the temporary archive is removed.
A different version or unexpected digest is rejected.

## Build

On Linux x86-64 with Node 22+, npm, Python 3 and dpkg-deb:

~~~bash
npm ci
npm test
npm run package
~~~

Outputs in dist/ are the AppImage, .deb, portable .tar.gz and SHA256SUMS.
The build script downloads and verifies the pinned toolchain. The AppImage
upstream URLs use their continuous release; if those assets are replaced,
the checksum check intentionally stops the build until the toolchain lock is
reviewed and updated. Cached matching inputs remain usable.

The .deb installs device permissions and a root-owned Chromium sandbox helper.
Portable builds use the distribution's supported sandbox facilities. No
--no-sandbox flag is added.

The Microsoft retrieval request format was informed by
[ms-store-download](https://github.com/Dj0ulo/ms-store-download); its MIT notice
is retained under packaging/licenses/.
