package expo.modules.healthconnect.network

import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

data class HubHtmlPage(val chatId: String, val publicationId: String, val profileId: String, val entryPath: String) {
  fun assetPrefix(): String = "/api/ai/chats/$chatId/pages/$publicationId"
  companion object {
    private fun uuid(value: String): String = value.also { require(UUID.fromString(it).toString() == it) }
    fun parse(value: JSONObject): HubHtmlPage {
      require(value.length() == 5 && value.get("version") == 2)
      val entry = value.getString("entryPath")
      val path = URI(entry)
      val decoded = URLDecoder.decode(entry.replace("+", "%2B"), "UTF-8")
      require(entry.startsWith("/") && !entry.startsWith("//") && path.rawPath == entry && path.rawQuery == null && path.rawFragment == null)
      require(!decoded.contains('\\') && !decoded.contains('%') && !decoded.contains('\u0000') && decoded.split('/').none { it == "." || it == ".." })
      return HubHtmlPage(uuid(value.getString("chatId")), uuid(value.getString("publicationId")), uuid(value.getString("profileId")), entry)
    }
  }
}
data class HubHtmlInput(val binding: HubRouteBinding, val authorization: String, val page: HubHtmlPage) {
  fun identity(): String = MessageDigest.getInstance("SHA-256").digest(
    listOf(binding.canonicalOrigin, page.chatId, page.publicationId, page.profileId).joinToString("\n").toByteArray(Charsets.UTF_8)
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
