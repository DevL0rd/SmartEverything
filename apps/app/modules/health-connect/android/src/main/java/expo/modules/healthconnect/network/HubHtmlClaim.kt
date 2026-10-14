package expo.modules.healthconnect.network

import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject

sealed interface HubHtmlDocument {
  val expiresAt: String?
}
data class HubHtmlPage(val html: String, override val expiresAt: String?) : HubHtmlDocument
data class HubHtmlProject(val leaseId: String, val assetToken: String, val entryPath: String, override val expiresAt: String?) : HubHtmlDocument
data class HubHtmlInput(val binding: HubRouteBinding, val generation: Long, val authorization: String, val claim: JSONObject) {
  companion object {
    fun parse(json: String): HubHtmlInput {
      val input = JSONObject(json)
      require(input.length() == 5)
      val binding = HubRouteBinding.parse(input.getJSONObject("binding"))
      require(binding.scopeId == input.getString("scopeId") && binding.credentialKind == "client")
      val authorization = input.getString("authorization")
      require(authorization.startsWith("Bearer ") && authorization.length <= 4096)
      require(HubRouteBindings.fingerprint(authorization.removePrefix("Bearer ")) == binding.principalId)
      val claim = input.getJSONObject("claim")
      require(claim.length() == (if (claim.has("capability")) 3 else 2) && (!claim.has("capability") || claim.getString("capability") == "native-project-v1") && UUID.fromString(claim.getString("chatId")).toString() == claim.getString("chatId"))
      return HubHtmlInput(binding, input.getLong("routeGeneration").also { require(it >= 0) }, authorization, claim)
    }
  }
}
object HubHtmlClaim {
  private const val PATH = "/api/ai/previews/html/native/claim"
  private const val HTML_BYTES = 1024 * 1024
  private const val FRAME_BYTES = 6L * HTML_BYTES + 4096
  fun request(input: HubHtmlInput, policy: HubRoutePolicy): Pair<HubLease, Call> {
    val lease = policy.lease(input.binding, input.binding.canonicalOrigin + PATH, input.generation)
    val client = lease.client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    val request = Request.Builder().url(lease.url).header("Authorization", input.authorization)
      .header("Accept", "application/x-ndjson")
      .post(input.claim.toString().toRequestBody("application/json".toMediaType())).build()
    lease.check()
    return lease to client.newCall(request)
  }
  fun document(raw: String, input: HubHtmlInput): HubHtmlDocument {
    val document = JSONObject(raw)
    val project = document.optString("kind") == "project"
    require(document.length() == (if (project) 8 else 5))
    val lease = input.claim.getJSONObject("lease")
    require(document.has("expiresAt") && lease.has("expires_at"))
    require(document.getString("publicationId") == lease.getString("publication_id") &&
      document.getString("revision") == lease.getString("revision") && document.getString("profileId") == lease.getString("profile_id") &&
      document.isNull("expiresAt") == lease.isNull("expires_at") &&
      (document.isNull("expiresAt") || document.getString("expiresAt") == lease.getString("expires_at")))
    val expiry = if (document.isNull("expiresAt")) null else document.getString("expiresAt")
    require(expiry == null || Instant.parse(expiry) > Instant.now())
    if (project) return project(document, input, expiry)
    val html = document.getString("html")
    require(html.toByteArray(Charsets.UTF_8).size <= HTML_BYTES)
    return HubHtmlPage(html, expiry)
  }
  private fun project(document: JSONObject, input: HubHtmlInput, expiry: String?): HubHtmlProject {
    require(input.claim.getString("capability") == "native-project-v1")
    val lease = input.claim.getJSONObject("lease")
    val expected = if (lease.has("purpose")) lease.getString("id") else java.net.URI(lease.getString("origin")).host
    val id = document.getString("leaseId")
    val token = document.getString("assetToken")
    val entry = document.getString("entryPath")
    require(id == expected && Regex("[0-9a-f]{64}").matches(id) && Regex("[0-9a-f]{64}").matches(token))
    val path = java.net.URI(entry)
    require(entry.startsWith("/") && !entry.startsWith("//") && path.rawPath == entry && path.rawQuery == null && path.rawFragment == null)
    return HubHtmlProject(id, token, entry, expiry)
  }
  fun read(call: Call, input: HubHtmlInput, lease: HubLease, accept: (HubHtmlDocument) -> Unit) {
    call.execute().use { response ->
      require(response.code == 200 && response.header("Content-Type") == "application/x-ndjson; charset=utf-8")
      val source = response.body?.source() ?: error("HTML claim requires its lifetime stream")
      lease.check()
      val document = document(source.readUtf8LineStrict(FRAME_BYTES), input)
      lease.check()
      accept(document)
      check(source.exhausted()) { "HTML claim has unexpected extra frames" }
    }
  }
}
