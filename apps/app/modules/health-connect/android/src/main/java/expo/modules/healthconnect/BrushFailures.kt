package expo.modules.healthconnect

class BrushBluetoothOff : SyncFailure("Bluetooth is off or missing on this phone", retryable = false)

class BrushDumpFailed(detail: String) : SyncFailure("The toothbrush could not be read: $detail", retryable = true)

class BrushBondFailed(detail: String) : SyncFailure("The toothbrush could not be paired: $detail", retryable = true)
