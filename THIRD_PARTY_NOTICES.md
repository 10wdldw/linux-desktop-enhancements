# Third-party notices and redistribution review

The user authorized distribution of this package under GPL-3.0. The package-level license is in `LICENSE`. Preserve each third-party component's own terms and notices; the package-level license does not replace them.

## MacStyle themes

The local theme metadata description matches WhiteSur GTK Theme's generated theme metadata. WhiteSur GTK Theme is MIT-licensed; the included notice is `licenses/WhiteSur-MIT.txt`. The local theme folders did not retain an upstream commit identifier. Upstream project: https://github.com/vinceliuice/WhiteSur-gtk-theme. The GNOME Shell CSS also retains its embedded GNOME/LGPL notices.

## Rounded-window code in MacStyle Session

`extensions/macstyle-session@local/rwc/` contains adapted Rounded Window Corners code by flexagoon, whose upstream repository carries GPL-3.0. The corresponding license text is included at `licenses/Rounded-Window-Corners-GPL-3.0.txt`, and the component notice is `extensions/macstyle-session@local/rwc/UPSTREAM.md`. The installed copy did not retain the exact upstream commit identifier.

## User-authored extensions and changes

Quick Power Countdown, HDR Scanout Helper, and the local MacStyle Session changes are included from the user's installed extension directories and are covered by the package's GPL-3.0 distribution license, subject to the upstream notices above. The exact upstream revisions for WhiteSur and Rounded Window Corners were not retained in the installed copies; this provenance limitation is documented rather than guessed.

## Redistribution checklist

Before tagging a release, verify the package on a clean Ubuntu/GNOME Shell 50 installation and, if practical, identify the precise upstream source revisions represented by the installed theme and rounded-window code.

