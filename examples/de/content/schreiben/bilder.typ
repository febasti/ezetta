= Abbildungen, Tabellen und Formeln <sec-bilder>

Bilder, Tabellen und Formeln bekommen eine Nummer, und im Text verweist du mit einem Querverweis auf sie, der sich mitnummeriert, wenn sich etwas verschiebt. Abbildung, Tabelle und Formel stehen im Menü „Einfügen“ und in der Leiste. Wie du ein Bild einfügst, bleibt dir überlassen: durch einen Dialog, mit Einfügen aus der Zwischenablage oder indem du eine Datei in den Text ziehst; Ezetta legt sie im Ordner `assets` ab.

#figure(
  image("assets/stichprobe.svg", width: 60%),
  caption: [Verteilung der Teilnehmenden],
) <fig-stichprobe>

@fig-stichprobe zeigt, wie sich die Teilnehmenden auf vier Gruppen verteilen. Die genauen Zahlen stehen in @tbl-gruppen. Ein Klick auf einen Querverweis öffnet die Liste aller Ziele im Projekt, ein Klick auf „Querverweis“ in der Leiste fügt einen neuen ein.

== Tabellen <sec-tabellen>

Tabellen schreibst du direkt in die Zellen; Zeilen und Spalten fügst du über die Leiste hinzu, und Zellen aus einem Tabellenprogramm lassen sich einfügen.

#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header[Gruppe][n][Anteil],
    [A], [8], [23 %],
    [B], [12], [34 %],
    [C], [10], [29 %],
    [D], [5], [14 %],
  ),
  caption: [Teilnehmende nach Gruppe],
) <tbl-gruppen>

== Formeln <sec-formeln>

Formeln schreibst du in der Schreibweise von Typst. Ein Klick darauf öffnet das Feld mit dem Quelltext und einer Vorschau. Im Text steht etwa $n = 35$, und eine abgesetzte Formel bekommt eine Nummer:

$ overline(x) = 1/n sum_(i=1)^n x_i $ <eq-mittel>

Aus @eq-mittel folgt, wie der Mittelwert aus den Einzelwerten entsteht.
