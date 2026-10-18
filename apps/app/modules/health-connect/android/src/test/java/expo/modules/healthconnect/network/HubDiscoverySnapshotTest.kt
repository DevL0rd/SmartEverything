package expo.modules.healthconnect.network

import org.junit.Assert.assertEquals
import org.junit.Test

class HubDiscoverySnapshotTest {
  @Test fun theJsEventCarriesTheCandidateFieldsTheAppParses() {
    val candidate = HubCandidate("Home", "https://192.168.1.5:8443", "a".repeat(64), 1)
    val event = HubDiscoverySnapshot(3, "searching", "", listOf(candidate)).toMap()
    assertEquals(3L, event["generation"])
    assertEquals("searching", event["state"])
    assertEquals(
      listOf(mapOf("name" to "Home", "url" to "https://192.168.1.5:8443", "hubId" to "a".repeat(64), "protocolVersion" to 1)),
      event["candidates"],
    )
  }
}
