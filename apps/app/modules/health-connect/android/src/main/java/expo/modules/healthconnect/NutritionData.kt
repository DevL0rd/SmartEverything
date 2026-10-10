package expo.modules.healthconnect

import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.units.Mass
import org.json.JSONObject

object NutritionData {
  fun describe(record: Record): JSONObject? = when (record) {
    is NutritionRecord -> jsonOf(
      "name" to record.name,
      "mealType" to record.mealType,
      "kilocalories" to record.energy?.inKilocalories,
      "kilocaloriesFromFat" to record.energyFromFat?.inKilocalories,
      "grams" to grams(record)
    )
    else -> null
  }

  private fun grams(record: NutritionRecord): JSONObject {
    val json = JSONObject()
    for ((name, mass) in nutrients(record)) {
      if (mass != null) {
        json.put(name, mass.inGrams)
      }
    }
    return json
  }

  private fun nutrients(record: NutritionRecord): List<Pair<String, Mass?>> = listOf(
    "biotin" to record.biotin,
    "caffeine" to record.caffeine,
    "calcium" to record.calcium,
    "chloride" to record.chloride,
    "cholesterol" to record.cholesterol,
    "chromium" to record.chromium,
    "copper" to record.copper,
    "dietaryFiber" to record.dietaryFiber,
    "folate" to record.folate,
    "folicAcid" to record.folicAcid,
    "iodine" to record.iodine,
    "iron" to record.iron,
    "magnesium" to record.magnesium,
    "manganese" to record.manganese,
    "molybdenum" to record.molybdenum,
    "monounsaturatedFat" to record.monounsaturatedFat,
    "niacin" to record.niacin,
    "pantothenicAcid" to record.pantothenicAcid,
    "phosphorus" to record.phosphorus,
    "polyunsaturatedFat" to record.polyunsaturatedFat,
    "potassium" to record.potassium,
    "protein" to record.protein,
    "riboflavin" to record.riboflavin,
    "saturatedFat" to record.saturatedFat,
    "selenium" to record.selenium,
    "sodium" to record.sodium,
    "sugar" to record.sugar,
    "thiamin" to record.thiamin,
    "totalCarbohydrate" to record.totalCarbohydrate,
    "totalFat" to record.totalFat,
    "transFat" to record.transFat,
    "unsaturatedFat" to record.unsaturatedFat,
    "vitaminA" to record.vitaminA,
    "vitaminB12" to record.vitaminB12,
    "vitaminB6" to record.vitaminB6,
    "vitaminC" to record.vitaminC,
    "vitaminD" to record.vitaminD,
    "vitaminE" to record.vitaminE,
    "vitaminK" to record.vitaminK,
    "zinc" to record.zinc
  )
}
