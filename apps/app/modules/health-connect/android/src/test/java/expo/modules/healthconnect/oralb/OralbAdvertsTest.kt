package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.BrushAdvert
import org.junit.Assert.assertEquals
import org.junit.Test

class OralbAdvertsTest {
  private var now = 5_000L
  private val adverts = OralbAdverts({ now })
  private val sent = mutableListOf<List<BrushAdvert>>()

  private fun advert(tag: Int) = BrushAdvert("t$tag", -50, "00")

  private fun add(tag: Int, closing: Boolean = false) =
    adverts.add("device", listOf(advert(tag)), closing) { sent += it }

  @Test
  fun `the first advert is sent at once`() {
    add(1)
    assertEquals(listOf(listOf("t1")), sent.map { batch -> batch.map { it.at } })
  }

  @Test
  fun `adverts inside one second are held and leave together in one batch`() {
    add(1)
    now += 300
    add(2)
    now += 300
    add(3)
    assertEquals(1, sent.size)
    now += 400
    add(4)
    assertEquals(2, sent.size)
    assertEquals(listOf("t2", "t3", "t4"), sent.last().map { it.at })
  }

  @Test
  fun `a closing advert flushes everything held`() {
    add(1)
    now += 100
    add(2)
    now += 100
    add(3, closing = true)
    assertEquals(2, sent.size)
    assertEquals(listOf("t2", "t3"), sent.last().map { it.at })
  }

  @Test
  fun `one wake with many adverts makes one batch`() {
    adverts.add("device", listOf(advert(1), advert(2), advert(3)), false) { sent += it }
    assertEquals(1, sent.size)
    assertEquals(3, sent.single().size)
  }

  @Test
  fun `devices are coalesced separately`() {
    adverts.add("one", listOf(advert(1)), false) { sent += it }
    adverts.add("two", listOf(advert(2)), false) { sent += it }
    assertEquals(2, sent.size)
  }
}
