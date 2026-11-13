= Citations and literature <sec-citations>

Citations refer to works from your bibliography file, here `library.bib` in the project. You maintain the file outside Ezetta, with a reference manager for example; Ezetta reads it and notices when it changes. In the project menu you choose which file applies.

You place a citation with the button "Citation" in the bar or by typing \@ and searching for the work. In the text it appears as a small mark that shows how it will print: Kant describes the Enlightenment as the exit from "self-incurred immaturity" @kant1784[p. 481]. The page number belongs to the citation and is a field in the editor, not text.

== Forms of a citation <sec-forms>

A citation has five forms. It stands in parentheses, as with Kuhn and Eco @kuhn1962 @eco1977, or as part of the sentence: #cite(<kuhn1962>, form: "prose") describes revolutions in science. You can print only the year (#cite(<eco1977>, form: "year")) or only the author (#cite(<eco1977>, form: "author")) just the same. The fifth form prints nothing but lists the work in the bibliography. Several citations in a row become a group, which one window edits.

== Open citations and citations to check <sec-open>

Two marks help when a citation is still missing or still has to be checked. Here one is missing: the number of theses per year is rising/*#cite-needed*/. And here a page number is not yet secured: @knuth1984[p. 97]/*#check: check page number*/. Both are intentional; the export counts them before saving and tells you what is still open.

The literature tab in the right sidebar lists the works that occur in the sheet, the group or the project as full references with the number of citations, and the open marks with their places.
