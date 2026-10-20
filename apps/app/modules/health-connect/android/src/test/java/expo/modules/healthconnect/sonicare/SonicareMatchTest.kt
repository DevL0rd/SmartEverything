package expo.modules.healthconnect.sonicare

import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SonicareMatchTest {
  private val classic = plan("c1", "24:E5:AA:00:00:03", "classic")
  private val condor = plan("c2", "24:E5:AA:00:00:09", "condor")
  private val classicService = "477ea600-a260-11e4-ae37-0002a5d50001"
  private val condorService = "e50ba3c0-af04-4564-92ad-fef019489de6"

  private fun plan(id: String, address: String, stack: String) =
    LinkPlan(
      deviceId = id,
      address = address,
      transport = if (stack == "condor") "condor" else "gatt",
      brand = "sonicare",
      bonded = false,
      adverts = null,
      prepare = emptyList(),
      subscriptions = emptyList(),
      reads = emptyList(),
      sync = emptyList(),
      initial = emptyList(),
      policy = "on_demand",
      holder = true
    )

  @Test
  fun `wakes the Classic brush whose address it heard`() {
    val heard = Heard("24:e5:aa:00:00:03", setOf(classicService))
    assertEquals(classic, SonicareMatch.matching(heard, listOf(classic, condor)))
  }

  @Test
  fun `ignores a Classic brush it has no plan for`() {
    val heard = Heard("11:22:33:44:55:66", setOf(classicService))
    assertNull(SonicareMatch.matching(heard, listOf(classic, condor)))
  }

  @Test
  fun `wakes a Condor brush from any address because it changes address on every wake`() {
    val byText = Heard("5A:11:22:33:44:55", emptySet(), mapOf(477 to "Condor".toByteArray()))
    val byService = Heard("6B:11:22:33:44:55", setOf(condorService))
    assertEquals(condor, SonicareMatch.matching(byText, listOf(classic, condor)))
    assertEquals(condor, SonicareMatch.matching(byService, listOf(classic, condor)))
    assertNull(SonicareMatch.matching(byText, listOf(classic)))
  }

  @Test
  fun `ignores adverts that are not a Sonicare`() {
    assertNull(SonicareMatch.matching(Heard("24:E5:AA:00:00:03", setOf("180f")), listOf(classic)))
  }
}
