#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_status=0
gradle -p apps/android --no-daemon connectedDebugAndroidTest || test_status=$?
mkdir -p android-screenshots
adb pull /sdcard/Android/data/com.maystroon.reader.preview/files/screenshots/ android-screenshots/ || true
if [ "$test_status" -ne 0 ]; then exit "$test_status"; fi
# Also launch the minified variant: debug-only tests cannot catch R8 startup failures.
gradle -p apps/android --no-daemon assemblePreview
adb install -r apps/android/app/build/outputs/apk/preview/app-preview.apk
adb shell am force-stop com.maystroon.reader.preview
adb shell am start -W -n com.maystroon.reader.preview/com.maystroon.reader.MainActivity
sleep 5
adb shell pidof com.maystroon.reader.preview
adb exec-out screencap -p > android-screenshots/optimized-preview.png
