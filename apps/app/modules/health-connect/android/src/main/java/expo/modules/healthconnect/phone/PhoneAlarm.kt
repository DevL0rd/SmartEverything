package expo.modules.healthconnect.phone

import android.app.AlarmManager
import android.content.Context
import android.content.pm.PackageManager
import java.time.Instant
import org.json.JSONObject

object PhoneAlarm : PhoneDetailSource {
  override val sections = setOf(PhoneSection.ALARM)

  fun nextAt(context: Context): Instant? =
    context.getSystemService(AlarmManager::class.java).nextAlarmClock?.let { Instant.ofEpochMilli(it.triggerTime) }

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> =
    mapOf("next_alarm" to (nextAt(context)?.toString() ?: JSONObject.NULL))

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject {
    val next = context.getSystemService(AlarmManager::class.java).nextAlarmClock
    return JSONObject()
      .put("nextAt", next?.let { Instant.ofEpochMilli(it.triggerTime).toString() } ?: JSONObject.NULL)
      .put("appLabel", next?.showIntent?.creatorPackage?.let { label(context, it) } ?: JSONObject.NULL)
  }

  private fun label(context: Context, packageName: String): String? = try {
    context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(packageName, 0)).toString()
  } catch (failure: PackageManager.NameNotFoundException) {
    throw PhoneReadingUnavailable("the alarm app $packageName", failure.message.orEmpty(), failure)
  }
}
