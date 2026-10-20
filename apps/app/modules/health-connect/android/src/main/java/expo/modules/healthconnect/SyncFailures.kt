package expo.modules.healthconnect

sealed class SyncFailure(
  message: String,
  cause: Throwable? = null,
  val retryable: Boolean
) : Exception(message, cause)

class UnknownRecordType(name: String) : SyncFailure(
  "Health Connect has no record type called \"$name\"; expected one of " +
    RecordTypes.all.joinToString { it.name },
  retryable = false
)

class HealthConnectNotAvailable(status: String) : SyncFailure(
  "Health Connect is not available on this device: the SDK reported $status, expected available",
  retryable = false
)

class FeatureNotAvailable(feature: String) : SyncFailure(
  "Health Connect on this device does not offer $feature, so its permission cannot be requested",
  retryable = false
)

class BackgroundReadNotGranted : SyncFailure(
  "A scheduled sync needs READ_HEALTH_DATA_IN_BACKGROUND, which is not granted or not offered",
  retryable = false
)

class PermissionScreenUnavailable : SyncFailure(
  "The Health Connect permission screen cannot be shown because no activity is attached",
  retryable = false
)

class HealthConnectQuotaExceeded(cause: IllegalStateException) : SyncFailure(
  "Health Connect refused a read with IllegalStateException, which is how it reports an " +
    "exhausted rate-limit quota: ${cause.message}",
  cause,
  retryable = true
)

class HealthConnectInterrupted(cause: Exception) : SyncFailure(
  "Health Connect could not complete a read: ${cause.javaClass.simpleName}: ${cause.message}",
  cause,
  retryable = true
)

class UnmappedValue(kind: String, value: Any) : SyncFailure(
  "The sync does not know how to describe the $kind ${value.javaClass.name}",
  retryable = false
)

class IngestRejected(val status: Int, body: String, cause: Throwable? = null) : SyncFailure(
  "The health-ingest function refused the batch with HTTP $status: $body",
  cause,
  retryable = false
)

class IngestUnavailable(detail: String, cause: Throwable? = null) : SyncFailure(
  "The health-ingest function could not be reached: $detail",
  cause,
  retryable = true
)

class HealthConnectDenied(cause: SecurityException) : SyncFailure(
  "Health Connect refused a read for lack of permission: ${cause.message}",
  cause,
  retryable = false
)

class AppVersionMissing(packageName: String) : SyncFailure(
  "The package $packageName has no versionName, which every batch must name as its appVersion",
  retryable = false
)

class StoredCredentialUnreadable(cause: Exception) : SyncFailure(
  "A secret stored on this phone could not be decrypted: ${cause.message}; set it up again",
  cause,
  retryable = false
)
