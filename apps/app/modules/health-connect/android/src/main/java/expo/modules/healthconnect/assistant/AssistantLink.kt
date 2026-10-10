package expo.modules.healthconnect.assistant

import android.content.Context
import android.content.Intent
import android.net.Uri

object AssistantLink {
  private val SCHEMES = listOf("smarteverything-dev", "smarteverything")

  fun call(context: Context, source: String): Intent = open(context, "assistant/call?source=$source")

  fun answer(context: Context, chatId: String, outreachId: String): Intent = open(
    context,
    "assistant/call?source=assistant&chatId=${Uri.encode(chatId)}&answering=${Uri.encode(outreachId)}"
  )

  private fun open(context: Context, path: String): Intent {
    val intent = SCHEMES.asSequence()
      .map { scheme -> viewIntent(context, "$scheme://$path") }
      .firstOrNull { intent -> intent.resolveActivity(context.packageManager) != null }
      ?: throw IllegalStateException(
        "No activity of ${context.packageName} opens the assistant link; the app scheme is missing"
      )
    return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private fun viewIntent(context: Context, link: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName)
}
