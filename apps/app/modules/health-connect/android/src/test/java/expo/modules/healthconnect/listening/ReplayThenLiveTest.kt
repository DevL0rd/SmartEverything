package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class ReplayThenLiveTest {
  private val heard = ArrayList<ShortArray>()

  private fun joined(held: ShortArray) = ReplayThenLive({ heard.add(it) }, { held })

  @Test
  fun `without a hold live audio goes straight through after the replay step`() {
    val join = joined(ShortArray(0))
    val frame = ShortArray(960)
    join.live(frame)
    assertEquals(0, heard.size)
    join.replay()
    assertEquals(1, heard.size)
    assertSame(frame, heard[0])
    val next = ShortArray(960)
    join.live(next)
    assertSame(next, heard[1])
  }

  @Test
  fun `held words are played before the audio that arrived while they were taken`() {
    val join = joined(ShortArray(640) { 4 })
    val live = ShortArray(960) { 9 }
    join.live(live)
    join.replay()
    assertEquals(listOf(960, 960), heard.map { it.size })
    assertEquals(4, heard[0][0].toInt())
    assertSame(live, heard.last())
  }

  @Test
  fun `audio the ear heard while the call was starting is not played twice`() {
    val join = joined(ShortArray(640) { 4 })
    join.live(ShortArray(960) { 9 })
    join.live(ShortArray(960) { 9 })
    join.replay()
    assertEquals(2, heard.size)
    assertEquals(9, heard[0][0].toInt())
  }

  @Test
  fun `replaying twice plays the hold once`() {
    val join = joined(ShortArray(320) { 4 })
    join.replay()
    join.replay()
    assertEquals(1, heard.size)
  }
}
