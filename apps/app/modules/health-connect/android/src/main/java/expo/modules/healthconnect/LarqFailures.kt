package expo.modules.healthconnect

class LarqBluetoothOff : SyncFailure("Bluetooth is off or missing on this phone", retryable = false)

class LarqScanNotAllowed : SyncFailure("Nearby devices permission is missing, so the bottle cannot be found", retryable = false)

class LarqReadFailed(detail: String) : SyncFailure("The bottle could not be read: $detail", retryable = true)
