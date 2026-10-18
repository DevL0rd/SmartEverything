package expo.modules.healthconnect

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

object HubJson {
  val json = Json { ignoreUnknownKeys = true }

  inline fun <reified T> encode(value: T): String = json.encodeToString(value)

  inline fun <reified T> decode(text: String): T = json.decodeFromString(text)

  fun parseObject(text: String): JsonObject =
    json.parseToJsonElement(text) as? JsonObject ?: throw SerializationException("expected a JSON object")
}

object InstantSerializer : KSerializer<Instant> {
  override val descriptor = PrimitiveSerialDescriptor("java.time.Instant", PrimitiveKind.STRING)

  override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())

  override fun deserialize(decoder: Decoder): Instant {
    val text = decoder.decodeString()
    return try {
      Instant.parse(text)
    } catch (failure: DateTimeParseException) {
      throw SerializationException("\"$text\" is not an ISO instant")
    }
  }
}
