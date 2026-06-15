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
  border-top: 1px solid var(--vp-c-divider);
  padding: 24px 24px 32px;
  background: var(--vp-c-bg);
}
.compass-footer-inner {
  max-width: 1152px;
  margin: 0 auto;
  text-align: center;
}
.compass-footer-links {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 0 0 8px;
}
.compass-footer-links a {
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color 0.2s;
}
.compass-footer-links a:hover {
  color: var(--vp-c-brand-1);
}
.compass-footer-copy {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  margin: 0;
}
.compass-footer-copy a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}
.compass-footer-copy a:hover {
  color: var(--vp-c-brand-1);
}
</style>
