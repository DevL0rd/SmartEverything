import BatteryChargingGlyph from 'lucide-react-native/icons/battery-charging';
import GpuGlyph from 'lucide-react-native/icons/gpu';
import HardDriveGlyph from 'lucide-react-native/icons/hard-drive';
import LaptopGlyph from 'lucide-react-native/icons/laptop';
import MemoryStickGlyph from 'lucide-react-native/icons/memory-stick';
import MonitorOffGlyph from 'lucide-react-native/icons/monitor-off';
import NetworkGlyph from 'lucide-react-native/icons/network';
import PrinterGlyph from 'lucide-react-native/icons/printer';
import UsbGlyph from 'lucide-react-native/icons/usb';

export const COMPUTER_GLYPHS = {
  gpu: GpuGlyph,
  memoryStick: MemoryStickGlyph,
  hardDrive: HardDriveGlyph,
  monitorOff: MonitorOffGlyph,
  batteryCharging: BatteryChargingGlyph,
  usb: UsbGlyph,
  network: NetworkGlyph,
  laptop: LaptopGlyph,
  printer: PrinterGlyph,
} as const;
