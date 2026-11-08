-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: librime
Binary: librime-bin, librime-dev, librime-plugin-charcode, librime-plugin-lua, librime-plugin-octagram, librime1t64
Architecture: any
Version: 1.16.1+dfsg1-1build1
Maintainer: Debian Input Method Team <debian-input-method@lists.debian.org>
Uploaders:  Qijiang Fan <fqj1994@gmail.com>, Aron Xu <aron@debian.org>, YunQiang Su <syq@debian.org>, Osamu Aoki <osamu@debian.org>, Guo Yixuan (郭溢譞) <culu.gyx@gmail.com>, Boyuan Yang <byang@debian.org>,
Homepage: https://github.com/rime/librime
Description: Rime Input Method Engine
 RIME is the acronym of Rime Input Method Engine.
 .
 RIME is a lightweight, extensible input method engine supporting various input
 schematas including glyph-based input methods, romanization-based input methods
 as well as those for Chinese dialects. It has the ability to compose phrases
 and sentences intelligently and provide very accurate traditional Chinese
 output. RIME's cross-platform core library is written in C++, and can work
 consistently on different platforms with OS-specific wrappers.
Standards-Version: 4.7.3
Vcs-Browser: https://salsa.debian.org/input-method-team/librime
Vcs-Git: https://salsa.debian.org/input-method-team/librime.git
Build-Depends: dpkg-dev (>= 1.22.5), capnproto, cmake (>= 3.12), darts, debhelper-compat (= 13), googletest <!nocheck>, libboost-dev, libboost-locale-dev, libboost-regex-dev, libcapnp-dev, libgoogle-glog-dev, libleveldb-dev, liblua5.4-dev, libmarisa-dev (>> 0.3), libopencc-dev (>= 1.1.9+ds1-3~), libutfcpp-dev (>= 3.2.4), libxcb-keysyms1-dev, libyaml-cpp-dev (>= 0.6.3-7~), pkgconf, x11proto-core-dev, zlib1g-dev
Package-List:
 librime-bin deb utils optional arch=any
 librime-dev deb libdevel optional arch=any
 librime-plugin-charcode deb libs optional arch=any
 librime-plugin-lua deb libs optional arch=any
 librime-plugin-octagram deb libs optional arch=any
 librime1t64 deb libs optional arch=any
Checksums-Sha1:
 8dc477d77ffc4107103a0f8383216716100eeeb5 6044 librime_1.16.1+dfsg1.orig-librime-charcode.tar.xz
 a8868f4ce47450434bcc9f220088dc31e9fac5f6 42548 librime_1.16.1+dfsg1.orig-librime-lua.tar.xz
 8f1ebdd4cd6b94d9055ce97f69586aaed036a8c1 16084 librime_1.16.1+dfsg1.orig-librime-octagram.tar.xz
 e20fc3f4065be80be14f953515ee1253e3064ccd 1990000 librime_1.16.1+dfsg1.orig.tar.xz
 026bf7fbb270e8af785b005a721e5e700e2d83e7 10380 librime_1.16.1+dfsg1-1build1.debian.tar.xz
Checksums-Sha256:
 83a2d3384222e35bbfe93087ef3e3fa139af82ac2e2c13b9e5f5bbb00ed9bdaf 6044 librime_1.16.1+dfsg1.orig-librime-charcode.tar.xz
 812b539f5f08d4aa2b3e3ae50d5fba419a7b475812cfac9a07742612a42dbefc 42548 librime_1.16.1+dfsg1.orig-librime-lua.tar.xz
 9284b06e74a50f54aadb9c2b831f6e255ff2f3e84c2247b3dad9114edb06d849 16084 librime_1.16.1+dfsg1.orig-librime-octagram.tar.xz
 a1d2a4921ad183585c489bd6c6d18674b4b8fdea06543f22c015ae6e6cfa5f3e 1990000 librime_1.16.1+dfsg1.orig.tar.xz
 891155b7371dff57bb25013203b18e19cfa6e66e379692c474f878518b41d2fb 10380 librime_1.16.1+dfsg1-1build1.debian.tar.xz
Files:
 a07f7ae720c448e1ecae9afb1d320bc0 6044 librime_1.16.1+dfsg1.orig-librime-charcode.tar.xz
 a02c2d46143f55fed77c87bf59e2d227 42548 librime_1.16.1+dfsg1.orig-librime-lua.tar.xz
 7b41449e434101fabb81b9c3239c1601 16084 librime_1.16.1+dfsg1.orig-librime-octagram.tar.xz
 05f2e3dd194ccd7902cf4ba34a2045b8 1990000 librime_1.16.1+dfsg1.orig.tar.xz
 d996de1dc1b21ce23d254be8207469a7 10380 librime_1.16.1+dfsg1-1build1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEVovyKmYzfL/Jprm3LIPbyOm9DjcFAmmDR90ACgkQLIPbyOm9
DjfMUw//UfEiID1ObiE1YZkrBxrU/J8LsuIqkTkLdn1aznQdzBfquq9y6BU2EU1O
YevzAOC3v2ym1Yc/wx5Nc/JFgkDnDwb3O/J3E4ZdwZuVFBQ1Jc+59qA3Jzj9Kbia
waOlpYf2XEDV/AvOjusao9trueW2QPveyVS4daWxoBf8mQniYx6gHBXnuh70SGK+
r+Ae7VfAn7K6JHyXdtPrTozFKpA+sLl2iZVI3Hc1rqKF9dK/JvvK0jrU/cK/f8eZ
Ljaub33kn80rJYmpSpjNueXwWUjACiZiJ6VXGZiFTasG6cKJOon7uK1MMPBk+jbj
VadrXrSCzxWD9hqbClujtAjm10bjx5FRirsjCCDXD3/QVDwK26iKjZpQqVLou1wZ
4pIRFQ5HrLOUbPT44bnTkS+L+70pRqUbcR9fvKU66PiW2kdgKM9TeTWZWbIhbJKT
ADoXyyckDX6QdodaTwXf4VevB+ITY2OMMbucLHj74Vgdhy5bt09VB/gt2YvTcKEj
Lta9qayGaWlshchjkkjYSELFAlS3VWur77LekwdPmkpgNjgZeif4nMK4K6BtKKf3
p9CwLzRquf/Z7IBNFpjrmUH/O9MSd2C20cGY3jQD/Sp/Ohge3Ij6liRu/8k2L8Zn
N49ragIFFcDvGvyzqbmh2wM2PGZYDn5aLK5Cpjvjqm7CrDuSxro=
=wbHB
-----END PGP SIGNATURE-----
