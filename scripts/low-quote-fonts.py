"""Makes src/renderer/ui/fonts/libertinus-*-low-quote.woff2: the German opening quote „ (U+201E)
of each bundled Libertinus face, alone in a small font.

The Latin files of @fontsource/libertinus-serif and -sans contain „ with its outline, but Chromium
draws the glyph as it is encoded there empty, so a „ in the text showed as a gap. Encoding the same
outline again (from its points, without instructions) makes it drawn. `ui/lowQuote.css` takes this
one character from these files; the rest of the text keeps the original files.

Run once when @fontsource/libertinus-* changes (needs Python 3 and fontTools, `pip install
fonttools brotli`), from the repository root:

    python3 scripts/low-quote-fonts.py

The fonts are under the SIL Open Font License 1.1, like the faces they are taken from (no reserved
font name).
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/renderer/ui/fonts"
FACES = {
    "serif": ["400-normal", "400-italic", "600-normal", "600-italic", "700-normal", "700-italic"],
    "sans": ["400-normal", "400-italic", "700-normal"],
}
LOW_QUOTE = 0x201E


def make(family: str, face: str) -> Path:
    source = ROOT / f"node_modules/@fontsource/libertinus-{family}/files/libertinus-{family}-latin-{face}.woff2"
    font = TTFont(source)
    name = font.getBestCmap()[LOW_QUOTE]
    glyph = font["glyf"][name]
    glyph.expand(font["glyf"])
    # Setting the instructions makes fontTools encode the glyph again from its points.
    glyph.program = ttProgram.Program()
    glyph.program.fromBytecode(b"")
    options = subset.Options()
    options.flavor = "woff2"
    options.hinting = False
    options.layout_features = []
    options.name_IDs = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[LOW_QUOTE])
    subsetter.subset(font)
    target = OUT / f"libertinus-{family}-{face}-low-quote.woff2"
    subset.save_font(font, str(target), options)
    return target


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for family, faces in FACES.items():
        for face in faces:
            print(make(family, face).relative_to(ROOT))
