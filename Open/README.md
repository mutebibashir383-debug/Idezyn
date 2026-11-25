# Open
Electron desktop app for iPhone recovery and system repair (Windows and macOS).

## Build installers (recommended)
Push this project to a GitHub repository, open Actions, and run "Build installers".
It produces a Windows `.exe` and macOS `.dmg` files (Apple Silicon and Intel), with the
device tools bundled. A monthly scheduled run rebuilds with the latest tool versions.

## Local development
    npm install
    npm start
Copy the device tools into `resources/bin` first (see the README there).

## Notes
- Windows users need Apple's USB driver (installed with Apple Devices or iTunes).
- Unsigned installers show SmartScreen / Gatekeeper warnings. Distribute signed and notarized builds.

## Before release
- Have a lawyer review the License Agreement and Privacy Policy in `renderer/app.js` (page `P.legal`).
- Set the company name and support email in `renderer/config.js`, and the GitHub owner in `package.json`.
- Sign the installers (Windows code-signing certificate, Apple Developer ID plus notarization).

## Security notes
The renderer is sandboxed with a strict Content-Security-Policy and no Node access. The main process only runs a fixed set of device tools with fixed arguments, accepts calls only from the app's own window, blocks navigation, and logs to the application log folder. Updates are verified by electron-updater from signed release metadata.

## Features added in 1.1.0
DFU guides, firmware downloader with resume and checksum check, iPad and iPod touch, "What's wrong?" wizard, error-code explainer, multi-device list, jobs history with CSV and PDF reports, battery health and storage, WhatsApp/email support with opt-in logs, offline mode and accessibility improvements. The device tools now also include `idevicediagnostics` (the build workflow copies it).

To collect reviews, set `reviewUrl` in `renderer/config.js` to your public review page (for example a Google Business or Trustpilot link). Only real customer feedback should be shown.

## Crash log analysis (1.2.0)
The Crash Logs page reads panic and crash reports with `idevicecrashreport` (read-only: it keeps the reports on the device) or opens saved files, then looks for known patterns. Results are probable causes, not a diagnosis. The build workflow copies the tool.

## Publishing
1. Set your GitHub username in `package.json` (`build.publish.owner`). The app and website derive their addresses from it.
2. Upload the project, then create a release whose tag matches the version in `package.json` with a leading v (for example `v1.3.0`). The workflow builds the `.exe` and `.dmg` and attaches them to the release.
3. Turn on GitHub Pages: repository Settings, Pages, branch `main`, folder `/docs`. The site appears at `https://USERNAME.github.io/open/`.

Open is currently free to use: there is no license check, trial or payment code in the app or website.

## Device tools
Detecting devices and reading Normal Mode details (model, iOS version) use Apple's own service and need no extra tools. Leaving Recovery Mode, backups, updates, restores, battery details and crash logs use the libimobiledevice tools in `resources/bin`. The GitHub workflow bundles them into the installers. When you run `npm start` from source, copy them into `resources/bin` first; the Home page shows a notice while any are missing.

## Support form
The Help page has a message form. Until you set `contactUrl` in `renderer/config.js`, it offers an email chooser (email app, Gmail, Outlook, copy). To receive messages straight to your inbox, create a free form at formspree.io (or web3forms.com), paste its endpoint into `contactUrl` (and the access key into `contactKey` for Web3Forms), and rebuild.

## Tests
`npm test` runs the automated tests (Node 20 or later).
