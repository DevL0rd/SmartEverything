package expo.modules.healthconnect.drive

import android.provider.DocumentsContract.Document

enum class DriveAccess(val wire: String, val writes: Boolean) {
  OWN("own", true),
  SHARED("shared", true),
  EDIT("edit", true),
  VIEW("view", false);

  companion object {
    fun of(wire: String): DriveAccess =
      entries.firstOrNull { it.wire == wire }
        ?: throw IllegalArgumentException("unknown drive access \"$wire\"; expected one of ${entries.map { it.wire }}")

    fun ofRole(role: String): DriveAccess = when (role) {
      "view" -> VIEW
      "edit" -> EDIT
      else -> throw IllegalArgumentException("unknown grant role \"$role\"; expected view or edit")
    }
  }
}

object DriveDocumentFlags {
  const val VIEW_ONLY_REFUSAL = "View only: open it in SmartEverything"

  fun exportable(access: DriveAccess, locked: Boolean): Boolean = !(access == DriveAccess.VIEW && locked)

  fun of(folder: Boolean, access: DriveAccess, locked: Boolean, online: Boolean, thumb: Boolean): Int {
    var flags = 0
    if (thumb) flags = flags or Document.FLAG_SUPPORTS_THUMBNAIL
    if (!online) return flags
    if (exportable(access, locked)) flags = flags or Document.FLAG_SUPPORTS_COPY
    if (!access.writes) return flags
    flags = flags or Document.FLAG_SUPPORTS_DELETE or Document.FLAG_SUPPORTS_RENAME or Document.FLAG_SUPPORTS_MOVE
    return flags or if (folder) Document.FLAG_DIR_SUPPORTS_CREATE else Document.FLAG_SUPPORTS_WRITE
  }

  fun opens(access: DriveAccess, locked: Boolean, write: Boolean): Boolean =
    exportable(access, locked) && (!write || access.writes)
}
