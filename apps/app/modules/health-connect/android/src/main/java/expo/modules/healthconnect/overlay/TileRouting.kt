package expo.modules.healthconnect.overlay

sealed interface TileRoute {
  data class Room(val action: String) : TileRoute

  data class Control(val control: OverlayControl) : TileRoute

  data class App(val action: String) : TileRoute

  data object Captions : TileRoute
}

object TileRouting {
  const val CAPTIONS = "captions"
  private const val CAMERA = "camera"
  private const val SHARE = "share"
  private const val HOME = "home"
  private const val SETTINGS = "settings"
  private const val PAUSE_VIDEO = "pause_video"

  fun of(tile: OverlayTile): TileRoute =
    when (tile.id) {
      TileId.Camera -> if (tile.pressed == true) TileRoute.Control(OverlayControl.Camera) else TileRoute.Room(CAMERA)
      TileId.PauseVideo -> TileRoute.App(PAUSE_VIDEO)
      TileId.ShowThis, TileId.ShareScreen, TileId.ShareWindow -> TileRoute.Room(SHARE)
      TileId.StopShare -> TileRoute.Control(OverlayControl.StopShare)
      TileId.HomeCamera -> TileRoute.Room(HOME)
      TileId.Interrupt -> TileRoute.Control(OverlayControl.Interrupt)
      TileId.Speaker -> TileRoute.Control(OverlayControl.Speaker)
      TileId.Captions -> TileRoute.Captions
      TileId.Settings -> TileRoute.Room(SETTINGS)
    }
}
