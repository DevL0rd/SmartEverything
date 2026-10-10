package expo.modules.healthconnect.phone

import android.content.Context
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

data class PhonePlace(
  val id: String,
  val name: String,
  val latitude: Double,
  val longitude: Double,
  val radiusMeters: Float
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("name", name)
    .put("latitude", latitude)
    .put("longitude", longitude)
    .put("radiusMeters", radiusMeters.toDouble())

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "name" to name,
    "latitude" to latitude,
    "longitude" to longitude,
    "radiusMeters" to radiusMeters.toDouble()
  )

  companion object {
    const val MIN_RADIUS = 100f
    const val MAX_RADIUS = 2000f

    fun fromJson(json: JSONObject): PhonePlace = PhonePlace(
      json.getString("id"),
      json.getString("name"),
      json.getDouble("latitude"),
      json.getDouble("longitude"),
      json.getDouble("radiusMeters").toFloat()
    )
  }
}

class PhonePlaces(private val context: Context) {
  private val vault = PhoneVault(context)

  fun all(): List<PhonePlace> {
    val array = JSONArray(vault.read(KEY) ?: "[]")
    return (0 until array.length()).map { PhonePlace.fromJson(array.getJSONObject(it)) }
  }

  fun byId(id: String): PhonePlace? = all().firstOrNull { it.id == id }

  fun save(id: String?, name: String, latitude: Double, longitude: Double, radiusMeters: Float): PhonePlace {
    validate(name, latitude, longitude, radiusMeters)
    val place = PhonePlace(id ?: UUID.randomUUID().toString(), name.trim(), latitude, longitude, radiusMeters)
    write(all().filter { it.id != place.id } + place)
    PhoneGeofences.register(context)
    return place
  }

  fun remove(id: String) {
    write(all().filter { it.id != id })
    PhoneGeofences.register(context)
  }

  private fun write(places: List<PhonePlace>) {
    if (places.size > PhoneGeofences.MAX_PLACES) {
      throw PhonePlaceInvalid("at most ${PhoneGeofences.MAX_PLACES} places can be watched; received ${places.size}")
    }
    vault.write(KEY, JSONArray(places.map { it.toJson() }).toString())
  }

  private fun validate(name: String, latitude: Double, longitude: Double, radiusMeters: Float) {
    when {
      name.isBlank() -> throw PhonePlaceInvalid("the name is empty")
      latitude !in -90.0..90.0 -> throw PhonePlaceInvalid("latitude $latitude is outside -90..90")
      longitude !in -180.0..180.0 -> throw PhonePlaceInvalid("longitude $longitude is outside -180..180")
      radiusMeters !in PhonePlace.MIN_RADIUS..PhonePlace.MAX_RADIUS ->
        throw PhonePlaceInvalid("radius $radiusMeters m is outside ${PhonePlace.MIN_RADIUS}..${PhonePlace.MAX_RADIUS} m")
    }
  }

  private companion object {
    const val KEY = "places"
  }
}
