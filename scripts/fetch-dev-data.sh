#!/bin/sh
# Downloads what development needs but git does not hold, into `.dev/` (ignored by git):
#   - LanguageTool (the standalone package) for spelling and grammar and for the morphology,
#   - the thesaurus files of LibreOffice (OpenThesaurus for German, WordNet for English).
# Java 17 or newer is needed to run LanguageTool, and a JDK (javac) to compile tools/morph.
# Packaging ships these as resources instead.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .dev/languagetool .dev/thesaurus

if ls .dev/languagetool/LanguageTool-*/languagetool-server.jar >/dev/null 2>&1; then
  echo "LanguageTool is there."
else
  echo "Downloading LanguageTool (about 250 MB) ..."
  curl -fsSL -o .dev/languagetool.zip https://languagetool.org/download/LanguageTool-stable.zip
  unzip -q .dev/languagetool.zip -d .dev/languagetool
  rm .dev/languagetool.zip
fi

base=https://raw.githubusercontent.com/LibreOffice/dictionaries/master
fetch() {
  if [ -s ".dev/thesaurus/$2" ]; then echo "$2 is there."; else
    echo "Downloading $2 ..."
    curl -fsSL -o ".dev/thesaurus/$2" "$base/$1"
  fi
}
fetch de/th_de_DE_v2.dat th_de_DE_v2.dat
fetch en/th_en_US_v2.dat th_en_US_v2.dat
fetch de/README_thesaurus.txt README_thesaurus_de.txt
fetch en/WordNet_license.txt WordNet_license.txt
echo "Done. Licences: README_thesaurus_de.txt (LGPL 2.1) and WordNet_license.txt are in .dev/thesaurus."
