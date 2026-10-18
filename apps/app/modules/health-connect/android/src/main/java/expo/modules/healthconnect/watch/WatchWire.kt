@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect.watch

import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.InstantSerializer
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

@Serializable
class WatchStateReport(
  val phase: String,
  val battery: Int?,
  val charging: Boolean?,
  val worn: Boolean?,
  val firmware: String?,
  val steps: Int?,
  val heartRate: Int?,
  val lastSyncAt: String?,
  val error: String?,
  val at: String,
  val config: ConfigWire? = null,
  val workout: WorkoutWire? = null
)

@Serializable
class SampleWire(val time: Instant, val value: Int)

@Serializable
class SampleBatchWire(val kind: String, val zoneOffsetSeconds: Int, val samples: List<SampleWire>)

@Serializable
class RoutePointWire(
  val time: Instant,
  val latitude: Double,
  val longitude: Double,
  val altitudeMeters: Double?,
  val horizontalAccuracyMeters: Double?
)

@Serializable
class RouteWire(val start: Instant, val points: List<RoutePointWire>)

@Serializable
class WatchRecordsRequest(
  val records: List<HealthEnvelope>,
  val samples: List<SampleBatchWire> = emptyList(),
  val routes: List<RouteWire> = emptyList()
)

@Serializable
class WatchRecordsSaved(val unmatchedRoutes: List<Instant>)
