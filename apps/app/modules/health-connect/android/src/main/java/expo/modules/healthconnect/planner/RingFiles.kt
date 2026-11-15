package expo.modules.healthconnect.planner

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.relayTarget
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object RingFiles {
  const val RING_DIRECTORY = "planner-ring-sounds"
  const val SLEEP_DIRECTORY = "planner-sleep-sounds"
  private const val SCOPE = "planner-alarm"
  private const val BACKOFF_SECONDS = 30L
  private const val WORK = "planner-ring-files"

  fun nameOf(itemId: String, etag: String): String =
    MessageDigest.getInstance("SHA-256").digest("$itemId:$etag".toByteArray()).joinToString("") { "%02x".format(it) }

  fun wanted(rings: List<PhoneRing>): List<RingSound.File> = rings.map { it.sound }.filterIsInstance<RingSound.File>()

  fun pathOf(itemId: String): String = "/media/drive/$itemId/file"

  fun cacheOf(context: Context, directory: String): RingFileCache = RingFileCache(File(context.filesDir, directory)) { itemId, sink ->
    HubClient(relayTarget(context)).download(pathOf(itemId), sink)
  }

  fun enqueue(context: Context) {
    val request = OneTimeWorkRequestBuilder<RingFilesWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request)
    NativeLog.info(SCOPE, "files.queued")
  }
}

class RingFileCache(private val directory: File, private val fetch: suspend (String, OutputStream) -> Unit) {
  fun pathOf(sound: RingSound.File): String? =
    File(directory, RingFiles.nameOf(sound.itemId, sound.etag)).takeIf { it.isFile }?.path

  suspend fun sync(files: List<RingSound.File>): Boolean {
    directory.mkdirs()
    val wanted = files.associateBy { RingFiles.nameOf(it.itemId, it.etag) }
    directory.listFiles().orEmpty().filter { it.name !in wanted }.forEach { it.delete() }
    return wanted.entries
      .filter { !File(directory, it.key).isFile }
      .map { needsRetry(it.key, it.value) }
      .any { it }
  }

  private suspend fun needsRetry(name: String, sound: RingSound.File): Boolean {
    val part = File(directory, "$name.part")
    return try {
      part.outputStream().use { fetch(sound.itemId, it) }
      if (!part.renameTo(File(directory, name))) {
        throw IOException("${part.name} could not be moved into place")
      }
      false
    } catch (failure: SyncFailure) {
      part.delete()
      NativeLog.warn(SCOPE, "files.download_failed", failure) { mapOf("retry" to failure.retryable) }
      failure.retryable
    } catch (failure: IOException) {
      part.delete()
      NativeLog.warn(SCOPE, "files.download_failed", failure) { mapOf("retry" to true) }
      true
    }
  }

  private companion object {
    const val SCOPE = "planner-alarm"
  }
}

class RingFilesWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val state = RingStore(applicationContext.getSharedPreferences(RingStore.PREFERENCES, Context.MODE_PRIVATE)).load()
    val retry = RingFiles.cacheOf(applicationContext, RingFiles.RING_DIRECTORY).sync(RingFiles.wanted(state.rings))
    return if (retry) Result.retry() else Result.success()
  }
}
