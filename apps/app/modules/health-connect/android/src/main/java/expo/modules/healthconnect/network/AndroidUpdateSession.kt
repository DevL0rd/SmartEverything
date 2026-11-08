package expo.modules.healthconnect.network

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import expo.modules.healthconnect.diagnostics.NativeLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext

internal class AndroidUpdateSession(private val context: Context, private val request: AndroidUpdateRequest) {
  private val installer = context.packageManager.packageInstaller

  suspend fun install(
    activity: () -> Activity?,
    checkGrant: () -> Unit,
    progress: AndroidUpdateProgress,
    stage: (PackageInstaller.Session) -> Unit,
  ): AndroidUpdateOutcome {
    val sessionId = installer.createSession(params())
    var finished = false
    try {
      installer.openSession(sessionId).use { session ->
        stage(session)
        return withContext(Dispatchers.Main) {
          val current = visibleResourceActivity(activity)
          require(current.packageManager.canRequestPackageInstalls()) { "Android's install permission was turned off" }
          AndroidUpdateSessionResult(context, sessionId).use { result ->
            checkGrant()
            progress.report(AndroidUpdateStage.WAITING_FOR_ANDROID, request.size)
            session.commit(result.callback.intentSender)
            result.await(activity).also { finished = true }
          }
        }
      }
    } finally {
      if (!finished) abandon(sessionId)
    }
  }

  private fun params(): PackageInstaller.SessionParams =
    PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(request.applicationId)
      setSize(request.size)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        setPackageSource(PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE)
      }
    }

  private fun abandon(sessionId: Int) {
    try {
      if (installer.getSessionInfo(sessionId) != null) installer.abandonSession(sessionId)
    } catch (failure: Exception) {
      NativeLog.warn("android-update", "session.abandon_failed", failure)
    }
  }
}

private class AndroidUpdateSessionResult(private val context: Context, sessionId: Int) : AutoCloseable {
  private val action = "${context.packageName}.ANDROID_UPDATE_STATUS.$sessionId"
  private val statuses = Channel<Intent>(Channel.UNLIMITED)
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == action && intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1) == sessionId) {
        statuses.trySend(intent).getOrThrow()
      }
    }
  }
  val callback: PendingIntent = PendingIntent.getBroadcast(
    context, sessionId, Intent(action).setPackage(context.packageName), PendingIntent.FLAG_MUTABLE,
  )

  init {
    try {
      ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
    } catch (failure: Exception) {
      callback.cancel()
      throw failure
    }
  }

  suspend fun await(activity: () -> Activity?): AndroidUpdateOutcome {
    while (true) {
      val intent = statuses.receive()
      val result = handleAndroidUpdateStatus(intent) { confirmation ->
        visibleResourceActivity(activity).startActivity(confirmation)
      }
      if (result != null) return result
    }
  }

  override fun close() {
    callback.cancel()
    context.unregisterReceiver(receiver)
    statuses.close()
  }
}

internal fun handleAndroidUpdateStatus(intent: Intent, confirm: (Intent) -> Unit): AndroidUpdateOutcome? {
  require(intent.hasExtra(PackageInstaller.EXTRA_STATUS)) { "Android's installer did not report an install status" }
  return when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
      val confirmation = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
        ?: error("Android's installer did not provide its confirmation screen")
      confirm(confirmation)
      null
    }
    PackageInstaller.STATUS_SUCCESS -> AndroidUpdateOutcome.INSTALLED
    PackageInstaller.STATUS_FAILURE_ABORTED -> AndroidUpdateOutcome.CANCELLED
    else -> {
      val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)?.trim()?.takeIf { it.isNotEmpty() }
      NativeLog.warn("android-update", "session.install_failed") { mapOf("status" to status, "message" to message) }
      AndroidUpdateOutcome(AndroidUpdateOutcome.FAILED, status, message)
    }
  }
}
