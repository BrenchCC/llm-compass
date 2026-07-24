<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'

type Category = 'deep-research' | 'evaluation' | 'systems'

interface Article {
  category: Category
  date: string
  path: string
  readTime: string
  title: {
    zh: string
    en: string
  }
  summary: {
    zh: string
    en: string
  }
}

const { lang } = useData()
const activeCategory = ref<'all' | Category>('all')
const categories: Category[] = ['deep-research', 'evaluation', 'systems']

const isEnglish = computed(() => lang.value.startsWith('en'))

const labels = computed(() => {
  if (isEnglish.value) {
    return {
      all: 'All notes',
      deepResearch: 'Deep Research',
      evaluation: 'Evaluation',
      systems: 'Systems',
      eyebrow: 'THE RESEARCH DESK',
      edition: 'VOL. 01 · 2026',
      title: 'Notes from the moving edge of LLM systems.',
      intro: 'Paper-driven field notes on agents, evaluation, and self-improving harnesses. Read for the mechanism, not the leaderboard.',
      count: '9 FIELD NOTES',
      latest: 'LATEST DOSSIER',
      read: 'Read note',
      archive: 'THE INDEX',
      archiveHint: 'Filter by research thread',
      source: 'Content is adapted with attribution from the reference below under CC BY-SA 4.0; page design is original to LLM Compass.'
    }
  }

  return {
    all: '全部手记',
    deepResearch: '深度研究',
    evaluation: '评测方法',
    systems: '系统演化',
    eyebrow: 'THE RESEARCH DESK / 研究手记',
    edition: 'VOL. 01 · 2026',
    title: '在 LLM 系统持续移动的边界上，留下可复查的笔记。',
    intro: '以论文为锚点，追踪 Agent、评测与自我改进系统。少看榜单，多看机制；少记结论，多留判断依据。',
    count: '9 篇研究手记',
    latest: '本期封面',
    read: '阅读全文',
    archive: '文章索引',
    archiveHint: '按研究脉络筛选',
    source: '内容经署名整理自下方参考项目，遵循 CC BY-SA 4.0；页面设计由 LLM Compass 独立完成。'
  }
})

const categoryLabels = computed<Record<Category, string>>(() => ({
  'deep-research': labels.value.deepResearch,
  evaluation: labels.value.evaluation,
  systems: labels.value.systems
}))

const articles: Article[] = [
  {
    category: 'systems',
    date: '2026.07',
    path: '/rsi/',
    readTime: '8 min',
    title: {
      zh: 'RSI：当 Harness 开始改写自己',
      en: 'RSI: When the Harness Starts Rewriting Itself'
    },
    summary: {
      zh: '从上下文搜索、工作流演化到权重与 Harness 联合优化：递归自我改进真正优化的对象是什么？',
      en: 'From context search and workflow evolution to joint optimization of weights and harnesses: what does recursive self-improvement actually optimize?'
    }
  },
  {
    category: 'deep-research',
    date: '2026.07',
    path: '/agent/deep-research/apodex',
    readTime: '18 min',
    title: {
      zh: 'Apodex-1.0：把验证变成 Agent 团队的内在行为',
      en: 'Apodex-1.0: Verification as an Intrinsic Team Behavior'
    },
    summary: {
      zh: '统一运行时如何托管深研、编码与证明三类 heavy-duty 任务，并用团队结构突破单 Agent 的可靠性上限。',
      en: 'How a unified runtime hosts research, coding, and proof workloads while a team structure pushes beyond the reliability ceiling of a single agent.'
    }
  },
  {
    category: 'evaluation',
    date: '2026.06',
    path: '/eval/rubrics',
    readTime: '12 min',
    title: {
      zh: 'Rubric 化评测：把“好不好”拆成可核验的标准',
      en: 'Rubric-Based Evaluation: Turning Quality into Verifiable Criteria'
    },
    summary: {
      zh: '为什么标量分数不够用，以及结构化标准如何贯穿评测、奖励建模与推理时控制。',
      en: 'Why scalar scores are insufficient, and how structured criteria connect evaluation, reward modeling, and inference-time control.'
    }
  },
  {
    category: 'deep-research',
    date: '2026.05',
    path: '/agent/deep-research/quest',
    readTime: '16 min',
    title: {
      zh: 'QUEST：一棵 Rubric 树训练通用深研 Agent',
      en: 'QUEST: One Rubric Tree for General Deep-Research Agents'
    },
    summary: {
      zh: '统一任务合成、上下文压缩与异步 RL，让 2B–35B 模型共享同一套深研训练配方。',
      en: 'A unified recipe for task synthesis, context compression, and asynchronous RL across models from 2B to 35B.'
    }
  },
  {
    category: 'deep-research',
    date: '2026.05',
    path: '/agent/deep-research/co-react',
    readTime: '14 min',
    title: {
      zh: 'Co-ReAct：让 Rubric 在每一步参与协作',
      en: 'Co-ReAct: Letting Rubrics Collaborate at Every Step'
    },
    summary: {
      zh: 'Rubric 不再只是事后打分器，而是在 ReAct 分支点生成标准、核验行为并触发重试。',
      en: 'Rubrics move from post-hoc grading to generating criteria, checking actions, and triggering retries at ReAct branch points.'
    }
  },
  {
    category: 'deep-research',
    date: '2026.03',
    path: '/agent/deep-research/mirothinker-h1',
    readTime: '17 min',
    title: {
      zh: 'MiroThinker H1：交互伸缩之后，验证成为主线',
      en: 'MiroThinker H1: Verification after Interactive Scaling'
    },
    summary: {
      zh: '局部验证每一步、全局验证整条证据链，把“更多工具调用”升级为更可靠的重型研究流程。',
      en: 'Local checks audit each step while global checks audit the evidence chain, turning more interactions into a more reliable research process.'
    }
  },
  {
    category: 'deep-research',
    date: '2026.03',
    path: '/agent/deep-research/marco-deepresearch',
    readTime: '15 min',
    title: {
      zh: 'Marco DeepResearch：三层验证如何托起 8B Agent',
      en: 'Marco DeepResearch: A Three-Layer Verification Stack for an 8B Agent'
    },
    summary: {
      zh: '从数据合成、轨迹构造到测试时扩展，逐层堵住深研系统中的误差传播链。',
      en: 'Verification at data synthesis, trajectory construction, and test-time scaling blocks error propagation throughout the system.'
    }
  },
  {
    category: 'deep-research',
    date: '2025.11',
    path: '/agent/deep-research/dr-tulu',
    readTime: '15 min',
    title: {
      zh: 'DR Tulu：让 Rubric 跟着策略共同进化',
      en: 'DR Tulu: Evolving Rubrics alongside the Policy'
    },
    summary: {
      zh: '用搜索增强的动态规则与判别力筛选，为开放式长文研究构造持续有效的奖励信号。',
      en: 'Search-augmented dynamic rules and discriminative filtering keep reward signals useful for open-ended long-form research.'
    }
  },
  {
    category: 'deep-research',
    date: '2025.11',
    path: '/agent/deep-research/mirothinker',
    readTime: '13 min',
    title: {
      zh: 'MiroThinker：模型与上下文之外的第三条 Scaling 轴',
      en: 'MiroThinker: A Third Scaling Axis beyond Model and Context'
    },
    summary: {
      zh: '把交互深度视作独立扩展维度，用长程 ReAct 轨迹研究工具调用如何转化为任务能力。',
      en: 'Interactive depth becomes an independent scaling dimension, exposing how long ReAct trajectories translate tool use into capability.'
    }
  }
]

const featuredArticle = computed(() => articles[0])
const filteredArticles = computed(() => {
  if (activeCategory.value === 'all') {
    return articles.slice(1)
  }

  return articles.filter((article) => article.category === activeCategory.value)
})

function articleHref(path: string): string {
  const localizedPath = isEnglish.value ? `/en${path}` : path
  return withBase(localizedPath)
}

function articleTitle(article: Article): string {
  return isEnglish.value ? article.title.en : article.title.zh
}

function articleSummary(article: Article): string {
  return isEnglish.value ? article.summary.en : article.summary.zh
}
</script>

<template>
  <main class="research-blog">
    <header class="research-masthead">
      <div class="masthead-rule" aria-hidden="true">
        <span>{{ labels.eyebrow }}</span>
        <span>{{ labels.edition }}</span>
      </div>

      <div class="masthead-copy">
        <p class="issue-count">{{ labels.count }}</p>
        <h1>{{ labels.title }}</h1>
        <p class="masthead-intro">{{ labels.intro }}</p>
      </div>

      <div class="signal-map" aria-hidden="true">
        <span class="signal-node node-model">MODEL</span>
        <span class="signal-node node-context">CONTEXT</span>
        <span class="signal-node node-tools">TOOLS</span>
        <span class="signal-node node-eval">EVAL</span>
        <span class="signal-node node-loop">↻</span>
      </div>
    </header>

    <section class="featured-note" aria-labelledby="featured-title">
      <div class="featured-kicker">
        <span>{{ labels.latest }}</span>
        <span>{{ featuredArticle.date }}</span>
      </div>

      <div class="featured-grid">
        <div class="featured-number" aria-hidden="true">01</div>
        <div class="featured-copy">
          <p class="article-meta">
            {{ categoryLabels[featuredArticle.category] }} · {{ featuredArticle.readTime }}
          </p>
          <h2 id="featured-title">{{ articleTitle(featuredArticle) }}</h2>
          <p>{{ articleSummary(featuredArticle) }}</p>
          <a class="article-link" :href="articleHref(featuredArticle.path)">
            {{ labels.read }}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        <ol class="featured-thesis">
          <li>Context</li>
          <li>Workflow</li>
          <li>Harness</li>
          <li>Weights</li>
        </ol>
      </div>
    </section>

    <section class="notes-index" aria-labelledby="archive-title">
      <div class="index-heading">
        <div>
          <p>{{ labels.archiveHint }}</p>
          <h2 id="archive-title">{{ labels.archive }}</h2>
        </div>

        <div class="category-filter" aria-label="Article categories">
          <button
            type="button"
            :class="{ active: activeCategory === 'all' }"
            @click="activeCategory = 'all'"
          >
            {{ labels.all }}
          </button>
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            :class="{ active: activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ categoryLabels[category] }}
          </button>
        </div>
      </div>

      <div class="article-list">
        <article
          v-for="(article, index) in filteredArticles"
          :key="article.path"
          class="article-row"
          :style="{ '--row-index': index }"
        >
          <div class="row-index">
            {{ String(articles.indexOf(article) + 1).padStart(2, '0') }}
          </div>
          <div class="row-meta">
            <span>{{ article.date }}</span>
            <span>{{ categoryLabels[article.category] }}</span>
            <span>{{ article.readTime }}</span>
          </div>
          <div class="row-copy">
            <h3>
              <a :href="articleHref(article.path)">{{ articleTitle(article) }}</a>
            </h3>
            <p>{{ articleSummary(article) }}</p>
          </div>
          <a
            class="row-arrow"
            :href="articleHref(article.path)"
            :aria-label="`${labels.read}: ${articleTitle(article)}`"
          >
            ↗
          </a>
        </article>
      </div>
    </section>

    <p class="source-note">
      {{ labels.source }}
      <a href="https://github.com/zhoujx4/llm-atlas" target="_blank" rel="noreferrer">
        zhoujx4/llm-atlas
      </a>
    </p>
  </main>
</template>

<style scoped>
.research-blog {
  --desk-ink: var(--vp-c-text-1);
  --desk-muted: var(--vp-c-text-2);
  --desk-rule: var(--vp-c-divider);
  --desk-paper: var(--vp-c-bg);
  --desk-paper-soft: var(--vp-c-bg-alt);
  --desk-blue: var(--vp-c-brand-1);
  --desk-gold: #a66b1f;
  width: min(1240px, calc(100% - 48px));
  margin: 0 auto;
  padding: 54px 0 72px;
  color: var(--desk-ink);
}

.research-masthead {
  position: relative;
  min-height: 480px;
  border-top: 3px solid var(--desk-ink);
  border-bottom: 1px solid var(--desk-rule);
  overflow: hidden;
}

.research-masthead::before {
  position: absolute;
  inset: 48px 0 0 54%;
  background-image: radial-gradient(circle, var(--desk-rule) 1px, transparent 1px);
  background-size: 18px 18px;
  content: '';
  opacity: 0.65;
  mask-image: linear-gradient(90deg, transparent, #000 24%, #000);
}

.masthead-rule {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--desk-rule);
  padding: 13px 0 11px;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  letter-spacing: 0.13em;
}

.masthead-copy {
  position: relative;
  z-index: 2;
  width: min(760px, 72%);
  padding: 74px 0 68px;
}

.issue-count {
  margin: 0 0 22px;
  color: var(--desk-blue);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.masthead-copy h1 {
  max-width: 760px;
  margin: 0;
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(3rem, 6.4vw, 6.4rem);
  font-weight: 560;
  line-height: 0.98;
  letter-spacing: -0.052em;
}

.masthead-intro {
  max-width: 690px;
  margin: 34px 0 0;
  color: var(--desk-muted);
  font-size: clamp(1rem, 1.8vw, 1.22rem);
  line-height: 1.78;
}

.signal-map {
  position: absolute;
  right: 2%;
  bottom: 54px;
  width: min(370px, 31vw);
  aspect-ratio: 1;
  border: 1px solid var(--desk-rule);
  border-radius: 50%;
  animation: map-arrival 700ms ease-out both;
}

.signal-map::before,
.signal-map::after {
  position: absolute;
  background: var(--desk-rule);
  content: '';
}

.signal-map::before {
  top: 50%;
  left: 8%;
  width: 84%;
  height: 1px;
  transform: rotate(-24deg);
}

.signal-map::after {
  top: 8%;
  left: 50%;
  width: 1px;
  height: 84%;
  transform: rotate(31deg);
}

.signal-node {
  position: absolute;
  z-index: 2;
  display: grid;
  min-width: 64px;
  min-height: 64px;
  place-items: center;
  border: 1px solid var(--desk-ink);
  border-radius: 50%;
  background: var(--desk-paper);
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.node-model {
  top: -10px;
  left: 38%;
}

.node-context {
  top: 38%;
  right: -18px;
}

.node-tools {
  bottom: -8px;
  left: 35%;
}

.node-eval {
  top: 35%;
  left: -22px;
}

.node-loop {
  top: 42%;
  left: 42%;
  min-width: 58px;
  min-height: 58px;
  border-color: var(--desk-blue);
  color: var(--desk-blue);
  font-size: 25px;
}

.featured-note {
  margin-top: 64px;
  border-top: 1px solid var(--desk-rule);
  border-bottom: 1px solid var(--desk-rule);
}

.featured-kicker {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--desk-rule);
  padding: 13px 0 11px;
  color: var(--desk-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.featured-grid {
  display: grid;
  grid-template-columns: 0.42fr 1.45fr 0.7fr;
  min-height: 360px;
}

.featured-number {
  padding: 30px 20px 24px 0;
  color: var(--desk-blue);
  font-family: 'Fraunces', serif;
  font-size: clamp(5rem, 10vw, 9rem);
  font-weight: 400;
  line-height: 0.9;
}

.featured-copy {
  border-right: 1px solid var(--desk-rule);
  border-left: 1px solid var(--desk-rule);
  padding: 42px clamp(28px, 4vw, 62px);
}

.article-meta {
  margin: 0 0 18px;
  color: var(--desk-blue);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.featured-copy h2 {
  margin: 0;
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(2rem, 4vw, 3.75rem);
  font-weight: 560;
  line-height: 1.08;
  letter-spacing: -0.035em;
}

.featured-copy > p:not(.article-meta) {
  max-width: 680px;
  margin: 24px 0 0;
  color: var(--desk-muted);
  font-size: 16px;
  line-height: 1.75;
}

.article-link {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  margin-top: 30px;
  border-bottom: 1px solid currentColor;
  padding-bottom: 3px;
  color: var(--desk-ink);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
}

.article-link span {
  transition: transform 160ms ease;
}

.article-link:hover span {
  transform: translate(3px, -3px);
}

.featured-thesis {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0;
  padding: 32px clamp(22px, 3vw, 46px);
  list-style: none;
  counter-reset: thesis;
}

.featured-thesis li {
  position: relative;
  border-bottom: 1px solid var(--desk-rule);
  padding: 14px 0 14px 34px;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  counter-increment: thesis;
}

.featured-thesis li::before {
  position: absolute;
  left: 0;
  color: var(--desk-gold);
  content: '0' counter(thesis);
}

.notes-index {
  margin-top: 82px;
}

.index-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  border-bottom: 3px solid var(--desk-ink);
  padding-bottom: 20px;
}

.index-heading p {
  margin: 0 0 6px;
  color: var(--desk-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.index-heading h2 {
  margin: 0;
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 560;
  line-height: 1;
}

.category-filter {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.category-filter button {
  border: 1px solid var(--desk-rule);
  border-radius: 999px;
  padding: 8px 13px;
  background: transparent;
  color: var(--desk-muted);
  cursor: pointer;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.category-filter button:hover,
.category-filter button.active {
  border-color: var(--desk-ink);
  background: var(--desk-ink);
  color: var(--desk-paper);
}

.article-row {
  --row-index: 0;
  display: grid;
  grid-template-columns: 72px 160px minmax(0, 1fr) 50px;
  align-items: start;
  border-bottom: 1px solid var(--desk-rule);
  padding: 30px 0;
  animation: row-arrival 460ms ease-out both;
  animation-delay: calc(var(--row-index) * 55ms);
}

.row-index {
  color: var(--desk-blue);
  font-family: 'Fraunces', serif;
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.row-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--desk-muted);
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
  letter-spacing: 0.07em;
  line-height: 1.45;
  text-transform: uppercase;
}

.row-copy {
  padding-right: clamp(20px, 5vw, 72px);
}

.row-copy h3 {
  margin: -5px 0 0;
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(1.35rem, 2.4vw, 2.15rem);
  font-weight: 560;
  line-height: 1.22;
  letter-spacing: -0.02em;
}

.row-copy h3 a {
  color: var(--desk-ink);
  text-decoration: none;
  transition: color 160ms ease;
}

.row-copy h3 a:hover {
  color: var(--desk-blue);
}

.row-copy p {
  max-width: 780px;
  margin: 11px 0 0;
  color: var(--desk-muted);
  font-size: 14px;
  line-height: 1.7;
}

.row-arrow {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--desk-rule);
  border-radius: 50%;
  color: var(--desk-ink);
  font-size: 17px;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.row-arrow:hover {
  border-color: var(--desk-blue);
  color: var(--desk-blue);
  transform: translate(3px, -3px);
}

.source-note {
  margin: 44px 0 0;
  color: var(--desk-muted);
  font-size: 12px;
  line-height: 1.7;
}

.source-note a {
  color: var(--desk-blue);
}

@keyframes map-arrival {
  from {
    opacity: 0;
    transform: rotate(-8deg) scale(0.92);
  }
  to {
    opacity: 1;
    transform: rotate(0) scale(1);
  }
}

@keyframes row-arrival {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .research-blog {
    width: min(100% - 36px, 760px);
    padding-top: 34px;
  }

  .research-masthead {
    min-height: 540px;
  }

  .masthead-copy {
    width: 100%;
    padding-top: 56px;
  }

  .masthead-copy h1 {
    max-width: 680px;
  }

  .signal-map {
    right: 24px;
    bottom: -92px;
    width: 280px;
    opacity: 0.58;
  }

  .featured-grid {
    grid-template-columns: 90px 1fr;
  }

  .featured-number {
    padding-top: 38px;
    font-size: 68px;
  }

  .featured-copy {
    border-right: 0;
    padding-right: 0;
  }

  .featured-thesis {
    display: none;
  }

  .index-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .category-filter {
    justify-content: flex-start;
  }

  .article-row {
    grid-template-columns: 54px minmax(0, 1fr) 42px;
  }

  .row-meta {
    grid-column: 2;
    flex-direction: row;
    flex-wrap: wrap;
    margin-bottom: 13px;
  }

  .row-copy {
    grid-column: 2;
    grid-row: 2;
  }

  .row-arrow {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}

@media (max-width: 560px) {
  .research-blog {
    width: calc(100% - 28px);
    padding-bottom: 52px;
  }

  .research-masthead {
    min-height: 490px;
  }

  .masthead-rule span:first-child {
    max-width: 190px;
  }

  .masthead-copy {
    padding-top: 46px;
  }

  .masthead-copy h1 {
    font-size: clamp(2.8rem, 14vw, 4.3rem);
  }

  .masthead-intro {
    font-size: 15px;
  }

  .signal-map {
    right: -60px;
    bottom: -84px;
    width: 240px;
  }

  .featured-note {
    margin-top: 46px;
  }

  .featured-grid {
    display: block;
  }

  .featured-number {
    padding: 24px 0 0;
    font-size: 48px;
  }

  .featured-copy {
    border-left: 0;
    padding: 12px 0 36px;
  }

  .notes-index {
    margin-top: 58px;
  }

  .article-row {
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 24px 0;
  }

  .row-index {
    font-size: 21px;
  }

  .row-meta,
  .row-copy {
    grid-column: 2;
  }

  .row-copy {
    padding-right: 0;
  }

  .row-arrow {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .signal-map,
  .article-row {
    animation: none;
  }
}
</style>
