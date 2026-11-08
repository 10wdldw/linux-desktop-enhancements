-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: marisa
Binary: libmarisa-dev, libmarisa-perl, libmarisa1, marisa, python3-marisa, ruby-marisa
Architecture: any
Version: 0.3.1+git20250817-1build1
Maintainer: Debian Input Method Team <debian-input-method@lists.debian.org>
Uploaders:  Boyuan Yang <byang@debian.org>, Mitsuya Shibata <mty.shibata@gmail.com>,
Homepage: https://github.com/s-yata/marisa-trie
Description: MARISA algorithm implementation library
 Matching Algorithm with Recursively Implemented StorAge (MARISA) is a static
 and space-efficient trie data structure.
Standards-Version: 4.7.2
Vcs-Browser: https://salsa.debian.org/input-method-team/marisa
Vcs-Git: https://salsa.debian.org/input-method-team/marisa.git
Testsuite: autopkgtest
Testsuite-Triggers: build-essential, pkg-config
Build-Depends: chrpath, cmake (>= 3.22), debhelper-compat (= 13), dh-sequence-pkgkde-symbolshelper, dh-sequence-python3, perl, perl-xs-dev, python3-all-dev, python3-setuptools, ruby, ruby-dev, swig
Package-List:
 libmarisa-dev deb libdevel optional arch=any
 libmarisa-perl deb perl optional arch=any
 libmarisa1 deb libs optional arch=any
 marisa deb utils optional arch=any
 python3-marisa deb python optional arch=any
 ruby-marisa deb ruby optional arch=any
Checksums-Sha1:
 4018b9ac39be874a41ff07038d3752396007d61a 212811 marisa_0.3.1+git20250817.orig.tar.gz
 fe0dd5354a9f817c6103e87c33cd1bf803ff0672 13796 marisa_0.3.1+git20250817-1build1.debian.tar.xz
Checksums-Sha256:
 e9225e51992d2836372311ded03d58084d9192ba8699ae10838eab8b7b8e622f 212811 marisa_0.3.1+git20250817.orig.tar.gz
 4b074ba4cf17115dc807bf9f53ebcd68d5ed01603a89553a36e604d8464a3d43 13796 marisa_0.3.1+git20250817-1build1.debian.tar.xz
Files:
 f38f9f99e9afd029be3148ec32ad33dd 212811 marisa_0.3.1+git20250817.orig.tar.gz
 d68b211e6a59378ee146c7e992b8a060 13796 marisa_0.3.1+git20250817-1build1.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEVovyKmYzfL/Jprm3LIPbyOm9DjcFAmm9KYUACgkQLIPbyOm9
Djehdw//Z2Svuvg4pInpzRNL9yG/Nt4JV51+Bu0UYXDBKuI1+vV2vrF1XNHDGbSA
zZVEYoGg1OvPfV3jPt45mNJReuDWlvDYdZ2kNTzoBgNWTKE0ydx+M4PLQeV14M3g
NRm3J23jXfbQ9B6myxyg3iFEXoNoorerXUXlbQJv8Pfmz5rLakP4ND7KfLSSwmDH
a7h1ah+RDqGHGqXiMOSmrJskrs+2ROcXe8SIKq2bb4lgo1uzg152Vk0/mQtwZs0f
mDVncTKX7PSwMqFe9vCO0sRX99gD5B4e8NFCLJ3G0KaNLJSe66qMw6fwTjadROga
URT1tKSvAg3c6nK0XknHz4I8FzDt+sf8Iz3Ex5tg3813bKdxxtW1RFDW7WAOqOts
xX/LkqRN3xjekoHXFhiwee8SUD2jPJrH5WxY4BBGPrtXCjZzfHBaPAkmzqDkrngB
1jYJO5cKpz3/UYb1UHaO9P7VnpXXHOfwmck3RSxi1xcU8CbPsgid3wlqAcxtBgom
Tvn6bihQXs0Y+amcjEYW6HL15gZIuBO2t/p7tVGkKVS3mpLSudwzYk6WY6xSTkC9
pMiyIOY36xjVtlH9usgEXj1tkBqUTSF19p8Uo2gcwkhs/VRH/OaRI3xYl2eNqeC1
JaNSLGWMRV0K7ndN3ENJvgjjhucoyEnEcymDTzjNefBDhhrTIiI=
=B0EB
-----END PGP SIGNATURE-----
