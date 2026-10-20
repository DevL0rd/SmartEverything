package expo.modules.healthconnect.toothbrush

import java.util.UUID

interface BrushLoop {
  fun post(block: () -> Unit)

  fun clear()
}

interface BrushRadioEvents {
  fun connectionChanged(status: Int, connected: Boolean)

  fun discovered(status: Int)

  fun operationDone(status: Int)

  fun valueRead(characteristic: UUID, value: ByteArray, status: Int)

  fun valueChanged(characteristic: UUID, value: ByteArray)

  fun rssiRead(rssi: Int)
}

interface BrushRadio {
  fun available(): Boolean

  fun bonded(address: String): Boolean

  fun connect(address: String, autoConnect: Boolean)

  fun reconnect()

  fun discover()

  fun refresh(): Boolean

  fun readRssi()

  fun has(service: String, characteristic: String): Boolean

  fun subscribe(subscription: Subscription): Boolean

  fun read(service: String, characteristic: String): Boolean

  fun write(service: String, characteristic: String, bytes: ByteArray, withoutResponse: Boolean): Boolean

  fun close()
}
