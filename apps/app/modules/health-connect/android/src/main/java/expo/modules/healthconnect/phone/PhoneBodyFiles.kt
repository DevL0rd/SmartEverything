package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.Operation
import androidx.work.WorkManager
import androidx.work.await
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

object PhoneBodyFiles {
  private const val DIRECTORY = "phone-posts"
  private const val QUEUING_GRACE_MS = 60_000L
  private val scope = CoroutineScope(
    Dispatchers.IO + CoroutineExceptionHandler { _, failure -> PhoneEvents.emit("body_files_not_pruned", failure.message.orEmpty()) }
  )

  fun write(context: Context, text: String): String {
    val name = UUID.randomUUID().toString()
    File(directory(context), name).writeText(text)
    return name
  }

  fun read(context: Context, name: String): String? = File(directory(context), name).takeIf(File::exists)?.readText()

  fun delete(context: Context, name: String) {
    File(directory(context), name).delete()
  }

  fun pruneUnreferenced(context: Context, after: Operation? = null, graceMs: Long = QUEUING_GRACE_MS) {
    val app = context.applicationContext
    val queuedBefore = System.currentTimeMillis() - graceMs
    scope.launch {
      after?.await()
      val pending = WorkManager.getInstance(app).getWorkInfosByTagFlow(PhonePostWorker.BODY_FILE_TAG).first()
        .filter { !it.state.isFinished }
        .flatMap { info -> info.tags.mapNotNull(PhonePostWorker::fileOfTag) }
        .toSet()
      unreferenced(directory(app).listFiles().orEmpty().toList(), pending, queuedBefore).forEach(File::delete)
    }
  }

  fun unreferenced(files: List<File>, pending: Set<String>, queuedBefore: Long): List<File> =
    files.filter { it.name !in pending && it.lastModified() < queuedBefore }

  private fun directory(context: Context): File = File(context.filesDir, DIRECTORY).apply { mkdirs() }
}
