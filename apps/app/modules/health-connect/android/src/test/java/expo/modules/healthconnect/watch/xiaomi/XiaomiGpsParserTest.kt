package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiGpsParserTest {
  private fun id(version: Int) = fileId(version, subtype = 0x01, detail = XiaomiFileId.GPS, sports = true)

  @Test
  fun `v1 points carry time longitude and latitude only`() {
    val body = LittleEndianBytes().u8(0).also { point(it, 0, 8.5f, 47.25f) }.also { point(it, 5, 8.75f, 47.5f) }
    val route = XiaomiGpsParser.route(id(1), activityFile(body.toByteArray())).single()
    assertEquals(instant(), route.start)
    assertEquals(2, route.points.size)
    assertEquals(47.25, route.points[0].latitude, 0.0)
    assertEquals(8.5, route.points[0].longitude, 0.0)
    assertEquals(instant(5), route.points[1].time)
    assertNull(route.points[0].altitudeMeters)
    assertNull(route.points[0].accuracyMeters)
  }

  @Test
  fun `v2 points add accuracy and drop a negative one`() {
    val body = LittleEndianBytes().u8(0)
    point(body, 0, 8.5f, 47.25f).f32(3.5f).u16(0)
    point(body, 1, 8.5f, 47.5f).f32(-1f).u16(0)
    val points = XiaomiGpsParser.route(id(2), activityFile(body.toByteArray())).single().points
    assertEquals(3.5, checkNotNull(points[0].accuracyMeters), 0.0)
    assertNull(points[1].accuracyMeters)
  }

  @Test
  fun `v3 points add altitude`() {
    val body = LittleEndianBytes().u8(0)
    point(body, 0, 8.5f, 47.25f).f32(2f).u16(0).f32(431.5f).f32(0f)
    val point = XiaomiGpsParser.route(id(3), activityFile(body.toByteArray())).single().points.single()
    assertEquals(431.5, checkNotNull(point.altitudeMeters), 0.0)
    assertEquals(2.0, checkNotNull(point.accuracyMeters), 0.0)
  }

  @Test
  fun `points at null island or outside the globe are filtered`() {
    val body = LittleEndianBytes().u8(0)
    point(body, 0, 0f, 0f)
    point(body, 1, 200f, 10f)
    point(body, 2, 10f, 95f)
    point(body, 3, 10f, 20f)
    val points = XiaomiGpsParser.route(id(1), activityFile(body.toByteArray())).single().points
    assertEquals(listOf(instant(3)), points.map { it.time })
  }

  @Test
  fun `a track with no usable point has no route`() {
    val body = LittleEndianBytes().u8(0)
    point(body, 0, 0f, 0f)
    assertTrue(XiaomiGpsParser.route(id(1), activityFile(body.toByteArray())).isEmpty())
  }

  @Test
  fun `a body that is not whole points is rejected`() {
    val body = LittleEndianBytes().u8(0).raw(ByteArray(13)).toByteArray()
    assertThrows(UnsupportedFile::class.java) { XiaomiGpsParser.route(id(1), activityFile(body)) }
  }

  @Test
  fun `an unknown version is rejected`() {
    assertThrows(UnsupportedFile::class.java) { XiaomiGpsParser.route(id(7), activityFile(ByteArray(1))) }
  }

  private fun point(out: LittleEndianBytes, offset: Long, longitude: Float, latitude: Float): LittleEndianBytes =
    out.u32(FIXTURE_EPOCH + offset).f32(longitude).f32(latitude)
}
