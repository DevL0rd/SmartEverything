package expo.modules.healthconnect.phone

import android.annotation.SuppressLint
import android.content.Context
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.time.Instant
import org.json.JSONObject

data class ParkedSpot(val latitude: Double, val longitude: Double, val accuracyMeters: Float, val at: Instant, val place: String?) {
  fun toMap(): Map<String, Any?> = mapOf(
    "latitude" to latitude,
    "longitude" to longitude,
    "accuracyMeters" to accuracyMeters.toDouble(),
    "at" to at.toString(),
    "place" to place
  )
}

object PhoneParking {
  private const val KEY = "parked"

  @SuppressLint("MissingPermission")
  fun capture(context: Context) {
    if (!PhonePermissions.backgroundLocation(context)) {
      PhoneEvents.emit("parked_spot_skipped", "saving where you parked needs location access all the time")
      return
    }
    val place = PhoneStore(context).context().place
    LocationServices.getFusedLocationProviderClient(context)
      .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
      .addOnSuccessListener { location ->
        if (location == null) {
          PhoneEvents.emit("parked_spot_skipped", "the phone could not get a location fix")
          return@addOnSuccessListener
        }
        save(context, ParkedSpot(location.latitude, location.longitude, location.accuracy, Instant.now(), place))
      }
      .addOnFailureListener { PhoneEvents.emit("parked_spot_skipped", it.message.orEmpty()) }
  }

  fun read(context: Context): ParkedSpot? {
    val json = PhoneVault(context).read(KEY)?.let { JSONObject(it) } ?: return null
    return ParkedSpot(
      json.getDouble("latitude"),
      json.getDouble("longitude"),
      json.getDouble("accuracyMeters").toFloat(),
      Instant.parse(json.getString("at")),
      json.optStringOrNull("place")
    )
  }

  fun clear(context: Context) {
    PhoneVault(context).write(KEY, null)
  }

  private fun save(context: Context, spot: ParkedSpot) {
    val json = JSONObject(spot.toMap().mapValues { it.value ?: JSONObject.NULL })
    PhoneVault(context).write(KEY, json.toString())
    PhoneEvents.emit("parked_spot_saved", spot.place ?: "parked")
  }
}
