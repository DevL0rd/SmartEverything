import { FIREWALL_GROUP, type UfwMacEntry, type UfwStaleRule } from './api/firewall';

export const UFW_MAC_BEGIN = '# BEGIN SmartEverything MAC openings';

export const UFW_MAC_END = '# END SmartEverything MAC openings';

export const UFW_RULE_FILES = [
  { path: '/etc/ufw/after.rules', chain: 'ufw-after-input' },
  { path: '/etc/ufw/after6.rules', chain: 'ufw6-after-input' },
] as const;

export const UFW_ADDRESS_RULE_COMMENTS: readonly string[] = [
  `${FIREWALL_GROUP} camera`,
  `${FIREWALL_GROUP} device push`,
];

export function ufwMacWord(entry: UfwMacEntry): string {
  return `${entry.protocol},${entry.port === null ? 'any' : String(entry.port)},${entry.mac}`;
}

export function ufwStaleWord(rule: UfwStaleRule): string {
  return `${rule.protocol},${String(rule.port)},${rule.source},${rule.destination},${rule.interface ?? 'any'}`;
}

const REWRITE_AWK = `
BEGIN { count = split(entries, wanted, " ") }
$0 == begin { skipping = 1; next }
$0 == end { skipping = 0; next }
skipping { next }
{ lines[++total] = $0 }
END {
  for (i = 1; i <= total; i++) if (lines[i] == "COMMIT") last = i
  for (i = 1; i <= total; i++) {
    if (i == last && count > 0) {
      print begin
      for (j = 1; j <= count; j++) {
        split(wanted[j], part, ",")
        dport = part[2] == "any" ? "" : " --dport " part[2]
        print "-A " chain " -p " part[1] dport " -m mac --mac-source " part[3] " -j ACCEPT"
      }
      print end
    }
    print lines[i]
  }
}`;

export const UFW_MAC_SCRIPT = `set -e
entries=$1
stale=$2
staleRules=$3
shift 3
backup=$(mktemp -d)
files=
restore() {
  for file in $files; do cp -p "$backup/$(basename "$file")" "$file"; done
  ufw reload
  rm -rf "$backup"
}
while [ $# -gt 0 ]; do
  file=$1
  chain=$2
  shift 2
  cp -p "$file" "$backup/"
  files="$files $file"
  tmp=$(mktemp "$file.XXXXXX")
  awk -v entries="$entries" -v chain="$chain" -v begin="${UFW_MAC_BEGIN}" -v end="${UFW_MAC_END}" '${REWRITE_AWK}
' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
done
ufw reload || { restore; exit 1; }
rm -rf "$backup"
for address in $stale; do ufw delete allow in proto udp from "$address" to any; done
for rule in $staleRules; do
  IFS=,
  set -- $rule
  unset IFS
  if [ "$5" = any ]; then
    ufw delete allow in proto "$1" from "$3" to "$4" port "$2"
  else
    ufw delete allow in on "$5" proto "$1" from "$3" to "$4" port "$2"
  fi
done`;
