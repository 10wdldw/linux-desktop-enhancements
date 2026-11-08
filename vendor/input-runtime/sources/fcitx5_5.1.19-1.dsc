-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: fcitx5
Binary: fcitx5, fcitx5-data, fcitx5-frontend-all, fcitx5-modules, fcitx5-modules-dev, libfcitx5config-dev, libfcitx5config6, libfcitx5core-dev, libfcitx5core7, libfcitx5utils-dev, libfcitx5utils2
Architecture: any all
Version: 5.1.19-1
Maintainer: Debian Input Method Team <debian-input-method@lists.debian.org>
Uploaders: Boyuan Yang <byang@debian.org>
Homepage: https://github.com/fcitx/fcitx5
Description: Fcitx Input Method Framework v5
 Fcitx5 is the next generation of fcitx input method framework. It
 provides pleasant and modern input experience with intuitive graphical
 configuration tools. The framework is highly extensible with support
 for GTK+ and Qt toolkits, D-Bus interfaces, a large variety of desktop
 environments and a developer-friendly API.
 .
 Some of its new features include support of both Wayland and Xorg
 and the ability to mimic IBus Input Method Framework in order to
 provide better compatibility across different Linux distributions
 and desktop environments.
Standards-Version: 4.7.3
Vcs-Browser: https://salsa.debian.org/input-method-team/fcitx5
Vcs-Git: https://salsa.debian.org/input-method-team/fcitx5.git
Build-Depends: appstream, cmake (>= 3.13), dbus-daemon <!nocheck>, debhelper-compat (= 13), dh-exec, extra-cmake-modules, gettext, iso-codes, libbrotli-dev, libcairo2-dev, libdbus-1-dev [!linux-any], libegl1-mesa-dev, libenchant-2-dev, libevent-dev [!linux-any], libexpat1-dev, libfmt-dev, libgdk-pixbuf-2.0-dev, nlohmann-json3-dev, libpango1.0-dev, libsystemd-dev [linux-any], libuv1-dev [!linux-any], libwayland-bin [linux-any], libwayland-dev [linux-any], libwayland-egl-backend-dev [linux-any], libxcb-ewmh-dev, libxcb-icccm4-dev, libxcb-imdkit-dev (>= 1.0.5~), libxcb-randr0-dev, libxcb-shape0-dev, libxcb-xfixes0-dev, libxcb-xinerama0-dev, libxcb-xkb-dev, libxcb1-dev, libxkbcommon-x11-dev, libxkbfile-dev, libyoga-dev, pkgconf, unicode-cldr-core, uuid-dev, wayland-protocols [linux-any]
Package-List:
 fcitx5 deb utils optional arch=any
 fcitx5-data deb utils optional arch=all
 fcitx5-frontend-all deb metapackages optional arch=all
 fcitx5-modules deb utils optional arch=any
 fcitx5-modules-dev deb libdevel optional arch=any
 libfcitx5config-dev deb libdevel optional arch=any
 libfcitx5config6 deb libs optional arch=any
 libfcitx5core-dev deb libdevel optional arch=any
 libfcitx5core7 deb libs optional arch=any
 libfcitx5utils-dev deb libdevel optional arch=any
 libfcitx5utils2 deb libs optional arch=any
Checksums-Sha1:
 209310b6abcf066f01c4c181922d3fb67e512c2f 9506876 fcitx5_5.1.19.orig.tar.xz
 b16338f942d095a9860156934213dfe57276bc46 12704 fcitx5_5.1.19-1.debian.tar.xz
Checksums-Sha256:
 8957c0a5bbd3caad42215496c21666abefe3be7399a38928639f3bb484ed6a1b 9506876 fcitx5_5.1.19.orig.tar.xz
 ddc83bcc4a08ca5e3a26522b9f78cd250ade5167fdeb27371693e953738b0ddf 12704 fcitx5_5.1.19-1.debian.tar.xz
Files:
 cec2cb280611239f57ed97300e868761 9506876 fcitx5_5.1.19.orig.tar.xz
 2c3570b6d2d07067a3fb14b63ba2c196 12704 fcitx5_5.1.19-1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEfncpR22H1vEdkazLwpPntGGCWs4FAmm6Go4ACgkQwpPntGGC
Ws683xAAqWYX+h6b/56lqPPdGfqd9613gt/cPXAUefJQb0gPEr974X3mJ63WrnjK
bj+j0n73RGhY6BRKoljP6s/FowsKm5conN1fwwHzX3FgZM5Gb+EAEv6xXPM/5noP
lb54Krm8HLwscG1LxsusmQcvY/qXROmI0oojWT1he2Hgi8hhPFHUiWxnlhxcKQLK
xRVymHyIYkcmYctENQ0ENxE+0TnO+SYG49e+FrKpXN+383dml7WNMw+iq6Qdi9eM
CEmXumiXYdZy+BZ/PYhmrzAQbNd5zd4WK8tTbwssNhIWXkJuSRt02kiD9SqoOQ5Z
fNRFoBq12PXkSbv22x90B20q7agX/jM110mCUoLlpWQpTXcSjJOk/AUZ+poRjgQp
08ZruSJ/7a8RR8U/xswHjYPClLpetc7NW/1DKmH2Q9zq3r0PXr5u5OjywIB1MvTf
cuJpPvc1UMqkUAYAHiocyQWoCcqD54aOhiH/M3a8Tp+/6uDxgSrwGe1iRL7F3RWe
qmoPHjMfRp4NF6rf+pqkX10j/H/nrbuUQvN3YWyXZzDzGXljZWnxH/GGhZ5Eb1xo
hgOeIkvGm6vTSJjoO4LItCXZyin7DIbxHERWmU3pfNbUr+8ZrIEH9PhKm/ivBWuE
WpkTd/2qknYYHWz+veKiF6oXmdF5x0bnmczNuEETosP45mq3B/4=
=XcMR
-----END PGP SIGNATURE-----
