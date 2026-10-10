package expo.modules.healthconnect

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject

class HubClient(private val target: IngestTarget) {
  fun urlOf(relative: String): URL = URL(URL(target.endpoint), relative)

  suspend fun get(relative: String): JSONObject = withContext(Dispatchers.IO) {
    exchange(urlOf(relative), "GET", null)
  }

  suspend fun post(relative: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
    exchange(urlOf(relative), "POST", body.toString().toByteArray(Charsets.UTF_8))
  }

  private fun exchange(url: URL, method: String, body: ByteArray?): JSONObject {
    try {
      val connection = url.openConnection() as HttpURLConnection
      try {
        connection.requestMethod = method
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.setRequestProperty("Authorization", "Bearer ${target.token}")
        if (body != null) {
          connection.doOutput = true
          connection.setFixedLengthStreamingMode(body.size)
          connection.setRequestProperty("Content-Type", "application/json")
          connection.outputStream.use { it.write(body) }
        }
        return answer(connection)
      } finally {
        connection.disconnect()
      }
    } catch (failure: IOException) {
      throw IngestUnavailable("${failure.javaClass.simpleName}: ${failure.message}", failure)
    }
  }

  private fun answer(connection: HttpURLConnection): JSONObject {
    val status = connection.responseCode
    val stream = if (status in 200..299) connection.inputStream else connection.errorStream
    val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
    if (status == 429 || status >= 500) {
      throw IngestUnavailable("HTTP $status: $text")
    }
    if (status !in 200..299) {
      throw IngestRejected(status, text)
    }
    try {
      return JSONObject(text)
    } catch (failure: JSONException) {
      throw IngestRejected(status, "the answer is not JSON: $text")
    }
  }

  private companion object {
    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 60_000
  }
}
