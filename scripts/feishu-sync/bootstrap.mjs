import process from "node:process"

import {LarkClient} from "./lib.mjs"

const SPACE_NAME = "LLM Compass"
const SPACE_DESCRIPTION = "系统梳理大语言模型训练、推理、评测与智能体技术，提供从基础概念到工程实践的结构化知识指南。"

function parseArgs(argv) {
  const args = {
    appId: process.env.FEISHU_APP_ID || "",
    apply: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--apply") {
      args.apply = true
    } else if (argument === "--app-id") {
      args.appId = argv[index + 1]
      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.appId) {
    throw new Error("Provide the existing app ID with FEISHU_APP_ID or --app-id")
  }
  if (!args.apply) {
    process.stdout.write(`${JSON.stringify({
      appId: args.appId,
      description: SPACE_DESCRIPTION,
      dryRun: true,
      operations: [
        "create_private_wiki_space",
        "add_existing_app_as_admin",
        "create_llm_compass_root_node"
      ],
      spaceName: SPACE_NAME
    }, null, 2)}\n`)
    return
  }

  const client = new LarkClient()
  const spacesResult = await client.call([
    "wiki",
    "+space-list",
    "--page-all",
    "--page-limit",
    "0",
    "--as",
    "user"
  ])
  const exactMatches = (spacesResult.spaces || []).filter((space) => space.name === SPACE_NAME)
  if (exactMatches.length > 0) {
    const candidates = exactMatches.map((space) => ({
      description: space.description,
      name: space.name,
      spaceId: space.space_id,
      visibility: space.visibility
    }))
    throw new Error(`A space named ${SPACE_NAME} already exists: ${JSON.stringify(candidates)}`)
  }

  const space = await client.call([
    "wiki",
    "+space-create",
    "--name",
    SPACE_NAME,
    "--description",
    SPACE_DESCRIPTION,
    "--as",
    "user"
  ])
  await client.call([
    "wiki",
    "+member-add",
    "--space-id",
    space.space_id,
    "--member-id",
    args.appId,
    "--member-type",
    "appid",
    "--member-role",
    "admin",
    "--as",
    "user"
  ])
  const rootNode = await client.call([
    "wiki",
    "+node-create",
    "--space-id",
    space.space_id,
    "--obj-type",
    "docx",
    "--title",
    SPACE_NAME,
    "--as",
    "user"
  ])

  process.stdout.write(`${JSON.stringify({
    githubVariables: {
      FEISHU_ROOT_NODE_TOKEN: rootNode.node_token,
      FEISHU_SPACE_ID: space.space_id
    },
    rootNodeToken: rootNode.node_token,
    rootObjToken: rootNode.obj_token,
    spaceId: space.space_id,
    spaceName: space.name,
    visibility: space.visibility
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: error.message,
    name: error.name,
    status: "failed"
  }, null, 2)}\n`)
  process.exitCode = 1
})
