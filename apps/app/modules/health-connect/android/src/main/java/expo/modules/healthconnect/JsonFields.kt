package expo.modules.healthconnect

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

fun jsonOf(vararg entries: Pair<String, Any?>): JsonObject =
  JsonObject(entries.associate { (name, value) -> name to jsonValueOf(value) })

fun <T> jsonArrayOf(items: List<T>, describe: (T) -> JsonObject): JsonArray = JsonArray(items.map(describe))

private fun jsonValueOf(value: Any?): JsonElement = when (value) {
  null -> JsonNull
  is JsonElement -> value
  is String -> JsonPrimitive(value)
  is Boolean -> JsonPrimitive(value)
  is Double -> JsonPrimitive(value.also { require(it.isFinite()) { "A JSON number must be finite, got $it" } })
  is Number -> JsonPrimitive(value)
  else -> throw SerializationException("${value.javaClass.simpleName} has no JSON form")
}

private fun JsonObject.field(name: String): JsonElement =
  this[name] ?: throw SerializationException("The record has no \"$name\"")

private fun JsonObject.number(name: String): String =
  (field(name) as? JsonPrimitive)?.takeIf { !it.isString }?.content
    ?: throw SerializationException("\"$name\" must be a number")

fun JsonObject.text(name: String): String =
  (field(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
    ?: throw SerializationException("\"$name\" must be text")

fun JsonObject.textOrNull(name: String): String? = if (field(name) is JsonNull) null else text(name)

fun JsonObject.double(name: String): Double =
  number(name).toDoubleOrNull() ?: throw SerializationException("\"$name\" must be a number")

fun JsonObject.long(name: String): Long =
  number(name).toLongOrNull() ?: throw SerializationException("\"$name\" must be a whole number")

fun JsonObject.int(name: String): Int =
  number(name).toIntOrNull() ?: throw SerializationException("\"$name\" must be a whole number")

fun JsonObject.obj(name: String): JsonObject =
  field(name) as? JsonObject ?: throw SerializationException("\"$name\" must be an object")

fun JsonObject.objects(name: String): List<JsonObject> =
  (field(name) as? JsonArray ?: throw SerializationException("\"$name\" must be a list")).map {
    it as? JsonObject ?: throw SerializationException("\"$name\" must list objects")
  }
