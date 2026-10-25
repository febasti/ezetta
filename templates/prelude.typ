// The prelude: what the app defines for every export, whatever the template. Sheets only
// use Typst's own elements (`#highlight`, `#footnote`, `#link`), which the template styles, so there
// is little here: the words the app needs in the language of the text.
#let app-bibliography-title(lang) = if lang == "de" { "Literaturverzeichnis" } else { "Bibliography" }
