package expo.modules.healthconnect.network

import java.net.InetAddress
import java.net.URI
import org.json.JSONArray
import org.json.JSONObject

data class HubRouteEndpoint(val url: String, val kind: String) {
  val origin: String get() = HubTrust.origin(URI(url))

  fun snapshot(): Map<String, String> = mapOf("url" to url, "kind" to kind)

  fun toJson(): JSONObject = JSONObject().put("url", url).put("kind", kind)
}

data class HubTrust(
  val scopeId: String,
  val hubId: String,
  val hubName: String,
  val serverName: String,
  val certificateSha256: String,
  val inventory: List<HubRouteEndpoint>,
  val addresses: List<InetAddress>,
) {
  val endpoints: Map<String, String> = inventory.associate { it.origin to it.kind }

  fun sameHub(other: HubTrust): Boolean = hubId == other.hubId && serverName == other.serverName

  fun toJson(): JSONObject = JSONObject()
    .put("scopeId", scopeId)
    .put("identity", identityJson())
    .put("endpoints", JSONArray(inventory.map { it.toJson() }))
    .put("lanAddresses", JSONArray(addresses.map { it.hostAddress }))

  fun identityJson(): JSONObject = JSONObject()
    .put("id", hubId)
    .put("protocolVersion", PROTOCOL_VERSION)
    .put("name", hubName)
    .put(
      "tls",
      JSONObject()
        .put("serverName", serverName)
        .put("certificateSha256", certificateSha256)
        .put("publicKeySha256", hubId),
    )

  companion object {
    const val PROTOCOL_VERSION = 1
    private val HASH = Regex("[0-9a-f]{64}")
    private val NAME = Regex("smarteverything-[0-9a-f]{32}\\.local")
    private val LOOPBACK_HOSTS = listOf("localhost", "127.0.0.1", "[::1]")
    private val ENDPOINT_KINDS = listOf("lan", "remote", "loopback")

    fun parse(json: String): HubTrust = parse(JSONObject(json))

    fun parse(value: JSONObject): HubTrust {
      val identity = value.getJSONObject("identity")
      val tls = identity.getJSONObject("tls")
      val id = identity.getString("id")
      val certificate = tls.getString("certificateSha256")
      val name = tls.getString("serverName")
      require(HASH.matches(id) && HASH.matches(certificate) && tls.getString("publicKeySha256") == id && NAME.matches(name))
      require(identity.getInt("protocolVersion") == PROTOCOL_VERSION)
      val inventory = endpoints(value.getJSONArray("endpoints"))
      require(inventory.isNotEmpty())
      require(inventory.map { it.origin }.distinct().size == inventory.size) { "Hub endpoint origins must be unique" }
      val addresses = value.getJSONArray("lanAddresses")
      val ips = (0 until addresses.length()).map { literal(addresses.getString(it)) }
      require(inventory.none { it.kind == "lan" } || ips.isNotEmpty())
      return HubTrust(
        value.getString("scopeId"),
        id,
        identity.getString("name"),
        name,
        certificate,
        inventory,
        ips,
      )
    }

    private fun endpoints(entries: JSONArray): List<HubRouteEndpoint> = (0 until entries.length()).map { index ->
      val entry = entries.getJSONObject(index)
      val endpoint = HubRouteEndpoint(entry.getString("url"), entry.getString("kind"))
      val url = URI(endpoint.url)
      require(endpoint.kind in ENDPOINT_KINDS)
      require(url.userInfo == null && url.query == null && url.fragment == null && url.host != null)
      require(url.scheme == "https" || (endpoint.kind == "loopback" && url.scheme == "http"))
      require(endpoint.kind != "loopback" || url.host in LOOPBACK_HOSTS)
      endpoint
    }

    fun origin(url: URI): String {
      val host = url.host
      val canonical = if (host.contains(':')) "[${literal(host.removePrefix("[").removeSuffix("]")).hostAddress}]" else host.lowercase()
      val port = if (url.port == -1) if (url.scheme == "http") 80 else 443 else url.port
      return "${url.scheme}://$canonical:$port"
    }

    fun literal(value: String): InetAddress {
      require(!value.contains('%'))
      val ipv4 = value.split('.')
      val validV4 = ipv4.size == 4 && ipv4.all { it.toIntOrNull() in 0..255 && (it == "0" || !it.startsWith('0')) }
      val validV6 = value.contains(':') && Regex("[0-9a-fA-F:.]+").matches(value)
      require(validV4 || validV6) { "Hub DNS mappings require IP literals" }
      return InetAddress.getByName(value)
    }
  }
}
