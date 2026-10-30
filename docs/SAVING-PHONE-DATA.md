# Saving data from a phone

These are the same step-by-step guides shown in the PhoneForensics app (Guide tab).

## iPhone backup on a Mac

You need the iPhone, its cable, and a Mac with enough free space for the backup (usually as much as the phone uses).

1. **Unlock the iPhone and connect it** Use the charging cable. If the phone asks **Trust This Computer?**, tap **Trust** and enter the phone's passcode.
2. **Open Finder** Click the iPhone's name in the Finder sidebar, under **Locations**. Make sure the **General** tab is open.
3. **Choose "Back up all of the data on your iPhone to this Mac"** Not iCloud. The backup has to be on this Mac.
4. **Tick "Encrypt local backup" and choose a password** Write the password down. Encrypted backups include messages, browsing history and other things the check needs. If the box is already ticked, you need the password chosen back then.
5. **Click "Back Up Now" and wait** Keep the phone connected until the progress bar in the sidebar disappears. It can take from a few minutes to an hour.
6. **Come back to PhoneForensics** Start a new check. The backup is usually found automatically. If not, it is in `~/Library/Application Support/MobileSync/Backup/`.

**If something goes wrong**

- **PhoneForensics says the folder is not allowed** macOS protects the backup folder. Open **System Settings › Privacy & Security › Full Disk Access**, turn on **Terminal**, then close and reopen PhoneForensics.
- **The iPhone does not appear in Finder** Try another cable or USB port, unlock the phone, and check that macOS is up to date.
- **I forgot the backup password** Apple cannot recover it. On the iPhone, go to Settings › General › Transfer or Reset iPhone › Reset › **Reset All Settings**. This keeps your data but removes the backup password. Then make a new encrypted backup.

## iPhone backup on Windows

You need the iPhone, its cable, and a Windows PC with the free **Apple Devices** app (Windows 10 or 11) or **iTunes**, both from the Microsoft Store.

1. **Install Apple Devices** Get **Apple Devices** from the Microsoft Store. On older Windows, install **iTunes** instead.
2. **Unlock the iPhone and connect it** If the phone asks **Trust This Computer?**, tap **Trust** and enter the passcode.
3. **Open the iPhone in Apple Devices** Click the iPhone in the sidebar, then **General**. In iTunes, click the small phone button, then **Summary**.
4. **Choose "Back up all of the data on your iPhone to this computer"** Not iCloud. The backup has to be on this PC.
5. **Tick "Encrypt local backup" and choose a password** Write the password down. Encrypted backups include much more of what the check needs.
6. **Click "Back Up Now" and wait** Keep the phone connected until it has finished.
7. **Come back to PhoneForensics** The backup is usually found automatically. If not, look in `%APPDATA%\Apple Computer\MobileSync\Backup` or `%USERPROFILE%\Apple\MobileSync\Backup`.

**If something goes wrong**

- **The iPhone does not appear** Unlock it, try another cable or port, and restart the Apple Devices app.
- **I forgot the backup password** On the iPhone, go to Settings › General › Transfer or Reset iPhone › Reset › **Reset All Settings**. This keeps your data but removes the backup password. Then make a new encrypted backup.

## Android data with AndroidQF

AndroidQF is a free tool from Amnesty International that copies what the check needs from an Android phone. You need the phone, a USB cable that carries data, and this computer.

1. **Turn on Developer options** On the phone, open **Settings › About phone** and tap **Build number** 7 times. On some phones it is under **Software information**. Enter your PIN if asked.
2. **Turn on USB debugging** Open **Settings › System › Developer options** (or search Settings for "Developer") and turn on **USB debugging**.
3. **Download AndroidQF** From [the AndroidQF releases page](https://github.com/mvt-project/androidqf/releases), download the file for this computer: **windows** (.exe), **darwin** for Mac, or **linux**. Put it in its own folder.
4. **Connect the phone and allow debugging** Unlock the phone and plug it in. When it asks **Allow USB debugging?**, tick **Always allow from this computer** and tap **Allow**.
5. **Run AndroidQF** Double-click the file (on a Mac, right-click › Open the first time). Answer its questions. If unsure, choose the default. Keep the phone unlocked and connected while it works.
6. **Find the new folder** When it finishes, there is a new folder (with a long name of letters and numbers) next to AndroidQF. Choose that folder in PhoneForensics.
7. **Turn USB debugging off again** When you are done, switch **USB debugging** off in Developer options.

**If something goes wrong**

- **AndroidQF says no device was found** Check the phone is unlocked, that you tapped **Allow**, and try a different cable. Some cables only charge.
- **Windows or macOS blocks AndroidQF** Windows: click **More info › Run anyway**. Mac: right-click the file and choose **Open**.

## Android bug report

A bug report is a quick option that needs no extra software. It contains less than AndroidQF, so use AndroidQF if you can.

1. **Turn on Developer options** Open **Settings › About phone** and tap **Build number** 7 times.
2. **Take a full bug report** Open **Settings › System › Developer options**, tap **Take bug report**, choose **Full report**, then tap **Report**.
3. **Wait for the notification** After a few minutes a notification says the bug report is ready. Tap it and choose how to share it.
4. **Copy it to this computer** Send it to yourself or copy it with a cable. It is a **.zip** file. Do not unzip it.
5. **Choose the .zip in PhoneForensics** Start a new check, choose **Android › Bug report**, and pick the file.

**If something goes wrong**

- **Sharing to email fails** The file can be large. Copy it with a cable or upload it to a cloud drive you trust instead.

