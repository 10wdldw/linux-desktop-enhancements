-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 1.0
Source: libxcb
Binary: libxcb1, libxcb1-udeb, libxcb1-dev, libxcb-doc, libxcb-composite0, libxcb-composite0-dev, libxcb-damage0, libxcb-damage0-dev, libxcb-dpms0, libxcb-dpms0-dev, libxcb-glx0, libxcb-glx0-dev, libxcb-randr0, libxcb-randr0-dev, libxcb-record0, libxcb-record0-dev, libxcb-render0, libxcb-render0-dev, libxcb-res0, libxcb-res0-dev, libxcb-screensaver0, libxcb-screensaver0-dev, libxcb-shape0, libxcb-shape0-dev, libxcb-shm0, libxcb-shm0-dev, libxcb-sync1, libxcb-sync-dev, libxcb-xf86dri0, libxcb-xf86dri0-dev, libxcb-xfixes0, libxcb-xfixes0-dev, libxcb-xinerama0, libxcb-xinerama0-dev, libxcb-xinput0, libxcb-xinput-dev, libxcb-xtest0, libxcb-xtest0-dev, libxcb-xv0, libxcb-xv0-dev, libxcb-xvmc0, libxcb-xvmc0-dev, libxcb-dri2-0, libxcb-dri2-0-dev, libxcb-present0, libxcb-present-dev, libxcb-dri3-0, libxcb-dri3-dev, libxcb-xkb1, libxcb-xkb-dev
Architecture: any all
Version: 1.17.0-2ubuntu1
Maintainer: Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>
Uploaders:  Julien Cristau <jcristau@debian.org>,
Homepage: https://xcb.freedesktop.org
Standards-Version: 4.6.2
Vcs-Browser: https://salsa.debian.org/xorg-team/lib/libxcb
Vcs-Git: https://salsa.debian.org/xorg-team/lib/libxcb.git
Testsuite: autopkgtest
Testsuite-Triggers: build-essential, pkg-config, xauth, xvfb
Build-Depends: libxau-dev, libxdmcp-dev, xcb-proto (>= 1.17), xcb-proto (<< 2.0), libpthread-stubs0-dev [!linux-any], debhelper-compat (= 13), pkgconf, xutils-dev, xsltproc <!nocheck>, check <!nocheck>, python3-xcbgen (>= 1.14), libtool, automake, python3:native
Build-Depends-Indep: doxygen, graphviz
Package-List:
 libxcb-composite0 deb libs optional arch=any
 libxcb-composite0-dev deb libdevel optional arch=any
 libxcb-damage0 deb libs optional arch=any
 libxcb-damage0-dev deb libdevel optional arch=any
 libxcb-doc deb doc optional arch=all
 libxcb-dpms0 deb libs optional arch=any
 libxcb-dpms0-dev deb libdevel optional arch=any
 libxcb-dri2-0 deb libs optional arch=any
 libxcb-dri2-0-dev deb libdevel optional arch=any
 libxcb-dri3-0 deb libs optional arch=any
 libxcb-dri3-dev deb libdevel optional arch=any
 libxcb-glx0 deb libs optional arch=any
 libxcb-glx0-dev deb libdevel optional arch=any
 libxcb-present-dev deb libdevel optional arch=any
 libxcb-present0 deb libs optional arch=any
 libxcb-randr0 deb libs optional arch=any
 libxcb-randr0-dev deb libdevel optional arch=any
 libxcb-record0 deb libs optional arch=any
 libxcb-record0-dev deb libdevel optional arch=any
 libxcb-render0 deb libs optional arch=any
 libxcb-render0-dev deb libdevel optional arch=any
 libxcb-res0 deb libs optional arch=any
 libxcb-res0-dev deb libdevel optional arch=any
 libxcb-screensaver0 deb libs optional arch=any
 libxcb-screensaver0-dev deb libdevel optional arch=any
 libxcb-shape0 deb libs optional arch=any
 libxcb-shape0-dev deb libdevel optional arch=any
 libxcb-shm0 deb libs optional arch=any
 libxcb-shm0-dev deb libdevel optional arch=any
 libxcb-sync-dev deb libdevel optional arch=any
 libxcb-sync1 deb libs optional arch=any
 libxcb-xf86dri0 deb libs optional arch=any
 libxcb-xf86dri0-dev deb libdevel optional arch=any
 libxcb-xfixes0 deb libs optional arch=any
 libxcb-xfixes0-dev deb libdevel optional arch=any
 libxcb-xinerama0 deb libs optional arch=any
 libxcb-xinerama0-dev deb libdevel optional arch=any
 libxcb-xinput-dev deb libdevel optional arch=any
 libxcb-xinput0 deb libs optional arch=any
 libxcb-xkb-dev deb libdevel optional arch=any
 libxcb-xkb1 deb libs optional arch=any
 libxcb-xtest0 deb libs optional arch=any
 libxcb-xtest0-dev deb libdevel optional arch=any
 libxcb-xv0 deb libs optional arch=any
 libxcb-xv0-dev deb libdevel optional arch=any
 libxcb-xvmc0 deb libs optional arch=any
 libxcb-xvmc0-dev deb libdevel optional arch=any
 libxcb1 deb libs optional arch=any
 libxcb1-dev deb libdevel optional arch=any
 libxcb1-udeb udeb debian-installer optional arch=any profile=!noudeb
Checksums-Sha1:
 220ec81181bcd8bf5a8367610858673e8de6e705 661593 libxcb_1.17.0.orig.tar.gz
 0bdd8214b296f3b26cd3f63df78faed31b59b014 28420 libxcb_1.17.0-2ubuntu1.diff.gz
Checksums-Sha256:
 2c69287424c9e2128cb47ffe92171e10417041ec2963bceafb65cb3fcf8f0b85 661593 libxcb_1.17.0.orig.tar.gz
 46de9f8ac632740414a9ac96f4262b43bb33292cbdcc972236342ded9e025f15 28420 libxcb_1.17.0-2ubuntu1.diff.gz
Files:
 186c67e4fdc867dd7372f04b4dfa7c03 661593 libxcb_1.17.0.orig.tar.gz
 851cbe9048d5c48ff6ab9c9cc9089221 28420 libxcb_1.17.0-2ubuntu1.diff.gz
Original-Maintainer: Debian X Strike Force <debian-x@lists.debian.org>

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEkv5Pi0DK3E7M1gwfWWH9vpxhmAkFAml40nMACgkQWWH9vpxh
mAns2w//R8AidW07PyAyoadShzMaFUYrC4r+gfz+YQJ0h8f1TcnDiEUBv55mwo8+
v9PRiZKNazWzhVgpSz1QleYZUxgwU0i3IgtTc6X2fKWi53a/hf+dtXJFaMXW7YuW
HxjiN42/enZmY7g8c7QgoHh+Jp+on8CDvhBuueW6TqIT13JGdsNmCaribrLwyzCH
TnD2EhLM8VfoTd6g9GneXlSY7CqLTlyQ/fC1S6pIM7lyvH8o9dGrJbQXGG0am4Zs
rDm7uwLuarxdE6//Et5STDmwTsazJt416ZMMkn6oV+tpw5pZ4Z5xs1/87K8MU6yr
tzonh5FJfyvBb82seo6EEh+pmCVzKXlCOlkhh4ukQL1BSfAXHm255iJ4rCe2Y61G
+vr2KTaMrS8zzGotQH8TIwjztenrTZKdWBQ/bDCka9/OQRrBZaqezmzc+n50u7IN
/4MdbyrPBinh3A4/t7923o72YqY4BKRKUz4hgZ85ZOZOdrCK9l2ljAyYNFHxWkP6
BpYkgtflVCxeN1AoF8YQQEOp57428wz6tpxt7d/QnguVouKOK3BncJmD8u+CxA/+
o5bhGIWZ/4sPFdhlkYaCY3bUV2G/ew7+NQc97JPb9o5kdRYKLVf2p+33hqs5+ncz
Ood381AdKxThJQ1pUjSWWLvo8JbJi0cuPW/JPOp6jl9WB0bk/wY=
=+0eW
-----END PGP SIGNATURE-----
