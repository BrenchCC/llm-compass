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
  if (key === "docs" || key === "docs/en") {
    return null
  }
  return path.posix.dirname(key)
}

function treeDepth(key) {
  return key.split("/").length
}

export function extractSidebarLinks(configSource) {
  const propertyMatch = /\bsidebar\s*:\s*\[/.exec(configSource)
  if (!propertyMatch) {
    throw new Error("VitePress config does not contain a sidebar array")
  }

  const arrayStart = propertyMatch.index + propertyMatch[0].lastIndexOf("[")
  let arrayEnd = -1
  let depth = 0
  let quote = ""
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = arrayStart; index < configSource.length; index += 1) {
    const character = configSource[index]
    const nextCharacter = configSource[index + 1]
    if (lineComment) {
      if (character === "\n") {
        lineComment = false
      }
      continue
    }
    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (character === quote) {
        quote = ""
      }
      continue
    }
    if (character === "/" && nextCharacter === "/") {
      lineComment = true
      index += 1
      continue
    }
    if (character === "/" && nextCharacter === "*") {
      blockComment = true
      index += 1
      continue
    }
    if (new Set(["'", "\"", "`"]).has(character)) {
      quote = character
      continue
    }
    if (character === "[") {
      depth += 1
    } else if (character === "]") {
      depth -= 1
      if (depth === 0) {
        arrayEnd = index
        break
      }
    }
  }
  if (arrayEnd < 0) {
    throw new Error("VitePress sidebar array is not balanced")
  }

  const sidebarSource = configSource.slice(arrayStart, arrayEnd + 1)
  const withoutComments = sidebarSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
  return [...withoutComments.matchAll(/\blink\s*:\s*(['"])(.*?)\1/g)]
    .map((match) => match[2])
}

export function buildContentTree(pages, navigationLinks = []) {
  const nodes = new Map()
  for (const page of pages) {
    const key = sourcePathToKey(page.sourcePath)
    let title = page.title
    if (
      path.posix.basename(page.sourcePath) === "index.md" &&
      title.trim().toLowerCase() === "index"
    ) {
      title = humanizeDirectory(path.posix.basename(path.posix.dirname(page.sourcePath)))
    }
    if (key === "docs") {
      title = "LLM Compass"
    } else if (key === "docs/en") {
      title = "LLM Compass English"
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

  const unorderedTree = [...nodes.values()]
  const routeMap = buildRouteMap(unorderedTree)
  const orderByKey = new Map()
  for (let index = 0; index < navigationLinks.length; index += 1) {
    const link = navigationLinks[index].split(/[?#]/, 1)[0]
    const sourcePath = routeMap.get(link) || routeMap.get(link.replace(/\/$/, ""))
    if (!sourcePath) {
      continue
    }
    let key = sourcePathToKey(sourcePath)
    while (key && key !== ".") {
      orderByKey.set(key, Math.min(orderByKey.get(key) ?? Infinity, index))
      key = parentKeyFor(key)
    }
  }
  for (const node of unorderedTree) {
    node.order = orderByKey.get(node.key) ?? Infinity
  }

  return unorderedTree.sort((left, right) => {
    const depthDifference = treeDepth(left.key) - treeDepth(right.key)
    const orderDifference = left.order - right.order
    return depthDifference || orderDifference || left.key.localeCompare(right.key, "en")
  })
}

export function computeTopologyHash(tree) {
  const topology = [...tree]
    .sort((left, right) => left.key.localeCompare(right.key, "en"))
    .map((node) => ({
      key: node.key,
      order: Number.isFinite(node.order) ? node.order : null,
      parentKey: node.parentKey || null,
      sourcePath: node.sourcePath || null,
      synthetic: node.synthetic === true,
      title: node.title
    }))
  return crypto
    .createHash("sha256")
    .update("feishu-topology-v1\0")
    .update(JSON.stringify(topology))
    .digest("hex")
}

export function canUseTopologyFastPath({mode, rootNodeToken, state, tree}) {
  if (
    mode !== "incremental" ||
    state?.status !== "idle" ||
    !state.lastSyncedCommit ||
    state.topologyHash !== computeTopologyHash(tree)
  ) {
    return false
  }

  const pages = state.pages || {}
  if (Object.keys(pages).length !== tree.length) {
    return false
  }

  const nodeTokens = new Set()
  for (const node of tree) {
    const entry = pages[node.key]
    if (
      !entry ||
      typeof entry.nodeToken !== "string" ||
      !entry.nodeToken ||
      typeof entry.objToken !== "string" ||
      !entry.objToken ||
      (entry.parentKey || null) !== (node.parentKey || null) ||
      (entry.sourcePath || null) !== (node.sourcePath || null) ||
      (entry.synthetic === true) !== (node.synthetic === true) ||
      entry.title !== node.title ||
      nodeTokens.has(entry.nodeToken)
    ) {
      return false
    }
    nodeTokens.add(entry.nodeToken)
  }

  return pages.docs?.nodeToken === rootNodeToken
}

export function planSiblingReorder(currentTokens, desiredTokens) {
  if (new Set(currentTokens).size !== currentTokens.length) {
    throw new Error("Current sibling list contains duplicate node tokens")
  }
  if (new Set(desiredTokens).size !== desiredTokens.length) {
    throw new Error("Desired sibling list contains duplicate node tokens")
  }
  if (
    currentTokens.length !== desiredTokens.length ||
    currentTokens.some((token) => !desiredTokens.includes(token))
  ) {
    throw new Error("Current siblings do not exactly match managed siblings")
  }

  let currentIndex = 0
  let retainedPrefixLength = 0
  for (const desiredToken of desiredTokens) {
    const foundIndex = currentTokens.indexOf(desiredToken, currentIndex)
    if (foundIndex < 0) {
      break
    }
    retainedPrefixLength += 1
    currentIndex = foundIndex + 1
  }
  return desiredTokens.slice(retainedPrefixLength)
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

function normalizeLarkMath(content) {
  return content.replace(
    /\\(text|texttt)\{([^{}]*)\}/g,
    (_, command, value) => (
      `\\${command}{${value.replace(/\\_/g, "\\textunderscore{}")}}`
    )
  )
}

function renderMarkdownMath(content) {
  const normalizedContent = content.trim().replace(/\s*\n\s*/g, " ")
  return `$$${normalizeLarkMath(normalizedContent)}$$`
}

function readDollarMathBlock(lines, startIndex) {
  const line = lines[startIndex]
  const inlineMatch = line.match(/^\s*\$\$([\s\S]*?)\$\$\s*$/)
  if (inlineMatch && inlineMatch[1].trim()) {
    return {
      content: inlineMatch[1],
      endIndex: startIndex
    }
  }

  if (!/^\s*\$\$\s*$/.test(line)) {
    return null
  }

  const blockLines = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\$\$\s*$/.test(lines[index])) {
      return {
        content: blockLines.join("\n"),
        endIndex: index
      }
    }
    blockLines.push(lines[index])
  }
  return null
}

export function transformMarkdown({source, sourcePath, routeMap, nodeMap}) {
  const parsed = parseMarkdownDocument(sourcePath, source)
  const lines = parsed.body.split("\n")
  const output = []
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
          output.push(renderMarkdownMath(blockContent))
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

    const dollarMathBlock = readDollarMathBlock(lines, index)
    if (dollarMathBlock) {
      output.push(renderMarkdownMath(dollarMathBlock.content))
      index = dollarMathBlock.endIndex
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

  output.push(
    "",
    "---",
    "",
    `_内容来源：[GitHub · ${sourcePath}](https://github.com/${GITHUB_REPOSITORY}/blob/main/${sourcePath})_`
  )

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

export function releaseDuplicateMappings(pages, tree) {
  const currentKeys = new Set(tree.map((node) => node.key))
  const keysByToken = new Map()
  for (const [key, entry] of Object.entries(pages)) {
    if (!entry?.nodeToken) {
      continue
    }
    const keys = keysByToken.get(entry.nodeToken) || []
    keys.push(key)
    keysByToken.set(entry.nodeToken, keys)
  }

  const released = []
  for (const [nodeToken, keys] of keysByToken) {
    if (keys.length < 2) {
      continue
    }
    const activeKeys = keys.filter((key) => currentKeys.has(key)).sort()
    const ownerKey = activeKeys[0] || keys.sort()[0]
    for (const key of keys) {
      if (key === ownerKey) {
        continue
      }
      delete pages[key]
      released.push({key, nodeToken, ownerKey})
    }
  }
  return released
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
  return /\bEOF\b|\brpc fail\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|network is unreachable|request canceled|timeout exceeded|TLS handshake timeout|context deadline exceeded|service unavailable|bad gateway|gateway timeout/i.test(detail)
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
