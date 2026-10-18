package expo.modules.healthconnect.network

import android.content.Context
import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.IngestUnavailable
import java.net.URI
import java.security.MessageDigest
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

object HubRouteBindings {
  private const val CONNECTION_PATH = "/api/connection"

  fun fingerprint(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it.toInt() and 255) }

  fun register(context: Context, target: IngestTarget, kind: String, generation: Long): HubRouteBinding {
    val canonical = canonicalOrigin(target.endpoint)
    val policy = HubRoutePolicy.get(context)
    val enrolled = policy.enrolled(canonical)
    val identity = enrolled?.trust?.identityJson() ?: HubRouteProbe.identity(HubTransport.canonicalLease(HubRouteProbe.identityUrl(canonical)))
    val principal = fingerprint(target.token)
    val scope = "native:$kind:$principal"
    val trust = metadata(target, canonical, identity, enrolled).put("scopeId", scope)
    val binding = HubRouteBinding(scope, canonical, identity.getString("id"), principal, kind, generation)
    policy.configure(JSONObject().put("trust", trust).put("canonicalOrigin", canonical).put("bindings", JSONArray().put(binding.json())), native = true)
    return binding
  }

  private fun metadata(target: IngestTarget, canonical: String, identity: JSONObject, enrolled: HubRouteConfiguration?): JSONObject {
    val url = canonical + CONNECTION_PATH
    val lease = if (enrolled == null) HubTransport.canonicalLease(url) else HubTransport.lease(url, enrolled.trust.scopeId)
    val request = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}").get().build()
    lease.client.newCall(request).execute().use { response ->
      if (response.code == 429 || response.code >= 500) throw IngestUnavailable("Canonical credential metadata returned HTTP ${response.code}")
      if (!response.isSuccessful) throw IngestRejected(response.code, "Canonical credential metadata was refused")
      val body = response.body ?: throw JSONException("Canonical hub metadata requires a body")
      val metadata = JSONObject(body.string())
      val enrolledIdentity = metadata.getJSONObject("identity")
      require(enrolledIdentity.getString("id") == identity.getString("id") &&
        enrolledIdentity.getJSONObject("tls").getString("serverName") == identity.getJSONObject("tls").getString("serverName")) {
        "Canonical hub identity changed during credential binding"
      }
      val endpoints = metadata.getJSONArray("endpoints")
      return JSONObject().put("identity", enrolledIdentity).put("endpoints", endpoints).put("lanAddresses", lanAddresses(endpoints, enrolledIdentity))
    }
  }

  private fun lanAddresses(endpoints: JSONArray, identity: JSONObject): JSONArray {
    val serverName = identity.getJSONObject("tls").getString("serverName")
    val addresses = JSONArray()
    for (index in 0 until endpoints.length()) {
      val endpoint = endpoints.getJSONObject(index)
      if (endpoint.getString("kind") != "lan") continue
      val host = URI(endpoint.getString("url")).host.removePrefix("[").removeSuffix("]")
      if (host == serverName) continue
      HubTrust.literal(host)
      addresses.put(host)
    }
    return addresses
  }
}
