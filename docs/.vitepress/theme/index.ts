import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import BlogIndex from './BlogIndex.vue'
import Footer from './Footer.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BlogIndex', BlogIndex)
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(Footer)
    })
  }
}
