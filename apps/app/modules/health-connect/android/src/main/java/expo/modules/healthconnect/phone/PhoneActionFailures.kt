package expo.modules.healthconnect.phone

class PhoneAppUnknown(query: String) : PhoneFailure(
  "No app on this phone matches \"$query\"; expected the package name or the name shown on the home screen"
)

class PhoneAppAmbiguous(query: String, matches: List<String>) : PhoneFailure(
  "\"$query\" matches several apps (${matches.joinToString()}); use the package name"
)

class PhoneAppNotLaunchable(packageName: String) : PhoneFailure("$packageName has no screen that can be opened")

class PhoneFlashlightStrengthFixed : PhoneFailure("This phone's flashlight has a single brightness")

class PhoneNotificationAccessOff : PhoneFailure("Notification access is off for SmartEverything on this phone")

class PhoneMediaNothingPlaying : PhoneFailure("Nothing is playing, or notification access is off on the phone")

class PhoneSettingNotSaved(setting: String) : PhoneFailure("Android did not save the $setting setting")

class PhoneTimeoutInvalid(seconds: Int) : PhoneFailure("The screen timeout must be above zero seconds; received $seconds")

class PhoneAccessibilityOff : PhoneFailure(
  "The SmartEverything accessibility service is off on this phone; turn it on in Accessibility settings to allow locking and screenshots"
)

class PhoneAccessibilityNotConnected : PhoneFailure(
  "The SmartEverything accessibility service is on but not connected yet; try again in a moment"
)

class PhoneLockRefused : PhoneFailure("Android refused to lock the screen")

class PhoneLockUnsupported : PhoneFailure("Locking needs Android 9 or newer")

class PhoneScreenshotUnsupported : PhoneFailure("Screenshots need Android 11 or newer")

class PhoneScreenshotTimedOut(seconds: Long) : PhoneFailure("Android did not return the screenshot within $seconds seconds")

class PhoneScreenshotFailed(code: Int) : PhoneFailure(
  when (code) {
    SCREENSHOT_INTERVAL_TOO_SHORT -> "Android only allows one screenshot a second; try again"
    SCREENSHOT_NO_ACCESS -> "Android says the accessibility service may not take screenshots; turn it off and on again"
    else -> "Android could not take the screenshot (error $code)"
  }
) {
  private companion object {
    const val SCREENSHOT_NO_ACCESS = 2
    const val SCREENSHOT_INTERVAL_TOO_SHORT = 3
  }
}

class PhoneUnlockPromptNeedsOverlay : PhoneFailure(
  "Waking the phone to its unlock prompt needs Display over other apps for SmartEverything"
)

class PhoneFileNotReceived(name: String, detail: String) : PhoneFailure("Could not save $name on this phone: $detail")

class PhoneFilesUnsupported : PhoneFailure("Receiving files needs Android 10 or newer")

class PhoneSettingUnknown(kind: String, value: String, expected: List<String>) : PhoneFailure(
  "Unknown $kind \"$value\"; expected one of $expected"
)

class PhoneSettingsPageMissing(label: String, cause: Throwable) : PhoneFailure("This phone has no screen for $label", cause)
