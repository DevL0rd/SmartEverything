export const IDENTITY_SCRIPT =
  '$cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem; $enc = Get-CimInstance Win32_SystemEnclosure; [pscustomobject]@{ osName = [string]$os.Caption; vendor = [string]$cs.Manufacturer; product = [string]$cs.Model; chassis = @($enc.ChassisTypes | ForEach-Object { [int]$_ }); batteries = @(Get-CimInstance Win32_Battery).Count }';

export const MEMORY_SCRIPT =
  '$os = Get-CimInstance Win32_OperatingSystem; $mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [pscustomobject]@{ total = [double]$os.TotalVisibleMemorySize * 1024; available = [double]$os.FreePhysicalMemory * 1024; free = [double]$mem.FreeAndZeroPageListBytes; cached = [double]$mem.StandbyCacheNormalPriorityBytes + [double]$mem.StandbyCacheReserveBytes + [double]$mem.StandbyCacheCoreBytes; swapTotal = [double]$os.SizeStoredInPagingFiles * 1024; swapFree = [double]$os.FreeSpaceInPagingFiles * 1024 }';

export const DISKS_SCRIPT =
  '$perf = @{}; Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | ForEach-Object { $perf[[string]$_.Name] = $_ }; ,@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { $p = $perf[[string]$_.DeviceID]; [pscustomobject]@{ device = [string]$_.DeviceID; label = [string]$_.VolumeName; filesystem = [string]$_.FileSystem; total = [double]$_.Size; free = [double]$_.FreeSpace; read = if ($p) { [double]$p.DiskReadBytesPersec } else { 0 }; write = if ($p) { [double]$p.DiskWriteBytesPersec } else { 0 } } })';

export const NETWORK_SCRIPT =
  '$stats = @{}; Get-NetAdapterStatistics | ForEach-Object { $stats[[string]$_.Name] = $_ }; ,@(Get-NetAdapter -Physical | ForEach-Object { $s = $stats[[string]$_.Name]; [pscustomobject]@{ name = [string]$_.Name; status = [string]$_.Status; media = [string]$_.PhysicalMediaType; speed = [double]$_.Speed; received = if ($s) { [double]$s.ReceivedBytes } else { 0 }; sent = if ($s) { [double]$s.SentBytes } else { 0 } } })';

export const BATTERY_SCRIPT =
  '$b = Get-CimInstance Win32_Battery | Select-Object -First 1; if ($b) { [pscustomobject]@{ level = [double]$b.EstimatedChargeRemaining; status = [int]$b.BatteryStatus; minutes = [double]$b.EstimatedRunTime } } else { $null }';

export const PROCESS_COUNT_SCRIPT =
  '[int](Get-CimInstance Win32_PerfFormattedData_PerfOS_System).Processes';

export const PROCESSES_SCRIPT =
  'if (-not $global:SeOwners) { $global:SeOwners = @{} }; $live = @{}; $rows = @(Get-CimInstance Win32_Process | ForEach-Object { $created = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; $key = [string]$_.ProcessId + ":" + [string]$created; $live[$key] = $true; if (-not $global:SeOwners.ContainsKey($key)) { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction SilentlyContinue; $global:SeOwners[$key] = if ($o -and $o.User) { [string]$o.User } else { "" } }; [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; command = [string]$_.CommandLine; threads = [int]$_.ThreadCount; memory = [double]$_.WorkingSetSize; cpuSeconds = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000000; created = [double]$created; user = $global:SeOwners[$key] } }); @($global:SeOwners.Keys) | Where-Object { -not $live.ContainsKey($_) } | ForEach-Object { $global:SeOwners.Remove($_) }; ,$rows';
