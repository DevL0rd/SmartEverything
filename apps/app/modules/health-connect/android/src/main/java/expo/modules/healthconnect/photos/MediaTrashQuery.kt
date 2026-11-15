package expo.modules.healthconnect.photos

import android.content.ContentResolver
import android.content.ContentUris
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.R)
internal object MediaTrashQuery {
  private const val CHUNK = 500

  fun rows(resolver: ContentResolver, ids: List<Long>): List<TrashRow> =
    ids.distinct().chunked(CHUNK).flatMap { chunk -> chunkRows(resolver, chunk) }

  private fun chunkRows(resolver: ContentResolver, ids: List<Long>): List<TrashRow> {
    val query = Bundle().apply {
      putString(ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.MediaColumns._ID} IN (${ids.joinToString(",") { "?" }})")
      putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, ids.map { it.toString() }.toTypedArray())
      putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_INCLUDE)
    }
    val columns = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
      MediaStore.MediaColumns.IS_TRASHED
    )
    val cursor = requireNotNull(resolver.query(MediaStore.Files.getContentUri("external"), columns, query, null)) {
      "MediaStore gave no answer for the trash query"
    }
    return cursor.use {
      val rows = mutableListOf<TrashRow>()
      while (it.moveToNext()) {
        rows.add(
          TrashRow(
            id = it.getLong(0),
            video = it.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO,
            trashed = it.getInt(2) != 0
          )
        )
      }
      rows
    }
  }

  fun uriOf(row: TrashRow): Uri = ContentUris.withAppendedId(
    if (row.video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
    row.id
  )
}
