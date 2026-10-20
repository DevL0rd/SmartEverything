package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.BrushAdvert
import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OralbRouteTest {
  private class Recorder : OralbActions {
    val log = mutableListOf<String>()
    val relayed = mutableListOf<BrushAdvert>()

    override fun connect(address: String) {
      log += "connect $address"
    }

    override fun sync(address: String) {
      log += "sync $address"
    }

    override fun relay(plan: LinkPlan, adverts: List<BrushAdvert>, closing: Boolean) {
      log += "relay ${adverts.size} closing=$closing"
      relayed.addAll(adverts)
    }
  }

  private var now = 1_000_000L
  private var held = false
  private val actions = Recorder()
  private val busy = OralbBusy()
  private val pace = OralbPace()
  private val route = OralbRoute(actions, { held }, busy, pace, { now })

  private fun wake(plan: LinkPlan, vararg heard: Heard) = route.woken(plan, heard.toList())

  @Test
  fun `running adverts go to the relay and nothing connects in broadcast mode`() {
    wake(OralbRig.plan(), OralbRig.heard(3), OralbRig.heard(3))
    assertEquals(listOf("relay 2 closing=false"), actions.log)
  }

  @Test
  fun `a summary advert is relayed as closing and starts the sync plan`() {
    wake(OralbRig.plan(), OralbRig.heard(9))
    assertEquals(listOf("relay 1 closing=true", "sync ${OralbRig.ADDRESS}"), actions.log)
  }

  @Test
  fun `the post brushing summary state also starts the sync`() {
    wake(OralbRig.plan(), OralbRig.heard(10))
    assertTrue(actions.log.contains("sync ${OralbRig.ADDRESS}"))
  }

  @Test
  fun `a plan with an empty sync list is not synced`() {
    wake(OralbRig.plan(sync = false), OralbRig.heard(9))
    assertEquals(listOf("relay 1 closing=true"), actions.log)
  }

  @Test
  fun `idle and charging adverts do nothing`() {
    wake(OralbRig.plan(), OralbRig.heard(2), OralbRig.heard(4))
    assertTrue(actions.log.isEmpty())
  }

  @Test
  fun `live mode connected starts a notification link instead of relaying`() {
    wake(OralbRig.plan(live = true), OralbRig.heard(3))
    assertEquals(listOf("connect ${OralbRig.ADDRESS}"), actions.log)
  }

  @Test
  fun `live mode connected does not connect for a summary advert`() {
    wake(OralbRig.plan(live = true), OralbRig.heard(9))
    assertEquals(listOf("relay 1 closing=true", "sync ${OralbRig.ADDRESS}"), actions.log)
  }

  @Test
  fun `a connect is not repeated at advert pace and the adverts flow meanwhile`() {
    val plan = OralbRig.plan(live = true)
    wake(plan, OralbRig.heard(3))
    now += 1_000
    wake(plan, OralbRig.heard(3))
    assertEquals(listOf("connect ${OralbRig.ADDRESS}", "relay 1 closing=false"), actions.log)
    now += OralbPace.RETRY_MS
    wake(plan, OralbRig.heard(3))
    assertEquals("connect ${OralbRig.ADDRESS}", actions.log.last())
  }

  @Test
  fun `one sync per summary episode until a new session runs`() {
    val plan = OralbRig.plan()
    wake(plan, OralbRig.heard(9))
    now += 2_000
    wake(plan, OralbRig.heard(9))
    assertEquals(1, actions.log.count { it.startsWith("sync") })
    wake(plan, OralbRig.heard(3))
    now += 2_000
    wake(plan, OralbRig.heard(9))
    assertEquals(2, actions.log.count { it.startsWith("sync") })
  }

  @Test
  fun `a held link relays and connects nothing`() {
    held = true
    wake(OralbRig.plan(live = true), OralbRig.heard(3), OralbRig.heard(9))
    assertTrue(actions.log.isEmpty())
  }

  @Test
  fun `a running advert marks the brush recently seen for busy reporting`() {
    wake(OralbRig.plan(), OralbRig.heard(3))
    assertTrue(busy.recent(OralbRig.ADDRESS, now + 1_000))
    assertFalse(busy.recent(OralbRig.ADDRESS, now + OralbBusy.WINDOW_MS + 1))
  }

  @Test
  fun `adverts carry the scan age and the state bytes unchanged`() {
    wake(OralbRig.plan(), OralbRig.heard(3, rssi = -48, ageMs = 4_000, seconds = 12))
    val advert = actions.relayed.single()
    assertEquals(-48, advert.rssi)
    assertEquals(java.time.Instant.ofEpochMilli(now - 4_000).toString(), advert.at)
    assertEquals("0836520332000c05000100", advert.hex)
  }

  @Test
  fun `adverts of other companies wake nothing`() {
    wake(OralbRig.plan(), Heard(OralbRig.ADDRESS, emptySet(), mapOf(477 to OralbRig.data(3))))
    assertTrue(actions.log.isEmpty())
  }
}
