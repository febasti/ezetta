<script lang="ts">
  import Icon from '../Icon.svelte'

  /**
   * What the editor draws inside CodeMirror, as plain DOM with the same classes (cite.css, refs.css,
   * notes.css, figures.css, tables.css, quotes.css and the DOM kit, kit/dom.css), in its states. A
   * change to those files shows here; the screenshot tests catch it.
   */
</script>

<section class="editor-gallery">
  <header class="intro">
    <h1>Editor</h1>
    <p>
      The widgets over the text: chips, notes, quotes, and the popovers and bars of the DOM kit. The
      text is in the writing face, the controls in the interface's.
    </p>
  </header>

  <h2>In the text</h2>
  <div class="writing">
    <p>
      Wie <span class="cm-cite prose">Smith (2020)</span> zeigt
      <span class="cm-cite">(Smith 2020, S. 14)</span>, ein geöffneter Beleg
      <span class="cm-cite active">(Jones und Müller 2019)</span>, einer zu prüfen
      <span class="cm-cite check">(Smith 2020)<Icon name="flag" size={11} /></span>, einer nicht in
      der Bibliographie <span class="cm-cite missing">(unbekannt)</span>, einer nicht gedruckt
      <span class="cm-cite unprinted">Smith 2020</span> und eine Stelle ohne Beleg<span
        class="cm-cite-needed">Beleg fehlt</span
      >.
    </p>
    <p>
      Siehe <span class="cm-xref">Abschnitt 2.1</span> und
      <span class="cm-xref selected">Abbildung 3</span>, ein Verweis ins Leere
      <span class="cm-xref missing">Tabelle ?</span>. Eine Fußnote<sup class="cm-footnote-marker"
        >3</sup
      >
      und eine gewählte<sup class="cm-footnote-marker selected">4</sup>.
    </p>
    <p>
      Er schrieb <span class="cm-quote-mark ground open">„</span><span class="cm-quote-inline"
        >ein Zitat im Text, darin <span class="cm-quote-mark ground inner open">‚</span><span
          class="cm-quote-inline inner">ein inneres</span
        ><span class="cm-quote-mark ground inner close">‘</span></span
      ><span class="cm-quote-mark ground close">“</span>
      <button type="button" class="cm-quote-hint">45 Wörter – als Blockzitat setzen</button>
      <button type="button" class="cm-quote-source-add">+ Quelle hinzufügen</button>
    </p>
  </div>

  <h2>Notes in the margin</h2>
  <div class="notes">
    <div class="cm-note-card">
      <span class="cm-note-number">3</span>
      <span class="cm-note-text">Auswahlkriterien: Erfahrung, Alter, Region.</span>
    </div>
    <div class="cm-note-card active">
      <span class="cm-note-number">4</span>
      <span class="cm-note-text">Die Notiz, die gerade geöffnet ist.</span>
    </div>
    <div class="cm-note-card">
      <span class="cm-note-number">5</span>
      <span class="cm-note-text empty">(leer)</span>
    </div>
  </div>

  <h2>Popovers and bars (DOM kit)</h2>
  <div class="row">
    <div class="k-popover picker">
      <div class="cm-ref-top">
        <span class="cm-ref-kindbox">
          <select class="cm-ref-kind" aria-label="Art des Ziels"><option>Alle</option></select>
          <span class="cm-ref-kind-chevron"><Icon name="chevron-down" size={14} /></span>
        </span>
        <input class="cm-ref-search" type="text" placeholder="Ziel suchen …" aria-label="Suche" />
      </div>
      <ul class="cm-ref-results" role="listbox" aria-label="Ziele">
        <li class="k-row" role="option" aria-selected="false">
          <span class="kind-icon"><Icon name="heading" size={16} /></span>
          <span class="label">Abschnitt 1</span><span class="detail">Einleitung</span>
        </li>
        <li class="k-row active current" role="option" aria-selected="true">
          <span class="kind-icon"><Icon name="heading" size={16} /></span>
          <span class="label">Abschnitt 2.1</span><span class="detail">Stichprobe</span>
        </li>
        <li class="k-row" role="option" aria-selected="false">
          <span class="kind-icon"><Icon name="table" size={16} /></span>
          <span class="label">Tabelle 1</span><span class="detail">Werte</span>
        </li>
      </ul>
      <div class="cm-ref-footer">
        <button type="button" class="k-button">Zum Ziel</button>
        <button type="button" class="k-button k-button-danger cm-ref-remove"
          >Verweis entfernen</button
        >
      </div>
    </div>

    <div class="column">
      <div class="k-popover small">
        <input class="k-field" type="text" value="S. 14" aria-label="Seite" />
        <input class="k-field" type="text" placeholder="Leer" aria-label="Leer" />
        <input
          class="k-field"
          type="text"
          value="ungültig"
          aria-invalid="true"
          aria-label="Ungültig"
        />
        <div class="buttons">
          <button type="button" class="k-button k-button-plain">Abbrechen</button>
          <button type="button" class="k-button">Weiter</button>
          <button type="button" class="k-button k-button-primary">Einfügen</button>
        </div>
      </div>

      <div class="k-popover k-bar">
        <div class="k-segmented k-segmented-sm" role="radiogroup" aria-label="Breite">
          <button type="button" role="radio" aria-checked="false">25</button>
          <button type="button" role="radio" aria-checked="true">50</button>
          <button type="button" role="radio" aria-checked="false">75</button>
          <button type="button" role="radio" aria-checked="false">100</button>
        </div>
        <button type="button" class="k-icon-button k-icon-button-sm" aria-label="Ersetzen"
          ><Icon name="image" size={14} /></button
        >
      </div>

      <div class="k-popover k-bar" role="toolbar" aria-label="Tabelle">
        <div class="k-bar-group">
          <button type="button" class="k-icon-button" aria-label="Zeile"
            ><Icon name="plus" size={16} /></button
          >
          <button type="button" class="k-icon-button" aria-label="Löschen"
            ><Icon name="trash" size={16} /></button
          >
        </div>
        <div class="k-bar-group" role="radiogroup" aria-label="Ausrichtung">
          <button
            type="button"
            class="k-icon-button"
            role="radio"
            aria-checked="true"
            aria-label="Links"><Icon name="align-left" size={16} /></button
          >
          <button
            type="button"
            class="k-icon-button"
            role="radio"
            aria-checked="false"
            aria-label="Mitte"><Icon name="align-center" size={16} /></button
          >
          <button
            type="button"
            class="k-icon-button"
            role="radio"
            aria-checked="false"
            aria-label="Rechts"><Icon name="align-right" size={16} /></button
          >
        </div>
      </div>
    </div>
  </div>

  <h2>An image that is not there</h2>
  <div class="cm-figure-missing">Bild nicht gefunden: assets/fehlt.png</div>
</section>

<style>
  .editor-gallery {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
    padding: var(--sp-24) 0 var(--sp-32);
    border-top: 1px solid var(--color-separator);
  }
  .intro p {
    max-width: 640px;
    margin: var(--sp-8) 0 0;
    color: var(--color-label-secondary);
  }
  h1 {
    margin: 0;
    font: var(--type-large-title);
  }
  h2 {
    margin: var(--sp-16) 0 0;
    font: var(--type-title);
  }
  .writing {
    max-width: 680px;
    color: var(--color-label);
    font-family: var(--font-writing);
    font-size: var(--text-writing);
    line-height: var(--line-writing);
  }
  .writing p {
    margin: 0 0 var(--sp-12);
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    width: 260px;
    font-family: var(--font-writing);
    font-size: var(--text-writing);
  }
  .notes .cm-note-card {
    position: static;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--sp-24);
  }
  .column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-16);
  }
  .picker {
    width: 460px;
  }
  .small {
    width: 300px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-8);
  }
  .cm-figure-missing {
    max-width: 520px;
  }
</style>
