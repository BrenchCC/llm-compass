import assert from "node:assert/strict"
import test from "node:test"

import {
  LarkClient,
  buildContentTree,
  buildRenameMap,
  computeRenderHash,
  extractSidebarLinks,
  parseMarkdownDocument,
  planSiblingReorder,
  planStaleRoots,
  releaseDuplicateMappings,
  transformMarkdown
} from "../scripts/feishu-sync/lib.mjs"

test("parseMarkdownDocument prefers frontmatter and strips the leading H1", () => {
  const parsed = parseMarkdownDocument(
    "docs/dpo/dpo.md",
    [
      "---",
      "title: \"DPO（直接偏好优化）\"",
      "translation: synced",
      "---",
      "",
      "# DPO（Direct Preference Optimization）",
      "",
      "正文"
    ].join("\n")
  )

  assert.equal(parsed.title, "DPO（直接偏好优化）")
  assert.equal(parsed.frontmatter.translation, "synced")
  assert.equal(parsed.body.trim(), "正文")
})

test("buildContentTree creates independent roots and follows sidebar order", () => {
  const tree = buildContentTree([
    {sourcePath: "docs/index.md", title: "全景速览"},
    {sourcePath: "docs/about.md", title: "关于"},
    {sourcePath: "docs/en/index.md", title: "At a Glance"},
    {sourcePath: "docs/en/harness/index.md", title: "index"},
    {sourcePath: "docs/en/eval/rubrics.md", title: "Rubrics"}
  ], ["/", "/en/", "/en/harness/", "/en/eval/rubrics"])

  assert.deepEqual(
    tree.map(({key, parentKey, sourcePath, title, synthetic}) => ({
      key,
      parentKey,
      sourcePath,
      title,
      synthetic
    })),
    [
      {
        key: "docs",
        parentKey: null,
        sourcePath: "docs/index.md",
        title: "LLM Compass",
        synthetic: false
      },
      {
        key: "docs/en",
        parentKey: null,
        sourcePath: "docs/en/index.md",
        title: "LLM Compass English",
        synthetic: false
      },
      {
        key: "docs/about",
        parentKey: "docs",
        sourcePath: "docs/about.md",
        title: "关于",
        synthetic: false
      },
      {
        key: "docs/en/harness",
        parentKey: "docs/en",
        sourcePath: "docs/en/harness/index.md",
        title: "Harness",
        synthetic: false
      },
      {
        key: "docs/en/eval",
        parentKey: "docs/en",
        sourcePath: null,
        title: "Evaluation",
        synthetic: true
      },
      {
        key: "docs/en/eval/rubrics",
        parentKey: "docs/en/eval",
        sourcePath: "docs/en/eval/rubrics.md",
        title: "Rubrics",
        synthetic: false
      }
    ]
  )
})

test("extractSidebarLinks reads only sidebar links in source order", () => {
  const configSource = [
    "nav: [{link: '/nav-only'}],",
    "sidebar: [",
    "  {items: [{link: '/guide/'}, {link: '/base-models/'}]},",
    "  // {link: '/commented-out'}",
    "  {items: [{link: '/agent/'}]}",
    "]"
  ].join("\n")

  assert.deepEqual(
    extractSidebarLinks(configSource),
    ["/guide/", "/base-models/", "/agent/"]
  )
})

test("planSiblingReorder keeps the longest achievable desired prefix", () => {
  assert.deepEqual(
    planSiblingReorder(["c", "a", "b", "d"], ["a", "b", "c", "d"]),
    ["c", "d"]
  )
  assert.deepEqual(
    planSiblingReorder(["a", "b", "c"], ["a", "b", "c"]),
    []
  )
  assert.throws(
    () => planSiblingReorder(["a", "manual"], ["a", "b"]),
    /exactly match managed siblings/
  )
})

test("releaseDuplicateMappings keeps one active owner and releases duplicate claims", () => {
  const pages = {
    "docs/en/harness": {nodeToken: "shared"},
    "docs/en/inference": {nodeToken: "shared"},
    "docs/en/skills": {nodeToken: "shared"},
    "docs/stale": {nodeToken: "shared"}
  }
  const tree = [
    {key: "docs/en/harness"},
    {key: "docs/en/inference"},
    {key: "docs/en/skills"}
  ]

  assert.deepEqual(releaseDuplicateMappings(pages, tree), [
    {key: "docs/en/inference", nodeToken: "shared", ownerKey: "docs/en/harness"},
    {key: "docs/en/skills", nodeToken: "shared", ownerKey: "docs/en/harness"},
    {key: "docs/stale", nodeToken: "shared", ownerKey: "docs/en/harness"}
  ])
  assert.deepEqual(pages, {
    "docs/en/harness": {nodeToken: "shared"}
  })
})

test("transformMarkdown converts VitePress syntax, resources, formulas, diagrams, and links", () => {
  const source = [
    "---",
    "title: Demo",
    "---",
    "",
    "# Demo <Badge type=\"tip\" text=\"Preview\" />",
    "",
    "::: tip 前置阅读",
    "阅读 [符号约定](/guide/notation#symbols)，规模 <50k。",
    ":::",
    "",
    "![架构](/papers/demo/arch.png)",
    "",
    "```math",
    "a < b & c > d",
    "```",
    "",
    "```mermaid",
    "graph LR",
    "  A & B --> C",
    "  C <-->|sync| D",
    "```",
    "",
    "```text",
    "[不转换](/guide/notation) <raw>",
    "```"
  ].join("\n")

  const result = transformMarkdown({
    source,
    sourcePath: "docs/demo.md",
    routeMap: new Map([["/guide/notation", "docs/guide/notation.md"]]),
    nodeMap: new Map([["docs/guide/notation.md", {nodeToken: "wikcnNotation"}]])
  })

  assert.equal(result.content.startsWith("---"), false)
  assert.doesNotMatch(result.content, /^# Demo/m)
  assert.doesNotMatch(result.content, /自动同步/)
  assert.match(result.content, /内容来源：\[GitHub · docs\/demo\.md\]/)
  assert.match(result.content, /> \*\*💡 前置阅读\*\*/)
  assert.match(result.content, /https:\/\/feishu\.cn\/wiki\/wikcnNotation/)
  assert.match(result.content, /规模 \\<50k/)
  assert.match(result.content, /!\[架构\]\(@\.\/docs\/public\/papers\/demo\/arch\.png\)/)
  assert.match(result.content, /<latex>a &lt; b &amp; c &gt; d<\/latex>/)
  assert.match(result.content, /<whiteboard type="mermaid" path="@\.\/\.feishu-sync-tmp\/mermaid\/[a-f0-9]{64}\.mmd"><\/whiteboard>/)
  assert.match(result.content, /\[不转换\]\(\/guide\/notation\) <raw>/)
  assert.equal(result.mermaidFiles.length, 1)
  assert.equal(
    result.mermaidFiles[0].content,
    [
      "graph LR",
      "  A --> C",
      "  B --> C",
      "  C -->|sync| D",
      "  D -->|sync| C"
    ].join("\n")
  )
  assert.deepEqual(result.assets, ["docs/public/papers/demo/arch.png"])
  assert.deepEqual(result.warnings, [
    {
      type: "anchor_degraded",
      sourcePath: "docs/demo.md",
      href: "/guide/notation#symbols"
    }
  ])
})

test("computeRenderHash changes when a referenced asset changes", () => {
  const first = computeRenderHash("body", new Map([["a.png", "hash-a"]]))
  const second = computeRenderHash("body", new Map([["a.png", "hash-b"]]))

  assert.notEqual(first, second)
  assert.equal(first, computeRenderHash("body", new Map([["a.png", "hash-a"]])))
})

test("buildRenameMap parses git rename records", () => {
  const renames = buildRenameMap([
    "M\tdocs/index.md",
    "R098\tdocs/old.md\tdocs/new.md",
    "D\tdocs/deleted.md"
  ].join("\n"))

  assert.deepEqual([...renames], [["docs/new.md", "docs/old.md"]])
})

test("planStaleRoots archives only the highest stale ancestor", () => {
  const statePages = {
    "docs/removed": {parentKey: "docs"},
    "docs/removed/child": {parentKey: "docs/removed"},
    "docs/other": {parentKey: "docs"}
  }

  assert.deepEqual(
    planStaleRoots(statePages, new Set(["docs"])),
    ["docs/other", "docs/removed"]
  )
})

test("LarkClient retries rate limits and returns successful data", async () => {
  const calls = []
  const responses = [
    {
      code: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {subtype: "rate_limit", code: 99991400, message: "slow down"}
      })
    },
    {
      code: 0,
      stdout: JSON.stringify({ok: true, data: {node_token: "wikcnOk"}}),
      stderr: ""
    }
  ]
  const client = new LarkClient({
    execute: async (args) => {
      calls.push(args)
      return responses.shift()
    },
    sleep: async () => {},
    maxAttempts: 3
  })

  const data = await client.call(["wiki", "+node-get", "--node-token", "wikcnOk"])

  assert.equal(data.node_token, "wikcnOk")
  assert.equal(calls.length, 2)
  assert.ok(calls.every((args) => args.includes("--format") && args.includes("json")))
})

test("LarkClient retries transient transport failures", async () => {
  const responses = [
    {
      code: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {
          message: "Put https://open.feishu.cn/open-apis/docs_ai/v1/documents/demo: EOF"
        }
      })
    },
    {
      code: 0,
      stdout: JSON.stringify({ok: true, data: {result: "success"}}),
      stderr: ""
    }
  ]
  const delays = []
  const client = new LarkClient({
    execute: async () => responses.shift(),
    sleep: async (delay) => delays.push(delay),
    maxAttempts: 3
  })

  const data = await client.call(["docs", "+update", "--doc", "demo"])

  assert.equal(data.result, "success")
  assert.deepEqual(delays, [1000])
})

test("LarkClient retries Feishu rpc failures", async () => {
  const responses = [
    {
      code: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {message: "rpc fail"}
      })
    },
    {
      code: 0,
      stdout: JSON.stringify({ok: true, data: {node_token: "wikcnRecovered"}}),
      stderr: ""
    }
  ]
  const client = new LarkClient({
    execute: async () => responses.shift(),
    sleep: async () => {},
    maxAttempts: 3
  })

  const data = await client.call(["wiki", "+move", "--node-token", "wikcnRecovered"])

  assert.equal(data.node_token, "wikcnRecovered")
})

test("LarkClient retries Feishu OAuth timeouts", async () => {
  const responses = [
    {
      code: 1,
      stdout: "",
      stderr: JSON.stringify({
        ok: false,
        error: {message: "request canceled (Client.Timeout exceeded while awaiting headers)"}
      })
    },
    {
      code: 0,
      stdout: JSON.stringify({ok: true, data: {nodes: []}}),
      stderr: ""
    }
  ]
  const client = new LarkClient({
    execute: async () => responses.shift(),
    sleep: async () => {},
    maxAttempts: 3
  })

  const data = await client.call(["wiki", "+node-list", "--space-id", "demo"])

  assert.deepEqual(data.nodes, [])
})
