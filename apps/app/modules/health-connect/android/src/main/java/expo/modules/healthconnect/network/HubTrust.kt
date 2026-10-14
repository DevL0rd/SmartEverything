package expo.modules.healthconnect.network

import java.net.InetAddress
import java.net.URI
import org.json.JSONObject

data class HubTrust(val scopeId: String, val hubId: String, val serverName: String,
  val certificateSha256: String, val publicKeySha256: String,
  val endpoints: Map<String, String>, val addresses: List<InetAddress>) {
  companion object {
    private val HASH = Regex("[0-9a-f]{64}")
    private val NAME = Regex("smarteverything-[0-9a-f]{32}\\.local")
    fun parse(json: String): HubTrust {
      val value = JSONObject(json)
      val identity = value.getJSONObject("identity")
      val tls = identity.getJSONObject("tls")
      val scope = value.getString("scopeId")
      require(scope.length in 1..200) { "Hub scope must contain 1..200 characters" }
      val id = identity.getString("id")
      val certificate = tls.getString("certificateSha256")
      val key = tls.getString("publicKeySha256")
      val name = tls.getString("serverName")
      require(HASH.matches(id) && HASH.matches(certificate) && key == id && NAME.matches(name))
      require(identity.getInt("protocolVersion") == 1)
      val entries = value.getJSONArray("endpoints")
      require(entries.length() in 1..32)
      val endpoints = (0 until entries.length()).associate { index ->
        val entry = entries.getJSONObject(index)
        val url = URI(entry.getString("url"))
        val kind = entry.getString("kind")
        require(kind in listOf("lan", "remote", "loopback"))
        require(url.userInfo == null && url.query == null && url.fragment == null && url.host != null)
        require(url.scheme == "https" || (kind == "loopback" && url.scheme == "http"))
        require(kind != "loopback" || url.host in listOf("localhost", "127.0.0.1", "[::1]"))
        origin(url) to kind
      }
      require(endpoints.size == entries.length()) { "Hub endpoint origins must be unique" }
      val addresses = value.getJSONArray("lanAddresses")
      require(addresses.length() <= 32)
      val ips = (0 until addresses.length()).map { literal(addresses.getString(it)) }
      require(endpoints.values.none { it == "lan" } || ips.isNotEmpty())
      return HubTrust(scope, id, name, certificate, key, endpoints, ips)
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
