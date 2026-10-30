// Fixed, developer-written content. Markup here is trusted and wrapped in raw().

import { raw } from "./html.js";

/** @typedef {import("./api.js").ScanType} ScanType */
/** @typedef {import("./html.js").SafeHtml} SafeHtml */
/** @typedef {readonly [title: string, text: SafeHtml]} Step */

export const LINKS = Object.freeze({
  accessNow: "https://www.accessnow.org/help/",
  amnesty: "https://securitylab.amnesty.org/get-help/",
  mvtDocs: "https://docs.mvt.re",
  mvtRepo: "https://github.com/mvt-project/mvt",
  mvtLicense: "https://license.mvt.re/1.1/",
  androidqf: "https://github.com/mvt-project/androidqf/releases",
});

const link = (/** @type {string} */ href, /** @type {string} */ text) =>
  `<a class="pf-link" href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

/** @type {Readonly<Record<ScanType, string>>} */
export const TYPE_NAMES = Object.freeze({
  "ios-backup": "iPhone backup",
  "ios-fs": "iPhone file copy",
  "android-qf": "AndroidQF collection",
  "android-bugreport": "Android report",
  "android-backup": "Android backup",
});

/**
 * @typedef {{ type: ScanType, icon: string, title: string, description: string, recommended?: boolean,
 *   heading: string, steps: readonly Step[], pick: "folder" | "file" | "any", where: string,
 *   password?: readonly [label: string, help: string], guides: readonly string[] }} Evidence
 */

/** @type {Readonly<Record<"iphone" | "android", readonly Evidence[]>>} */
export const EVIDENCE = Object.freeze({
  iphone: [
    {
      type: "ios-backup",
      icon: "save",
      title: "iPhone backup",
      recommended: true,
      description: "Made with Finder on a Mac, or Apple Devices or iTunes on Windows.",
      heading: "Make an iPhone backup",
      steps: [
        ["Connect the iPhone with a cable", raw("When the phone asks, tap <b>Trust</b>.")],
        [
          "Open Finder or Apple Devices",
          raw(
            "On a Mac, open <b>Finder</b> and click the iPhone in the sidebar. On Windows, open <b>Apple Devices</b> or <b>iTunes</b>.",
          ),
        ],
        [
          'Tick "Encrypt local backup"',
          raw("Choose a password you will remember. Encrypted backups let us check much more."),
        ],
        ['Click "Back Up Now" and wait', raw("Come back here when it has finished.")],
      ],
      pick: "folder",
      where: "Where is the backup?",
      password: ["Backup password", 'Only if you ticked "Encrypt local backup". It is used on this computer only.'],
      guides: ["iphone-mac", "iphone-windows"],
    },
    {
      type: "ios-fs",
      icon: "box",
      title: "Full copy of the phone's files",
      description: "For experts only. Usually made with specialist tools.",
      heading: "Choose the file copy",
      steps: [
        ["Find the extracted folder", raw("Choose the folder that contains the copy of the phone's file system.")],
      ],
      pick: "folder",
      where: "Where is the folder?",
      guides: [],
    },
  ],
  android: [
    {
      type: "android-qf",
      icon: "box",
      title: "AndroidQF collection",
      recommended: true,
      description: "Collected with AndroidQF, a free tool from Amnesty International.",
      heading: "Collect data with AndroidQF",
      steps: [
        [
          "Turn on USB debugging",
          raw(
            "Settings › About phone › tap <b>Build number</b> 7 times. Then Settings › Developer options › turn on <b>USB debugging</b>.",
          ),
        ],
        [
          "Download AndroidQF",
          raw(`Get it from ${link(LINKS.androidqf, "the AndroidQF releases page")} for this computer.`),
        ],
        [
          "Connect the phone and run it",
          raw("Accept the prompt on the phone and answer the questions AndroidQF asks."),
        ],
        ["Wait for it to finish", raw("It creates a folder (or a .zip file). Come back here and choose it.")],
      ],
      pick: "any",
      where: "Where is the AndroidQF folder or .zip?",
      guides: ["android-qf"],
    },
    {
      type: "android-bugreport",
      icon: "bug",
      title: "Bug report",
      description: "A .zip made from Developer options on the phone.",
      heading: "Make a bug report",
      steps: [
        [
          "Open Developer options",
          raw("Settings › System › Developer options (turn them on first by tapping <b>Build number</b> 7 times)."),
        ],
        [
          "Take a full bug report",
          raw("Tap <b>Take bug report</b> › <b>Full report</b> and wait for the notification."),
        ],
        ["Copy it to this computer", raw("Share or copy the .zip file here, then choose it below.")],
      ],
      pick: "file",
      where: "Where is the bug report .zip?",
      guides: ["android-bugreport"],
    },
    {
      type: "android-backup",
      icon: "save",
      title: "Android backup (.ab)",
      description: "For experts. A backup file made with adb.",
      heading: "Choose the backup file",
      steps: [["Find the .ab file", raw("Choose the backup file created with <code>adb backup</code>.")]],
      pick: "file",
      where: "Where is the .ab file?",
      password: ["Backup password", "Only if the backup has one."],
      guides: [],
    },
  ],
});

/**
 * @typedef {{ title: string, icon: string, note: string, intro: SafeHtml, steps: readonly Step[],
 *   trouble: readonly Step[] }} Guide
 */

const RESET_PASSWORD = raw(
  "On the iPhone, go to Settings › General › Transfer or Reset iPhone › Reset › <b>Reset All Settings</b>. This keeps your data but removes the backup password. Then make a new encrypted backup.",
);

/** @type {Readonly<Record<string, Guide>>} */
export const GUIDES = Object.freeze({
  "iphone-mac": {
    title: "iPhone backup on a Mac",
    icon: "phone",
    note: "Recommended for iPhone",
    intro: raw(
      "You need the iPhone, its cable, and a Mac with enough free space for the backup (usually as much as the phone uses).",
    ),
    steps: [
      [
        "Unlock the iPhone and connect it",
        raw(
          "Use the charging cable. If the phone asks <b>Trust This Computer?</b>, tap <b>Trust</b> and enter the phone's passcode.",
        ),
      ],
      [
        "Open Finder",
        raw(
          "Click the iPhone's name in the Finder sidebar, under <b>Locations</b>. Make sure the <b>General</b> tab is open.",
        ),
      ],
      [
        'Choose "Back up all of the data on your iPhone to this Mac"',
        raw("Not iCloud. The backup has to be on this Mac."),
      ],
      [
        'Tick "Encrypt local backup" and choose a password',
        raw(
          "Write the password down. Encrypted backups include messages, browsing history and other things the check needs. If the box is already ticked, you need the password chosen back then.",
        ),
      ],
      [
        'Click "Back Up Now" and wait',
        raw(
          "Keep the phone connected until the progress bar in the sidebar disappears. It can take from a few minutes to an hour.",
        ),
      ],
      [
        "Come back to PhoneForensics",
        raw(
          'Start a new check. The backup is usually found automatically. If not, it is in <span class="pf-mono">~/Library/Application Support/MobileSync/Backup/</span>.',
        ),
      ],
    ],
    trouble: [
      [
        "PhoneForensics says the folder is not allowed",
        raw(
          "macOS protects the backup folder. Open <b>System Settings › Privacy &amp; Security › Full Disk Access</b>, turn on <b>Terminal</b>, then close and reopen PhoneForensics.",
        ),
      ],
      [
        "The iPhone does not appear in Finder",
        raw("Try another cable or USB port, unlock the phone, and check that macOS is up to date."),
      ],
      ["I forgot the backup password", RESET_PASSWORD],
    ],
  },
  "iphone-windows": {
    title: "iPhone backup on Windows",
    icon: "phone",
    note: "Recommended for iPhone",
    intro: raw(
      "You need the iPhone, its cable, and a Windows PC with the free <b>Apple Devices</b> app (Windows 10 or 11) or <b>iTunes</b>, both from the Microsoft Store.",
    ),
    steps: [
      [
        "Install Apple Devices",
        raw("Get <b>Apple Devices</b> from the Microsoft Store. On older Windows, install <b>iTunes</b> instead."),
      ],
      [
        "Unlock the iPhone and connect it",
        raw("If the phone asks <b>Trust This Computer?</b>, tap <b>Trust</b> and enter the passcode."),
      ],
      [
        "Open the iPhone in Apple Devices",
        raw(
          "Click the iPhone in the sidebar, then <b>General</b>. In iTunes, click the small phone button, then <b>Summary</b>.",
        ),
      ],
      [
        'Choose "Back up all of the data on your iPhone to this computer"',
        raw("Not iCloud. The backup has to be on this PC."),
      ],
      [
        'Tick "Encrypt local backup" and choose a password',
        raw("Write the password down. Encrypted backups include much more of what the check needs."),
      ],
      ['Click "Back Up Now" and wait', raw("Keep the phone connected until it has finished.")],
      [
        "Come back to PhoneForensics",
        raw(
          'The backup is usually found automatically. If not, look in <span class="pf-mono">%APPDATA%\\Apple Computer\\MobileSync\\Backup</span> or <span class="pf-mono">%USERPROFILE%\\Apple\\MobileSync\\Backup</span>.',
        ),
      ],
    ],
    trouble: [
      ["The iPhone does not appear", raw("Unlock it, try another cable or port, and restart the Apple Devices app.")],
      ["I forgot the backup password", RESET_PASSWORD],
    ],
  },
  "android-qf": {
    title: "Android data with AndroidQF",
    icon: "android",
    note: "Recommended for Android",
    intro: raw(
      "AndroidQF is a free tool from Amnesty International that copies what the check needs from an Android phone. You need the phone, a USB cable that carries data, and this computer.",
    ),
    steps: [
      [
        "Turn on Developer options",
        raw(
          "On the phone, open <b>Settings › About phone</b> and tap <b>Build number</b> 7 times. On some phones it is under <b>Software information</b>. Enter your PIN if asked.",
        ),
      ],
      [
        "Turn on USB debugging",
        raw(
          'Open <b>Settings › System › Developer options</b> (or search Settings for "Developer") and turn on <b>USB debugging</b>.',
        ),
      ],
      [
        "Download AndroidQF",
        raw(
          `From ${link(LINKS.androidqf, "the AndroidQF releases page")}, download the file for this computer: <b>windows</b> (.exe), <b>darwin</b> for Mac, or <b>linux</b>. Put it in its own folder.`,
        ),
      ],
      [
        "Connect the phone and allow debugging",
        raw(
          "Unlock the phone and plug it in. When it asks <b>Allow USB debugging?</b>, tick <b>Always allow from this computer</b> and tap <b>Allow</b>.",
        ),
      ],
      [
        "Run AndroidQF",
        raw(
          "Double-click the file (on a Mac, right-click › Open the first time). Answer its questions. If unsure, choose the default. Keep the phone unlocked and connected while it works.",
        ),
      ],
      [
        "Find the new folder",
        raw(
          "When it finishes, there is a new folder (with a long name of letters and numbers) next to AndroidQF. Choose that folder in PhoneForensics.",
        ),
      ],
      ["Turn USB debugging off again", raw("When you are done, switch <b>USB debugging</b> off in Developer options.")],
    ],
    trouble: [
      [
        "AndroidQF says no device was found",
        raw(
          "Check the phone is unlocked, that you tapped <b>Allow</b>, and try a different cable. Some cables only charge.",
        ),
      ],
      [
        "Windows or macOS blocks AndroidQF",
        raw("Windows: click <b>More info › Run anyway</b>. Mac: right-click the file and choose <b>Open</b>."),
      ],
    ],
  },
  "android-bugreport": {
    title: "Android bug report",
    icon: "bug",
    note: "Quick, but checks less",
    intro: raw(
      "A bug report is a quick option that needs no extra software. It contains less than AndroidQF, so use AndroidQF if you can.",
    ),
    steps: [
      ["Turn on Developer options", raw("Open <b>Settings › About phone</b> and tap <b>Build number</b> 7 times.")],
      [
        "Take a full bug report",
        raw(
          "Open <b>Settings › System › Developer options</b>, tap <b>Take bug report</b>, choose <b>Full report</b>, then tap <b>Report</b>.",
        ),
      ],
      [
        "Wait for the notification",
        raw("After a few minutes a notification says the bug report is ready. Tap it and choose how to share it."),
      ],
      [
        "Copy it to this computer",
        raw("Send it to yourself or copy it with a cable. It is a <b>.zip</b> file. Do not unzip it."),
      ],
      [
        "Choose the .zip in PhoneForensics",
        raw("Start a new check, choose <b>Android › Bug report</b>, and pick the file."),
      ],
    ],
    trouble: [
      [
        "Sharing to email fails",
        raw("The file can be large. Copy it with a cable or upload it to a cloud drive you trust instead."),
      ],
    ],
  },
});

const HELPLINES = raw(
  `${link(LINKS.accessNow, "Access Now Digital Security Helpline")} or ${link(LINKS.amnesty, "Amnesty Tech")}`,
);

/** @type {Readonly<Record<"attention" | "clear" | "failed", readonly Step[]>>} */
export const NEXT_STEPS = Object.freeze({
  attention: [
    [
      "Keep using the phone normally for now",
      raw("Do not reset or wipe it yet. Resetting can erase the traces an expert needs to confirm what happened."),
    ],
    [
      "Move private conversations to another device",
      raw("Use a phone or computer you trust for anything sensitive until an expert has looked."),
    ],
    ["Contact a free security helpline", raw(`${HELPLINES}. Share the saved report with them.`)],
  ],
  clear: [
    [
      "Keep the spyware lists up to date",
      raw("New spyware is found regularly. Update the lists on the Home screen and check again from time to time."),
    ],
    [
      "Keep your phone updated",
      raw("Install system updates as soon as they arrive. They fix the security holes spyware relies on."),
    ],
    [
      "Still worried? Ask an expert",
      raw(`No tool can prove a phone is clean. ${HELPLINES} help people at risk for free.`),
    ],
  ],
  failed: [
    [
      "Check you chose the right thing",
      raw("Make sure the location is the backup or collection itself, not a folder above it."),
    ],
    [
      "Check the password",
      raw("Encrypted iPhone backups need the exact password chosen when encryption was turned on."),
    ],
    [
      "Look at the technical details",
      raw("The Notes tab shows what went wrong. You can share the files with someone who can help."),
    ],
  ],
});

export const FOOTER = raw(
  `PhoneForensics by Surinder Lall · MIT License · Built on ${link(LINKS.mvtRepo, "MVT")} (MVT License 1.1). Not affiliated with or endorsed by Amnesty International.`,
);

/**
 * What the person whose data is on the phone must be told before agreeing (MVT License §3.0:
 * the nature of the procedure, its privacy implications, and the retention and disposal policy).
 * @type {readonly Step[]}
 */
export const DATA_POLICY = [
  [
    "What the check looks at",
    raw(
      "Messages, browsing history, installed apps, settings and system logs saved from the phone, compared against public lists of known spyware.",
    ),
  ],
  [
    "Privacy",
    raw(
      "This is private information. It is read only on this computer and is never uploaded or shared by PhoneForensics. Anyone who can use this computer account may be able to open the saved results.",
    ),
  ],
  [
    "What is kept, and for how long",
    raw(
      "The results of the check are saved on this computer until you delete them. If the backup was encrypted, the unlocked copy made during the check is deleted as soon as the check ends. The backup or collection you chose is not changed or deleted.",
    ),
  ],
  [
    "How to delete it",
    raw(
      "Open the check under <b>Past checks</b> and choose <b>Delete this check</b>. Also delete the phone backup or collection itself when you no longer need it.",
    ),
  ],
];

export const CONSENT_TEXT = raw(
  `This means the person (or people) whose messages and other data are on this phone. They have read what is above, understand it, and agreed freely, without any pressure. Checking a phone without this is not allowed by the ${link(LINKS.mvtLicense, "MVT License")} and may be illegal.`,
);

export { HELPLINES, link };
