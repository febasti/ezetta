<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { LOCALES } from '../../i18n/translate'
  import { setFootnoteMode, setTypewriter, ui } from '../../lib/ui.svelte'
  import type { FootnoteMode } from '../../lib/ui.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import NumberField from '../../ui/kit/NumberField.svelte'
  import Dialog from '../../ui/kit/Dialog.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import RadioList from '../../ui/kit/RadioList.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Segmented from '../../ui/kit/Segmented.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import Tabs from '../../ui/kit/Tabs.svelte'
  import { FONT_KINDS, FONT_SIZE, LINE_SPACING, PARAGRAPH_GAP, TEXT_WIDTH } from '../../ui/fonts'
  import { appearance, OFFERED_THEMES } from '../../ui/theme.svelte'
  import { scrollbar } from '../../ui/scrollbar'
  import { typography } from '../../ui/typography.svelte'
  import AboutPane from './AboutPane.svelte'
  import ProjectPane from './ProjectPane.svelte'
  import ShortcutsPane from './ShortcutsPane.svelte'
  import { SETTINGS_TABS, settings } from './settings.svelte'

  /**
   * The app's own settings, as the system's settings windows have them: tabs at the top,
   * then a form, labels on the left and the controls on the right. Changes apply at once.
   */
  const FOOTNOTE_MODES: readonly FootnoteMode[] = ['margin', 'list', 'cards']
</script>

{#if settings.open}
  <Dialog
    title={i18n.t('settings.title')}
    closeLabel={i18n.t('settings.close')}
    width="medium"
    onclose={() => settings.close()}
  >
    <div class="tabs">
      <Tabs
        label={i18n.t('settings.title')}
        tabs={SETTINGS_TABS.map((tab) => ({ id: tab, label: i18n.t(`settings.tab.${tab}`) }))}
        value={settings.tab}
        onchange={(tab) => (settings.tab = tab)}
        idPrefix="settings-tab"
        panelId="settings-panel"
      />
    </div>
    <div
      id="settings-panel"
      class="panel"
      class:fill={settings.tab === 'shortcuts'}
      role="tabpanel"
      aria-labelledby="settings-tab-{settings.tab}"
      use:scrollbar
    >
      {#if settings.tab === 'general'}
        <Form>
          <FormRow
            label={i18n.t('settings.language')}
            for="settings-language"
            hint={i18n.t('settings.language.hint')}
          >
            <Select
              id="settings-language"
              value={i18n.locale}
              options={LOCALES.map((locale) => ({
                value: locale,
                label: i18n.t(`locale.${locale}`),
              }))}
              onchange={(locale) => (i18n.locale = locale)}
            />
          </FormRow>
          <FormRow label={i18n.t('settings.launch')}>
            <Segmented
              label={i18n.t('settings.launch')}
              value={settings.reopenLast ? 'last' : 'welcome'}
              options={[
                { value: 'welcome', label: i18n.t('settings.launch.welcome') },
                { value: 'last', label: i18n.t('settings.launch.last') },
              ]}
              onchange={(choice) => void settings.setReopenLast(choice === 'last')}
            />
          </FormRow>
        </Form>
      {:else if settings.tab === 'appearance'}
        <Section>
          <Form>
            <FormRow label={i18n.t('settings.theme')}>
              <Segmented
                label={i18n.t('settings.theme')}
                value={appearance.choice}
                options={OFFERED_THEMES.map((theme) => ({
                  value: theme,
                  label: i18n.t(`theme.${theme}`),
                }))}
                onchange={(theme) => (appearance.choice = theme)}
              />
            </FormRow>
          </Form>
        </Section>
        <Section>
          <Form>
            <FormRow label={i18n.t('settings.font')}>
              <Segmented
                label={i18n.t('font.kind')}
                options={FONT_KINDS.map((kind) => ({
                  value: kind,
                  label: i18n.t(`font.kind.${kind}`),
                }))}
                value={typography.kind}
                onchange={(kind) => (typography.kind = kind)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.fontSize')} for="settings-size">
              <NumberField
                id="settings-size"
                unit={i18n.t('unit.px')}
                {...FONT_SIZE}
                value={typography.size}
                onchange={(size) => (typography.size = size)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.lineSpacing')} for="settings-spacing">
              <NumberField
                id="settings-spacing"
                unit={i18n.t('unit.times')}
                {...LINE_SPACING}
                value={typography.lineSpacing}
                onchange={(spacing) => (typography.lineSpacing = spacing)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.paragraphSpacing')} for="settings-paragraph">
              <NumberField
                id="settings-paragraph"
                unit={i18n.t('unit.times')}
                {...PARAGRAPH_GAP}
                value={typography.paragraphGap}
                onchange={(gap) => (typography.paragraphGap = gap)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.textWidth')} for="settings-width">
              <NumberField
                id="settings-width"
                unit={i18n.t('unit.px')}
                {...TEXT_WIDTH}
                value={typography.width}
                onchange={(width) => (typography.width = width)}
              />
            </FormRow>
            <FormRow label="">
              <!-- The writing face as it is set now: two short paragraphs, at the size, line spacing and
                   paragraph spacing of the editor (not its width, which is wider than this dialog). -->
              <div class="sample" aria-label={i18n.t('settings.sample.label')} role="img">
                <p>{i18n.t('settings.sample.first')}</p>
                <p>{i18n.t('settings.sample.second')}</p>
              </div>
            </FormRow>
          </Form>
        </Section>
        <Section>
          <Form>
            <FormRow label={i18n.t('settings.focus')}>
              <Checkbox checked={ui.typewriter} onchange={setTypewriter}>
                {i18n.t('settings.focus.typewriter')}
              </Checkbox>
            </FormRow>
          </Form>
        </Section>
        <Section>
          <Form>
            <FormRow label={i18n.t('settings.footnotesShort')}>
              <RadioList
                label={i18n.t('settings.footnotes')}
                name="footnote-mode"
                value={ui.footnoteMode}
                options={FOOTNOTE_MODES.map((mode) => ({
                  value: mode,
                  label: i18n.t(`footnotes.mode.${mode}`),
                  hint: i18n.t(`footnotes.mode.${mode}.hint`),
                }))}
                onchange={setFootnoteMode}
              />
            </FormRow>
          </Form>
        </Section>
      {:else if settings.tab === 'project'}
        <ProjectPane />
      {:else if settings.tab === 'shortcuts'}
        <ShortcutsPane />
      {:else}
        <AboutPane />
      {/if}
    </div>
  </Dialog>
{/if}

<style>
  /* The tabs reach the dialog's edges, under its header. */
  .tabs {
    margin: calc(-1 * var(--sp-8)) calc(-1 * var(--inset-dialog)) 0;
  }
  .tabs :global(.tabs) {
    padding: 0 var(--inset-dialog);
  }
  /* One height for every tab, so the dialog does not jump when the tab changes; a longer tab
   * scrolls. The shortcuts fill it, their list scrolling under the search. */
  .panel {
    height: min(600px, calc(100vh - 240px));
    overflow-y: auto;
    /* Reaches into the dialog's inset at the right, so the scrollbar keeps clear of the text. */
    margin-inline-end: calc(-1 * var(--sp-16));
    padding: var(--sp-16) var(--sp-16) 0 0;
  }
  .panel.fill {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* The writing face's sample: the editor's own type, on the paper of the editor. */
  .sample {
    width: 100%;
    padding: var(--sp-8) var(--sp-12);
    border: 1px solid var(--color-separator);
    border-radius: var(--r-md);
    background: var(--color-window);
    color: var(--color-label);
    font-family: var(--font-writing);
    font-size: var(--text-writing);
    line-height: var(--line-writing);
  }
  .sample p {
    margin: 0;
  }
  .sample p + p {
    margin-top: var(--paragraph-gap-writing);
  }
</style>
