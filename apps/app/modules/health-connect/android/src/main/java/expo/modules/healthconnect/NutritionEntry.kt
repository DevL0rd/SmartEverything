package expo.modules.healthconnect

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import org.json.JSONObject

object NutritionEntry {
  fun of(type: String, t: EntryTiming, d: JSONObject, m: Metadata): Record? {
    if (type != "Nutrition") {
      return null
    }
    val grams = d.getJSONObject("grams")
    fun g(name: String): Mass? = if (grams.has(name)) Mass.grams(grams.getDouble(name)) else null
    fun kcal(name: String): Energy? = if (d.isNull(name)) null else Energy.kilocalories(d.getDouble(name))
    return NutritionRecord(
      startTime = t.start,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(type),
      endZoneOffset = t.zone,
      metadata = m,
      name = if (d.isNull("name")) null else d.getString("name"),
      mealType = d.getInt("mealType"),
      energy = kcal("kilocalories"),
      energyFromFat = kcal("kilocaloriesFromFat"),
      biotin = g("biotin"),
      caffeine = g("caffeine"),
      calcium = g("calcium"),
      chloride = g("chloride"),
      cholesterol = g("cholesterol"),
      chromium = g("chromium"),
      copper = g("copper"),
      dietaryFiber = g("dietaryFiber"),
      folate = g("folate"),
      folicAcid = g("folicAcid"),
      iodine = g("iodine"),
      iron = g("iron"),
      magnesium = g("magnesium"),
      manganese = g("manganese"),
      molybdenum = g("molybdenum"),
      monounsaturatedFat = g("monounsaturatedFat"),
      niacin = g("niacin"),
      pantothenicAcid = g("pantothenicAcid"),
      phosphorus = g("phosphorus"),
      polyunsaturatedFat = g("polyunsaturatedFat"),
      potassium = g("potassium"),
      protein = g("protein"),
      riboflavin = g("riboflavin"),
      saturatedFat = g("saturatedFat"),
      selenium = g("selenium"),
      sodium = g("sodium"),
      sugar = g("sugar"),
      thiamin = g("thiamin"),
      totalCarbohydrate = g("totalCarbohydrate"),
      totalFat = g("totalFat"),
      transFat = g("transFat"),
      unsaturatedFat = g("unsaturatedFat"),
      vitaminA = g("vitaminA"),
      vitaminB12 = g("vitaminB12"),
      vitaminB6 = g("vitaminB6"),
      vitaminC = g("vitaminC"),
      vitaminD = g("vitaminD"),
      vitaminE = g("vitaminE"),
      vitaminK = g("vitaminK"),
      zinc = g("zinc")
    )
  }
}
