package expo.modules.healthconnect.phone

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices

object PhoneGeofences {
  const val MAX_PLACES = 100
  private const val DWELL_MS = 30_000
  private const val REQUEST_CODE = 7501

  @SuppressLint("MissingPermission")
  fun register(context: Context) {
    val client = LocationServices.getGeofencingClient(context)
    client.removeGeofences(pendingIntent(context))
    val places = PhonePlaces(context).all()
    if (!wanted(context) || places.isEmpty()) {
      return
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_DWELL)
      .addGeofences(places.map { fenceOf(it) })
      .build()
    client.addGeofences(request, pendingIntent(context))
      .addOnSuccessListener { PhoneEvents.emit("places_watched", "${places.size} places") }
      .addOnFailureListener { PhoneEvents.emit("places_not_watched", it.message.orEmpty()) }
  }

  fun stop(context: Context) {
    LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent(context))
  }

  private fun wanted(context: Context): Boolean =
    PhoneStore(context).enabled() && PhoneStore(context).sensor(PhoneSensor.PLACES) &&
      PhonePermissions.backgroundLocation(context)

  private fun fenceOf(place: PhonePlace): Geofence = Geofence.Builder()
    .setRequestId(place.id)
    .setCircularRegion(place.latitude, place.longitude, place.radiusMeters)
    .setExpirationDuration(Geofence.NEVER_EXPIRE)
    .setLoiteringDelay(DWELL_MS)
    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL or Geofence.GEOFENCE_TRANSITION_EXIT)
    .build()

  private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, PhoneGeofenceReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
  )
}

class PhoneGeofenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("PhoneGeofenceReceiver") {
    val event = GeofencingEvent.fromIntent(intent) ?: return@run
    if (event.hasError()) {
      PhoneEvents.emit("places_error", GeofenceStatusCodes.getStatusCodeString(event.errorCode))
      return@run
    }
    val arrived = event.geofenceTransition == Geofence.GEOFENCE_TRANSITION_DWELL
    val places = PhonePlaces(context)
    event.triggeringGeofences.orEmpty().mapNotNull { places.byId(it.requestId) }.forEach {
      PhoneContextInputs.feed(context, ContextInput.Place(it.name, arrived))
    }
  }
}
