package expo.modules.healthconnect.drive

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveOfflinePlanTest {
  private fun entry(rev: Int) = OfflineEntry("item", rev, 10, "a.txt", "text/plain", null, false)

  @Test
  fun `a file is fetched when nothing is held or the revision differs`() {
    assertTrue(DriveOfflinePlan.needsFetch(null, 3))
    assertTrue(DriveOfflinePlan.needsFetch(entry(2), 3))
    assertFalse(DriveOfflinePlan.needsFetch(entry(3), 3))
  }

  @Test
  fun `the offline copy is current only at the known revision`() {
    assertTrue(DriveOfflinePlan.current(entry(3), 3))
    assertFalse(DriveOfflinePlan.current(entry(2), 3))
    assertFalse(DriveOfflinePlan.current(null, 3))
    assertTrue(DriveOfflinePlan.current(entry(2), null))
  }

  @Test
  fun `what is held but no longer wanted is dropped`() {
    assertEquals(listOf("b", "c"), DriveOfflinePlan.surplus(listOf("a", "b", "c"), setOf("a")))
    assertEquals(emptyList<String>(), DriveOfflinePlan.surplus(listOf("a"), setOf("a", "z")))
  }

  @Test
  fun `a copy is named by item and revision`() {
    assertEquals("item-7", DriveOfflinePlan.fileName("item", 7))
  }

  @Test
  fun `the report names ready items with bytes and revision and failed ones with the reason`() {
    val entries = DriveOfflineReport.entries(
      listOf(OfflineOutcome("a", 4, 120, null), OfflineOutcome("b", 0, 0, "The file is gone")),
    ).jsonArray
    val ready = entries[0].jsonObject
    assertEquals("ready", ready.getValue("state").jsonPrimitive.content)
    assertEquals("120", ready.getValue("bytes").jsonPrimitive.content)
    assertEquals("4", ready.getValue("rev").jsonPrimitive.content)
    assertNull(ready["error"])
    val failed = entries[1].jsonObject
    assertEquals("failed", failed.getValue("state").jsonPrimitive.content)
    assertEquals("The file is gone", failed.getValue("error").jsonPrimitive.content)
    assertNull(failed["bytes"])
  }
}
