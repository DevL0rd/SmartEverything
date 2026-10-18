package expo.modules.healthconnect.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HubRouteGroupTest {
  private val trust = HubTrust(
    "scope",
    "a".repeat(64),
    "Home",
    "smarteverything-${"b".repeat(32)}.local",
    "c".repeat(64),
    listOf(HubRouteEndpoint("https://hub.example.com", "remote")),
    emptyList(),
  )
  private val lan = HubRouteEndpoint("https://192.168.1.2:7880", "lan")
  private val remote = HubRouteEndpoint("https://hub.example.com", "remote")
  private var counter = 0L
  private val next = { ++counter }

  @Test fun aGroupIsPendingUntilItsFirstProbeSettles() {
    val group = HubRouteGroup("https://hub.example.com", trust)
    assertEquals(HubRouteReadiness.PENDING, group.readiness())
    group.settle(lan, next)
    assertEquals(HubRouteReadiness.READY, group.readiness())
    assertEquals(lan, group.endpoint)
    assertEquals("", group.detail)
  }

  @Test fun aProbeThatFindsNothingKeepsTheLastGoodEndpoint() {
    val group = HubRouteGroup("https://hub.example.com", trust)
    group.settle(lan, next)
    val generation = group.generation
    group.settle(null, next)
    assertEquals(lan, group.endpoint)
    assertEquals(HubRouteReadiness.READY, group.readiness())
    assertEquals(generation, group.generation)
  }

  @Test fun anotherEndpointStartsANewRouteGenerationAndTheSameOneDoesNot() {
    val group = HubRouteGroup("https://hub.example.com", trust)
    group.settle(lan, next)
    val first = group.generation
    group.settle(lan, next)
    assertEquals(first, group.generation)
    group.settle(remote, next)
    assertEquals(first + 1, group.generation)
  }

  @Test fun aGroupWithoutAnyAnswerIsUnavailableAndSaysWhy() {
    val group = HubRouteGroup("https://hub.example.com", trust)
    group.settle(null, next)
    assertNull(group.endpoint)
    assertEquals(HubRouteReadiness.UNAVAILABLE, group.readiness())
    assertEquals("No independently trusted hub identity answered", group.detail)
  }

  @Test fun aGroupRestoredWithItsLastEndpointIsReadyBeforeAnyProbe() {
    val group = HubRouteGroup("https://hub.example.com", trust, lan)
    assertEquals(HubRouteReadiness.READY, group.readiness())
    assertEquals(lan, group.endpoint)
    assertEquals("", group.detail)
    val generation = group.generation
    group.settle(lan, next)
    assertEquals(generation, group.generation)
  }

  @Test fun aProbeThatChangesNothingIsNotAnnouncedAgain() {
    val group = HubRouteGroup("https://hub.example.com", trust, lan)
    assertTrue(group.announce(1))
    group.settle(null, next)
    assertFalse(group.announce(1))
    group.settle(lan, next)
    assertFalse(group.announce(1))
  }

  @Test fun anotherEndpointOrNetworkGenerationIsAnnounced() {
    val group = HubRouteGroup("https://hub.example.com", trust, lan)
    assertTrue(group.announce(1))
    assertTrue(group.announce(2))
    group.settle(remote, next)
    assertTrue(group.announce(2))
    assertFalse(group.announce(2))
  }
}
