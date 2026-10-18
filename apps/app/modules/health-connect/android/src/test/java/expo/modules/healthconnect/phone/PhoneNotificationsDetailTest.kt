package expo.modules.healthconnect.phone

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNotificationsDetailTest {
  private fun notice(key: String, app: String, label: String, title: String?, at: Long, countable: Boolean = true) =
    ActiveNotice(key, app, label, title, at, countable)

  private val notices = listOf(
    notice("1", "chat", "Chat", "Sam", 1_000),
    notice("2", "chat", "Chat", "Dana", 3_000),
    notice("3", "mail", "Mail", "Receipt", 2_000),
    notice("4", "music", "Music", "Playing", 4_000, countable = false)
  )

  @Test
  fun `counts leave out ongoing notifications and list the busiest app first`() {
    val body = PhoneNotificationsDetail.body(notices, titles = false)
    assertEquals(3, body.getInt("count"))
    val apps = body.getJSONArray("apps")
    assertEquals("chat", apps.getJSONObject(0).getString("package"))
    assertEquals(2, apps.getJSONObject(0).getInt("count"))
    assertEquals(2, apps.length())
  }

  @Test
  fun `the notifications section has the shape the hub contract fixture names`() {
    PhoneWireFixture.sameShape(
      PhoneWireFixture.section("live", "notifications"),
      PhoneNotificationsDetail.body(notices, titles = true)
    )
    PhoneWireFixture.sameShape(
      PhoneWireFixture.section("rest", "notifications"),
      PhoneNotificationsDetail.body(notices, titles = false)
    )
  }

  @Test
  fun `titles stay out of the report unless they are shared`() {
    val body = PhoneNotificationsDetail.body(notices, titles = false)
    assertTrue(body.isNull("items"))
    assertTrue(!body.toString().contains("Sam"))
  }

  @Test
  fun `shared titles are newest first and carry no body text`() {
    val items = PhoneNotificationsDetail.body(notices, titles = true).getJSONArray("items")
    assertEquals(listOf("2", "3", "1"), (0 until items.length()).map { items.getJSONObject(it).getString("key") })
    assertEquals(setOf("key", "package", "title", "at"), items.getJSONObject(0).keys().asSequence().toSet())
    assertEquals("1970-01-01T00:00:03Z", items.getJSONObject(0).getString("at"))
  }

  @Test
  fun `a notification without a title reports no title`() {
    val items = PhoneNotificationsDetail.body(listOf(notice("1", "chat", "Chat", null, 1)), titles = true).getJSONArray("items")
    assertEquals(JSONObject.NULL, items.getJSONObject(0).get("title"))
  }

  @Test
  fun `an app is found by package or by label`() {
    assertEquals("mail", PhoneNotificationsDetail.appOf("mail", notices))
    assertEquals("chat", PhoneNotificationsDetail.appOf(" CHAT", notices))
  }

  @Test
  fun `an app with no notifications is refused`() {
    assertThrows(PhoneAppUnknown::class.java) { PhoneNotificationsDetail.appOf("Maps", notices) }
  }
}
