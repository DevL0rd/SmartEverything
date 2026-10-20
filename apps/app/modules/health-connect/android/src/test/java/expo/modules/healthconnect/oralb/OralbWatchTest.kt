package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.BrushListener
import expo.modules.healthconnect.toothbrush.BrushText
import org.junit.Assert.assertEquals
import org.junit.Test

class OralbWatchTest {
  private class Seen : BrushListener {
    val phases = mutableListOf<Pair<String, String?>>()
    var ended = 0

    override fun phase(phase: String, detail: String?) {
      phases += phase to detail
    }

    override fun notified(characteristic: String, value: ByteArray) = Unit

    override fun ended() {
      ended += 1
    }
  }

  private var now = 100_000L
  private val busy = OralbBusy()
  private val inner = Seen()
  private val watch = OralbWatch(inner, OralbRig.ADDRESS, busy, OralbApp.ABSENT) { now }

  @Test
  fun `a connect failure with a running advert in the last minute reports busy once`() {
    busy.running(OralbRig.ADDRESS, now - 20_000)
    watch.phase("connecting", null)
    watch.phase("asleep", null)
    watch.ended()
    assertEquals(listOf("connecting" to OralbApp.ABSENT, "busy" to BrushText.busy("oralb")), inner.phases)
    assertEquals(1, inner.ended)
  }

  @Test
  fun `a connect failure with no recent running advert stays asleep`() {
    busy.running(OralbRig.ADDRESS, now - 61_000)
    watch.phase("connecting", null)
    watch.phase("asleep", null)
    assertEquals("asleep" to OralbApp.ABSENT, inner.phases.last())
  }

  @Test
  fun `a link that reached linked is not busy when it later sleeps`() {
    busy.running(OralbRig.ADDRESS, now)
    watch.phase("connecting", null)
    watch.phase("linked", null)
    watch.phase("asleep", null)
    assertEquals("asleep", inner.phases.last().first)
  }

  @Test
  fun `a sync that read values is not busy`() {
    busy.running(OralbRig.ADDRESS, now)
    watch.phase("connecting", null)
    watch.notified("ff29", byteArrayOf(1))
    watch.phase("asleep", null)
    assertEquals("asleep", inner.phases.last().first)
  }

  @Test
  fun `details given by the link are kept`() {
    watch.phase("bluetooth_off", "Bluetooth is off")
    assertEquals("bluetooth_off" to "Bluetooth is off", inner.phases.single())
  }

  @Test
  fun `the app marker rides on reports without detail`() {
    watch.phase("linked", null)
    assertEquals("linked" to OralbApp.ABSENT, inner.phases.single())
  }
}
