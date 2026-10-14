package expo.modules.healthconnect.network

import android.content.Context
import android.util.AtomicFile
import expo.modules.healthconnect.KeystoreBox
import java.io.File
import java.net.URI
import org.json.JSONArray
import org.json.JSONObject

data class HubRouteBinding(val scopeId: String, val canonicalOrigin: String, val hubId: String,
  val principalId: String, val credentialKind: String, val credentialGeneration: Long) {
  fun json(): JSONObject = JSONObject().put("scopeId", scopeId).put("canonicalOrigin", canonicalOrigin)
    .put("hubId", hubId).put("principalId", principalId).put("credentialKind", credentialKind)
    .put("credentialGeneration", credentialGeneration)
  companion object {
    fun parse(value: JSONObject): HubRouteBinding {
      require(value.length() == 6)
      val result = HubRouteBinding(value.getString("scopeId"), value.getString("canonicalOrigin"),
        value.getString("hubId"), value.getString("principalId"), value.getString("credentialKind"), value.getLong("credentialGeneration"))
      require(result.scopeId.length in 1..200 && result.principalId.length in 1..200)
      require(result.credentialKind in listOf("client", "server", "health-source", "node") && result.credentialGeneration >= 0)
      require(Regex("[0-9a-f]{64}").matches(result.hubId))
      require(canonicalOrigin(result.canonicalOrigin) == result.canonicalOrigin)
      return result
    }
  }
}

data class HubRouteConfiguration(val raw: JSONObject, val trust: HubTrust, val canonical: String, val bindings: List<HubRouteBinding>) {
  companion object {
    fun parse(value: JSONObject): HubRouteConfiguration {
      require(value.length() == 3)
      val trust = HubTrust.parse(value.getJSONObject("trust").toString())
      val canonical = value.getString("canonicalOrigin")
      require(canonicalOrigin(canonical) == canonical)
      val entries = value.getJSONArray("bindings")
      require(entries.length() in 1..32)
      val bindings = (0 until entries.length()).map { HubRouteBinding.parse(entries.getJSONObject(it)) }
      require(bindings.distinct().size == bindings.size)
      require(bindings.all { it.scopeId == trust.scopeId && it.canonicalOrigin == canonical && it.hubId == trust.hubId })
      return HubRouteConfiguration(value, trust, canonical, bindings)
    }
  }
}

fun canonicalOrigin(input: String): String {
  val uri = URI(input)
  require(uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null)
  require(!uri.host.endsWith(".local")) { "Canonical bootstrap requires independently verified HTTPS" }
  val host = uri.host.lowercase()
  return "https://$host${if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"}"
}

class HubRouteStore(context: Context) {
  private val file = AtomicFile(File(context.filesDir, "hub-route-bindings.enc"))
  private val box = KeystoreBox("expo.modules.healthconnect.hub-routes")
  @Synchronized fun load(): List<HubRouteConfiguration> {
    if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return emptyList()
    val input = JSONArray(box.open(String(file.readFully(), Charsets.UTF_8)))
    require(input.length() <= 64)
    return (0 until input.length()).map { HubRouteConfiguration.parse(input.getJSONObject(it)) }
  }
  @Synchronized fun save(configurations: Collection<HubRouteConfiguration>) {
    require(configurations.size <= 64)
    val bytes = box.seal(JSONArray(configurations.map { it.raw }).toString()).toByteArray(Charsets.UTF_8)
    val stream = file.startWrite()
    try { stream.write(bytes); file.finishWrite(stream) }
    catch (failure: Exception) { file.failWrite(stream); throw failure }
  }
}
