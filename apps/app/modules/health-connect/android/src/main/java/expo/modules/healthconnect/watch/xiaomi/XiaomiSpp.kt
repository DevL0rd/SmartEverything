package expo.modules.healthconnect.watch.xiaomi

import android.os.Handler
import expo.modules.healthconnect.toHex
import expo.modules.healthconnect.watch.ByteLink
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException

interface XiaomiSppSink {
  fun ready(version: Int)
  fun packet(channel: XiaomiChannel, payload: ByteArray)
  fun note(event: String, detail: String)
  fun linkFailed(reason: String)
}

class XiaomiCipher(val checkTag: Boolean) {
  var keys: SessionKeys? = null
  private var counter = 0

  fun reset() {
    keys = null
    counter = 0
  }

  fun encryptV1Command(payload: ByteArray): ByteArray {
    val session = keys ?: throw IllegalStateException("encrypting before the watch authenticated")
    counter = (counter + 1) and 0xffff
    val sealed = XiaomiCrypto.ccmEncrypt(session.encryptionKey, XiaomiCrypto.packetNonce(session.encryptionNonce, counter), payload)
    return ByteBuffer.allocate(2 + sealed.size).order(ByteOrder.LITTLE_ENDIAN).putShort(counter.toShort()).put(sealed).array()
  }

  fun encryptV1(payload: ByteArray, counter: Int): ByteArray {
    val session = keys ?: throw IllegalStateException("encrypting before the watch authenticated")
    return XiaomiCrypto.ccmEncrypt(session.encryptionKey, XiaomiCrypto.packetNonce(session.encryptionNonce, counter), payload)
  }

  fun decryptV1(payload: ByteArray): ByteArray {
    val session = keys ?: return payload
    return XiaomiCrypto.ccmDecrypt(session.decryptionKey, XiaomiCrypto.packetNonce(session.decryptionNonce, 0), payload, checkTag)
  }

  fun encryptV2(payload: ByteArray): ByteArray {
    val session = keys ?: throw IllegalStateException("encrypting before the watch authenticated")
    return XiaomiCrypto.ctr(session.encryptionKey, payload)
  }

  fun decryptV2(payload: ByteArray): ByteArray {
    val session = keys ?: throw IllegalStateException("an encrypted packet arrived before the watch authenticated")
    return XiaomiCrypto.ctr(session.decryptionKey, payload)
  }
}

class XiaomiSpp(
  private val link: ByteLink,
  private val handler: Handler,
  private val cipher: XiaomiCipher,
  private val sink: XiaomiSppSink
) {
  private val buffer = ByteArrayOutputStream()
  private val window = SendWindow()
  private var version = 1
  private var negotiating = true
  private var serial = 0
  private var timeouts = 0
  private val versionTimeout = Runnable { versionKnown(ByteArray(0)) }
  private val resendTimeout = Runnable { resendAfterTimeout() }

  fun begin() {
    link.send(SppV1.encode(XiaomiChannel.VERSION, SppV1.OPCODE_READ, 0, SppV1.DATA_PLAIN, ByteArray(0), true))
    handler.postDelayed(versionTimeout, VERSION_TIMEOUT_MS)
  }

  fun dispose() {
    handler.removeCallbacks(versionTimeout)
    handler.removeCallbacks(resendTimeout)
    window.clear()
  }

  fun send(channel: XiaomiChannel, payload: ByteArray) {
    if (version >= 2) sendV2(channel, payload) else sendV1(channel, payload)
  }

  fun received(chunk: ByteArray) {
    buffer.write(chunk)
    while (true) {
      val bytes = buffer.toByteArray()
      val skip = when (val parsed = if (version >= 2) SppV2.parse(bytes) else SppV1.parse(bytes)) {
        is Parsed.Incomplete -> return
        is Parsed.Invalid -> if (version >= 2) SppV2.nextStart(bytes) else SppV1.nextStart(bytes)
        is Parsed.Complete -> {
          deliver(parsed)
          parsed.size
        }
      }
      buffer.reset()
      buffer.write(bytes, skip, bytes.size - skip)
    }
  }

  private fun deliver(parsed: Parsed.Complete) {
    val frame = parsed.frame
    if (frame == null) {
      sink.note("frame_dropped", "${parsed.size} bytes failed their checksum or have an unknown type")
      return
    }
    try {
      handle(frame)
    } catch (failure: GeneralSecurityException) {
      sink.note("packet_unreadable", "${failure.javaClass.simpleName}: ${failure.message}")
    } catch (failure: SecurityException) {
      sink.note("packet_unreadable", "${failure.javaClass.simpleName}: ${failure.message}")
    } catch (failure: IllegalStateException) {
      sink.note("packet_unreadable", "${failure.javaClass.simpleName}: ${failure.message}")
    } catch (failure: IllegalArgumentException) {
      sink.note("packet_unreadable", "${failure.javaClass.simpleName}: ${failure.message}")
    }
  }

  private fun handle(frame: Frame) {
    when (frame) {
      is Frame.V1 -> handleV1(frame)
      is Frame.SessionConfig -> sessionStarted(frame.opCode)
      is Frame.Data -> handleData(frame)
      is Frame.Ack -> acked(frame.sequence)
      is Frame.Nack -> nacked(frame.sequence)
    }
  }

  private fun handleV1(frame: Frame.V1) {
    if (frame.channel == XiaomiChannel.VERSION && negotiating) {
      versionKnown(frame.payload)
      return
    }
    val payload = if (frame.dataType == SppV1.DATA_ENCRYPTED) cipher.decryptV1(frame.payload) else frame.payload
    sink.packet(frame.channel, payload)
  }

  private fun versionKnown(payload: ByteArray) {
    handler.removeCallbacks(versionTimeout)
    if (!negotiating) {
      return
    }
    negotiating = false
    sink.note("spp_version", if (payload.isEmpty()) "no answer in 5 s, using version 1" else payload.toHex())
    if (payload.isNotEmpty() && payload[0] >= 2) {
      version = 2
      link.send(SppV2.frame(SppV2.TYPE_SESSION, 0, SppV2.SESSION_CONFIG))
      return
    }
    sink.ready(1)
  }

  private fun sessionStarted(opCode: Int) {
    sink.note("spp_session", "session config opcode $opCode")
    sink.ready(2)
  }

  private fun handleData(frame: Frame.Data) {
    link.send(SppV2.frame(SppV2.TYPE_ACK, frame.sequence, ByteArray(0)))
    val payload = if (frame.opCode == SppV2.OPCODE_ENCRYPTED) cipher.decryptV2(frame.payload) else frame.payload
    sink.packet(frame.channel, payload)
  }

  private fun sendV1(channel: XiaomiChannel, payload: ByteArray) {
    val dataType = when (channel) {
      XiaomiChannel.AUTHENTICATION -> SppV1.DATA_AUTH
      XiaomiChannel.ACTIVITY -> SppV1.DATA_PLAIN
      else -> SppV1.DATA_ENCRYPTED
    }
    val body = when {
      dataType != SppV1.DATA_ENCRYPTED -> payload
      channel == XiaomiChannel.COMMAND -> cipher.encryptV1Command(payload)
      else -> cipher.encryptV1(payload, 0)
    }
    link.send(SppV1.encode(channel, SppV1.OPCODE_SEND, serial, dataType, body, false))
    serial = (serial + 1) and 0xff
  }

  private fun sendV2(channel: XiaomiChannel, payload: ByteArray) {
    val opCode = SppV2.opCodeFor(channel)
    val body = if (opCode == SppV2.OPCODE_ENCRYPTED) cipher.encryptV2(payload) else payload
    val packet = byteArrayOf(SppV2.rawChannel(channel).toByte(), opCode.toByte()) + body
    val sequence = window.next()
    val frame = SppV2.frame(SppV2.TYPE_DATA, sequence, packet)
    window.sent(sequence, frame)
    link.send(frame)
    armResend()
  }

  private fun acked(sequence: Int) {
    if (window.ack(sequence) > 0) {
      timeouts = 0
      handler.removeCallbacks(resendTimeout)
      if (!window.isEmpty()) armResend()
    }
  }

  private fun nacked(expected: Int) {
    acked((expected - 1) and 0xff)
    if (window.oldest() == expected) {
      sink.note("spp_resend", "the watch asked again for packet $expected")
      window.unacked().forEach { link.send(it) }
      armResend()
    }
  }

  private fun armResend() {
    handler.removeCallbacks(resendTimeout)
    handler.postDelayed(resendTimeout, RESEND_TIMEOUT_MS)
  }

  private fun resendAfterTimeout() {
    if (window.isEmpty()) {
      timeouts = 0
      return
    }
    timeouts += 1
    if (timeouts >= MAX_TIMEOUTS) {
      sink.linkFailed("the watch acknowledged nothing for ${MAX_TIMEOUTS * RESEND_TIMEOUT_MS / 1000} s")
      return
    }
    sink.note("spp_resend", "no acknowledgement for packet ${window.oldest()}, sending again")
    window.unacked().forEach { link.send(it) }
    armResend()
  }

  private companion object {
    const val VERSION_TIMEOUT_MS = 5_000L
    const val RESEND_TIMEOUT_MS = 10_000L
    const val MAX_TIMEOUTS = 3
  }
}

private class SendWindow {
  private val frames = ArrayDeque<Pair<Int, ByteArray>>()
  private var nextSequence = 0

  fun next(): Int {
    val sequence = nextSequence
    nextSequence = (nextSequence + 1) and 0xff
    return sequence
  }

  fun sent(sequence: Int, frame: ByteArray) {
    frames.addLast(sequence to frame)
    while (frames.size > MAX_TRACKED) frames.removeFirst()
  }

  fun ack(sequence: Int): Int {
    if (frames.none { it.first == sequence }) {
      return 0
    }
    var released = 0
    while (frames.isNotEmpty()) {
      released += 1
      if (frames.removeFirst().first == sequence) break
    }
    return released
  }

  fun oldest(): Int = frames.firstOrNull()?.first ?: -1

  fun isEmpty(): Boolean = frames.isEmpty()

  fun unacked(): List<ByteArray> = frames.map { it.second }

  fun clear() {
    frames.clear()
    nextSequence = 0
  }

  private companion object {
    const val MAX_TRACKED = 128
  }
}
