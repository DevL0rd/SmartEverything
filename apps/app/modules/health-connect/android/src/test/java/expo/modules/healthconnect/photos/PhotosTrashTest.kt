package expo.modules.healthconnect.photos

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotosTrashTest {
  private val library = listOf(
    TrashRow(1, video = false, trashed = false),
    TrashRow(2, video = true, trashed = true),
    TrashRow(3, video = true, trashed = false)
  )
  private val asked = mutableListOf<Pair<List<Long>, Boolean>>()
  private val queried = mutableListOf<List<Long>>()

  private fun trash(sdk: Int = 30, failure: Exception? = null) = PhotosTrash(
    sdk,
    { ids -> queried.add(ids); library.filter { it.id in ids } },
    { rows, trashed ->
      asked.add(rows.map { it.id } to trashed)
      if (failure != null) throw failure
    }
  )

  @Test fun `asks the system only for copies not yet in the trash and reports every copy now there`() = runBlocking {
    val subject = trash()
    val answer = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("3", "2", "9", "1"), true) }
    assertEquals(listOf(listOf(3L, 1L) to true), asked)
    subject.finish(true)
    assertEquals(mapOf("outcome" to "done", "ids" to listOf("3", "2", "1")), answer.await())
  }

  @Test fun `a declined system screen keeps the copies and names only those already trashed`() = runBlocking {
    val subject = trash()
    val answer = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("1", "2"), true) }
    subject.finish(false)
    assertEquals(mapOf("outcome" to "declined", "ids" to listOf("2")), answer.await())
  }

  @Test fun `restores only trashed copies`() = runBlocking {
    val subject = trash()
    val answer = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("1", "2"), false) }
    assertEquals(listOf(listOf(2L) to false), asked)
    subject.finish(true)
    assertEquals(mapOf("outcome" to "done", "ids" to listOf("1", "2")), answer.await())
  }

  @Test fun `nothing to change answers at once without the system screen`() = runBlocking {
    assertEquals(mapOf("outcome" to "done", "ids" to listOf("2")), trash().change(listOf("2", "8"), true))
    assertTrue(asked.isEmpty())
  }

  @Test fun `Android 10 and older have no trash and nothing is touched`() = runBlocking {
    assertEquals(mapOf("outcome" to "unsupported", "ids" to emptyList<String>()), trash(sdk = 29).change(listOf("1"), true))
    assertTrue(queried.isEmpty())
    assertTrue(asked.isEmpty())
  }

  @Test fun `a newer request settles the older one as declined`() = runBlocking {
    val subject = trash()
    val first = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("1"), true) }
    val second = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("3"), true) }
    assertEquals("declined", first.await()["outcome"])
    subject.finish(true)
    assertEquals(mapOf("outcome" to "done", "ids" to listOf("3")), second.await())
  }

  @Test fun `a failure to open the system screen reaches the caller and the next request still works`() = runBlocking {
    assertThrows(IllegalStateException::class.java) {
      runBlocking { trash(failure = IllegalStateException("no activity")).change(listOf("1"), true) }
    }
    val subject = trash()
    val answer = async(start = CoroutineStart.UNDISPATCHED) { subject.change(listOf("1"), true) }
    subject.finish(true)
    assertEquals("done", answer.await()["outcome"])
  }

  @Test fun `refuses an id that is not a MediaStore id before querying`() {
    assertThrows(IllegalArgumentException::class.java) {
      runBlocking { trash().change(listOf("content://elsewhere"), true) }
    }
    assertTrue(queried.isEmpty())
  }
}
