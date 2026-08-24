# LLM Compass

> LLM 训练算法知识图谱：基础模型 / SFT / LoRA / DPO / RLHF / 蒸馏 / 推理 / Agent —— 用 Markdown 写作，自动构建为在线网站。

**在线阅读**：https://BrenchCC.github.io/llm-compass/ （中文 | [English](https://BrenchCC.github.io/llm-compass/en/)）

**飞书知识库**：[中文](https://feishu.cn/wiki/LkFVwh9CJisP9gkpofkcWGjKnEe) | [English](https://feishu.cn/wiki/OIERwuILyi5Y7SkeXILc0Fhrngb)

收录原则：**只收讨论度高、用得最多的出名算法**，不堆砌冷门变体，也不堆砌易过期的 benchmark 数字。

## 知识体系

```
导读          如何阅读 · 符号约定
基础模型       Qwen · DeepSeek · GLM · Llama · Kimi · MiniMax · StepFun · Gemini · Claude · OpenAI
SFT           全量微调 · 数据构造 · Chat Template · Packing · Loss Masking
LoRA 及变体    LoRA · QLoRA · DoRA · AdaLoRA · rsLoRA · LoRA+ · PiSSA
DPO 系列       DPO · IPO · KTO · ORPO · SimPO · CPO
PPO/GRPO 系列  Reward Model · PPO · GRPO · DAPO · GSPO · RLOO · REINFORCE++
蒸馏           黑盒（数据/CoT） · 白盒（logits KL）
推理与解码     KV Cache & PagedAttention · 量化（GPTQ/AWQ/FP8） · 投机解码
Harness       执行循环与上下文 · 沙箱与工具执行 · 代表系统对比
              └ 自主科研与自动化 Agent：AI Scientist · Agent Laboratory · AIDE · AI co-scientist
Agent         Tool Use 训练 · 多智能体
              ├ Agentic RL：检索/工具 RL · 软件工程 RL · Web 导航 RL · 训练稳定性
              ├ 代表性 Agent 框架：LangChain · LangGraph · LlamaIndex · AutoGen · CrewAI · MetaGPT · Claude Agent SDK · Claude Code · Codex · OpenClaw · Hermes
              └ Deep Research：OpenAI Deep Research · open-deep-research(HF) · STORM/Co-STORM
Skills        Agent Skills 体系 · 技能设计与评测 · AutoSkill 技能自迭代 · 与 RAG/微调对比
研究博客       Deep Research · Rubric 评测 · RSI / Harness 自我改进
```

开源模型以技术报告 / 论文为准，闭源模型以官方博客 / 模型卡为准。

## 本地开发

```bash
npm install
npm run docs:dev      # 开发预览 http://localhost:5173/llm-compass/
npm run docs:build    # 构建（含死链检查），push 前建议先跑一遍
npm run docs:preview  # 以生产路径预览构建产物
```

push 到 `main` 分支后，GitHub Actions 会自动构建并部署到 GitHub Pages（仓库 Settings → Pages → Source 需选择 **GitHub Actions**）。

## 飞书知识库同步

仓库可将 `docs/` 下的内容同步到私有飞书知识空间。中文和英文分别维护为一级文档 `LLM Compass` 与 `LLM Compass English`，各自的子页面顺序跟随 `docs/.vitepress/config/zh.ts` 和 `en.ts` 中的网页版侧边栏；未列入侧边栏的页面排在对应目录末尾。GitHub 删除的页面会移入系统目录中的归档节点。

首次初始化：

```bash
npm run feishu:bootstrap -- --app-id <FEISHU_APP_ID> --apply
```

把命令返回的空间 ID 和根节点 token 分别配置为 GitHub Variables `FEISHU_SPACE_ID`、`FEISHU_ROOT_NODE_TOKEN`，并将应用 ID、应用密钥配置为 GitHub Secrets `FEISHU_APP_ID`、`FEISHU_APP_SECRET`。随后在 Actions 中手动运行一次 `Feishu Wiki Sync`，选择 `full`。

本地检查与同步：

```bash
npm run feishu:sync:dry-run
npm run feishu:sync -- --mode incremental
npm run feishu:sync -- --mode full
```

日常同步优先使用 `incremental`：当页面路径、标题、父子关系和侧边栏顺序均未变化时，同步器会复用已验证的拓扑签名，跳过整棵知识库的层级扫描，只更新正文哈希发生变化的页面。首次升级到该机制、上次同步中断、状态映射不完整或拓扑发生变化时，会自动回退到完整拓扑校验；`full` 始终执行完整拓扑校验并重写全部正文，可用于定期审计。

同步需要飞书应用具备 Wiki 节点、Docx 内容、Drive 上传和节点移动权限。持续同步使用 bot 身份，首次创建知识空间和授予应用管理员权限使用 user 身份。知识空间简介只介绍内容用途；页面正文末尾仅保留 GitHub 源文件引用。

## 内容组织约定

- **目录 = URL = 侧边栏分组**：每个算法版块一个顶层目录（如 `docs/dpo/`），版块内每个算法一个 `.md` 文件，版块必有 `index.md` 总览页（含家族演化 Mermaid 图与变体对比表）。
- **文件命名**：小写连字符，即 URL 路径（`reinforce-plus-plus.md` → `/rlhf/reinforce-plus-plus`）。
- **站内链接**：写不含 base 的绝对路径（如 `/dpo/dpo`），**不要**手写 `/llm-compass/` 前缀。
- **数学公式**：`$...$` 行内、块级公式使用 fenced `math` 代码块，记号遵循 [符号约定](docs/guide/notation.md)。
- **图表**：Mermaid 代码块直接写在 md 中。

### 算法页标准结构

每个算法页遵循统一模板：

1. 一句话定义 + 论文/年份 + 前置阅读链接
2. 直觉与动机（它解决了什么问题）
3. 方法与公式（核心公式必须给出）
4. 与 baseline 对比（表格）
5. 实现要点与伪代码
6. 实验与调参经验
7. 参考文献

### 双语规则

- **中文（`docs/`）为 source of truth**，英文镜像位于 `docs/en/`，路径与中文严格一致（语言切换按钮依赖此约定）。
- 英文页 frontmatter 用 `translation: pending | synced` 标记翻译状态。
- 修改中文内容时，至少同步英文页的标题与小节结构，正文可后补并标 `pending`。
- 新增页面需同时更新 `docs/.vitepress/config/zh.ts` 与 `en.ts` 的侧边栏。

## 技术栈

[VitePress](https://vitepress.dev/) · markdown-it-mathjax3（数学公式）· vitepress-plugin-mermaid（图表）· 内置本地搜索 · GitHub Actions + GitHub Pages

## License

代码采用 [MIT](LICENSE) 许可；文档内容采用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 许可。
