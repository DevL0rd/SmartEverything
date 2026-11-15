package expo.modules.healthconnect.drive

import android.content.Context
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.NativeCredentialWithdrawn
import expo.modules.healthconnect.relayTarget
import java.io.IOException
import java.net.URL
import java.net.URLEncoder
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class DriveLinkRefused(val status: Int) : IOException("The signed link was refused with HTTP $status")

class DriveRawAnswer(val status: Int, val headers: Map<String, String>, val body: ByteArray)

class DriveRaw(private val target: IngestTarget) {
  fun urlOf(path: String): URL {
    require(path.startsWith(MEDIA_PREFIX) || path.startsWith(UPLOAD_PREFIX)) {
      "A drive transfer path must start with $MEDIA_PREFIX or $UPLOAD_PREFIX, got $path"
    }
    return URL(URL(target.endpoint), path)
  }

  fun <T> call(
    method: String,
    path: String,
    headers: Map<String, String>,
    body: ByteArray?,
    read: (Response) -> T,
  ): T {
    val url = urlOf(path)
    val binding = target.binding?.invoke() ?: error("Drive transfers need an explicit native credential binding")
    val policy = target.policy?.invoke() ?: error("Drive transfers need the native route authority")
    val lease = policy.lease(binding, url.toString())
    val builder = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}")
    headers.forEach { (name, value) -> builder.header(name, value) }
    val payload = body?.toRequestBody() ?: if (method in BODY_METHODS) ByteArray(0).toRequestBody() else null
    val request = builder.method(method, payload).build()
    try {
      return lease.client.newCall(request).execute().use { response ->
        val result = read(response)
        lease.check()
        result
      }
    } catch (failure: NativeCredentialWithdrawn) {
      throw failure
    } catch (failure: IOException) {
      if (!policy.bound(binding)) throw NativeCredentialWithdrawn()
      policy.failed(binding)
      throw failure
    }
  }

  fun answer(method: String, path: String, headers: Map<String, String>, body: ByteArray?): DriveRawAnswer =
    call(method, path, headers, body) { response ->
      DriveRawAnswer(
        response.code,
        response.headers.toMultimap().mapValues { it.value.first() }.mapKeys { it.key.lowercase() },
        response.body?.bytes() ?: ByteArray(0),
      )
    }

  fun range(path: String, start: Long, endInclusive: Long): ByteArray {
    val answer = answer("GET", path, mapOf("Range" to "bytes=$start-$endInclusive"), null)
    if (answer.status == HTTP_PARTIAL) return answer.body
    if (answer.status == HTTP_OK && start == 0L) return answer.body.copyOf(minOf(answer.body.size.toLong(), endInclusive + 1).toInt())
    if (answer.status in LINK_REFUSALS) throw DriveLinkRefused(answer.status)
    if (answer.status == HTTP_RETRY || answer.status >= HTTP_SERVER) throw IngestUnavailable("HTTP ${answer.status}")
    throw IngestRejected(answer.status, "the hub did not give the requested part of the file")
  }

  fun download(path: String, sink: java.io.OutputStream, active: () -> Unit): Long = call("GET", path, emptyMap(), null) { response ->
    if (response.code in LINK_REFUSALS) throw DriveLinkRefused(response.code)
    if (response.code !in HTTP_OK..HTTP_PARTIAL) throw IngestRejected(response.code, response.body?.string().orEmpty())
    val source = response.body?.byteStream() ?: throw IngestRejected(response.code, "the answer had no body")
    val buffer = ByteArray(BUFFER)
    var total = 0L
    while (true) {
      active()
      val count = source.read(buffer)
      if (count < 0) break
      sink.write(buffer, 0, count)
      total += count
    }
    total
  }

  companion object {
    const val MEDIA_PREFIX = "/media/"
    const val UPLOAD_PREFIX = "/drive/uploads"
    const val HTTP_OK = 200
    const val HTTP_PARTIAL = 206
    const val HTTP_RETRY = 429
    const val HTTP_SERVER = 500
    private const val BUFFER = 64 * 1024
    private val BODY_METHODS = setOf("POST", "PUT", "PATCH")
    private val LINK_REFUSALS = setOf(401, 403, 404, 410)
  }
}

class DriveHub(private val context: Context) {
  private fun client(): HubClient = HubClient(relayTarget(context))

  fun raw(): DriveRaw = DriveRaw(relayTarget(context))

  suspend fun roots(): List<DriveRootDto> = client().get("/api/drive/roots")

  suspend fun browse(rootId: String, folderId: String?, cursor: String?): DriveBrowsePageDto {
    val query = listOfNotNull("rootId=$rootId", folderId?.let { "folderId=$it" }, cursor?.let { "cursor=${encode(it)}" })
    return client().get("/api/drive/browse?${query.joinToString("&")}")
  }

  suspend fun item(itemId: String): DriveItemDto = client().get("/api/drive/items/$itemId")

  suspend fun links(itemIds: List<String>): List<DriveItemLinkDto> {
    val body = buildJsonObject { put("itemIds", buildJsonArray { itemIds.forEach { add(JsonPrimitive(it)) } }) }
    return client().post("/api/drive/items/links", body)
  }

  suspend fun search(text: String, rootId: String?, cursor: String?): DriveQueryPageDto {
    val body = buildJsonObject {
      put("text", text)
      put("match", "all")
      put("rootId", rootId?.let { JsonPrimitive(it) } ?: JsonNull)
      put("folderId", JsonNull)
      put("kinds", JsonNull)
      put("starred", JsonNull)
      put("duration", JsonNull)
      put("taken", JsonNull)
      put("sort", buildJsonObject { put("field", "modifiedAt"); put("direction", "desc") })
      put("cursor", cursor?.let { JsonPrimitive(it) } ?: JsonNull)
    }
    return client().post("/api/drive/search", body)
  }

  suspend fun recent(cursor: String?): DriveRecentPageDto {
    val query = listOfNotNull("filter=everything", cursor?.let { "cursor=${encode(it)}" })
    return client().get("/api/drive/recent?${query.joinToString("&")}")
  }

  suspend fun shared(cursor: String?): DriveSharedPageDto =
    client().get("/api/drive/shared-with-me" + (cursor?.let { "?cursor=${encode(it)}" } ?: ""))

  suspend fun change(body: JsonObject): DriveChangeResultDto = client().post("/api/drive/changes", body)

  suspend fun offline(clientId: String, cursor: String?): DriveOfflinePageDto {
    val query = listOfNotNull("clientId=$clientId", cursor?.let { "cursor=${encode(it)}" })
    return client().get("/api/drive/offline?${query.joinToString("&")}")
  }

  suspend fun reportOffline(clientId: String, entries: JsonArray) {
    val body = buildJsonObject {
      put("clientId", clientId)
      put("items", entries)
    }
    client().submit("/api/drive/offline/report", body)
  }

  private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
}
