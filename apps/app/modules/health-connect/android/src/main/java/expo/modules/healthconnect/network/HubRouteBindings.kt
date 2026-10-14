package expo.modules.healthconnect.network

import android.content.Context
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.IngestRejected
import java.security.MessageDigest
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

object HubRouteBindings {
  fun fingerprint(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it.toInt() and 255) }
  fun register(context: Context, target: IngestTarget, kind: String, generation: Long): HubRouteBinding {
    val canonical = canonicalOrigin(target.endpoint)
    val identity = HubRouteProbe.canonicalIdentity(canonical)
    HubTrust.parse(minimal(identity, canonical).put("scopeId", "canonical-bootstrap").toString())
    val principal = fingerprint(target.token)
    val scope = "native:$kind:$principal"
    val policy = HubRoutePolicy.get(context)
    val known = policy.inventory(canonical, identity)
    val trust = if (kind == "health-source") known ?: minimal(identity, canonical) else metadata(target, canonical, identity)
    trust.put("scopeId", scope)
    val binding = HubRouteBinding(scope, canonical, identity.getString("id"), principal, kind, generation)
    policy.configure(JSONObject().put("trust", trust).put("canonicalOrigin", canonical)
      .put("bindings", JSONArray().put(binding.json())), native = true)
    return binding
  }
  private fun minimal(identity: JSONObject, canonical: String): JSONObject = JSONObject()
    .put("identity", identity).put("endpoints", JSONArray().put(JSONObject().put("url", canonical).put("kind", "remote")))
    .put("lanAddresses", JSONArray())
  private fun metadata(target: IngestTarget, canonical: String, identity: JSONObject): JSONObject {
    val lease = HubTransport.canonicalLease(canonical + "/api/connection")
    val request = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}").get().build()
    lease.client.newCall(request).execute().use { response ->
      if (response.code == 429 || response.code >= 500) throw IngestUnavailable("Canonical credential metadata returned HTTP ${response.code}")
      if (!response.isSuccessful) throw IngestRejected(response.code, "Canonical credential metadata was refused")
      val source = response.body?.source() ?: throw org.json.JSONException("Canonical hub metadata requires a body")
      require(!source.request(MAX_METADATA_BYTES + 1)) { "Hub metadata exceeds limit" }
      val metadata = JSONObject(source.readUtf8())
      val enrolled = metadata.getJSONObject("identity")
      val expected = identity.getJSONObject("tls")
      val received = enrolled.getJSONObject("tls")
      require(enrolled.getString("id") == identity.getString("id") &&
        listOf("serverName", "certificateSha256", "publicKeySha256").all { expected.getString(it) == received.getString(it) }) { "Canonical hub identity changed during credential binding" }
      val endpoints = metadata.getJSONArray("endpoints")
      val ips = JSONArray()
      for (index in 0 until endpoints.length()) {
        val endpoint = endpoints.getJSONObject(index)
        if (endpoint.getString("kind") == "lan") {
          val host = java.net.URI(endpoint.getString("url")).host.removePrefix("[").removeSuffix("]")
          if (host != enrolled.getJSONObject("tls").getString("serverName")) { HubTrust.literal(host); ips.put(host) }
        }
      }
      return JSONObject().put("identity", enrolled).put("endpoints", endpoints).put("lanAddresses", ips)
    }
  }
  private const val MAX_METADATA_BYTES = 128 * 1024L
}
