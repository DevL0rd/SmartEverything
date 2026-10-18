package expo.modules.healthconnect.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HubHtmlGateTest {
  private val gate = HubHtmlGate { 50123 }

  @Test fun theCookieIsHttpOnlySameSiteAndAdmitsRequests() {
    val grant = gate.cookie()
    assertTrue(grant.contains("HttpOnly"))
    assertTrue(grant.contains("SameSite=Strict"))
    val cookie = grant.substringBefore(";")
    assertTrue(cookie.startsWith("se_page_50123="))
    assertTrue(gate.admits(listOf(cookie)))
    assertTrue(gate.admits(listOf("theme=dark; $cookie")))
  }

  @Test fun requestsWithoutTheCookieOrWithAnotherPortsCookieAreRefused() {
    val key = gate.cookie().substringBefore(";").substringAfter("=")
    assertFalse(gate.admits(emptyList()))
    assertFalse(gate.admits(listOf("se_page_50123=${"0".repeat(64)}")))
    assertFalse(gate.admits(listOf("se_page_50124=$key")))
  }

  @Test fun everyGateHasItsOwnKey() {
    val other = HubHtmlGate { 50123 }
    assertFalse(other.admits(listOf(gate.cookie().substringBefore(";"))))
  }
}
