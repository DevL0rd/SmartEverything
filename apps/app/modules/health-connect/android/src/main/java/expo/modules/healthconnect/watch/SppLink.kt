package expo.modules.healthconnect.watch

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Handler
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

interface ByteLink {
  fun send(bytes: ByteArray)
  fun close()
}

interface LinkListener {
  fun refused(reason: String)
  fun opened()
  fun received(bytes: ByteArray)
  fun closed(reason: String)
}

class SppLink(
  private val context: Context,
  private val address: String,
  private val handler: Handler,
  private val listener: LinkListener
) : ByteLink {
  private val writer = Executors.newSingleThreadExecutor()
  private val closing = AtomicBoolean(false)
  @Volatile private var socket: BluetoothSocket? = null

  fun open() {
    Thread({ run() }, "watch-spp-$address").start()
  }

  override fun send(bytes: ByteArray) {
    writer.execute {
      val current = socket ?: return@execute
      try {
        current.outputStream.write(bytes)
        current.outputStream.flush()
      } catch (failure: IOException) {
        end("write failed: ${failure.message}")
      }
    }
  }

  override fun close() {
    end("closed by this phone")
  }

  @SuppressLint("MissingPermission")
  private fun run() {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    if (adapter == null || !adapter.isEnabled) {
      handler.post { listener.closed("Bluetooth is off") }
      return
    }
    val opened = try {
      adapter.cancelDiscovery()
      val device = adapter.getRemoteDevice(address)
      device.createRfcommSocketToServiceRecord(SERIAL_PORT).also {
        socket = it
        it.connect()
      }
    } catch (failure: IOException) {
      refuse("${failure.javaClass.simpleName}: ${failure.message}")
      return
    } catch (failure: SecurityException) {
      refuse("Android refused the Bluetooth connection: ${failure.message}")
      return
    }
    handler.post { listener.opened() }
    try {
      read(opened)
    } catch (failure: IOException) {
      end("${failure.javaClass.simpleName}: ${failure.message}")
    }
  }

  private fun refuse(reason: String) {
    closing.set(true)
    try {
      socket?.close()
    } catch (failure: IOException) {
      handler.post { listener.refused("$reason; closing the socket also failed: ${failure.message}") }
      writer.shutdown()
      return
    }
    writer.shutdown()
    handler.post { listener.refused(reason) }
  }

  private fun read(opened: BluetoothSocket) {
    val buffer = ByteArray(READ_BUFFER)
    while (!closing.get()) {
      val count = opened.inputStream.read(buffer)
      if (count < 0) {
        end("the watch closed the connection")
        return
      }
      val chunk = buffer.copyOf(count)
      handler.post { listener.received(chunk) }
    }
  }

  private fun end(reason: String) {
    if (!closing.compareAndSet(false, true)) {
      return
    }
    try {
      socket?.close()
    } catch (failure: IOException) {
      handler.post { listener.closed("$reason; closing the socket also failed: ${failure.message}") }
      writer.shutdown()
      return
    }
    writer.shutdown()
    handler.post { listener.closed(reason) }
  }

  companion object {
    val SERIAL_PORT: UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")
    private const val READ_BUFFER = 4096
  }
}
