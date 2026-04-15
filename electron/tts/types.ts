// Qwen TTS API 配置
export interface QwenTtsConfig {
  apiKey: string
  apiUrl: string
  model: string
  voice: string
  languageType: string
}

// 语音合成通用参数
export interface TtsSynthesizeParams {
  text: string
  config: QwenTtsConfig
}

// 合成到文件的参数
export interface TtsSynthesizeToFileParams extends TtsSynthesizeParams {
  outputPath?: string
}

// 合成到文件的结果
export interface TtsSynthesizeToFileResult {
  /** 合成后的音频时长，单位秒 */
  duration: number | undefined
}

// DashScope API 响应格式
export interface DashScopeResponse {
  status_code: number
  request_id: string
  code: string
  message: string
  output: {
    finish_reason: string
    audio: {
      data: string
      url: string
      id: string
      expires_at: number
    }
  }
  usage?: {
    characters?: number
  }
}

// 预定义音色
export interface TtsVoiceOption {
  name: string
  label: string
  gender: 'female' | 'male'
}

export const QWEN_TTS_VOICES: TtsVoiceOption[] = [
  // 女声
  { name: 'Cherry', label: 'Cherry (芊悦·阳光甜美)', gender: 'female' },
  { name: 'Serena', label: 'Serena (苏瑶·温柔知性)', gender: 'female' },
  { name: 'Chelsie', label: 'Chelsie (千雪·二次元)', gender: 'female' },
  { name: 'Momo', label: 'Momo (茉兔·撒娇搞怪)', gender: 'female' },
  { name: 'Vivian', label: 'Vivian (十三·可爱小暴躁)', gender: 'female' },
  { name: 'Maia', label: 'Maia (四月·知性温柔)', gender: 'female' },
  { name: 'Bella', label: 'Bella (萌宝·小萝莉)', gender: 'female' },
  { name: 'Jennifer', label: 'Jennifer (詹妮弗·美语女声)', gender: 'female' },
  { name: 'Katerina', label: 'Katerina (卡捷琳娜·御姐)', gender: 'female' },
  { name: 'Bellona', label: 'Bellona (燕铮莺·洪亮清晰)', gender: 'female' },
  { name: 'Bunny', label: 'Bunny (萌小姬·萌萝莉)', gender: 'female' },
  { name: 'Nini', label: 'Nini (邻家妹妹·软糯)', gender: 'female' },
  { name: 'Seren', label: 'Seren (小婉·温和舒缓)', gender: 'female' },
  { name: 'Stella', label: 'Stella (少女阿月·甜美)', gender: 'female' },
  { name: 'Mia', label: 'Mia (乖小妹·温顺乖巧)', gender: 'female' },
  { name: 'Elias', label: 'Elias (墨讲师·叙事)', gender: 'female' },
  { name: 'Jada', label: 'Jada (上海阿珍·沪语)', gender: 'female' },
  { name: 'Sonrisa', label: 'Sonrisa (索尼莎·拉美)', gender: 'female' },
  { name: 'Sohee', label: 'Sohee (素熙·韩国)', gender: 'female' },
  { name: 'Ono Anna', label: 'Ono Anna (小野杏·日本)', gender: 'female' },
  { name: 'Sunny', label: 'Sunny (晴儿·四川话)', gender: 'female' },
  { name: 'Kiki', label: 'Kiki (阿清·粤语)', gender: 'female' },
  // 男声
  { name: 'Ethan', label: 'Ethan (晨煦·阳光温暖)', gender: 'male' },
  { name: 'Moon', label: 'Moon (月白·率性帅气)', gender: 'male' },
  { name: 'Kai', label: 'Kai (凯·低音炮)', gender: 'male' },
  { name: 'Nofish', label: 'Nofish (不吃鱼·设计师)', gender: 'male' },
  { name: 'Ryan', label: 'Ryan (甜茶·戏感)', gender: 'male' },
  { name: 'Aiden', label: 'Aiden (艾登·美语男声)', gender: 'male' },
  { name: 'Eldric Sage', label: 'Eldric Sage (沧明子·沉稳老者)', gender: 'male' },
  { name: 'Mochi', label: 'Mochi (沙小弥·小大人)', gender: 'male' },
  { name: 'Vincent', label: 'Vincent (田叔·沙哑烟嗓)', gender: 'male' },
  { name: 'Neil', label: 'Neil (阿闻·字正腔圆)', gender: 'male' },
  { name: 'Arthur', label: 'Arthur (徐大爷·质朴)', gender: 'male' },
  { name: 'Pip', label: 'Pip (顽屁小孩·童真)', gender: 'male' },
  { name: 'Andre', label: 'Andre (安德雷·磁性沉稳)', gender: 'male' },
  { name: 'Lenn', label: 'Lenn (莱恩·理性叛逆)', gender: 'male' },
  { name: 'Bodega', label: 'Bodega (博德加·西班牙)', gender: 'male' },
  { name: 'Alek', label: 'Alek (阿列克·俄语)', gender: 'male' },
  { name: 'Dolce', label: 'Dolce (多尔切·意大利)', gender: 'male' },
  { name: 'Emilien', label: 'Emilien (埃米尔安·法语)', gender: 'male' },
  { name: 'Radio Gol', label: 'Radio Gol (拉迪奥·葡语)', gender: 'male' },
  { name: 'Dylan', label: 'Dylan (晓东·北京话)', gender: 'male' },
  { name: 'Li', label: 'Li (老李·南京话)', gender: 'male' },
  { name: 'Marcus', label: 'Marcus (秦川·陕西话)', gender: 'male' },
  { name: 'Roy', label: 'Roy (阿杰·闽南话)', gender: 'male' },
  { name: 'Peter', label: 'Peter (李彼得·天津话)', gender: 'male' },
  { name: 'Eric', label: 'Eric (程川·四川话)', gender: 'male' },
  { name: 'Rocky', label: 'Rocky (阿强·粤语)', gender: 'male' },
]

export const QWEN_TTS_LANGUAGES = [
  { value: 'Auto', label: '自动检测' },
  { value: 'Chinese', label: '中文' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: '日本語' },
  { value: 'Korean', label: '한국어' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
  { value: 'Spanish', label: 'Español' },
  { value: 'Russian', label: 'Русский' },
  { value: 'Italian', label: 'Italiano' },
  { value: 'Portuguese', label: 'Português' },
]
