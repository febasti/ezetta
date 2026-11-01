import type { GroupNodeDto } from '@shared/project'
import { MATERIAL, TITELEI } from '@core/project/paths'
import { i18n } from '../../i18n/i18n.svelte'
import type { MenuItem } from '../../lib/menu.svelte'
import { project } from './project.svelte'

/** The Titelei and the group tree as menu items, for switching when the groups column is hidden. */
export function groupMenuItems(): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: i18n.t('titelei.title'),
      checked: project.selectedGroup === TITELEI,
      onselect: () => project.selectGroup(TITELEI),
    },
    { separator: true },
  ]
  const walk = (node: GroupNodeDto, depth: number): void => {
    items.push({
      label: `${' '.repeat(depth)}${node.path === '' ? (project.snapshot?.title ?? '') : node.name}`,
      checked: node.path === project.selectedGroup,
      onselect: () => project.selectGroup(node.path),
    })
    for (const child of node.children)
      if (child.kind === 'group' && child.path !== MATERIAL && (!node.inExport || child.export))
        walk(child, depth + 1)
  }
  if (project.tree) walk(project.tree, 0)
  // The material stands outside the structure, under its own heading.
  for (const outside of project.outside) walk(outside, 0)
  return items
}
