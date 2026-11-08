-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: libxkbcommon
Binary: libxkbcommon0, libxkbcommon0-udeb, libxkbcommon-dev, libxkbcommon-doc, libxkbcommon-tools, libxkbcommon-x11-0, libxkbcommon-x11-dev, libxkbregistry0, libxkbregistry-dev
Architecture: any all
Version: 1.13.1-1
Maintainer: Debian X Strike Force <debian-x@lists.debian.org>
Uploaders: Michael Stapelberg <stapelberg@debian.org>
Homepage: https://www.xkbcommon.org/
Standards-Version: 4.6.1
Vcs-Browser: https://salsa.debian.org/xorg-team/lib/libxkbcommon
Vcs-Git: https://salsa.debian.org/xorg-team/lib/libxkbcommon.git
Testsuite: autopkgtest
Testsuite-Triggers: build-essential, pkg-config
Build-Depends: debhelper-compat (= 13), bison, dh-exec, doxygen, flex, graphviz, meson, pkgconf, quilt, libwayland-dev [linux-any], libxcb-xkb-dev, libxml2-dev, wayland-protocols [linux-any], x11-xkb-utils <!nocheck>, x11proto-dev, xkb-data <!nocheck>, xvfb <!nocheck>
Package-List:
 libxkbcommon-dev deb libdevel optional arch=any
 libxkbcommon-doc deb doc optional arch=all
 libxkbcommon-tools deb graphics optional arch=any
 libxkbcommon-x11-0 deb libs optional arch=any
 libxkbcommon-x11-dev deb libdevel optional arch=any
 libxkbcommon0 deb libs optional arch=any
 libxkbcommon0-udeb udeb debian-installer optional arch=any
 libxkbregistry-dev deb libdevel optional arch=any
 libxkbregistry0 deb libs optional arch=any
Checksums-Sha1:
 56ad7224bf61d2f7ae3ce92c99ee86b452147368 1234757 libxkbcommon_1.13.1.orig.tar.gz
 de4125b5f8598289bb21b2ad6087a414cfea9d22 8628 libxkbcommon_1.13.1-1.debian.tar.xz
Checksums-Sha256:
 6802621c81b674e468d2346a8f6d9a48ba5c154b72434a1c9e1a3eaa29f36fb5 1234757 libxkbcommon_1.13.1.orig.tar.gz
 7fd4bf7ebfc4c0c8f5bf75b59f9ad8c697618f07ed52feff135113c4ab2d56c9 8628 libxkbcommon_1.13.1-1.debian.tar.xz
Files:
 2974945e8655285fa8bf65a0c250cb29 1234757 libxkbcommon_1.13.1.orig.tar.gz
 9415ada68d79a5d09c168ad05dc6af60 8628 libxkbcommon_1.13.1-1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEdS3ifE3rFwGbS2Yjy3AxZaiJhNwFAmmAR1AACgkQy3AxZaiJ
hNxrhQ//Qc05xcJEfLnbBjj21hr5KEMRZnHGiTaYqSWOObjs9nx7XxJuUkPMf+JO
VHdOj+HksabDYTfJTArn2vtVeFNLewQRafl2MEGtlsJXe3agydKR0FFzAMQoijQf
mX4DgEFxwUz/Rex54jt+Gb3t6w+RpDEQ9STUu/Tdfo8XqmbMtmpwzzWLk4jQUpL3
h7OjEbSwY1n2m+CHJ7Iu6qRhatrK3SPcHdq1XhZcowITUyUaRE4PArYW4mMLEksW
bbZl2f5ORt9qo06PXabu3rJNEgyrlieE4GRcSglOiPsQU2oiMuLU+m7DhTeu9TLX
IKrodgaVyC0lCiBM0cOSa7E6d/RBpk0bkAhhTq2OPezChUiVq9t0/MaZf1ZPwshY
+EaRO9nZs+knoN2IYMiKZU630j3ALtAgRv2uitB6aiV5JXrLDp9eV3H8FDJbqzsu
1Jj/oL0aHjlZZc1TuxXgK6IW9fO7pOIdUkfBvqy/uI/l1mjW0ew4BqyJHaagHsIO
EUY0gkkY7ny6dRRfXaEry7Sv7me2tAlX+xZiUUJ3agXA8bTD1ylGg7lbY5Fxk5iE
YVtchF4Sx1U74xGkJH4UbAob2Go7V34najDts9e45FJLB/QikqQT8tMxbwrFDOa8
wbbXDibEqQLwjaznXrqhDTwyoRZfwn62SgomP7vhiQ2GKoRJRK4=
=dDvE
-----END PGP SIGNATURE-----
