# Install ThreadLine on macOS

## Download

1. In the Apple menu, choose **About This Mac** and check whether your Mac has an Apple chip or an Intel processor.
2. Open the [latest ThreadLine release](https://github.com/ChenMiaoi/threadline/releases/latest) and expand **Assets** if necessary.
3. Download the `.dmg` matching your Mac: `aarch64.dmg` for Apple Silicon or `x64.dmg` for Intel. The version number and full filename vary by release. The `.app.tar.gz`, `.sig`, and channel JSON files are updater assets, not the initial installer.

If your browser blocks the download, check its download settings or try another browser. Safari may ask permission to download from GitHub's release asset host.

## Install or update

1. If ThreadLine is already open, quit it before replacing the application.
2. Open the downloaded disk image in Finder.
3. Drag **ThreadLine** to **Applications** in the disk image window. Alternatively, copy ThreadLine, open Applications in Finder, and paste it there.
4. If Finder finds an older copy, choose **Replace**. If it reports that ThreadLine is in use, quit the app and try again.
5. Open ThreadLine from Applications. Once installed, you can eject the disk image in Finder.

To check the installed version, select ThreadLine in Applications and choose **File → Get Info**. The version appears under **General**. Replacing the app does not require deleting its local data; see [data and security](data-and-security.md) for storage locations.

## macOS security notices

Builds without an Apple Developer ID use ad-hoc signatures to seal the complete application bundle. These signatures check integrity but do not establish a verified publisher, and the app is not notarized by Apple. macOS can still block the first launch. After checking that the app came from the official release, review **System Settings → Privacy & Security** for an **Open Anyway** option. See [Apple's instructions for opening an app from an unidentified developer](https://support.apple.com/en-us/102445). Do not disable Gatekeeper globally.

The original v0.1.3 Apple Silicon installer contains an incomplete application signature; the Intel installer is unsigned. Both require a rebuilt installer with the signing fix. A successful download or matching checksum does not establish a valid application signature.

Updater signatures are separate from macOS application signing and notarization.

For GitHub sign-in and repository selection, continue to [getting started](getting-started.md#sign-in-to-github). For in-app updates, see [release publishing](release/README.md).
