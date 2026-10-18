package expo.modules.healthconnect

import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import expo.modules.healthconnect.diagnostics.NativeLog
import java.time.Instant

class BleAcknowledgmentInvalid(detail: String) : SyncFailure(
  "The server did not acknowledge the complete Bluetooth batch: $detail",
  retryable = true
)

object ScaleAdverts {
  private const val WORK_NAME = "expo.modules.healthconnect.scale-relay"

  @Synchronized
  fun relay(context: Context, results: List<ScanResult>) {
    val watched = ScaleRelay(context).watched().map { it.address }.toSet()
    val adverts = results.filter { it.device.address.uppercase() in watched }
      .sortedBy { it.timestampNanos }
      .flatMap(::advertsOf)
    if (adverts.isEmpty()) return
    val added = BleAdvertOutbox.remember(context, adverts)
    if (added == 0) return
    ScaleStatus(context).note("heard", "$added new Bluetooth frame(s)")
    resume(context)
  }

  fun resume(context: Context) {
    if (!BleAdvertOutbox.pending(context)) return
    val request = OneTimeWorkRequestBuilder<ScaleRelayWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
  }

  private fun advertsOf(result: ScanResult) = result.scanRecord?.serviceData.orEmpty().map { (uuid, data) ->
    BleAdvert(
      address = result.device.address.uppercase(),
      serviceUuid = uuid.uuid.toString(),
      data = data.toHex(),
      rssi = result.rssi,
      seenAt = Instant.now()
    )
  }
}

class ScaleAdvertReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("ScaleAdvertReceiver") {
    val error = intent.getIntExtra(BluetoothLeScanner.EXTRA_ERROR_CODE, NO_ERROR)
    if (error != NO_ERROR) {
      ScaleStatus(context).note("failed", "The background scan stopped with error $error")
      return@run
    }
    ScaleAdverts.relay(context, resultsOf(intent))
  }

  private fun resultsOf(intent: Intent): List<ScanResult> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT, ScanResult::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT)
    }.orEmpty()

  private companion object {
    const val NO_ERROR = 0
  }
}

class ScaleRelayWorker(context: Context, parameters: WorkerParameters) :
  CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val status = ScaleStatus(applicationContext)
    val started = System.nanoTime()
    NativeLog.info(SCOPE, "worker.started") { mapOf("attempt" to runAttemptCount) }
    return try {
      var batches = 0
      while (batches < MAX_BATCHES) {
        val batch = BleAdvertOutbox.peek(applicationContext)
        if (batch.ids.isEmpty()) break
        send(batch, status)
        batches += 1
      }
      saveToHealthConnect(status)
      val more = BleAdvertOutbox.pending(applicationContext)
      NativeLog.info(SCOPE, "worker.finished", NativeLog.elapsedMs(started)) { mapOf("batches" to batches, "morePending" to more) }
      if (more) Result.retry() else Result.success()
    } catch (failure: SyncFailure) {
      NativeLog.warn(SCOPE, "worker.failed", failure, NativeLog.elapsedMs(started)) { mapOf("retryable" to failure.retryable, "attempt" to runAttemptCount) }
      status.note("failed", failure.message ?: failure.javaClass.simpleName)
      if (failure.retryable) Result.retry() else Result.failure()
    }
  }

  private suspend fun send(batch: BleAdvertBatch, status: ScaleStatus) {
    val sendStarted = System.nanoTime()
    val answer = HubClient(relayTarget(applicationContext))
      .post<BleAdvertRequest, BleRelayResult>(ScaleRelay.ADVERTS_PATH, BleAdvertRequest(batch.adverts))
    NativeLog.debug(SCOPE, "batch.sent", NativeLog.elapsedMs(sendStarted)) { mapOf("frames" to batch.ids.size) }
    if (answer.accepted < 0 || answer.ignored < 0 || answer.accepted + answer.ignored != batch.ids.size) {
      throw BleAcknowledgmentInvalid("accepted and ignored counts do not cover the submitted frames")
    }
    BleAdvertOutbox.acknowledge(applicationContext, batch)
    status.note("uploaded", "${batch.ids.size} Bluetooth frame(s): ${answer.accepted} accepted, ${answer.ignored} ignored")
  }

  private suspend fun saveToHealthConnect(status: ScaleStatus) {
    if (!HealthConnectAccess.connected(applicationContext)) {
      status.note("health_connect_skipped", "Health Connect is not set up on this phone; weigh-ins stay on your server")
      return
    }
    BodyWriter.deliver(applicationContext)
  }

  private companion object {
    const val MAX_BATCHES = 20
    const val SCOPE = "ble-sync"
  }

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forScale(applicationContext)
}

class ScaleRelayRestart : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("ScaleRelayRestart") {
      try {
        ScaleRelay(context).resume()
      } catch (failure: SyncFailure) {
        ScaleStatus(context).note("failed", "Listening did not restart: ${failure.message}")
      }
    }
  }
}
