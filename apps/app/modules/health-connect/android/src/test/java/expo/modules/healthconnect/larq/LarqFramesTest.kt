package expo.modules.healthconnect.larq

import expo.modules.healthconnect.hex
import expo.modules.healthconnect.watch.ProtoWriter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LarqFramesTest {
  @Test
  fun `the clock request is the recorded frame`() {
    assertEquals(SET_TIME, LarqHex.of(LarqFrames.setTime(7, 1_790_000_000_000)))
  }

  @Test
  fun `a log page request is the recorded frame`() {
    assertEquals(TOF_LOG, LarqHex.of(LarqFrames.log(3, "tof", 1_789_999_999, 5)))
    assertEquals(ACTIVATION_LOG, LarqHex.of(LarqFrames.log(12, "activation", 0, 6)))
  }

  @Test
  fun `requests outside what the cap keeps are refused`() {
    assertThrows(IllegalArgumentException::class.java) { LarqFrames.log(1, "calibration", 0, 5) }
    assertThrows(IllegalArgumentException::class.java) { LarqFrames.log(1, "tof", 0, 11) }
    assertThrows(IllegalArgumentException::class.java) { LarqFrames.log(1, "tof", -1, 5) }
    assertThrows(IllegalArgumentException::class.java) { LarqFrames.setTime(1, 0) }
  }

  @Test
  fun `the request id is read from a frame`() {
    assertEquals(7L, LarqFrames.requestIdOf(LarqHex.bytes(SET_TIME)))
    assertNull(LarqFrames.requestIdOf(hex("0d")))
  }

  @Test
  fun `a page of the recorded distance log has two rows and the newest stamp`() {
    val page = pageOf(LarqHex.bytes(TOF_RESPONSE))
    assertEquals(2, page.items)
    assertEquals(1_790_000_200L, page.lastTimestamp)
  }

  @Test
  fun `the cursor moves only after a full page that advanced`() {
    val page = pageOf(LarqHex.bytes(TOF_RESPONSE))
    assertEquals(1_790_000_200L, LarqFrames.nextCursor(1_790_000_000, 2, page))
    assertNull(LarqFrames.nextCursor(1_790_000_000, 5, page))
    assertNull(LarqFrames.nextCursor(1_790_000_200, 2, page))
    assertNull(LarqFrames.nextCursor(1_790_000_300, 2, page))
  }

  @Test
  fun `a success with no body is the end of the history`() {
    val page = pageOf(hex("0d 02 00 00 00 10 01"))
    assertEquals(0, page.items)
    assertNull(page.lastTimestamp)
    assertNull(LarqFrames.nextCursor(0, 5, page))
  }

  @Test
  fun `a not supported answer is a clean end and anything else that is not a page says why`() {
    assertSame(PageRead.Unsupported, LarqFrames.scanPage(hex("0d 09 00 00 00 10 02")))
    assertEquals("the bottle answered with failure code 0", reasonOf(hex("0d 09 00 00 00 10")))
    assertEquals("the bottle answered with failure code 3", reasonOf(hex("0d 09 00 00 00 10 03")))
    assertEquals("the reply is not a valid frame", reasonOf(hex("1a ff")))
    assertFalse(LarqFrames.isSuccess(hex("0d 09 00 00 00 10 02")))
    assertTrue(LarqFrames.isSuccess(hex("0d 02 00 00 00 10 01")))
  }

  @Test
  fun `rows that cannot be read are an unreadable page with that reason`() {
    val any = ProtoWriter().string(1, "type.googleapis.com/ResponseGetCapTofLog").bytes(2, hex("0a ff"))
    val frame = hex("0d 01 00 00 00 10 01") + ProtoWriter().message(3, any).toByteArray()
    assertEquals("the log rows could not be read", reasonOf(frame))
  }

  @Test
  fun `the gate lets an upright still bottle through`() {
    assertTrue(LarqFrames.gateAllows(accelerometer(0.02f, -0.03f, 1.0f), 0.15))
  }

  @Test
  fun `the gate holds back a tilted, upside down or moving bottle`() {
    assertFalse(LarqFrames.gateAllows(accelerometer(0.7f, 0.0f, 0.7f), 0.15))
    assertFalse(LarqFrames.gateAllows(accelerometer(0.0f, 0.0f, -1.0f), 0.15))
    assertFalse(LarqFrames.gateAllows(accelerometer(0.0f, 0.0f, 1.4f), 0.15))
  }

  @Test
  fun `the gate holds back an answer that is not an accelerometer reading`() {
    assertFalse(LarqFrames.gateAllows(hex("0d 09 00 00 00 10 02"), 0.15))
    assertFalse(LarqFrames.gateAllows(LarqHex.bytes(TOF_RESPONSE), 0.15))
    assertFalse(LarqFrames.gateAllows(hex("1a ff"), 0.15))
  }

  @Test
  fun `a cap name decodes to its serial`() {
    assertEquals("0123456789ABCDEF", LarqFrames.serialOfName("LARQ_063UfDVRKBz"))
    assertEquals("0000000000000001", LarqFrames.serialOfName("LARQ_00000000001"))
    assertNull(LarqFrames.serialOfName("LARQ_0000000000"))
    assertNull(LarqFrames.serialOfName("LARQ_0000000000-"))
    assertNull(LarqFrames.serialOfName("Other_00000000001"))
    assertNull(LarqFrames.serialOfName("LARQ_zzzzzzzzzzz"))
  }

  private fun accelerometer(x: Float, y: Float, z: Float): ByteArray {
    val reading = ProtoWriter().float(1, x).float(2, y).float(3, z)
    val body = ProtoWriter().message(1, reading).toByteArray()
    val any = ProtoWriter().string(1, "type.googleapis.com/ResponseGetCapAccelerometerState").bytes(2, body)
    return hex("0d 05 00 00 00 10 01") + ProtoWriter().message(3, any).toByteArray()
  }

  private companion object {
    const val SET_TIME =
      "0d07000000123a0a2d747970652e676f6f676c65617069732e636f6d2f5265717565737453657443617054696d6553657474696e677312090a070880d8c1a28c34"
    const val TOF_LOG =
      "0d0300000012380a27747970652e676f6f676c65617069732e636f6d2f52657175657374476574436170546f664c6f67120d0a0b08fff6c4d5061505000000"
    const val ACTIVATION_LOG =
      "0d0c00000012390a2e747970652e676f6f676c65617069732e636f6d2f5265717565737447657443617041637469766174696f6e4c6f6712070a051506000000"
    const val TOF_RESPONSE =
      "0d0300000010011a5e0a28747970652e676f6f676c65617069732e636f6d2f526573706f6e7365476574436170546f664c6f6712320a1708e4f7c4d50610021d7800000025641900002d00421c460a1708c8f8c4d50610011d8700000025d41700002d00191c46"
  }
}
