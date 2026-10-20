package expo.modules.healthconnect.toothbrush

object BrushLinks {
  private val links = HashMap<String, BrushLink>()

  @Synchronized
  fun attach(deviceId: String, link: BrushLink) {
    links[deviceId] = link
  }

  @Synchronized
  fun detach(deviceId: String, link: BrushLink) {
    if (links[deviceId] === link) links.remove(deviceId)
  }

  @Synchronized
  fun of(deviceId: String): BrushLink? = links[deviceId]
}
