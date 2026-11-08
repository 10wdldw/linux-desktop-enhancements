-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: leveldb
Binary: libleveldb1d, libleveldb-dev, leveldb-doc
Architecture: any all
Version: 1.23-6
Maintainer: Laszlo Boszormenyi (GCS) <gcs@debian.org>
Homepage: https://github.com/google/leveldb
Standards-Version: 4.7.2
Testsuite: autopkgtest
Testsuite-Triggers: build-essential, libsnappy-dev
Build-Depends: debhelper-compat (= 13), cmake, discount, libsnappy-dev, libgmock-dev, libbenchmark-dev
Package-List:
 leveldb-doc deb doc optional arch=all
 libleveldb-dev deb libdevel optional arch=any
 libleveldb1d deb libs optional arch=any
Checksums-Sha1:
 042e267eae6ab522fe29274f79ad45cde3977655 242925 leveldb_1.23.orig.tar.gz
 a2826a0ee0f60e82bcf18b09c8da037dd9589218 11408 leveldb_1.23-6.debian.tar.xz
Checksums-Sha256:
 9a37f8a6174f09bd622bc723b55881dc541cd50747cbd08831c2a82d620f6d76 242925 leveldb_1.23.orig.tar.gz
 2e1e414671d3db56ccf260c43920476eb071563419abb1b9e82d18121253e187 11408 leveldb_1.23-6.debian.tar.xz
Files:
 afbde776fb8760312009963f09a586c7 242925 leveldb_1.23.orig.tar.gz
 b6c2b0596705fba51d5bd1251eea75b1 11408 leveldb_1.23-6.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEfYh9yLp7u6e4NeO63OMQ54ZMyL8FAmi9Z9cACgkQ3OMQ54ZM
yL9q+xAAiVv9Xye62AkWHHGtsec5Ed6soUQ7eg2mO2ReBiCpQHT2cnJ5KtC3yJnj
xKOp2ABf79ODI8xv7qfRkFAhUuptuIJcIuOJLacdKLJdJDhVIvkQ6zJaXEt/D2EI
Kdnpg2vt+Xw/+EE8yZ5N4PW45yKO/REsGOiWql2uEzPi+0i+RCEx2lKrHvarZ0s2
1M6Fgc6XSvKAlb9TIaO9qovmELbt6YDyixm4TCIQW0JxIUN97ng4VjhnC2MfB87e
u8vKvhrBPML8XabbEcvsIcxCgtfbrJ0FY4gtZ1QPxL6dIhwCPe8q5fhW/oDPfsKq
GnH83MFN3kjhPoHx6bMdgw3Px1mSYCDwcXiW9j4pqhAOW0xJThA7p9W2xGMB3EXw
e5LHXqR8khTvB9rCzXuCTNyMuFvILvbTa+ARqckAuzOBRrKqwcCYVf50sZ0SSiaP
qSrqZY6hlFdtK8Ahq7I9c3X/u5XMBjsGUAFp80QdsuLRr7guE+ph0s5CJ7BhWTSV
fj8w+9mCQPj0OpdAJO+c0sY+cxwv7nZzY5n/cNWI2BL/0Fenw71Tvs1xZ0kWkZAD
mjHfHrG/zayQP7S0LbfXTinzhOBPP2BqR3mPI4U0P8n7idLjGQ31tiUjj1wTAt8+
fUwEgMG+DYKhISdIs8GNVfD3bJx5XXPaart/qbx3EhhUBzlgRWg=
=OxQG
-----END PGP SIGNATURE-----
