import { createFileAgent } from './agent.ts'

/**
 * Run a series of file operations through the Strands Agent, demonstrating
 * the same capabilities as the Python file_operations example:
 * https://strandsagents.com/latest/documentation/docs/examples/python/file_operations/
 */
async function runFileOperationsDemo(): Promise<void> {
  const output = document.getElementById('output')!

  function log(message: string): void {
    output.textContent += message + '\n'
    console.log(message)
  }

  log('Initialising OPFS Strands Agent…')

  const agent = await createFileAgent()

  log('Agent ready. Running file operations demo…\n')

  const tasks = [
    // 1. Write a file
    'Write a file at /hello.txt with the content "Hello, OPFS Strands Agent!"',

    // 2. Read it back
    'Read the file at /hello.txt and show me its content',

    // 3. Append to file
    'Append the text "\\nThis line was appended." to /hello.txt',

    // 4. Read after append
    'Read /hello.txt again so I can see the appended content',

    // 5. Create a directory
    'Create a directory at /notes',

    // 6. Write a second file inside the directory
    'Write a file at /notes/ideas.md with content "# Ideas\n\n- Build something awesome with Strands Agents\n- Use OPFS for browser-side storage\n"',

    // 7. List root directory
    'List the files in the root directory /',

    // 8. List the notes directory
    'List the files inside /notes',

    // 9. File metadata
    'Get the metadata for the file /notes/ideas.md',

    // 10. Check existence
    'Check if /notes/ideas.md exists',
    'Check if /does-not-exist.txt exists',

    // 11. Copy a file
    'Copy /hello.txt to /hello-backup.txt',

    // 12. Rename a file
    'Rename /hello-backup.txt to /hello-copy.txt',

    // 13. Full index
    'Show me a full index of everything in the file system',

    // 14. Delete a file
    'Delete /hello-copy.txt',

    // 15. Final index to confirm deletion
    'Show me the full index of the file system again to confirm the deletion',
  ]

  for (const task of tasks) {
    log(`\n─── Task ──────────────────────────────────────`)
    log(`User: ${task}`)
    log(`Agent:`)

    try {
      await agent.invoke(task)
    } catch (err) {
      log(`Error: ${String(err)}`)
    }
  }

  log('\n✅ Demo complete.')
}

// Kick off the demo when the page loads
window.addEventListener('DOMContentLoaded', () => {
  runFileOperationsDemo().catch((err) => {
    console.error('Demo failed:', err)
  })
})
