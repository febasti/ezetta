import type { ProofCategory, ProofIssue } from '@core/proof/issues'
import { el } from '../../editor/dom'

/** The words of the card, in the app's language. */
export interface ProofLabels {
  /** The kind of an issue, when the checker gives it no name. */
  category: Record<ProofCategory, string>
  ignore: string
  disableRule: string
  addToProject: string
  addToPersonal: string
  suggestions: string
  noSuggestion: string
  moreActions: string
}

export interface ProofTipActions {
  apply: (value: string) => void
  addWord: (scope: 'personal' | 'project') => void
  ignore: () => void
  disableRule: () => void
}

/** Suggestions shown at most, so the card stays small; the Prüfung tab lists them all. */
const MAX_SUGGESTIONS = 8

/** A button that acts without taking the focus from the text. */
function button(className: string, text: string, onclick: () => void): HTMLButtonElement {
  const node = el('button', className, text)
  node.type = 'button'
  node.addEventListener('mousedown', (event) => event.preventDefault())
  node.addEventListener('click', onclick)
  return node
}

/**
 * The card of an issue when its underline is hovered: the same parts, in the same order and look, as
 * an open entry of the Prüfung tab. Its kind with the coloured dot, the explanation, the
 * suggestions as buttons, and under a hairline the quiet actions. The classes `proof-*` are shared
 * with the tab (`ui/proof.css`).
 */
export function proofTip(
  issue: ProofIssue,
  labels: ProofLabels,
  act: ProofTipActions,
): HTMLElement {
  const card = el('div', 'cm-proof-tip')

  const head = el('div', 'cm-proof-tip-head')
  head.append(
    el('span', `proof-dot ${issue.category}`),
    el('span', 'cm-proof-tip-title', issue.shortMessage || labels.category[issue.category]),
  )
  card.append(head)
  if (issue.message && issue.message !== issue.shortMessage)
    card.append(el('p', 'cm-proof-tip-explain', issue.message))

  if (issue.replacements.length > 0) {
    const suggestions = el('div', 'cm-proof-tip-suggestions')
    suggestions.setAttribute('role', 'group')
    suggestions.setAttribute('aria-label', labels.suggestions)
    for (const value of issue.replacements.slice(0, MAX_SUGGESTIONS))
      suggestions.append(
        button('k-button k-button-sm proof-suggestion', value, () => act.apply(value)),
      )
    card.append(suggestions)
  } else {
    card.append(el('p', 'cm-proof-tip-explain', labels.noSuggestion))
  }

  const more = el('div', 'proof-more')
  more.setAttribute('role', 'group')
  more.setAttribute('aria-label', labels.moreActions)
  if (issue.category === 'spelling')
    more.append(
      button('k-button k-button-sm k-button-plain proof-action', labels.addToProject, () =>
        act.addWord('project'),
      ),
      button('k-button k-button-sm k-button-plain proof-action', labels.addToPersonal, () =>
        act.addWord('personal'),
      ),
    )
  more.append(
    button('k-button k-button-sm k-button-plain proof-action', labels.ignore, act.ignore),
    button('k-button k-button-sm k-button-plain proof-action', labels.disableRule, act.disableRule),
  )
  card.append(more)
  return card
}
