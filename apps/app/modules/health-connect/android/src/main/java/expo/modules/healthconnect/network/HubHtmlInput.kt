package expo.modules.healthconnect.network

import java.net.URLEncoder
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

data class HubHtmlServer(val computerId: String, val port: Int)
data class HubHtmlPage(val chatId: String, val path: String, val server: HubHtmlServer? = null) {
  fun assetPrefix(): String = if (server == null) "/api/ai/chats/$chatId/files" else "/api/ai/chats/$chatId/servers/${server.computerId}/${server.port}"
  fun encodedPath(): String = if (server != null) path else path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
  companion object {
    private fun uuid(value: String): String = value.also { require(UUID.fromString(it).toString() == it) }
    private fun server(value: JSONObject, path: String): HubHtmlServer {
      require(path.startsWith("/") && !path.startsWith("//") && path.none { it == '\\' || it.isWhitespace() })
      require(value.length() == 2)
      val port = value.getInt("port")
      require(port in 1..65535)
      return HubHtmlServer(uuid(value.getString("computerId")), port)
    }
    fun parse(value: JSONObject): HubHtmlPage {
      val path = value.getString("path")
      if (value.length() == 3) return HubHtmlPage(uuid(value.getString("chatId")), path, server(value.getJSONObject("server"), path))
      require(value.length() == 2)
      require(path.startsWith("/workspace/") || path.startsWith("/temporary/"))
      require(!path.contains('\\') && !path.contains('%') && !path.contains('\u0000') && path.removePrefix("/").split('/').none { it == "" || it == "." || it == ".." })
      return HubHtmlPage(uuid(value.getString("chatId")), path)
    }
  }
}
data class HubHtmlInput(val binding: HubRouteBinding, val authorization: String, val page: HubHtmlPage) {
  fun identity(): String = MessageDigest.getInstance("SHA-256").digest(
    listOfNotNull(binding.canonicalOrigin, page.chatId, page.server?.let { "${it.computerId}:${it.port}" }).joinToString("\n").toByteArray(Charsets.UTF_8)
  ).joinToString("") { "%02x".format(it.toInt() and 255) }
  companion object {
    fun parse(json: String): HubHtmlInput {
      val input = JSONObject(json)
      require(input.length() == 4)
      val binding = HubRouteBinding.parse(input.getJSONObject("binding"))
      require(binding.scopeId == input.getString("scopeId") && binding.credentialKind == "client")
      val authorization = input.getString("authorization")
      require(authorization.startsWith("Bearer ") && authorization.length <= 4096)
      require(HubRouteBindings.fingerprint(authorization.removePrefix("Bearer ")) == binding.principalId)
      return HubHtmlInput(binding, authorization, HubHtmlPage.parse(input.getJSONObject("page")))
    }
  }
}
