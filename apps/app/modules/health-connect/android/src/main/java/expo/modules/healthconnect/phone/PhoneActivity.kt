package expo.modules.healthconnect.phone

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

object PhoneActivity {
  private const val REQUEST_CODE = 7502
  private val MOTIONS = mapOf(
    DetectedActivity.STILL to Motion.STILL,
    DetectedActivity.WALKING to Motion.WALKING,
    DetectedActivity.RUNNING to Motion.RUNNING,
    DetectedActivity.ON_BICYCLE to Motion.CYCLING,
    DetectedActivity.IN_VEHICLE to Motion.VEHICLE
  )

  @SuppressLint("MissingPermission")
  fun register(context: Context) {
    val client = ActivityRecognition.getClient(context)
    if (!wanted(context)) {
      client.removeActivityTransitionUpdates(pendingIntent(context))
      return
    }
    client.requestActivityTransitionUpdates(ActivityTransitionRequest(transitions()), pendingIntent(context))
      .addOnSuccessListener { PhoneEvents.emit("activity_watched", "activity transitions registered") }
      .addOnFailureListener { PhoneEvents.emit("activity_not_watched", it.message.orEmpty()) }
  }

  fun motionOf(activityType: Int): Motion? = MOTIONS[activityType]

  private fun wanted(context: Context): Boolean =
    PhoneStore(context).enabled() && PhoneStore(context).sensor(PhoneSensor.ACTIVITY) &&
      PhonePermissions.activity(context)

  private fun transitions(): List<ActivityTransition> = MOTIONS.keys.flatMap { type ->
    listOf(ActivityTransition.ACTIVITY_TRANSITION_ENTER, ActivityTransition.ACTIVITY_TRANSITION_EXIT).map {
      ActivityTransition.Builder().setActivityType(type).setActivityTransition(it).build()
    }
  }

  private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, PhoneActivityReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
  )
}

class PhoneActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) {
      return
    }
    val events = ActivityTransitionResult.extractResult(intent)?.transitionEvents.orEmpty()
    events.sortedBy { it.elapsedRealTimeNanos }.forEach { event ->
      val motion = PhoneActivity.motionOf(event.activityType) ?: return@forEach
      val entered = event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
      PhoneContextInputs.feed(context, ContextInput.Activity(motion, entered))
    }
  }
}
