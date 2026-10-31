// Runs after electron-builder has made its artifacts (`afterAllArtifactBuild` in electron-builder.yml)
// and recompresses each dmg with LZMA (ULMO), which electron-builder's own `dmg.format` does not
// offer: about 10 % smaller than its bzip2 image (286 MB to 257 MB). ULMO opens on macOS 10.15 and
// newer. The dmg's block map describes the old image, so it is removed; there are no automatic
// updates in the first release that would read it. Nothing happens for a Linux or Windows build.
import { execFileSync } from 'node:child_process'
import { renameSync, rmSync } from 'node:fs'

export default function dmgUlmo(result) {
  for (const dmg of result.artifactPaths.filter((path) => path.endsWith('.dmg'))) {
    const converted = dmg.replace(/\.dmg$/, '.ulmo.dmg')
    execFileSync('hdiutil', ['convert', dmg, '-format', 'ULMO', '-o', converted, '-quiet'])
    renameSync(converted, dmg)
    rmSync(`${dmg}.blockmap`, { force: true })
  }
  return []
}
