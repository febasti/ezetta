= Figures, tables and formulas <sec-figures>

Pictures, tables and formulas get a number, and in the text you point to them with a cross-reference that is renumbered when something moves. Figure, table and formula are in the menu "Insert" and in the bar. How you put in a picture is up to you: through a dialog, by pasting from the clipboard or by dragging a file into the text; Ezetta stores it in the folder `assets`.

#figure(
  image("assets/sample.svg", width: 60%),
  caption: [Distribution of the participants],
) <fig-sample>

@fig-sample shows how the participants are spread over four groups. The exact numbers are in @tbl-groups. A click on a cross-reference opens the list of all targets in the project, and a click on "Cross-reference" in the bar inserts a new one.

== Tables <sec-tables>

You write tables straight into the cells; you add rows and columns with the bar, and cells from a spreadsheet can be pasted.

#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header[Group][n][Share],
    [A], [8], [23 %],
    [B], [12], [34 %],
    [C], [10], [29 %],
    [D], [5], [14 %],
  ),
  caption: [Participants by group],
) <tbl-groups>

== Formulas <sec-formulas>

You write formulas in Typst notation. A click opens the field with the source and a preview. In the text there is, say, $n = 35$, and a display formula gets a number:

$ overline(x) = 1/n sum_(i=1)^n x_i $ <eq-mean>

@eq-mean shows how the mean comes from the single values.
