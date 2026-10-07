# Claude Agents, Tools and Workflow: A Practical Guide

Prepared for Sylas Lyu. Written 6 October 2026; reviewed, tested on Windows and extended 7 October 2026.

## 1. How to use this guide

This guide explains every term from our chat (agent, tool, environment, MCP, connector, CLI, skill, subagent, hook, plugin, marketplace), how to install each piece, and examples you can run. It is written for Windows, since your laptop and desktop both run it; macOS differences are noted where they matter.

Parts:

- Part 1, concepts: sections 2 and 3. What the pieces are and how they fit.
- Part 2, foundations: sections 4 and 5. Terminal and JSON basics, which everything technical depends on.
- Part 3, claude.ai: sections 6 to 8. Projects, connectors and skills in the app you already use.
- Part 4, Claude Code: sections 9 to 15. Installing it, then MCP, subagents, hooks, plugins and automation.
- Part 5, applying it: sections 16 to 20. Workflow recipes, safety, troubleshooting, a four-week plan and a cheat sheet.

Shortcut if you only use Claude for coursework and writing: read 2, 3, 6, 7, 8 and 16. Add Part 2 and Part 4 when you start working with code or data files.

The product blurb that started this conversation ("Drive every app from a CLI, a JSON control channel or an MCP server") is answered directly at the end of section 15, under "Agent-ready apps: three ways to drive one". It makes most sense after sections 4, 5 and 11.

Conventions:

- Code blocks marked `powershell` are typed into Windows PowerShell. Blocks marked `bash` are for Git Bash, WSL or a macOS terminal.
- Text in angle brackets such as `<your-folder>` is a placeholder. Replace the whole thing, brackets included.
- Lines starting with `#` inside code blocks are comments. The shell ignores them.
- Each example states what output to expect, so you can tell whether it worked.

Accuracy: install commands, file formats and command flags were checked against Anthropic's documentation and the official docs of each tool on the date at the top. These products change every few weeks. If a command fails, the linked source page in section 21 is the place to check first. Windows behaviour marked "Tested" was run on a Windows 11 25H2 PC with Windows PowerShell 5.1 on 7 October 2026. Anything not confirmed in a source or a test is marked "Unverified".

## 2. Mental model and core vocabulary

An agent is a model that takes actions in a loop. Everything else in this guide controls one of three things: where that loop runs, what it can reach, and what instructions it carries.

The loop, as Claude Code's docs describe it and as this chat runs it:

1. You give a task.
2. The model picks an action: read a file, search the web, run a command, call a connector.
3. The app (not the model) runs that tool and hands back the result.
4. The model reads the result and either picks the next action or answers you.
5. Steps 2 to 4 repeat until the task is done or Claude needs your input.

The model never touches your files directly. It can only ask for a tool, and the app decides whether to run it, which is why permission prompts exist.

| Term | What it is | Example you have already seen |
| --- | --- | --- |
| Model | The language model itself: Claude Opus, Sonnet, Haiku. Text in, text out | The model answering in this chat |
| Tool | One named action the model can request; the app executes it | Web search, reading a file, Canva "create design" |
| Agent | Model plus tools plus the loop above | This chat searching the docs before writing this guide |
| Environment (surface) | Where the loop runs and what it can touch | claude.ai's cloud sandbox; Claude Code inside a folder on your laptop |
| Prompt | Your message | "Fill in this thought journal" |
| System prompt | Instructions the app gives the model before your message | Project instructions, the app's own rules |
| Context window | Everything the model sees on one turn: system prompt, chat history, files, tool results, skill descriptions | Very long chats drift because early details get crowded out |
| Token | The unit the model counts text in. Anthropic's pages give about 3.5 to 4 characters of English per token, and add that Claude 4.7 and later models produce about 30% more tokens for the same text, so expect nearer 3 with current models (derived) | Usage limits and context size are measured in tokens |
| Compaction | Summarising older parts of a long session to free context space | Claude Code's `/compact` command |

Where the add-ons attach, per Anthropic's "Extend Claude Code" page:

- Standing instructions, loaded every session: CLAUDE.md files in Claude Code; project instructions and saved preferences in claude.ai.
- Knowledge and procedures, loaded on demand: skills.
- New tools: MCP servers, which claude.ai calls connectors.
- Extra workers with their own clean context: subagents.
- Automatic actions that fire at fixed moments in the loop: hooks.
- Packaging: a plugin bundles skills, subagents, hooks and MCP servers into one install.

&#91;embedded content: the agent loop and where each add-on attaches\]

The model in the middle only chooses actions. Instructions and skills shape those choices, tools carry them out, and hooks sit on every tool call where they can stop it. A plugin is one install that brings several of these boxes at once.

One distinction matters more than the rest. Instructions (CLAUDE.md, project instructions, skills) are requests Claude interprets, so results can vary. Hooks run every time their event fires, so they are the tool for rules that must always hold. The docs' own example: "never edit .env" written in CLAUDE.md is a request; a hook that blocks the edit is enforcement.

## 3. The surfaces: where Claude runs

Use claude.ai for work whose inputs you can upload and whose output is text, a doc or a deck. Use Claude Code when the work lives in a folder of files on your computer or needs code run on them.

The chat you are reading this from is claude.ai. Its tools run in a private cloud workspace, so it sees your files only when you upload them, connect an app, or link the Claude desktop app on your computer.

| Surface | Runs on | Can touch | Good for | Requirement |
| --- | --- | --- | --- | --- |
| claude.ai (web, desktop chat, mobile) | Anthropic's cloud | Uploads, connectors, the web | Coursework, writing, research questions, docs, decks | Any plan; features vary by plan |
| Claude desktop app, Code tab | Your computer | Local project folders you open | Claude Code with a graphical interface, visual diff review | Download from claude.com/download; paid plan for Code |
| Claude Code CLI | Your terminal, in one folder | Files in that folder; commands you approve | Data scripts, website code, automation; the most complete Claude Code surface | Pro, Max, Team, Enterprise or Console account |
| Claude Code in VS Code or JetBrains | Inside your code editor | As the CLI | Coding without switching windows | Editor extension |
| Claude Code on the web (claude.ai/code) | Anthropic's cloud | A connected GitHub repository | Long tasks that continue after you close the laptop | GitHub repository |
| Claude mobile app | Your phone | Cloud sessions; remote control of a local session | Starting and checking tasks away from your desk | Same account |
| API and Agent SDK | Your own program | Whatever your code gives it | Building your own AI app | Console account, billed per token |

Points from Anthropic's setup and platforms pages worth knowing:

- The free claude.ai plan does not include Claude Code.
- Scripting and the Agent SDK are CLI-only. The desktop app and IDE extensions trade some CLI features for visual review.
- Settings, project memory and MCP servers are shared across the local Claude Code surfaces, so a setup made in the terminal also shows up in the desktop app and VS Code on the same computer.
- Claude Code on the web runs in the cloud, so a task keeps going after you disconnect.

For your work: coursework, readings and writing stay in claude.ai. Python analysis of research data and your website's code are Claude Code jobs. You can skip the API and SDK unless you decide to build an app.

## 4. Terminal and CLI basics on Windows

A CLI (command line interface) is a program you control by typing commands instead of clicking. On Windows you type them into PowerShell, and about fifteen commands cover nearly everything in this guide.

### Opening PowerShell

- Press Win + X, then choose Terminal or Windows PowerShell.
- PowerShell's prompt looks like `PS C:\Users\<you>>`. The older CMD prompt has no `PS`. The two use different commands, so check before pasting anything.
- Pick the entry without "(x86)" in its name; Anthropic's terminal guide notes the x86 one is 32-bit and Claude Code rejects it.
- Paste with Ctrl + V or a right-click. Press Ctrl + C to stop a running command. Up arrow recalls earlier commands. Tab completes file and folder names.

### How a command is built

```powershell
winget install --id Git.Git -e
```

- `winget` is the program.
- `install` is a subcommand: which job the program should do.
- `--id Git.Git` is a flag with a value. Flags start with `-` or `--`.
- `-e` is a flag with no value; for winget it means "exact match".

Nearly every CLI follows this shape, including `claude`, `git`, `uv` and `npx`. To see a program's options, add `--help`: `winget --help`, `git --help`, `claude --help`. For PowerShell's own commands, use `Get-Help <command>`.

### Exercise 1: where am I, and what is here?

```powershell
Get-Location
Get-ChildItem
```

Expected: the first prints your current folder, usually `C:\Users\<you>`. The second lists the files and folders in it. `pwd`, `ls` and `dir` are short aliases for the same two commands.

### Exercise 2: make a practice folder and a file

```powershell
cd ~
mkdir claude-practice
cd claude-practice
Set-Content -Path hello.txt -Value "first line"
Add-Content -Path hello.txt -Value "second line"
Get-Content hello.txt
```

Expected: `first line` and `second line` printed on two lines. You will reuse this folder for later exercises.

### Everyday commands

| Task | PowerShell command | Short alias |
| --- | --- | --- |
| Show current folder | `Get-Location` | `pwd` |
| List contents | `Get-ChildItem` | `ls`, `dir` |
| Change folder | `Set-Location <path>` | `cd <path>` |
| Go up one level | `cd ..` |  |
| Go home | `cd ~` |  |
| Make a folder | `New-Item -ItemType Directory <name>` | `mkdir <name>` |
| Show a file | `Get-Content <file>` | `cat <file>` |
| Write a file | `Set-Content <file> "<text>"` |  |
| Copy | `Copy-Item <from> <to>` | `cp` |
| Move or rename | `Move-Item <from> <to>` | `mv` |
| Delete (no Recycle Bin) | `Remove-Item <path>` | `rm` |
| Find where a program lives | `Get-Command <name>` | `gcm` |
| Clear the screen | `Clear-Host` | `cls` |

`Remove-Item` skips the Recycle Bin. Check the path before pressing Enter.

### Paths

- Absolute path: the full address, such as `C:\Users\<you>\claude-practice\hello.txt`.
- Relative path: from where you are now. `.\hello.txt` is "hello.txt in this folder"; `..\` is the folder above.
- Home: `~`, `$HOME` or `$env:USERPROFILE` in PowerShell. Some programs started from PowerShell, such as `code`, do not understand `~`, so this guide writes `$HOME` in those commands. `%USERPROFILE%` means the same folder in File Explorer's address bar and in CMD, but not in PowerShell.
- Paths with spaces need quotes: `cd "C:\Users\<you>\OneDrive\Class Notes"`.

### Installing the tools this guide uses

winget is Windows' built-in package manager. Run `winget --version` first; any version number means it works.

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e
winget install --id=astral-sh.uv -e
winget install jqlang.jq
winget install --id Microsoft.VisualStudioCode -e
```

| Tool | Why you want it |
| --- | --- |
| Git for Windows | Version history for code; also provides Git Bash, which Claude Code uses for its Bash tool (optional per Anthropic's docs; without it Claude Code uses PowerShell) |
| Node.js LTS | Provides `npx`, which runs many MCP servers and the MCP Inspector |
| uv | Installs Python and runs Python scripts and Python MCP servers |
| jq | Reads and filters JSON on the command line; used in hook scripts |
| VS Code | Code editor; optional, but the easiest way to edit config files |

Close PowerShell, open a new window, then confirm each one:

```powershell
git --version
node --version
npx --version
uv --version
jq --version
```

Expected: a version number from each. The Git and jq IDs above come from git-scm.com's and jqlang.org's install pages, uv's from Astral's docs. Tested: `winget show` found every ID above, plus `Microsoft.PowerShell` (PowerShell 7) and `Anthropic.ClaudeCode`, with winget 1.29. If an ID ever stops working, `winget search <name>` lists the current one.

If `npx` fails with "running scripts is disabled on this system", PowerShell's script policy is blocking npm's launcher. Microsoft's documentation gives Restricted as the default policy on Windows client computers, which blocks all scripts. Check the policy in force with `Get-ExecutionPolicy` (tested: the PC this guide was checked on returned RemoteSigned, set for LocalMachine, so nothing needed changing). If it says Restricted or AllSigned, run this once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Exit codes

Every program reports a number when it finishes. 0 means success; anything else means failure. Hooks in section 13 rely on this, since exit code 2 tells Claude Code to block an action.

```powershell
git --version
$LASTEXITCODE
git notarealcommand
$LASTEXITCODE
```

Expected: `0` after the first command and `1` after the second (git also prints an error). This uses Git, installed in the previous step.

### Pipes and redirection

A pipe `|` passes one command's output into the next. `>` writes output to a file; `>>` appends.

```powershell
Get-ChildItem ~ | Sort-Object LastWriteTime -Descending | Select-Object -First 5
Get-ChildItem ~ > listing.txt
```

Expected: the five most recently changed items in your home folder, then a new `listing.txt` holding the full list.

### Environment variables and PATH

Environment variables are named settings that programs read. PATH is the list of folders Windows searches when you type a program's name. The error "is not recognized as the name of a cmdlet" almost always means the program's folder is not on PATH, or the window was opened before the install finished.

```powershell
$env:PATH -split ';'
$env:GREETING = "hello"
$env:GREETING
```

Expected: one folder per line, then `hello`. A variable set this way lasts until you close the window. To keep one permanently:

```powershell
[Environment]::SetEnvironmentVariable('GREETING', 'hello', 'User')
```

### Exercise 3: run Python without installing it by hand

```powershell
cd ~\claude-practice
uv python install
Set-Content hello.py 'print("Hello from Python")'
uv run hello.py
```

Expected: uv downloads a Python version if needed, then prints `Hello from Python`.

### Git Bash and WSL

- Git Bash comes with Git for Windows and understands Linux-style commands (`ls -la`, `cat`, `grep`). Claude Code uses it behind the scenes when present.
- WSL (Windows Subsystem for Linux) runs a full Linux system inside Windows. Anthropic lists it as the route for sandboxed command execution. Not needed for anything in this guide.

### Git in a few commands

Git keeps a history of a folder, so any saved state can be brought back. Recipe 6, `/rewind` and the safety table in section 17 lean on it. Once per computer, tell Git who you are:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

| Command | What it does |
| --- | --- |
| `git init` | Start tracking the current folder (once per project) |
| `git status` | Show what changed since the last snapshot |
| `git add .` | Stage every change for the next snapshot |
| `git commit -m "<message>"` | Save a snapshot (a commit) with a description |
| `git log --oneline` | List snapshots, newest first |
| `git diff` | Show unsaved changes line by line |
| `git restore <file>` | Throw away unsaved changes to one file |

Try it in a throwaway folder:

```powershell
mkdir ~\claude-practice\git-test
cd ~\claude-practice\git-test
Set-Content notes.txt "version one"
git init
git add .
git commit -m "First snapshot"
Set-Content notes.txt "version two"
git diff
git restore notes.txt
Get-Content notes.txt
```

Expected: an "Initialized empty Git repository" line, a one-file commit summary, a diff showing `-version one` and `+version two`, and finally `version one`, because `git restore` brought back the committed text.

## 5. JSON basics

JSON is the text format behind almost every config file in this guide: `settings.json`, `.mcp.json`, `plugin.json`, the data a hook receives, and the messages MCP servers exchange. Six rules cover it.

1. An object sits in curly braces and holds `"key": value` pairs separated by commas.
2. A list (array) sits in square brackets: `["PSY", "COM"]`.
3. Keys and text values use double quotes. Single quotes are invalid.
4. A value is text, a number, `true`, `false`, `null`, an object or a list.
5. No comma after the last item, and no comments. Claude Code's hooks troubleshooting page lists both as reasons a settings file silently fails to load.
6. Backslashes in Windows paths are doubled: `"C:\\Program Files\\Git\\bin\\bash.exe"`.

A real example, the shape Anthropic's setup page uses to point Claude Code at Git Bash:

```json
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe",
    "GREETING": "hello"
  }
}
```

The outer object has one key, `env`, whose value is another object holding two `"key": "text"` pairs separated by a comma. The `GREETING` line is only there to show the comma rule; leave it out of a real settings file.

### Exercise 4: read JSON with jq

```powershell
cd ~\claude-practice
Set-Content good.json '{"name": "test", "courses": ["PSY", "COM"], "junior": true}'
jq . good.json
jq '.name' good.json
jq -r '.courses[]' good.json
jq '.courses | length' good.json
```

Expected, in order: the object printed with indentation; `"test"`; `PSY` and `COM` on separate lines (`-r` removes the quotes); `2`.

The outer single quotes matter in PowerShell. They pass the text through unchanged, double quotes included.

### Exercise 5: break it on purpose

```powershell
Set-Content bad1.json '{"name": "test",}'
Set-Content bad2.json '{name: "test"}'
jq . bad1.json
jq . bad2.json
```

Expected: both print a `jq: error` parse message. The first has a trailing comma; the second has an unquoted key. When a config file "does nothing", running `jq . <file>` is the fastest check.

### Exercise 6: parse the kind of JSON a hook receives

Claude Code sends hooks a JSON object on standard input. This sample has the same shape as the one in Anthropic's hooks guide:

```powershell
'{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | jq -r '.tool_input.command'
```

Expected: `npm test`. Section 13 uses exactly this pattern.

### JSON messages as a control channel

The "JSON control channel" from the product blurb that started this conversation is a general pattern: a program accepts commands written as JSON objects and answers in JSON. MCP works this way. It uses JSON-RPC 2.0 messages, so a client asking a server to list its tools sends an object shaped like this (illustrative):

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
```

You never type these by hand in normal use. The MCP Inspector in section 11 shows them going back and forth, and the end of section 15 gives a routine for getting to know any app that offers a CLI, a JSON channel or an MCP server.

### YAML, briefly

Skill and subagent files start with YAML frontmatter instead of JSON. YAML uses `key: value` lines, no braces, and indentation for nesting:

```yaml
---
name: quiz-helper
description: Answers practice quiz questions from assigned chapters
---
```

The `---` lines mark where the frontmatter starts and ends. Claude Code's skills page notes that the opening `---` has to be the file's first line.

## 6. claude.ai features you already have

For coursework, a well-set-up Project does most of what people build agents for: it keeps your files and standing instructions loaded so every new chat starts informed.

### Projects

A Project is a workspace with its own chats, a knowledge base of files, and instructions. Facts from Anthropic's help article:

- Available on all plans; free accounts can create up to five Projects.
- Create one at claude.ai/projects with "+ New Project". Claude cannot see the Project's name or description, so put anything it needs in the instructions or files.
- Project knowledge sits on the right side of the Project page. Add files with the "+" button; everything there is used across every chat in that Project.
- On paid plans, when project knowledge nears the context limit, Claude switches to retrieval (RAG): it searches the files for relevant passages instead of reading everything at once.
- "Set project instructions" holds standing instructions for every chat in the Project.
- Chats in the same Project do not see each other. Anything that should carry over between chats belongs in project knowledge.
- Existing chats can be moved in with the dropdown next to the chat name, then "Add to project".

You already have Projects for PSY, COM, ANTH and EDPS. The improvements below apply to those.

### Exercise 7: tighten a course Project

1. Open the course Project. In project knowledge, upload the syllabus, the assigned readings or chapters, and lecture transcripts. Use descriptive file names such as `Ch05_Griffin_SocialPenetration.pdf`; retrieval and your own citations both work better with them.
2. Click "Set project instructions" and paste a version of this, adjusted per course:

```text
Course: <course code and title>, Fall 2026.
Sources: answer from the files in project knowledge first. Name the file and page, slide or timestamp for each answer.
If the files do not cover a question, say so before answering from outside knowledge, and label that answer as outside research.
Never invent page numbers, quotes or citations.
Style: British spelling. Plain prose. No em dashes, no bold. Study notes as short bullet fragments.
```

3. Start a new chat in the Project and ask: "Which file covers \<topic>, and on what page?" Expected: Claude names a file and location. If it answers vaguely, check that the file uploaded and that its text is selectable (scanned PDFs without a text layer read poorly).

### Memory and past-chat search

These are two separate features, both controlled in Settings. Per Anthropic's help article:

| Feature | What it does | Plans |
| --- | --- | --- |
| Search and reference chats | Claude searches your earlier chats when you ask ("what did we decide about X?"); shows as a tool call | Paid plans |
| Generate memory from chat history | Claude keeps a summary of durable context (role, projects, preferences), updated about every 24 hours | All plans |
| Project memory | Each Project gets its own separate memory and summary | Same as memory |
| Incognito chat | Ghost icon on a new non-project chat; not saved to history or memory | All plans |

The help article fetched for this guide places both toggles and "View and edit memory" under Settings > Capabilities; other versions of the same article show a Settings > Memory section. Uncertain which your app shows; look in both.

To change memory directly, tell Claude in any chat what to remember or forget. The article says such edits apply to your next conversation without waiting for the daily update.

### Profile preferences

Settings > Profile holds preferences applied to every new chat: tone, formatting, background. Your no-dashes, British-English and plain-prose rules live there now. Changes apply to new chats only.

### Artifacts

Artifacts are pages Claude publishes to your claude.ai gallery, private until you share them. Some open in dedicated editors where you can change text yourself, such as documents, slide decks and spreadsheets; this guide is one. Others are single web pages Claude builds, such as a calculator, dashboard or interactive explainer. Ask for the thing by name ("make a doc", "make a slide deck") and Claude picks the matching kind; documents and decks can be downloaded as Word, PowerPoint or PDF from the artifact.

### Best practices for chats and Projects

From Anthropic's prompting guide and help articles:

- Write as if briefing a capable new colleague with no context. If a classmate would be confused by the prompt, Claude will be too.
- Give the reason behind a rule ("no ellipses, because this is read aloud"), so Claude can apply it to cases you did not list.
- Show the format you want with 3 to 5 examples, wrapped in `<example>` tags, and keep instructions, readings and questions apart with XML tags such as `<reading>`.
- Put long material first and your question last; Anthropic reports quality gains of up to 30 percent from that order in its tests. For long readings, ask Claude to quote the relevant passages before answering.
- Put each instruction where it belongs: profile preferences apply to every chat, Project instructions to one Project, and skills to one repeated task.
- Use incognito for one-off or sensitive questions. Incognito chats stay out of history and memory, though the help article says they are still retained for 30 days by default.
- Use "Remove from project" to take a stray chat out of a Project's memory.

### What claude.ai does not do

- It cannot see files on your computer unless you upload them, connect an app, or link the desktop app.
- It does not run hooks or load your local Claude Code configuration.
- Its code runs in a cloud sandbox with restricted internet access, so a script that needs to download data from an arbitrary website usually fails there.

## 7. Connectors in claude.ai

A connector is an MCP server that claude.ai connects to for you. It adds tools for one of your apps, and Anthropic's help article states Claude inherits your own permissions there: a file you cannot open, Claude cannot open either.

Your account already has Google Drive and Canva connected; their tools appear in this chat (Drive: search, read, create, update, share, trash; Canva: search, create, edit, export designs).

### The four ways tools reach Claude

| Kind | Where you set it up | Where it runs | Usable in |
| --- | --- | --- | --- |
| Directory connector | Customize > Connectors, then "+" next to Connectors, or claude.ai/connectors | The provider's server, reached from Anthropic's cloud | claude.ai web, desktop and mobile; also Claude Code when signed in with the same account |
| Custom connector | Customize > Connectors > "+ Add" > "Add custom connector", then a server URL | Any MCP server reachable on the public internet | Same as above |
| Local MCP server, desktop app | `claude_desktop_config.json` | Your computer | Claude desktop app chat only; not claude.ai web |
| Local MCP server, Claude Code | `claude mcp add` (section 11) | Your computer | Claude Code |

Facts from the help articles worth knowing:

- Custom connectors are on every plan; the free plan allows one.
- Claude reaches a custom connector from Anthropic's cloud, not from your laptop, so a server on your own machine or behind a university VPN will not connect as a custom connector. That case needs a local MCP server instead.
- With many connectors on, the chat menu's "Tool access" setting can switch from Auto to On demand; the article suggests On demand at 10 or more connectors, to leave room in context.
- To edit a custom connector, remove it and add it again.

### Exercise 8: use a connector on purpose

1. Start a new chat. Click "+" at the lower left (or type `/`), hover over Connectors, and check that Google Drive is toggled on for this chat.
2. Ask: "Find my three most recently edited Google Docs and list their titles and last-edited dates."
3. Expected: a tool-call card showing a Drive search, then a short list. If Claude says it cannot access Drive, the connector is off for that chat or needs re-authenticating in Customize > Connectors.

### Exercise 9: lock down write actions

1. Open Customize > Connectors and select Google Drive.
2. Under Tool permissions, set the read tools to Always allow and the tools that change things (create, update, share, trash) to Needs approval.
3. Expected: next time Claude tries to share or trash a file, it stops and asks you first.

The help article describes these per-tool settings (Always allow, Needs approval, Blocked) in the context of Team and Enterprise owner controls. Whether every option appears on an individual plan is unverified; at minimum, Claude's approval prompts give you a per-action "Allow once" or "Allow always" choice.

### Best practices for connectors

- Use "Allow once" until you trust a tool, then "Always allow" only for read tools.
- Know the labels in the connector directory: Anthropic's verification page says "Verified" is not a security audit, community connectors are screened lightly, and custom connectors have no Anthropic review at all.
- Research, the claude.ai mode that searches widely before answering, uses your usage limits faster than normal chat; check its citations, and name a connected source in the prompt if it was skipped.

### Safety rules from Anthropic's custom-connector article

- Connect only servers built and hosted by organisations you trust.
- Read the permissions an app requests when you sign in, and refuse scopes that look unnecessary.
- A malicious server can hide instructions in its tool results (prompt injection). Watch what tools are called and with what inputs.
- Click "Allow always" only for a tool you would trust to run unsupervised.
- Research is a claude.ai mode that runs many searches and tool calls on its own before answering. When using it with connectors, turn off tools that can write, since it can call tools without asking each time.

## 8. Skills

A skill is a folder holding a `SKILL.md` file of instructions for one repeated task. Claude sees only each skill's name and description until a task matches, then loads the full instructions. Your text-quiz, homework-quiz, psy-quiz, coms-quiz and psy-thought-journal setups are skills, so this section explains what you already built and how to build the next one well.

### Anatomy

```text
lecture-notes/
├── SKILL.md        required: frontmatter + instructions
├── references/     optional: long reference files, read only when needed
├── scripts/        optional: code the skill runs
└── assets/         optional: templates, data files
```

`SKILL.md` has two parts: YAML frontmatter between `---` lines, then Markdown instructions. Rules from the Agent Skills specification at agentskills.io:

- `name`: 1 to 64 characters; lowercase letters, digits and single hyphens; no hyphen at the start or end; must match the folder name.
- `description`: 1 to 1,024 characters. Say what the skill does and when to use it, with the words a request would contain. Claude picks skills by matching this text.
- Keep `SKILL.md` under 500 lines; move long material into `references/` and point to it.

The spec's own contrast: "Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents..." works; "Helps with PDFs" does not.

### Where a skill can live

| Location | Path or place | Loads in |
| --- | --- | --- |
| Your claude.ai account | Customize > Skills (uploaded ZIP) | claude.ai chats; Claude Code sessions signed in to the same account (synced into `~/.claude/skills/synced/`) |
| Personal, Claude Code | `~/.claude/skills/<name>/SKILL.md` (on Windows `%USERPROFILE%\.claude\skills\<name>\SKILL.md`) | Every Claude Code project on this computer |
| Project, Claude Code | `.claude/skills/<name>/SKILL.md` inside a project folder | Sessions in that project |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Wherever the plugin is enabled, invoked as `/plugin-name:skill-name` |

### Frontmatter: what works where

| Field | claude.ai upload | Claude Code | Purpose |
| --- | --- | --- | --- |
| `name` | Yes | Yes | Command name; matches folder |
| `description` | Yes | Yes | When to use the skill |
| `allowed-tools` | Yes | Yes | Tools pre-approved while the skill runs |
| `license`, `compatibility`, `metadata` | Yes | Accepted, not acted on | Bookkeeping |
| `disable-model-invocation` | No | Yes | Only you can trigger it, by typing `/name` |
| `argument-hint`, `arguments` | No | Yes | Text typed after `/name` fills `$ARGUMENTS` |
| `context: fork`, `agent` | No | Yes | Run the skill in a subagent |
| `model`, `effort`, `paths`, `hooks` | No | Yes | Per-skill model, effort, file triggers, hooks |

Per Claude Code's skills page, a claude.ai upload containing a Claude Code-only field fails with an error naming the unexpected key. Keep skills meant for both places to the first four rows.

### Worked example: a lecture-notes skill

This fills a gap next to your existing skills: turning a lecture transcript into study notes in your format.

```markdown
---
name: lecture-notes
description: Turns a lecture transcript into concise study notes with timestamps, defined terms and points the lecturer flagged for the exam. Use when the user uploads a lecture transcript and asks for notes, a summary or a study sheet.
---

# Lecture notes from a transcript

## Inputs
- A lecture transcript (.txt, .docx or pasted). If none is attached, ask for it. Never write notes from general knowledge of the topic.
- Optional: course name and the chapter the lecture covers.

## Steps
1. Read the whole transcript before writing.
2. Split it into the topics the lecturer covered, in the order covered.
3. For each topic: 2 to 6 bullet fragments, with the transcript timestamp or line number.
4. List every term the lecturer defined, one line each, in the lecturer's wording where exact wording matters.
5. List anything flagged as important: "this will be on the exam", repeated points, "remember".
6. List gaps: readings or slides referred to but not explained.

## Output
Sections in this order: Topics, Key terms, Flagged for exam, Gaps.

## Rules
- British spelling. No em dashes. No bold. Fragments, not full sentences.
- Add nothing the lecturer did not say. Context you add is tagged [Added].
```

### Exercise 10: install it in claude.ai

No terminal needed:

1. In File Explorer, open `C:\Users\<you>`, create a folder named `skills`, and inside it a folder named `lecture-notes`. The folder name must match the `name` line in the frontmatter.
2. Open Notepad, paste the example above, and choose File > Save as. Set "Save as type" to All files, go to the `lecture-notes` folder, and save as `SKILL.md`. If File Explorer then shows it as a text document, it was saved as `SKILL.md.txt`; turn on file name extensions in File Explorer's View menu to check, and rename it.
3. Right-click the `lecture-notes` folder itself. On Windows 11 24H2 and later, including 25H2, choose Compress to > ZIP File; earlier Windows 11 builds call it Compress to ZIP file, and Windows 10 uses Send to > Compressed (zipped) folder. Zipping the folder, rather than the file inside it, keeps the folder at the top of the ZIP, which claude.ai needs: its how-to page says it looks for `<skill-name>/SKILL.md` inside the archive.

Terminal route, once you have done section 4:

```powershell
mkdir $HOME\skills\lecture-notes
code "$HOME\skills\lecture-notes\SKILL.md"
cd $HOME\skills
tar.exe -a -c -f lecture-notes.zip lecture-notes
```

`tar.exe` ships with Windows 10 and 11, and `-a` picks the ZIP format from the file name. Check the result with `tar.exe -tf lecture-notes.zip`: every entry should start with `lecture-notes/`. Avoid `Compress-Archive` in Windows PowerShell 5.1 for this. Tested: its built-in Archive module (version 1.0.1.0) stored the file as `lecture-notes\SKILL.md` with a backslash, while the ZIP specification (PKWARE APPNOTE, section 4.4.17) requires forward slashes; `tar.exe` stored `lecture-notes/SKILL.md`. Whether claude.ai's uploader rejects the backslash version was not tested.

Then, per Anthropic's help article:

1. Check Settings > Capabilities: "Code execution and file creation" must be on.
2. Go to Customize > Skills, click "+", then "+ Create skill", then "Upload a skill", and choose the ZIP.
3. Make sure the new skill's toggle is on.
4. Test in a new chat: upload any lecture transcript and write "make notes from this lecture". Expected: the reply shows the skill being used and follows the four-section format.

### Exercise 11: install it in Claude Code

After section 9:

```powershell
mkdir $env:USERPROFILE\.claude\skills\lecture-notes
Copy-Item ~\skills\lecture-notes\SKILL.md $env:USERPROFILE\.claude\skills\lecture-notes\
```

Start `claude` in any folder and type `/skills`. Expected: `lecture-notes` in the list. Invoke it with `/lecture-notes` or by asking for lecture notes. Skills uploaded to your claude.ai account also sync into Claude Code when you sign in with that account (Claude Code v2.1.273 or later), so this step is only needed for skills you keep local.

### Writing skills that trigger correctly

- Put the main use case first in the description; Claude Code truncates the description in its skill list.
- Name the request words people use ("notes", "summary", "study sheet"), and file types where relevant.
- Overlapping descriptions make Claude pick the wrong skill, per Anthropic's guidance. Your three comm-theory quiz skills (coms-quiz, text-quiz, homework-quiz) cover similar ground. text-quiz and homework-quiz name explicit trigger phrases, which helps; in this guide's reading, coms-quiz's broader description is the one most likely to fire when you meant another.
- Say what not to do, as your text-quiz skill does ("Don't invent a page number"). Concrete prohibitions work better than general advice.
- To test a change, run the same prompt in a fresh chat with the skill on and off and compare.
- Rules that must hold every single time belong in a hook (section 13), which Claude cannot skip. A skill is an instruction Claude interprets.

### Best practices for skills

From Anthropic's skill-authoring guidance:

- Write the description in the third person ("Turns a lecture transcript into...") and say both what it does and when to use it. The claude.ai how-to page allows 1,024 characters, an older help article says 200; staying under 200 works with both.
- Keep `SKILL.md` under 500 lines, move detail into `references/` files one level deep, and give any reference file over 100 lines a table of contents.
- Match strictness to fragility: plain guidance for open-ended work, exact steps or a script where one mistake breaks the result.
- Write at least three test prompts before polishing the instructions, then run each in a fresh chat with the skill on and off. In Claude Code the skill-creator plugin (Exercise 22) runs the with-and-without comparison for you; on claude.ai, skill-creator is a skill under Customize > Skills and works through the prompts one at a time.
- Use forward slashes in any paths inside a skill, even on Windows.
- Read the `allowed-tools` line of any skill that comes with a repository before running Claude Code there; a skill can grant itself broad tool access.

### Claude Code extras worth knowing

- `$ARGUMENTS` in the body is replaced by whatever you type after the command: `/lecture-notes week5.txt`.
- A line starting with `` !`command` `` runs that command first and pastes its output into the instructions, such as `` !`git diff HEAD` ``. Claude Code only; ignored in claude.ai.
- `disable-model-invocation: true` suits skills with side effects (sending, deleting, publishing), so they only run when you type the command.

## 9. Installing Claude Code on Windows

Installing Claude Code takes one PowerShell command and a browser sign-in. It needs a Pro, Max, Team or Enterprise plan, or a Console (API) account; the free plan does not include it.

### Requirements, per Anthropic's setup page

- Windows 10 version 1809 or later, 4 GB RAM or more, x64 or ARM64 processor, internet connection.
- PowerShell or CMD. No administrator rights needed.
- Git for Windows is optional. With it, Claude Code runs shell commands through Git Bash; without it, through PowerShell. Installing it (section 4) is recommended.

### Exercise 12: install and verify

1. Open PowerShell (not the "(x86)" entry) and run:

```powershell
irm https://claude.ai/install.ps1 | iex
```

`irm` downloads the installer script and `iex` runs it. Expected: scrolling output ending in "Claude Code successfully installed!"

2. Close PowerShell, open a new window, and check:

```powershell
claude --version
claude doctor
```

Expected: a version number followed by `(Claude Code)`, then a diagnostics report covering install health, settings-file errors and warnings with fixes.

Already installed through npm? Tested: the PC this guide was checked on had Claude Code 2.1.268 from `npm install -g @anthropic-ai/claude-code` (it lives in `C:\nvm4w\nodejs`), while winget listed 2.1.292 as current. Anthropic's install page lists npm under advanced options and calls the native install recommended. To switch, run the installer from Exercise 12, then `npm uninstall -g @anthropic-ai/claude-code`, open a new window, and check that `where.exe claude` lists only `...\.local\bin\claude.exe`; if it lists nothing, run the PATH fix below. The CLI reference says `claude install` also installs the native binary (not tested here). The troubleshooting page says to keep only one install. Some behaviour in this guide, such as auto mode as the starting mode on every plan, needs v2.1.283 or later.

Alternative install through winget: `winget install Anthropic.ClaudeCode`. The native installer updates itself in the background; the winget version does not, so you would run `winget upgrade Anthropic.ClaudeCode` yourself.

### Exercise 13: first session in the practice folder

```powershell
cd ~\claude-practice
claude --permission-mode manual
```

1. The first launch opens a browser to sign in with your Claude account. Credentials are stored, so later launches skip this. Type `/login` inside a session to switch accounts. Anthropic's security page adds that the first run in a folder asks you to confirm you trust it; say yes for your practice folder. Start Claude Code from a project folder rather than your home folder, since trust given to the home folder only lasts for that session.
2. Manual mode makes Claude ask before every edit and command, which is the best way to see what it does while learning. Claude Code v2.1.283 and later otherwise start in auto mode, where a second model reviews actions instead of you (section 10).
3. Type: `what files are in this folder and what does each contain?` Expected: it lists `hello.txt`, `hello.py`, `good.json` and the rest, with a line on each. Reading needs no approval.
4. Type: `create notes.md with a one-line description of each file here`. Expected: a permission prompt showing the file it wants to write. Choose Yes, then open the file to check it.
5. Type `/exit`, or press Ctrl + D twice, to leave. Esc interrupts Claude mid-task.

### If something goes wrong

| Message | Cause | Fix from Anthropic's terminal guide |
| --- | --- | --- |
| `'irm' is not recognized` | You are in CMD | Open PowerShell, or use the CMD installer on the setup page |
| `The token '&&' is not a valid statement separator` | You pasted the CMD command into PowerShell | Use the `irm` command above |
| `'claude' is not recognized` | Install folder not on PATH | Run the two PATH lines below, then open a new window |
| `Could not create SSL/TLS secure channel` | Older Windows 10 TLS settings | Run `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` then retry |
| `Claude Code does not support 32-bit Windows` | You opened PowerShell (x86) | Open the entry without "(x86)" |

The PATH fix:

```powershell
$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
[Environment]::SetEnvironmentVariable('PATH', "$currentPath;$env:USERPROFILE\.local\bin", 'User')
```

### Updating and uninstalling

- `claude update` applies an update immediately; otherwise the native install updates in the background.
- To remove a native install:

```powershell
Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force
Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force
```

Settings and history live in `%USERPROFILE%\.claude` and `%USERPROFILE%\.claude.json`. Deleting those erases all settings, MCP configuration and session history.

### The two graphical alternatives

- Claude desktop app, Code tab: download from claude.com/download, open the Code tab, pick a project folder. Same engine with a visual diff viewer and no terminal. Settings are shared with the CLI.
- VS Code extension: needs VS Code 1.94 or later. Press Ctrl + Shift + X, search "Claude Code", install (publisher Anthropic, ID `anthropic.claude-code`), then click the spark icon at the top right of an open file and sign in. The extension bundles its own private copy of Claude Code, so it does not make `claude` work in a terminal; for that you still need the install above. Conversations are shared: `claude --resume` in a terminal opens a picker that includes extension sessions.

For a first-time terminal user, the desktop app's Code tab is the gentlest start. The CLI is worth learning because scripting, `claude -p` and some commands exist only there.

## 10. Claude Code essentials

Five things make Claude Code manageable: a handful of commands, a CLAUDE.md file of standing instructions, permission modes, plan mode, and settings files with permission rules.

### Starting and steering a session

| From the terminal | What it does |
| --- | --- |
| `claude` | Start a session in the current folder |
| `claude "task"` | Start with a first prompt |
| `claude -c` | Continue the most recent conversation in this folder |
| `claude -r` | Pick an earlier conversation to resume |
| `claude -p "query"` | Answer once and exit, with no session (section 15) |
| `claude --permission-mode <mode>` | Start in a specific permission mode |

Inside a session: Esc interrupts Claude; Shift + Tab cycles permission modes; typing `/` lists commands and skills; typing `@` followed by part of a file name attaches that file; Up arrow recalls earlier prompts.

### The commands worth learning first

Descriptions condensed from Anthropic's commands reference.

| Command | Purpose |
| --- | --- |
| `/help` | List commands |
| `/init` | Generate a starter CLAUDE.md for the current project |
| `/memory` | Edit CLAUDE.md files; turn auto memory on or off |
| `/context` | Show what is filling the context window, including which memory files loaded |
| `/compact [focus]` | Summarise the conversation so far to free space |
| `/clear` | Start a fresh conversation, keeping project memory |
| `/resume` | Return to an earlier conversation |
| `/rewind` | Roll code and conversation back to a checkpoint |
| `/model` | Switch model |
| `/plan [task]` | Enter plan mode, optionally with a task |
| `/permissions` | View and edit allow, ask and deny rules |
| `/mcp` | Manage MCP server connections |
| `/hooks` | View configured hooks |
| `/plugin` | Manage plugins |
| `/skills` | List skills and change their visibility |
| `/usage` | Session cost, plan usage limits and what is driving them |
| `/status` | Version, model, account, and which settings files loaded |
| `/doctor` | Setup checkup that finds and offers to fix problems |
| `/btw <question>` | Side question that does not get added to the conversation |
| `/exit` | Leave |

### CLAUDE.md: standing instructions

CLAUDE.md is a plain Markdown file Claude reads at the start of every session in that folder. It is the Claude Code equivalent of project instructions in claude.ai.

| Scope | Location | Applies to |
| --- | --- | --- |
| User | `~/.claude/CLAUDE.md` | All your projects |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Everyone working in this folder |
| Local | `./CLAUDE.local.md` | Only you, in this folder (keep it out of git) |

Guidance from Anthropic's memory page:

- Keep each file under about 200 lines; longer files cost context and get followed less reliably.
- Write instructions concrete enough to check: "Run `uv run tests.py` before finishing" rather than "test your changes".
- Add a line when Claude makes the same mistake twice.
- Pull in other files with `@path`, such as `See @README.md`.
- Run `/context` and look under Memory files to confirm the file loaded.
- Claude also keeps its own notes (auto memory) in `~/.claude/projects/<project>/memory/`; `/memory` shows and toggles them.

An example for a data-analysis folder:

```markdown
# Passive sensing analysis

## Setup
- Python is managed with uv. Run scripts with `uv run <script>.py`.
- Raw data lives in `data/raw/` and is read-only.
- Outputs go in `outputs/`, one subfolder per analysis date.

## Conventions
- pandas for tables, matplotlib for figures. Save figures as PNG and PDF.
- British spelling in comments and figure labels.
- Every script prints the input files and row counts it used.

## Checks
- Run a changed script on `data/sample/` before running it on the full data.
```

CLAUDE.md is a request. A deny rule (below) is stronger: it stops Claude's own file tools, and shell commands Claude Code recognises such as `>` redirection and `tee`, from changing `data/raw/`. Per Anthropic's permissions page it does not cover a script that opens files itself, such as a Python file Claude writes and runs. The sandbox that would block that runs on macOS, Linux and WSL2; on native Windows, Claude Code runs commands unsandboxed. For raw research data, also mark the files read-only in Windows and keep a copy outside the project folder:

```powershell
Get-ChildItem .\data\raw -Recurse -File | ForEach-Object { $_.IsReadOnly = $true }
```

### Permission modes

| Mode | Runs without asking | Use it for |
| --- | --- | --- |
| `default` (shown as Manual) | Reads only | Learning, sensitive work |
| `acceptEdits` | Reads, file edits, common file commands (mkdir, mv, cp) inside the folder | Iterating when you will review changes afterwards |
| `plan` | Reads; edits blocked until you approve a plan | Anything large or unfamiliar |
| `auto` | Everything, with a second model reviewing each risky action | Long tasks you trust the direction of |
| `dontAsk` | Only pre-approved tools; everything else denied | Scripts and automation |
| `bypassPermissions` | Everything, no checks | Disposable containers only |

Facts from Anthropic's permission-modes page:

- Claude Code v2.1.283 and later start interactive sessions in auto mode by default.
- Shift + Tab cycles auto, Manual, acceptEdits and plan. The status bar shows the active mode.
- Auto mode blocks some actions by default, including downloading and running code (`curl | bash`), force-pushing, and mass deletion. The docs warn it reduces prompts but does not guarantee safety.
- Deny rules block in every mode, including bypassPermissions.

While learning, start sessions with `claude --permission-mode manual`, so every edit and command comes to you first.

### Plan mode

1. Press Shift + Tab until the status bar shows plan mode, or type `/plan <task>`.
2. Claude reads files, explores, and writes a plan without changing anything.
3. Choose "Yes, and use auto mode", "Yes, manually approve edits", or "No, keep planning" and say what to change. Ctrl + G opens the plan in your editor to edit it directly.

Planning first is a useful habit for anything larger than a one-file change: mistakes are cheap to fix in a plan and expensive in twenty edited files.

### Settings files and permission rules

| Scope | File | Affects |
| --- | --- | --- |
| User | `~/.claude/settings.json` | You, every project on this computer |
| Shared project | `.claude/settings.json` | Everyone in the project |
| Project local | `.claude/settings.local.json` | You, this project only |
| Managed | Set by an organisation | Everyone it is deployed to |

When the same key is set in several places, the higher one wins: managed, then command-line flags, then project local, then shared project, then user. List keys such as permission rules merge across files instead of replacing each other. Claude Code reloads most settings edits without a restart, and `/status` shows which files loaded.

An example `~/.claude/settings.json`; the `$schema` line gives autocomplete and error checking in VS Code:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

Each rule names a tool and what it may touch: `Bash(...)` for shell commands, `Read(...)` and `Edit(...)` for file paths. Choosing "Yes, and don't ask again" on a command prompt saves an allow rule to `.claude/settings.local.json`; for file edits, the approval lasts until the session ends.

### Best practices for CLAUDE.md and settings

From Anthropic's memory, best-practices and permissions pages:

- For every line, ask "would removing this cause Claude to make mistakes?" Keep commands Claude cannot guess, non-default style rules and known gotchas; leave out anything Claude can read from the files themselves.
- `@path` imports organise a file without saving context: imported files load at launch too. For instructions that only matter for some files, use `.claude/rules/<topic>.md` with a `paths:` list of glob patterns in its frontmatter, which loads when Claude reads, writes or edits a matching file.
- Block-level HTML comments (`<!-- ... -->`) in CLAUDE.md are stripped before it loads into context, so notes to yourself cost nothing; comments inside code blocks are kept.
- Auto memory loads the first 200 lines or 25 KB of its `MEMORY.md` each session; check it now and then with `/memory`.
- Permission rules are checked deny first, then ask, then allow. In rules, Windows paths are written POSIX-style: `C:\Users\<you>` becomes `/c/Users/<you>`, so a rule for every `.env` on drive C is `Read(//c/**/.env)`.
- To make Manual mode your default instead of auto, set `"permissions": { "defaultMode": "default" }` in `~/.claude/settings.json`.

### Exercise 14: a guarded practice project

```powershell
mkdir ~\claude-practice\analysis
cd ~\claude-practice\analysis
mkdir data\raw
Set-Content data\raw\scores.csv "id,score`n1,12`n2,15`n3,9"
mkdir .claude
code .claude\settings.json
```

Paste this into `settings.json` and save:

```json
{
  "permissions": {
    "deny": ["Edit(./data/raw/**)"]
  }
}
```

Then:

```powershell
claude --permission-mode acceptEdits
```

1. Ask: `add a row with id 4 and score 20 to data/raw/scores.csv`. Expected: the edit is refused because of the deny rule, even though acceptEdits would normally allow file edits.
2. Ask: `write mean.py that prints the mean score from data/raw/scores.csv, then run it with uv`. Expected: Claude creates `mean.py` without asking (acceptEdits), asks before running the command, and prints `12.0`.
3. Run `/init`. Expected: a starter `CLAUDE.md` describing the folder. Open it and add the read-only rule from the example above.
4. Run `/context` and confirm CLAUDE.md appears under Memory files.

## 11. MCP in depth

MCP (Model Context Protocol) is an open standard that lets any AI client use any tool server. In Claude Code you add a server with one `claude mcp add` command, and a working server of your own takes about 20 lines of Python.

### The shape of it

- Client: the AI app. Claude Code, the Claude desktop app and claude.ai are all MCP clients.
- Server: a separate program that offers capabilities to clients. Per modelcontextprotocol.io, a server can offer three kinds:
  - Tools: functions the model can call, such as "search issues" or "create design".
  - Resources: file-like data you can pull in; in Claude Code you reference them with `@server:protocol://path`.
  - Prompts: ready-made templates, which show up in Claude Code as `/` commands.
- Transport: how client and server talk.
  - stdio: the server runs on your computer as a child process; messages travel through its standard input and output.
  - HTTP: the server runs somewhere on the internet; Anthropic's docs call this the recommended option for remote servers.
  - SSE: older remote transport, marked deprecated.
- Messages: JSON-RPC objects like the one in section 5.

### Adding servers to Claude Code

Remote (HTTP) server, then sign in from inside a session:

```powershell
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

Local (stdio) server. Everything after `--` is the command that starts the server; everything before it is for Claude Code:

```powershell
claude mcp add <name> -- <command> [args...]
claude mcp add --env API_KEY=<key> --transport stdio <name> -- npx -y <package>
```

Anthropic's MCP page notes two traps: without `--`, Claude Code tries to read the server's own flags as its options; and `--env` must not sit directly before the server name, or the name is read as another variable.

| Scope (`--scope`) | Stored in | Loads in | Shared |
| --- | --- | --- | --- |
| `local` (default) | `~/.claude.json`, under this project | This project only | No |
| `project` | `.mcp.json` in the project folder | This project | Yes, if committed; Claude Code asks you to approve these |
| `user` | `~/.claude.json` | All your projects | No |

Managing servers:

```powershell
claude mcp list
claude mcp get <name>
claude mcp remove <name>
claude mcp login <name>
```

Inside a session, `/mcp` shows each server's status, tool count and sign-in state.

Facts worth knowing, from the same page:

- If you sign in to Claude Code with your claude.ai account, your claude.ai connectors (your Google Drive and Canva) appear in Claude Code automatically, marked as coming from claude.ai. They do not appear when an API key is active instead.
- Tool search is on by default: only tool names load at the start, and full definitions load when Claude needs them, so extra servers cost little context.
- Claude Code warns when a tool's output passes 10,000 tokens and caps it at 25,000 by default (`MAX_MCP_OUTPUT_TOKENS` changes the cap).

### Exercise 15: add a ready-made server

The MCP project's reference filesystem server gives Claude file tools scoped to one folder. Claude Code already has file tools, so this is purely practice.

```powershell
cd ~\claude-practice
claude mcp add files -- npx -y @modelcontextprotocol/server-filesystem "$HOME\claude-practice"
claude mcp list
```

Expected: an `Added ...` line, then `files` in the list with a status such as Connected. Start `claude`, ask "using the files server, list what is in claude-practice", and the reply shows a tool call from that server. Remove it afterwards with `claude mcp remove files`.

If it shows "Failed to connect", run `claude mcp get files` and read its Issue line, then run the `npx` command on its own to see its error. Anthropic's MCP quickstart says `claude mcp add` works the same in PowerShell and Command Prompt. A slow first `npx` download can time out: start Claude Code with `$env:MCP_TIMEOUT = "60000"; claude` to allow 60 seconds. Older community guides suggest wrapping `npx` as `cmd /c npx ...`; the current docs do not, so keep that as a last resort.

### Exercise 16: inspect a server without any AI

The MCP Inspector is the reference testing tool. It needs Node 22.19.0 or newer, per its docs.

```powershell
npx -y @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-filesystem "$HOME\claude-practice"
```

Expected: a URL with a one-time token is printed. Open it in a browser, connect, open the Tools tab, pick a tool, fill in its arguments and run it. You see the raw request and response, which is what Claude sees when it calls the tool. `--cli` instead of the web UI gives a scriptable version.

### Exercise 17: build your own server in Python

This follows the official Python quickstart, which uses MCP Python SDK 2.x and Python 3.10 or newer.

```powershell
cd ~\claude-practice
uv init study-tools
cd study-tools
uv add "mcp[cli]"
code server.py
```

Paste into `server.py`:

```python
import logging

from mcp.server import MCPServer

logger = logging.getLogger(__name__)
mcp = MCPServer("study-tools")


@mcp.tool()
def word_count(text: str) -> int:
    """Count the words in a piece of text."""
    return len(text.split())


@mcp.tool()
def reading_time(text: str, words_per_minute: int = 200) -> str:
    """Estimate how long a text takes to read at a given speed."""
    minutes = len(text.split()) / words_per_minute
    logger.info("reading_time called")
    return f"{minutes:.1f} minutes at {words_per_minute} words per minute"


if __name__ == "__main__":
    mcp.run(transport="stdio")
```

How it works: the SDK reads each function's type hints and docstring and turns them into a tool definition, so the docstring is what Claude reads when deciding whether to call it. The quickstart's one hard rule for stdio servers: never `print()`, because anything written to standard output corrupts the JSON-RPC messages. Use `logging`, which writes to standard error.

Test it in the Inspector first:

```powershell
npx -y @modelcontextprotocol/inspector uv --directory "$PWD" run server.py
```

Expected: the Tools tab lists `word_count` and `reading_time`. Run `word_count` with `the quick brown fox` and get `4`.

Then give it to Claude Code for all your projects:

```powershell
claude mcp add --scope user study-tools -- uv --directory "$HOME\claude-practice\study-tools" run server.py
```

Start `claude`, run `/mcp` to confirm study-tools is connected with 2 tools, and ask: "use study-tools to estimate reading time for this paragraph: \<paste a paragraph>". Expected: a call to the reading\_time tool and its answer.

To use the same server in the Claude desktop app's chat, open `code $env:AppData\Claude\claude_desktop_config.json` and add it under `mcpServers` in the shape the quickstart shows, with an absolute path and doubled backslashes, then fully quit the app from the system tray and reopen it:

```json
{
  "mcpServers": {
    "study-tools": {
      "command": "uv",
      "args": ["--directory", "C:\\Users\\<you>\\claude-practice\\study-tools", "run", "server.py"]
    }
  }
}
```

If the file already has content, add `mcpServers` alongside the existing keys. If the app then lists the server as failed, replace `uv` with the full path that `(Get-Command uv).Source` prints in PowerShell, with the backslashes doubled. (The quickstart says `where uv`, which in PowerShell runs a different command.)

### Best practices for MCP servers you build

From the MCP specification, its security page and Anthropic's connector review criteria:

- Tool names: 1 to 128 characters of letters, digits, `_`, `-` and `.`; Anthropic's directory caps them at 64.
- Descriptions say exactly what the tool does and when to call it. Keep reading tools separate from tools that change things, and mark them with `readOnlyHint` or `destructiveHint` annotations.
- When a call fails, return an error result (`isError: true`) whose message tells the model what to fix, such as "date must be YYYY-MM-DD", rather than a bare "Internal error".
- Validate every input, and request the narrowest scopes and tokens that work; servers must not accept tokens that were not issued for them.
- Prefer stdio for servers that only run on your computer, and log to standard error, never standard output.

### Safety

- A stdio server runs on your computer with your user permissions. Install only servers whose source you trust.
- Anthropic's docs warn that servers fetching outside content expose you to prompt injection: hidden instructions in what a tool returns.
- Prefer read-only database users and narrowly scoped tokens when a server asks for credentials.

## 12. Subagents

A subagent is a separate Claude with its own clean context window. It does a side task and hands back only a summary, so the main conversation stays uncluttered. Claude Code ships with several; you can define your own as Markdown files.

### When a subagent is worth it

Anthropic's subagents page gives the test:

- Use one when a side task would flood the conversation with search results, logs or file contents you will not look at again.
- Use one to restrict tools: a reviewer that cannot edit, a researcher that cannot run commands.
- Use one to run independent investigations in parallel.
- Stay in the main conversation for quick changes, back-and-forth refinement, and work where each step depends on the last.

Subagents send their own requests, which count towards the same usage limits as your main conversation.

### Built-in subagents

| Name | What it does | Tools |
| --- | --- | --- |
| Explore | Fast searching and reading of a codebase; skips CLAUDE.md to stay cheap | Read-only |
| Plan | Research during plan mode | Read-only |
| general-purpose | Multi-step tasks needing both reading and changing things | All tools available to subagents |
| claude | Catch-all when nothing more specific fits | All tools available to subagents |
| claude-code-guide | Answers questions about Claude Code itself (runs on Haiku) | Not listed in the docs |
| statusline-setup | Used by `/statusline` | Not listed in the docs |

Claude picks these on its own. You will see them in the transcript as a row such as `Explore(Find where scores are loaded)`.

### Defining your own

A custom subagent is a Markdown file: YAML frontmatter, then the subagent's own system prompt.

| Location | Scope |
| --- | --- |
| `.claude/agents/<name>.md` | This project; commit it to share |
| `~/.claude/agents/<name>.md` | All your projects |
| A plugin's `agents/` folder | Wherever the plugin is enabled |

Only `name` and `description` are required. The fields you will use most:

| Field | Purpose |
| --- | --- |
| `name` | Identifier; lowercase and hyphens; no colons |
| `description` | When Claude should delegate to it. Claude decides by matching this text |
| `tools` | Allowlist, such as `Read, Grep, Glob`. Omit to inherit everything |
| `disallowedTools` | Denylist, such as `Write, Edit` |
| `model` | `sonnet`, `opus`, `haiku`, a full model ID, or `inherit` |
| `permissionMode` | Permission mode for this subagent |
| `skills` | Skills preloaded in full at startup |
| `memory` | `user`, `project` or `local`: a folder of notes that persists across sessions |
| `isolation` | `worktree` gives it a separate copy of the repository |
| `maxTurns` | Cap on how many steps it takes |

A subagent receives only its own prompt plus basic environment details, not the main Claude Code system prompt, and not your conversation history. Everything it needs has to be in its file or in the task Claude hands it.

### Worked example: a citation checker

For paper drafts: a read-only subagent that checks each in-text citation against the source files in a `sources/` folder.

```markdown
---
name: citation-checker
description: Checks that each citation in a paper draft is supported by the cited source file. Use after editing a draft or when asked to verify references.
tools: Read, Grep, Glob
model: sonnet
---

You check citations in academic drafts against the PDFs and notes in the sources/ folder.

For each in-text citation in the draft:
1. Find the matching source file in sources/. If none exists, report "No source file".
2. Find the passage that supports the claim. Quote at most one sentence.
3. Give a verdict: Supported, Partly supported, or Not found.

Return one table: claim (shortened), citation, verdict, location in the source.
Never edit files. British spelling.
```

Because `tools` lists only Read, Grep and Glob, it cannot change your draft even if asked.

### Exercise 18: create and use it

1. In PowerShell, run `mkdir $HOME\.claude\agents -Force`, then `code "$HOME\.claude\agents\citation-checker.md"`, paste the example and save. Alternatively, ask Claude in a session to "create a personal citation-checker subagent in \~/.claude/agents/" with the description above; the docs show Claude writing the file for you.
2. Make a test folder with a short `draft.md` containing two or three citations and a `sources/` folder holding the matching files.
3. Start `claude` in that folder and type: `Use the citation-checker subagent on draft.md`.
4. Expected: a transcript row reading `citation-checker(...)`, then a table of verdicts in the main conversation, without the source text cluttering it.

If Claude does not see the new subagent and the `agents` folder did not exist when the session started, restart Claude Code; the docs note a running session does not notice a newly created `agents` folder.

### Three ways to call one

- Natural language: "Use the citation-checker subagent to...". Claude usually delegates.
- @-mention: type `@` and pick it from the list, such as `@"citation-checker (agent)" check draft.md`. This guarantees that subagent runs.
- Whole session: `claude --agent citation-checker` runs the main conversation as that subagent, with its tools and model.

### Running, watching and stopping

- In interactive sessions, subagents run in the background by default. Permission prompts still reach you, labelled with the subagent's name.
- `/tasks` lists background work, including subagents; select one to read its transcript or stop it.
- Ctrl + B sends a running task to the background.
- `/subtask <task>` starts a fork: a subagent that inherits the whole conversation so far, useful when a fresh subagent would need too much explaining.
- `/agents` in current versions only prints a reminder to ask Claude or edit `.claude/agents/` directly.

### Best practices for subagents

- List the tools explicitly. Without a `tools` line a subagent inherits every tool, and leaving out `Agent` stops it starting subagents of its own.
- Make each subagent do one job, and write its description so the right requests match it; the docs suggest adding "use proactively" when you want Claude to delegate without being asked.
- A subagent starts without your conversation, so repeat any rule that matters in the task you give it.
- Commit project subagents in `.claude/agents/` to git, so they travel with the project.

### Keeping them cheap

- Short descriptions. Every subagent's description loads into context; Claude Code warns when their combined size passes 15,000 tokens.
- A cheaper model where judgement matters less: `model: haiku` for searching and listing.
- Ask for summaries back instead of raw output: "report only failing tests with their error messages".

## 13. Hooks

A hook is a command Claude Code runs automatically at a fixed moment: before a tool runs, after a file edit, when Claude needs you, when it finishes. Unlike CLAUDE.md or a skill, a hook does not depend on Claude remembering; it fires every time its event happens. Hooks exist only in Claude Code, not in claude.ai chat.

### Three layers

Every hook is written as event, then matcher, then handler, inside a `hooks` key in a settings file:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "<what to run>" }
        ]
      }
    ]
  }
}
```

1. Event (`PostToolUse`): the moment in the loop.
2. Matcher (`Edit|Write`): narrows which occurrences count; for tool events it matches the tool name. Omit it, or use `*`, to match everything.
3. Handler: what runs. Usually `"type": "command"`; other types send an HTTP request, call an MCP tool, or ask a model to decide (`"prompt"`, `"agent"`).

### The events worth knowing first

| Event | Fires | Can block? |
| --- | --- | --- |
| `SessionStart` | A session starts or resumes | No; can add context |
| `UserPromptSubmit` | You send a message, before Claude reads it | Yes |
| `PreToolUse` | Before any tool call | Yes |
| `PermissionRequest` | When Claude Code is about to ask you for permission | Can answer for you |
| `PostToolUse` | After a tool call succeeds | No; can feed text back to Claude |
| `Notification` | Claude is waiting for you | No |
| `Stop` | Claude finishes responding | Yes; can make it keep working |
| `PreCompact` | Before the conversation is compacted | Yes |
| `SessionEnd` | The session ends | No |

The full list in the hooks reference has more than 30 events.

### How a hook talks back

- Input: Claude Code sends the hook a JSON object on standard input, with fields such as `tool_name`, `tool_input` and `cwd` (the shape practised in Exercise 6).
- Exit code 0: no objection; normal permission rules still apply.
- Exit code 2: block. For `PreToolUse`, the tool call is cancelled and your standard-error text is shown to Claude as the reason.
- Any other exit code: a non-blocking error. The action goes ahead and the transcript shows a hook error notice.
- JSON on standard output: finer control, such as `"permissionDecision": "deny"` with a reason.

The reference's warning in plain terms: exit code 1, the usual "failure" code, does not block. A policy hook must exit 2 or print a deny decision.

### Hooks on Windows

- A hook written as a plain command string runs in Git Bash when Git for Windows is installed, otherwise in PowerShell. Add `"shell": "powershell"` to force PowerShell.
- The reference's Windows examples run scripts in exec form: `"command": "powershell.exe"` with an `args` list. No shell quoting is involved, so paths with spaces are safe.
- `${CLAUDE_PROJECT_DIR}` expands to the project root, so scripts can be referenced from any working directory.

### Exercise 19: get notified when Claude needs you

This is the Windows example from Anthropic's hooks guide. Open your user settings:

```powershell
code $env:USERPROFILE\.claude\settings.json
```

Add a `hooks` key. If the file already has other keys, add it alongside them with a comma, keeping the whole file one JSON object:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude Code needs your attention', 'Claude Code')\""
          }
        ]
      }
    ]
  }
}
```

Test it: run `/hooks` in a session and check the hook is listed under Notification. Start `claude --permission-mode manual`, ask for something that needs permission, and switch to another window. Expected: a dialog titled "Claude Code" after a few seconds; the guide notes it can open behind your terminal.

### Exercise 20: block recursive deletes

This is the reference's Windows example, added to the analysis project from Exercise 14. Create the script file:

```powershell
cd ~\claude-practice\analysis
mkdir .claude\hooks -Force
code .claude\hooks\block-rm.ps1
```

Paste this and save:

```powershell
# .claude/hooks/block-rm.ps1
$callInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
$command = $callInput.tool_input.command

if ($command -match 'rm -rf|Remove-Item.*-Recurse') {
  @{
    hookSpecificOutput = @{
      hookEventName = "PreToolUse"
      permissionDecision = "deny"
      permissionDecisionReason = "Destructive command blocked by hook"
    }
  } | ConvertTo-Json
} else {
  exit 0
}
```

Then open `.claude\settings.json` (`code .claude\settings.json`) and replace its contents with this merged version, which keeps Exercise 14's deny rule and adds the hook. A second `{ }` object pasted below the first would make the file invalid JSON.

```json
{
  "permissions": {
    "deny": ["Edit(./data/raw/**)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "powershell.exe",
            "args": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.ps1"]
          },
          {
            "type": "command",
            "if": "PowerShell(Remove-Item *)",
            "command": "powershell.exe",
            "args": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.ps1"]
          }
        ]
      }
    ]
  }
}
```

The `if` field narrows each handler further than the matcher: the script only starts for `rm` or `Remove-Item` commands, so ordinary commands pay no cost.

Test the script on its own before trusting it:

```powershell
'{"tool_name":"PowerShell","tool_input":{"command":"Remove-Item data -Recurse"}}' | powershell -NoProfile -ExecutionPolicy Bypass -File .claude\hooks\block-rm.ps1
```

Expected: a JSON object containing `"permissionDecision": "deny"`. Then run `mkdir junk`, start `claude` in this folder, and ask: `run rm -rf junk`. Expected: the command is blocked and Claude reports "Destructive command blocked by hook". The script's pattern catches `rm -rf` and `Remove-Item ... -Recurse`; a plain `rm -r` gets past it, so test any hook against the exact commands you want stopped.

Project hooks only run after you accept the workspace trust prompt for that folder, which Claude Code shows the first time you start a session there.

### Exercise 21 (needs Git for Windows): log every command

Open your user settings again (`code $HOME\.claude\settings.json`). Add a `PostToolUse` entry beside Exercise 19's `Notification` entry, so one `hooks` object holds both. The whole file then looks like this, plus any other keys you already had:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude Code needs your attention', 'Claude Code')\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "jq -r '.tool_input.command' >> ~/.claude/command-log.txt" }
        ]
      }
    ]
  }
}
```

Expected: every shell command Claude runs is appended to `command-log.txt` in your `.claude` folder; read it with `Get-Content $HOME\.claude\command-log.txt`. Useful for reviewing what an agent did after a long session.

### When a hook does not work

- `/hooks` shows nothing: check the JSON is valid (`jq . <file>`), with no trailing commas or comments, and that the file is in the right place.
- Hook error notices: run the script by hand with sample JSON piped in, as above, and check `$LASTEXITCODE`.
- Full detail: start with `claude --debug-file $env:TEMP\claude.log`, or run `/debug` mid-session, and read the log.
- Matchers are case-sensitive: `bash` does not match `Bash`.
- `"disableAllHooks": true` in settings turns every non-managed hook off without deleting them.

### Best practices for hooks

- Use a hook for anything that must happen every time; Anthropic's best-practices page calls CLAUDE.md advisory and hooks deterministic.
- A `PreToolUse` deny blocks the tool even in bypassPermissions mode, and a hook's "allow" never loosens a deny rule.
- Keep matchers narrow; a `.*` matcher on `PermissionRequest` that approves would approve everything.
- On Windows, set `"shell": "powershell"` for PowerShell scripts, and test each one by piping sample JSON into it before relying on it.

### Safety

Hooks run arbitrary commands with your permissions, every time. Read the hooks in any repository you clone before running Claude Code there (the permissions page notes that a repository's hooks run even under `claude -p` or when you only trusted a parent folder), and the hooks inside any plugin before installing it. For coursework in claude.ai you will not need hooks; they become useful once Claude Code is editing real code or data.

## 14. Plugins and marketplaces

A plugin is a package that installs several add-ons at once: skills, commands, subagents, hooks and MCP servers. A marketplace is a catalogue you install plugins from. You already have about ten plugins on your claude.ai account; this section covers what they do, how to trim them, and how to build one.

### What a plugin can contain, and where each part works

Per Anthropic's plugin platform-support page:

| Component | What it adds | Chat (claude.ai) | Cowork | Claude Code |
| --- | --- | --- | --- | --- |
| Skills | Instructions loaded when a task matches | Yes | Yes | Yes |
| Commands | Named actions run as `/plugin-name:command` | Loads as a skill | Yes | Yes |
| MCP connectors | Access to an outside app or data source | Yes | Yes | Yes |
| Agents (subagents) | Specialists Claude can delegate to | No | Yes | Yes |
| Hooks | Commands run automatically on events | No | Yes | Yes |

So a plugin does more in Claude Code than in a chat. In chat, only its skills, commands and connectors take effect.

Cowork, in this table, is the platform-support page's term for "Cowork tasks in the desktop app": longer, multi-step tasks the Claude desktop app runs on your files.

### Plugins in claude.ai

- Everything lives under Customize > Plugins.
- Discover lists plugins from Anthropic's marketplaces, the directory, and your organisation.
- Add > Add marketplace takes a Git repository such as `owner/repo`; Add > Upload plugin takes a `.zip` or `.plugin` file.
- Open a plugin to see its Skills, Connectors and other tabs. Turn it off with its "Disable plugin" toggle, or remove it from its menu.
- Adding a plugin does not connect its connectors for you; its Connectors tab shows each as Connected, Not connected or Not added.
- Plugins on your account also sync into Claude Code when you sign in there with the same account, listed as `<name>@synced`.
- Per the same page, Anthropic reviews plugins listed in its directory, but not plugins added from a marketplace URL or uploaded by hand.

### Trimming what you have

The skills visible in this chat include plugin skills from: Figma, Canva, Data, Design, Product Management, Productivity, PDF Viewer, Desktop Commander, Superpowers, and a plugin-management plugin, alongside your own quiz and thought-journal skills. Every enabled skill's name and description loads into each conversation, and Anthropic's docs note that overlapping or excessive descriptions make Claude pick the wrong skill.

A suggested review, based on the coursework, research and design work you have described; keep what you actually use:

| Plugin | Built for | Suggestion |
| --- | --- | --- |
| Canva, Figma, Design | Design work | Keep if you use them for UX coursework or your website |
| PDF Viewer | Reading and annotating PDFs | Keep; your quiz skills read PDF chapters |
| Data | Analysis, charts, SQL | Keep if you do data work in chat; otherwise disable until you need it |
| Superpowers | Software development workflow: test-driven development, git worktrees, code review | Turn off for everyday coursework, since its using-superpowers skill tells Claude to check for skills before every response; turn on when you want a structured review of code or a document, as used for this guide's review |
| Product Management, Productivity, plugin management | Product teams; plugin setup | Disable unless you use them |
| Desktop Commander | Terminal access on your computer | Disable unless you are using it for a specific task |

Disabling is reversible: the toggle brings a plugin back unchanged.

In Claude Code, `/plugin` shows a "Not used recently" group on its Installed tab, and `claude plugin details <name>` prints an "Always-on" figure: the tokens a plugin adds to every session.

### Plugins in Claude Code

Anthropic's official marketplace, `claude-plugins-official`, is added automatically the first time you start an interactive session.

```text
/plugin
/plugin install <plugin>@claude-plugins-official
```

`/plugin` opens a panel with Discover, Installed, Marketplaces and Errors tabs. The install command opens the plugin's details, including a "Will install" list and, for official plugins, a context-cost estimate, then asks for a scope:

| Scope | Recorded in | Who gets it |
| --- | --- | --- |
| User | `~/.claude/settings.json` | You, every project |
| Project | `.claude/settings.json` | Everyone in the repository (each person still installs it once) |
| Local | `.claude/settings.local.json` | You, this repository only |

From PowerShell, without starting a session:

```powershell
claude plugin install <plugin>@<marketplace> --scope user
claude plugin list
claude plugin disable <plugin>@<marketplace>
claude plugin enable <plugin>@<marketplace>
claude plugin uninstall <plugin>@<marketplace>
claude plugin marketplace add <owner>/<repo>
```

Official-marketplace plugins update automatically; most other marketplaces do not unless you turn auto-update on in the Marketplaces tab.

### Exercise 22: install an official plugin

Anthropic's skills page uses skill-creator as its example, a plugin that helps write and test skills:

```text
/plugin install skill-creator@claude-plugins-official
```

Choose "Install for you (user scope)". Expected: an install summary ending in "Plugin is now active" or a reload note. Then ask: "evaluate my lecture-notes skill with skill-creator". It walks you through writing test prompts and compares results with and without the skill.

### Exercise 23: package your own study kit

Bundle the lecture-notes skill (section 8) and the citation-checker subagent (section 12) into one plugin.

```powershell
cd ~\claude-practice
mkdir study-kit\.claude-plugin
mkdir study-kit\skills\lecture-notes
mkdir study-kit\agents
Copy-Item ~\skills\lecture-notes\SKILL.md study-kit\skills\lecture-notes\
Copy-Item $env:USERPROFILE\.claude\agents\citation-checker.md study-kit\agents\
code study-kit\.claude-plugin\plugin.json
```

Paste into `plugin.json`, the manifest:

```json
{
  "name": "study-kit",
  "description": "Lecture notes and citation checking for coursework",
  "version": "1.0.0",
  "author": { "name": "<your name>" }
}
```

Then check and try it:

```powershell
claude plugin validate .\study-kit
claude --plugin-dir .\study-kit
```

Expected: `Validation passed`, then inside the session the skill appears as `/study-kit:lecture-notes` and the subagent as `study-kit:citation-checker`. Only `plugin.json` goes inside `.claude-plugin/`; the docs warn that components placed there do not load.

To use it in claude.ai, zip the `study-kit` folder with File Explorer as in Exercise 10, or with `tar.exe` as below, and upload it at Customize > Plugins > Add > Upload plugin:

```powershell
tar.exe -a -c -f study-kit.zip study-kit
```

In chat, the lecture-notes skill works and the citation-checker agent is skipped, per the component table above.

### Best practices for plugins

- Before installing, read the "Will install" list, and in the plugin's source look at `hooks/hooks.json`, `.mcp.json` and any `bin/` folder; permission rules and the sandbox do not cover a plugin's own hooks or servers.
- Try new plugins at local or user scope before adding them at project scope.
- Third-party marketplaces do not auto-update by default; turning it on means code you reviewed can change later.
- Check what a plugin costs every turn with `claude plugin details <name>`, and remove ones listed under "Not used recently".

### Safety

A plugin's hooks and MCP servers run on your computer as you. Read its "Will install" list before installing, prefer the official marketplace and Anthropic's directory, and install from other sources only when you trust whoever maintains them.

## 15. Automation and headless use

`claude -p` runs Claude Code once from a single command and exits, which turns it into an ordinary CLI you can put in scripts. Scheduled tasks re-run a prompt on a timer.

### One-shot runs

```powershell
cd ~\claude-practice
claude -p "List the files in this folder and say what each contains, one line each"
```

Expected: the answer prints and the command ends. Per Anthropic's headless page, it exits with code 0 on success and non-zero on failure, so `$LASTEXITCODE` works as in section 4. A `-p` run loads the same CLAUDE.md, skills, hooks and MCP servers an interactive session would.

The flags that matter for scripts:

| Flag | Effect |
| --- | --- |
| `--allowedTools "Read,Edit"` | Pre-approve listed tools; `Bash(git diff *)` pre-approves only commands starting `git diff` |
| `--permission-mode dontAsk` | Deny anything not pre-approved instead of waiting for an answer nobody will give |
| `--permission-mode acceptEdits` | Allow file edits and common file commands |
| `--output-format json` | Return JSON including `result`, `session_id` and `total_cost_usd` |
| `--output-format stream-json` | One JSON event per line as the run progresses |
| `--json-schema '<schema>'` | Force the answer into a given shape, returned in `structured_output` |
| `--continue`, `--resume <id>` | Carry on an earlier conversation |

The docs also describe `--bare`, which skips all local configuration for reproducible CI runs. It does not use your subscription login and needs an API key, so it is not for you yet.

### Exercise 24: pipe data in, get JSON out

```powershell
$r = Get-Content .\analysis\data\raw\scores.csv | claude -p "What is the highest score and which id has it?" --output-format json | Out-String | ConvertFrom-Json
$r.result
$r.total_cost_usd
```

Expected: the answer (id 2, score 15) and an estimated cost figure. The docs call that figure a client-side estimate that can differ from your bill. Piped input is capped at 10 MB.

Windows PowerShell 5.1 removes the double quotes inside a string passed to a program, which breaks `--json-schema` and similar flags. Tested: passing `'{"a": "b"}'` to a program in 5.1 arrived as `{a: b}`. Microsoft's about_Parsing page describes the behaviour, and says PowerShell 7.3 and later preserve the quotes. When a flag needs a JSON string, run the command in PowerShell 7 (`winget install --id Microsoft.PowerShell -e`, then open "PowerShell 7") or in Git Bash. Also note that in 5.1, `>` writes UTF-16 files, which tools expecting UTF-8, such as jq, may fail to read; `| Out-File -Encoding utf8 <file>` writes UTF-8 instead. Text captured from `claude` can come out garbled, because PowerShell decodes program output with the console's code page (IBM437 on a default US setup). Tested: a curly apostrophe captured that way became `ΓÇÖ`; after `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` the same text came through intact. Run that line at the start of any script that captures `claude` output.

### Exercise 25: batch-process lecture transcripts

This runs the lecture-notes skill (section 8) over every transcript in a folder, one fresh session each. The docs confirm that `/skill-name` inside a `-p` prompt expands the skill. Text after the skill name reaches it as its arguments; since the skill has no `$ARGUMENTS` placeholder, Claude Code appends it as an `ARGUMENTS:` line.

```powershell
cd ~\claude-practice
mkdir transcripts, notes -Force
# Copy one or two lecture transcripts (.txt) into transcripts first
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-ChildItem .\transcripts\*.txt | ForEach-Object {
  $out = ".\notes\$($_.BaseName)-notes.md"
  claude -p "/lecture-notes $($_.FullName)" --allowedTools "Read" | Out-File -Encoding utf8 $out
  Write-Host "Done: $out"
}
```

Expected: one `-notes.md` file per transcript. Each run counts towards your usage, so test on one file first. Check a few outputs against the transcripts before trusting the batch.

### Running things on a schedule

| Where | How | Runs while |
| --- | --- | --- |
| Inside a Claude Code session | `/loop 10m <prompt>` | That session stays open |
| Claude desktop app | Scheduled tasks in the Code tab (Anthropic's desktop scheduled-tasks page) | Your computer is on and the app is running |
| Anthropic's cloud | Routines, set up with `/schedule` | Always; runs on a fresh copy of a GitHub repository |
| This Claude app | Ask: "every Sunday at 6 pm, summarise what is due next week from my course Projects" | Runs in the cloud on the schedule; results arrive as a new chat |

A cloud routine cannot see files on your laptop, and, per the skills page, it does not read skills stored only in `~/.claude/skills/`. Put anything a scheduled cloud run needs into your claude.ai account or the repository.

### The Agent SDK, briefly

The same engine is available as Python and TypeScript packages (the Agent SDK) for building your own agent apps: a research assistant with your own tools, a bot for a lab Slack. Worth knowing it exists; not needed for anything in this guide.

### Agent-ready apps: three ways to drive one

This answers the question that started this guide. An app described as agent-ready, drivable "from a CLI, a JSON control channel or an MCP server", offers up to three doors into the same program. A web search for the blurb's exact wording on 7 October 2026 found no matching product, so the routine below is general and works for any app that offers these doors.

| Door | What it means | How it gets used | Background |
| --- | --- | --- | --- |
| CLI | A command you type, with subcommands and flags | You run it in PowerShell; Claude Code runs it through its shell tool | Section 4 |
| JSON control channel | The app accepts commands as JSON objects, on standard input, a local socket or a web address, and answers in JSON | A script, or Claude, sends one object and reads the reply | Section 5 |
| MCP server | The app lists its actions as MCP tools | `claude mcp add` in Claude Code, or a connector in claude.ai; Claude calls the tools by name | Section 11 |

A routine for getting to know any such app, safest steps first:

1. Read its docs for the three doors. Search them for "CLI", "JSON", "API" or "RPC", and "MCP".
2. CLI: run `<app> --help`, then `<app> <subcommand> --help`. Look for a flag such as `--json` that makes it print JSON; scripts and agents read JSON more reliably than tables.
3. JSON channel: send one read-only command by hand and read the reply. For a web address, PowerShell's `Invoke-RestMethod -Method Post -Uri <address> -ContentType 'application/json' -Body '<json>'` does this; the address and command names come from the app's docs.
4. MCP: open the server in the MCP Inspector (Exercise 16) before giving it to Claude, so you see every tool it offers and what each one takes.
5. Before Claude drives it, add deny rules (section 10) or Needs approval settings (Exercise 9) for anything that deletes, sends or publishes.
6. Start with a read-only task in Manual mode and watch the tool calls.

Claude Code is itself an agent-ready app, so you can practise on it:

- CLI: `claude -p "<task>"` (this section).
- JSON: `--output-format json` returns one JSON object (Exercise 24); `--output-format stream-json --verbose` prints one JSON event per line as the run progresses, per the headless page.
- MCP server: `claude mcp serve` runs Claude Code as a stdio MCP server that offers its own tools, such as reading and editing files, to another MCP client like the Claude desktop app. Per Anthropic's MCP page it prints nothing when it starts, and the client is responsible for asking you to confirm each tool call.

Desktop Commander, one of your plugins, is another example of the MCP door: an MCP server that gives Claude a terminal and file tools on your computer.

An app with none of the three doors can still be driven through its screen. Claude in Chrome operates websites, and computer use operates desktop apps, by clicking and typing the way you would. Both are slower and less predictable than a CLI or MCP server, so they suit apps with no other way in.

## 16. Workflow playbook

Pick the tool by where the inputs live and what has to happen to them. Most of your work belongs in claude.ai Projects with skills; Claude Code takes over once code or data files on your laptop are involved.

### The decision rules

1. Inputs you can upload, output is text, a doc or a deck: claude.ai, inside the right Project.
2. Inputs are files on your laptop and something has to run on them: Claude Code in that folder.
3. You keep copying information out of another app: connect it (connector in claude.ai, MCP server in Claude Code).
4. You have explained the same procedure three times: write a skill.
5. A side job would flood the conversation: a subagent.
6. A rule must hold every single time: a hook or a deny rule, plus read-only files where a script could get round them; never only an instruction.
7. The same job recurs on a timetable: a scheduled task.

### Recipe 1: quizzes and thought journals

- One Project per course, holding the syllabus, assigned chapters and lecture transcripts, with the instructions from Exercise 7.
- Your existing quiz and journal skills run inside those Projects. Give each skill a distinct trigger phrase in its description, as text-quiz and homework-quiz already do.
- For a study guide you will reread, ask for it as a doc; for a one-off check, keep it in chat.
- Use incognito chat for anything you do not want feeding into memory.

### Recipe 2: lectures to notes

- Single lecture: upload the transcript to the course Project and say "make notes from this lecture"; the lecture-notes skill (section 8) shapes the output.
- A term's worth at once: Exercise 25's batch script in Claude Code.

### Recipe 3: reading and writing a paper

- A Project for the paper: upload the sources, and put your citation style and spelling rules in its instructions.
- Ask for claims with page references, then spot-check a few against the PDFs. Retrieval can miss passages and Claude can misattribute.
- Draft in a doc so you can edit in place and comment.
- Before submitting, run the citation-checker subagent (section 12) in Claude Code over the draft and a `sources/` folder.

### Recipe 4: research data analysis

- Work in Claude Code in the analysis folder, never by pasting data into chat.
- Set up once: a CLAUDE.md like the section 10 example; a deny rule on `Edit(./data/raw/**)` and read-only raw files (section 10); Python through uv.
- For each analysis: start in plan mode, approve the plan, let Claude write the script, run it on a sample first, then the full data.
- Read the code it wrote as well as the numbers. Ask it to print row counts and input file names so silent filtering shows up.
- Before any data leaves your laptop: if the dataset came with a data use agreement, IRB conditions or lab rules, check what they allow. Claude Code sends the contents of files it reads to Anthropic's servers to process them.

### Recipe 5: UX design work

- Mockups and flows: ask for a design in claude.ai, which opens as an editable artifact; or work through the Figma and Canva connectors when the file lives there.
- Critique: your Design plugin includes a design-critique skill; give it a screenshot or a Figma link.
- Research synthesis: the same plugin's research-synthesis skill takes interview notes or survey results.

### Recipe 6: your website

- Claude Code in the site's folder, with Git initialised so every change can be undone (`git init` once, then ask Claude to commit after each working change; Git basics are in section 4).
- Plan mode for anything touching more than one page.
- Ask Claude to open or preview the page after changes, then look at it yourself.

### Recipe 7: long tasks that finish

This recipe adapts a setup posted by @beamnxw on X on 6 October 2026 ("Make Opus 5.5 Finish Long Tasks"), checked against Anthropic's docs on 7 October; corrections to the post are listed at the end. The example is a sourced write-up, such as a literature summary for the HiTOP paper, in a folder holding `task.md` (the brief), `sources/`, `drafts/` and `final/`. The aim is a run that leaves files you can open, evidence you can check, and a note the next session can resume from.

1. Durable facts in CLAUDE.md, the task itself elsewhere:

```markdown
# Write-up project
- Reference material is in sources/; working files in drafts/; approved files in final/.
- British spelling. Plain prose, short paragraphs.
- Cite primary sources only, with the URL or page and the date checked.
- After each stage, update progress.md with decisions, open issues and the next action.
- When finishing, report the output paths and what was verified.
```

2. The repeated procedure as a skill, in `.claude/skills/write-draft/SKILL.md`, run as `/write-draft <topic>`:

```markdown
---
name: write-draft
description: Drafts a sourced write-up from the files in sources/ and checks every claim. Use when asked to draft or rewrite a write-up.
---
Topic: $ARGUMENTS

1. Read the relevant files in sources/.
2. Write an outline, then save the draft as drafts/draft.md.
3. Ask the evidence-reviewer subagent to check every factual claim against sources/.
4. Fix incorrect claims and mark unresolved ones with [CHECK].
5. Save the reviewer's table as drafts/checks.md.
6. Update progress.md, then report both paths and the verification results.
```

3. A deny rule so finished work stays put (merge into `.claude/settings.json`). As section 10 explains, this stops Claude's own file tools; mark finished files read-only too if a script might touch them.

```json
{
  "permissions": {
    "deny": ["Read(.env)", "Read(.env.*)", "Edit(final/**)"]
  }
}
```

Copy approved files into `final/` yourself.

4. A reviewer that can read and search but not edit, in `.claude/agents/evidence-reviewer.md`. The `effort` line gives it more reasoning than the main session (unless `CLAUDE_CODE_EFFORT_LEVEL` is set, which wins):

```markdown
---
name: evidence-reviewer
description: Checks factual claims in a draft against the cited sources. Use after drafting.
tools: Read, Grep, Glob, WebSearch, WebFetch
effort: high
---
Read the draft and the sources it cites. For each factual claim, return one table row:
claim, verdict (verified, incorrect, unresolved), source location, correction needed.
For unresolved claims, say what evidence is missing. Never edit files.
```

5. Start the session from the project folder and check the setup before the real run:

```powershell
cd <project folder>
claude --effort medium
```

Inside it, run `/context` to see what loaded, `/permissions` to see the effective rules, and type `@` to check that evidence-reviewer appears in the list. Medium is already the default effort for Opus 5.5. `/effort high` changes it mid-session and saves it as your default; press s in the `/effort` slider to apply a level to this session only.

6. State what "done" means with `/goal`. After each turn a separate small model checks the condition against what the conversation shows, so ask for evidence in the conversation:

```text
/goal Use /write-draft on the topic in task.md. Done when drafts/draft.md and drafts/checks.md exist, every incorrect claim is fixed, unresolved claims are marked [CHECK], and both paths plus the verification results are shown in the conversation. Stop after 12 turns and report the blocker if this is not met.
```

The turn limit is judged by that checker from the conversation, so treat it as a soft limit; `/goal clear` (or `/clear`) removes a goal.

7. Keep a handoff note, `progress.md`, updated after each stage:

```text
Task: <topic>
Outputs: drafts/draft.md, drafts/checks.md
Done: <finished stages and checks>
Decisions: <choices made, with their sources>
Open: <missing evidence or blockers>
Next: <one concrete next step>
```

To resume in a fresh session, ask: "Read progress.md, open the files it lists, continue from Next, and update the note."

Corrections and limits found when checking the post against the docs:

- `/agents` in current versions only prints a reminder; the @-list or asking Claude shows which subagents exist.
- Root CLAUDE.md is re-read after `/compact`, but path-scoped rules and nested CLAUDE.md files are summarised away until Claude reads a matching file again.
- A top-level `effortLevel` in user settings does not apply to Opus 5.5; the `CLAUDE_CODE_EFFORT_LEVEL` variable, `--effort`, `/effort` and per-model settings do.
- `/rewind` restores Claude's own file edits only; changes made by shell commands and by most subagents need git. Commit after each stage.
- The post's "60% fewer tokens" comes from one customer quoted in the Opus 5.5 announcement; Anthropic's own figure there is about 40% lower cost than Opus 5 on typical workloads at default settings. Measure your own runs with `/usage`.
- `/goal` needs a recent version of Claude Code (the docs give no minimum); run `claude update`, or switch from npm (section 9), if it is missing. It needs a trusted folder and is turned off by `"disableAllHooks": true`. A goal keeps your permission mode, so in Manual mode each turn still stops for approvals; press Shift + Tab to auto mode for an unattended run.

### General habits

- One task per chat or session. Long conversations crowd out early details; start fresh and let Project knowledge or CLAUDE.md carry what persists.
- Put stable facts where they load automatically (Project instructions, CLAUDE.md, profile preferences) instead of retyping them.
- Ask for a plan before large jobs; correcting a plan is cheap.
- Verify. Claude can be confidently wrong about citations, numbers and code. Check anything you will submit or rely on.
- When something keeps going wrong, change the setup instead of repeating the request: a clearer skill description, a CLAUDE.md line, a deny rule.
- Give Claude a check it can run: a test, an expected number, a screenshot to compare. Anthropic's best-practices page recommends this, and asks for Claude to show evidence rather than assert success.
- After correcting Claude twice on the same issue, `/clear` and start again with a better first prompt; the failed attempts are crowding the context.
- If you could describe the change in one sentence, skip plan mode; otherwise explore, plan, implement, then commit.
- For a second opinion, have a fresh session or a subagent review the work, and tell it to flag only gaps that affect correctness or the stated requirements.

## 17. Safety, privacy, cost and context hygiene

An agent acts with your permissions, so the main risks are things it does that you did not intend, data going somewhere it should not, and usage spent on context nobody needed. Each has a specific control.

### Risks and controls

| Risk | Control |
| --- | --- |
| Claude edits or deletes the wrong files | Manual or plan mode while learning; Git in every project; `/rewind` to roll back; deny rules and read-only files on folders that must not change |
| A command does damage | Read prompts before approving; a `PreToolUse` hook for patterns you never want (section 13). Anthropic warns auto mode reduces prompts but does not guarantee safety; in auto mode broad allow rules such as `Bash(*)` are ignored, it pauses after 3 blocked actions in a row or 20 in total, and limits you state ("don't push") count as boundaries until compaction drops the message that stated them; use a deny rule for anything that must hold |
| bypassPermissions runs anything | Only inside a disposable container or virtual machine, per Anthropic's permission-modes page |
| Hidden instructions in a web page, file or tool result (prompt injection) | Connect only trusted servers; turn off write tools for Research; treat surprising actions as a signal to stop and check |
| A plugin, hook or MCP server misbehaves | They run as you. Install from the official marketplace or Anthropic's directory; read hooks and "Will install" lists first |
| Secrets leak | Never paste passwords or API keys into chat; deny reads of `.env` files (section 10); use narrowly scoped tokens for MCP servers |
| Research data leaves where it is allowed to be | Check data use agreements, IRB conditions and lab rules before any file reaches an AI service |
| A chat feeds memory you did not want | Incognito chat; view and edit memory in Settings |

For Anthropic's data handling terms, read the Claude Code "Data usage" page and the claude.ai privacy settings rather than relying on summaries, including this one.

### What fills the context window

From Anthropic's "Extend Claude Code" page:

| Feature | Loads | Cost |
| --- | --- | --- |
| CLAUDE.md | Whole file, every session | Every request |
| Skills | Name and description every request; full text when used | Low until used |
| MCP servers | Tool names at start; full definitions when needed | Low until used |
| Subagents | Their own separate context | Isolated from your session |
| Hooks | Nothing, unless they return output | Zero |

The same page warns that too much loaded context also makes Claude worse: skills trigger wrongly and conventions get lost. Disable add-ons you do not use.

### Keeping usage down

- Start a new chat or `/clear` when the task changes.
- `/context` shows what is taking space; `/compact` summarises a long session.
- `/usage` in Claude Code breaks down what is driving your plan limits, including which skills, subagents, plugins and MCP servers.
- Disable plugins and connectors you are not using (section 14).
- Subagents and `-p` batch runs each count towards the same limits; test on one file before running on fifty.
- A cheaper model is fine for searching and listing: `/model` or a subagent's `model: haiku`.

### Checking the output

Check these before you submit or rely on the output:

- Citations: open the source and find the passage.
- Numbers: rerun the script or recompute by hand on a small sample.
- Code: read the diff (`/diff` or `git diff`), and run it.
- Claims about current facts: ask for the source link and open it.

## 18. Troubleshooting

Most failures come from five causes: a program not on PATH, invalid JSON, a file in the wrong folder, a session started before a change, or something switched off for that chat. Fixes below come from the Anthropic and tool documentation cited in section 21 unless marked otherwise.

### Diagnostic commands

| Command | Shows |
| --- | --- |
| `claude doctor` (terminal) | Install health, settings-file errors, update status |
| `/doctor` (in a session) | Setup checkup that offers fixes |
| `/status` | Version, account, model, which settings files loaded |
| `/context` | What is filling context, including which CLAUDE.md files loaded |
| `/mcp` | Each MCP server's status and tool count |
| `/hooks` | Every configured hook and where it came from |
| `/plugin`, Errors tab | Plugins that failed to load, and why |
| `claude --debug-file <path>` | Full log of hooks, MCP and skill loading |

### Symptoms and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `'claude' is not recognized` | Install folder not on PATH | PATH lines in section 9, then a new window |
| `'irm' is not recognized` | You are in CMD | Open PowerShell |
| `running scripts is disabled on this system` (npx) | PowerShell script policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (Microsoft's about_Execution_Policies page) |
| Claude Code cannot find Git Bash | Unusual Git install path | Set `CLAUDE_CODE_GIT_BASH_PATH` in the `env` block of settings, as in section 5's example |
| "Settings Error" dialog at startup | Invalid JSON in a settings file | `jq . <file>`; look for trailing commas and comments |
| A setting seems ignored | A higher-precedence file or flag sets it | `/status`, then `claude doctor` |
| Skill never triggers | Vague description, or YAML that fails to parse | Add the words requests use; invoke with `/name`; check that `/skills` lists it and that `---` is the file's first line |
| claude.ai rejects a skill upload: "Unexpected key(s)" | Claude Code-only frontmatter field | Keep to name, description, license, compatibility, metadata, allowed-tools |
| Uploaded skill never used in chat | Toggle off, or code execution off | Customize > Skills toggle; Settings > Capabilities |
| New subagent not found | `agents` folder created after the session started | Restart Claude Code |
| MCP server "Failed to connect" | Server command fails on its own | `claude mcp get <name>` for the Issue line; run the command by hand; `$env:MCP_TIMEOUT = "60000"` for slow first downloads |
| MCP server "Pending approval" | Project `.mcp.json` server not yet approved | Run `claude` interactively in that folder and approve it |
| MCP output cut short with a warning | Over the 25,000-token default | Raise `MAX_MCP_OUTPUT_TOKENS`, or ask for less output |
| MCP Inspector will not start | Node older than 22.19.0 | `winget upgrade --id OpenJS.NodeJS.LTS` (ID tested) or install a newer Node |
| Connector unavailable in a chat | Toggled off for that chat, or signed out | "+" > Connectors in the chat; reconnect in Customize > Connectors |
| Custom connector times out | Server not reachable from the public internet | Host it publicly, or use a local MCP server instead |
| Desktop app ignores a config change | App still running in the tray | Quit from the system tray, then reopen |
| Hook never fires | Wrong event, matcher case, or untrusted folder | `/hooks`; matchers are case-sensitive; accept the trust prompt |
| Hook shows an error notice | Script exits non-zero or cannot start | Pipe sample JSON into it by hand and check `$LASTEXITCODE` |
| Hook JSON has no effect | Extra text before the JSON, or a field at the wrong level | Make the script print only JSON; check field nesting in the hooks reference |
| Plugin installed but its skills are missing | Not reloaded, or `skills/` inside `.claude-plugin/` | `/reload-plugins`; check the Errors tab; move `skills/` to the plugin root |
| Auto mode blocks routine work | Classifier lacks context | `/permissions` > Recently denied, press `r` to retry with approval; or use Manual mode for that task |
| Claude stops following earlier instructions | Long session compacted them away | Start fresh; move lasting instructions into CLAUDE.md or Project instructions |
| Answers slow down or lose track | Context nearly full | `/compact`, `/clear`, or a new chat |

## 19. Four-week learning plan

This plan takes you from the claude.ai features you already use to a guarded Claude Code project with your own skill, subagent, hook and MCP server. Each week ends with a check you can verify.

### Week 1: tighten what you already use (claude.ai, no terminal)

- [ ] Exercise 7: instructions and well-named files in each course Project
- [ ] Exercises 8 and 9: use the Drive connector on purpose; set write tools to Needs approval
- [ ] Section 14: disable the plugins you do not use
- [ ] Exercise 10: upload the lecture-notes skill and test it on a real transcript
- [ ] Check: a new chat in each course Project names the file and page it answers from

### Week 2: terminal and install

- [ ] Exercises 1 to 3: PowerShell basics, practice folder, Python through uv
- [ ] Install Git, Node.js, uv, jq and VS Code with winget, and confirm each version
- [ ] Exercises 4 to 6: JSON and jq
- [ ] Git: the throwaway-folder test in section 4
- [ ] Exercises 12 and 13: install Claude Code and run a first session in Manual mode
- [ ] Check: `claude --version` and `claude doctor` both run cleanly

### Week 3: Claude Code core

- [ ] Exercise 14: the guarded analysis project (CLAUDE.md plus a deny rule)
- [ ] Exercise 11: the lecture-notes skill locally, visible in `/skills`
- [ ] Exercise 18: the citation-checker subagent on a test draft
- [ ] Exercises 19 and 20: notification hook and the recursive-delete block
- [ ] Use plan mode for one real change, and `/rewind` once to see how undo works
- [ ] Check: Claude refuses to edit `data/raw/` and the hook blocks a recursive delete

### Week 4: connect and automate

- [ ] Exercises 15 and 16: add a ready-made MCP server and inspect it
- [ ] Exercise 17: build and register the study-tools server
- [ ] Exercises 22 and 23: install skill-creator; package the study kit
- [ ] Exercises 24 and 25: one-shot JSON run, then the batch notes script on two files
- [ ] Apply Recipe 4 or Recipe 6 from section 16 to a real project
- [ ] Run the agent-ready routine at the end of section 15 on one app you use
- [ ] Set up Recipe 7 for one real write-up and resume it once from progress.md
- [ ] Check: `/mcp` shows study-tools connected and the batch script produced readable notes

### Further learning from Anthropic

- `/powerup` inside Claude Code runs short interactive lessons with demos, per the commands reference.
- Claude Code 101 and other free courses at academy.claude.com, linked from the quickstart.
- The Claude Code docs index at code.claude.com/docs; most pages used in this guide are listed in section 21.

## 20. Quick reference

The terms, file locations and commands from this guide on one page.

### Glossary

| Term | Meaning | Section |
| --- | --- | --- |
| Agent | Model plus tools plus a loop of act, observe, decide | 2 |
| Agent-ready app | An app that can be driven by a CLI, a JSON channel or an MCP server | 15 |
| Artifact | A page Claude publishes to your claude.ai gallery, private until shared | 6 |
| Auto memory | Notes Claude Code writes itself, per project | 10 |
| Auto mode | Permission mode where a second model reviews risky actions | 10 |
| CLAUDE.md | Standing instructions file Claude Code reads every session | 10 |
| CLI | A program controlled by typed commands | 4 |
| Compaction | Summarising older conversation to free context | 2 |
| Connector | claude.ai's name for an MCP server it connects to for you | 7 |
| Context window | Everything the model can see on one turn | 2 |
| Deny rule | Settings entry that blocks a tool or path in every mode | 10 |
| Environment (surface) | Where the agent runs and what it can touch | 3 |
| Exit code | Number a program returns: 0 success; 2 blocks in hooks | 4, 13 |
| Fork | Subagent that inherits the whole conversation | 12 |
| Git | Version history for a folder; each saved snapshot is a commit | 4 |
| Frontmatter | YAML settings block between `---` lines at the top of a file | 5, 8 |
| Headless (`-p`) | Running Claude Code once from a command, no session | 15 |
| Hook | Command run automatically at a lifecycle event | 13 |
| JSON | Text format for configs and messages | 5 |
| Marketplace | Catalogue of plugins | 14 |
| MCP | Open standard connecting AI clients to tool servers | 11 |
| MCP Inspector | Tool for testing an MCP server without AI | 11 |
| Model | The language model itself | 2 |
| PATH | List of folders Windows searches for programs | 4 |
| Permission mode | How much Claude may do without asking | 10 |
| Plan mode | Claude researches and proposes before changing anything | 10 |
| Plugin | Package of skills, subagents, hooks and MCP servers | 14 |
| Project (claude.ai) | Workspace with its own files and instructions | 6 |
| Prompt injection | Hidden instructions in content an agent reads | 17 |
| Research | claude.ai mode that runs many searches and tool calls before answering | 7 |
| Scope | Who a setting, server or plugin applies to: user, project, local | 10, 11, 14 |
| Skill | Folder with a SKILL.md of instructions for a repeated task | 8 |
| Slash command | `/name` typed to run a command or skill | 10 |
| stdio / HTTP transport | Local process versus remote server for MCP | 11 |
| Subagent | Separate Claude with its own context that returns a summary | 12 |
| Token | Unit the model counts text in (about 3 to 4 characters of English, depending on the model) | 2 |
| Tool | One named action the model can request | 2 |

### File locations on Windows

Type these into File Explorer's address bar. In PowerShell, write `$HOME` in place of `%USERPROFILE%` and `$env:APPDATA` in place of `%APPDATA%`.

| What | Where |
| --- | --- |
| User settings | `%USERPROFILE%\.claude\settings.json` |
| Project settings (shared, local) | `<project>\.claude\settings.json`, `<project>\.claude\settings.local.json` |
| User CLAUDE.md | `%USERPROFILE%\.claude\CLAUDE.md` |
| Project CLAUDE.md | `<project>\CLAUDE.md` or `<project>\.claude\CLAUDE.md` |
| Personal skills | `%USERPROFILE%\.claude\skills\<name>\SKILL.md` |
| Project skills | `<project>\.claude\skills\<name>\SKILL.md` |
| Personal subagents | `%USERPROFILE%\.claude\agents\<name>.md` |
| Project subagents | `<project>\.claude\agents\<name>.md` |
| MCP servers, local and user scope | `%USERPROFILE%\.claude.json` |
| MCP servers, project scope | `<project>\.mcp.json` |
| Auto memory | `%USERPROFILE%\.claude\projects\<project>\memory\` |
| Claude desktop app MCP config | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code program | `%USERPROFILE%\.local\bin\claude.exe` |

### PowerShell essentials

```powershell
Get-Location; Get-ChildItem; cd <path>; cd ..; mkdir <name>
Get-Content <file>; Set-Content <file> "<text>"; Copy-Item <a> <b>
$LASTEXITCODE
$env:PATH -split ';'
winget install --id <id> -e
<program> --help
```

### Claude Code from the terminal

```powershell
claude                                  # start a session here
claude --permission-mode manual         # ask before every action
claude -c                               # continue last conversation
claude -r                               # pick a conversation to resume
claude -p "<task>" --allowedTools "Read" # one-shot run
claude --version; claude doctor; claude update
claude mcp add <name> -- <command> [args]
claude mcp list; claude mcp get <name>; claude mcp remove <name>
claude plugin install <plugin>@<marketplace> --scope user
claude plugin list; claude plugin validate <path>
claude --plugin-dir <path>              # load a plugin for one session
```

### Inside a Claude Code session

| Keys or command | Does |
| --- | --- |
| Esc | Interrupt |
| Shift + Tab | Cycle permission modes |
| `@<file>` | Attach a file |
| `/plan <task>` | Plan before changing anything |
| `/init`, `/memory` | Create and edit CLAUDE.md |
| `/context`, `/compact`, `/clear` | Manage context |
| `/rewind` | Undo to a checkpoint |
| `/mcp`, `/hooks`, `/plugin`, `/skills` | Inspect add-ons |
| `/permissions` | Allow, ask and deny rules |
| `/usage`, `/status`, `/doctor` | Usage, configuration, checkup |
| `/tasks` | Background work, including subagents |
| `/exit` | Leave |

## 21. Sources

Every page below was opened while writing this guide, on the date at the top. Product details change often; when an instruction here and a page below disagree, the page is more current.

Claude Code documentation (Anthropic):

- [Advanced setup](https://code.claude.com/docs/en/setup)
- [Terminal guide for new users](https://code.claude.com/docs/en/terminal-guide)
- [Quickstart](https://code.claude.com/docs/en/quickstart)
- [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- [Platforms and integrations](https://code.claude.com/docs/en/platforms)
- [How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Commands](https://code.claude.com/docs/en/commands)
- [Settings files and precedence](https://code.claude.com/docs/en/settings)
- [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)
- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [Configure the sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing)
- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Plugins overview](https://code.claude.com/docs/en/plugins)
- [Install and manage plugins](https://code.claude.com/docs/en/plugins/install)
- [Create a Claude Code plugin](https://code.claude.com/docs/en/plugins/create)
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Use Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Model configuration and effort](https://code.claude.com/docs/en/model-config)
- [Goals](https://code.claude.com/docs/en/goal)
- [Checkpointing](https://code.claude.com/docs/en/checkpointing)
- [The context window](https://code.claude.com/docs/en/context-window)
- [Manage costs](https://code.claude.com/docs/en/costs)
- [Security](https://code.claude.com/docs/en/security)
- [Troubleshoot installation](https://code.claude.com/docs/en/troubleshoot-install)
- [CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Plugin security](https://code.claude.com/docs/en/plugins/security)
- [Documentation index](https://code.claude.com/docs/llms.txt)

claude.ai documentation (Anthropic):

- [Plugins on claude.ai and in Cowork](https://claude.com/docs/plugins/overview)
- [How can I create and manage projects?](https://support.claude.com/en/articles/9519177)
- [Use Claude's chat search and memory to build on previous context](https://support.claude.com/en/articles/11817273)
- [Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Use skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)
- [Skills how-to](https://claude.com/docs/skills/how-to)
- [Plugin platform support](https://claude.com/docs/plugins/platform-support)
- [Connector verification](https://claude.com/docs/connectors/verification)
- [Connector review criteria](https://claude.com/docs/connectors/building/review-criteria)
- [Use incognito chats](https://support.claude.com/en/articles/12260368-use-incognito-chats)
- [Use Research on Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- [Understanding Claude's personalization features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features)
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Glossary (tokens)](https://platform.claude.com/docs/en/about-claude/glossary)
- [Pricing (tokens)](https://platform.claude.com/docs/en/about-claude/pricing)

Anthropic engineering and news:

- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5)

Open standards and tools:

- [Agent Skills specification](https://agentskills.io/specification)
- [Model Context Protocol: Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server)
- [Model Context Protocol: MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [jq: Download](https://jqlang.org/download/)
- [uv: Installation](https://docs.astral.sh/uv/getting-started/installation/)
- [Git for Windows: Install](https://git-scm.com/install/windows)
- [Pro Git book](https://git-scm.com/book/en/v2)
- [MCP specification: tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [Microsoft: about_Execution_Policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)
- [Microsoft: about_Parsing](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing?view=powershell-5.1)
- [PKWARE ZIP specification (APPNOTE.TXT)](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
- [Windows Central: zip and unzip files on Windows 11](https://www.windowscentral.com/how-zip-or-unzip-files-windows-11)

Other:

- [@beamnxw on X, "Make Opus 5.5 Finish Long Tasks" (6 October 2026)](https://x.com/beamnxw/status/2107522996046905797)

Tested on Windows on 7 October 2026 (Windows 11 25H2, Windows PowerShell 5.1, winget 1.29): the winget IDs, the execution-policy check, quote removal in PowerShell 5.1, the console-encoding fix, `Compress-Archive` versus `tar.exe` ZIP paths, and `~` reaching programs such as `code` unexpanded.

Still not verified: whether claude.ai rejects a ZIP with backslash paths (not uploaded); the exact Windows 11 25H2 menu wording, which comes from Windows Central and Microsoft's Insider blog rather than a Microsoft support page; the description of artifacts (section 6) and of scheduling from the Claude app (section 15), which come from how this app works; and the plugin trimming suggestions (section 14), which are recommendations.

Review: on 7 October 2026 an independent reviewer read the whole guide, checked about 40 typed commands and product claims against the pages above, and parsed every complete JSON block. Three research passes the same day checked the best-practice additions and the claims in the @beamnxw post. The fixes they found are included in this version.
