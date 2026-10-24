#!/usr/bin/env bash
set -euo pipefail

package_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
data_root="${XDG_DATA_HOME:-${HOME}/.local/share}"
state_root="${XDG_STATE_HOME:-${HOME}/.local/state}/linux-desktop-enhancements"
backup_existing=0
dry_run=0

usage() {
  cat <<'EOF'
Install the Linux Desktop Enhancements package for the current user.

Usage: bash scripts/install.sh [--backup-existing] [--dry-run]

  --backup-existing  Move existing target directories into a dated backup before installing.
  --dry-run          Show the planned file operations without changing anything.
  -h, --help         Show this help.

The installer never enables extensions or changes GNOME settings.
EOF
}

while (($#)); do
  case "$1" in
    --backup-existing) backup_existing=1 ;;
    --dry-run) dry_run=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v gnome-shell >/dev/null 2>&1; then
  printf 'GNOME Shell was not found. This package targets Ubuntu with GNOME Shell 50.\n' >&2
  exit 1
fi

shell_version="$(gnome-shell --version 2>/dev/null || true)"
if [[ ! "$shell_version" =~ ([0-9]+) ]]; then
  printf 'Could not determine GNOME Shell version: %s\n' "$shell_version" >&2
  exit 1
fi
if [[ "${BASH_REMATCH[1]}" != 50 ]]; then
  printf 'Unsupported GNOME Shell version: %s (expected major version 50).\n' "$shell_version" >&2
  exit 1
fi

targets=(
  "extensions/macstyle-session@local:$data_root/gnome-shell/extensions/macstyle-session@local"
  "extensions/quick-power-countdown@local:$data_root/gnome-shell/extensions/quick-power-countdown@local"
  "extensions/hdr-scanout@local:$data_root/gnome-shell/extensions/hdr-scanout@local"
  "themes/MacStyle-Light:$data_root/themes/MacStyle-Light"
  "themes/MacStyle-Dark:$data_root/themes/MacStyle-Dark"
)

conflicts=()
for item in "${targets[@]}"; do
  source_rel="${item%%:*}"
  destination="${item#*:}"
  if [[ ! -d "$package_root/$source_rel" ]]; then
    printf 'Package source is missing: %s\n' "$package_root/$source_rel" >&2
    exit 1
  fi
  if [[ -e "$destination" && "$backup_existing" -ne 1 ]]; then
    conflicts+=("$destination")
  fi
done

if ((${#conflicts[@]})); then
  printf 'These targets already exist; no files were changed:\n' >&2
  printf '  %s\n' "${conflicts[@]}" >&2
  printf 'Review them, then rerun with --backup-existing to move them into a dated backup.\n' >&2
  exit 1
fi

backup_dir="$state_root/backups/$(date -u +%Y%m%dT%H%M%SZ)"
if [[ "$dry_run" -eq 1 ]]; then
  printf 'GNOME Shell: %s\n' "$shell_version"
  for item in "${targets[@]}"; do
    source_rel="${item%%:*}"
    destination="${item#*:}"
    if [[ -e "$destination" ]]; then
      printf 'Would move %s to %s/%s\n' "$destination" "$backup_dir" "$source_rel"
    fi
    printf 'Would install %s to %s\n' "$source_rel" "$destination"
  done
  exit 0
fi

mkdir -p "$state_root"
for item in "${targets[@]}"; do
  source_rel="${item%%:*}"
  destination="${item#*:}"
  if [[ -e "$destination" ]]; then
    backup_destination="$backup_dir/$source_rel"
    mkdir -p "$(dirname -- "$backup_destination")"
    mv -- "$destination" "$backup_destination"
    printf 'Backed up: %s\n' "$backup_destination"
  fi
  mkdir -p "$(dirname -- "$destination")"
  cp -a -- "$package_root/$source_rel" "$destination"
  printf 'Installed: %s\n' "$destination"
done

printf '\nInstallation complete. Extensions remain disabled and desktop settings are unchanged.\n'
printf 'Enable selected extensions manually in GNOME Extensions. HDR Scanout Helper is intentionally opt-in.\n'
if [[ -d "$backup_dir" ]]; then
  printf 'Recoverable backups: %s\n' "$backup_dir"
fi

