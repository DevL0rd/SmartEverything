package expo.modules.healthconnect.network

import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import okhttp3.Request
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HubPinsTest {
  private val enrolled = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().public.encoded
  private val stranger = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().public.encoded
  private val name = "smarteverything-0123456789abcdef0123456789abcdef.local"
  private val trust = HubTrust(
    "scope",
    HubPinSet.keyHash(enrolled),
    "Home",
    name,
    "0".repeat(64),
    listOf(
      HubRouteEndpoint("https://192.168.1.5:7880", "lan"),
      HubRouteEndpoint("https://$name:7880", "lan"),
      HubRouteEndpoint("https://[fe80::1]:7880", "lan"),
      HubRouteEndpoint("https://home.example.com", "remote"),
    ),
    listOf(InetAddress.getByName("192.168.1.5")),
  )

  @Test fun onlyTheEnrolledHubKeyIsAccepted() {
    val pins = HubPinSet(listOf(trust))
    assertTrue(pins.acceptsKey(enrolled))
    assertFalse(pins.acceptsKey(stranger))
    assertFalse(HubPinSet(emptyList()).acceptsKey(enrolled))
  }

  @Test fun everyEndpointHostIsAHubHostAndOnlyRemoteOnesAreNotLocal() {
    val pins = HubPinSet(listOf(trust))
    listOf("192.168.1.5", name.uppercase(), "[fe80::1]", "fe80:0:0:0:0:0:0:1", "home.example.com").forEach { assertTrue(it, pins.isHub(it)) }
    assertFalse(pins.isHub("example.org"))
    assertTrue(pins.isLocal("192.168.1.5"))
    assertTrue(pins.isLocal(name))
    assertFalse(pins.isLocal("home.example.com"))
  }

  @Test fun theServerNameResolvesToTheEnrolledAddressesOnly() {
    val pins = HubPinSet(listOf(trust))
    assertEquals(trust.addresses, pins.resolve(name.uppercase()))
    assertNull(pins.resolve("home.example.com"))
  }

  @Test fun theSharedClientResolvesAndRoutesOnTheCurrentPins() {
    val client = HubPins.pinned(OkHttpClient.Builder()).build()
    assertTrue(runCatching { client.dns.lookup(name) }.isFailure)
    HubPins.update(listOf(trust))
    assertEquals(trust.addresses, client.dns.lookup(name))
    assertEquals(listOf(java.net.Proxy.NO_PROXY), client.proxySelector.select(java.net.URI("https://192.168.1.5:7880/")))
    HubPins.update(emptyList())
  }

  @Test fun aRedirectFromAHubHostIsRefusedAndOtherHostsAreNotAffected() {
    ServerSocket(0).use { server ->
      val thread = Thread {
        repeat(2) {
          server.accept().use { socket ->
            socket.getInputStream().read(ByteArray(4096))
            socket.getOutputStream().write("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
          }
        }
      }.apply { isDaemon = true; start() }
      val local = HubRouteEndpoint("http://127.0.0.1:${server.localPort}", "loopback")
      val client = HubPins.pinned(OkHttpClient.Builder().followRedirects(false)).build()
      val request = Request.Builder().url(local.url).build()
      HubPins.update(listOf(trust.copy(inventory = listOf(local))))
      assertTrue(runCatching { client.newCall(request).execute().close() }.exceptionOrNull() is java.io.IOException)
      HubPins.update(emptyList())
      client.newCall(request).execute().use { assertEquals(302, it.code) }
      thread.join(2000)
    }
  }

  @Test fun everyFactoryCallSharesOneClientAndOnePoolThatNetworkChangesEvict() {
    val first = HubPins.sharedClient { OkHttpClient.Builder() }
    val second = HubPins.sharedClient { OkHttpClient.Builder() }
    assertTrue(first === second)
    ServerSocket(0).use { server ->
      val thread = Thread {
        server.accept().use { socket ->
          socket.getInputStream().read(ByteArray(4096))
          socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n".toByteArray())
          socket.getInputStream().read()
        }
      }.apply { isDaemon = true; start() }
      second.newCall(Request.Builder().url("http://127.0.0.1:${server.localPort}/").build()).execute().close()
      assertEquals(1, first.connectionPool.connectionCount())
      HubPins.evictShared()
      assertEquals(0, first.connectionPool.connectionCount())
      thread.join(2000)
    }
  }

  private class Handshake(val key: ByteArray, val port: Int, private val server: SSLServerSocket) : AutoCloseable {
    override fun close() = server.close()
  }

  private fun tlsServer(directory: File): Handshake {
    val store = File(directory, "hub.p12")
    val keytool = File(System.getProperty("java.home"), "bin/keytool").path
    val command = listOf(keytool, "-genkeypair", "-alias", "hub", "-keyalg", "RSA", "-keysize", "2048", "-dname", "CN=hub", "-validity", "1", "-storetype", "PKCS12", "-keystore", store.path, "-storepass", "changeit", "-keypass", "changeit")
    assertEquals(0, ProcessBuilder(command).redirectErrorStream(true).start().also { it.inputStream.readBytes() }.waitFor())
    val keys = KeyStore.getInstance("PKCS12").apply { store.inputStream().use { load(it, "changeit".toCharArray()) } }
    val factory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(keys, "changeit".toCharArray()) }
    val context = SSLContext.getInstance("TLS").apply { init(factory.keyManagers, null, null) }
    val server = context.serverSocketFactory.createServerSocket(0) as SSLServerSocket
    Thread {
      repeat(2) {
        runCatching {
          server.accept().use { socket ->
            socket.getInputStream().read(ByteArray(4096))
            socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
          }
        }
      }
    }.apply { isDaemon = true; start() }
    return Handshake((keys.getCertificate("hub") as X509Certificate).publicKey.encoded, server.localPort, server)
  }

  private fun handshake(pinned: ByteArray, hubHost: Boolean, server: Handshake): Result<Int> {
    val endpoint = HubRouteEndpoint("https://127.0.0.1:${server.port}", "lan")
    val inventory = if (hubHost) listOf(endpoint) else listOf(HubRouteEndpoint("https://192.168.1.5:7880", "lan"))
    HubPins.update(listOf(trust.copy(hubId = HubPinSet.keyHash(pinned), inventory = inventory)))
    val client = HubPins.pinned(OkHttpClient.Builder().followRedirects(false)).build()
    return runCatching { client.newCall(Request.Builder().url(endpoint.url).build()).execute().use { it.code } }
  }

  @Test fun aHubAddressPresentingTheEnrolledKeyConnectsWithoutAMatchingHostname() {
    val directory = createTempDir()
    try {
      tlsServer(directory).use { server -> assertEquals(200, handshake(server.key, true, server).getOrThrow()) }
    } finally {
      HubPins.update(emptyList())
      directory.deleteRecursively()
    }
  }

  @Test fun aCertificateWithAnotherKeyOrOnAFreeHostIsRejected() {
    val directory = createTempDir()
    try {
      tlsServer(directory).use { server ->
        assertTrue(handshake(stranger, true, server).exceptionOrNull() is java.io.IOException)
        assertTrue(handshake(server.key, false, server).exceptionOrNull() is java.io.IOException)
      }
    } finally {
      HubPins.update(emptyList())
      directory.deleteRecursively()
    }
  }
}
