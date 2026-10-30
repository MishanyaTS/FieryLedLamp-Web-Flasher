# Local flashing dependencies

These are the same pinned versions previously loaded from CDNs. They are loaded only when flashing starts, after the browser's serial-port picker has been requested. No firmware images, partition offsets, SPI settings, baud rate, reset sequence or backup algorithm were changed by the loading optimization.

| File | Version | Source | SHA-256 |
| --- | --- | --- | --- |
| `esptool-js-0.6.1/bundle.js` | 0.6.1 | `https://registry.npmjs.org/esptool-js/0.6.1` | `ef7d5a237d3f273ecf546bcee65dddad90bd82cf02f22a980d1537e0cd79a152` |
| `jszip-3.10.1/jszip.min.js` | 3.10.1 | `https://registry.npmjs.org/jszip/3.10.1` | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

The downloaded npm tarballs were checked against the registry's SHA-512 integrity values. Distribution files remain unchanged. Original package metadata and license files are retained beside each bundle. Additional license texts for esptool-js dependencies are in `esptool-js-0.6.1/THIRD_PARTY_LICENSES.txt`.

The esptool browser bundle is self-contained: it has no runtime `fetch`, dynamic imports or external module dependencies. JSZip still checks ZIP CRC32, as before.
