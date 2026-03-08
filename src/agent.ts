import { Agent, type BedrockModel } from '@strands-agents/sdk'
import { createWorker } from 'opfs-worker'
import { createOpfsTools } from './tools/opfs-tools.ts'

/**
 * System prompt that instructs the agent about its capabilities and the
 * OPFS-backed file system it is operating on.
 */
const SYSTEM_PROMPT = `You are a helpful file management assistant with access to an
Origin Private File System (OPFS) stored entirely within the browser.

You can perform the following operations:
- Write files (write_file)
- Read files (read_file)
- Append content to files (append_to_file)
- List directory contents (list_files)
- Create directories (create_directory)
- Delete files and directories (delete_file)
- Get file/directory metadata (file_info)
- Check if a path exists (file_exists)
- Rename or move files/directories (rename_file)
- Copy files/directories (copy_file)
- Get a full index of all files in the system (index_file_system)

All paths are absolute and start with "/". The root of the file system is "/".
When the user asks you to perform a file operation, use the appropriate tool.
Always confirm the result of each operation.`

/**
 * Initialise the OPFS-backed Strands Agent.
 *
 * The agent uses opfs-worker for all file I/O and the default Bedrock model
 * provider. Swap the `model` option for an OpenAI model if you prefer:
 *
 * ```ts
 * import { OpenAIModel } from '@strands-agents/sdk/openai'
 * const model = new OpenAIModel() // reads OPENAI_API_KEY from environment
 * const agent = await createFileAgent({ model })
 * ```
 *
 * @param options.model - Optional custom model instance to use
 * @returns A fully configured Agent instance
 */
export async function createFileAgent(options?: {
  model?: BedrockModel | string
}): Promise<Agent> {
  const fs = await createWorker({ root: '/' })
  const tools = createOpfsTools(fs)

  const agent = new Agent({
    systemPrompt: SYSTEM_PROMPT,
    tools: [...tools],
    ...(options?.model ? { model: options.model } : {}),
  })

  return agent
}
