window.ABOUT = {
  changes: [
    { v: '1.4.0', date: 'November 2026', items: [
      'Detect Device turns green and reads “Device detected” as soon as a device is connected, and returns to red when it is removed',
      'Exact model names for iPhones in Normal Mode, read through the Apple Mobile Device service, with a built-in model list that works offline',
      'Apple Devices detection uses several independent checks, so an existing install is no longer reported as missing',
      'Faster Recovery Mode exit, with a clear message when a device tool is missing',
      'iOS System Repair options now follow the connected device and its mode',
      'Email chooser (email app, Gmail, Outlook or copy) and an in-app message form',
      'Clearer, bolder text; double-clicking now highlights only the text you click; round logo and icon with a larger mark',
      'Automated tests for the security rules, firmware downloader, device service client and crash analysis'
    ] },
    { v: '1.3.0', date: 'November 2026', items: [
      'The app is now called Open, with a new logo: a square icon for the app and installers, and a round logo for the website',
      'Footer now shows the real version number'
    ] },
    { v: '1.2.0', date: 'November 2026', items: [
      'Crash Logs analyzer: reads panic and crash reports from a connected device (read-only, nothing is deleted from the device) or from saved files',
      'Checks for battery, storage, power, sensor, Wi-Fi/cellular, camera and software patterns, with confidence levels, repeat counts and a timeline',
      'Verdict with next steps, text export, PDF report and an entry in job history',
      'New “Restarts randomly” route in the What’s wrong? wizard'
    ] },
    { v: '1.1.0', date: 'November 2026', items: [
      'Error code explainer for common restore errors (9, 14, 1015, 3194, 4005, 4013, 4014 and more), with automatic hints after a failed operation',
      'Opt-in “Send details to support” by WhatsApp or email. Device identifiers are left out unless you choose to include them',
      'DFU Mode guides with pictures for every supported device type',
      'Firmware downloader with resume, checksum verification and a free-space check, so installs run from a verified saved file',
      'iPad and iPod touch support in detection, recovery guides and repair',
      '“Leave iOS beta” guide, and a keep-data update offered first in repairs',
      '“What’s wrong?” wizard that recommends the least destructive fix first',
      'Several devices at once: see and choose between connected devices (restores run one at a time for safety)',
      'Jobs & Reports: customer job history, CSV export and branded PDF repair reports',
      'Battery health, charge cycles, storage, IMEI, model number and a warranty-check shortcut',
      'Offline-friendly: detecting and exiting Recovery Mode work without internet, and model names and firmware lists use saved copies',
      'Accessibility: keyboard navigation, screen-reader labels, visible focus and reduced-motion support'
    ] },
    { v: '1.0.0', date: 'First release', items: [
      'Automatic iPhone detection and Recovery Mode guides with pictures',
      'One-click enter and exit Recovery Mode, update and Erase & Restore with live progress',
      'Backup before erase, diagnostics with exportable report, automatic updates',
      'Main screens translated into six languages'
    ] }
  ],
  limits: [
    'It cannot remove iCloud Activation Lock, an Apple ID, MDM or a carrier lock, and it cannot jailbreak.',
    'It cannot recover data that has been erased or data from an iPhone that will not start. Backups only work on an unlocked, trusted iPhone running normally.',
    'It cannot fix hardware faults such as damaged batteries, screens, charging ports, storage or boards. It can only hint that hardware may be the cause.',
    'It can only install iOS versions Apple is still signing, and for now it installs only the newest one. Versions Apple no longer signs cannot be installed.',
    'It cannot press buttons for you. A frozen, dead or locked iPhone must be put into Recovery or DFU Mode by hand.',
    'Restores run one device at a time. Other connected devices can be seen and checked, but disconnect them before restoring.',
    'Battery health, cycles and some details can be unavailable on certain iOS versions.',
    'Warranty status comes from Apple’s website using the serial number. Open opens that page for you but cannot read the result.',
    'Crash log analysis gives probable causes from known patterns, not a certain diagnosis. It can only read devices that start up and are unlocked and trusted, and some reports may be missing.',
    'New iPhone models can need an app update before they are fully supported.',
    'Open has not been tested on every device and iOS version, so results can vary. Apple Devices or iTunes is required on Windows.'
  ]
};
