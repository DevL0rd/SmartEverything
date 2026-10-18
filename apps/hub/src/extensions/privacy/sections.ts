interface PrivacySection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

const STORAGE = 'Where your data lives';
const MEMBERS = 'Who can see what';
const HEALTH = 'Health Connect and activity';
const VOICE = 'Microphone and voice';
const SIGHT = 'Cameras and screen';
const LOCATION = 'Location';
const CALLS = 'Phone, contacts and calls';
const PHONE_ACCESS = 'Notifications, apps and accessibility';
const BLUETOOTH = 'Bluetooth devices';
const BACKGROUND = 'Phone settings and background running';
const SERVICES = 'Other services that receive data';
const DELETING = 'Deleting data';
const CONTACT = 'Questions';

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    title: STORAGE,
    paragraphs: [
      'SmartEverything runs on a server you control. Your devices and their history, camera recordings, transcripts, chats, automations, health records and everything your phone reports are stored in that server’s data folder.',
      'The people who make SmartEverything do not receive, store or sell any of it.',
    ],
  },
  {
    title: MEMBERS,
    paragraphs: [
      'The owner of the server has full access. Other members of the household reach only their own chats and their own files through the assistant.',
    ],
  },
  {
    title: HEALTH,
    paragraphs: [
      'With your permission the Android app reads the health records you choose in Health Connect and uploads them, over this server’s address, to your own server. Entries you make in SmartEverything, such as meals and body measurements, can be written back to Health Connect.',
      'Activity recognition lets the phone report whether you are walking, riding or still. Health data is used to show your fitness pages and to answer you, and is never shared or sold. When you ask the assistant about your health, the figures it needs pass through the AI provider you have chosen.',
    ],
  },
  {
    title: VOICE,
    paragraphs: [
      'The microphone is used to listen for your wake word when you switch that on, to talk to the voice assistant, for the walkie-talkie, and to talk through a camera. Wake word detection runs on your own phone, computer or server.',
      'Once a conversation starts, your voice is streamed to the voice provider you have chosen, today Google Gemini Live, for as long as the call lasts. Your server can also listen to the microphones of your cameras for the wake word and write transcripts; you control that in the listening settings. Transcripts are stored on your server.',
    ],
  },
  {
    title: SIGHT,
    paragraphs: [
      'The phone camera scans pairing codes and barcodes, and shows the assistant what you point it at while you are in a call with the camera on. Home cameras stream to your server, which stores their recordings and can describe them.',
      'When the assistant looks at your screen, Android asks you to confirm screen capture first, and the frames go to the AI provider only during that call.',
    ],
  },
  {
    title: LOCATION,
    paragraphs: [
      'Precise and background location lets your phone tell your server where it is, so SmartEverything knows when you are home or away, runs automations when you arrive at or leave a place you defined, and remembers where you parked. Location is stored on your server. If you ask the assistant about where you are, the answer passes through the AI provider you have chosen.',
    ],
  },
  {
    title: CALLS,
    paragraphs: [
      'Phone state, the call log and your contacts are used to show who is calling on your watch and in SmartEverything, to look up the caller’s name, and to answer or decline a call when you or the assistant ask. Contacts are looked up one number at a time; they are not copied to your server.',
    ],
  },
  {
    title: PHONE_ACCESS,
    paragraphs: [
      'Notification access passes your phone’s notifications to your watch and to SmartEverything. Usage access shows which app is in use and how long the screen has been on. Do not disturb access lets the assistant switch it on and off for you.',
      'The accessibility service only lets SmartEverything lock the phone and take a screenshot when you or the assistant ask. It does not read what is on the screen. Each of these is a switch in Android settings that you turn on yourself, and you can turn it off at any time.',
    ],
  },
  {
    title: BLUETOOTH,
    paragraphs: [
      'Bluetooth is used to hear your scale, connect to your watch, and notice your car. Readings from them are sent to your server.',
    ],
  },
  {
    title: BACKGROUND,
    paragraphs: [
      'Running in the background, starting after a restart, staying awake, showing alerts over other apps and ignoring battery optimisation keep wake listening, calls, sync and your watch working. Changing system settings, such as volume and ringer, lets the assistant do that when you ask.',
      'Storage permissions let you save and share files and recordings on older Android versions, multicast lets the app find your server on the local network, biometric permissions let you protect saved items with your fingerprint or face, and badge permissions let your launcher show unread counts on the app icon.',
      'Notifications and commands reach this phone through Google’s push service (Firebase Cloud Messaging), so the text of a notification passes through Google on its way to your phone.',
    ],
  },
  {
    title: SERVICES,
    paragraphs: [
      'To control your devices your server talks to Xiaomi, Tuya, Samsung SmartThings and Discord with the accounts you link. The assistant sends the conversation and the figures it needs to the AI provider you choose, such as Google Gemini, Anthropic Claude, OpenRouter or DeepSeek. Their own privacy policies cover what they receive and keep.',
    ],
  },
  {
    title: DELETING,
    paragraphs: [
      'Revoke any permission in Android settings at any time. Remove a health source in the app to stop uploads, delete chats, files, recordings and transcripts from the app, and delete the server’s data folder to erase everything. Access logs, wake records and app session records are removed automatically after 90 days.',
    ],
  },
  {
    title: CONTACT,
    paragraphs: [
      'SmartEverything is run by the person who owns your server, who is responsible for the data on it. Ask them to correct or delete anything.',
    ],
  },
];

export const PRIVACY_PERMISSION_TOPICS: Readonly<Record<string, string>> = {
  'android.permission.INTERNET': BACKGROUND,
  'android.permission.ACCESS_NETWORK_STATE': BACKGROUND,
  'android.permission.ACCESS_WIFI_STATE': BACKGROUND,
  'android.permission.ACCESS_FINE_LOCATION': LOCATION,
  'android.permission.ACCESS_COARSE_LOCATION': LOCATION,
  'android.permission.ACCESS_BACKGROUND_LOCATION': LOCATION,
  'android.permission.ACTIVITY_RECOGNITION': HEALTH,
  'com.google.android.gms.permission.ACTIVITY_RECOGNITION': HEALTH,
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS': BACKGROUND,
  'android.permission.PACKAGE_USAGE_STATS': PHONE_ACCESS,
  'android.permission.BLUETOOTH': BLUETOOTH,
  'android.permission.BLUETOOTH_ADMIN': BLUETOOTH,
  'android.permission.BLUETOOTH_SCAN': BLUETOOTH,
  'android.permission.BLUETOOTH_CONNECT': BLUETOOTH,
  'android.permission.RECEIVE_BOOT_COMPLETED': BACKGROUND,
  'android.permission.FOREGROUND_SERVICE': BACKGROUND,
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC': BACKGROUND,
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE': BACKGROUND,
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK': BACKGROUND,
  'android.permission.FOREGROUND_SERVICE_MICROPHONE': VOICE,
  'android.permission.FOREGROUND_SERVICE_CAMERA': SIGHT,
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION': SIGHT,
  'android.permission.POST_NOTIFICATIONS': BACKGROUND,
  'android.permission.REQUEST_COMPANION_RUN_IN_BACKGROUND': BACKGROUND,
  'android.permission.REQUEST_COMPANION_START_FOREGROUND_SERVICES_FROM_BACKGROUND': BACKGROUND,
  'android.permission.REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE': BLUETOOTH,
  'android.permission.READ_PHONE_STATE': CALLS,
  'android.permission.READ_CALL_LOG': CALLS,
  'android.permission.READ_CONTACTS': CALLS,
  'android.permission.ANSWER_PHONE_CALLS': CALLS,
  'android.permission.ACCESS_NOTIFICATION_POLICY': PHONE_ACCESS,
  'android.permission.VIBRATE': BACKGROUND,
  'android.permission.USE_FULL_SCREEN_INTENT': BACKGROUND,
  'android.permission.SYSTEM_ALERT_WINDOW': BACKGROUND,
  'android.permission.WRITE_SETTINGS': BACKGROUND,
  'android.permission.RECORD_AUDIO': VOICE,
  'android.permission.MODIFY_AUDIO_SETTINGS': BACKGROUND,
  'android.permission.WAKE_LOCK': BACKGROUND,
  'android.permission.CAMERA': SIGHT,
  'android.permission.READ_EXTERNAL_STORAGE': BACKGROUND,
  'android.permission.WRITE_EXTERNAL_STORAGE': BACKGROUND,
  'android.permission.CHANGE_WIFI_MULTICAST_STATE': BACKGROUND,
  'android.permission.USE_BIOMETRIC': BACKGROUND,
  'android.permission.USE_FINGERPRINT': BACKGROUND,
  'android.permission.READ_APP_BADGE': BACKGROUND,
  'com.google.android.c2dm.permission.RECEIVE': BACKGROUND,
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE': BACKGROUND,
};

export const LAUNCHER_BADGE_PERMISSION =
  /\.(?:launcher|home|provider\.badge|badger)\.permission\./u;

export const HEALTH_CONNECT_PERMISSION_PREFIX = 'android.permission.health.';
