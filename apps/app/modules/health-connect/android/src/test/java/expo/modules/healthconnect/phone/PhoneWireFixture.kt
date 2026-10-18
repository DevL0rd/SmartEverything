package expo.modules.healthconnect.phone

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

object PhoneWireFixture {
  private const val PATH = "../../../../../packages/domain/test/fixtures/phone-wire.json"

  private val document = JSONObject(File(PATH).readText())

  fun section(report: String, name: String): JSONObject = document.getJSONObject(report).getJSONObject("detail").getJSONObject(name)

  fun sameShape(expected: Any?, actual: Any?, path: String = "section") {
    if (expected == JSONObject.NULL || actual == JSONObject.NULL) return
    when (expected) {
      is JSONObject -> sameObject(expected, actual, path)
      is JSONArray -> sameArray(expected, actual, path)
      else -> assertEquals("$path type", expected.kind(), actual.kind())
    }
  }

  private fun sameObject(expected: JSONObject, actual: Any?, path: String) {
    assertTrue("$path should be an object but was $actual", actual is JSONObject)
    val sent = actual as JSONObject
    assertEquals("$path keys", expected.keys().asSequence().toSortedSet(), sent.keys().asSequence().toSortedSet())
    expected.keys().forEach { sameShape(expected.get(it), sent.get(it), "$path.$it") }
  }

  private fun sameArray(expected: JSONArray, actual: Any?, path: String) {
    assertTrue("$path should be an array but was $actual", actual is JSONArray)
    val sent = actual as JSONArray
    if (expected.length() > 0 && sent.length() > 0) sameShape(expected.get(0), sent.get(0), "$path[0]")
  }

  private fun Any?.kind(): String = when (this) {
    is Number -> "number"
    is Boolean -> "boolean"
    is String -> "text"
    else -> "other"
  }
}
