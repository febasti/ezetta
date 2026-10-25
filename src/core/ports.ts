/**
 * Ports: what `core` needs from the outside world. The main process implements them; tests use
 * in-memory fakes. Add a port here when the first piece of core logic needs it, not before.
 */

export interface DirEntry {
  name: string
  kind: 'file' | 'dir'
}

/**
 * A file system rooted at the project folder. All paths are relative to that root, use "/", and
 * can never leave it: the adapter rejects `..`, absolute paths, and symbolic links that point out.
 */
export interface FileSystem {
  readFile(path: string): Promise<string>
  /**
   * Reads a text file outside the project that the writer chose, such as a bibliography that another
   * program writes. Takes an absolute path; only for `.bib` files, with a size limit. Read only:
   * nothing outside the project is ever written.
   */
  readExternalText(absPath: string): Promise<string>
  /** Writes via a temporary file in the same directory, then renames. Creates missing
   * parent directories. */
  writeFileAtomic(path: string, content: string): Promise<void>
  /** Like `writeFileAtomic`, for binary files such as images. */
  writeBytesAtomic(path: string, bytes: Uint8Array): Promise<void>
  /** Entries of a directory. Hidden files and symbolic links are not listed. */
  readDir(path: string): Promise<DirEntry[]>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  /** Renames or moves. Fails when the target exists. */
  rename(from: string, to: string): Promise<void>
  /** Moves to the system trash. Never deletes permanently. */
  trash(path: string): Promise<void>
}
