package expo.modules.healthconnect.watch

import java.time.Instant

class StageFit(val kept: List<SleepStage>, val changed: List<String>, val removedAll: Boolean = false)

object SleepStageWindow {
  fun fit(start: Instant, end: Instant, stages: List<SleepStage>): StageFit {
    val kept = mutableListOf<SleepStage>()
    val changed = mutableListOf<String>()
    stages.sortedBy { it.start }.forEach { stage ->
      val from = maxOf(stage.start, start, kept.lastOrNull()?.end ?: start)
      val to = minOf(stage.end, end)
      when {
        !to.isAfter(from) -> changed.add("dropped ${describe(stage)}: no length left inside the night $start to $end after earlier stages")
        from != stage.start || to != stage.end -> {
          changed.add("trimmed ${describe(stage)} to $from to $to")
          kept.add(SleepStage(from, to, stage.stage))
        }
        else -> kept.add(stage)
      }
    }
    if (!valid(start, end, kept)) {
      return StageFit(emptyList(), changed + "removed all ${kept.size} stages: they still break the night $start to $end", removedAll = true)
    }
    return StageFit(kept, changed)
  }

  fun valid(start: Instant, end: Instant, stages: List<SleepStage>): Boolean =
    stages.all { !it.start.isBefore(start) && !it.end.isAfter(end) && it.end.isAfter(it.start) } &&
      stages.zipWithNext().all { (a, b) -> !a.end.isAfter(b.start) }

  private fun describe(stage: SleepStage): String = "stage ${stage.stage} ${stage.start} to ${stage.end}"
}
