# OPFS Strands Agent

A Strands Agent (ts)  for building AI agents that manage files **entirely in the browser** using the [Strands Agents TypeScript SDK](https://www.npmjs.com/package/@strands-agents/sdk) and [opfs-worker](https://www.npmjs.com/package/opfs-worker) (Origin Private File System).

This project is the TypeScript equivalent of the [Strands Agents Python file operations example](https://strandsagents.com/latest/documentation/docs/examples/python/file_operations/).

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Amazon Bedrock (default)](#amazon-bedrock-default)
  - [OpenAI](#openai)
- [Running the Demo](#running-the-demo)
- [Project Structure](#project-structure)
- [Available File Tools](#available-file-tools)
- [How It Works](#how-it-works)
  - [1 · OPFS Tools](#1--opfs-tools)
  - [2 · The Agent](#2--the-agent)
  - [3 · Demo Entry Point](#3--demo-entry-point)
- [Customisation](#customisation)
  - [Adding new tools](#adding-new-tools)
  - [Changing the model provider](#changing-the-model-provider)
  - [Custom OPFS root](#custom-opfs-root)
  - [File watching](#file-watching)
- [Browser Compatibility](#browser-compatibility)
- [References](#references)
- [License](#license)

---

## Overview

| Concern | Technology |
|---------|-----------|
| AI agent loop & tool orchestration | [@strands-agents/sdk](https://www.npmjs.com/package/@strands-agents/sdk) |
| Browser file system (OPFS via Web Worker) | [opfs-worker](https://www.npmjs.com/package/opfs-worker) |
| Input validation & JSON-schema generation | [zod](https://www.npmjs.com/package/zod) |
| Bundler | [Vite](https://vitejs.dev/) |
| Language | TypeScript 5 |

The agent receives natural-language instructions and automatically selects the right OPFS tool to fulfil each request — reading, writing, copying, renaming, deleting, and indexing files — all within the browser's sandboxed storage.

---

## Architecture

```
┌─────────────────────────────────────────┐
│             Browser (index.html)        │
│                                         │
│  ┌────────────────────────────────────┐ │
│  │          Strands Agent             │ │
│  │  (src/agent.ts)                    │ │
│  │  · system prompt                   │ │
│  │  · model (Bedrock / OpenAI)        │ │
│  │  · tool registry                   │ │
│  └──────────────┬─────────────────────┘ │
│                 │ invokes tools         │
│  ┌──────────────▼─────────────────────┐ │
│  │       OPFS Tools                   │ │
│  │  (src/tools/opfs-tools.ts)         │ │
│  │  · write_file   · read_file        │ │
│  │  · append_to_file · list_files     │ │
│  │  · create_directory · delete_file  │ │
│  │  · file_info   · file_exists       │ │
│  │  · rename_file · copy_file         │ │
│  │  · index_file_system               │ │
│  └──────────────┬─────────────────────┘ │
│                 │ async calls           │
│  ┌──────────────▼─────────────────────┐ │
│  │   opfs-worker (Web Worker thread)  │ │
│  │   OPFSFileSystem façade            │ │
│  └──────────────┬─────────────────────┘ │
│                 │                       │
│  ┌──────────────▼─────────────────────┐ │
│  │   Origin Private File System (OPFS)│ │
│  │   Browser-sandboxed persistent FS  │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- A modern browser with OPFS support (Chrome 102+, Edge 102+, Safari 15.2+, Firefox 111+)
- AWS credentials **or** an OpenAI API key (see [Configuration](#configuration))

---

## Installation

```bash
# Clone the repository
git clone https://github.com/molekilla/opfs-strands-agent.git
cd opfs-strands-agent

# Install dependencies
npm install
```

---

## Configuration

### Amazon Bedrock (default)

The SDK uses Amazon Bedrock by default (Claude 3.5 Sonnet). Configure your AWS credentials before running the app:

```bash
# Option A – AWS CLI profile (recommended for local dev)
aws configure

# Option B – environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1
```

Ensure that **model access** is enabled for Claude in your AWS region:
[Amazon Bedrock Model Access Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

You can also target a specific model ID:

```typescript
import { BedrockModel } from '@strands-agents/sdk'

const agent = await createFileAgent({
  model: new BedrockModel({
    modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    region: 'us-east-1',
    maxTokens: 4096,
  }),
})
```

### OpenAI

To use OpenAI instead, install the optional peer dependency and pass the model:

```bash
npm install openai
```

```typescript
import { createFileAgent } from './src/agent'
import { OpenAIModel } from '@strands-agents/sdk/openai'

const agent = await createFileAgent({
  model: new OpenAIModel(), // reads OPENAI_API_KEY from environment
})
```

Set the key before running:

```bash
export OPENAI_API_KEY=sk-...
```

---

## Running the Demo

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The demo will:

1. Initialise an OPFS file system via `opfs-worker`
2. Create a `Strands Agent` equipped with all eleven file tools
3. Walk through fifteen natural-language file-operation tasks:
   - Write, read, append, list, stat, copy, rename, delete files
   - Create directories
   - Index the full file system

All output is streamed to the page in real time.

> **Production build**
> ```bash
> npm run build   # outputs to dist/
> npm run preview # serve the production build locally
> ```

---

## Project Structure

```
opfs-strands-agent/
├── index.html                  # Browser entry point
├── package.json
├── tsconfig.json
├── vite.config.ts              # Vite bundler configuration
└── src/
    ├── tools/
    │   └── opfs-tools.ts       # All 11 OPFS Strands tools
    ├── agent.ts                # Agent factory (createFileAgent)
    └── main.ts                 # Demo – 15-step file operations walkthrough
```

---

## Available File Tools

Each tool is created with [`tool()`](https://www.npmjs.com/package/@strands-agents/sdk) from the Strands SDK, validated with [Zod](https://zod.dev/), and backed by [opfs-worker](https://www.npmjs.com/package/opfs-worker).

| Tool name | Description |
|-----------|-------------|
| `write_file` | Create or overwrite a file with text content |
| `read_file` | Read the full text content of a file |
| `append_to_file` | Append text to the end of a file (creates it if absent) |
| `list_files` | List the entries inside a directory |
| `create_directory` | Create a directory (including all missing parents) |
| `delete_file` | Delete a file or directory (recursive) |
| `file_info` | Return metadata: kind, size, mtime, ctime |
| `file_exists` | Check whether a path exists |
| `rename_file` | Rename or move a file/directory |
| `copy_file` | Copy a file or directory recursively |
| `index_file_system` | Return a full recursive index of the entire file system |

---

## How It Works

### 1 · OPFS Tools

`src/tools/opfs-tools.ts` exports a factory function `createOpfsTools(fs)` that accepts an initialised `OPFSFileSystem` instance and returns an array of Strands `InvokableTool` objects.

Each tool follows the same pattern:

```typescript
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

const writeFile = tool({
  name: 'write_file',
  description: 'Write text content to a file …',
  inputSchema: z.object({
    path:    z.string().describe('Absolute path of the file to write'),
    content: z.string().describe('Text content to write into the file'),
  }),
  callback: async ({ path, content }) => {
    await fs.writeFile(path, content)
    return `File written successfully: ${path}`
  },
})
```

Zod schemas serve a dual purpose: they validate the model's JSON arguments at runtime **and** auto-generate the JSON Schema that the model provider uses for tool-call descriptions.

### 2 · The Agent

`src/agent.ts` exports `createFileAgent()`, which:

1. Spins up an OPFS Web Worker via `createWorker({ root: '/' })`
2. Builds the tool array with `createOpfsTools(fs)`
3. Wires them into a `new Agent({ systemPrompt, tools })` from the Strands SDK

```typescript
import { Agent } from '@strands-agents/sdk'
import { createWorker } from 'opfs-worker'
import { createOpfsTools } from './tools/opfs-tools'

export async function createFileAgent() {
  const fs    = await createWorker({ root: '/' })
  const tools = createOpfsTools(fs)
  return new Agent({ systemPrompt: SYSTEM_PROMPT, tools: [...tools] })
}
```

### 3 · Demo Entry Point

`src/main.ts` creates the agent and drives it through fifteen natural-language prompts that collectively exercise every tool:

```typescript
const agent = await createFileAgent()

await agent.invoke('Write a file at /hello.txt with the content "Hello, OPFS!"')
await agent.invoke('Read the file at /hello.txt')
await agent.invoke('List the files in the root directory /')
// … and so on
```

---

## Customisation

### Adding new tools

Add a new `tool({…})` call inside `createOpfsTools` in `src/tools/opfs-tools.ts` and include it in the returned array. The `OPFSFileSystem` façade exposes the full [opfs-worker API](https://github.com/kachurun/opfs-worker#api-reference).

```typescript
const readBinary = tool({
  name: 'read_binary_file',
  description: 'Read a file as a Uint8Array of raw bytes.',
  inputSchema: z.object({ path: z.string() }),
  callback: async ({ path }) => {
    const bytes = await fs.readFile(path, 'binary')
    return `Read ${bytes.byteLength} bytes from ${path}`
  },
})
```

### Changing the model provider

```typescript
// src/main.ts
import { BedrockModel } from '@strands-agents/sdk'

const agent = await createFileAgent({
  model: new BedrockModel({
    modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    region:  'eu-west-1',
  }),
})
```

### Custom OPFS root

```typescript
const fs = await createWorker({ root: '/my-app-data' })
```

All paths passed to tools are then resolved relative to `/my-app-data`.

### File watching

`opfs-worker` supports real-time change notifications via `BroadcastChannel`:

```typescript
import { createWorker } from 'opfs-worker'

const fs = await createWorker({
  root: '/',
  broadcastChannel: 'opfs-events',
})

fs.watch('/', { recursive: true })

const channel = new BroadcastChannel('opfs-events')
channel.onmessage = (event) => {
  console.log('File changed:', event.data)
}
```

---

## Browser Compatibility

OPFS is available in all modern browsers:

| Browser | Minimum version |
|---------|----------------|
| Chrome / Edge | 102 |
| Safari | 15.2 |
| Firefox | 111 |

Check current support: [caniuse.com/native-filesystem-api](https://caniuse.com/native-filesystem-api)

> **Note:** OPFS storage is **origin-scoped** (isolated per domain) and subject to browser quotas. Call [`navigator.storage.estimate()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) to check available space.

---

## References

| Resource | URL |
|----------|-----|
| Strands Agents – Python file operations example | https://strandsagents.com/latest/documentation/docs/examples/python/file_operations/ |
| Strands Agents TypeScript SDK (npm) | https://www.npmjs.com/package/@strands-agents/sdk |
| Strands Agents TypeScript SDK (GitHub) | https://github.com/strands-agents/sdk-typescript |
| Strands Agents documentation | https://strandsagents.com/ |
| opfs-worker (npm) | https://www.npmjs.com/package/opfs-worker |
| opfs-worker (GitHub) | https://github.com/kachurun/opfs-worker |
| Origin Private File System (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system |
| Zod v4 documentation | https://zod.dev/ |
| Vite documentation | https://vitejs.dev/ |
| Amazon Bedrock – model access | https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html |
| OPFS browser support (caniuse) | https://caniuse.com/native-filesystem-api |

---

## License

[MIT](LICENSE)

---

<div align="center">

Made with ❤️ in Panama — Rogelio Morrell, 2026

</div>
