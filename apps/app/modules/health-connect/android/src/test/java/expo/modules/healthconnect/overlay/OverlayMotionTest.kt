package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GlowMotionTest {
  private fun run(motion: GlowMotion, ms: Int, level: Double = 0.0) {
    repeat(ms / STEP) { motion.advance(STEP.toDouble(), level) }
  }

  @Test
  fun `the bloom grows to two and a half times the band and settles back`() {
    assertEquals(0f, GlowMath.bloomScale(0.0), 0f)
    assertEquals(OverlayMotion.GLOW_BLOOM_PEAK, GlowMath.bloomScale(OverlayMotion.GLOW_BLOOM_MS * OverlayMotion.GLOW_BLOOM_PEAK_AT.toDouble()), 1e-4f)
    assertEquals(1f, GlowMath.bloomScale(OverlayMotion.GLOW_BLOOM_MS.toDouble()), 1e-4f)
    assertEquals(0f, GlowMath.bloomOpacity(0.0), 0f)
    assertEquals(1f, GlowMath.bloomOpacity(OverlayMotion.GLOW_BLOOM_MS.toDouble()), 0f)
  }

  @Test
  fun `a wake starts the bloom once and a listening glow after it does not`() {
    val motion = GlowMotion(false)
    motion.set(GlowMode.Bloom, true)
    run(motion, 100)
    assertTrue(motion.frame.bloomScale > 1f)
    run(motion, 700)
    assertEquals(1f, motion.frame.bloomScale, 0f)
    motion.set(GlowMode.Listening, true)
    run(motion, 100)
    assertEquals(1f, motion.frame.bloomScale, 0f)
  }

  @Test
  fun `the band follows the level between its rest and full size`() {
    val motion = GlowMotion(false)
    motion.set(GlowMode.Listening, true)
    run(motion, 400, 0.0)
    assertEquals(0.4f, motion.frame.scaleY, 1e-4f)
    assertEquals(0.35f, motion.frame.opacity, 1e-4f)
    run(motion, 400, 1.0)
    assertEquals(1f, motion.frame.scaleY, 1e-4f)
    assertEquals(0.9f, motion.frame.opacity, 1e-4f)
  }

  @Test
  fun `thinking shimmers between the two opacities and gathers the blobs`() {
    assertEquals(0.35f, GlowMath.shimmer(0.0), 1e-4f)
    assertEquals(0.6f, GlowMath.shimmer(OverlayMotion.GLOW_SHIMMER_MS.toDouble()), 1e-4f)
    val motion = GlowMotion(false)
    motion.set(GlowMode.Shimmer, true)
    run(motion, 3000)
    assertEquals(0.4f, motion.frame.blobX[0], 1e-3f)
    assertEquals(0.5f, motion.frame.blobX[1], 1e-3f)
    assertEquals(0.6f, motion.frame.blobX[2], 1e-3f)
    assertEquals(0.5f, motion.frame.scaleY, 0f)
  }

  @Test
  fun `the blobs drift across their span and a speaking glow drifts faster`() {
    assertEquals(-0.05f, GlowMath.driftOffset(0, 0.0, 14_000), 1e-5f)
    assertEquals(0.05f, GlowMath.driftOffset(0, 14_000.0, 14_000), 1e-5f)
    assertEquals(-0.05f, GlowMath.driftOffset(0, 28_000.0, 14_000), 1e-5f)
    assertTrue(GlowMath.periodMs(GlowMode.Speaking) < GlowMath.periodMs(GlowMode.Listening))
    assertFalse(GlowMath.drifts(GlowMode.Shimmer))
  }

  @Test
  fun `a reduced glow is a calm static band that never loops`() {
    val motion = GlowMotion(true)
    motion.set(GlowMode.Listening, true)
    run(motion, 300, 1.0)
    assertEquals(32f / 120f, motion.frame.scaleY, 1e-5f)
    assertEquals(0.45f, motion.frame.opacity, 0f)
    assertEquals(0f, motion.frame.rim, 0f)
    assertEquals(1f, motion.frame.master, 0f)
    assertFalse(motion.animating())
  }

  @Test
  fun `the glow fades in and out in 280 ms and is idle when off`() {
    val motion = GlowMotion(false)
    assertFalse(motion.animating())
    motion.set(GlowMode.Speaking, true)
    assertTrue(motion.animating())
    run(motion, 300)
    assertEquals(1f, motion.frame.master, 0f)
    motion.set(GlowMode.Off, false)
    run(motion, 300)
    assertEquals(0f, motion.frame.master, 0f)
    assertFalse(motion.animating())
  }

  @Test
  fun `a listening glow keeps looping until the rest stops the frames`() {
    val motion = GlowMotion(false)
    motion.set(GlowMode.Listening, true)
    run(motion, 2000)
    assertTrue(motion.animating())
  }

  companion object {
    private const val STEP = 16
  }
}

class OrbMotionTest {
  @Test
  fun `each orb state has the loop speeds of the call orb`() {
    assertEquals(9000L, OrbLoops.of(OrbState.Idle).swirlMs)
    assertEquals(6000L, OrbLoops.of(OrbState.Listening).swirlMs)
    assertEquals(1400L, OrbLoops.of(OrbState.Thinking).swirlMs)
    assertEquals(3500L, OrbLoops.of(OrbState.Speaking).swirlMs)
    assertNull(OrbLoops.of(OrbState.Idle).haloMs)
    assertNull(OrbLoops.of(OrbState.Thinking).haloMs)
    assertEquals(1800L, OrbLoops.of(OrbState.Listening).haloMs)
    assertEquals(1200L, OrbLoops.of(OrbState.Speaking).haloMs)
    assertTrue(OrbLoops.of(OrbState.Thinking).breathe)
  }

  @Test
  fun `the level swells the orb by the gain of its state and it settles`() {
    val motion = OrbMotion(false)
    motion.set(OrbState.Speaking, false)
    repeat(300) { motion.advance(16.0, 1.0) }
    assertEquals(1.22f, motion.frame.scale, 1e-3f)
    repeat(300) { motion.advance(16.0, 0.0) }
    assertEquals(1f, motion.frame.scale, 1e-3f)
  }

  @Test
  fun `a dimmed orb does not loop and has no aura`() {
    val motion = OrbMotion(false)
    motion.set(OrbState.Idle, true)
    repeat(200) { motion.advance(16.0, 0.0) }
    assertFalse(motion.animating())
    assertEquals(0f, motion.frame.auraAlpha, 0f)
    assertEquals(0f, motion.frame.swirl, 0f)
  }

  @Test
  fun `reduced motion shows a still sphere`() {
    val motion = OrbMotion(true)
    motion.set(OrbState.Speaking, false)
    motion.ignite()
    repeat(50) { motion.advance(16.0, 1.0) }
    assertFalse(motion.animating())
    assertEquals(1f, motion.frame.scale, 0f)
    assertEquals(0f, motion.frame.swirl, 0f)
    assertEquals(0f, motion.frame.haloAlpha, 0f)
    assertEquals(1f, motion.frame.igniteScale, 0f)
  }

  @Test
  fun `the orb ignites from a small dim sphere and the burst fades`() {
    val motion = OrbMotion(false)
    motion.set(OrbState.Listening, false)
    motion.ignite()
    assertEquals(0.55f, motion.frame.igniteScale, 1e-3f)
    assertEquals(0f, motion.frame.igniteAlpha, 0f)
    repeat(60) { motion.advance(16.0, 0.0) }
    assertEquals(1f, motion.frame.igniteScale, 0f)
    assertEquals(0f, motion.frame.burstAlpha, 0f)
  }

  @Test
  fun `the swirl turns a full circle in its period`() {
    val motion = OrbMotion(false)
    motion.set(OrbState.Listening, false)
    var turned = 0f
    repeat(1000) {
      motion.advance(6.0, 0.0)
      turned = motion.frame.swirl
    }
    assertEquals(0f, turned, 1.5f)
  }

  @Test
  fun `a spring reaches its target without leaving it`() {
    assertEquals(0.0, OverlaySpring.position(0.0, 18.0, 260.0), 0.0)
    assertEquals(1.0, OverlaySpring.position(1000.0, 18.0, 260.0), 1e-3)
    assertEquals(1.0, OverlaySpring.position(1000.0, 60.0, 260.0), 1e-3)
  }
}

class RibbonMotionTest {
  @Test
  fun `the bars rise with the level, the middle highest, and fall back to rest`() {
    val motion = RibbonMotion(false)
    repeat(120) { motion.advance(16.0, 1.0) }
    assertTrue(motion.positions[4] > motion.positions[0])
    assertTrue(motion.positions[4] > 0.5)
    repeat(120) { motion.advance(16.0, 0.0) }
    assertEquals(0.0, motion.positions[4], 0.01)
  }

  @Test
  fun `a quiet level does not move the bars`() {
    val motion = RibbonMotion(false)
    assertEquals(0.0, RibbonShape.target(4, 0.02, 1.0), 0.0)
    assertFalse(motion.advance(16.0, 0.0))
  }

  @Test
  fun `a bar is never shorter than four dp of its 28 dp box and thinking rests at fifteen percent`() {
    assertEquals(4f / 28f, RibbonShape.barFraction(0.0, RibbonShape.restFraction(false)), 1e-6f)
    assertEquals(0.15f, RibbonShape.barFraction(0.0, RibbonShape.restFraction(true)), 1e-6f)
    assertEquals(1f, RibbonShape.barFraction(1.0, RibbonShape.restFraction(false)), 1e-6f)
  }

  @Test
  fun `reduced motion steps the bars five levels at most ten times a second`() {
    val motion = RibbonMotion(true)
    assertFalse(motion.advance(16.0, 0.5))
    var changes = 0
    repeat(30) { if (motion.advance(16.0, 0.5)) changes++ }
    assertEquals(1, changes)
    assertEquals(0.6, motion.step, 1e-9)
    assertEquals(0.6 * RibbonShape.WEIGHTS[4], motion.positions[4], 1e-9)
  }

  @Test
  fun `the narrow meter has five bars of at least six dp`() {
    assertEquals(0.375f, RibbonShape.meterFraction(0, 0.0), 1e-6f)
    assertEquals(1f, RibbonShape.meterFraction(2, 1.0), 1e-6f)
    assertEquals(0.8f, RibbonShape.meterFraction(1, 1.0), 1e-6f)
    assertEquals(0.4, RibbonShape.quantise(0.37), 1e-9)
  }
}

class OverlayPresenceTest {
  @Test
  fun `the pill rises, scales and fades in and is shown at the end`() {
    val presence = OverlayPresence(false)
    presence.show()
    assertEquals(PresencePhase.Entering, presence.phase)
    assertEquals(0f, presence.alpha, 0f)
    assertEquals(24f, presence.rise, 1e-3f)
    assertEquals(0.96f, presence.scale, 1e-3f)
    repeat(40) { presence.advance(16.0) }
    assertEquals(PresencePhase.Shown, presence.phase)
    assertEquals(1f, presence.alpha, 0f)
    assertEquals(0f, presence.rise, 0f)
    assertFalse(presence.animating())
  }

  @Test
  fun `the pill falls and fades out in 200 ms and is hidden at the end`() {
    val presence = OverlayPresence(false)
    presence.show()
    repeat(40) { presence.advance(16.0) }
    presence.hide()
    repeat(5) { presence.advance(16.0) }
    assertTrue(presence.alpha < 1f)
    assertTrue(presence.rise > 0f)
    repeat(10) { presence.advance(16.0) }
    assertEquals(PresencePhase.Hidden, presence.phase)
    assertEquals(0f, presence.alpha, 0f)
  }

  @Test
  fun `reduced motion only fades`() {
    val presence = OverlayPresence(true)
    presence.show()
    presence.advance(16.0)
    assertEquals(0f, presence.rise, 0f)
    assertEquals(1f, presence.scale, 0f)
    repeat(15) { presence.advance(16.0) }
    assertEquals(PresencePhase.Shown, presence.phase)
    presence.hide()
    repeat(15) { presence.advance(16.0) }
    assertEquals(PresencePhase.Hidden, presence.phase)
  }

  @Test
  fun `hiding something never shown does nothing`() {
    val presence = OverlayPresence(false)
    presence.hide()
    assertEquals(PresencePhase.Hidden, presence.phase)
    assertFalse(presence.animating())
  }
}

class OverlayPillMathTest {
  private fun view(state: OverlayState, caption: String? = "turn on the lights") =
    OVERLAY_HIDDEN.copy(state = state, status = "Listening", caption = caption)

  @Test
  fun `an error shows the problem and its reason, a missing caption shows one line`() {
    assertEquals(TextMode.Error, OverlayPillMath.textMode(view(OverlayState.Error)))
    assertEquals(TextMode.Single, OverlayPillMath.textMode(view(OverlayState.Listening, null)))
    assertEquals(TextMode.Normal, OverlayPillMath.textMode(view(OverlayState.Listening)))
  }

  @Test
  fun `only wake, error and ended are announced`() {
    assertEquals("Listening", OverlayPillMath.announcement(view(OverlayState.Wake)))
    assertEquals("Listening. turn on the lights", OverlayPillMath.announcement(view(OverlayState.Error)))
    assertEquals("Listening", OverlayPillMath.announcement(view(OverlayState.Ended)))
    assertNull(OverlayPillMath.announcement(view(OverlayState.Listening)))
    assertNull(OverlayPillMath.announcement(view(OverlayState.Speaking)))
  }

  @Test
  fun `the ribbon shows while the assistant is live and the orb dims when it cannot hear`() {
    assertTrue(OverlayPillMath.ribbonShown(view(OverlayState.Thinking)))
    assertFalse(OverlayPillMath.ribbonShown(view(OverlayState.Reconnecting)))
    assertFalse(OverlayPillMath.ribbonShown(view(OverlayState.Ended)))
    assertTrue(OverlayPillMath.dim(view(OverlayState.Error)))
    assertTrue(OverlayPillMath.dim(view(OverlayState.Reconnecting)))
    assertFalse(OverlayPillMath.dim(view(OverlayState.Speaking)))
  }

  @Test
  fun `the edge ring turns faster while the assistant speaks and rests when idle`() {
    assertEquals(1f, OverlayPillMath.edgeTarget(OverlayState.Speaking), 0f)
    assertEquals(0f, OverlayPillMath.edgeTarget(OverlayState.Error), 0f)
    assertEquals(0f, OverlayPillMath.edgeTarget(OverlayState.Hidden), 0f)
    assertTrue(OverlayPillMath.edgeSpinMs(OverlayState.Speaking) < OverlayPillMath.edgeSpinMs(OverlayState.Listening))
    assertTrue(OverlayPillMath.edgeSpinMs(OverlayState.Thinking) < OverlayPillMath.edgeSpinMs(OverlayState.Speaking))
  }

  @Test
  fun `the dot colour follows the state`() {
    val palette = OverlayTokens.dark
    assertEquals(palette.viz1, OverlayPillMath.dotColour(view(OverlayState.Speaking), palette))
    assertEquals(palette.critical, OverlayPillMath.dotColour(view(OverlayState.Error), palette))
    assertEquals(palette.faint, OverlayPillMath.dotColour(view(OverlayState.Ended), palette))
    assertEquals(palette.primary, OverlayPillMath.dotColour(view(OverlayState.Wake), palette))
    assertNotNull(palette)
  }
}

class GlowRestartTest {
  @Test
  fun `a second wake after the glow went away blooms again`() {
    val motion = GlowMotion(false)
    motion.set(GlowMode.Bloom, true)
    repeat(60) { motion.advance(16.0, 0.0) }
    assertEquals(1f, motion.frame.bloomScale, 0f)
    motion.set(GlowMode.Off, false)
    repeat(30) { motion.advance(16.0, 0.0) }
    motion.set(GlowMode.Bloom, true)
    repeat(5) { motion.advance(16.0, 0.0) }
    assertTrue(motion.frame.bloomScale > 1f)
  }
}
