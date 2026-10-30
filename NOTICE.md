# Licensing and third-party notices

## PhoneForensics

Copyright © 2026 Surinder Lall. The code in this repository is licensed under the MIT License (see
[`LICENSE`](LICENSE)), **except** for the third-party material listed below, which keeps its own license.

## Mobile Verification Toolkit (MVT)

PhoneForensics runs the [Mobile Verification Toolkit](https://github.com/mvt-project/mvt), developed by
Amnesty International's Security Lab and its contributors.

- **MVT is not included in this repository.** It is installed separately from PyPI (`pip install mvt`) by the
  launchers and the in-app updater, and PhoneForensics runs it as a separate program.
- **MVT is governed by the MVT License, version 1.1, not by the MIT License.** An unmodified copy is in
  [`LICENSES/MVT-License-1.1.txt`](LICENSES/MVT-License-1.1.txt) and online at <https://license.mvt.re/1.1/>.
  MVT's source code is available at <https://github.com/mvt-project/mvt>.
- PhoneForensics is a **"Larger Work"** as defined in §1.7 of the MVT License. §3.3 allows a Larger Work to be
  distributed under terms of its author's choice (here, MIT), provided the requirements of the MVT License are
  still met for MVT itself. The MIT License does not grant, change or restrict any rights in MVT.

### Consent is a condition of use (MVT License §3.0)

The MVT License applies to **any use of PhoneForensics to analyse a device**, because §3.0 covers use of
"Covered Software or of a Larger Work":

> Use of Covered Software or of a Larger Work is permitted provided that the Data Owner must explicitly consent
> to the procedure, free from any form of coercion, and must be fully informed about the nature of the procedure,
> its privacy implications, and any data retention and disposal policy.

The "Data Owner" is the person or people who used the device and whose data is analysed (§1.17). That may be
someone other than the person who owns the device (§1.16). Under §5.1, using the software without meeting this
condition ends your rights under the MVT License.

PhoneForensics supports this condition in the app:

- Before every check, it shows what the check looks at, its privacy implications, what is kept and for how long,
  and how to delete it. It will not start until the user confirms that the Data Owner was informed and freely agreed.
- The confirmation is recorded with each check (`case.json` → `consent`).
- Results stay on the computer until the user deletes them with **Delete this check**. Decrypted copies of
  encrypted backups are deleted as soon as the check ends.

**The app cannot verify consent.** Whoever runs a check is responsible for obtaining it, and for complying with the
law where they are.

### If you redistribute PhoneForensics with MVT included

Today PhoneForensics does not distribute MVT. If you build an installer or bundle that **includes** MVT (for
example a PyInstaller app), the MVT License requires you to:

1. Keep MVT under the MVT License 1.1, tell recipients that, and tell them how to get a copy of the license
   (§3.1). Include [`LICENSES/MVT-License-1.1.txt`](LICENSES/MVT-License-1.1.txt).
2. Make MVT's source code available and tell recipients how to get it, at no more than the cost of distribution
   (§3.2(a)). Linking to <https://github.com/mvt-project/mvt> for the exact version bundled meets this.
3. Not remove or change MVT's license, copyright, warranty or liability notices (§3.4).
4. Keep this consent condition and these notices with your distribution.

### Name and trademarks (MVT License §2.3)

The MVT License grants no rights in the trademarks, service marks or logos of its contributors. PhoneForensics
uses the name "MVT" only to describe what it is built on, uses no MVT or Amnesty International logos, and is
**not affiliated with or endorsed by Amnesty International or the MVT project**.

### Warranty and liability

MVT is provided "as is", without warranty, and its contributors accept no liability (MVT License §6 and §7).
PhoneForensics is likewise provided without warranty under the MIT License. Neither PhoneForensics nor its
author offers any warranty, support or liability on behalf of MVT's contributors (§3.5).

## Threat indicators

Indicators of compromise are downloaded at runtime from
[mvt-project/mvt-indicators](https://github.com/mvt-project/mvt-indicators) and the sources listed there. Each
source keeps its own license and attribution. They are not included in this repository.

## Fonts

`src/phoneforensics/static/fonts/` contains Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono
(© The Atkinson Hyperlegible Project Authors), licensed under the SIL Open Font License 1.1
([`LICENSES/OFL-1.1.txt`](LICENSES/OFL-1.1.txt)). They are bundled so the app makes no third-party requests.

## Other runtime dependencies

Installed from PyPI, not included in this repository:

- [Flask](https://flask.palletsprojects.com/): BSD-3-Clause
- [Waitress](https://docs.pylonsproject.org/projects/waitress/): ZPL 2.1
- [packaging](https://github.com/pypa/packaging): Apache-2.0 or BSD-2-Clause

Exact versions are pinned in `requirements.lock`. Development-only tools (pytest, Ruff, mypy, Biome, TypeScript,
Playwright, axe-core) are not distributed with the app.

---

*This notice explains how PhoneForensics is set up to respect the MVT License. It is not legal advice. If you
plan to redistribute or commercialise PhoneForensics, have the MVT License reviewed by a lawyer.*
