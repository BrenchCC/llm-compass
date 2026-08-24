import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import {execFileSync} from "node:child_process"

import {
  LarkClient,
  buildContentTree,
  buildRenameMap,
  buildRouteMap,
  computeRenderHash,
  extractSidebarLinks,
  parseMarkdownDocument,
  planSiblingReorder,
  planStaleRoots,
  releaseDuplicateMappings,
  transformMarkdown
} from "./lib.mjs"

const ARCHIVE_TITLE = "归档（GitHub 已移除）"
const ENGLISH_ROOT_TITLE = "LLM Compass English"
const STATE_TITLE = "⚙️ 同步状态（请勿编辑）"
const SYSTEM_TITLE = "⚙️ 系统（请勿编辑）"
const TEMP_ROOT = ".feishu-sync-tmp"
const STATE_SCHEMA_VERSION = 1

let executionJournal = null
let executionJournalHistory = []

function parseArgs(argv) {
  const args = {dryRun: false, mode: "incremental"}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--dry-run") {
      args.dryRun = true
    } else if (argument === "--mode") {
      args.mode = argv[index + 1]
      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!new Set(["full", "incremental"]).has(args.mode)) {
    throw new Error(`Unsupported sync mode: ${args.mode}`)
  }
  return args
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim()
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

async function readTrackedPages() {
  const output = execFileSync("git", ["ls-files", "-z", "--", "docs"], {
    cwd: process.cwd(),
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  }).toString("utf8")
  const sourcePaths = output
    .split("\0")
    .filter((sourcePath) => sourcePath.endsWith(".md"))
    .filter((sourcePath) => !sourcePath.startsWith("docs/.vitepress/"))
    .sort()
  const pages = []
  for (const sourcePath of sourcePaths) {
    const source = await fs.readFile(sourcePath, "utf8")
    const parsed = parseMarkdownDocument(sourcePath, source)
    pages.push({
      parsed,
      source,
      sourcePath,
      title: parsed.title
    })
  }
  return pages
}

async function readSidebarLinks() {
  const configPaths = [
    "docs/.vitepress/config/zh.ts",
    "docs/.vitepress/config/en.ts"
  ]
  const links = []
  for (const configPath of configPaths) {
    links.push(...extractSidebarLinks(await fs.readFile(configPath, "utf8")))
  }
  return links
}

async function writeTempFile(relativePath, content) {
  if (!relativePath.startsWith(`${TEMP_ROOT}/`)) {
    throw new Error(`Refusing to write outside ${TEMP_ROOT}: ${relativePath}`)
  }
  await fs.mkdir(path.dirname(relativePath), {recursive: true})
  await fs.writeFile(relativePath, content, "utf8")
}

async function readJsonIfPresent(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(relativePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback
    }
    throw error
  }
}

async function prepareTempRoot() {
  const initialSnapshot = await readJsonIfPresent(
    `${TEMP_ROOT}/rollback-snapshot-initial.json`,
    await readJsonIfPresent(`${TEMP_ROOT}/rollback-snapshot.json`, null)
  )
  const journalHistory = await readJsonIfPresent(
    `${TEMP_ROOT}/execution-journal-history.json`,
    []
  )
  const latestJournal = await readJsonIfPresent(
    `${TEMP_ROOT}/execution-journal.json`,
    []
  )
  executionJournalHistory = [...journalHistory, ...latestJournal]

  await fs.rm(TEMP_ROOT, {force: true, recursive: true})
  await fs.mkdir(TEMP_ROOT, {recursive: true})
  if (initialSnapshot) {
    await writeTempFile(
      `${TEMP_ROOT}/rollback-snapshot-initial.json`,
      `${JSON.stringify(initialSnapshot, null, 2)}\n`
    )
  }
  if (executionJournalHistory.length > 0) {
    await writeTempFile(
      `${TEMP_ROOT}/execution-journal-history.json`,
      `${JSON.stringify(executionJournalHistory, null, 2)}\n`
    )
  }
}

async function initializeRecoveryFiles(snapshot) {
  executionJournal = []
  await writeTempFile(
    `${TEMP_ROOT}/rollback-snapshot.json`,
    `${JSON.stringify(snapshot, null, 2)}\n`
  )
  await writeTempFile(
    `${TEMP_ROOT}/execution-journal.json`,
    `${JSON.stringify(executionJournal, null, 2)}\n`
  )
}

async function journaledWrite(action, details, operation) {
  const attemptedAt = new Date().toISOString()
  try {
    const result = await operation()
    if (executionJournal) {
      executionJournal.push({action, attemptedAt, details, status: "success"})
      await writeTempFile(
        `${TEMP_ROOT}/execution-journal.json`,
        `${JSON.stringify(executionJournal, null, 2)}\n`
      )
    }
    return result
  } catch (error) {
    if (executionJournal) {
      executionJournal.push({
        action,
        attemptedAt,
        details,
        error: error.message,
        status: "failed"
      })
      await writeTempFile(
        `${TEMP_ROOT}/execution-journal.json`,
        `${JSON.stringify(executionJournal, null, 2)}\n`
      )
    }
    throw error
  }
}

function emptyState() {
  return {
    archives: [],
    lastSyncedCommit: "",
    pages: {},
    repository: "BrenchCC/llm-compass",
    schemaVersion: STATE_SCHEMA_VERSION,
    status: "idle",
    targetCommit: ""
  }
}

function parseState(content) {
  const match = content.match(/```json\s*([\s\S]*?)```/)
  if (!match) {
    return emptyState()
  }
  const state = JSON.parse(match[1])
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`Unsupported state schema version: ${state.schemaVersion}`)
  }
  state.archives ||= []
  state.pages ||= {}
  for (const [key, entry] of Object.entries(state.pages)) {
    entry.key = key
    entry.synthetic = entry.synthetic === true
  }
  return state
}

function stateForPersistence(state) {
  const persisted = structuredClone(state)
  persisted.pages = Object.fromEntries(
    Object.entries(persisted.pages || {}).map(([key, entry]) => {
      delete entry.key
      delete entry.sourceHash
      if (entry.synthetic !== true) {
        delete entry.synthetic
      }
      return [key, entry]
    })
  )
  return persisted
}

function serializeState(state) {
  return [
    "> **⚙️ 自动同步控制页**",
    "> 此页面由同步程序维护，请勿手动编辑或移动。",
    "",
    "```json",
    JSON.stringify(stateForPersistence(state)),
    "```",
    ""
  ].join("\n")
}

function wikiUrl(nodeToken) {
  return `https://feishu.cn/wiki/${nodeToken}`
}

async function listChildren(client, spaceId, parentNodeToken) {
  const args = [
    "wiki",
    "+node-list",
    "--space-id",
    spaceId,
    "--page-all",
    "--page-limit",
    "0",
    "--as",
    "bot"
  ]
  if (parentNodeToken) {
    args.splice(4, 0, "--parent-node-token", parentNodeToken)
  }
  const result = await client.call(args)
  return result.nodes || []
}

async function createNode(client, spaceId, parentNodeToken, title, identity = "bot") {
  const args = [
    "wiki",
    "+node-create",
    "--space-id",
    spaceId,
    "--obj-type",
    "docx",
    "--title",
    title,
    "--as",
    identity
  ]
  if (parentNodeToken) {
    args.splice(4, 0, "--parent-node-token", parentNodeToken)
  }
  return journaledWrite(
    "create_node",
    {parentNodeToken: parentNodeToken || null, spaceId, title},
    () => client.call(args)
  )
}

async function renameNode(client, nodeToken, title) {
  return journaledWrite(
    "rename_node",
    {nodeToken, title},
    () => client.call([
      "drive",
      "+update-title",
      "--url",
      wikiUrl(nodeToken),
      "--title",
      title,
      "--as",
      "bot"
    ])
  )
}

async function moveNode(client, spaceId, nodeToken, parentNodeToken) {
  const args = [
    "wiki",
    "+move",
    "--node-token",
    nodeToken,
    "--source-space-id",
    spaceId,
    "--target-space-id",
    spaceId,
    "--as",
    "bot"
  ]
  if (parentNodeToken) {
    args.splice(-2, 0, "--target-parent-token", parentNodeToken)
  }
  return journaledWrite(
    "move_node",
    {nodeToken, parentNodeToken: parentNodeToken || null, spaceId},
    () => client.call(args)
  )
}

async function updateDocument(client, objToken, relativeContentPath) {
  const result = await journaledWrite(
    "update_document",
    {objToken, relativeContentPath},
    () => client.call([
      "docs",
      "+update",
      "--doc",
      objToken,
      "--command",
      "overwrite",
      "--doc-format",
      "markdown",
      "--content",
      `@./${relativeContentPath}`,
      "--as",
      "bot"
    ])
  )
  if (result.result && !new Set(["success", "partial_success"]).has(result.result)) {
    throw new Error(`Document update failed for ${objToken}: ${result.result}`)
  }
  return result
}

async function fetchDocument(client, objToken) {
  const result = await client.call([
    "docs",
    "+fetch",
    "--doc",
    objToken,
    "--doc-format",
    "markdown",
    "--detail",
    "simple",
    "--as",
    "bot"
  ])
  return result.document?.content || ""
}

async function buildRollbackSnapshot({
  client,
  extraParentTokens = [],
  rootChildren,
  routeTree,
  spaceId,
  state
}) {
  const childOrderByParentToken = {
    __space_root__: rootChildren.map((node) => node.node_token)
  }
  const parentKeys = new Set(
    routeTree.map((node) => node.parentKey).filter(Boolean)
  )
  const parentTokens = new Set()
  for (const parentToken of extraParentTokens) {
    parentTokens.add(parentToken)
  }
  for (const parentKey of parentKeys) {
    const parentToken = state.pages?.[parentKey]?.nodeToken
    if (parentToken) {
      parentTokens.add(parentToken)
    }
  }
  for (const parentToken of parentTokens) {
    const children = await listChildren(client, spaceId, parentToken)
    childOrderByParentToken[parentToken] = children.map((node) => node.node_token)
  }

  return {
    capturedAt: new Date().toISOString(),
    childOrderByParentToken,
    pages: Object.fromEntries(
      Object.entries(state.pages || {}).map(([key, entry]) => [key, {
        nodeToken: entry.nodeToken,
        objToken: entry.objToken,
        parentKey: entry.parentKey,
        title: entry.title
      }])
    ),
    spaceId
  }
}

async function ensureHelperNode({
  client,
  children,
  parentNodeToken,
  sourceChildren = [],
  spaceId,
  title
}) {
  const matches = children.filter((node) => node.title === title)
  if (matches.length > 1) {
    throw new Error(`Multiple helper nodes named ${title} exist under ${parentNodeToken}`)
  }
  if (matches.length === 1) {
    return matches[0]
  }
  const sourceMatches = sourceChildren.filter((node) => node.title === title)
  if (sourceMatches.length > 1) {
    throw new Error(`Multiple source helper nodes named ${title} exist`)
  }
  if (sourceMatches.length === 1) {
    await moveNode(client, spaceId, sourceMatches[0].node_token, parentNodeToken)
    const moved = {
      ...sourceMatches[0],
      parent_node_token: parentNodeToken
    }
    children.push(moved)
    return moved
  }
  const created = await createNode(client, spaceId, parentNodeToken, title)
  children.push(created)
  return created
}

async function writeState(client, stateNode, state) {
  const relativePath = `${TEMP_ROOT}/state.md`
  const serialized = serializeState(state)
  const expected = JSON.stringify(stateForPersistence(state))
  await writeTempFile(relativePath, serialized)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await updateDocument(client, stateNode.obj_token, relativePath)
    const persisted = parseState(await fetchDocument(client, stateNode.obj_token))
    if (JSON.stringify(stateForPersistence(persisted)) === expected) {
      return
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
  throw new Error("State page verification failed after 3 attempts")
}

function findRenames(lastSyncedCommit, currentCommit) {
  if (!lastSyncedCommit || lastSyncedCommit === currentCommit) {
    return new Map()
  }
  try {
    runGit(["cat-file", "-e", `${lastSyncedCommit}^{commit}`])
    const status = runGit([
      "diff",
      "--name-status",
      "-M",
      lastSyncedCommit,
      currentCommit,
      "--",
      "docs"
    ])
    return buildRenameMap(status)
  } catch {
    return new Map()
  }
}

function applyRenameState(pages, tree, renameMap) {
  for (const node of tree) {
    if (!node.sourcePath) {
      continue
    }
    const oldSourcePath = renameMap.get(node.sourcePath)
    if (!oldSourcePath) {
      continue
    }
    const oldEntry = Object.entries(pages).find(([, entry]) => entry.sourcePath === oldSourcePath)
    if (!oldEntry) {
      continue
    }
    const [oldKey, entry] = oldEntry
    delete pages[oldKey]
    pages[node.key] = {
      ...entry,
      key: node.key,
      sourcePath: node.sourcePath
    }
  }
}

async function reconcileTopology({
  archiveNode,
  client,
  commit,
  rootDetails,
  routeTree,
  spaceId,
  state
}) {
  const pages = structuredClone(state.pages || {})
  const renameMap = findRenames(state.lastSyncedCommit, commit)
  applyRenameState(pages, routeTree, renameMap)
  const releasedDuplicates = releaseDuplicateMappings(pages, routeTree)
  const childrenCache = new Map()

  pages.docs = {
    ...(pages.docs || {}),
    key: "docs",
    nodeToken: rootDetails.node_token,
    objToken: rootDetails.obj_token,
    parentKey: null,
    sourcePath: "docs/index.md",
    synthetic: false,
    title: "LLM Compass"
  }

  if (rootDetails.title !== "LLM Compass") {
    await renameNode(client, rootDetails.node_token, "LLM Compass")
  }

  async function childrenFor(parentNodeToken) {
    const cacheKey = parentNodeToken || "__space_root__"
    if (!childrenCache.has(cacheKey)) {
      childrenCache.set(cacheKey, await listChildren(client, spaceId, parentNodeToken))
    }
    return childrenCache.get(cacheKey)
  }

  function clearChildrenCache() {
    childrenCache.clear()
  }

  const reservedByToken = new Map(
    Object.entries(pages)
      .filter(([, entry]) => entry?.nodeToken)
      .map(([key, entry]) => [entry.nodeToken, key])
  )

  for (const node of routeTree) {
    if (node.key === "docs") {
      continue
    }
    const parentEntry = node.parentKey ? pages[node.parentKey] : null
    if (node.parentKey && !parentEntry?.nodeToken) {
      throw new Error(`Missing parent mapping for ${node.key}: ${node.parentKey}`)
    }
    const parentNodeToken = parentEntry?.nodeToken || ""

    let entry = pages[node.key]
    if (!entry?.nodeToken) {
      const children = await childrenFor(parentNodeToken)
      let matches = children.filter((child) => {
        const reservedKey = reservedByToken.get(child.node_token)
        return child.title === node.title && (!reservedKey || reservedKey === node.key)
      })
      if (node.key === "docs/en" && matches.length === 0) {
        const legacyChildren = await childrenFor(rootDetails.node_token)
        matches = legacyChildren.filter((child) => {
          const reservedKey = reservedByToken.get(child.node_token)
          return (
            new Set(["English", ENGLISH_ROOT_TITLE]).has(child.title) &&
            (!reservedKey || reservedKey === node.key)
          )
        })
      }
      if (matches.length > 1) {
        throw new Error(`Ambiguous existing nodes for ${node.key}: ${node.title}`)
      }
      const mappedNode = matches[0] || await createNode(
        client,
        spaceId,
        parentNodeToken,
        node.title
      )
      if (!matches[0]) {
        children.push(mappedNode)
      }
      entry = {
        nodeToken: mappedNode.node_token,
        objToken: mappedNode.obj_token,
        title: mappedNode.title
      }
      reservedByToken.set(entry.nodeToken, node.key)
    }

    const desiredChildren = await childrenFor(parentNodeToken)
    if (!desiredChildren.some((child) => child.node_token === entry.nodeToken)) {
      await moveNode(client, spaceId, entry.nodeToken, parentNodeToken)
      clearChildrenCache()
    }
    if (entry.title && entry.title !== node.title) {
      await renameNode(client, entry.nodeToken, node.title)
    }

    pages[node.key] = {
      ...entry,
      key: node.key,
      parentKey: node.parentKey,
      sourcePath: node.sourcePath,
      synthetic: node.synthetic,
      title: node.title
    }
  }

  const currentKeys = new Set(routeTree.map((node) => node.key))
  const staleRoots = planStaleRoots(pages, currentKeys)
  const staleKeys = Object.keys(pages).filter((key) => !currentKeys.has(key))
  for (const staleKey of staleRoots) {
    const entry = pages[staleKey]
    if (!entry?.nodeToken) {
      continue
    }
    await moveNode(client, spaceId, entry.nodeToken, archiveNode.node_token)
    const archivedTitle = entry.title?.startsWith("[归档]")
      ? entry.title
      : `[归档] ${entry.title || path.posix.basename(staleKey)}`
    await renameNode(client, entry.nodeToken, archivedTitle)
    state.archives.push({
      archivedAtCommit: commit,
      key: staleKey,
      nodeToken: entry.nodeToken,
      sourcePath: entry.sourcePath || null,
      title: archivedTitle
    })
  }
  for (const staleKey of staleKeys) {
    delete pages[staleKey]
  }

  return {
    pages,
    releasedDuplicates,
    renamed: renameMap.size,
    staleRoots
  }
}

function compareTreeNodes(left, right) {
  const orderDifference = left.order - right.order
  return orderDifference || left.key.localeCompare(right.key, "en")
}

async function reconcileSiblingOrder({
  archiveNode,
  client,
  englishRoot,
  pages,
  routeTree,
  spaceId,
  systemNode
}) {
  const childrenByParent = new Map()
  for (const node of routeTree) {
    if (!node.parentKey) {
      continue
    }
    const siblings = childrenByParent.get(node.parentKey) || []
    siblings.push(node)
    childrenByParent.set(node.parentKey, siblings)
  }

  const report = {movedNodes: 0, reorderedParents: 0}
  for (const [parentKey, siblings] of childrenByParent) {
    const parentEntry = pages[parentKey]
    if (!parentEntry?.nodeToken) {
      throw new Error(`Missing parent mapping while ordering ${parentKey}`)
    }
    const orderedSiblings = siblings.sort(compareTreeNodes)
    const desiredTokens = orderedSiblings.map((node) => pages[node.key].nodeToken)
    if (parentKey === "docs") {
      desiredTokens.push(systemNode.node_token)
    }

    const currentChildren = await listChildren(client, spaceId, parentEntry.nodeToken)
    const currentTokens = currentChildren.map((node) => node.node_token)
    const nodesToMove = planSiblingReorder(currentTokens, desiredTokens)
    if (nodesToMove.length === 0) {
      continue
    }

    const stagingNodeToken = parentKey === "docs"
      ? englishRoot.nodeToken
      : archiveNode.node_token
    for (const nodeToken of nodesToMove) {
      await moveNode(client, spaceId, nodeToken, stagingNodeToken)
    }
    for (const nodeToken of nodesToMove) {
      await moveNode(client, spaceId, nodeToken, parentEntry.nodeToken)
    }

    const verifiedChildren = await listChildren(client, spaceId, parentEntry.nodeToken)
    const verifiedTokens = verifiedChildren.map((node) => node.node_token)
    if (JSON.stringify(verifiedTokens) !== JSON.stringify(desiredTokens)) {
      throw new Error(`Feishu did not preserve the requested sibling order under ${parentKey}`)
    }
    report.movedNodes += nodesToMove.length
    report.reorderedParents += 1
  }
  return report
}

async function assetHashesFor(assetPaths, sourcePath) {
  const hashes = new Map()
  for (const assetPath of assetPaths) {
    try {
      const content = await fs.readFile(assetPath)
      hashes.set(assetPath, sha256(content))
    } catch (error) {
      throw new Error(`Missing local asset referenced by ${sourcePath}: ${assetPath}`, {
        cause: error
      })
    }
  }
  return hashes
}

function syntheticContent(node) {
  return [
    `此目录汇集 **${node.title}** 主题下的内容。`,
    "请从下方子页面继续浏览。",
    ""
  ].join("\n")
}

async function renderAndUpdate({
  checkpoint,
  client,
  mode,
  pages,
  routeMap,
  routeTree,
  sourcePages
}) {
  const sourceByPath = new Map(sourcePages.map((page) => [page.sourcePath, page]))
  const nodeMap = new Map()
  for (const node of routeTree) {
    if (node.sourcePath) {
      nodeMap.set(node.sourcePath, pages[node.key])
    }
  }

  const report = {
    skipped: 0,
    updated: 0,
    warnings: []
  }
  for (const node of routeTree) {
    const entry = pages[node.key]
    let content
    let assetHashes = new Map()
    if (node.synthetic) {
      content = syntheticContent(node)
    } else {
      const sourcePage = sourceByPath.get(node.sourcePath)
      const transformed = transformMarkdown({
        nodeMap,
        routeMap,
        source: sourcePage.source,
        sourcePath: node.sourcePath
      })
      content = transformed.content
      assetHashes = await assetHashesFor(transformed.assets, node.sourcePath)
      report.warnings.push(...transformed.warnings)
      for (const mermaidFile of transformed.mermaidFiles) {
        await writeTempFile(mermaidFile.relativePath, `${mermaidFile.content}\n`)
      }
    }

    const renderHash = computeRenderHash(content, assetHashes)
    if (mode !== "full" && entry.renderHash === renderHash) {
      report.skipped += 1
      continue
    }

    const contentPath = `${TEMP_ROOT}/pages/${sha256(node.key)}.md`
    await writeTempFile(contentPath, content)
    const updateResult = await updateDocument(client, entry.objToken, contentPath)
    if (Array.isArray(updateResult.warnings)) {
      for (const warning of updateResult.warnings) {
        report.warnings.push({
          detail: warning,
          sourcePath: node.sourcePath,
          type: "lark_warning"
        })
      }
    }
    entry.renderHash = renderHash
    report.updated += 1
    if (checkpoint && report.updated % 50 === 0) {
      await checkpoint()
    }
  }
  return report
}

async function localDryRun({mode, routeMap, routeTree, sourcePages}) {
  const sourceByPath = new Map(sourcePages.map((page) => [page.sourcePath, page]))
  const nodeMap = new Map()
  for (const node of routeTree) {
    if (node.sourcePath) {
      nodeMap.set(node.sourcePath, {nodeToken: `dry-${sha256(node.key).slice(0, 16)}`})
    }
  }

  const warnings = []
  let assets = 0
  let mermaid = 0
  for (const node of routeTree) {
    if (node.synthetic) {
      continue
    }
    const sourcePage = sourceByPath.get(node.sourcePath)
    const transformed = transformMarkdown({
      nodeMap,
      routeMap,
      source: sourcePage.source,
      sourcePath: node.sourcePath
    })
    await assetHashesFor(transformed.assets, node.sourcePath)
    assets += transformed.assets.length
    mermaid += transformed.mermaidFiles.length
    warnings.push(...transformed.warnings)
  }

  return {
    assets,
    contentPages: sourcePages.length,
    dryRun: true,
    mermaid,
    mode,
    syntheticNodes: routeTree.filter((node) => node.synthetic).length,
    topLevelDocuments: routeTree
      .filter((node) => node.parentKey === null)
      .map((node) => ({key: node.key, title: node.title})),
    totalNodes: routeTree.length,
    warnings
  }
}

async function sync({mode}) {
  const spaceId = process.env.FEISHU_SPACE_ID
  const rootNodeToken = process.env.FEISHU_ROOT_NODE_TOKEN
  if (!spaceId || !rootNodeToken) {
    throw new Error("FEISHU_SPACE_ID and FEISHU_ROOT_NODE_TOKEN are required")
  }

  const client = new LarkClient()
  const sourcePages = await readTrackedPages()
  const sidebarLinks = await readSidebarLinks()
  const routeTree = buildContentTree(sourcePages, sidebarLinks)
  const routeMap = buildRouteMap(routeTree)
  const commit = runGit(["rev-parse", "HEAD"])
  await prepareTempRoot()

  const rootDetails = await client.call([
    "wiki",
    "+node-get",
    "--node-token",
    rootNodeToken,
    "--space-id",
    spaceId,
    "--as",
    "bot"
  ])
  const rootChildren = await listChildren(client, spaceId, rootNodeToken)
  const existingSystemNodes = rootChildren.filter((node) => node.title === SYSTEM_TITLE)
  if (existingSystemNodes.length > 1) {
    throw new Error(`Multiple helper nodes named ${SYSTEM_TITLE} exist under ${rootNodeToken}`)
  }
  const existingSystemNode = existingSystemNodes[0] || null
  const existingSystemChildren = existingSystemNode
    ? await listChildren(client, spaceId, existingSystemNode.node_token)
    : []
  const existingStateNodes = [
    ...rootChildren.filter((node) => node.title === STATE_TITLE),
    ...existingSystemChildren.filter((node) => node.title === STATE_TITLE)
  ]
  if (existingStateNodes.length > 1) {
    throw new Error(`Multiple helper nodes named ${STATE_TITLE} exist`)
  }
  const existingStateNode = existingStateNodes[0] || null
  const stateContent = existingStateNode
    ? await fetchDocument(client, existingStateNode.obj_token)
    : ""
  const state = parseState(stateContent)
  state.archives ||= []
  const rollbackSnapshot = await buildRollbackSnapshot({
    client,
    extraParentTokens: existingSystemNode ? [existingSystemNode.node_token] : [],
    rootChildren,
    routeTree,
    spaceId,
    state
  })
  await initializeRecoveryFiles(rollbackSnapshot)
  state.status = "in_progress"
  state.targetCommit = commit
  if (existingStateNode) {
    await writeState(client, existingStateNode, state)
  }

  const systemNode = await ensureHelperNode({
    children: rootChildren,
    client,
    parentNodeToken: rootNodeToken,
    spaceId,
    title: SYSTEM_TITLE
  })
  const systemChildren = await listChildren(client, spaceId, systemNode.node_token)
  const stateNode = await ensureHelperNode({
    children: systemChildren,
    client,
    parentNodeToken: systemNode.node_token,
    sourceChildren: rootChildren,
    spaceId,
    title: STATE_TITLE
  })
  if (!existingStateNode) {
    await writeState(client, stateNode, state)
  }
  const archiveNode = await ensureHelperNode({
    children: systemChildren,
    client,
    parentNodeToken: systemNode.node_token,
    sourceChildren: rootChildren,
    spaceId,
    title: ARCHIVE_TITLE
  })
  const topology = await reconcileTopology({
    archiveNode,
    client,
    commit,
    rootDetails,
    routeTree,
    spaceId,
    state
  })
  state.pages = topology.pages
  const orderReport = await reconcileSiblingOrder({
    archiveNode,
    client,
    englishRoot: state.pages["docs/en"],
    pages: state.pages,
    routeTree,
    spaceId,
    systemNode
  })
  await writeState(client, stateNode, state)

  let contentReport
  try {
    contentReport = await renderAndUpdate({
      checkpoint: () => writeState(client, stateNode, state),
      client,
      mode,
      pages: state.pages,
      routeMap,
      routeTree,
      sourcePages
    })
  } catch (error) {
    try {
      await writeState(client, stateNode, state)
    } catch {
      // Preserve the content-sync failure when checkpointing also fails.
    }
    throw error
  }
  const report = {
    archived: topology.staleRoots.length,
    commit,
    contentPages: sourcePages.length,
    mode,
    repairedDuplicateMappings: topology.releasedDuplicates.length,
    reorderedNodes: orderReport.movedNodes,
    reorderedParents: orderReport.reorderedParents,
    renamed: topology.renamed,
    skipped: contentReport.skipped,
    syntheticNodes: routeTree.filter((node) => node.synthetic).length,
    totalNodes: routeTree.length,
    updated: contentReport.updated,
    warnings: contentReport.warnings
  }

  state.lastReport = {
    ...report,
    warnings: report.warnings.length
  }
  state.lastSyncedCommit = commit
  state.status = "idle"
  state.targetCommit = ""
  await writeState(client, stateNode, state)
  await writeTempFile(`${TEMP_ROOT}/sync-report.json`, `${JSON.stringify(report, null, 2)}\n`)
  return report
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourcePages = await readTrackedPages()
  const sidebarLinks = await readSidebarLinks()
  const routeTree = buildContentTree(sourcePages, sidebarLinks)
  const routeMap = buildRouteMap(routeTree)
  if (args.dryRun) {
    const report = await localDryRun({
      mode: args.mode,
      routeMap,
      routeTree,
      sourcePages
    })
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  const report = await sync(args)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch(async (error) => {
  const larkError = error.envelope?.error
  const report = {
    error: error.message,
    name: error.name,
    status: "failed",
    ...(larkError?.console_url ? {consoleUrl: larkError.console_url} : {}),
    ...(larkError?.hint ? {hint: larkError.hint} : {}),
    ...(larkError?.missing_scopes ? {missingScopes: larkError.missing_scopes} : {})
  }
  try {
    await fs.mkdir(TEMP_ROOT, {recursive: true})
    await writeTempFile(`${TEMP_ROOT}/sync-report.json`, `${JSON.stringify(report, null, 2)}\n`)
  } catch {
    // Preserve the original failure.
  }
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = 1
})
