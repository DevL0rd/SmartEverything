package expo.modules.healthconnect.sonicare

interface CondorPort {
  fun subscribe(characteristic: String)

  fun write(characteristic: String, bytes: ByteArray, urgent: Boolean)
}

interface CondorListener {
  fun ready()

  fun failed(reason: String)

  fun received(characteristic: String, value: ByteArray)
}

class CondorTransport(private val port: CondorPort, private val listener: CondorListener) {
  private enum class Phase { IDLE, VERSION, CHANNELS, OPENING, INITIALIZING, READY, FAILED }

  private var phase = Phase.IDLE
  private var maxPacket = DEFAULT_PACKET
  private var sequence = 1
  private var buffer = ByteArray(0)
  private var awaiting = false
  private val frames = ArrayDeque<ByteArray>()

  val isReady: Boolean get() = phase == Phase.READY

  fun start() {
    phase = Phase.VERSION
    port.subscribe(SERVER_CONFIG)
    port.write(CLIENT_CONFIG, byteArrayOf(3, 4), false)
  }

  fun onServerConfig(value: ByteArray) {
    when (phase) {
      Phase.VERSION -> versionChosen(value)
      Phase.CHANNELS -> channelsChosen(value)
      else -> Unit
    }
  }

  fun onRxAck() {
    if (phase != Phase.OPENING) return
    phase = Phase.INITIALIZING
    transmit(frameOf(INITIALIZE_REQUEST, ByteArray(0)))
  }

  fun onTx(value: ByteArray) {
    if (value.isEmpty()) return
    port.write(TX_ACK, byteArrayOf((value[0].toInt() and SEQUENCE_MASK).toByte()), true)
    listener.received(TX, value)
    buffer += value.copyOfRange(1, value.size)
    drain()
  }

  fun send(frame: ByteArray) {
    frames.addLast(frame)
    if (phase == Phase.READY) pump()
  }

  fun reset() {
    phase = Phase.IDLE
    sequence = 1
    buffer = ByteArray(0)
    awaiting = false
    frames.clear()
  }

  private fun versionChosen(value: ByteArray) {
    if (value.size != 1 || value[0].toInt() != SUPPORTED_VERSION) {
      fail("The brush chose Condor transport version ${value.firstOrNull()?.toInt()}; only version $SUPPORTED_VERSION is supported.")
      return
    }
    phase = Phase.CHANNELS
    port.subscribe(TX)
    port.subscribe(RX_ACK)
    port.write(CLIENT_CONFIG, byteArrayOf(-1, -1, -1, -1), false)
  }

  private fun channelsChosen(value: ByteArray) {
    if (value.size != CHANNEL_CONFIG_SIZE) {
      fail("The brush answered the channel setup with ${value.size} bytes instead of $CHANNEL_CONFIG_SIZE.")
      return
    }
    val offered = (value[0].toInt() and 0xff) or ((value[1].toInt() and 0xff) shl 8)
    maxPacket = maxOf(minOf(offered, DEFAULT_PACKET), MIN_PACKET)
    phase = Phase.OPENING
    port.write(RX, byteArrayOf(START_FLAG.toByte()), false)
  }

  private fun drain() {
    while (buffer.size >= HEADER_SIZE) {
      if (buffer[0] != MARK_FIRST || buffer[1] != MARK_SECOND) {
        fail("A Condor frame must start with fe ff; the brush sent ${buffer.take(MARK_PEEK).joinToString("") { "%02x".format(it) }}.")
        return
      }
      val length = ((buffer[3].toInt() and 0xff) shl 8) or (buffer[4].toInt() and 0xff)
      if (buffer.size < HEADER_SIZE + length) return
      val type = buffer[2].toInt() and 0xff
      buffer = buffer.copyOfRange(HEADER_SIZE + length, buffer.size)
      handle(type)
    }
  }

  private fun handle(type: Int) {
    if (type == CHANGE_INDICATION) {
      transmit(frameOf(CHANGE_INDICATION_RESPONSE, byteArrayOf(0, 0)))
      return
    }
    if (phase == Phase.INITIALIZING) {
      phase = Phase.READY
      listener.ready()
    }
    awaiting = false
    pump()
  }

  private fun pump() {
    if (awaiting || phase != Phase.READY) return
    val next = frames.removeFirstOrNull() ?: return
    awaiting = true
    transmit(next)
  }

  private fun transmit(frame: ByteArray) {
    val room = maxPacket - 1
    var offset = 0
    while (offset < frame.size) {
      val end = minOf(offset + room, frame.size)
      val chunk = byteArrayOf((sequence and SEQUENCE_MASK).toByte()) + frame.copyOfRange(offset, end)
      sequence = (sequence + 1) % SEQUENCE_WRAP
      port.write(RX, chunk, false)
      offset = end
    }
  }

  private fun fail(reason: String) {
    phase = Phase.FAILED
    listener.failed(reason)
  }

  companion object {
    const val RX = "e50b0001-af04-4564-92ad-fef019489de6"
    const val RX_ACK = "e50b0002-af04-4564-92ad-fef019489de6"
    const val TX = "e50b0003-af04-4564-92ad-fef019489de6"
    const val TX_ACK = "e50b0004-af04-4564-92ad-fef019489de6"
    const val SERVER_CONFIG = "e50b0006-af04-4564-92ad-fef019489de6"
    const val CLIENT_CONFIG = "e50b0007-af04-4564-92ad-fef019489de6"
    const val SERVICE = "e50ba3c0-af04-4564-92ad-fef019489de6"
    private const val DEFAULT_PACKET = 20
    private const val MIN_PACKET = 4
    private const val SUPPORTED_VERSION = 4
    private const val CHANNEL_CONFIG_SIZE = 6
    private const val START_FLAG = 0x40
    private const val SEQUENCE_MASK = 0x3f
    private const val SEQUENCE_WRAP = 64
    private const val HEADER_SIZE = 5
    private const val MARK_PEEK = 8
    private const val MARK_FIRST: Byte = -2
    private const val MARK_SECOND: Byte = -1
    private const val INITIALIZE_REQUEST = 1
    private const val CHANGE_INDICATION = 8
    private const val CHANGE_INDICATION_RESPONSE = 9

    fun frameOf(type: Int, body: ByteArray): ByteArray =
      byteArrayOf(MARK_FIRST, MARK_SECOND, type.toByte(), (body.size shr 8).toByte(), body.size.toByte()) + body
  }
}
