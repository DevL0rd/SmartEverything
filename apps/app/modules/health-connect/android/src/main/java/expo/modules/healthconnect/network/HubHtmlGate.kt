package expo.modules.healthconnect.network

import io.netty.handler.codec.http.cookie.ServerCookieDecoder
import java.security.MessageDigest
import java.security.SecureRandom

class HubHtmlGate(private val port: () -> Int) {
  private val key = ByteArray(KEY_BYTES).also(SecureRandom()::nextBytes).joinToString("") { "%02x".format(it.toInt() and 255) }

  fun admits(cookieHeaders: List<String>): Boolean =
    cookieHeaders.flatMap { ServerCookieDecoder.STRICT.decode(it) }.any { it.name() == cookieName() && sameKey(it.value()) }

  fun cookie(): String = "${cookieName()}=$key; Path=/; HttpOnly; SameSite=Strict"

  private fun cookieName(): String = "$COOKIE_PREFIX${port()}"

  private fun sameKey(value: String): Boolean = MessageDigest.isEqual(value.toByteArray(), key.toByteArray())

  private companion object {
    const val KEY_BYTES = 32
    const val COOKIE_PREFIX = "se_page_"
  }
}
