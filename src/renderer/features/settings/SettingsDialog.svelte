<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { LOCALES } from '../../i18n/translate'
  import { setFootnoteMode, setTypewriter, ui } from '../../lib/ui.svelte'
  import type { FootnoteMode } from '../../lib/ui.svelte'
  import ChoiceCards from '../../ui/kit/ChoiceCards.svelte'
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
  import { QUOTE_STYLES } from '@core/typst/quoteStyle'
  import { FONT_KINDS, FONT_SIZE, LINE_SPACING, PARAGRAPH_GAP, TEXT_WIDTH } from '../../ui/fonts'
  import { appearance, OFFERED_THEMES } from '../../ui/theme.svelte'
  import { typography } from '../../ui/typography.svelte'
  import { project } from '../sidebar/project.svelte'
  import AboutPane from './AboutPane.svelte'
  import ShortcutsPane from './ShortcutsPane.svelte'
  import { SETTINGS_TABS, settings } from './settings.svelte'

  /**
   * The app's own settings, as the system's settings windows have them: tabs at the top,
   * then a form, labels on the left and the controls on the right. Changes apply at once.
   */
  const FOOTNOTE_MODES: readonly FootnoteMode[] = ['margin', 'list', 'cards']
  const THEME_ICONS = { light: 'sun', dark: 'moon' } as const
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
      role="tabpanel"
      aria-labelledby="settings-tab-{settings.tab}"
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
          <FormRow label={i18n.t('settings.theme')}>
            <ChoiceCards
              label={i18n.t('settings.theme')}
              value={appearance.theme}
              options={OFFERED_THEMES.map((theme) => ({
                value: theme,
                label: i18n.t(`theme.${theme}`),
                icon: THEME_ICONS[theme as keyof typeof THEME_ICONS],
              }))}
              onchange={(theme) => (appearance.theme = theme)}
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
                {...FONT_SIZE}
                value={typography.size}
                onchange={(size) => (typography.size = size)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.lineSpacing')} for="settings-spacing">
              <NumberField
                id="settings-spacing"
                {...LINE_SPACING}
                value={typography.lineSpacing}
                onchange={(spacing) => (typography.lineSpacing = spacing)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.paragraphSpacing')} for="settings-paragraph">
              <NumberField
                id="settings-paragraph"
                {...PARAGRAPH_GAP}
                value={typography.paragraphGap}
                onchange={(gap) => (typography.paragraphGap = gap)}
              />
            </FormRow>
            <FormRow label={i18n.t('settings.textWidth')} for="settings-width">
              <NumberField
                id="settings-width"
                {...TEXT_WIDTH}
                value={typography.width}
                onchange={(width) => (typography.width = width)}
              />
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
        <Section>
          <Form>
            <FormRow label={i18n.t('settings.quoteStyle')} for="settings-quote-style">
              <Select
                id="settings-quote-style"
                value={project.snapshot?.quoteStyle ?? 'auto'}
                disabled={!project.snapshot}
                options={QUOTE_STYLES.map((style) => ({
                  value: style,
                  label: i18n.t(`quoteStyle.${style}`),
                }))}
                onchange={(style) => void project.setQuoteStyle(style)}
              />
            </FormRow>
            <FormRow
              label=""
              hint={project.snapshot
                ? i18n.t('settings.project.hint')
                : i18n.t('settings.noProject')}
            >
              <Checkbox
                checked={project.snapshot?.quoteBlockMarks === true}
                disabled={!project.snapshot}
                onchange={(checked) => void project.setQuoteBlockMarks(checked)}
              >
                {i18n.t('project.quoteBlockMarks')}
              </Checkbox>
            </FormRow>
          </Form>
        </Section>
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
  .panel {
    min-height: 240px;
    padding-top: var(--sp-16);
  }
</style>
