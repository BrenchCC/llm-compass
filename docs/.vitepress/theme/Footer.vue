<script setup lang="ts">
const links = [
  { text: '小红书', href: 'https://www.xiaohongshu.com/user/profile/64ccf1d6000000000b00a502' },
  { text: 'GitHub', href: 'https://github.com/BrenchCC' }
]
</script>

<template>
  <footer class="compass-footer">
    <div class="compass-footer-inner">
      <p class="compass-footer-links">
        <a
          v-for="l in links"
          :key="l.href"
          :href="l.href"
          target="_blank"
          rel="noopener noreferrer"
          >{{ l.text }}</a
        >
      </p>
      <p class="compass-footer-copy">
        © 2026 Brench · 微信 BrenchChen · LLM Compass — LLM 训练算法知识图谱 ·
        <a href="/llm-compass/about">关于本站</a>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.compass-footer {
  position: relative;
  border-top: 1px solid var(--vp-c-divider);
  padding: 32px 24px 38px;
  background:
    linear-gradient(180deg, var(--vp-c-bg-alt), var(--vp-c-bg) 72%);
}
.compass-footer::before {
  position: absolute;
  top: -1px;
  left: 50%;
  width: 72px;
  height: 2px;
  background: var(--vp-c-brand-1);
  content: '';
  transform: translateX(-50%);
}
.compass-footer-inner {
  max-width: 1152px;
  margin: 0 auto;
  text-align: center;
}
.compass-footer-links {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin: 0 0 10px;
}
.compass-footer-links a {
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.06em;
  color: var(--vp-c-text-2);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
  transition:
    color 0.16s ease,
    text-decoration-color 0.16s ease;
}
.compass-footer-links a:hover {
  color: var(--vp-c-brand-1);
  text-decoration-color: currentColor;
}
.compass-footer-copy {
  margin: 0;
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.75;
  letter-spacing: 0.02em;
}
.compass-footer-copy a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}
.compass-footer-copy a:hover {
  color: var(--vp-c-brand-1);
}

.compass-footer a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
  border-radius: 2px;
}

@media (max-width: 640px) {
  .compass-footer {
    padding: 28px 20px 32px;
  }

  .compass-footer-links {
    gap: 20px;
  }

  .compass-footer-copy {
    max-width: 34em;
    margin: 0 auto;
  }
}
</style>
