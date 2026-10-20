package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.sonicare.SonicareMatch
import expo.modules.healthconnect.toothbrush.BrushWake
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class OralbMatchTest {
  private val plan = OralbRig.plan()
  private val other = OralbRig.plan(address = "B0:00:00:00:00:02", deviceId = "55555555-5555-4555-8555-555555555555")

  @Test
  fun `matches a company 220 advert from a known address in any letter case`() {
    val heard = OralbRig.heard(3, address = "a4:c1:38:00:00:01")
    assertSame(plan, OralbMatch.matching(heard, listOf(plan)))
  }

  @Test
  fun `ignores other company ids`() {
    val heard = Heard(plan.address, emptySet(), mapOf(477 to OralbRig.data(3)))
    assertNull(OralbMatch.matching(heard, listOf(plan)))
  }

  @Test
  fun `ignores unknown addresses`() {
    assertNull(OralbMatch.matching(OralbRig.heard(3, address = "A4:C1:38:00:00:99"), listOf(plan)))
  }

  @Test
  fun `ignores data too short to hold a state`() {
    val heard = Heard(plan.address, emptySet(), mapOf(220 to byteArrayOf(8, 0x36, 0x52)))
    assertNull(OralbMatch.matching(heard, listOf(plan)))
  }

  @Test
  fun `picks the plan whose address matches among several`() {
    assertSame(plan, OralbMatch.matching(OralbRig.heard(3), listOf(other, plan)))
  }

  @Test
  fun `reads the state byte as unsigned`() {
    assertEquals(115, OralbAdvert.stateOf(OralbRig.data(115)))
    assertEquals(200, OralbAdvert.stateOf(OralbRig.data(200)))
  }

  @Test
  fun `the shared router sends an Oral-B advert to this matcher and groups a brush into one wake`() {
    val wakes = BrushWake.route(listOf(OralbRig.heard(3), OralbRig.heard(3)), listOf(plan, other), listOf(SonicareMatch, OralbMatch))
    assertEquals(1, wakes.size)
    assertSame(OralbMatch, wakes.single().matcher)
    assertEquals(2, wakes.single().heard.size)
  }
}
