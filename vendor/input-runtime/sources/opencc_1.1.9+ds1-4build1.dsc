-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: opencc
Binary: libopencc-data, libopencc-dev, libopencc-doc, libopencc1.1, opencc, python3-opencc
Architecture: any all
Version: 1.1.9+ds1-4build1
Maintainer: Debian Input Method Team <debian-input-method@lists.debian.org>
Uploaders:  Debian Chinese Team <chinese-developers@lists.alioth.debian.org>, Asias He <asias@debian.org>, YunQiang Su <syq@debian.org>, Osamu Aoki <osamu@debian.org>, Aron Xu <aron@debian.org>, xiao sheng wen <atzlinux@sina.com>, Boyuan Yang <byang@debian.org>,
Homepage: https://github.com/BYVoid/OpenCC
Description: simplified-traditional Chinese conversion library
 opencc is a library for converting character between traditional Chinese and
 simplified Chinese.
Standards-Version: 4.7.3
Vcs-Browser: https://salsa.debian.org/debian/opencc
Vcs-Git: https://salsa.debian.org/debian/opencc.git
Testsuite: autopkgtest
Testsuite-Triggers: build-essential, cmake, googletest, pkgconf
Build-Depends: chrpath, cmake, darts, debhelper-compat (= 13), dh-sequence-python3, doxygen <!nodoc>, googletest <!nocheck>, libmarisa-dev (>> 0.3), libtclap-dev, opencc <cross>, dh-sequence-pkgkde-symbolshelper, pybind11-dev, python3-all-dev, rapidjson-dev, pybuild-plugin-pyproject, python3-pybind11, python3-pytest <!nocheck>, python3-setuptools, python3-wheel
Package-List:
 libopencc-data deb libs unknown arch=all
 libopencc-dev deb libdevel unknown arch=any
 libopencc-doc deb doc unknown arch=all
 libopencc1.1 deb libs unknown arch=any
 opencc deb utils unknown arch=any
 python3-opencc deb python unknown arch=any
Checksums-Sha1:
 30c1b4fbe53bc89ce0a6519ab6f5735b62013ae6 1027080 opencc_1.1.9+ds1.orig.tar.xz
 a0461126fb0aa359cc87d5f0ff68454992773f98 17232 opencc_1.1.9+ds1-4build1.debian.tar.xz
Checksums-Sha256:
 2870b0af383fb47a899552713d73424ce5d5d9d7cb90e903d817eceac493c6f1 1027080 opencc_1.1.9+ds1.orig.tar.xz
 0e72cd8bfeec72da0505acc91b5966a2aa9c371f6362c0d3ab943b999137ab92 17232 opencc_1.1.9+ds1-4build1.debian.tar.xz
Files:
 720a33458a963b0976f7db60b2292aa7 1027080 opencc_1.1.9+ds1.orig.tar.xz
 a60d1c34abcbf3ed9923ffd83b2c901a 17232 opencc_1.1.9+ds1-4build1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEVovyKmYzfL/Jprm3LIPbyOm9DjcFAmm9LSQACgkQLIPbyOm9
DjdFcg//ZL0orgyghYZRKuCiy8udD7MU02GmUIn409R4Q4i11nCc886+Yk2ySyhL
DQfhz06LWxAR3DDM7NF22Q66DkfMUHe9PLnZOnyYWGV5t7RBalXBMRo3NnEpo9KA
udpyuK7Fu5/5rnMqEK5G5AGRiWw1wo3UuqG5sF/yUk0wTpbwb+zD9Li3OOjq4u8q
qJamlnP3YJvs0zAXq0Ef5zY45+UYbMvMPLHjqfjvhqeIJEjHCdLO7zF/35TDL5qu
UWrNSeWuRwVB0yfJHeSLgefc5n6/e3YNdvNh7EdmpO8vR2xq5ga5ktXP6e8dEnmd
TNhxcz5zXSzhzY1rxtZe0OFUNY+b1aUpqEyokxETkU+oSQ6tAwM2g7LPslnM14S8
40BoxiZ6U8E/wt09iZs7nMQTralKlbGw3Zgpt8AzBM9ZSmYZI22XlRAP5sqUUBb/
zwS83dLCtCMYMVfWw+b8PmaFuBSosFp/Xm0ZtX1w0+UxLBmFulmnjCb6VpRw1VDS
Sja8M2N8BvKYVm++TkBi31xMDkdQWWFcB9N40GUhlMKQwlVEcBYwwBpiihMHzGWY
F0bawyFn38d7mNFbJaZ6ZaKIqCK5F7X8FgFl5susZv9IVEQSBVcgiV6al8LAwznt
vGFanLh5xYbE7EvU5dh1nIKjtTDymjva7eCIw+NWU8cYfAvdgKA=
=5Vpn
-----END PGP SIGNATURE-----
