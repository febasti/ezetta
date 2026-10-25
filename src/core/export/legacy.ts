/**
 * The bundled templates were replaced by new ones: a project or a writer's own template that names
 * an old one gets the template that took its place.
 */
const LEGACY_TEMPLATES: Readonly<Record<string, string>> = {
  abschlussarbeit: 'monographie',
  artikel: 'zeitschrift',
  pruefversion: 'manuskript',
}

export const currentTemplateId = (id: string): string => LEGACY_TEMPLATES[id] ?? id
