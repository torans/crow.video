import 'vuetify/styles/main.sass'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'

import 'virtual:uno.css'
import './assets/base.scss'

import { createApp } from 'vue'
import router from './router/index.ts'
import store, { useAppStore } from './store/index.ts'
import App from './App.vue'

import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import i18nInitialized from './lib/i18n.ts'

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'crow',
    themes: {
      crow: {
        dark: false,
        colors: {
          primary: '#7c3aed',
          secondary: '#64748b',
          accent: '#f59e0b',
          error: '#ef4444',
          warning: '#f59e0b',
          info: '#3b82f6',
          success: '#34c759',
          background: '#f5f5f7',
          surface: '#ffffff',
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
          'on-surface': '#1d1d1f',
          'on-background': '#1d1d1f',
        },
      },
    },
  },
  defaults: {
    VSheet: {
      rounded: 0,
      elevation: 0,
    },
    VBtn: {
      rounded: 'lg',
      elevation: 0,
      ripple: false,
      variant: 'flat',
    },
    VCard: {
      rounded: 0,
      elevation: 0,
      ripple: false,
    },
    VTextField: {
      variant: 'solo-filled',
      hideDetails: true,
      flat: true,
    },
    VTextarea: {
      variant: 'solo-filled',
      flat: true,
    },
    VSelect: {
      variant: 'solo-filled',
      flat: true,
    },
    VChip: {
      rounded: 'pill',
      size: 'small',
    },
    VSwitch: {
      inset: true,
      color: 'primary',
    },
    VListItem: {
      ripple: false,
    },
  },
})

const app = createApp(App)

app.use(vuetify)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(Toast as any, {
  position: 'bottom-left',
  pauseOnFocusLoss: false,
  closeOnClick: false,
})
app.use(router)
app.use(store)

// 初始化并应用国际化
i18nInitialized().then(() => {
  app.use(I18NextVue, { i18next })
  app.mount('#app').$nextTick(() => {
    // 测试消息
    window.ipcRenderer.on('main-process-message', (_event, message) => {
      console.log(message)
    })

    // 监听主进程切换语言
    window.ipcRenderer.on('i18n-changeLanguage', (_event, lng) => {
      i18next.changeLanguage(lng)
      useAppStore().updateLocale(lng)
    })
  })
})
