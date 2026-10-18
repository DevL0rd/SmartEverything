package expo.modules.healthconnect.overlay

object OverlayTrayModel {
  const val OPEN_CALL = "Open call"
  const val DESCRIPTION = "More call controls"

  fun subtitle(tray: OverlayTray, now: Long): String =
    listOfNotNull(tray.chat, overlayDuration(tray.elapsedFrom, now)).joinToString(TextContent.DETAIL_SEPARATOR)

  fun iconOf(tile: OverlayTile): OverlayIcon =
    when (tile.id) {
      TileId.Camera -> if (tile.pressed == true) OverlayIcon.Camera else OverlayIcon.CameraOff
      TileId.PauseVideo -> OverlayIcon.Pause
      TileId.ShowThis -> OverlayIcon.Share
      TileId.ShareScreen -> OverlayIcon.Share
      TileId.StopShare -> OverlayIcon.StopShare
      TileId.ShareWindow -> OverlayIcon.Share
      TileId.HomeCamera -> OverlayIcon.House
      TileId.Interrupt -> OverlayIcon.StopTalk
      TileId.Speaker -> OverlayIcon.Speaker
      TileId.Captions -> OverlayIcon.Captions
      TileId.Settings -> OverlayIcon.Tune
    }

  fun describe(tile: OverlayTile): String =
    if (tile.disabled == null) tile.label else "${tile.label}. ${tile.disabled}"

  fun rows(count: Int): Int = (count + COLUMNS - 1) / COLUMNS

  fun tileWidth(innerWidth: Float, gap: Float): Float = (innerWidth - gap * (COLUMNS - 1)) / COLUMNS

  fun width(screenWidthDp: Float): Float = minOf(OverlayDims.TRAY_WIDTH, screenWidthDp - OverlayDims.PILL_SCREEN_MARGIN)

  const val COLUMNS = 4
}
