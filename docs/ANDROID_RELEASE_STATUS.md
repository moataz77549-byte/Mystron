# Android release status

© معتز العلقمي — اليمن، تعز — 2026م

This is the public-reader implementation phase, not the completed universal app.
No final signed APK has been delivered. Native administration, guest submissions,
secure attachment handling, optional login, FCM and full API contracts remain
unfinished. See ANDROID_API_FEATURE_INVENTORY.md for function-level status.

## Implemented

- Kotlin / Jetpack Compose / Material 3; minSdk 26, target/compileSdk 35.
- Arabic RTL guest-first navigation, real API feed, categories, search and author
  list; pagination for article feeds, no synthetic articles.
- Retrofit / OkHttp with finite timeouts, standard certificate validation and no
  privileged credentials, direct sensitive database access or Origin spoofing.
- Native Tiptap reader including paragraphs, headings, inline marks and HTTPS
  links, poetry, citations, images/captions, callouts, lists and scrollable tables.
  Video links open externally; no WebView or remote script execution.
- Room bookmarks and reading positions; DataStore theme and font preferences.
  Images use Coil's opportunistic cache: fully offline image downloads are NOT
  claimed. Explicit 404/410 responses do not fall back to stale saved content.
- GitHub workflow compiles, runs unit contracts, lints, shrinks release, inspects
  minSdk/debuggable/native ABI, and runs guest navigation tests on APIs 26/29/35.

## Building

Use JDK 17, Android SDK 35, Build Tools 35.0.0 and Gradle 8.11.1:

```sh
cd apps/android
gradle testDebugUnitTest lintRelease assembleDebug assembleRelease
gradle connectedDebugAndroidTest
```

The workflow installs the pinned Gradle version through the official Gradle action.
The repository currently has no Gradle wrapper binary; Android Studio / a matching
local Gradle installation or the workflow can build it.

## Artifact labels

`MAYSTROON-v1.0.0-rc.3-preview-debug.apk` is an installable developer preview signed
with Android's disposable debug key and the separate `.preview` application ID.
It is not a production release and is not suitable as a stable update channel.

`MAYSTROON-v1.0.0-rc.3-release-unsigned.apk` is an optimized, non-debuggable release
candidate. It is not installable until release signing is configured. No private
release key has been created, committed, requested in chat or invented silently.
Owner-controlled signing, final feature completion and device acceptance must
precede naming an artifact `MAYSTROON-v1.0.0-arm64-v8a-release.apk`.

Pure Kotlin/JVM code does not require an artificial arm64-only split. The workflow
inspects packaged `.so` files and rejects native dependencies without arm64 support.
Its report does not substitute for running on a physical arm64 phone.

## Verification status

Source is present. Build and emulator results must be read from the corresponding
GitHub Actions run; adding a workflow alone is not a passing result. This document
will be updated with actual run URLs and findings after execution.

## RC.3 branch delivery

The next development-branch build is `1.0.0-rc.3 (versionCode 3)`, with
`minSdk 26` and optional `arm64-v8a` restriction for the optimized APK.
GitHub Actions provides an installable, debug-key-signed preview APK for
owner testing and an unsigned production APK for future owner-controlled signing.
The Android app is not yet a complete native administration suite.
