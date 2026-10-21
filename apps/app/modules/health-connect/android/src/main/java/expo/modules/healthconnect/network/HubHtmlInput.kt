package expo.modules.healthconnect.network

import java.net.URLEncoder
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

data class HubHtmlPage(val chatId: String, val path: String) {
  fun assetPrefix(): String = "/api/ai/chats/$chatId/files"
  fun encodedPath(): String = path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
  companion object {
    private fun uuid(value: String): String = value.also { require(UUID.fromString(it).toString() == it) }
    fun parse(value: JSONObject): HubHtmlPage {
      require(value.length() == 2)
      val path = value.getString("path")
      require(path.startsWith("/workspace/") || path.startsWith("/temporary/"))
      require(!path.contains('\\') && !path.contains('%') && !path.contains('\u0000') && path.removePrefix("/").split('/').none { it == "" || it == "." || it == ".." })
      return HubHtmlPage(uuid(value.getString("chatId")), path)
    }
  }
}
data class HubHtmlInput(val binding: HubRouteBinding, val authorization: String, val page: HubHtmlPage) {
  fun identity(): String = MessageDigest.getInstance("SHA-256").digest(
    listOf(binding.canonicalOrigin, page.chatId).joinToString("\n").toByteArray(Charsets.UTF_8)
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
