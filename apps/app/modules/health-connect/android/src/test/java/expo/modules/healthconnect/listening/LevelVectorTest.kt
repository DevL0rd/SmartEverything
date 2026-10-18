package expo.modules.healthconnect.listening

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class LevelVectorTest(private val name: String, private val case: JSONObject) {
  @Test
  fun `the level of the wake-word snippet equals the hub's for the same samples`() {
    val preroll = WakePreroll()
    val chunks = case.getJSONArray("chunks")
    for (index in 0 until chunks.length()) {
      preroll.push(shorts(chunks.getJSONArray(index)))
    }
    assertEquals(name, case.getDouble("dbfs"), preroll.level(case.getInt("tailMs")), TOLERANCE)
  }

  @Test
  fun `the level of a plain buffer is the same raw RMS in dBFS`() {
    val all = JSONArray()
    val chunks = case.getJSONArray("chunks")
    for (index in 0 until chunks.length()) {
      val chunk = chunks.getJSONArray(index)
      for (sample in 0 until chunk.length()) all.put(chunk.getInt(sample))
    }
    val wanted = case.getInt("tailMs") * SAMPLES_PER_MS
    val tail = shorts(all).let { it.copyOfRange(maxOf(0, it.size - wanted), it.size) }
    assertEquals(name, case.getDouble("dbfs"), LevelOf.dbfs(tail), TOLERANCE)
  }

  companion object {
    private const val VECTOR = "../../../../../packages/domain/test/fixtures/wake-level-vector.json"
    private const val TOLERANCE = 1e-9
    private const val SAMPLES_PER_MS = 16

    private fun shorts(array: JSONArray) = ShortArray(array.length()) { array.getInt(it).toShort() }

    @JvmStatic
    @Parameterized.Parameters(name = "{0}")
    fun cases(): List<Array<Any>> {
      val array = JSONObject(File(VECTOR).readText()).getJSONArray("cases")
      return (0 until array.length()).map { arrayOf(array.getJSONObject(it).getString("name"), array.getJSONObject(it)) }
    }
  }
}
