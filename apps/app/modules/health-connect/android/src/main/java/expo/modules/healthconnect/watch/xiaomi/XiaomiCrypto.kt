package expo.modules.healthconnect.watch.xiaomi

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

class XiaomiMacMismatch(what: String) : SecurityException("The watch's $what did not verify; the key is wrong")

class SessionKeys(material: ByteArray) {
  val decryptionKey: ByteArray = material.copyOfRange(0, 16)
  val encryptionKey: ByteArray = material.copyOfRange(16, 32)
  val decryptionNonce: ByteArray = material.copyOfRange(32, 36)
  val encryptionNonce: ByteArray = material.copyOfRange(36, 40)
}

object XiaomiCrypto {
  private const val BLOCK = 16
  private const val TAG = 4
  private const val NONCE = 12
  private const val LENGTH_BYTES = 3
  private const val CCM_FLAGS = ((TAG - 2) / 2 shl 3) or (LENGTH_BYTES - 1)
  private val LABEL = "miwear-auth".toByteArray(Charsets.US_ASCII)

  fun hmac(key: ByteArray, vararg parts: ByteArray): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(key, "HmacSHA256"))
    parts.forEach { mac.update(it) }
    return mac.doFinal()
  }

  fun sessionKeys(secret: ByteArray, phoneNonce: ByteArray, watchNonce: ByteArray): SessionKeys {
    val prk = hmac(phoneNonce + watchNonce, secret)
    val output = ByteArray(64)
    var previous = ByteArray(0)
    var filled = 0
    var counter = 1
    while (filled < output.size) {
      previous = hmac(prk, previous, LABEL, byteArrayOf(counter.toByte()))
      val take = minOf(previous.size, output.size - filled)
      System.arraycopy(previous, 0, output, filled, take)
      filled += take
      counter += 1
    }
    return SessionKeys(output)
  }

  fun packetNonce(base: ByteArray, counter: Int): ByteArray =
    ByteBuffer.allocate(NONCE).order(ByteOrder.LITTLE_ENDIAN).put(base).putInt(0).putInt(counter).array()

  fun ccmEncrypt(key: ByteArray, nonce: ByteArray, plain: ByteArray): ByteArray {
    val tag = cbcMac(key, nonce, plain)
    val stream = keyStream(key, nonce, plain.size + BLOCK)
    val cipher = ByteArray(plain.size) { (plain[it].toInt() xor stream[BLOCK + it].toInt()).toByte() }
    val sealedTag = ByteArray(TAG) { (tag[it].toInt() xor stream[it].toInt()).toByte() }
    return cipher + sealedTag
  }

  fun ccmDecrypt(key: ByteArray, nonce: ByteArray, sealed: ByteArray, checkTag: Boolean): ByteArray {
    if (sealed.size < TAG) {
      throw XiaomiMacMismatch("message of ${sealed.size} bytes")
    }
    val body = sealed.size - TAG
    val stream = keyStream(key, nonce, body + BLOCK)
    val plain = ByteArray(body) { (sealed[it].toInt() xor stream[BLOCK + it].toInt()).toByte() }
    if (checkTag) {
      val expected = cbcMac(key, nonce, plain)
      val received = ByteArray(TAG) { (sealed[body + it].toInt() xor stream[it].toInt()).toByte() }
      if (!MessageDigest.isEqual(expected.copyOf(TAG), received)) {
        throw XiaomiMacMismatch("message tag")
      }
    }
    return plain
  }

  fun ctr(key: ByteArray, message: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/CTR/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(key))
    return cipher.doFinal(message)
  }

  private fun block(): Cipher = Cipher.getInstance("AES/ECB/NoPadding")

  private fun cbcMac(key: ByteArray, nonce: ByteArray, plain: ByteArray): ByteArray {
    val aes = block().apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES")) }
    val first = ByteArray(BLOCK)
    first[0] = CCM_FLAGS.toByte()
    System.arraycopy(nonce, 0, first, 1, NONCE)
    first[13] = (plain.size ushr 16).toByte()
    first[14] = (plain.size ushr 8).toByte()
    first[15] = plain.size.toByte()
    var state = aes.doFinal(first)
    val padded = plain.copyOf((plain.size + BLOCK - 1) / BLOCK * BLOCK)
    for (offset in padded.indices step BLOCK) {
      val mixed = ByteArray(BLOCK) { (state[it].toInt() xor padded[offset + it].toInt()).toByte() }
      state = aes.doFinal(mixed)
    }
    return state
  }

  private fun keyStream(key: ByteArray, nonce: ByteArray, length: Int): ByteArray {
    val aes = block().apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES")) }
    val blocks = (length + BLOCK - 1) / BLOCK
    val stream = ByteArray(blocks * BLOCK)
    for (index in 0 until blocks) {
      val counter = ByteArray(BLOCK)
      counter[0] = (LENGTH_BYTES - 1).toByte()
      System.arraycopy(nonce, 0, counter, 1, NONCE)
      counter[13] = (index ushr 16).toByte()
      counter[14] = (index ushr 8).toByte()
      counter[15] = index.toByte()
      System.arraycopy(aes.doFinal(counter), 0, stream, index * BLOCK, BLOCK)
    }
    return stream
  }
}
