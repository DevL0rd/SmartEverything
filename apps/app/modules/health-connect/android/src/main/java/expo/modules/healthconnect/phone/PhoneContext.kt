package expo.modules.healthconnect.phone

import java.time.Instant
import org.json.JSONObject

enum class ContextState(val wire: String) {
  UNKNOWN("unknown"),
  STILL("still"),
  WALKING("walking"),
  RUNNING("running"),
  CYCLING("cycling"),
  DRIVING("driving"),
  NAVIGATING("navigating"),
  PARKED("parked");

  companion object {
    fun of(wire: String): ContextState = entries.firstOrNull { it.wire == wire } ?: UNKNOWN
  }
}

enum class Motion(val wire: String, val state: ContextState) {
  STILL("still", ContextState.STILL),
  WALKING("walking", ContextState.WALKING),
  RUNNING("running", ContextState.RUNNING),
  CYCLING("cycling", ContextState.CYCLING),
  VEHICLE("vehicle", ContextState.DRIVING);

  companion object {
    fun of(wire: String?): Motion? = entries.firstOrNull { it.wire == wire }
  }
}

sealed class ContextInput {
  data class Activity(val motion: Motion, val entered: Boolean) : ContextInput()
  data class Car(val connected: Boolean) : ContextInput()
  data class Navigation(val active: Boolean) : ContextInput()
  data class Place(val name: String, val arrived: Boolean) : ContextInput()
}

data class PhoneContextSnapshot(
  val state: ContextState,
  val since: Instant,
  val confidence: Int,
  val place: String?,
  val motion: Motion?,
  val car: Boolean,
  val navigating: Boolean,
  val pending: ContextState?,
  val pendingAt: Instant?
) {
  fun toJson(): JSONObject = JSONObject()
    .put("state", state.wire)
    .put("since", since.toString())
    .put("confidence", confidence)
    .put("place", place ?: JSONObject.NULL)
    .put("motion", motion?.wire ?: JSONObject.NULL)
    .put("car", car)
    .put("navigating", navigating)
    .put("pending", pending?.wire ?: JSONObject.NULL)
    .put("pendingAt", pendingAt?.toString() ?: JSONObject.NULL)

  fun toMap(): Map<String, Any?> = mapOf(
    "state" to state.wire,
    "since" to since.toString(),
    "confidence" to confidence,
    "place" to place,
    "car" to car,
    "navigating" to navigating
  )

  companion object {
    val INITIAL = PhoneContextSnapshot(ContextState.UNKNOWN, Instant.EPOCH, 0, null, null, false, false, null, null)

    fun fromJson(json: JSONObject): PhoneContextSnapshot = PhoneContextSnapshot(
      state = ContextState.of(json.getString("state")),
      since = Instant.parse(json.getString("since")),
      confidence = json.getInt("confidence"),
      place = json.optStringOrNull("place"),
      motion = Motion.of(json.optStringOrNull("motion")),
      car = json.getBoolean("car"),
      navigating = json.getBoolean("navigating"),
      pending = json.optStringOrNull("pending")?.let { ContextState.of(it) },
      pendingAt = json.optStringOrNull("pendingAt")?.let { Instant.parse(it) }
    )
  }
}

fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key)) null else optString(key)
