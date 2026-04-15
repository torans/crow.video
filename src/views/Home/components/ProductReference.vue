<template>
  <div class="product-reference w-full h-full">
    <v-sheet class="product-panel h-full">
      <div class="workbench-section-header product-panel__header">
        <div class="product-panel__heading">
          <div class="product-panel__selector">
            <v-select
              v-model="selectedProductId"
              :items="productItems"
              :label="t('features.product.config.selectProduct')"
              item-title="text"
              item-value="value"
              density="compact"
              hide-details
              clearable
              @update:model-value="handleSelectProduct"
            />
          </div>
        </div>
        <v-btn
          size="small"
          density="comfortable"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="showAddDialog = true"
        >
          {{ t('features.product.config.addProduct') }}
        </v-btn>
      </div>

      <div v-if="appStore.currentProduct" class="product-panel__content">
        <div class="product-panel__hero workbench-editor-surface">
          <div v-if="currentImagePaths.length" class="product-panel__gallery">
            <img
              v-for="(img, i) in currentImagePaths"
              :key="i"
              :src="'file://' + img"
              class="product-panel__image"
            />
          </div>

          <div class="product-panel__summary">
            <div class="product-panel__name-row">
              <div class="product-panel__name">{{ appStore.currentProduct.name }}</div>
              <div class="product-panel__name-actions">
                <v-btn
                  size="x-small"
                  icon="mdi-pencil"
                  variant="text"
                  color="primary"
                  @click="handleEditProduct"
                />
                <v-btn
                  size="x-small"
                  icon="mdi-delete"
                  variant="text"
                  color="error"
                  @click="showDeleteConfirm = true"
                />
              </div>
            </div>
            <div v-if="appStore.currentProduct.features" class="product-panel__row">
              <span>{{ t('features.product.config.featuresLabel') }}：</span>
              <span>{{ appStore.currentProduct.features }}</span>
            </div>
            <div v-if="appStore.currentProduct.highlights" class="product-panel__row">
              <span>{{ t('features.product.config.highlightsLabel') }}：</span>
              <span>{{ appStore.currentProduct.highlights }}</span>
            </div>
            <div v-if="appStore.currentProduct.target_audience" class="product-panel__row">
              <span>{{ t('features.product.config.targetAudienceLabel') }}：</span>
              <span>{{ appStore.currentProduct.target_audience }}</span>
            </div>
          </div>
        </div>

        <div class="product-panel__analysis workbench-editor-surface">
          <!-- <div class="product-panel__analysis-title">
            {{ workspaceText('analysisTitle') }}
          </div> -->
          <div style="display: flex; flex-direction: row; gap: 8px; text-align: space-between">
            <div v-if="currentColors.length" class="product-panel__chips">
              <span class="product-panel__meta-label"
                >{{ t('features.product.config.colorsLabel') }}:</span
              >
              <v-chip v-for="c in currentColors" :key="c" size="x-small" variant="tonal">{{
                c
              }}</v-chip>
            </div>
            <div v-if="currentTags.length" class="product-panel__chips">
              <span class="product-panel__meta-label"
                >{{ t('features.product.config.tagsLabel') }}:</span
              >
              <v-chip v-for="tag in currentTags" :key="tag" size="x-small" variant="outlined">{{
                tag
              }}</v-chip>
            </div>
          </div>
          <div
            v-if="appStore.currentProduct.description"
            class="product-panel__row product-panel__row--dense"
          >
            <span>{{ t('features.product.config.descriptionLabel') }}:</span>
            <p>{{ appStore.currentProduct.description }}</p>
          </div>
        </div>

        <div class="product-panel__actions">
          <v-btn
            size="small"
            color="primary"
            density="compact"
            variant="tonal"
            prepend-icon="mdi-eye-outline"
            :loading="analyzeLoading"
            :disabled="!hasVLConfig"
            @click="handleAnalyzeProduct"
          >
            {{ t('features.product.config.analyzeAppearance') }}
          </v-btn>
        </div>
      </div>

      <div v-else class="product-panel__empty workbench-editor-surface">
        <div class="product-panel__empty-title">{{ t('features.product.config.noProduct') }}</div>
        <div class="product-panel__empty-hint">{{ workspaceText('emptyNote') }}</div>
      </div>
    </v-sheet>

    <!-- Delete confirmation dialog -->
    <v-dialog v-model="showDeleteConfirm" max-width="400">
      <v-card
        :title="t('features.product.config.deleteConfirmTitle')"
        prepend-icon="mdi-alert-circle"
      >
        <v-card-text>{{ t('features.product.config.deleteConfirmMessage') }}</v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="plain" @click="showDeleteConfirm = false">{{
            t('common.buttons.cancel')
          }}</v-btn>
          <v-btn color="error" variant="tonal" @click="handleDeleteProduct">{{
            t('common.buttons.confirm')
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add/Edit product dialog -->
    <v-dialog v-model="showAddDialog" max-width="600" persistent>
      <v-card
        :title="
          isEditing
            ? t('features.product.config.editProduct')
            : t('features.product.config.addProduct')
        "
        :prepend-icon="isEditing ? 'mdi-pencil' : 'mdi-package-variant'"
      >
        <v-card-text class="flex flex-col gap-3">
          <v-text-field
            v-model="newProduct.name"
            :label="t('features.product.config.nameLabel')"
            :placeholder="t('features.product.config.namePlaceholder')"
            density="compact"
            hide-details
          />

          <div>
            <div class="text-sm mb-1">{{ t('features.product.config.imagesLabel') }}</div>
            <div class="flex gap-1 flex-wrap mb-1">
              <img
                v-for="(img, i) in newProduct.imagePaths"
                :key="i"
                :src="'file://' + img"
                class="w-[60px] h-[60px] object-cover rounded border cursor-pointer"
                @click="newProduct.imagePaths.splice(i, 1)"
              />
            </div>
            <v-btn size="small" prepend-icon="mdi-image-plus" @click="handleSelectImages">
              {{ t('features.product.config.selectImages') }}
            </v-btn>
          </div>

          <v-textarea
            v-model="newProduct.features"
            :label="t('features.product.config.featuresLabel')"
            :placeholder="t('features.product.config.featuresPlaceholder')"
            rows="2"
            no-resize
            hide-details
          />

          <v-textarea
            v-model="newProduct.highlights"
            :label="t('features.product.config.highlightsLabel')"
            :placeholder="t('features.product.config.highlightsPlaceholder')"
            rows="2"
            no-resize
            hide-details
          />

          <v-text-field
            v-model="newProduct.targetAudience"
            :label="t('features.product.config.targetAudienceLabel')"
            :placeholder="t('features.product.config.targetAudiencePlaceholder')"
            density="compact"
            hide-details
          />
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="plain" @click="handleCloseAddDialog">{{
            t('common.buttons.close')
          }}</v-btn>
          <v-btn color="primary" variant="tonal" :loading="saveLoading" @click="handleSaveProduct">
            {{
              isEditing
                ? t('features.product.config.updateProduct')
                : t('features.product.config.saveProduct')
            }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, toRaw } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import type { ProductReferenceRecord } from '~/electron/vl/types'

const toast = useToast()
const appStore = useAppStore()
const { t, i18next } = useTranslation()

const workspaceFallbacks = {
  title: { zh: '产品灵感台', en: 'Product Studio' },
  analysisTitle: { zh: '识别摘要', en: 'Recognition Summary' },
  emptyNote: {
    zh: '先选择一个产品，左侧创作链路才会完整激活。',
    en: 'Select a product first to unlock the full creative flow on the left.',
  },
} as const

const workspaceText = (key: keyof typeof workspaceFallbacks) => {
  const value = t(`features.product.workspace.${key}`) as string
  if (value !== `features.product.workspace.${key}`) return value
  return i18next.language?.startsWith('zh')
    ? workspaceFallbacks[key].zh
    : workspaceFallbacks[key].en
}

// Product list
const productList = ref<ProductReferenceRecord[]>([])
const selectedProductId = ref<string | null>(appStore.currentProductId)

const productItems = computed(() =>
  productList.value.map((p: ProductReferenceRecord) => ({ text: p.name, value: p.id })),
)

const currentImagePaths = computed(() => {
  if (!appStore.currentProduct) return []
  try {
    return JSON.parse(appStore.currentProduct.image_paths)
  } catch {
    return []
  }
})

const currentColors = computed(() => {
  if (!appStore.currentProduct) return []
  try {
    return JSON.parse(appStore.currentProduct.colors)
  } catch {
    return []
  }
})

const currentTags = computed(() => {
  if (!appStore.currentProduct) return []
  try {
    return JSON.parse(appStore.currentProduct.tags)
  } catch {
    return []
  }
})

const hasVLConfig = computed(() => {
  return !!(appStore.vlConfig.apiUrl && appStore.vlConfig.modelName)
})

// Load products on mount
const loadProducts = async () => {
  try {
    productList.value = await window.electron.vlGetProductReferences()
    // Restore current product
    if (appStore.currentProductId) {
      const found = productList.value.find(
        (p: ProductReferenceRecord) => p.id === appStore.currentProductId,
      )
      if (found) {
        appStore.updateCurrentProduct(found)
        selectedProductId.value = found.id
      } else {
        appStore.updateCurrentProduct(null)
        selectedProductId.value = null
      }
    }
  } catch (e) {
    console.warn('Failed to load products:', e)
  }
}
onMounted(loadProducts)

// Select product
const handleSelectProduct = async (id: string | null) => {
  if (!id) {
    appStore.updateCurrentProduct(null)
    return
  }
  const product = productList.value.find((p: ProductReferenceRecord) => p.id === id)
  appStore.updateCurrentProduct(product ?? null)
}

// Add/Edit product dialog
const showAddDialog = ref(false)
const showDeleteConfirm = ref(false)
const isEditing = ref(false)
const editingProductId = ref<string | null>(null)
const saveLoading = ref(false)
const newProduct = ref({
  name: '',
  imagePaths: [] as string[],
  features: '',
  highlights: '',
  targetAudience: '',
})

const resetNewProduct = () => {
  newProduct.value = { name: '', imagePaths: [], features: '', highlights: '', targetAudience: '' }
}

const handleCloseAddDialog = () => {
  showAddDialog.value = false
  isEditing.value = false
  editingProductId.value = null
  resetNewProduct()
}

const handleEditProduct = () => {
  if (!appStore.currentProduct) return
  isEditing.value = true
  editingProductId.value = appStore.currentProduct.id
  newProduct.value = {
    name: appStore.currentProduct.name,
    imagePaths: currentImagePaths.value,
    features: appStore.currentProduct.features || '',
    highlights: appStore.currentProduct.highlights || '',
    targetAudience: appStore.currentProduct.target_audience || '',
  }
  showAddDialog.value = true
}

const handleSelectImages = async () => {
  const paths = await window.electron.selectImages({
    title: t('features.product.config.selectImages'),
  })
  if (paths.length) {
    newProduct.value.imagePaths.push(...paths)
  }
}

const handleSaveProduct = async () => {
  if (!newProduct.value.name.trim()) {
    toast.warning(t('features.product.errors.nameRequired'))
    return
  }
  if (!newProduct.value.imagePaths.length) {
    toast.warning(t('features.product.errors.imagesRequired'))
    return
  }

  saveLoading.value = true
  try {
    if (isEditing.value && editingProductId.value) {
      await window.electron.vlUpdateProductReference({
        id: editingProductId.value,
        name: newProduct.value.name,
        imagePaths: [...newProduct.value.imagePaths],
        features: newProduct.value.features,
        highlights: newProduct.value.highlights,
        targetAudience: newProduct.value.targetAudience,
      })
      toast.success(t('features.product.success.updated'))
    } else {
      await window.electron.vlSaveProductReference({
        name: newProduct.value.name,
        imagePaths: [...newProduct.value.imagePaths],
        features: newProduct.value.features,
        highlights: newProduct.value.highlights,
        targetAudience: newProduct.value.targetAudience,
      })
      toast.success(t('features.product.success.saved'))
    }
    showAddDialog.value = false
    isEditing.value = false
    editingProductId.value = null
    resetNewProduct()
    await loadProducts()
    // Refresh current product
    const updated = productList.value.find(
      (p: ProductReferenceRecord) => p.id === (editingProductId.value || appStore.currentProductId),
    )
    if (updated) {
      selectedProductId.value = updated.id
      appStore.updateCurrentProduct(updated)
    }
  } catch (e: any) {
    toast.error(t('features.product.errors.saveFailed'))
    console.error(e)
  } finally {
    saveLoading.value = false
  }
}

// Analyze product appearance
const analyzeLoading = ref(false)
const handleAnalyzeProduct = async () => {
  if (!appStore.currentProduct) return
  if (!hasVLConfig.value) {
    toast.warning(t('features.product.errors.vlNotConfigured'))
    return
  }

  analyzeLoading.value = true
  try {
    const analysis = await window.electron.vlAnalyzeProductReference({
      imagePaths: JSON.parse(appStore.currentProduct.image_paths),
      apiConfig: toRaw(appStore.vlConfig),
    })
    await window.electron.vlUpdateProductAnalysis({
      id: appStore.currentProduct.id,
      analysis,
    })
    toast.success(t('features.product.success.analyzeCompleted'))
    await loadProducts()
    // Refresh current product
    const updated = productList.value.find(
      (p: ProductReferenceRecord) => p.id === appStore.currentProductId,
    )
    if (updated) appStore.updateCurrentProduct(updated)
  } catch (e: any) {
    toast.error(t('features.product.errors.analyzeFailed'))
    console.error(e)
  } finally {
    analyzeLoading.value = false
  }
}

// Delete product
const handleDeleteProduct = async () => {
  if (!appStore.currentProduct) return
  showDeleteConfirm.value = false
  try {
    await window.electron.vlDeleteProductReference({ id: appStore.currentProduct.id })
    toast.success(t('features.product.success.deleted'))
    appStore.updateCurrentProduct(null)
    selectedProductId.value = null
    await loadProducts()
  } catch (e: any) {
    toast.error(t('features.product.errors.deleteFailed'))
    console.error(e)
  }
}
</script>

<style lang="scss" scoped>
.product-reference {
  min-height: 0;
}

.product-panel {
  height: 100%;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.product-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.product-panel__heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.product-panel__icon {
  color: var(--apple-primary);
}

.product-panel__selector {
  min-width: 200px;
  border-radius: 18px;
}

.product-panel__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.product-panel__hero {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 14px;
  padding: 14px;
  border-radius: 20px;
}

.product-panel__gallery {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-panel__image {
  width: 85%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 16px;
  border: 1px solid rgba(55, 39, 24, 0.08);
}

.product-panel__summary {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.product-panel__name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--apple-text);
}

.product-panel__name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.product-panel__name-actions {
  display: flex;
  gap: 4px;
}

.product-panel__row {
  display: flex;
  flex-direction: row;
  gap: 4px;
}

.product-panel__row span,
.product-panel__meta-label {
  min-width: 60px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--apple-text-tertiary);
}

.product-panel__row p {
  margin: 0;
  color: var(--apple-text-secondary);
  // line-height: 1.2;
}

.product-panel__analysis {
  flex: 1;
  // min-height: 80px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.product-panel__analysis-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--workbench-text-faint);
}

.product-panel__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.product-panel__row--dense {
  padding-top: 2px;
}

.product-panel__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.product-panel__empty {
  flex: 1;
  min-height: 0;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.product-panel__empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--apple-text);
}

.product-panel__empty-hint {
  font-size: 12px;
  color: var(--apple-text-secondary);
}

.workbench-editor-surface {
  background: rgba(255, 251, 247, 0.9);
  border: 1px solid rgba(55, 39, 24, 0.08);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(66, 45, 18, 0.04);
}
</style>
