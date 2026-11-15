package expo.modules.healthconnect.drive

import java.io.FileNotFoundException

sealed class DriveDocumentId {
  abstract val wire: String

  class Drive(val rootId: String) : DriveDocumentId() {
    override val wire: String get() = "$DRIVE_PREFIX$rootId"
  }

  class Item(val itemId: String) : DriveDocumentId() {
    override val wire: String get() = "$ITEM_PREFIX$itemId"
  }

  object SharedWithMe : DriveDocumentId() {
    override val wire: String get() = SHARED
  }

  object Offline : DriveDocumentId() {
    override val wire: String get() = OFFLINE
  }

  companion object {
    const val DRIVE_PREFIX = "drive:"
    const val ITEM_PREFIX = "item:"
    const val SHARED = "shared"
    const val OFFLINE = "offline"
    private val UUID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

    fun parse(text: String): DriveDocumentId = when {
      text == SHARED -> SharedWithMe
      text == OFFLINE -> Offline
      text.startsWith(DRIVE_PREFIX) -> Drive(uuid(text, DRIVE_PREFIX))
      text.startsWith(ITEM_PREFIX) -> Item(uuid(text, ITEM_PREFIX))
      else -> throw FileNotFoundException("\"$text\" is not a SmartEverything document")
    }

    private fun uuid(text: String, prefix: String): String {
      val id = text.removePrefix(prefix)
      if (!UUID.matches(id)) throw FileNotFoundException("\"$text\" is not a SmartEverything document")
      return id
    }
  }
}
