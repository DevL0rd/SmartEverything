package expo.modules.healthconnect.phone

sealed class PhoneFailure(message: String, cause: Throwable? = null) : Exception(message, cause)

class PhoneActionUnknown(type: String) : PhoneFailure(
  "The hub asked this phone for \"$type\", which this app version does not know; expected one of ${PhoneActionType.entries.map { it.wire }}"
)

class PhonePermissionMissing(what: String) : PhoneFailure("$what is not allowed for SmartEverything on this phone")

class PhonePlaceInvalid(detail: String) : PhoneFailure("The place could not be saved: $detail")

class PhoneCarNotChosen : PhoneFailure("No car Bluetooth device has been chosen yet")

class PhoneFlashlightMissing : PhoneFailure("This phone has no flashlight")

class PhoneFlashlightUnreadable : PhoneFailure("The flashlight state could not be read, so it was not toggled")

class PhoneFlashlightRefused(cause: Throwable) : PhoneFailure("Android refused the flashlight: ${cause.message}", cause)

class PhoneFlashlightModeUnknown(mode: String) : PhoneFailure("Unknown flashlight mode \"$mode\"; expected on, off or toggle")
