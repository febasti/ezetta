/** A program's file name on the given system: Windows names it with `.exe`. */
export const executable = (name: string, platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? `${name}.exe` : name
