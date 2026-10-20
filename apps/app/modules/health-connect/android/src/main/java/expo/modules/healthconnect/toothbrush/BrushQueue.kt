package expo.modules.healthconnect.toothbrush

sealed interface BrushOp {
  val strict: Boolean get() = false

  class Subscribe(val subscription: Subscription) : BrushOp

  class Read(
    val service: String,
    val characteristic: String,
    override val strict: Boolean,
    val expected: String? = null
  ) : BrushOp

  class Write(
    val service: String,
    val characteristic: String,
    val hex: String,
    val type: String,
    override val strict: Boolean
  ) : BrushOp

  class Frame(val hex: String) : BrushOp

  class CondorStart : BrushOp

  class Done(val callback: (Boolean, String) -> Unit) : BrushOp
}

class BrushQueue {
  private val urgent = ArrayDeque<BrushOp>()
  private val queue = ArrayDeque<BrushOp>()
  var current: BrushOp? = null
    private set

  fun addLast(op: BrushOp) {
    queue.addLast(op)
  }

  fun addUrgent(op: BrushOp) {
    urgent.addLast(op)
  }

  fun clearQueued() {
    queue.clear()
  }

  fun clear() {
    urgent.clear()
    queue.clear()
    current = null
  }

  fun take(): BrushOp? {
    if (current != null) return null
    val op = urgent.removeFirstOrNull() ?: queue.removeFirstOrNull() ?: return null
    current = op
    return op
  }

  fun release(): BrushOp? {
    val op = current
    current = null
    return op
  }

  fun refuse(op: BrushOp, detail: String) {
    if (!op.strict) return
    while (true) {
      val next = queue.removeFirstOrNull() ?: return
      if (next is BrushOp.Done) {
        next.callback(false, detail)
        return
      }
    }
  }

  fun failAll(reason: String) {
    val pending = listOfNotNull(current) + urgent + queue
    pending.filterIsInstance<BrushOp.Done>().forEach { it.callback(false, reason) }
  }
}
