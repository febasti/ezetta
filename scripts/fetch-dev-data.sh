#!/bin/sh
# Downloads what development needs but git does not hold, into `.dev/` (ignored by git):
#   - LanguageTool (the standalone package) for spelling and grammar and for the morphology,
#   - the thesaurus files of LibreOffice (OpenThesaurus for German, WordNet for English).
# Java 17 or newer is needed to run LanguageTool, and a JDK (javac) to compile tools/morph.
# Packaging ships these as resources instead.
#
# Both are pinned to a version and checked against a SHA-256 sum, so that a package made on any
# day contains the same data. To move to a newer version, change the pins below, the version in
# THIRD-PARTY-NOTICES.txt (`npm run notices`), and run the spelling and synonym tests.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .dev/languagetool .dev/thesaurus

LANGUAGETOOL_VERSION=6.6
LANGUAGETOOL_SHA256=53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631
# A commit of https://github.com/LibreOffice/dictionaries (not its moving master branch).
THESAURUS_COMMIT=67032ee957631908098a72edf48dc81cac27e369

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

if ls ".dev/languagetool/LanguageTool-$LANGUAGETOOL_VERSION/languagetool-server.jar" >/dev/null 2>&1; then
  echo "LanguageTool $LANGUAGETOOL_VERSION is there."
else
  echo "Downloading LanguageTool $LANGUAGETOOL_VERSION (about 250 MB) ..."
  rm -rf .dev/languagetool
  mkdir -p .dev/languagetool
  curl -fsSL -o .dev/languagetool.zip "https://languagetool.org/download/LanguageTool-$LANGUAGETOOL_VERSION.zip"
  if [ "$(sha256 .dev/languagetool.zip)" != "$LANGUAGETOOL_SHA256" ]; then
    rm .dev/languagetool.zip
    echo "LanguageTool $LANGUAGETOOL_VERSION does not match its checksum." >&2
    exit 1
  fi
  unzip -q .dev/languagetool.zip -d .dev/languagetool
  rm .dev/languagetool.zip
fi

base=https://raw.githubusercontent.com/LibreOffice/dictionaries/$THESAURUS_COMMIT
fetch() {
  # $1 the path in the repository, $2 the file here, $3 its SHA-256
  if [ -s ".dev/thesaurus/$2" ] && [ "$(sha256 ".dev/thesaurus/$2")" = "$3" ]; then
    echo "$2 is there."
  else
    echo "Downloading $2 ..."
    curl -fsSL -o ".dev/thesaurus/$2" "$base/$1"
    if [ "$(sha256 ".dev/thesaurus/$2")" != "$3" ]; then
      rm ".dev/thesaurus/$2"
      echo "$2 does not match its checksum." >&2
      exit 1
    fi
  fi
}
fetch de/th_de_DE_v2.dat th_de_DE_v2.dat cae18340c59738350b8abe7d7822edb76a8f26d177c3f7cdc68fb0187ca25693
fetch en/th_en_US_v2.dat th_en_US_v2.dat 8a3e4637450b7277428da248f0a604b5c92942bc30507220c051181462340f39
fetch de/README_thesaurus.txt README_thesaurus_de.txt 405accab10106f6d09152f2f5865ec3545fbcf40817b5416b4b99a077f303a87
fetch en/WordNet_license.txt WordNet_license.txt 23dbc4f3ea771304e5ab3e5709843813d2619f3c0cfc81229b53fcdb9985f29a
echo "Done. Licences: README_thesaurus_de.txt (LGPL 2.1) and WordNet_license.txt are in .dev/thesaurus."
