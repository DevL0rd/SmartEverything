package expo.modules.healthconnect.toothbrush

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushWakeTest {
  private class Named(override val brand: String, private val services: Set<String>) : BrushMatcher {
    override fun matching(heard: Heard, plans: List<LinkPlan>): LinkPlan? =
      if (heard.services.any { it in services }) plans.firstOrNull() else null

    override fun woken(context: Context, plan: LinkPlan, heard: List<Heard>) = Unit
  }

  private val sonicare = Named("sonicare", setOf("s"))
  private val oralb = Named("oralb", setOf("o"))
  private val sonicarePlan = Rig.plan(brand = "sonicare", deviceId = "44444444-4444-4444-8444-444444444444")
  private val oralbPlan = Rig.plan(brand = "oralb")
  private val matchers = listOf(sonicare, oralb)

  @Test
  fun `routes each advert to the matcher of its brand and the plans of that brand only`() {
    val wakes = BrushWake.route(listOf(Heard("X", setOf("o")), Heard("Y", setOf("s"))), listOf(sonicarePlan, oralbPlan), matchers)
    assertEquals(listOf("oralb", "sonicare"), wakes.map { it.plan.brand })
    assertEquals(listOf(oralb, sonicare), wakes.map { it.matcher })
  }

  @Test
  fun `a matcher never sees a plan of another brand`() {
    val wakes = BrushWake.route(listOf(Heard("X", setOf("o"))), listOf(sonicarePlan), matchers)
    assertTrue(wakes.isEmpty())
  }

  @Test
  fun `adverts for one brush are grouped into one wake`() {
    val first = Heard("X", setOf("o"), rssi = -50)
    val second = Heard("X", setOf("o"), rssi = -51)
    val wakes = BrushWake.route(listOf(first, second), listOf(oralbPlan), matchers)
    assertEquals(1, wakes.size)
    assertEquals(listOf(first, second), wakes.single().heard)
  }

  @Test
  fun `unknown adverts wake nothing`() {
    assertTrue(BrushWake.route(listOf(Heard("X", setOf("q"))), listOf(sonicarePlan, oralbPlan), matchers).isEmpty())
  }
}
