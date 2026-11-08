-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: fcitx5-qt
Binary: fcitx5-frontend-qt5, fcitx5-frontend-qt6, libfcitx5-qt-data, libfcitx5-qt-dev, libfcitx5-qt1, libfcitx5-qt6-1, libfcitx5-qt6-dev
Architecture: any all
Version: 5.1.13-1
Maintainer: Debian Input Method Team <debian-input-method@lists.debian.org>
Uploaders: Boyuan Yang <byang@debian.org>
Homepage: https://github.com/fcitx/fcitx5-qt
Description: Qt IM module for fcitx5
 Fcitx5 is the next generation of fcitx input method framework. It
 provides pleasant and modern input experience with intuitive graphical
 configuration tools. The framework is highly extensible with support
 for GTK+ and Qt toolkits, DBus interfaces, a large variety of desktop
 environments and a developer-friendly API.
 .
 Some of its new features include support of both Wayland and Xorg
 and the ability to mimic IBus Input Method Framework in order to
 provide better compatibility across different Linux distributions
 and desktop environments.
Standards-Version: 4.7.3
Vcs-Browser: https://salsa.debian.org/input-method-team/fcitx5-qt
Vcs-Git: https://salsa.debian.org/input-method-team/fcitx5-qt.git
Build-Depends: cmake, debhelper-compat (= 13), extra-cmake-modules, gettext, libfcitx5utils-dev (>= 5.1.14-4~), libxcb1-dev, libxkbcommon-dev, qt6-base-dev, qt6-base-private-dev, qt6-wayland [linux-any], qt6-wayland-dev [linux-any], qt6-wayland-private-dev [linux-any], qtbase5-dev, qtbase5-private-dev
Package-List:
 fcitx5-frontend-qt5 deb libs optional arch=any
 fcitx5-frontend-qt6 deb libs optional arch=any
 libfcitx5-qt-data deb libs optional arch=all
 libfcitx5-qt-dev deb libdevel optional arch=any
 libfcitx5-qt1 deb libs optional arch=any
 libfcitx5-qt6-1 deb libs optional arch=any
 libfcitx5-qt6-dev deb libdevel optional arch=any
Checksums-Sha1:
 9b95241cf25cb8a3f48ea9ec7b15d4298f94a87f 95532 fcitx5-qt_5.1.13.orig.tar.xz
 b292614cc3e02a2eda02dbb4f63575388580cf76 6680 fcitx5-qt_5.1.13-1.debian.tar.xz
Checksums-Sha256:
 3433bda27b86adfbbf432241fb779ac65b3f76c861e36ea2ce5fda89340d5308 95532 fcitx5-qt_5.1.13.orig.tar.xz
 4fa994ad9353cb52e00a7b7d8220d0051751a5e9d9064a2e02ae33d32b700511 6680 fcitx5-qt_5.1.13-1.debian.tar.xz
Files:
 5f696a08bcb0605c3927db130a24412f 95532 fcitx5-qt_5.1.13.orig.tar.xz
 a131a57f1dd2e1785cad9123dbaa307e 6680 fcitx5-qt_5.1.13-1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEfncpR22H1vEdkazLwpPntGGCWs4FAmm55mcACgkQwpPntGGC
Ws5IqxAAizfQAMViyHgVZklvkPzbNfZjzEYY9DAqf2jHU9C4xHJBXqf6aH4/aMDo
fElEBeIE8q9vMgZhOTEIkLXsN0d3MF6uaCPuZi5+3//8dR6VCDdfvy4YVczn2E0H
2rC1ZwaBwS34RF3fRoLjAZwc2yQqLxRGuU7uSClLtLALYsB8vbQ5Szj/iniFqoGH
Enftoy9A+6uW1J2AH4EFwHOd/QYyMKY+EYRGsz+4ywJPPvSUn3mbJRNxQs3gSPxv
bmLt/KBm7vOfdW40LcnSbhwYRRd250ru91ko0ikknZKuj3eyiBKkXFiN/CHdkPO9
IgLOiQyUlRle4f49Et807vUXpAAF9wae72aSh0oWm/2fczaQnNouY0/GIWh0UerB
yVYVFsEJXpDzh5EIf3je5Yu+jvI7DUWu3HOYWWID993e8KiROdlXSICEYWcm4b6c
TpQJ0OWzH+iOBfqOyzdzGGBSsoJd67HC26pyD+1GZm5B7MDIkyxDT3GsQeejJhKj
cZmuORwyNsPhRh3qx2g9Umc0rULYhx6GgCTEZ8KCYUkjKWXio9cZgD8s/SO/MFad
FGR55Q0jK6Q1MlK6O6fgv5JO4ImZow4suRcDPTUieQZIXykwCMtvtYSr0TIbGF64
LKEbT4C+E40KIDx+c/IlZcnncoXdbGWLxvZA/zwVFeFk+ILBG5E=
=+2Lp
-----END PGP SIGNATURE-----
