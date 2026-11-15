package expo.modules.healthconnect.drive

import java.time.OffsetDateTime
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

@Serializable
class DriveThumbDto(val state: String)

@Serializable
class DriveItemDto(
  val id: String,
  val rootId: String,
  val parentId: String? = null,
  val kind: String,
  val name: String,
  val modifiedAt: String,
  val rev: Int,
  val locked: Boolean = false,
  val bytes: Long = 0,
  val mime: String? = null,
  val thumb: DriveThumbDto? = null,
) {
  val folder: Boolean get() = kind == FOLDER_KIND

  fun cached(access: DriveAccess): CachedItem = CachedItem(
    id = id,
    rootId = rootId,
    parentId = parentId,
    name = name,
    mime = mime,
    folder = folder,
    bytes = if (folder) 0 else bytes,
    modifiedMs = OffsetDateTime.parse(modifiedAt).toInstant().toEpochMilli(),
    rev = rev,
    locked = locked,
    access = access,
    thumb = thumb?.state == THUMB_READY,
  )

  companion object {
    const val FOLDER_KIND = "folder"
    const val THUMB_READY = "ready"
  }
}

@Serializable
class DriveShortcutTargetDto(val state: String, val item: DriveItemDto? = null)

@Serializable
class DriveShortcutDto(val id: String, val target: DriveShortcutTargetDto)

@Serializable
class DriveBrowsePageDto(
  val folder: DriveItemDto? = null,
  val items: List<DriveItemDto>,
  val shortcuts: List<DriveShortcutDto> = emptyList(),
  val next: String? = null,
)

@Serializable
class DriveRootDto(val id: String, val scope: String, val ownerProfileId: String? = null)

@Serializable
class DriveMediaLinkDto(val url: String, val expiresAt: String) {
  fun expiresAtMs(): Long = OffsetDateTime.parse(expiresAt).toInstant().toEpochMilli()
}

@Serializable
class DriveItemLinkDto(
  val itemId: String,
  val rev: Int,
  val file: DriveMediaLinkDto,
  val download: DriveMediaLinkDto? = null,
  val thumb: DriveMediaLinkDto? = null,
)

@Serializable
class DriveQueryPageDto(val items: List<DriveItemDto>, val next: String? = null)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed class DriveRecentEntryDto {
  abstract val at: String
  abstract val shown: DriveItemDto?

  @Serializable
  @SerialName("opened")
  class Opened(val item: DriveItemDto, override val at: String) : DriveRecentEntryDto() {
    override val shown: DriveItemDto get() = item
  }

  @Serializable
  @SerialName("added")
  class Added(
    val item: DriveItemDto,
    override val at: String,
    val actorProfileId: String?,
    val via: String,
    val deviceId: String?,
  ) : DriveRecentEntryDto() {
    override val shown: DriveItemDto get() = item
  }

  @Serializable
  @SerialName("changed")
  class Changed(
    val item: DriveItemDto,
    override val at: String,
    val actorProfileId: String?,
    val via: String,
    val deviceId: String?,
  ) : DriveRecentEntryDto() {
    override val shown: DriveItemDto get() = item
  }

  @Serializable
  @SerialName("shortcut")
  class Shortcut(
    val shortcut: DriveShortcutDto,
    override val at: String,
    val actorProfileId: String?,
    val via: String,
    val deviceId: String?,
  ) : DriveRecentEntryDto() {
    override val shown: DriveItemDto? get() = shortcut.target.item
  }
}

@Serializable
class DriveRecentPageDto(val entries: List<DriveRecentEntryDto>, val next: String? = null)

@Serializable
class DriveGrantDto(val role: String)

@Serializable
class DriveSharedEntryDto(val item: DriveItemDto, val grant: DriveGrantDto)

@Serializable
class DriveSharedPageDto(val items: List<DriveSharedEntryDto>, val next: String? = null)

@Serializable
class DriveOfflineRowDto(val itemId: String, val state: String, val syncedRev: Int? = null)

@Serializable
class DriveOfflinePageDto(val items: List<DriveOfflineRowDto>, val next: String? = null)

@Serializable
class DriveChangeDoneDto(val itemId: String, val resultItemId: String? = null)

@Serializable
class DriveChangeFailedDto(val reason: String)

@Serializable
class DriveChangeResultDto(
  val done: List<DriveChangeDoneDto> = emptyList(),
  val failed: List<DriveChangeFailedDto> = emptyList(),
  val conflicts: List<DriveChangeConflictDto> = emptyList(),
)

@Serializable
class DriveChangeConflictDto(val name: String)

class CachedItem(
  val id: String,
  val rootId: String,
  val parentId: String?,
  val name: String,
  val mime: String?,
  val folder: Boolean,
  val bytes: Long,
  val modifiedMs: Long,
  val rev: Int,
  val locked: Boolean,
  val access: DriveAccess,
  val thumb: Boolean,
)
