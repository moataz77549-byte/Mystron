#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_status=0
gradle -p apps/android --no-daemon connectedDebugAndroidTest || test_status=$?
mkdir -p android-screenshots
adb pull /sdcard/Android/data/com.maystroon.reader.preview/files/screenshots/ android-screenshots/ || true
exit "$test_status"
