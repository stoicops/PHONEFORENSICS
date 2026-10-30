# Design decisions

Short records of choices that are not obvious from the code.

## 1. A local web app, not a desktop toolkit

The interface is HTML served by a Python process bound to `127.0.0.1`. MVT is Python, so running it in-process
avoids a second runtime, and a browser gives us accessibility, theming and printing for free. Electron or Tauri
would add a large dependency and a build pipeline for no user-facing gain.

## 2. No front-end build step

The front end is native ES modules, loaded lazily per screen. Types are JSDoc checked by `tsc --checkJs` in strict
mode, which gives TypeScript-level checking without compiling. Shipping the source as-is means a
`git clone` or ZIP download runs unchanged, which is what keeps the "double-click to start" launchers simple.

*Trade-off:* JSDoc is more verbose than `.ts` files. If the front end grows substantially, moving to TypeScript
with a build step committed to CI (not to the repo) would be reasonable.

## 3. Escaped-by-default templating

All markup is produced with the `html` tagged template in `static/js/html.js`, which escapes every interpolated
value. Only developer-written constants are marked `raw()`. This makes it structurally hard for data from MVT,
file names or the user to become HTML. Biome's `noDangerouslySetInnerHtml` rule and unit tests back this up.

## 4. Protecting a localhost server

Any website the user visits can try to talk to `127.0.0.1`. The server therefore:

- refuses requests whose `Host` isn't `localhost`/`127.0.0.1` (DNS rebinding),
- refuses state-changing requests whose `Origin` isn't exactly this app, or that aren't `application/json`
  (CSRF: cross-site pages cannot send JSON without a CORS preflight, which is never approved),
- sends a strict Content Security Policy (`script-src 'self'`, no framing).

Inline `style` attributes are allowed by the CSP (`style-src 'unsafe-inline'`); inline scripts are not.

## 5. Passwords

iPhone backup passwords are passed to MVT through the `MVT_IOS_BACKUP_PASSWORD` environment variable, never on
the command line. MVT's Android commands only accept `--backup-password`, so for Android backups the password is
briefly visible to other local accounts in the process list. It is masked everywhere PhoneForensics shows output
and is never written to disk by PhoneForensics.

## 6. Waitress instead of Flask's development server

Waitress is a pure-Python, production-grade WSGI server that works the same on Windows, macOS and Linux. It runs
with 16 threads because each open progress page holds one thread for its Server-Sent Events stream.

## 7. Dependency pinning and MVT updates

`requirements.lock` (generated with `uv pip compile --universal`) pins every runtime dependency for the launchers
and the in-app updater. MVT is the deliberate exception: **Update now** upgrades it past the lockfile, because new
MVT releases add detection for newly discovered spyware, which matters more here than strict reproducibility.

## 8. Fonts are bundled

Atkinson Hyperlegible is vendored instead of loaded from Google Fonts, so the app keeps its promise that nothing
leaves the computer.

## 9. Meeting MVT's consent condition (MVT License §3.0)

The MVT License only permits use, including through a Larger Work like this app, when the **Data Owner** has
explicitly and freely consented after being informed about the procedure, its privacy implications, and the data
retention and disposal policy. The app cannot verify consent, but it makes the requirement hard to skip and easy
to meet:

- The final wizard step shows the data policy (`DATA_POLICY` in `content.js`) and requires an explicit
  confirmation. The server also refuses a check without `consent: true`.
- The confirmation, its time and the policy version are saved in each check's `case.json`. Bump
  `CONSENT_POLICY_VERSION` in `server.py` whenever the policy text changes.
- Retention is minimised: decrypted backup copies are deleted when the check ends. **Delete this check** removes
  everything else.

MIT was chosen for PhoneForensics' own code as permitted for a Larger Work (§3.3). MVT is never vendored, so
the source-distribution duties in §3.1 and §3.2 do not arise. `NOTICE.md` lists what changes if someone bundles it.
