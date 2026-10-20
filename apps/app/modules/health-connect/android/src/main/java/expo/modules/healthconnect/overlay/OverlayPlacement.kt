package expo.modules.healthconnect.overlay

import android.content.SharedPreferences

enum class OverlayOrientation(val key: String) {
  Portrait("portrait"),
  Landscape("landscape"),
  ;

  companion object {
    fun of(screenWidth: Int, screenHeight: Int): OverlayOrientation =
      if (screenWidth > screenHeight) Landscape else Portrait
  }
}

data class FreePlacement(val cx: Float, val cy: Float)

sealed interface OverlayPlacement {
  data object Home : OverlayPlacement

  data class Free(val at: FreePlacement) : OverlayPlacement
}

data class PixelBox(val left: Int, val top: Int, val right: Int, val bottom: Int) {
  val width: Int
    get() = right - left

  val height: Int
    get() = bottom - top
}

data class PixelPoint(val x: Int, val y: Int)

data class PillSize(val width: Int, val height: Int)

object OverlayDragDims {
  const val EDGE_GAP = 8f
  const val SNAP_HOME = 72f
}

object OverlayDrag {
  fun area(screenWidth: Int, screenHeight: Int, insets: OverlayInsets, density: Float): PixelBox {
    val gap = Math.round(OverlayDragDims.EDGE_GAP * density)
    val shadow = Math.round(OverlayDims.SHADOW_MARGIN * density)
    return PixelBox(
      insets.left + gap,
      insets.top + gap,
      screenWidth - insets.right - gap,
      screenHeight - insets.bottom - shadow,
    )
  }

  fun clamp(origin: PixelPoint, size: PillSize, area: PixelBox): PixelPoint = PixelPoint(
    origin.x.coerceIn(area.left, maxOf(area.left, area.right - size.width)),
    origin.y.coerceIn(area.top, maxOf(area.top, area.bottom - size.height)),
  )

  fun home(position: OverlayPosition, size: PillSize, screenWidth: Int, insets: OverlayInsets, area: PixelBox, density: Float): PixelPoint {
    val side = Math.round((OverlayDims.PILL_SCREEN_MARGIN + OverlayDims.SHADOW_MARGIN) * density)
    val x = when (position) {
      OverlayPosition.Centre -> insets.left + (screenWidth - insets.left - insets.right - size.width) / 2
      OverlayPosition.Left -> insets.left + side
      OverlayPosition.Right -> screenWidth - insets.right - side - size.width
    }
    return PixelPoint(x, area.bottom - size.height)
  }

  fun originOf(at: FreePlacement, size: PillSize, area: PixelBox): PixelPoint = clamp(
    PixelPoint(
      area.left + Math.round(at.cx * area.width) - size.width / 2,
      area.top + Math.round(at.cy * area.height) - size.height / 2,
    ),
    size,
    area,
  )

  fun placementOf(origin: PixelPoint, size: PillSize, area: PixelBox): FreePlacement = FreePlacement(
    ((origin.x + size.width / 2f - area.left) / area.width).coerceIn(0f, 1f),
    ((origin.y + size.height / 2f - area.top) / area.height).coerceIn(0f, 1f),
  )

  fun nearHome(origin: PixelPoint, home: PixelPoint, density: Float): Boolean {
    val reach = OverlayDragDims.SNAP_HOME * density
    return Math.abs(origin.x - home.x) <= reach && Math.abs(origin.y - home.y) <= reach
  }

  fun settle(origin: PixelPoint, home: PixelPoint, size: PillSize, area: PixelBox, density: Float): OverlayPlacement {
    val clamped = clamp(origin, size, area)
    return if (nearHome(clamped, home, density)) OverlayPlacement.Home else OverlayPlacement.Free(placementOf(clamped, size, area))
  }
}

class OverlayGrab(private val offsetX: Int, private val offsetY: Int) {
  fun origin(rawX: Float, rawY: Float): PixelPoint = PixelPoint(Math.round(rawX) - offsetX, Math.round(rawY) - offsetY)

  companion object {
    fun at(rawX: Float, rawY: Float, origin: PixelPoint): OverlayGrab =
      OverlayGrab(Math.round(rawX) - origin.x, Math.round(rawY) - origin.y)
  }
}

enum class MenuSide { Above, Below }

data class MenuPlacement(val side: MenuSide, val shift: Int) {
  companion object {
    val Closed = MenuPlacement(MenuSide.Above, 0)
  }
}

object OverlayMenu {
  fun place(pill: PixelBox, tray: PillSize, gap: Int, area: PixelBox): MenuPlacement {
    val roomAbove = pill.top - gap - area.top
    val roomBelow = area.bottom - (pill.bottom + gap)
    val side = when {
      roomAbove >= tray.height -> MenuSide.Above
      roomBelow >= tray.height -> MenuSide.Below
      roomBelow > roomAbove -> MenuSide.Below
      else -> MenuSide.Above
    }
    val centred = pill.left + (pill.width - tray.width) / 2
    val left = centred.coerceIn(area.left, maxOf(area.left, area.right - tray.width))
    return MenuPlacement(side, left - pill.left)
  }
}

object OverlayGlowRule {
  fun mode(requested: GlowMode, placement: OverlayPlacement, dragging: Boolean): GlowMode =
    if (dragging || placement is OverlayPlacement.Free) GlowMode.Off else requested
}

class OverlayPlacementStore(private val preferences: SharedPreferences) {
  fun load(orientation: OverlayOrientation): OverlayPlacement {
    val x = "${orientation.key}.$CX"
    val y = "${orientation.key}.$CY"
    if (!preferences.contains(x) || !preferences.contains(y)) return OverlayPlacement.Home
    return OverlayPlacement.Free(FreePlacement(preferences.getFloat(x, 0f), preferences.getFloat(y, 0f)))
  }

  fun save(orientation: OverlayOrientation, placement: OverlayPlacement) {
    val editor = preferences.edit()
    when (placement) {
      OverlayPlacement.Home -> editor.remove("${orientation.key}.$CX").remove("${orientation.key}.$CY")
      is OverlayPlacement.Free -> editor
        .putFloat("${orientation.key}.$CX", placement.at.cx)
        .putFloat("${orientation.key}.$CY", placement.at.cy)
    }
    editor.apply()
  }

  fun clear() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val CX = "cx"
    const val CY = "cy"
  }
}
