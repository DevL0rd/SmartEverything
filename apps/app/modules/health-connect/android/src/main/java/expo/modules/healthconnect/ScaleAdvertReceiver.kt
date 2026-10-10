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
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

object ScaleAdverts {
  private const val PREFERENCES = "expo.modules.healthconnect.scale-adverts"
  private const val PENDING = "pending"
  private const val SENT = "sent"
  private const val WORK_NAME = "expo.modules.healthconnect.scale-relay"
  private const val SENT_WINDOW_MS = 120_000L

  fun relay(context: Context, results: List<ScanResult>) {
    val status = ScaleStatus(context)
    val watched = ScaleRelay(context).watched().map { it.address }.toSet()
    val adverts = results.filter { it.device.address.uppercase() in watched }.flatMap(::advertsOf)
    if (adverts.isEmpty()) {
      return
    }
    val added = remember(context, adverts)
    if (added == 0) {
      return
    }
    status.note("heard", "$added new frame(s) from the scale")
    val request = OneTimeWorkRequestBuilder<ScaleRelayWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
  }

  @Synchronized
  fun take(context: Context): JSONArray {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val pending = JSONObject(preferences.getString(PENDING, "{}") ?: "{}")
    val sent = JSONObject(preferences.getString(SENT, "{}") ?: "{}")
    val now = System.currentTimeMillis()
    val adverts = JSONArray()
    for (key in pending.keys()) {
      adverts.put(pending.getJSONObject(key))
      sent.put(key, now)
    }
    preferences.edit().putString(PENDING, "{}").putString(SENT, sent.toString()).apply()
    return adverts
  }

  @Synchronized
  private fun remember(context: Context, adverts: List<JSONObject>): Int {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val pending = JSONObject(preferences.getString(PENDING, "{}") ?: "{}")
    val sent = recent(JSONObject(preferences.getString(SENT, "{}") ?: "{}"))
    var added = 0
    for (advert in adverts) {
      val key = advert.getString("data")
      if (!pending.has(key) && !sent.has(key)) {
        pending.put(key, advert)
        added += 1
      }
    }
    preferences.edit().putString(PENDING, pending.toString()).putString(SENT, sent.toString()).apply()
    return added
  }

  private fun recent(sent: JSONObject): JSONObject {
    val cutoff = System.currentTimeMillis() - SENT_WINDOW_MS
    val kept = JSONObject()
    for (key in sent.keys()) {
      if (sent.getLong(key) >= cutoff) {
        kept.put(key, sent.getLong(key))
      }
    }
    return kept
  }

  private fun advertsOf(result: ScanResult) = result.scanRecord?.serviceData.orEmpty().map { (uuid, data) ->
    jsonOf(
      "address" to result.device.address.uppercase(),
      "serviceUuid" to uuid.uuid.toString(),
      "data" to data.toHex(),
      "rssi" to result.rssi,
      "seenAt" to Instant.now().toString()
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
    return try {
      var batches = 0
      do {
        val adverts = ScaleAdverts.take(applicationContext)
        if (adverts.length() > 0) {
          send(adverts, status)
          batches += 1
        }
      } while (adverts.length() > 0 && batches < MAX_BATCHES)
      if (batches > 0) {
        saveToHealthConnect(status)
      }
      Result.success()
    } catch (failure: SyncFailure) {
      status.note("failed", failure.message ?: failure.javaClass.simpleName)
      if (failure.retryable) Result.retry() else Result.failure()
    }
  }

  private suspend fun send(adverts: JSONArray, status: ScaleStatus) {
    for (start in 0 until adverts.length() step BATCH_LIMIT) {
      val chunk = JSONArray()
      for (index in start until minOf(adverts.length(), start + BATCH_LIMIT)) {
        chunk.put(adverts.getJSONObject(index))
      }
      val answer = HubClient(relayTarget(applicationContext)).post(ScaleRelay.ADVERTS_PATH, jsonOf("adverts" to chunk))
      status.note("uploaded", "${chunk.length()} frame(s): $answer")
    }
  }

  private suspend fun saveToHealthConnect(status: ScaleStatus) {
    if (!Credentials(applicationContext).configured()) {
      status.note("health_connect_skipped", "Health Connect is not set up on this phone; weigh-ins stay on your server")
      return
    }
    BodyWriter.deliver(applicationContext)
  }

  private companion object {
    const val BATCH_LIMIT = 50
    const val MAX_BATCHES = 20
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
