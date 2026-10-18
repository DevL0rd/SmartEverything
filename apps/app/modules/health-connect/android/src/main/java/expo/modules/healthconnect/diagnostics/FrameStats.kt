package expo.modules.healthconnect.diagnostics

import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.view.FrameMetrics
import android.view.Window

object FrameStats {
  private const val FRAME_NS = 16_666_667L
  private const val SLOW_NS = 33_000_000L
  private const val SLOW_100_NS = 100_000_000L
  private const val FROZEN_NS = 700_000_000L
  private const val NS_PER_MS = 1_000_000.0

  private var thread: HandlerThread? = null
  private var window: Window? = null
  private var listener: Window.OnFrameMetricsAvailableListener? = null

  private class Counts {
    var frames = 0L
    var janky = 0L
    var slow16 = 0L
    var slow = 0L
    var slow100 = 0L
    var frozen = 0L
    var worstNs = 0L
    var totalNs = 0L

    fun record(durationNs: Long, deadlineNs: Long) {
      frames += 1
      if (durationNs > deadlineNs) janky += 1
      if (durationNs > FRAME_NS) slow16 += 1
      if (durationNs > SLOW_NS) slow += 1
      if (durationNs > SLOW_100_NS) slow100 += 1
      if (durationNs > FROZEN_NS) frozen += 1
      if (durationNs > worstNs) worstNs = durationNs
      totalNs += durationNs
    }

    fun take(): Map<String, Double> {
      val taken = mapOf(
        "frames" to frames.toDouble(),
        "janky" to janky.toDouble(),
        "slow16" to slow16.toDouble(),
        "slow" to slow.toDouble(),
        "slow100" to slow100.toDouble(),
        "frozen" to frozen.toDouble(),
        "worstMs" to worstNs / NS_PER_MS,
        "totalMs" to totalNs / NS_PER_MS
      )
      frames = 0L
      janky = 0L
      slow16 = 0L
      slow = 0L
      slow100 = 0L
      frozen = 0L
      worstNs = 0L
      totalNs = 0L
      return taken
    }
  }

  private val snapshotCounts = Counts()
  private val windowCounts = Counts()

  @Synchronized
  private fun record(durationNs: Long, deadlineNs: Long) {
    snapshotCounts.record(durationNs, deadlineNs)
    windowCounts.record(durationNs, deadlineNs)
  }

  @Synchronized
  fun take(): Map<String, Double> = snapshotCounts.take()

  @Synchronized
  fun takeWindow(): Map<String, Double> = windowCounts.take()

  private fun deadlineOf(metrics: FrameMetrics): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) metrics.getMetric(FrameMetrics.DEADLINE) else FRAME_NS

  fun start(activity: Activity) {
    activity.runOnUiThread {
      stopOnUiThread()
      val worker = HandlerThread("se-frame-stats")
      worker.start()
      val frameListener = Window.OnFrameMetricsAvailableListener { _, metrics, _ ->
        record(metrics.getMetric(FrameMetrics.TOTAL_DURATION), deadlineOf(metrics))
      }
      activity.window.addOnFrameMetricsAvailableListener(frameListener, Handler(worker.looper))
      thread = worker
      window = activity.window
      listener = frameListener
    }
  }

  fun stop(activity: Activity?) {
    if (activity == null) {
      stopOnUiThread()
      return
    }
    activity.runOnUiThread { stopOnUiThread() }
  }

  private fun stopOnUiThread() {
    val attached = window
    val frameListener = listener
    if (attached != null && frameListener != null) {
      attached.removeOnFrameMetricsAvailableListener(frameListener)
    }
    thread?.quitSafely()
    thread = null
    window = null
    listener = null
  }
}
