package expo.modules.healthconnect.network

import org.junit.Assert.assertEquals
import org.junit.Test

class HubRouteSelectionTest {
  @Test fun theLastEndpointOfEveryCanonicalSurvivesARestart() {
    val values = mapOf(
      "https://hub.example.com" to HubRouteEndpoint("https://192.168.1.2:7880", "lan"),
      "https://other.example.com" to HubRouteEndpoint("https://other.example.com", "remote"),
    )
    assertEquals(values, HubRouteSelection.decode(HubRouteSelection.encode(values)))
  }

  @Test fun nothingSelectedRoundTripsToNothing() {
    assertEquals(emptyMap<String, HubRouteEndpoint>(), HubRouteSelection.decode(HubRouteSelection.encode(emptyMap())))
  }
}
