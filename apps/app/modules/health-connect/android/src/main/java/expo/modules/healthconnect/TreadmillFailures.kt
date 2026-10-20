package expo.modules.healthconnect

class TreadmillDumpFailed(detail: String) : SyncFailure("The treadmill could not be read: $detail", retryable = true)

class TreadmillBluetoothOff : SyncFailure("Bluetooth is off or missing on this phone", retryable = false)
