import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { type OPFSFileSystem } from 'opfs-worker'

/**
 * Factory that creates a set of Strands Agent tools backed by an OPFS file system.
 *
 * All file paths are relative to the root configured when creating the
 * OPFSFileSystem instance (default: '/').
 *
 * @param fs - An initialised OPFSFileSystem instance from opfs-worker
 * @returns An array of InvokableTool objects ready to pass to an Agent
 */
export function createOpfsTools(fs: OPFSFileSystem) {
  /**
   * Write content to a file, creating or overwriting it.
   */
  const writeFile = tool({
    name: 'write_file',
    description:
      'Write text content to a file at the given path, creating it if it does not exist or overwriting it if it does.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the file to write'),
      content: z.string().describe('Text content to write into the file'),
    }),
    callback: async ({ path, content }) => {
      await fs.writeFile(path, content)
      return `File written successfully: ${path}`
    },
  })

  /**
   * Read the full text content of a file.
   */
  const readFile = tool({
    name: 'read_file',
    description: 'Read and return the text content of a file at the given path.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the file to read'),
    }),
    callback: async ({ path }) => {
      const content = await fs.readFile(path, 'utf-8')
      return content
    },
  })

  /**
   * Append text to an existing file (or create it if absent).
   */
  const appendToFile = tool({
    name: 'append_to_file',
    description:
      'Append text content to the end of a file. Creates the file if it does not exist.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the file to append to'),
      content: z.string().describe('Text content to append'),
    }),
    callback: async ({ path, content }) => {
      await fs.appendFile(path, content)
      return `Content appended successfully to: ${path}`
    },
  })

  /**
   * List the names of files and sub-directories inside a directory.
   */
  const listFiles = tool({
    name: 'list_files',
    description:
      'List the contents of a directory, returning names and whether each entry is a file or directory.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Absolute path of the directory to list (use "/" for root)'),
    }),
    callback: async ({ path }) => {
      const entries = await fs.readDir(path)
      if (entries.length === 0) {
        return `Directory is empty: ${path}`
      }
      const lines = entries.map(
        (e) => `${e.isDirectory ? '[DIR]' : '[FILE]'} ${e.name}`,
      )
      return lines.join('\n')
    },
  })

  /**
   * Create a directory (and any missing parent directories).
   */
  const createDirectory = tool({
    name: 'create_directory',
    description:
      'Create a new directory at the given path, including any missing parent directories.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the directory to create'),
    }),
    callback: async ({ path }) => {
      await fs.mkdir(path, { recursive: true })
      return `Directory created successfully: ${path}`
    },
  })

  /**
   * Remove a file or directory (directories are removed recursively).
   */
  const deleteFile = tool({
    name: 'delete_file',
    description:
      'Delete a file or directory at the given path. Directories are deleted recursively.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the file or directory to delete'),
    }),
    callback: async ({ path }) => {
      await fs.remove(path, { recursive: true })
      return `Deleted successfully: ${path}`
    },
  })

  /**
   * Retrieve metadata (size, timestamps, kind) for a file or directory.
   */
  const fileInfo = tool({
    name: 'file_info',
    description:
      'Get metadata about a file or directory: kind (file/directory), size in bytes, and modification time.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Absolute path of the file or directory to inspect'),
    }),
    callback: async ({ path }) => {
      const stat = await fs.stat(path)
      return JSON.stringify(
        {
          path,
          kind: stat.kind,
          size: stat.size,
          mtime: stat.mtime,
          ctime: stat.ctime,
          isFile: stat.isFile,
          isDirectory: stat.isDirectory,
        },
        null,
        2,
      )
    },
  })

  /**
   * Check whether a file or directory exists.
   */
  const fileExists = tool({
    name: 'file_exists',
    description: 'Check whether a file or directory exists at the given path.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Absolute path of the file or directory to check'),
    }),
    callback: async ({ path }) => {
      const exists = await fs.exists(path)
      return exists ? `Path exists: ${path}` : `Path does not exist: ${path}`
    },
  })

  /**
   * Rename or move a file or directory.
   */
  const renameFile = tool({
    name: 'rename_file',
    description:
      'Rename or move a file or directory from one path to another.',
    inputSchema: z.object({
      sourcePath: z.string().describe('Current absolute path of the file or directory'),
      destinationPath: z.string().describe('New absolute path for the file or directory'),
    }),
    callback: async ({ sourcePath, destinationPath }) => {
      await fs.rename(sourcePath, destinationPath)
      return `Renamed/moved '${sourcePath}' → '${destinationPath}'`
    },
  })

  /**
   * Copy a file or directory to a new location.
   */
  const copyFile = tool({
    name: 'copy_file',
    description:
      'Copy a file or directory from one path to another. Directories are copied recursively.',
    inputSchema: z.object({
      sourcePath: z.string().describe('Absolute path of the source file or directory'),
      destinationPath: z.string().describe('Absolute path for the copy destination'),
    }),
    callback: async ({ sourcePath, destinationPath }) => {
      await fs.copy(sourcePath, destinationPath, { recursive: true })
      return `Copied '${sourcePath}' → '${destinationPath}'`
    },
  })

  /**
   * Return a full recursive index of every entry in the file system.
   */
  const indexFileSystem = tool({
    name: 'index_file_system',
    description:
      'Return a complete index of all files and directories in the file system, with their metadata.',
    callback: async () => {
      const index = await fs.index()
      if (index.size === 0) {
        return 'The file system is empty.'
      }
      const lines: string[] = []
      for (const [filePath, stat] of index) {
        const label = stat.isDirectory ? '[DIR]' : '[FILE]'
        lines.push(`${label} ${filePath} (${stat.size} bytes, modified: ${stat.mtime})`)
      }
      return lines.join('\n')
    },
  })

  // ── "Files Are All You Need" tools ──────────────────────────────────────────
  // Inspired by:
  //   https://www.llamaindex.ai/blog/files-are-all-you-need
  //   https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash
  //   https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/

  /**
   * Search all files under a directory for lines containing a query string.
   * Returns matching file paths and the matching lines (up to 5 per file).
   * Implements the "filesystem as knowledge base" pattern from the references above.
   */
  const searchFiles = tool({
    name: 'search_files',
    description:
      'Search for a text query across all files under a directory. Returns each matching file and the lines that contain the query (case-insensitive). Useful for retrieving stored memories or finding relevant notes without a vector database.',
    inputSchema: z.object({
      directory: z
        .string()
        .describe('Root directory to search recursively (use "/" for the whole filesystem)'),
      query: z.string().describe('Text to search for (case-insensitive)'),
      maxMatchesPerFile: z
        .number()
        .optional()
        .describe('Maximum matching lines to return per file (default: 5)'),
    }),
    callback: async ({ directory, query, maxMatchesPerFile = 5 }) => {
      const index = await fs.index()
      const results: string[] = []
      const lowerQuery = query.toLowerCase()
      const prefix = directory === '/' ? '/' : directory + '/'

      for (const [filePath, stat] of index) {
        if (!stat.isFile) continue
        if (filePath !== directory && !filePath.startsWith(prefix)) continue

        const content = await fs.readFile(filePath, 'utf-8')
        const matchingLines = content
          .split('\n')
          .filter((line) => line.toLowerCase().includes(lowerQuery))
          .slice(0, maxMatchesPerFile)

        if (matchingLines.length > 0) {
          results.push(`── ${filePath}`)
          matchingLines.forEach((line) => results.push(`   ${line.trim()}`))
        }
      }

      return results.length > 0
        ? results.join('\n')
        : `No matches for "${query}" under ${directory}`
    },
  })

  /**
   * Read several files at once and return all their contents.
   * Implements the "files as context window" pattern: load multiple
   * knowledge files before answering, instead of querying a database.
   */
  const readMultipleFiles = tool({
    name: 'read_multiple_files',
    description:
      'Read several files at once and return all their contents concatenated with clear separators. Use this to build context from multiple knowledge files before responding.',
    inputSchema: z.object({
      paths: z
        .array(z.string())
        .describe('List of absolute file paths to read'),
    }),
    callback: async ({ paths }) => {
      const sections: string[] = []
      for (const path of paths) {
        try {
          const content = await fs.readFile(path, 'utf-8')
          sections.push(`### ${path}\n${content}`)
        } catch {
          sections.push(`### ${path}\n[Error: file not found]`)
        }
      }
      return sections.join('\n\n')
    },
  })

  /**
   * Serialise a value as formatted JSON and write it to a file.
   * Files-as-structured-state: store agent outputs as machine-readable JSON
   * that downstream steps can parse — the filesystem as a data exchange layer.
   */
  const writeJson = tool({
    name: 'write_json',
    description:
      'Serialise a JavaScript value as pretty-printed JSON and write it to a file. Use this to persist structured agent outputs (objects, arrays) so they can be read by later pipeline steps.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path where the JSON file will be written'),
      value: z
        .string()
        .describe(
          'A JSON-encoded string representing the value to store. Must be valid JSON (e.g. \'{"key":"value"}\' or \'[1,2,3]\').',
        ),
    }),
    callback: async ({ path, value }) => {
      const parsed: unknown = JSON.parse(value)
      await fs.writeFile(path, JSON.stringify(parsed, null, 2))
      return `JSON written to ${path}`
    },
  })

  /**
   * Parse and return a JSON file's contents as a formatted string.
   * Allows agents to read back structured data written by write_json
   * or any other tool that stores JSON files.
   */
  const readJson = tool({
    name: 'read_json',
    description:
      'Read a JSON file and return its contents as a pretty-printed string. Use this to retrieve structured data written by write_json or other pipeline steps.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path of the JSON file to read'),
    }),
    callback: async ({ path }) => {
      const raw = await fs.readFile(path, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      return JSON.stringify(parsed, null, 2)
    },
  })

  return [
    writeFile,
    readFile,
    appendToFile,
    listFiles,
    createDirectory,
    deleteFile,
    fileInfo,
    fileExists,
    renameFile,
    copyFile,
    indexFileSystem,
    searchFiles,
    readMultipleFiles,
    writeJson,
    readJson,
  ] as const
}

export type OpfsTools = ReturnType<typeof createOpfsTools>
