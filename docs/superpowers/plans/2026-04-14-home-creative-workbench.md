# Home Creative Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the home screen into a higher-end creative workbench that keeps the current three-column workflow, makes the left column the primary stage, and preserves all existing business behavior.

**Architecture:** Keep the current component boundaries and state flows intact, but refactor the page shell and component templates so the home screen reads as a coordinated creative console instead of independent form cards. Centralize the new visual language in `src/assets/base.scss`, then reshape each home component around consistent section chrome, panel headers, and action bars without touching the Electron-facing business logic.

**Tech Stack:** Vue 3 SFCs, Vuetify 3, UnoCSS utility classes, SCSS, Pinia, Electron renderer bridge

**Localization Constraint:** Any new visible UI copy introduced by this redesign must follow the active application language. Do not mix Chinese and English in the same surface unless the text is an unavoidable proper noun, brand, or technical term that is not realistically translated.

---

## File Structure

- Modify: `src/assets/base.scss`
  Responsibility: global design tokens, Vuetify overrides, shared panel/editor utility classes for the redesigned home workbench.
- Modify: `src/views/Home/index.vue`
  Responsibility: page shell, title-bar spacing, three-column proportions, top-level workbench framing.
- Modify: `src/views/Home/components/ProductReference.vue`
  Responsibility: source-material panel UI for product selection, summary, analysis chips, and product actions.
- Modify: `src/views/Home/components/TextGenerate.vue`
  Responsibility: prompt editor and output canvas layout, toolbar arrangement, dialog positioning, output-area treatment.
- Modify: `src/views/Home/components/VideoManage.vue`
  Responsibility: asset-browser layout, library toolbar, grid framing, analysis controls grouping.
- Modify: `src/views/Home/components/TtsControl.vue`
  Responsibility: compact audio-console presentation and visible TTS controls.
- Modify: `src/views/Home/components/VideoRender.vue`
  Responsibility: execution-tower layout, render status framing, progress display, CTA grouping, footer placement.
- Verify: `package.json`
  Responsibility: source of supported verification commands, specifically `pnpm build` and `pnpm format` if needed.

### Task 1: Refactor Global Design Tokens

**Files:**
- Modify: `src/assets/base.scss`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Add failing verification target**

Define the expected visual contract before editing styles:

```text
Expected after this task:
- Background is no longer a flat Apple-style gray.
- Panels have differentiated surface roles: shell, panel, canvas, and muted blocks.
- Buttons, fields, chips, switches, dialogs, and sheets share one consistent creative-workbench language.
- Shared utility classes exist for section headers, meta text, toolbars, and editor-like surfaces.
```

- [ ] **Step 2: Verify the current app still boots before style refactor**

Run: `pnpm build`
Expected: build completes successfully before any redesign edits.

- [ ] **Step 3: Replace the token set and add shared chrome classes**

Update `src/assets/base.scss` by replacing the Apple-lite token palette and app-wide overrides with a more intentional workbench system. Keep the same global responsibility, but introduce explicit surface layers and reusable workbench utilities:

```scss
:root {
  --workbench-bg: #f3efe7;
  --workbench-bg-accent: radial-gradient(circle at top left, rgba(91, 108, 255, 0.14), transparent 30%),
    radial-gradient(circle at 85% 15%, rgba(255, 161, 107, 0.18), transparent 24%),
    linear-gradient(180deg, #f7f2eb 0%, #f1ece4 100%);
  --workbench-panel: rgba(255, 252, 248, 0.88);
  --workbench-panel-strong: rgba(255, 255, 255, 0.96);
  --workbench-canvas: #fcfaf7;
  --workbench-muted: #ebe4da;
  --workbench-border: rgba(78, 60, 40, 0.08);
  --workbench-border-strong: rgba(55, 39, 24, 0.16);
  --workbench-text: #221b15;
  --workbench-text-soft: #6d6257;
  --workbench-text-faint: #97897b;
  --workbench-accent: #5a56e9;
  --workbench-accent-strong: #4540d8;
  --workbench-accent-soft: rgba(90, 86, 233, 0.12);
  --workbench-success-soft: rgba(29, 179, 116, 0.14);
  --workbench-danger-soft: rgba(235, 87, 87, 0.12);
  --workbench-shadow-sm: 0 10px 30px rgba(66, 45, 18, 0.06);
  --workbench-shadow-md: 0 20px 50px rgba(66, 45, 18, 0.10);
  --workbench-radius-lg: 24px;
  --workbench-radius-md: 18px;
  --workbench-radius-sm: 14px;
}

body {
  background: var(--workbench-bg);
  color: var(--workbench-text);
}

#app {
  background: var(--workbench-bg-accent);
}

.workbench-panel {
  background: var(--workbench-panel);
  border: 1px solid var(--workbench-border);
  border-radius: var(--workbench-radius-lg);
  box-shadow: var(--workbench-shadow-sm);
}

.workbench-panel--strong {
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(250,246,241,0.92));
  border: 1px solid var(--workbench-border-strong);
  box-shadow: var(--workbench-shadow-md);
}

.workbench-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workbench-section-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--workbench-text-faint);
}

.workbench-section-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--workbench-text);
}

.workbench-section-note {
  font-size: 12px;
  color: var(--workbench-text-soft);
}

.workbench-toolbar,
.workbench-inline-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.workbench-editor-surface {
  background: var(--workbench-canvas);
  border: 1px solid rgba(55, 39, 24, 0.08);
  border-radius: 20px;
}
```

- [ ] **Step 4: Retune Vuetify global primitives to match the new system**

In the same file, update the existing overrides so `v-sheet`, `v-card`, `v-btn`, `v-field`, `v-list`, `v-chip`, and `v-switch` inherit the workbench palette instead of the current Apple styling:

```scss
.v-sheet {
  background: var(--workbench-panel) !important;
  border: 1px solid var(--workbench-border) !important;
  border-radius: var(--workbench-radius-lg) !important;
  box-shadow: var(--workbench-shadow-sm) !important;
}

.v-card {
  background: var(--workbench-panel-strong) !important;
  border: 1px solid var(--workbench-border-strong) !important;
  border-radius: calc(var(--workbench-radius-lg) + 2px) !important;
  box-shadow: var(--workbench-shadow-md) !important;
}

.v-btn {
  min-height: 36px !important;
  border-radius: 14px !important;
  font-weight: 600 !important;
  letter-spacing: -0.01em !important;
}

.v-btn.v-btn--variant-tonal {
  background: var(--workbench-accent-soft) !important;
  color: var(--workbench-accent) !important;
}

.v-btn.bg-primary {
  background: linear-gradient(135deg, var(--workbench-accent), var(--workbench-accent-strong)) !important;
  color: #fff !important;
}

.v-field--variant-solo-filled {
  background: rgba(118, 98, 77, 0.06) !important;
  border: 1px solid transparent !important;
}

.v-field--focused.v-field--variant-solo-filled {
  background: rgba(90, 86, 233, 0.05) !important;
  box-shadow: 0 0 0 3px rgba(90, 86, 233, 0.10) !important;
}
```

- [ ] **Step 5: Run build after the global style refactor**

Run: `pnpm build`
Expected: PASS with no Sass or type errors introduced by the global redesign.

### Task 2: Rebuild the Page Shell and Column Hierarchy

**Files:**
- Modify: `src/views/Home/index.vue`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Define the shell outcome**

```text
Expected after this task:
- The page reads as one integrated workbench.
- Left column is visually dominant without breaking the three-column structure.
- Middle column remains a strong browser area.
- Right column becomes a narrower execution tower.
```

- [ ] **Step 2: Replace percentage-height stacking with a stronger workbench shell**

Update the template in `src/views/Home/index.vue` so the page content is wrapped in one workbench container and the left column is visually primary:

```vue
<template>
  <div class="home-workbench">
    <div class="home-titlebar window-drag">
      <div class="window-control-bar-no-drag-mask"></div>
    </div>

    <div class="home-workbench__body">
      <section class="home-column home-column--creative">
        <div class="home-column-stack home-column-stack--creative-top">
          <ProductReference />
        </div>
        <div class="home-column-stack home-column-stack--creative-bottom">
          <TextGenerate
            ref="TextGenerateInstance"
            :disabled="appStore.renderStatus === RenderStatus.GenerateText"
          />
        </div>
      </section>

      <section class="home-column home-column--assets">
        <VideoManage
          ref="VideoManageInstance"
          :disabled="appStore.renderStatus === RenderStatus.SegmentVideo"
        />
      </section>

      <section class="home-column home-column--execute">
        <TtsControl
          ref="TtsControlInstance"
          :disabled="appStore.renderStatus === RenderStatus.SynthesizedSpeech"
        />
        <VideoRender @render-video="handleRenderVideo" @cancel-render="handleCancelRender" />
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Add scoped shell styles for proportions and spacing**

Append a scoped `<style lang="scss">` block in `src/views/Home/index.vue` to replace the current utility-only layout with explicit workbench structure:

```scss
.home-workbench {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.home-titlebar {
  width: 100%;
  height: 38px;
  position: relative;
  border-bottom: 1px solid rgba(55, 39, 24, 0.08);
}

.home-workbench__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(420px, 1.15fr) minmax(360px, 0.92fr) minmax(320px, 0.78fr);
  gap: 16px;
  padding: 16px;
}

.home-column {
  min-width: 0;
  min-height: 0;
}

.home-column--creative,
.home-column--execute {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home-column-stack--creative-top {
  flex: 0 0 40%;
  min-height: 280px;
}

.home-column-stack--creative-bottom {
  flex: 1;
  min-height: 0;
}

.home-column--assets,
.home-column--execute > :last-child {
  min-height: 0;
}
```

- [ ] **Step 4: Run build after the shell refactor**

Run: `pnpm build`
Expected: PASS with the home page still compiling and no template/type regressions.

### Task 3: Turn ProductReference into a Source-Material Panel

**Files:**
- Modify: `src/views/Home/components/ProductReference.vue`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Define the panel behavior target**

```text
Expected after this task:
- Product selection and product summary feel like one premium source-material panel.
- Empty state is intentionally framed.
- Existing actions (add, analyze, delete) remain unchanged.
```

- [ ] **Step 2: Replace the template with a stronger panel hierarchy**

Refactor the template to add an explicit header, richer summary surface, and better empty state while preserving the existing bindings and handlers:

```vue
<template>
  <div class="product-reference h-full">
    <v-sheet class="product-panel workbench-panel--strong h-full">
      <div class="workbench-section-header mb-4">
        <div>
          <div class="workbench-section-kicker">{{ t('features.product.workspace.kicker') }}</div>
          <div class="workbench-section-title">{{ t('features.product.workspace.title') }}</div>
          <div class="workbench-section-note">{{ t('features.product.workspace.note') }}</div>
        </div>
        <v-btn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="showAddDialog = true"
        >
          {{ t('features.product.config.addProduct') }}
        </v-btn>
      </div>

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

      <div v-if="appStore.currentProduct" class="product-panel__content">
        <div class="product-card">
          <div class="product-card__gallery" v-if="currentImagePaths.length">
            <img
              v-for="(img, i) in currentImagePaths"
              :key="i"
              :src="'file://' + img"
              class="product-card__image"
            />
          </div>

          <div class="product-card__meta">
            <div class="product-card__name">{{ appStore.currentProduct.name }}</div>
            <div v-if="appStore.currentProduct.features" class="product-card__row">
              <span class="product-card__label">{{ t('features.product.config.featuresLabel') }}</span>
              <p>{{ appStore.currentProduct.features }}</p>
            </div>
            <div v-if="appStore.currentProduct.highlights" class="product-card__row">
              <span class="product-card__label">{{ t('features.product.config.highlightsLabel') }}</span>
              <p>{{ appStore.currentProduct.highlights }}</p>
            </div>
            <div v-if="appStore.currentProduct.target_audience" class="product-card__row">
              <span class="product-card__label">{{ t('features.product.config.targetAudienceLabel') }}</span>
              <p>{{ appStore.currentProduct.target_audience }}</p>
            </div>
          </div>
        </div>

        <div class="product-analysis workbench-editor-surface">
          <div class="product-analysis__header">
            <span>{{ t('features.product.workspace.analysisTitle') }}</span>
          </div>
          <div v-if="currentColors.length" class="flex gap-1 flex-wrap items-center mb-2">
            <span class="product-card__label">{{ t('features.product.config.colorsLabel') }}</span>
            <v-chip v-for="c in currentColors" :key="c" size="x-small" variant="tonal">{{ c }}</v-chip>
          </div>
          <div v-if="currentTags.length" class="flex gap-1 flex-wrap items-center mb-2">
            <span class="product-card__label">{{ t('features.product.config.tagsLabel') }}</span>
            <v-chip v-for="tag in currentTags" :key="tag" size="x-small" variant="outlined">{{ tag }}</v-chip>
          </div>
          <div v-if="appStore.currentProduct.description" class="product-card__row !mb-0">
            <span class="product-card__label">{{ t('features.product.config.descriptionLabel') }}</span>
            <p>{{ appStore.currentProduct.description }}</p>
          </div>
        </div>

        <div class="workbench-inline-actions mt-4">
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-eye-outline"
            :loading="analyzeLoading"
            :disabled="!hasVLConfig"
            @click="handleAnalyzeProduct"
          >
            {{ t('features.product.config.analyzeAppearance') }}
          </v-btn>
          <v-btn
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-delete"
            @click="handleDeleteProduct"
          >
            {{ t('features.product.config.deleteProduct') }}
          </v-btn>
        </div>
      </div>

      <div v-else class="product-empty workbench-editor-surface">
        <div class="product-empty__title">{{ t('features.product.config.noProduct') }}</div>
        <div class="product-empty__note">{{ t('features.product.workspace.emptyNote') }}</div>
      </div>

      <!-- keep the existing dialog markup and handlers -->
    </v-sheet>
  </div>
</template>
```

- [ ] **Step 3: Add scoped styles for the source-material presentation**

Append scoped styles that support the new structure while keeping dialogs and logic unchanged:

```scss
.product-panel {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.product-panel__selector {
  margin-bottom: 16px;
}

.product-panel__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}

.product-card {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 16px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 248, 240, 0.9);
  border: 1px solid rgba(55, 39, 24, 0.08);
}

.product-card__gallery {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-card__image {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 16px;
}

.product-card__name {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 12px;
}

.product-card__label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--workbench-text-faint);
  margin-bottom: 4px;
}

.product-card__row p {
  margin: 0;
  color: var(--workbench-text-soft);
  line-height: 1.55;
}

.product-analysis,
.product-empty {
  padding: 16px;
}
```

- [ ] **Step 4: Run build after the ProductReference refactor**

Run: `pnpm build`
Expected: PASS and no TypeScript/template regressions in `ProductReference.vue`.

### Task 4: Turn TextGenerate into the Main Editorial Surface

**Files:**
- Modify: `src/views/Home/components/TextGenerate.vue`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Define the editor target**

```text
Expected after this task:
- Prompt input and generated output read as one editorial workspace.
- Language/config/generate actions move into a dedicated toolbar.
- Output area feels like a result canvas instead of a default textarea box.
```

- [ ] **Step 2: Rebuild the prompt and output template structure**

Keep the existing generation logic, dialogs, and exposed methods, but replace the layout with a clearer editor shell:

```vue
<template>
  <div class="text-generate h-full">
    <v-form class="h-full" :disabled="disabled">
      <v-sheet class="text-panel h-full">
        <div class="workbench-section-header mb-4">
          <div>
            <div class="workbench-section-kicker">{{ t('features.llm.workspace.kicker') }}</div>
            <div class="workbench-section-title">{{ t('features.llm.workspace.title') }}</div>
            <div class="workbench-section-note">{{ t('features.llm.workspace.note') }}</div>
          </div>
          <div class="workbench-toolbar">
            <v-select
              v-model="appStore.llmConfig.language"
              :items="languageOptions"
              item-title="label"
              item-value="value"
              density="compact"
              hide-details
              variant="outlined"
              class="text-panel__language"
            />
            <v-dialog v-model="configDialogShow" max-width="600" persistent>
              <template v-slot:activator="{ props: activatorProps }">
                <v-btn v-bind="activatorProps" size="small" variant="tonal" :disabled="disabled">
                  {{ t('common.buttons.config') }}
                </v-btn>
              </template>
              <!-- keep existing config card -->
            </v-dialog>
            <v-btn
              v-if="!isGenerating"
              size="small"
              prepend-icon="mdi-auto-fix"
              color="primary"
              :disabled="disabled"
              @click="handleGenerate"
            >
              {{ t('common.buttons.generate') }}
            </v-btn>
            <v-btn
              v-else
              size="small"
              prepend-icon="mdi-stop"
              color="error"
              :disabled="disabled"
              @click="handleStopGenerate"
            >
              {{ t('common.buttons.stop') }}
            </v-btn>
          </div>
        </div>

        <div class="text-panel__prompt workbench-editor-surface">
          <div class="text-panel__block-title">{{ t('features.llm.config.promptLabel') }}</div>
          <v-textarea
            v-model="appStore.prompt"
            hide-details
            no-resize
            rows="4"
          />
        </div>

        <div class="text-panel__output workbench-editor-surface">
          <div class="text-panel__block-header">
            <div class="text-panel__block-title">{{ t('features.llm.config.outputLabel') }}</div>
            <div class="text-panel__counter">{{ outputText.length }}</div>
          </div>
          <v-textarea
            class="h-full output-textarea"
            v-model="outputText"
            hide-details
            no-resize
          />
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>
```

- [ ] **Step 3: Add scoped styles that make the editor feel continuous**

```scss
.text-panel {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.text-panel__language {
  width: 110px;
}

.text-panel__prompt,
.text-panel__output {
  padding: 16px;
}

.text-panel__output {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.text-panel__block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.text-panel__block-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--workbench-text-faint);
}

.text-panel__counter {
  font-size: 12px;
  color: var(--workbench-text-faint);
}
```

- [ ] **Step 4: Preserve full-height textarea behavior**

Keep and adapt the current `output-textarea` deep selectors so the output area still stretches fully within the new panel:

```scss
.output-textarea {
  flex: 1;

  :deep(.v-input__control),
  :deep(.v-field),
  :deep(.v-field__field) {
    height: 100%;
  }

  :deep(textarea) {
    height: 100% !important;
    overflow-y: auto !important;
  }
}
```

- [ ] **Step 5: Run build after the TextGenerate refactor**

Run: `pnpm build`
Expected: PASS and the exposed methods remain available to `Home/index.vue`.

### Task 5: Reframe VideoManage as a Media Library

**Files:**
- Modify: `src/views/Home/components/VideoManage.vue`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Define the library outcome**

```text
Expected after this task:
- Folder selection, asset stats, and analysis actions feel like one media library.
- The asset grid is visually dominant inside the center column.
- Existing refresh/analyze/cancel logic stays unchanged.
```

- [ ] **Step 2: Refactor the template into header, library body, and operations footer**

Keep all current handlers and `defineExpose({ getVideoSegments })`, but replace the layout with a clearer hierarchy:

```vue
<template>
  <div class="video-manage h-full">
    <v-form class="h-full" :disabled="disabled">
      <v-sheet class="library-panel h-full">
        <div class="workbench-section-header mb-4">
          <div>
            <div class="workbench-section-kicker">{{ t('features.assets.workspace.kicker') }}</div>
            <div class="workbench-section-title">{{ t('features.assets.workspace.title') }}</div>
            <div class="workbench-section-note">{{ t('features.assets.workspace.note') }}</div>
          </div>
        </div>

        <div class="library-toolbar workbench-editor-surface">
          <v-text-field
            v-model="appStore.videoAssetsFolder"
            :label="t('features.assets.config.folderLabel')"
            density="compact"
            hide-details
            readonly
          />
          <v-btn
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder"
          >
            {{ t('common.buttons.selectFolder') }}
          </v-btn>
        </div>

        <div class="library-stage">
          <div class="library-stage__meta">
            <span>{{ videoAssets.length }} clips</span>
            <span v-if="analysisStatsText && appStore.analysisStatus !== 'analyzing'">{{ analysisStatsText }}</span>
          </div>

          <div class="library-stage__grid">
            <div
              v-if="videoAssets.length"
              class="w-full max-h-full overflow-y-auto grid grid-cols-3 gap-3 p-3"
            >
              <div
                class="library-stage__item"
                v-for="(item, index) in videoAssets"
                :key="index"
              >
                <VideoAutoPreview :asset="item" />
              </div>
            </div>
            <v-empty-state
              v-else
              :headline="t('emptyStates.noContent')"
              :text="t('emptyStates.hintSelectFolder')"
            />
          </div>
        </div>

        <div class="library-ops">
          <div class="library-ops__row">
            <v-btn
              block
              prepend-icon="mdi-refresh"
              :disabled="disabled || !appStore.videoAssetsFolder"
              :loading="refreshAssetsLoading"
              @click="refreshAssets"
            >
              {{ t('common.buttons.refreshAssets') }}
            </v-btn>
            <v-switch
              v-model="appStore.smartMatchEnabled"
              :label="appStore.smartMatchEnabled ? t('features.analysis.smartMatch') : t('features.analysis.randomMode')"
              color="primary"
              density="compact"
              hide-details
              :disabled="disabled"
            />
          </div>

          <div v-if="appStore.smartMatchEnabled" class="library-ops__analysis workbench-editor-surface">
            <div
              v-if="appStore.analysisStatus === 'analyzing'"
              class="rounded-lg p-3 flex flex-col gap-2"
            >
              <!-- keep existing progress/cancel markup -->
            </div>

            <v-btn
              v-else
              block
              size="small"
              prepend-icon="mdi-brain"
              color="primary"
              variant="tonal"
              :disabled="disabled || !appStore.videoAssetsFolder || !hasVLConfig"
              @click="handleAnalyzeAssets"
            >
              {{ t('features.analysis.analyzeAssets') }}
            </v-btn>
          </div>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>
```

- [ ] **Step 3: Add scoped styles for the library framing**

```scss
.library-panel {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.library-toolbar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 12px;
}

.library-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.library-stage__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--workbench-text-soft);
}

.library-stage__grid {
  flex: 1;
  min-height: 0;
  border-radius: 22px;
  background: rgba(255, 251, 246, 0.86);
  border: 1px solid rgba(55, 39, 24, 0.08);
  overflow: hidden;
}

.library-stage__item {
  min-height: 200px;
}

.library-ops {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.library-ops__row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}

.library-ops__analysis {
  padding: 12px;
}
```

- [ ] **Step 4: Run build after the VideoManage refactor**

Run: `pnpm build`
Expected: PASS and `getVideoSegments` remains exposed and usable from the parent.

### Task 6: Tighten TtsControl and Rebuild VideoRender as the Execution Tower

**Files:**
- Modify: `src/views/Home/components/TtsControl.vue`
- Modify: `src/views/Home/components/VideoRender.vue`
- Test: manual visual verification via `pnpm dev`

- [ ] **Step 1: Define the execution-tower outcome**

```text
Expected after this task:
- Upper right TTS controls feel like a compact audio console.
- Lower right render controls feel like an execution panel, not an empty box.
- Existing synthesize-to-file, try-listen, config dialogs, and render events remain unchanged.
```

- [ ] **Step 2: Refactor `TtsControl.vue` into a compact audio console**

Keep all current script logic, but replace the template with a section header and tighter visible controls:

```vue
<template>
  <div class="tts-control">
    <v-form :disabled="disabled">
      <v-sheet class="tts-panel">
        <div class="workbench-section-header mb-4">
          <div>
            <div class="workbench-section-kicker">{{ t('features.tts.workspace.kicker') }}</div>
            <div class="workbench-section-title">{{ t('features.tts.workspace.title') }}</div>
            <div class="workbench-section-note">{{ t('features.tts.workspace.note') }}</div>
          </div>
        </div>

        <div class="tts-panel__grid">
          <v-select
            v-model="appStore.ttsConfig.voice"
            label="音色"
            :items="voiceItems"
            item-title="label"
            item-value="name"
            density="compact"
          />
          <v-select
            v-model="appStore.ttsConfig.languageType"
            label="语种"
            :items="languageItems"
            item-title="label"
            item-value="value"
            density="compact"
          />
        </div>

        <div class="tts-panel__try workbench-editor-surface">
          <v-text-field
            v-model="appStore.tryListeningText"
            :label="t('features.tts.config.tryText')"
            density="compact"
          />
          <div class="workbench-inline-actions">
            <v-btn
              class="flex-1"
              prepend-icon="mdi-volume-high"
              :loading="tryListeningLoading"
              :disabled="disabled"
              @click="handleTryListening"
            >
              {{ t('features.tts.config.tryListen') }}
            </v-btn>
            <v-dialog v-model="configDialogShow" max-width="500" persistent>
              <template v-slot:activator="{ props: activatorProps }">
                <v-btn v-bind="activatorProps" :disabled="disabled">
                  {{ t('common.buttons.config') }}
                </v-btn>
              </template>
              <!-- keep existing config dialog -->
            </v-dialog>
          </div>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>
```

- [ ] **Step 3: Add scoped styles for the TTS panel**

```scss
.tts-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tts-panel__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.tts-panel__try {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

- [ ] **Step 4: Refactor `VideoRender.vue` into a denser execution panel**

Keep the current events, computed properties, config dialog, and footer handler, but replace the main template structure:

```vue
<template>
  <div class="render-panel-wrap h-0 flex-1 relative">
    <v-sheet class="render-panel h-full">
      <div class="workbench-section-header">
        <div>
          <div class="workbench-section-kicker">{{ t('features.render.workspace.kicker') }}</div>
          <div class="workbench-section-title">{{ t('features.render.workspace.title') }}</div>
          <div class="workbench-section-note">{{ t('features.render.workspace.note') }}</div>
        </div>
        <v-dialog v-model="configDialogShow" max-width="600" persistent>
          <template v-slot:activator="{ props: activatorProps }">
            <v-btn v-bind="activatorProps" :disabled="taskInProgress" variant="tonal">
              {{ t('common.buttons.config') }}
            </v-btn>
          </template>
          <!-- keep existing config card -->
        </v-dialog>
      </div>

      <div class="render-status workbench-editor-surface">
        <div class="render-status__chip">
          <!-- keep existing v-chip status mapping -->
        </div>

        <div class="render-status__body">
          <v-progress-circular
            color="primary"
            v-model="renderProgress"
            :indeterminate="taskInProgress && appStore.renderStatus !== RenderStatus.Rendering"
            :size="88"
            :width="6"
          />
          <div class="render-status__actions">
            <v-btn
              v-if="!taskInProgress"
              size="large"
              color="primary"
              prepend-icon="mdi-play"
              @click="emit('renderVideo')"
            >
              {{ t('features.render.config.startLabel') }}
            </v-btn>
            <v-btn
              v-else
              size="large"
              color="error"
              prepend-icon="mdi-stop"
              @click="emit('cancelRender')"
            >
              {{ t('features.render.config.stopLabel') }}
            </v-btn>
            <div class="render-status__hint">
              {{ taskInProgress ? t('features.render.workspace.runningHint') : t('features.render.workspace.idleHint') }}
            </div>
          </div>
        </div>
      </div>

      <div class="render-batch workbench-editor-surface">
        <v-switch
          v-model="appStore.autoBatch"
          :label="t('features.render.config.autoBatch')"
          density="compact"
          hide-details
          :disabled="taskInProgress"
        />
      </div>
    </v-sheet>

    <div class="render-footer">
      <span @click="handleOpenHomePage">{{ t('footer.poweredBy') }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Add scoped styles for the execution tower**

```scss
.render-panel {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.render-status,
.render-batch {
  padding: 18px;
}

.render-status {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.render-status__body {
  flex: 1;
  display: grid;
  place-items: center;
  gap: 20px;
  align-content: center;
}

.render-status__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.render-status__hint,
.render-footer span {
  font-size: 12px;
  color: var(--workbench-text-faint);
}

.render-footer {
  position: absolute;
  bottom: 8px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
}
```

- [ ] **Step 6: Run build after the right-column refactor**

Run: `pnpm build`
Expected: PASS and no regressions in render/TTS bindings.

### Task 7: Run Formatting and Final Verification

**Files:**
- Modify: all files touched in Tasks 1-6 if formatter changes them
- Test: full app verification

- [ ] **Step 1: Format only the touched redesign files**

Run:

```bash
pnpm prettier --write \
  src/assets/base.scss \
  src/views/Home/index.vue \
  src/views/Home/components/ProductReference.vue \
  src/views/Home/components/TextGenerate.vue \
  src/views/Home/components/VideoManage.vue \
  src/views/Home/components/TtsControl.vue \
  src/views/Home/components/VideoRender.vue
```

Expected: formatter completes successfully.

- [ ] **Step 2: Run the final build**

Run: `pnpm build`
Expected: PASS with no Vue, TypeScript, or Sass failures.

- [ ] **Step 3: Run manual behavior verification in dev mode**

Run: `pnpm dev`
Expected: app launches and the redesigned home screen renders.

Manual checks:

```text
1. Select a product and verify the product panel updates correctly.
2. Open Add Product dialog and verify it still opens/closes and saves.
3. Edit prompt text and verify language/config/generate controls still work.
4. Refresh a video folder and verify the asset grid still loads previews.
5. Enable smart match and verify analysis controls still show the right states.
6. Use TTS try-listen and confirm playback still starts.
7. Open render config dialog and confirm save still updates state.
8. Trigger start/stop render and confirm status/progress UI still changes.
```

- [ ] **Step 4: Commit the finished redesign**

```bash
git add \
  src/assets/base.scss \
  src/views/Home/index.vue \
  src/views/Home/components/ProductReference.vue \
  src/views/Home/components/TextGenerate.vue \
  src/views/Home/components/VideoManage.vue \
  src/views/Home/components/TtsControl.vue \
  src/views/Home/components/VideoRender.vue
git commit -m "feat: redesign home creative workbench"
```

Expected: commit succeeds without including unrelated dirty-worktree files.

## Self-Review

Spec coverage:

- Global visual language is covered by Task 1.
- Three-column hierarchy and left-column primacy are covered by Task 2.
- Product/source-material redesign is covered by Task 3.
- Editorial prompt/output redesign is covered by Task 4.
- Asset browser redesign is covered by Task 5.
- TTS and execution tower redesign is covered by Task 6.
- Build and manual verification are covered by Task 7.

Placeholder scan:

- No `TODO`, `TBD`, or deferred implementation markers remain.
- All verification steps use real commands that exist in `package.json`.
- Newly introduced visible copy is routed through `t(...)` keys instead of hard-coded mixed-language strings.

Type consistency:

- Existing exposed methods `handleGenerate`, `handleStopGenerate`, `getCurrentOutputText`, `clearOutputText`, and `getVideoSegments` are preserved in the plan.
- Existing event names `renderVideo` and `cancelRender` are preserved in the plan.
