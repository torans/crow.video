# 乌鸦视频工厂 (crow.video)

> 抖店 / 快手 / TikTok 卖家专属，AI 全自动批量生成竖屏带货视频（日产 1000+ 条）

官网: https://crow.video

---

## 产品功能

| 模块 | 说明 |
|------|------|
| **产品灵感台** | 录入商品名称、功能、亮点、受众，AI 自动分析颜色与标签 |
| **AI 口播文案** | DeepSeek 生成 80-150 字口播脚本，适合 15-30 秒短视频 |
| **语音合成** | 阿里云 Qwen TTS，多音色可选，一键合成自然语音 |
| **视频剪辑** | 两种模式：随机选片 或 VL 智能匹配（颜色/标签/文案语义对齐） |
| **混音导出** | 可选随机 BGM，输出 9:16 竖屏 MP4（默认 1080×1920） |
| **批量自动化** | 开启后自动连续生成多个视频，一键日产 1000+ 条 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Vue 3 + TypeScript + Vite |
| 桌面端 | Electron |
| UI 组件 | Vuetify 3 |
| 状态管理 | Pinia |
| 视频渲染 | FFmpeg (ffmpeg-static) |
| AI 文案 | DeepSeek Chat (AI SDK) |
| 语音合成 | 阿里云 Qwen TTS |
| 视觉匹配 | 阿里云 Qwen VL Plus |
| 数据库 | better-sqlite3 |
| 国际化 | i18next |

---

## 项目结构

```
short-video-factory/
├── electron/                  # Electron 主进程
│   ├── main.ts               # 主进程入口，窗口管理
│   ├── preload.ts            # 预加载脚本，暴露 IPC
│   ├── ipc.ts                # IPC 处理器注册
│   ├── ffmpeg/               # FFmpeg 相关逻辑
│   ├── tts/                  # Qwen TTS 语音合成
│   │   └── index.ts
│   ├── vl/                   # Qwen VL 视觉匹配
│   │   ├── analyze-product.ts   # 分析商品颜色/标签
│   │   ├── analyze-video.ts     # 分析视频片段
│   │   └── match.ts             # 智能匹配算法
│   ├── sqlite/               # SQLite 数据库
│   └── lib/                  # 工具函数
├── src/                      # Vue 渲染进程
│   ├── App.vue              # 根组件
│   ├── main.ts              # 渲染进程入口
│   ├── router/              # Vue Router
│   ├── store/               # Pinia 状态管理
│   │   └── app.ts          # 全局状态（LLM/TTS/VL 配置、渲染状态等）
│   ├── views/Home/         # 首页工作台
│   │   ├── index.vue       # 三栏布局：创意 → 素材 → 执行
│   │   └── components/
│   │       ├── ProductReference.vue   # 产品灵感台
│   │       ├── TextGenerate.vue        # AI 文案生成
│   │       ├── TtsControl.vue          # 语音合成控制
│   │       ├── VideoManage.vue         # 视频素材管理
│   │       └── VideoRender.vue          # 视频渲染控制
│   └── components/         # 公共组件
├── locales/                 # 国际化文案 (i18next)
├── dist-electron/           # Electron 构建输出
├── dist/                    # Vite 构建输出
└── package.json
```

---

## 渲染流程

```
用户点击"开始渲染"
       │
       ▼
① GenerateText     AI 生成口播文案（DeepSeek）
       │
       ▼
② SynthesizedSpeech  语音合成（Qwen TTS），获取音频时长
       │
       ▼
③ SegmentVideo    智能匹配或随机选取视频片段
                   ┌─ 智能匹配：颜色 + 标签 + 文案语义三重对齐
                   └─ 回退：随机选片
       │
       ▼
④ Rendering       FFmpeg 合成视频（混音 + 字幕 + 竖屏裁剪）
       │
       ▼
⑤ Completed       导出 MP4，自动批量下一条
```

---

## 开发

```bash
# 安装依赖（仅限 pnpm）
pnpm install

# 依赖后处理（构建 native 模块）
pnpm postinstall

# 本地开发
pnpm dev

# 构建桌面应用
pnpm build

# 代码格式化
pnpm format
```

---

## 配置说明

首次使用需在应用内配置：

| 配置项 | 说明 |
|--------|------|
| **DeepSeek API** | AI 文案生成的模型和密钥 |
| **阿里云 API Key** | 同时用于 Qwen TTS 和 Qwen VL |

输出路径、分辨率、BGM 素材路径等可在渲染配置中自行设置。

---

## 相关链接

- 官网: https://crow.video
- 导航站: https://seekaitools.com
- 博客: https://lanqiu.tech
