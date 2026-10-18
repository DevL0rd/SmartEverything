package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class XiaomiCipherTest {
  private val key = hex("000102030405060708090a0b0c0d0e0f")
  private val nonce = hex("a0a1a2a3")
  private val payload = hex("0102030405")

  @Test
  fun `an encrypted v1 packet before the watch authenticated is refused`() {
    assertThrows(IllegalStateException::class.java) { XiaomiCipher(true).decryptV1(payload) }
  }

  @Test
  fun `an encrypted v2 packet before the watch authenticated is refused`() {
    assertThrows(IllegalStateException::class.java) { XiaomiCipher(true).decryptV2(payload) }
  }

  @Test
  fun `a v1 packet sealed with the session keys reads back`() {
    val cipher = XiaomiCipher(true)
    cipher.keys = SessionKeys(key + key + nonce + nonce)
    assertArrayEquals(payload, cipher.decryptV1(cipher.encryptV1(payload, 0)))
  }
}
