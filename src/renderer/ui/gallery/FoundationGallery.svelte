<script lang="ts">
  import Button from '../kit/Button.svelte'
  import Callout from '../kit/Callout.svelte'
  import Checkbox from '../kit/Checkbox.svelte'
  import Dialog from '../kit/Dialog.svelte'
  import EmptyState from '../kit/EmptyState.svelte'
  import Form from '../kit/Form.svelte'
  import FormRow from '../kit/FormRow.svelte'
  import IconButton from '../kit/IconButton.svelte'
  import ListRow from '../kit/ListRow.svelte'
  import Popover from '../kit/Popover.svelte'
  import Section from '../kit/Section.svelte'
  import NumberField from '../kit/NumberField.svelte'
  import ChoiceCards from '../kit/ChoiceCards.svelte'
  import Segmented from '../kit/Segmented.svelte'
  import Select from '../kit/Select.svelte'
  import Switch from '../kit/Switch.svelte'
  import Tabs from '../kit/Tabs.svelte'
  import TextField from '../kit/TextField.svelte'

  /**
   * The design foundation (docs/DESIGN.md, "Foundation"): its tokens and building blocks, each in its
   * states, and a few screens composed of nothing else, to judge the direction before the app's own
   * screens are rebuilt on it.
   */
  const noop = (): void => undefined

  const COLORS = [
    ['window', 'Writing area, dialogs'],
    ['sidebar', 'Left sidebar'],
    ['panel', 'Callouts, preview desk'],
    ['label', 'Text, icons'],
    ['label-secondary', 'Secondary text'],
    ['label-tertiary', 'Hints, counts'],
    ['separator', 'Hairlines'],
    ['control', 'Button and track fill'],
    ['field-border', 'Field border'],
    ['accent', 'Accent'],
    ['selection', 'Selection ground'],
    ['danger', 'Danger'],
  ] as const
  const TYPES = [
    ['large-title', 'Large title', '22/28 bold'],
    ['title', 'Title', '15/20 semibold'],
    ['emphasis', 'Emphasis', '13/18 semibold'],
    ['body', 'Body', '13/18 regular'],
    ['caption', 'Caption', '11/14 regular'],
  ] as const
  const SPACES = [4, 8, 12, 16, 24, 32]
  const RADII = [
    ['sm', 'Fields, tags'],
    ['md', 'Buttons, rows'],
    ['lg', 'Popovers, dialogs'],
  ] as const

  let name = $state('Dissertation')
  let empty = $state('')
  let spacing = $state(1.65)
  let look = $state<'light' | 'dark'>('light')
  let language = $state<'de' | 'en'>('de')
  let theme = $state<'light' | 'dark' | 'sepia'>('light')
  let scope = $state<'sheet' | 'group' | 'project'>('sheet')
  let tab = $state<'literature' | 'proof' | 'stats'>('proof')
  let marks = $state(true)
  let autosave = $state(true)
  let strict = $state(false)
  let chosen = $state('methoden')
</script>

<section class="foundation">
  <header class="intro">
    <h1>Foundation</h1>
    <p>
      The tokens and building blocks every screen is made of (docs/DESIGN.md, "Foundation"). Colours
      by role, one spacing scale, three radii, five type roles, macOS sizes.
    </p>
  </header>

  <h2>Colour roles</h2>
  <div class="swatches">
    {#each COLORS as [role, use] (role)}
      <div class="swatch">
        <span class="chip" style:background="var(--color-{role})"></span>
        <span class="name">--color-{role}</span>
        <span class="use">{use}</span>
      </div>
    {/each}
  </div>

  <h2>Type roles</h2>
  <div class="types">
    {#each TYPES as [role, label, spec] (role)}
      <div class="type">
        <span style:font="var(--type-{role})">{label}: Die Stichprobe umfasste 1.204 Personen</span>
        <span class="use">--type-{role} · {spec}</span>
      </div>
    {/each}
  </div>

  <h2>Spacing, radii, sizes</h2>
  <div class="scales">
    <div class="scale">
      {#each SPACES as s (s)}
        <div class="space"><span style:width="{s}px"></span><code>--sp-{s}</code></div>
      {/each}
    </div>
    <div class="scale">
      {#each RADII as [r, use] (r)}
        <div class="radius">
          <span style:border-radius="var(--r-{r})"></span><code>--r-{r}</code>
          {use}
        </div>
      {/each}
    </div>
    <div class="scale">
      <div class="radius">
        <code>--control-sm 22 · --control-md 28 · --control-lg 32</code>
      </div>
      <div class="radius"><code>--row-single 28 · --row-double 44</code></div>
      <div class="radius"><code>--inset-pane 16 · --inset-dialog 20</code></div>
    </div>
  </div>

  <h2>Buttons</h2>
  <div class="line">
    <Button variant="primary">Exportieren …</Button>
    <Button>Abbrechen</Button>
    <Button variant="plain">Weitere Optionen</Button>
    <Button variant="danger">In den Papierkorb</Button>
    <Button icon="plus">Neue Gruppe</Button>
    <Button disabled>Nicht verfügbar</Button>
  </div>
  <div class="line">
    <Button variant="primary" size="sm">Klein</Button>
    <Button size="sm">Klein</Button>
    <Button variant="primary" size="lg">Groß, Hauptaktion</Button>
    <IconButton icon="plus" label="Neu" onclick={noop} />
    <IconButton icon="x" label="Schließen" onclick={noop} />
    <IconButton icon="panel-left" label="Seitenleiste" pressed onclick={noop} />
    <IconButton icon="search" label="Suchen" size="sm" onclick={noop} />
  </div>

  <h2>Fields and choices</h2>
  <div class="grid2">
    <div class="stack">
      <TextField value={name} onvalue={(v) => (name = v)} label="Name" />
      <TextField
        value={empty}
        onvalue={(v) => (empty = v)}
        label="Suche"
        placeholder="Werk suchen …"
        type="search"
      />
      <TextField value="nicht gültig" label="Ungültig" invalid />
      <TextField value="gesperrt" label="Gesperrt" disabled />
      <TextField value="klein" label="Klein" size="sm" />
    </div>
    <div class="stack">
      <Select
        bind:value={language}
        label="Sprache"
        options={[
          { value: 'de', label: 'Deutsch' },
          { value: 'en', label: 'English' },
        ]}
      />
      <Segmented
        label="Bereich"
        value={scope}
        onchange={(v) => (scope = v)}
        options={[
          { value: 'sheet', label: 'Abschnitt' },
          { value: 'group', label: 'Gruppe' },
          { value: 'project', label: 'Projekt' },
        ]}
      />
      <ChoiceCards
        label="Darstellung"
        value={look}
        onchange={(v) => (look = v)}
        options={[
          { value: 'light', label: 'Hell', icon: 'sun' },
          { value: 'dark', label: 'Dunkel', icon: 'moon' },
        ]}
      />
      <NumberField
        label="Zeilenabstand"
        min={1}
        max={3}
        step={0.05}
        value={spacing}
        onchange={(v) => (spacing = v)}
      />
      <Checkbox bind:checked={marks}>Markierungen im Export zeigen</Checkbox>
      <Checkbox checked={false} disabled>Nicht verfügbar</Checkbox>
      <Switch bind:checked={autosave}>Automatisch Versionen speichern</Switch>
      <Switch checked={false} disabled>Gesperrt</Switch>
    </div>
  </div>

  <h2>Callouts and empty states</h2>
  <div class="grid2">
    <div class="stack">
      <Callout>Die Sprache des Textes gehört zum Projekt, nicht zur Oberfläche.</Callout>
      <Callout tone="warning">3 Belege sind nicht in der Bibliographie.</Callout>
      <Callout tone="danger">Die Vorschau konnte nicht erstellt werden.</Callout>
    </div>
    <div class="pane">
      <EmptyState
        icon="circle-check"
        title="Keine Hinweise"
        text="Rechtschreibung und Grammatik sind in diesem Abschnitt in Ordnung."
      />
    </div>
  </div>

  <h2>Composed of nothing else</h2>
  <div class="screens">
    <!-- A sidebar: rows of one anatomy, a section heading, counts as accessories. -->
    <aside class="sidebar">
      <div class="bar">
        <span class="project">Dissertation</span>
        <IconButton icon="plus" label="Neue Gruppe" size="sm" onclick={noop} />
      </div>
      <div class="list" role="listbox" aria-label="Gruppen">
        <ListRow
          title="Alle Abschnitte"
          icon="file"
          selected={chosen === ''}
          onclick={() => (chosen = '')}
        >
          {#snippet accessory()}6{/snippet}
        </ListRow>
        {#each [['einleitung', 1, 0], ['methoden', 4, 0], ['daten', 2, 1], ['notizen', 1, 0]] as [path, count, depth] (path)}
          <ListRow
            title={String(path)}
            icon="folder"
            depth={Number(depth)}
            muted={path === 'notizen'}
            selected={chosen === path}
            onclick={() => (chosen = String(path))}
          >
            {#snippet accessory()}{count}{/snippet}
          </ListRow>
        {/each}
      </div>
      <div class="list" role="listbox" aria-label="Abschnitte">
        <ListRow title="Methoden" subtitle="Das Design ist qualitativ und explorativ." selected>
          {#snippet accessory()}31{/snippet}
        </ListRow>
        <ListRow title="Zwölf Interviews wurden geführt." subtitle="Entwurf">
          {#snippet accessory()}4{/snippet}
        </ListRow>
        <ListRow title="Dokumente wurden gesammelt." subtitle="Entwurf">
          {#snippet accessory()}3{/snippet}
        </ListRow>
      </div>
    </aside>

    <!-- A side panel: tabs, a segmented scope, sections with headings, an empty state. -->
    <div class="side">
      <Tabs
        label="Seitenleiste"
        idPrefix="f-tab"
        panelId="f-panel"
        value={tab}
        onchange={(t) => (tab = t)}
        tabs={[
          { id: 'literature', label: 'Literatur' },
          { id: 'proof', label: 'Prüfung', count: 2 },
          { id: 'stats', label: 'Statistik' },
        ]}
      />
      <div id="f-panel" class="side-body" role="tabpanel">
        <Section title="Sprache">
          <Select
            bind:value={language}
            label="Sprache der Prüfung"
            options={[
              { value: 'de', label: 'Deutsch (Deutschland)' },
              { value: 'en', label: 'English (US)' },
            ]}
          />
        </Section>
        <Section title="Hinweise">
          {#snippet action()}2{/snippet}
          <ListRow title="Rechtschreibfehler" subtitle="Das ist ein Tesst mit einem Fehler." />
          <ListRow title="Grammatik" subtitle="Er gehen nach Hause." />
        </Section>
        <Section title="Werke">
          <Segmented
            label="Bereich"
            size="sm"
            value={scope}
            onchange={(v) => (scope = v)}
            options={[
              { value: 'sheet', label: 'Abschnitt' },
              { value: 'group', label: 'Gruppe' },
              { value: 'project', label: 'Projekt' },
            ]}
          />
          <EmptyState
            icon="book"
            title="Keine Belege"
            text="Dieser Abschnitt zitiert noch nichts."
          />
        </Section>
      </div>
    </div>
  </div>

  <div class="screens dialogs">
    <!-- The settings, as a dialog of the foundation. -->
    <Dialog title="Einstellungen" closeLabel="Schließen" onclose={noop} inline>
      <Section title="Allgemein">
        <Form>
          <FormRow
            label="Sprache"
            for="f-language"
            hint="Die Sprache der Oberfläche. Die Sprache des Textes gehört zum Projekt."
          >
            <Select
              id="f-language"
              bind:value={language}
              options={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' },
              ]}
            />
          </FormRow>
          <FormRow label="Design" for="f-theme">
            <Segmented
              label="Design"
              value={theme}
              onchange={(v) => (theme = v)}
              options={[
                { value: 'light', label: 'Hell' },
                { value: 'dark', label: 'Dunkel' },
                { value: 'sepia', label: 'Sepia' },
              ]}
            />
          </FormRow>
        </Form>
      </Section>
      <Section title="Prüfung">
        <Switch bind:checked={strict}>Strenge Prüfung (mehr Stilhinweise)</Switch>
        <Switch bind:checked={autosave}>Automatisch Versionen speichern</Switch>
      </Section>
    </Dialog>

    <div class="stack">
      <!-- A small question, and a popover. -->
      <Dialog title="Hyperlink" closeLabel="Schließen" onclose={noop} width="narrow" inline>
        <Form stacked>
          <FormRow label="Adresse" for="f-url">
            <TextField id="f-url" value="https://example.org" type="url" />
          </FormRow>
        </Form>
        {#snippet footer()}
          <Button variant="plain">Link entfernen</Button>
          <span class="grow"></span>
          <Button>Abbrechen</Button>
          <Button variant="primary">OK</Button>
        {/snippet}
      </Dialog>
      <Popover title="Rechtschreibfehler" width="narrow">
        <span class="muted">Möglicher Tippfehler gefunden.</span>
        <div class="line">
          <Button size="sm">Test</Button>
          <Button size="sm">Tests</Button>
          <Button size="sm">Tesla</Button>
        </div>
        <div class="line">
          <Button size="sm" variant="plain">Ignorieren</Button>
          <Button size="sm" variant="plain">Zum Wörterbuch</Button>
        </div>
      </Popover>
    </div>
  </div>
</section>

<style>
  /* The gallery page itself, drawn with the foundation too. */
  .foundation {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
    padding: var(--sp-24) 0 var(--sp-32);
    color: var(--color-label);
    font: var(--type-body);
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
    padding-bottom: var(--sp-8);
    border-bottom: 1px solid var(--color-separator);
    font: var(--type-title);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--sp-12);
  }
  .swatch {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 0 var(--sp-8);
    align-items: center;
  }
  .swatch .chip {
    grid-row: span 2;
    width: 32px;
    height: 32px;
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1px var(--color-separator);
  }
  .name {
    font: var(--type-caption);
    font-family: var(--font-mono);
  }
  .use {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .types {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
  }
  .type {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .scales {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-24);
  }
  .scale {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .space,
  .radius {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    font: var(--type-caption);
  }
  .space span {
    height: var(--sp-12);
    background: var(--color-accent);
  }
  .radius span {
    width: 32px;
    height: 24px;
    background: var(--color-control);
    box-shadow: inset 0 0 0 1px var(--color-field-border);
  }
  code {
    font-family: var(--font-mono);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-24);
    align-items: start;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    min-width: 0;
  }
  .pane {
    border: 1px solid var(--color-separator);
    border-radius: var(--r-lg);
  }
  .screens {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-24);
    align-items: start;
  }
  .dialogs {
    display: flex;
    flex-wrap: wrap;
  }
  .dialogs > .stack {
    width: 380px;
  }
  .sidebar {
    width: 260px;
    padding: var(--sp-8);
    border: 1px solid var(--color-separator);
    border-radius: var(--r-lg);
    background: var(--color-sidebar);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--control-lg);
    padding: 0 var(--sp-4) 0 var(--sp-8);
  }
  .project {
    font: var(--type-emphasis);
  }
  .list {
    display: flex;
    flex-direction: column;
    padding: var(--sp-4) 0;
  }
  .list + .list {
    margin-top: var(--sp-8);
    padding-top: var(--sp-8);
    border-top: 1px solid var(--color-separator);
  }
  .side {
    max-width: 340px;
    border: 1px solid var(--color-separator);
    border-radius: var(--r-lg);
    background: var(--color-window);
  }
  .side-body {
    padding: var(--sp-16) var(--inset-pane);
  }
  .grow {
    flex: 1;
  }
  .muted {
    color: var(--color-label-secondary);
  }
</style>
