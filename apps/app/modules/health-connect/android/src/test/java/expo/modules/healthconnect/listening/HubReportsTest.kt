package expo.modules.healthconnect.listening

import java.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class HubReportsTest {
  @Test
  fun `samples are sent as little-endian 16-bit bytes`() {
    assertArrayEquals(byteArrayOf(1, 0, 0, 1, -1, -1), HubReports.littleEndian(shortArrayOf(1, 256, -1)))
  }

  @Test
  fun `a level report has the kind and the loudness the hub expects`() {
    val body = HubReports.levelBody(-31.5)
    assertEquals("level", body.getString("kind"))
    assertEquals(-31.5, body.getDouble("dbfs"), 0.0)
  }

  @Test
  fun `a segment report carries its times, loudness and base64 audio`() {
    val segment = Segment(shortArrayOf(1, 256), 1_000, 3_500)
    val body = HubReports.segmentBody(segment).getJSONObject("segment")
    assertEquals("segment", HubReports.segmentBody(segment).getString("kind"))
    assertEquals("1970-01-01T00:00:01Z", body.getString("at"))
    assertEquals("1970-01-01T00:00:03.500Z", body.getString("endedAt"))
    assertEquals(LevelOf.dbfs(segment.pcm), body.getDouble("levelDbfs"), 0.0)
    assertArrayEquals(byteArrayOf(1, 0, 0, 1), Base64.getDecoder().decode(body.getString("pcm")))
  }
}
