package expo.modules.healthconnect


class UnsupportedWatchFamily(id: String, known: List<String>) : SyncFailure(
  "This app has no driver for the watch family \"$id\"; it knows ${known.joinToString()}",
  retryable = false
)

class WatchNotConfigured(deviceId: String) : SyncFailure(
  "No watch $deviceId is set up on this phone; open the app so it can fetch your watches",
  retryable = false
)

class BluetoothConnectNotAllowed : SyncFailure(
  "Talking to the watch needs the Nearby devices permission, which is not granted",
  retryable = false
)

class CompanionNeedsNewerAndroid(sdk: Int) : SyncFailure(
  "Keeping the watch connected in the background needs Android 13 or newer; this phone runs API $sdk",
  retryable = false
)

class CompanionScreenUnavailable : SyncFailure(
  "The watch pairing screen cannot be shown because no activity is attached",
  retryable = false
)
