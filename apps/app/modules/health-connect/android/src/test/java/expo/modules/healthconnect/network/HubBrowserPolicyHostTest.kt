package expo.modules.healthconnect.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HubBrowserPolicyHostTest {
  @Test fun homeNetworkDevicesCanBeOpened() {
    listOf("192.168.1.1", "10.0.0.5", "172.16.4.2", "169.254.10.1", "[fd00::1]", "[fe80::1]", "router.local", "printer", "nas.lan", "hub.home.arpa")
      .forEach { assertTrue(it, HubBrowserPolicy.privateNetworkHost(it)) }
  }

  @Test fun loopbackAndPublicAddressesAreNotPrivateNetworkHosts() {
    listOf("127.0.0.1", "localhost", "[::1]", "0.0.0.0", "8.8.8.8", "172.32.0.1", "example.com")
      .forEach { assertFalse(it, HubBrowserPolicy.privateNetworkHost(it)) }
  }

  @Test fun publicHostsAreNamedInternetHostsOnly() {
    assertTrue(HubBrowserPolicy.publicHost("example.com"))
    listOf("8.8.8.8", "printer", "router.local", "nas.lan", "x.test", "localhost").forEach { assertFalse(it, HubBrowserPolicy.publicHost(it)) }
  }
}
