package expo.modules.healthconnect.network

import java.net.URI
import org.json.JSONArray
import org.json.JSONObject

data class HubRouteBinding(
  val scopeId: String,
  val canonicalOrigin: String,
  val hubId: String,
  val principalId: String,
  val credentialKind: String,
  val credentialGeneration: Long,
) {
  fun json(): JSONObject = JSONObject()
    .put("scopeId", scopeId)
    .put("canonicalOrigin", canonicalOrigin)
    .put("hubId", hubId)
    .put("principalId", principalId)
    .put("credentialKind", credentialKind)
    .put("credentialGeneration", credentialGeneration)

  companion object {
    private val HUB_ID = Regex("[0-9a-f]{64}")
    private val KINDS = listOf("client", "server", "node")

    fun parse(value: JSONObject): HubRouteBinding {
      val result = HubRouteBinding(
        value.getString("scopeId"),
        value.getString("canonicalOrigin"),
        value.getString("hubId"),
        value.getString("principalId"),
        value.getString("credentialKind"),
        value.getLong("credentialGeneration"),
      )
      require(result.scopeId.isNotEmpty() && result.principalId.isNotEmpty())
      require(result.credentialKind in KINDS && result.credentialGeneration >= 0)
      require(HUB_ID.matches(result.hubId))
      require(canonicalOrigin(result.canonicalOrigin) == result.canonicalOrigin)
      return result
    }
  }
}

data class HubRouteConfiguration(
  val trust: HubTrust,
  val canonical: String,
  val bindings: List<HubRouteBinding>,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("trust", trust.toJson())
    .put("canonicalOrigin", canonical)
    .put("bindings", JSONArray(bindings.map { it.json() }))

  companion object {
    fun parse(value: JSONObject): HubRouteConfiguration {
      val trust = HubTrust.parse(value.getJSONObject("trust"))
      val canonical = value.getString("canonicalOrigin")
      require(canonicalOrigin(canonical) == canonical)
      val entries = value.getJSONArray("bindings")
      val bindings = (0 until entries.length()).map { HubRouteBinding.parse(entries.getJSONObject(it)) }
      require(bindings.isNotEmpty() && bindings.distinct().size == bindings.size)
      require(bindings.all { it.scopeId == trust.scopeId && it.canonicalOrigin == canonical && it.hubId == trust.hubId })
      return HubRouteConfiguration(trust, canonical, bindings)
    }
  }
}

fun canonicalOrigin(input: String): String {
  val uri = URI(input)
  require(uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null)
  val host = uri.host.lowercase()
  return "https://$host${if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"}"
}
