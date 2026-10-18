package expo.modules.healthconnect.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

object ProcessExits {
  private const val KEPT = 5

  private val REASONS = mapOf(
    ApplicationExitInfo.REASON_ANR to "anr",
    ApplicationExitInfo.REASON_CRASH to "crash",
    ApplicationExitInfo.REASON_CRASH_NATIVE to "crash_native",
    ApplicationExitInfo.REASON_DEPENDENCY_DIED to "dependency_died",
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE to "excessive_resource_usage",
    ApplicationExitInfo.REASON_EXIT_SELF to "exit_self",
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE to "initialization_failure",
    ApplicationExitInfo.REASON_LOW_MEMORY to "low_memory",
    ApplicationExitInfo.REASON_OTHER to "other",
    ApplicationExitInfo.REASON_PERMISSION_CHANGE to "permission_change",
    ApplicationExitInfo.REASON_SIGNALED to "signaled",
    ApplicationExitInfo.REASON_UNKNOWN to "unknown",
    ApplicationExitInfo.REASON_USER_REQUESTED to "user_requested",
    ApplicationExitInfo.REASON_USER_STOPPED to "user_stopped"
  )

  fun recent(context: Context): List<Map<String, Any?>> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return emptyList()
    }
    val manager = context.getSystemService(ActivityManager::class.java)
    return manager.getHistoricalProcessExitReasons(context.packageName, 0, KEPT)
      .filter { it.processName == context.packageName || it.processName.startsWith(context.packageName + ":") }
      .map { exit ->
      mapOf(
        "reason" to (REASONS[exit.reason] ?: "code_${exit.reason}"),
        "description" to DiagnosticText.description(exit.description),
        "at" to exit.timestamp,
        "importance" to exit.importance,
        "status" to exit.status,
        "processName" to exit.processName,
        "pssKb" to exit.pss,
        "rssKb" to exit.rss,
        "nativeTrace" to NativeTrace.read(exit)
      )
    }
  }
}

class DiagnosticsModule : Module() {
  private var logForwarding: Job? = null

  override fun definition() = ModuleDefinition {
    Name("Diagnostics")

    Events("onLog")

    OnCreate {
      logForwarding = appContext.backgroundCoroutineScope.launch {
        NativeLog.events.collect { if (NativeLog.claim(it)) sendEvent("onLog", it) }
      }
      NativeLog.info("native-diagnostics", "bridge.started") { mapOf("sdk" to Build.VERSION.SDK_INT, "level" to NativeLog.level().label) }
    }

    OnDestroy {
      logForwarding?.cancel()
      logForwarding = null
    }

    Function("setLogLevel") { level: String ->
      val parsed = NativeLevel.parse(level)
      if (parsed != null && parsed != NativeLog.level()) {
        val previous = NativeLog.level()
        NativeLog.setLevel(parsed)
        NativeLog.info("native-diagnostics", "level.changed") { mapOf("from" to previous.label, "to" to parsed.label) }
      }
      parsed != null
    }

    AsyncFunction("recentProcessExits") {
      ProcessExits.recent(appContext.reactContext ?: throw Exceptions.ReactContextLost())
    }

    AsyncFunction("perfSnapshot") {
      PerfSnapshot.read(appContext.reactContext ?: throw Exceptions.ReactContextLost())
    }

    Function("processTimes") {
      PerfSnapshot.processTimes()
    }

    Function("startFrameStats") {
      appContext.currentActivity?.let { activity ->
        FrameStats.start(activity)
        true
      } ?: false
    }

    Function("stopFrameStats") {
      FrameStats.stop(appContext.currentActivity)
    }

    Function("takeFrameStats") {
      FrameStats.takeWindow()
    }
  }
}
