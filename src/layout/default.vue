<template>
  <div class="layout-container">
    <div class="logo" v-if="!route.meta.hideAppIcon">
      <img src="/icon.png" alt="" />
      <span>{{ t('app.name') }}</span>
    </div>
    <div class="window-control-bar">
      <div class="window-no-drag">
        <v-menu location="bottom right">
          <template v-slot:activator="{ props }">
            <div class="control-btn control-btn-translate" v-bind="props">
              <v-icon icon="mdi-translate" size="small" />
            </div>
          </template>
          <v-list
            class="p-2 space-y-1"
            activatable
            :activated="i18next.language"
            @update:activated="handleChangeLanguage"
          >
            <v-list-item
              v-for="(item, index) in i18nLanguages"
              :key="index"
              :value="item.code"
              color="primary"
              density="compact"
              rounded
            >
              <v-list-item-title>{{ item.name }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="control-btn control-btn-min" @click="handleMin">
        <v-icon icon="mdi-window-minimize" size="small" />
      </div>
      <div class="control-btn control-btn-max" @click="handleMax">
        <v-icon icon="mdi-window-maximize" size="small" v-if="!windowIsMaxed" />
        <v-icon icon="mdi-window-restore" size="small" v-else />
      </div>
      <div class="control-btn control-btn-close" @click="handleClose">
        <v-icon icon="mdi-window-close" size="small" />
      </div>
    </div>
    <RouterView />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTranslation } from 'i18next-vue'
import { i18nLanguages } from '~/electron/i18n/common-options'

const { i18next, t } = useTranslation()
// const lang = ref(i18next.language)
// console.log('i18next.language', i18next.language)

document.title = t('app.name')

const route = useRoute()
const windowIsMaxed = ref(false)

const handleChangeLanguage = (lng: unknown) => {
  console.log('handleChangeLanguage', lng)
  if ((lng as string[])[0]) {
    window.i18n.changeLanguage((lng as string[])[0])
  }
}

window.addEventListener('resize', async () => {
  windowIsMaxed.value = await window.electron.isWinMaxed()
})

const handleMin = () => {
  window.electron.winMin()
}
const handleMax = () => {
  window.electron.winMax()
}
const handleClose = () => {
  window.electron.winClose()
}
</script>

<style lang="scss" scoped>
.layout-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: var(--apple-bg);

  --title-bar-height: 38px;

  .logo {
    position: absolute;
    z-index: 9999;
    top: 0;
    left: 0;
    height: var(--title-bar-height);
    padding-left: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--apple-text);
    user-select: none;
    -webkit-app-region: drag;

    img {
      width: 18px;
      height: 18px;
      border-radius: 4px;
    }

    span {
      opacity: 0.7;
    }
  }

  .window-control-bar {
    position: absolute;
    z-index: 9999;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    font-size: 13px;
    user-select: none;

    .control-btn {
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: var(--title-bar-height);
      box-sizing: border-box;
      color: var(--apple-text);
      opacity: 0.4;
      border-radius: 0;

      &:hover {
        opacity: 0.8;
        background: rgba(0, 0, 0, 0.04);
      }

      &-close {
        &:hover {
          opacity: 1;
          color: white;
          background: #ff5f57;
        }
      }
    }
  }
}
</style>
