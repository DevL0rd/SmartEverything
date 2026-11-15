package expo.modules.healthconnect.photos

import kotlinx.coroutines.CompletableDeferred

internal data class TrashRow(val id: Long, val video: Boolean, val trashed: Boolean)

internal class PhotosTrash(
  private val sdk: Int,
  private val rows: (List<Long>) -> List<TrashRow>,
  private val prompt: suspend (List<TrashRow>, Boolean) -> Unit
) {
  @Volatile private var pending: CompletableDeferred<Boolean>? = null

  suspend fun change(values: List<String>, trash: Boolean): Map<String, Any> {
    if (sdk < TRASH_SDK) return answer(UNSUPPORTED, emptyList())
    val ids = values.map { requireNotNull(it.toLongOrNull()) { "Local media id $it is not a MediaStore id" } }
    val found = rows(ids).associateBy { it.id }
    val present = ids.mapNotNull { found[it] }
    val ready = present.filter { it.trashed == trash }
    val todo = present.filter { it.trashed != trash }
    if (todo.isEmpty()) return answer(DONE, ready.map { it.id })
    val accepted = ask(todo, trash)
    val changed = if (accepted) present else ready
    return answer(if (accepted) DONE else DECLINED, changed.map { it.id })
  }

  private suspend fun ask(todo: List<TrashRow>, trash: Boolean): Boolean {
    val answer = CompletableDeferred<Boolean>()
    pending?.complete(false)
    pending = answer
    try {
      prompt(todo, trash)
    } catch (failure: Exception) {
      if (pending === answer) pending = null
      throw failure
    }
    return answer.await()
  }

  fun finish(accepted: Boolean) {
    pending?.complete(accepted)
    pending = null
  }

  private fun answer(outcome: String, ids: List<Long>): Map<String, Any> =
    mapOf("outcome" to outcome, "ids" to ids.map { it.toString() })

  companion object {
    const val TRASH_SDK = 30
    const val DONE = "done"
    const val DECLINED = "declined"
    const val UNSUPPORTED = "unsupported"
  }
}
