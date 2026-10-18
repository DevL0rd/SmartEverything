package expo.modules.healthconnect

import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

object WireFixture {
  private const val PATH = "../../../../../packages/domain/test/fixtures/native-wire.json"

  private val document: JsonObject = HubJson.parseObject(File(PATH).readText())

  fun response(name: String): JsonObject = document.obj("responses").obj(name)

  fun request(name: String): JsonObject = document.obj("requests").obj(name)

  fun without(element: JsonElement, vararg path: Any): JsonElement {
    if (path.isEmpty()) return element
    val head = path.first()
    val rest = path.drop(1).toTypedArray()
    return when (element) {
      is JsonObject -> if (path.size == 1) {
        JsonObject(element - head.toString())
      } else {
        JsonObject(element + (head.toString() to without(element.getValue(head.toString()), *rest)))
      }
      is JsonArray -> JsonArray(
        element.mapIndexed { index, item -> if (index == head) without(item, *rest) else item }
      )
      else -> element
    }
  }

  inline fun <reified T> decode(element: JsonElement): T = HubJson.json.decodeFromJsonElement(element)

  inline fun <reified T> encode(value: T): JsonElement = HubJson.json.encodeToJsonElement(value)
}
