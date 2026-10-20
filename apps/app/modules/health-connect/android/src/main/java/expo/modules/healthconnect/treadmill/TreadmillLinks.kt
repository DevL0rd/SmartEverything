package expo.modules.healthconnect.treadmill

object TreadmillLinks {
  private val links = HashMap<String, GattLink>()

  @Synchronized
  fun attach(deviceId: String, link: GattLink) {
    links[deviceId] = link
  }

  @Synchronized
  fun detach(deviceId: String, link: GattLink) {
    if (links[deviceId] === link) links.remove(deviceId)
  }

  @Synchronized
  fun of(deviceId: String): GattLink? = links[deviceId]
}
