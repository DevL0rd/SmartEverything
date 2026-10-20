package expo.modules.healthconnect.overlay

class OverlayPalette(
  val pill: Int,
  val solid: Int,
  val onSurface: Int,
  val variant: Int,
  val faint: Int,
  val outline: Int,
  val primary: Int,
  val primaryContainer: Int,
  val onPrimaryContainer: Int,
  val onPrimary: Int,
  val surface2: Int,
  val surface3: Int,
  val shine: Int,
  val critical: Int,
  val onCritical: Int,
  val viz1: Int,
  val viz4: Int,
  val shadow: Int,
  val glowCap: Float,
  val auraCap: Float,
)

object OverlayTokens {
  const val PILL_ALPHA = 0xF0

  val dark = OverlayPalette(
    pill = 0xF01E1E23.toInt(),
    solid = 0xFF1E1E23.toInt(),
    onSurface = 0xFFF2F1EE.toInt(),
    variant = 0xFFA9A49C.toInt(),
    faint = 0xFF77736C.toInt(),
    outline = 0x24FFFFFF,
    primary = 0xFFF2B45E.toInt(),
    primaryContainer = 0x29F2B45E,
    onPrimaryContainer = 0xFFF2B45E.toInt(),
    onPrimary = 0xFF1A1206.toInt(),
    surface2 = 0xFF1B1B1F.toInt(),
    surface3 = 0xFF24242A.toInt(),
    shine = 0xFFFFF1D6.toInt(),
    critical = 0xFFFF6B57.toInt(),
    onCritical = 0xFF1A1206.toInt(),
    viz1 = 0xFF5ED3CF.toInt(),
    viz4 = 0xFFF49A8E.toInt(),
    shadow = 0x8C000000.toInt(),
    glowCap = 1f,
    auraCap = 1f,
  )

  val light = OverlayPalette(
    pill = 0xF0FFFFFF.toInt(),
    solid = 0xFFFFFFFF.toInt(),
    onSurface = 0xFF18171B.toInt(),
    variant = 0xFF5D5952.toInt(),
    faint = 0xFF8D887F.toInt(),
    outline = 0x24000000,
    primary = 0xFFA9620A.toInt(),
    primaryContainer = 0x24A9620A,
    onPrimaryContainer = 0xFF8A4F07.toInt(),
    onPrimary = 0xFFFFFFFF.toInt(),
    surface2 = 0xFFF0EEE9.toInt(),
    surface3 = 0xFFE7E4DE.toInt(),
    shine = 0xFFFFFFFF.toInt(),
    critical = 0xFFC8321E.toInt(),
    onCritical = 0xFFFFFFFF.toInt(),
    viz1 = 0xFF00808A.toInt(),
    viz4 = 0xFFBF3F4E.toInt(),
    shadow = 0x38100E0A,
    glowCap = 0.75f,
    auraCap = 0.32f,
  )

  fun of(theme: OverlayTheme): OverlayPalette = if (theme == OverlayTheme.Dark) dark else light

  const val GLOW_TEAL = 0xFF5ED3CF.toInt()
  const val GLOW_AMBER = 0xFFF2B45E.toInt()
  const val GLOW_CORAL = 0xFFF49A8E.toInt()
  const val GLOW_BLOB_ALPHA = 0.9f
}

object OverlayDims {
  const val PILL_HEIGHT = 64f
  const val PILL_MIN_WIDTH = 320f
  const val PILL_MAX_WIDTH = 480f
  const val PILL_SCREEN_MARGIN = 24f
  const val PILL_RADIUS = 32f
  const val PILL_PADDING_START = 12f
  const val PILL_PADDING_END = 8f
  const val PILL_GAP = 12f
  const val PILL_BOTTOM_GAP = 16f
  const val NARROW_BELOW = 420f
  const val SHADOW_MARGIN = 24f
  const val ELEVATION = 12f
  const val ORB = 40f
  const val ORB_TOUCH = 48f
  const val BUTTON_VISUAL = 40f
  const val BUTTON_TOUCH = 48f
  const val TEXT_BUTTON_HEIGHT = 40f
  const val TEXT_BUTTON_PADDING = 14f
  const val RIBBON_WIDTH = 56f
  const val RIBBON_HEIGHT = 28f
  const val RIBBON_BAR = 3f
  const val RIBBON_GAP = 3.5f
  const val RIBBON_BAR_MIN = 4f
  const val RIBBON_BAR_RADIUS = 1.5f
  const val METER_WIDTH = 21f
  const val METER_HEIGHT = 16f
  const val METER_BAR = 3f
  const val METER_GAP = 1.5f
  const val METER_BAR_MIN = 6f
  const val STATUS_SIZE = 12f
  const val STATUS_LINE = 16f
  const val CAPTION_SIZE = 15f
  const val CAPTION_LINE = 20f
  const val CAPTION_FADE_START = 6f
  const val CAPTION_FADE = 24f
  const val TEXT_MIN_WIDTH = 120f
  const val STATUS_DOT = 6f
  const val STATUS_DOT_GAP = 6f
  const val GLOW_HEIGHT = 120f
  const val GLOW_REST_HEIGHT = 48f
  const val GLOW_STATIC_HEIGHT = 32f
  const val GLOW_RIM = 2f
  const val ICON = 24f
  const val ICON_DRAW = 20f
  const val ORB_STOP = 16f
  const val EDGE_STROKE = 1f
  const val TRAY_WIDTH = 420f
  const val TRAY_PADDING = 12f
  const val TRAY_RADIUS = 24f
  const val TRAY_GAP = 10f
  const val TRAY_HEAD = 44f
  const val TRAY_NAME_SIZE = 14f
  const val TRAY_NAME_LINE = 20f
  const val TRAY_SUB_LINE = 16f
  const val TRAY_CHIP_HEIGHT = 32f
  const val TRAY_CHIP_PADDING = 12f
  const val TRAY_CHIP_ICON = 16f
  const val THINK_HEAD = 24f
  const val THINK_GAP = 8f
  const val THINK_PAD_TOP = 10f
  const val THINK_NAME_SIZE = 14f
  const val THINK_SAVE_SIZE = 12f
  const val THINK_NOTE_SIZE = 12f
  const val THINK_NOTE_LINE = 16f
  const val THINK_ICON = 18f
  const val SEG_HEIGHT = 48f
  const val SEG_GAP = 4f
  const val SEG_RADIUS = 12f
  const val SEG_LABEL_SIZE = 13f
  const val CHIP_HEIGHT = 28f
  const val CHIP_TOUCH = 48f
  const val CHIP_ICON = 16f
  const val CHIP_PADDING = 10f
  const val CHIP_GAP = 4f
  const val CHIP_ICON_ONLY_BELOW = 380f
  const val CHIP_LABEL_SIZE = 12f
  const val TILE_HEIGHT = 62f
  const val TILE_GAP = 6f
  const val TILE_RADIUS = 14f
  const val TILE_ICON = 20f
  const val TILE_LABEL_SIZE = 12f
  const val TILE_LABEL_GAP = 4f
}

object OverlayMotion {
  const val ENTER_MS = 380L
  const val ENTER_DAMPING = 18.0
  const val ENTER_STIFFNESS = 260.0
  const val ENTER_RISE_DP = 24f
  const val ENTER_SCALE_FROM = 0.96f
  const val EXIT_MS = 200L
  const val EXIT_FALL_DP = 16f
  const val EXIT_SCALE_TO = 0.97f
  const val REDUCED_FADE_MS = 150L
  const val SWAP_MS = 160L
  const val SWAP_SLIDE_DP = 4f
  const val GLOW_FADE_MS = 280L
  const val GLOW_BLOOM_MS = 520L
  const val GLOW_SHIMMER_MS = 1200L
  const val GLOW_DRIFT_LISTENING_MS = 14_000L
  const val GLOW_DRIFT_SPEAKING_MS = 6_000L
  const val GLOW_BLOOM_PEAK = 2.6f
  const val GLOW_BLOOM_PEAK_AT = 0.45f
  const val GLOW_STATIC_OPACITY = 0.45f
  const val GLOW_STATIC_THINKING_OPACITY = 0.35f
  const val GLOW_SHIMMER_FROM = 0.35f
  const val GLOW_SHIMMER_TO = 0.6f
  const val GLOW_LEVEL_SCALE_REST = 0.4f
  const val GLOW_LEVEL_SCALE_SPAN = 0.6f
  const val GLOW_LEVEL_OPACITY_REST = 0.35f
  const val GLOW_LEVEL_OPACITY_SPAN = 0.55f
  const val GLOW_RIM_REST = 0.35f
  const val GLOW_RIM_SPAN = 0.65f
  const val GLOW_RIM_THINKING = 0.5f
  const val GLOW_THINKING_SCALE = 0.5f
  const val ORB_SPRING_DAMPING = 14.0
  const val ORB_SPRING_STIFFNESS = 220.0
  const val ORB_IGNITE_MS = 520L
  const val ORB_BURST_MS = 760L
  const val ORB_GAIN_LISTENING = 0.12
  const val ORB_GAIN_SPEAKING = 0.22
  const val RIBBON_STIFFNESS = 320.0
  const val RIBBON_DAMPING = 17.0
  const val RIBBON_ACTIVE = 0.02
  const val RIBBON_THINKING_REST = 0.15f
  const val REDUCED_STEP_MS = 100L
  const val REDUCED_STEPS = 5
  const val METER_STEP_MS = 100L
  const val REST_SILENT_MS = 8000L
  const val REST_THINKING_MS = 3000L
  const val EDGE_SPIN_LISTENING_MS = 6000L
  const val EDGE_SPIN_SPEAKING_MS = 3000L
  const val EDGE_SPIN_THINKING_MS = 1800L
  const val MAX_STEP_MS = 50.0
  const val TRAY_MS = 200L
  const val TRAY_RISE_DP = 8f
  const val TRAY_SCALE_FROM = 0.98f
}
