package expo.modules.healthconnect.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AckDecisionTest {
  private val fileOf = mapOf("r1" to "a", "r2" to "b", "r3" to "c")
  private val all = setOf("a", "b", "c")

  private fun keep(
    unmatched: Set<String> = emptySet(),
    unbuildable: List<String> = emptyList(),
    withoutStages: List<String> = emptyList(),
    refused: List<String> = emptyList(),
    refusedAll: Boolean = false
  ) = AckDecision.keep(fileOf, all, unmatched, unbuildable, withoutStages, refused, refusedAll)

  @Test
  fun `everything written is acknowledged`() {
    assertTrue(keep().isEmpty())
  }

  @Test
  fun `a refused batch keeps only the files that own its records`() {
    assertEquals(setOf("a", "c"), keep(refused = listOf("r1", "r3")))
  }

  @Test
  fun `a refusal of the whole write keeps every file`() {
    assertEquals(all, keep(refusedAll = true))
  }

  @Test
  fun `nights without stages unbuildable records and unmatched routes stay on the watch`() {
    assertEquals(setOf("a", "b", "x"), keep(unmatched = setOf("x"), unbuildable = listOf("r1"), withoutStages = listOf("r2")))
  }

  @Test
  fun `held files are never acknowledged and kept files are not either`() {
    assertEquals(listOf("c"), AckDecision.acknowledge(listOf("a", "b", "c"), setOf("a"), setOf("b")))
  }

  @Test
  fun `a refused file is not held so the next sync lists it again`() {
    val acknowledged = AckDecision.acknowledge(listOf("a"), keep(refused = listOf("r1")), emptySet())
    assertTrue(acknowledged.isEmpty())
    assertTrue(SkippedFiles(expo.modules.healthconnect.MemoryPreferences(), "w", 1).isEmpty())
  }
}
