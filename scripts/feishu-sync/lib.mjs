import crypto from "node:crypto"
import path from "node:path"
import {spawn} from "node:child_process"

const GITHUB_REPOSITORY = "BrenchCC/llm-compass"
const FEISHU_WIKI_BASE_URL = "https://feishu.cn/wiki"

function stripQuotes(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function humanizeDirectory(name) {
  const knownTitles = new Map([
    ["aigc", "AIGC"],
    ["dpo", "DPO"],
    ["en", "English"],
    ["eval", "Evaluation"],
    ["rlhf", "RLHF"],
    ["rsi", "RSI"],
    ["sft", "SFT"]
  ])
  if (knownTitles.has(name)) {
    return knownTitles.get(name)
  }
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function cleanHeadingText(value) {
  return value
    .replace(/<Badge\b[^>]*\btext="([^"]*)"[^>]*\/>/g, "$1")
    .replace(/[*_`]/g, "")
    .trim()
}

export function parseMarkdownDocument(sourcePath, source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const frontmatter = {}
  let bodyStart = 0

  if (lines[0]?.trim() === "---") {
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---")
    if (closingIndex > 0) {
      for (const line of lines.slice(1, closingIndex)) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (match) {
          frontmatter[match[1]] = stripQuotes(match[2])
        }
      }
      bodyStart = closingIndex + 1
    }
  }

  const bodyLines = lines.slice(bodyStart)
  let firstHeading = ""
  let inFence = false
  let headingIndex = -1
  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (!inFence) {
      const match = line.match(/^#\s+(.+)$/)
      if (match) {
        firstHeading = cleanHeadingText(match[1])
        headingIndex = index
        break
      }
    }
  }
  if (headingIndex >= 0) {
    bodyLines.splice(headingIndex, 1)
  }

  const fallback = humanizeDirectory(path.posix.basename(sourcePath, ".md"))
  const title = frontmatter.title || firstHeading || fallback
  return {
    body: bodyLines.join("\n").replace(/^\s*\n/, ""),
    firstHeading,
    frontmatter,
    title
  }
}

function sourcePathToKey(sourcePath) {
  const parsed = path.posix.parse(sourcePath)
  if (parsed.base === "index.md") {
    return parsed.dir
  }
  return path.posix.join(parsed.dir, parsed.name)
}

function parentKeyFor(key) {
  if (key === "docs") {
    return null
  }
  return path.posix.dirname(key)
}

function treeDepth(key) {
  return key.split("/").length
}

export function buildContentTree(pages) {
  const nodes = new Map()
  for (const page of pages) {
    const key = sourcePathToKey(page.sourcePath)
    let title = page.title
    if (key === "docs") {
      title = "LLM Compass"
    } else if (key === "docs/en") {
      title = "English"
    }
    nodes.set(key, {
      key,
      parentKey: parentKeyFor(key),
      sourcePath: page.sourcePath,
      title,
      synthetic: false
    })
  }

  for (const existingNode of [...nodes.values()]) {
    let currentParent = existingNode.parentKey
    while (currentParent && currentParent !== ".") {
      if (!nodes.has(currentParent)) {
        nodes.set(currentParent, {
          key: currentParent,
          parentKey: parentKeyFor(currentParent),
          sourcePath: null,
          title: humanizeDirectory(path.posix.basename(currentParent)),
          synthetic: true
        })
      }
      if (currentParent === "docs") {
        break
      }
      currentParent = parentKeyFor(currentParent)
    }
  }

  return [...nodes.values()].sort((left, right) => {
    const depthDifference = treeDepth(left.key) - treeDepth(right.key)
    return depthDifference || left.key.localeCompare(right.key, "en")
  })
}

export function buildRouteMap(tree) {
  const routeMap = new Map()
  for (const node of tree) {
    if (!node.sourcePath) {
      continue
    }
    const sourcePath = node.sourcePath
    if (sourcePath === "docs/index.md") {
      routeMap.set("/", sourcePath)
      routeMap.set("/index.md", sourcePath)
      continue
    }

    const relative = sourcePath.slice("docs/".length)
    if (relative.endsWith("/index.md")) {
      const base = `/${relative.slice(0, -"index.md".length)}`
      routeMap.set(base, sourcePath)
      routeMap.set(base.replace(/\/$/, ""), sourcePath)
      routeMap.set(`${base}index.md`, sourcePath)
    } else {
      const withoutExtension = `/${relative.slice(0, -".md".length)}`
      routeMap.set(withoutExtension, sourcePath)
      routeMap.set(`${withoutExtension}.md`, sourcePath)
    }
  }
  return routeMap
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeLiteralAngles(line) {
  let result = ""
  let inCode = false
  let inMath = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === "`" && line[index - 1] !== "\\") {
      inCode = !inCode
      result += character
      continue
    }
    if (character === "$" && line[index - 1] !== "\\" && !inCode) {
      inMath = !inMath
      result += character
      continue
    }
    if (
      character === "<" &&
      !inCode &&
      !inMath &&
      line[index - 1] !== "\\"
    ) {
      result += "\\<"
      continue
    }
    result += character
  }
  return result
}

function splitHref(href) {
  const hashIndex = href.indexOf("#")
  const queryIndex = href.indexOf("?")
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0)
  const splitIndex = indexes.length > 0 ? Math.min(...indexes) : href.length
  return {
    path: href.slice(0, splitIndex),
    fragment: hashIndex >= 0 ? href.slice(hashIndex + 1) : ""
  }
}

function resolveInternalSource(sourcePath, hrefPath, routeMap) {
  if (hrefPath.startsWith("/")) {
    let route = hrefPath
    if (route.startsWith("/llm-compass/")) {
      route = route.slice("/llm-compass".length)
    }
    return routeMap.get(route) || routeMap.get(route.replace(/\/$/, "")) || null
  }

  const sourcePaths = new Set(routeMap.values())
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), hrefPath))
  const candidates = [resolved]
  if (resolved.endsWith("/")) {
    candidates.push(`${resolved}index.md`)
  } else if (!path.posix.extname(resolved)) {
    candidates.push(`${resolved}.md`, path.posix.join(resolved, "index.md"))
  }
  return candidates.find((candidate) => sourcePaths.has(candidate)) || null
}

function localAssetPath(sourcePath, hrefPath) {
  if (hrefPath.startsWith("/")) {
    const normalized = hrefPath.replace(/^\/llm-compass\//, "/").replace(/^\//, "")
    return path.posix.normalize(path.posix.join("docs/public", normalized))
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), hrefPath))
}

function isExternalHref(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
}

function rewriteMarkdownLinks({line, sourcePath, routeMap, nodeMap, assets, warnings}) {
  return line.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (match, imagePrefix, label, rawHref) => {
      const href = rawHref.replace(/^<|>$/g, "")
      if (imagePrefix === "!") {
        if (isExternalHref(href) || href.startsWith("@") || href.startsWith("data:")) {
          return match
        }
        const {path: hrefPath} = splitHref(href)
        const assetPath = localAssetPath(sourcePath, hrefPath)
        assets.add(assetPath)
        const resourceHref = `@./${assetPath}`
        const wrappedHref = resourceHref.includes(" ") ? `<${resourceHref}>` : resourceHref
        return `![${label}](${wrappedHref})`
      }

      if (href.startsWith("#") || isExternalHref(href)) {
        return match
      }
      const {path: hrefPath, fragment} = splitHref(href)
      const targetSource = resolveInternalSource(sourcePath, hrefPath, routeMap)
      if (!targetSource) {
        if (hrefPath.startsWith("/")) {
          warnings.push({type: "unresolved_link", sourcePath, href})
          return `[${label}](https://BrenchCC.github.io/llm-compass${href})`
        }
        warnings.push({type: "unresolved_link", sourcePath, href})
        return match
      }

      const targetNode = nodeMap.get(targetSource)
      if (!targetNode?.nodeToken) {
        warnings.push({type: "missing_node_mapping", sourcePath, href, targetSource})
        return match
      }
      if (fragment) {
        warnings.push({type: "anchor_degraded", sourcePath, href})
      }
      return `[${label}](${FEISHU_WIKI_BASE_URL}/${targetNode.nodeToken})`
    }
  )
}

function replaceBadge(line) {
  return line.replace(
    /<Badge\b[^>]*\btext="([^"]*)"[^>]*\/>/g,
    (_, text) => `**[${text}]**`
  )
}

function containerLabel(type, title) {
  const labels = {
    danger: ["🚨", "注意"],
    details: ["📖", "详情"],
    info: ["ℹ️", "说明"],
    tip: ["💡", "提示"],
    warning: ["⚠️", "警告"]
  }
  const [emoji, fallback] = labels[type] || ["ℹ️", "说明"]
  return `> **${emoji} ${title || fallback}**`
}

function normalizeMermaid(content) {
  return content.split("\n").flatMap((line) => {
    const bidirectional = line.match(
      /^(\s*)(.+?)\s*<-->\s*(?:\|([^|]+)\|\s*)?(.+?)\s*$/
    )
    if (bidirectional) {
      const [, indent, left, label, right] = bidirectional
      const edge = label ? `-->|${label}| ` : "--> "
      return [
        `${indent}${left} ${edge}${right}`,
        `${indent}${right} ${edge}${left}`
      ]
    }

    const multiSource = line.match(
      /^(\s*)([A-Za-z0-9_:-]+(?:\s*&\s*[A-Za-z0-9_:-]+)+)\s*-->\s*(\|[^|]+\|\s*)?(.+?)\s*$/
    )
    if (multiSource) {
      const [, indent, sources, label = "", target] = multiSource
      return sources
        .split(/\s*&\s*/)
        .map((source) => `${indent}${source} -->${label ? `${label}` : " "}${target}`)
    }
    return line
  }).join("\n")
}

export function transformMarkdown({source, sourcePath, routeMap, nodeMap}) {
  const parsed = parseMarkdownDocument(sourcePath, source)
  const lines = parsed.body.split("\n")
  const output = [
    "> **🔄 GitHub 自动同步**",
    `> 本页由 [${sourcePath}](https://github.com/${GITHUB_REPOSITORY}/blob/main/${sourcePath}) 单向同步；请在 GitHub 修改，飞书人工编辑会在下次同步时被覆盖。`,
    ""
  ]
  const assets = new Set()
  const mermaidFiles = []
  const warnings = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = line.match(/^\s*```([^\s`]*)\s*$/)
    if (fenceMatch) {
      const language = fenceMatch[1].toLowerCase()
      if (language === "mermaid" || language === "math") {
        const blockLines = []
        index += 1
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          blockLines.push(lines[index])
          index += 1
        }
        const blockContent = blockLines.join("\n").trim()
        if (language === "mermaid") {
          const normalizedContent = normalizeMermaid(blockContent)
          const digest = crypto.createHash("sha256").update(normalizedContent).digest("hex")
          const relativePath = `.feishu-sync-tmp/mermaid/${digest}.mmd`
          mermaidFiles.push({content: normalizedContent, relativePath})
          output.push(`<whiteboard type="mermaid" path="@./${relativePath}"></whiteboard>`)
        } else {
          output.push(`<latex>${escapeXml(blockContent)}</latex>`)
        }
        continue
      }

      output.push(line)
      index += 1
      while (index < lines.length) {
        output.push(lines[index])
        if (/^\s*```\s*$/.test(lines[index])) {
          break
        }
        index += 1
      }
      continue
    }

    const containerMatch = line.match(/^\s*:{3,4}\s*([A-Za-z]+)?\s*(.*?)\s*$/)
    if (containerMatch) {
      if (containerMatch[1]) {
        output.push(containerLabel(containerMatch[1].toLowerCase(), containerMatch[2]))
      }
      continue
    }

    let transformed = replaceBadge(line)
    transformed = rewriteMarkdownLinks({
      line: transformed,
      sourcePath,
      routeMap,
      nodeMap,
      assets,
      warnings
    })
    transformed = escapeLiteralAngles(transformed)
    output.push(transformed)
  }

  return {
    assets: [...assets].sort(),
    content: output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    mermaidFiles,
    title: parsed.title,
    warnings
  }
}

export function computeRenderHash(content, assetHashes = new Map()) {
  const hash = crypto.createHash("sha256")
  hash.update(content)
  for (const [assetPath, assetHash] of [...assetHashes].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update("\0")
    hash.update(assetPath)
    hash.update("\0")
    hash.update(assetHash)
  }
  return hash.digest("hex")
}

export function buildRenameMap(statusOutput) {
  const renames = new Map()
  for (const line of statusOutput.split("\n")) {
    const fields = line.split("\t")
    if (/^R\d{3}$/.test(fields[0]) && fields.length >= 3) {
      renames.set(fields[2], fields[1])
    }
  }
  return renames
}

export function planStaleRoots(statePages, currentKeys) {
  const staleKeys = new Set(
    Object.keys(statePages).filter((key) => !currentKeys.has(key))
  )
  return [...staleKeys]
    .filter((key) => {
      let parentKey = statePages[key]?.parentKey
      while (parentKey) {
        if (staleKeys.has(parentKey)) {
          return false
        }
        parentKey = statePages[parentKey]?.parentKey
      }
      return true
    })
    .sort()
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function defaultExecute(binary, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({code, stderr, stdout}))
  })
}

function parseEnvelope(stdout, stderr) {
  for (const candidate of [stdout, stderr]) {
    const trimmed = candidate.trim()
    if (!trimmed) {
      continue
    }
    try {
      return JSON.parse(trimmed)
    } catch {
      const start = trimmed.indexOf("{")
      const end = trimmed.lastIndexOf("}")
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1))
        } catch {
          continue
        }
      }
    }
  }
  return null
}

function isRateLimit(envelope, stderr) {
  const error = envelope?.error || {}
  return (
    error.subtype === "rate_limit" ||
    error.code === 99991400 ||
    /rate.?limit|too many requests|99991400/i.test(stderr)
  )
}

function isTransientFailure(envelope, stderr) {
  const detail = [
    envelope?.error?.message,
    envelope?.error?.hint,
    stderr
  ].filter(Boolean).join("\n")
  return /\bEOF\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|network is unreachable|TLS handshake timeout|context deadline exceeded|service unavailable|bad gateway|gateway timeout/i.test(detail)
}

export class LarkCliError extends Error {
  constructor(message, {args, envelope, stderr}) {
    super(message)
    this.name = "LarkCliError"
    this.args = args
    this.envelope = envelope
    this.stderr = stderr
  }
}

export class LarkClient {
  constructor({
    binary = process.env.FEISHU_CLI_PATH || "lark-cli",
    execute,
    maxAttempts = 5,
    sleep = defaultSleep
  } = {}) {
    this.binary = binary
    this.execute = execute || ((args) => defaultExecute(binary, args, {
      ...process.env,
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1"
    }))
    this.maxAttempts = maxAttempts
    this.sleep = sleep
  }

  async call(args) {
    const finalArgs = [...args]
    if (!finalArgs.includes("--format") && !finalArgs.includes("--json")) {
      finalArgs.push("--format", "json")
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const result = await this.execute(finalArgs)
      const envelope = parseEnvelope(result.stdout, result.stderr)
      if (result.code === 0 && envelope?.ok === true) {
        return envelope.data
      }
      if (
        attempt < this.maxAttempts &&
        (isRateLimit(envelope, result.stderr) || isTransientFailure(envelope, result.stderr))
      ) {
        await this.sleep(1000 * (2 ** (attempt - 1)))
        continue
      }

      const message = envelope?.error?.message || result.stderr.trim() || `lark-cli exited with code ${result.code}`
      throw new LarkCliError(message, {
        args: finalArgs,
        envelope,
        stderr: result.stderr
      })
    }
    throw new Error("unreachable")
  }
}
