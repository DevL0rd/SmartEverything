package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class XiaomiCryptoTest {
  private val key = hex("000102030405060708090a0b0c0d0e0f")
  private val nonce = hex("a0a1a2a3a4a5a6a7a8a9aaab")
  private val plain = "SmartEverything watch payload 0123456789".toByteArray(Charsets.US_ASCII)
  private val sealed = hex(
    "fdde09a3d17abce4a0bf7495f35ebec33c965baad9abaa61f6bb5f6dc10cd8f41edc5c049349fcc797dd1e4c"
  )

  @Test
  fun `ccm encrypt matches a vector from an independent AES-CCM implementation`() {
    assertArrayEquals(sealed, XiaomiCrypto.ccmEncrypt(key, nonce, plain))
  }

  @Test
  fun `ccm decrypt of the independent vector returns the plain text`() {
    assertArrayEquals(plain, XiaomiCrypto.ccmDecrypt(key, nonce, sealed, true))
  }

  @Test
  fun `ccm of an empty message is only the tag`() {
    val tagOnly = hex("6994dbc2")
    assertArrayEquals(tagOnly, XiaomiCrypto.ccmEncrypt(key, nonce, ByteArray(0)))
    assertEquals(0, XiaomiCrypto.ccmDecrypt(key, nonce, tagOnly, true).size)
  }

  @Test
  fun `ccm decrypt rejects a flipped payload bit`() {
    val tampered = sealed.copyOf().also { it[3] = (it[3].toInt() xor 1).toByte() }
    assertThrows(XiaomiMacMismatch::class.java) { XiaomiCrypto.ccmDecrypt(key, nonce, tampered, true) }
  }

  @Test
  fun `ccm decrypt rejects a wrong key`() {
    val wrong = key.copyOf().also { it[0] = 0x7f }
    assertThrows(XiaomiMacMismatch::class.java) { XiaomiCrypto.ccmDecrypt(wrong, nonce, sealed, true) }
  }

  @Test
  fun `ccm decrypt rejects a message shorter than the tag`() {
    assertThrows(XiaomiMacMismatch::class.java) { XiaomiCrypto.ccmDecrypt(key, nonce, ByteArray(3), true) }
  }

  @Test
  fun `ccm decrypt without a tag check returns the plain text even for a bad tag`() {
    val badTag = sealed.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 0xff).toByte() }
    assertArrayEquals(plain, XiaomiCrypto.ccmDecrypt(key, nonce, badTag, false))
  }

  @Test
  fun `session keys match an independent HKDF-SHA256 with the miwear-auth label`() {
    val secret = hex("101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f")
    val phone = hex("404142434445464748494a4b4c4d4e4f")
    val watch = hex("606162636465666768696a6b6c6d6e6f")
    val keys = XiaomiCrypto.sessionKeys(secret, phone, watch)
    val expected = hex(
      "b7fe6fdee289e1a7b42bb6a52eab0ca187c86d6b2d536ee01944dfddecf2dd77" +
        "214bc36bbdb526b55b2b77f66f0e55c09bc5c9c9f829d5eb581b9156c0c12058"
    )
    assertArrayEquals(expected.copyOfRange(0, 16), keys.decryptionKey)
    assertArrayEquals(expected.copyOfRange(16, 32), keys.encryptionKey)
    assertArrayEquals(expected.copyOfRange(32, 36), keys.decryptionNonce)
    assertArrayEquals(expected.copyOfRange(36, 40), keys.encryptionNonce)
  }

  @Test
  fun `hmac concatenates its parts`() {
    val expected = hex("77f3587c7176c9a3b22e0f2fd6478e884c71ea80e4f0638da4b95872d99ecab5")
    val parts = arrayOf("abc".toByteArray(), "def".toByteArray())
    assertArrayEquals(expected, XiaomiCrypto.hmac(key, *parts))
  }

  @Test
  fun `ctr uses the key as its initial counter block`() {
    val expected = hex("69fb7edb350b82659cacf03de63e8f2971028bf1")
    assertArrayEquals(expected, XiaomiCrypto.ctr(key, "counter mode message".toByteArray()))
  }

  @Test
  fun `the packet nonce is the base then four zero bytes then the little endian counter`() {
    val nonce = XiaomiCrypto.packetNonce(hex("01020304"), 0x0a0b0c0d)
    assertArrayEquals(hex("01020304 00000000 0d0c0b0a"), nonce)
  }
}
