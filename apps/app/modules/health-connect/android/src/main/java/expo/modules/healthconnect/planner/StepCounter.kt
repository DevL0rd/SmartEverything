package expo.modules.healthconnect.planner

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.healthconnect.diagnostics.NativeLog

class StepTally {
  private var baseline: Float? = null

  fun update(total: Float): Int {
    val start = baseline ?: total.also { baseline = it }
    return (total - start).toInt().coerceAtLeast(0)
  }
}

object StepCounter : SensorEventListener {
  private const val SCOPE = "planner-alarm"
  private var tally: StepTally? = null
  private var manager: SensorManager? = null

  fun available(context: Context): Boolean =
    context.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

  fun permitted(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  @Synchronized
  fun start(context: Context) {
    check(permitted(context)) { "counting steps needs the physical activity permission" }
    val sensors = context.getSystemService(SensorManager::class.java)
    val sensor = sensors?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      ?: throw IllegalStateException("this phone has no step counter")
    stop()
    tally = StepTally()
    manager = sensors
    sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    NativeLog.info(SCOPE, "steps.started")
  }

  @Synchronized
  fun stop() {
    manager?.unregisterListener(this)
    manager = null
    tally = null
  }

  @Synchronized
  override fun onSensorChanged(event: SensorEvent) {
    val current = tally ?: return
    val total = event.values.firstOrNull() ?: return
    PlannerEvents.emit("steps", "steps counted", mapOf("count" to current.update(total)))
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
