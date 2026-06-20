import { useState, useEffect, useRef } from 'react';
import { Settings, Mic, Square, Trash2, Download, Sparkles, X, Sun, Moon, ChevronUp, ChevronDown, Languages } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<any>;
      processTranscript: (llmConfig: any, prompt: string) => Promise<any>;
      transcribePCM: (pcmArray: number[], sourceLang: string, targetLang: string) => Promise<any>;
      generatePrompt?: (llmConfig: any, courseName: string) => Promise<any>;
    };
  }
}

interface SubtitleItem {
  id: number;
  original: string;
  translation: string;
  time: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

function CustomSelect({ value, onChange, disabled, className = '', children }: CustomSelectProps) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`appearance-none bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none transition-all cursor-pointer font-sans disabled:opacity-40 disabled:cursor-not-allowed pr-7 ${className}`}
      >
        {children}
      </select>
      <span className={`absolute right-2.5 pointer-events-none text-zinc-400 dark:text-zinc-500 transition-opacity duration-200 ${disabled ? 'opacity-40' : ''}`}>
        <ChevronDown size={11} />
      </span>
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [statusMessage, setStatusMessage] = useState('ready');
  const [statusIcon, setStatusIcon] = useState('🟢');
  const [isListening, setIsListening] = useState(false);
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  
  const [originalText, setOriginalText] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);

  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [scenarioMode, setScenarioMode] = useState('日常会话');
  const [courseName, setCourseName] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('中文');
  const [sourceLanguage, setSourceLanguage] = useState('English');

  // 大模型通用配置
  const [apiBaseUrl, setApiBaseUrl] = useState('https://open.bigmodel.cn/api/paas/v4/chat/completions');
  const [apiKey, setApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('glm-4-flash');

  // ASR/NMT 本地推理与学术提示词状态
  const [sttDevice, setSttDevice] = useState('cpu');
  const [sttComputeType, setSttComputeType] = useState('int8');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

  // ===== i18n Translation Dictionary =====
  const i18n: Record<string, { zh: string; en: string }> = {
    // Header
    subtitle: { zh: 'AI 课堂伴侣', en: 'AI Lecture Companion' },
    config: { zh: '配置', en: 'Config' },

    // Config bar labels
    inputDevice: { zh: '输入设备', en: 'Input Device' },
    mode: { zh: '模式', en: 'Mode' },
    dailyChat: { zh: '日常会话', en: 'Daily Chat' },
    proLecture: { zh: '专业授课', en: 'Pro Lecture' },
    srcLang: { zh: '源语言', en: 'Source' },
    tgtLang: { zh: '目标语言', en: 'Target' },
    subject: { zh: '学科', en: 'Subject' },
    generate: { zh: '生成', en: 'Generate' },
    subjectPlaceholder: { zh: '如 Machine Learning', en: 'e.g. Machine Learning' },

    // Panels
    transcriptTitle: { zh: 'Transcript / 听写原文', en: 'Transcript' },
    transcriptPlaceholder: { zh: '本地 SenseVoice-Small 音频捕获开始后，实时英语听写将在此显示…', en: 'Real-time transcription will appear here once audio capture begins…' },
    notesTitle: { zh: 'Refined Notes / 智能整理笔记 (LLM Agent)', en: 'Refined Notes (LLM Agent)' },
    notesPlaceholder: { zh: '每隔一分钟，大模型 Agent 将自动拉取转录文本在此排版、去口语化、并整理出核心学术笔记……', en: 'Every minute, the LLM Agent will automatically refine the transcript, removing filler words and generating structured academic notes…' },
    subtitlesTitle: { zh: 'Live Subtitles / 实时同传字幕 (NLLB-600M)', en: 'Live Subtitles (NLLB-600M)' },
    subtitlesPlaceholder: { zh: '同声传译字幕即时生成中……', en: 'Simultaneous translation subtitles will appear here…' },

    // Footer
    refineNotes: { zh: '立即整理笔记', en: 'Refine Notes' },
    version: { zh: 'v3.5 (ASR+NMT Dual-Engine)', en: 'v3.5 (ASR+NMT Dual-Engine)' },

    // Settings modal
    settingsTitle: { zh: '应用设置', en: 'Settings' },
    presetLabel: { zh: '一键应用大模型厂商预设：', en: 'Quick-apply provider presets:' },
    apiBaseUrlLabel: { zh: 'API Base URL (接口基准地址)', en: 'API Base URL' },
    apiKeyLabel: { zh: 'API Key (密钥)', en: 'API Key' },
    modelLabel: { zh: 'Model Name (模型名称)', en: 'Model Name' },
    cancel: { zh: '取消', en: 'Cancel' },
    saveSettings: { zh: '保存设置', en: 'Save Settings' },

    // Status messages
    ready: { zh: '就绪', en: 'Ready' },
    asrListening: { zh: '本地 ASR & NMT 实时同传监听中...', en: 'ASR & NMT live listening…' },
    asrUpdateOk: { zh: '本地 ASR/NMT 听写更新成功', en: 'ASR/NMT transcription updated' },
    stopped: { zh: '已停止监听', en: 'Stopped' },
    micFail: { zh: '麦克风开启失败', en: 'Microphone failed' },
    llmProcessing: { zh: '大模型整理翻译中...', en: 'LLM refining…' },
    thinking: { zh: '思考中...', en: 'Thinking…' },
    refineComplete: { zh: '整理完成', en: 'Refine complete' },
    settingsSaved: { zh: '设置已保存', en: 'Settings saved' },
    cleared: { zh: '已清空', en: 'Cleared' },
    generatingPrompt: { zh: '正在生成学术提示词...', en: 'Generating academic prompt…' },
    promptGenOk: { zh: '学术提示词生成成功', en: 'Academic prompt generated' },
    noTranscript: { zh: '无转录文本', en: 'No transcript text' },
    configApiKey: { zh: '请先配置 API Key', en: 'Please configure API Key first' },
    confirmClear: { zh: '确定清空所有内容？', en: 'Clear all content?' },
    stopFirst: { zh: '请先停止听写', en: 'Please stop transcription first' },
    noExport: { zh: '无内容可导出', en: 'Nothing to export' },
    export: { zh: '导出', en: 'Export' },
    clear: { zh: '清空', en: 'Clear' },
    noMic: { zh: '未检测到麦克风', en: 'No microphone detected' },
    defaultMic: { zh: '系统默认麦克风', en: 'Default Microphone' },

    // Source language labels with optimization badges
    srcAuto: { zh: 'Auto (自动识别)', en: 'Auto (Detect)' },
    srcEnglish: { zh: 'English (已优化)', en: 'English (Optimized)' },
    srcChinese: { zh: '中文 (已优化)', en: 'Chinese (Optimized)' },
    srcCantonese: { zh: '粤语 (已优化)', en: 'Cantonese (Optimized)' },
    srcJapanese: { zh: '日本語 (已优化)', en: 'Japanese (Optimized)' },
    srcKorean: { zh: '한국어 (已优化)', en: 'Korean (Optimized)' },

    // Target language labels
    tgtChinese: { zh: '中文 (推荐)', en: 'Chinese (Recommended)' },
    tgtEnglish: { zh: 'English (推荐)', en: 'English (Recommended)' },

    // Preset names (locale-aware)
    presetZhipu: { zh: '智谱 AI (免费级别)', en: 'Zhipu AI (Free Tier)' },
    presetOllamaLocal: { zh: 'Ollama (本地)', en: 'Ollama (Local)' },
    presetCustom: { zh: 'OpenAI 兼容 (自定义)', en: 'OpenAI Compatible (Custom)' },

    // Translation/Standardized labels
    translationLabel: { zh: '【翻译】', en: '【Translation】' },
    standardLabel: { zh: '【整理】', en: '【Refined】' },
    errorLabel: { zh: '【错误】', en: '【Error】' },
    noTranslation: { zh: '[无翻译结果]', en: '[No translation]' },
    savedBrowser: { zh: '已暂存（浏览器端）', en: 'Saved (browser only)' },
  };

  const t = (key: string): string => {
    const entry = i18n[key];
    if (!entry) return key;
    return entry[locale] || entry.zh;
  };

  // 快捷预设厂商模板
  const providerPresets = [
    { name: () => t('presetZhipu'), url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
    { name: () => 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
    { name: () => 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
    { name: () => 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-1.5-flash' },
    { name: () => 'Anthropic Claude', url: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-20241022' },
    { name: () => t('presetCustom'), url: 'https://api.your-provider.com/v1/chat/completions', model: 'your-model-name' },
    { name: () => t('presetOllamaLocal'), url: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5-coder' }
  ];

  const originalRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef<HTMLDivElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);

  // 录音相关引用
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // 定期大模型整理引用
  const lastProcessedLengthRef = useRef<number>(0);
  const autoProcessIntervalRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      if (window.electronAPI) {
        try {
          const c = await window.electronAPI.getConfig();
          setApiBaseUrl(c.llm_base_url || 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
          setApiKey(c.zhipuai_api_key || '');
          setLlmModel(c.zhipuai_model || 'glm-4-flash');
          setTargetLanguage(c.target_language || '中文');
          setSourceLanguage(c.source_language || 'English');
          setSttDevice(c.stt_device || 'cpu');
          setSttComputeType(c.stt_compute_type || 'int8');
          if (c.locale === 'en' || c.locale === 'zh') setLocale(c.locale);
        } catch (e) {
          console.error('获取本地配置失败:', e);
        }
      }
      
      // 获取浏览器音频输入设备列表
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const allDevs = await navigator.mediaDevices.enumerateDevices();
          const inputs = allDevs
            .filter(d => d.kind === 'audioinput')
            .map(d => d.label || `Audio Device ${d.deviceId.slice(0, 5)}`);
          setDevices(inputs.length > 0 ? inputs : ['Default Microphone']);
          setSelectedDevice(inputs.length > 0 ? inputs[0] : 'Default Microphone');
        } else {
          setDevices(['Default Microphone']);
          setSelectedDevice('Default Microphone');
        }
      } catch (e) {
        setDevices(['Default Microphone']);
        setSelectedDevice('Default Microphone');
      }
    };
    
    setTimeout(init, 300);
  }, []);

  useEffect(() => { originalRef.current && (originalRef.current.scrollTop = originalRef.current.scrollHeight); }, [originalText]);
  useEffect(() => { processedRef.current && (processedRef.current.scrollTop = processedRef.current.scrollHeight); }, [processedText]);
  useEffect(() => { subtitleContainerRef.current && (subtitleContainerRef.current.scrollTop = subtitleContainerRef.current.scrollHeight); }, [subtitles]);

  // 后台定时整理（L2层级 - 每60秒检测并自动重构笔记）
  useEffect(() => {
    if (isListening) {
      autoProcessIntervalRef.current = setInterval(() => {
        // 如果原文文本长度增加了 40 个字以上，在后台默默进行大模型提炼
        if (originalText.length - lastProcessedLengthRef.current > 40) {
          console.log('[L2] 触发后台自动笔记整理...');
          autoRefineTranscript();
        }
      }, 60000);
    } else {
      if (autoProcessIntervalRef.current) {
        clearInterval(autoProcessIntervalRef.current);
      }
    }
    return () => {
      if (autoProcessIntervalRef.current) {
        clearInterval(autoProcessIntervalRef.current);
      }
    };
  }, [isListening, originalText]);

  // 重采样至 16000Hz (以兼容 SenseVoice 模型)
  function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number = 16000) {
    if (inputSampleRate === outputSampleRate) return buffer;
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // 发送音频切片到主进程 ASR 听写与 NMT 翻译
  const sendPCMChunk = async (pcmSamples: number[]) => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.transcribePCM(pcmSamples, sourceLanguage, targetLanguage);
      if (res.status === 'success' && res.original.trim()) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        // 1. 实时追加原文文本
        setOriginalText(prev => prev + (prev ? ' ' : '') + res.original);
        
        // 2. 实时追加同传对照字幕 (L1层级)
        setSubtitles(prev => [
          ...prev, 
          {
            id: Date.now(),
            original: res.original,
            translation: res.translation || '[—]',
            time: timestamp
          }
        ]);
        
        setStatusMessage('asrUpdateOk');
        setStatusIcon('🔴');
      } else if (res.status === 'error') {
        setStatusMessage(`ASR 错误: ${res.message}`);
        setStatusIcon('🟠');
      }
    } catch (e: any) {
      console.error('发送音频片崩溃:', e);
    }
  };

  // 启动与停止本地 ASR 录音监听
  const toggleListening = async () => {
    if (isListening) {
      // 停止监听，销毁 Web Audio 音频节点
      if (processorNodeRef.current) {
        processorNodeRef.current.disconnect();
        processorNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      
      setIsListening(false);
      setStatusMessage('stopped');
      setStatusIcon('🟢');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        
        const inputSampleRate = ctx.sampleRate;
        const source = ctx.createMediaStreamSource(stream);
        
        // 4096 缓存大小
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorNodeRef.current = processor;

        let sampleBuffer: number[] = [];
        let silenceSamples = 0;
        const SILENCE_THRESHOLD = 0.015; // 声音能量阈值
        const MIN_SAMPLES = 16000 * 2.5;  // 最小积累 2.5 秒才允许切片
        const MAX_SAMPLES = 16000 * 7;    // 最大强制 7 秒切片 (防止长段说话阻塞)
        const REQUIRED_SILENCE_SAMPLES = 16000 * 0.4; // 连续 0.4 秒静音判定为说话间歇

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          // 降采样至 16000Hz 供 SenseVoice
          const resampled = downsampleBuffer(inputData, inputSampleRate, 16000);
          sampleBuffer.push(...Array.from(resampled));
          
          // 计算当前缓冲区的 RMS (均方根) 能量以判定音量
          let sumSquares = 0;
          for (let i = 0; i < resampled.length; i++) {
            sumSquares += resampled[i] * resampled[i];
          }
          const rms = Math.sqrt(sumSquares / resampled.length);

          if (rms < SILENCE_THRESHOLD) {
            silenceSamples += resampled.length;
          } else {
            silenceSamples = 0;
          }

          const hasEnoughSpeech = sampleBuffer.length >= MIN_SAMPLES;
          const isSilent = silenceSamples >= REQUIRED_SILENCE_SAMPLES;
          const reachedMax = sampleBuffer.length >= MAX_SAMPLES;

          // 当积攒了足够时长且检测到说话停顿，或者达到最大时长时，触发切片发送
          if ((hasEnoughSpeech && isSilent) || reachedMax) {
            const chunk = sampleBuffer.slice(0);
            sampleBuffer = [];
            silenceSamples = 0;
            sendPCMChunk(chunk);
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        setIsListening(true);
        setStatusMessage('asrListening');
        setStatusIcon('🔴');
        setOriginalText('');
        setSubtitles([]);
      } catch (err: any) {
        console.error('开启录音失败:', err);
        alert(`${t('micFail')}: ${err.message}`);
        setStatusMessage('micFail');
        setStatusIcon('🔴');
      }
    }
  };

  // 手动整理/翻译文本 (L2层级)
  const processTranscript = async () => {
    if (!originalText.trim()) return alert(t('noTranscript'));
    if (!apiKey) { alert(t('configApiKey')); setShowSettings(true); return; }
    setStatusMessage('llmProcessing'); 
    setStatusIcon('🟠');
    setProcessedText(t('thinking'));

    const prompt = `As a professional AI assistant for international students, strictly follow these steps:
1. **Translate**: Translate the following "Original Text" into fluent and accurate "${targetLanguage}".
2. **Standardize**: Review and polish the "${targetLanguage}" translation. Correct grammar, improve phrasing to be professional, clear, and suitable for formal lecture notes.
${customPrompt ? `Use this context for translation and standardization: ${customPrompt}\n` : ''}3. **Format Output**: Return your work as a single, valid JSON object with two keys: "translation" (for the direct translation) and "standardized_text" (for the polished version). Do not include any other explanations.

--- Original Text ---
${originalText}`;

    if (window.electronAPI) {
      try {
        const config = { baseUrl: apiBaseUrl, apiKey, model: llmModel };
        const res = await window.electronAPI.processTranscript(config, prompt);
        if (res.status === 'success') {
          setProcessedText(`${t('translationLabel')}\n${res.translation}\n\n${t('standardLabel')}\n${res.standardized_text}`);
          setStatusMessage('refineComplete');
          setStatusIcon('🟢');
          lastProcessedLengthRef.current = originalText.length;
        } else {
          setStatusMessage(`Error: ${res.message}`);
          setStatusIcon('🔴');
          setProcessedText(`${t('errorLabel')}\n${res.message}`);
        }
      } catch (e: any) {
        setStatusMessage(`Error: ${e.message}`);
        setStatusIcon('🔴');
      }
    } else {
      await new Promise(r => setTimeout(r, 2000)); 
      setProcessedText(`${t('translationLabel')}\nSimulated translation.\n\n${t('standardLabel')}\n1. Key concepts\n2. Lecture summary`); 
      setStatusMessage('refineComplete'); 
      setStatusIcon('🟢');
    }
  };

  // 静默后台自动重构笔记
  const autoRefineTranscript = async () => {
    if (!originalText.trim() || !apiKey || !window.electronAPI) return;
    const prompt = `As a professional AI assistant for international students, strictly follow these steps:
1. **Translate**: Translate the following "Original Text" into fluent and accurate "${targetLanguage}".
2. **Standardize**: Review and polish the "${targetLanguage}" translation. Correct grammar, improve phrasing to be professional, clear, and suitable for formal lecture notes.
${customPrompt ? `Use this context for translation and standardization: ${customPrompt}\n` : ''}3. **Format Output**: Return your work as a single, valid JSON object with two keys: "translation" (for the direct translation) and "standardized_text" (for the polished version). Do not include any other explanations.

--- Original Text ---
${originalText}`;

    try {
      const config = { baseUrl: apiBaseUrl, apiKey, model: llmModel };
      const res = await window.electronAPI.processTranscript(config, prompt);
      if (res.status === 'success') {
        setProcessedText(`${t('translationLabel')}\n${res.translation}\n\n${t('standardLabel')}\n${res.standardized_text}`);
        lastProcessedLengthRef.current = originalText.length;
      }
    } catch (e) {
      console.error('[L2] 自动后台整理笔记失败:', e);
    }
  };

  const handleScenarioChange = (mode: string) => {
    setScenarioMode(mode);
    if (mode === '日常会话' || mode === 'Daily Chat') {
      setCustomPrompt('');
      setCourseName('');
    }
  };

  const generatePrompt = async () => {
    if (!courseName.trim()) return;
    setIsGeneratingPrompt(true);
    setStatusMessage('generatingPrompt');
    setStatusIcon('🟠');
    try {
      if (window.electronAPI && window.electronAPI.generatePrompt) {
        const config = { baseUrl: apiBaseUrl, apiKey, model: llmModel };
        const res = await window.electronAPI.generatePrompt(config, courseName);
        if (res.status === 'success' && res.prompt) {
          setCustomPrompt(res.prompt);
          setStatusMessage('promptGenOk');
          setStatusIcon('🟢');
          alert(`${t('promptGenOk')}:\n"${res.prompt}"`);
        } else {
          setStatusMessage(`Error: ${res.message}`);
          setStatusIcon('🔴');
          alert(`Error: ${res.message}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        const mockPrompt = `You are a simultaneous interpretation expert in ${courseName}, focusing on terms like core concepts, methodologies, and definitions.`;
        setCustomPrompt(mockPrompt);
        setStatusMessage('promptGenOk');
        setStatusIcon('🟢');
        alert(`${t('promptGenOk')}:\n"${mockPrompt}"`);
      }
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
      setStatusIcon('🔴');
      alert(`Error: ${e.message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const saveSettings = async () => {
    const cfg = { 
      llm_base_url: apiBaseUrl.trim(), 
      zhipuai_api_key: apiKey.trim(), 
      zhipuai_model: llmModel.trim(), 
      stt_device: sttDevice, 
      stt_compute_type: sttComputeType, 
      target_language: targetLanguage, 
      source_language: sourceLanguage,
      locale: locale 
    };
    
    if (window.electronAPI) { 
      await window.electronAPI.saveConfig(cfg); 
      setShowSettings(false); 
      setStatusMessage('settingsSaved'); 
      setStatusIcon('🟢');
    } else { 
      setShowSettings(false); 
      alert(t('savedBrowser')); 
    }
  };

  const clearAll = () => {
    if (isListening) return alert(t('stopFirst'));
    if (confirm(t('confirmClear'))) { 
      setOriginalText(''); 
      setProcessedText(''); 
      setSubtitles([]);
      setStatusMessage('cleared'); 
      setStatusIcon('🟢');
    }
  };

  const exportText = (text: string, prefix: string) => {
    if (!text.trim()) return alert(t('noExport'));
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    el.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(el); 
    el.click(); 
    document.body.removeChild(el);
  };

  // 快捷应用厂商预设模板
  const handlePresetSelect = (preset: { url: string, model: string }) => {
    setApiBaseUrl(preset.url);
    setLlmModel(preset.model);
  };

  // 状态呼吸灯组件
  const StatusDot = () => {
    const colorMap: Record<string, string> = {
      '🔴': 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]',
      '🟠': 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]',
      '🟢': 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]',
    };
    return (
      <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 transition-all duration-300 ${colorMap[statusIcon] || 'bg-zinc-400'}`} />
    );
  };



  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="flex flex-col min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans tracking-wide selection:bg-zinc-100 dark:selection:bg-zinc-900">

        {/* ===== Header ===== */}
        <header className="flex items-center justify-between px-10 py-6 border-b border-zinc-100 dark:border-zinc-900">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 dark:bg-white flex items-center justify-center text-white dark:text-black font-heading font-bold text-sm select-none">
              T
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold italic tracking-tight select-none">Translate2me</h1>
              <p className="text-[9px] text-zinc-500 dark:text-zinc-400 font-sans tracking-[0.25em] font-medium uppercase select-none">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer font-sans font-light">
              {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {t('config')}
            </button>
            <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer font-sans font-light">
              <Languages size={12} />
              {locale === 'zh' ? 'EN' : '中'}
            </button>
            <button onClick={() => setIsDark(!isDark)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer">
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={() => setShowSettings(true)} disabled={isListening} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-40">
              <Settings size={14} />
            </button>
          </div>
        </header>

        {/* ===== Horizontal Config Bar ===== */}
        <div className={`grid transition-all duration-300 ease-in-out bg-zinc-50/50 dark:bg-zinc-950/20 px-10 ${
          showConfig 
            ? 'grid-rows-[1fr] opacity-100 py-3 border-b border-zinc-100 dark:border-zinc-900' 
            : 'grid-rows-[0fr] opacity-0 py-0 border-b border-transparent'
        }`}>
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs py-1">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium select-none">{t('inputDevice')}:</span>
                <CustomSelect value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} disabled={isListening} className="w-48">
                  {devices.map((d, i) => <option key={i} value={d} className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{d}</option>)}
                  {devices.length === 0 && <option className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('noMic')}</option>}
                </CustomSelect>
              </div>

              <span className="hidden sm:block w-px h-5 bg-zinc-200 dark:bg-zinc-800" />

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium select-none">{t('mode')}:</span>
                <CustomSelect value={scenarioMode} onChange={e => handleScenarioChange(e.target.value)} disabled={isListening} className="w-28">
                  <option value="日常会话" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('dailyChat')}</option>
                  <option value="专业授课" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('proLecture')}</option>
                </CustomSelect>
              </div>

              <span className="hidden sm:block w-px h-5 bg-zinc-200 dark:bg-zinc-800" />

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium select-none">{t('srcLang')}:</span>
                <CustomSelect value={sourceLanguage} onChange={e => setSourceLanguage(e.target.value)} disabled={isListening} className="w-36">
                  <option value="Auto" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcAuto')}</option>
                  <option value="English" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcEnglish')}</option>
                  <option value="Chinese" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcChinese')}</option>
                  <option value="Cantonese" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcCantonese')}</option>
                  <option value="Japanese" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcJapanese')}</option>
                  <option value="Korean" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('srcKorean')}</option>
                </CustomSelect>
                <span className="text-zinc-300 dark:text-zinc-600">→</span>
                <span className="text-zinc-500 dark:text-zinc-400 font-medium select-none">{t('tgtLang')}:</span>
                <CustomSelect value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)} disabled={isListening} className="w-36">
                  <option value="中文" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('tgtChinese')}</option>
                  <option value="English" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">{t('tgtEnglish')}</option>
                  <option value="日本語" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">日本語</option>
                  <option value="한국어" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">한국어</option>
                  <option value="Français" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Français</option>
                  <option value="Deutsch" className="bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">Deutsch</option>
                </CustomSelect>
              </div>

              {(scenarioMode === '专业授课' || scenarioMode === 'Pro Lecture') && (
                <>
                  <span className="hidden sm:block w-px h-5 bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium select-none">{t('subject')}:</span>
                    <input type="text" placeholder={t('subjectPlaceholder')} value={courseName} onChange={e => setCourseName(e.target.value)} disabled={isListening || isGeneratingPrompt}
                      className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 w-40 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none transition-colors" />
                    <button onClick={generatePrompt} disabled={isListening || isGeneratingPrompt || !courseName.trim()}
                      className="px-3 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-black rounded-lg text-[10px] font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 cursor-pointer flex items-center gap-1 transition-colors">
                      {isGeneratingPrompt ? <span className="w-2.5 h-2.5 border border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" /> : <Sparkles size={10} />}
                      {t('generate')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ===== Main Panels ===== */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Left Side: Transcript */}
          <section className="flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-100 dark:border-zinc-900">
            <div className="flex items-center justify-between px-10 py-5 border-b border-zinc-50 dark:border-zinc-950">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none">{t('transcriptTitle')}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => exportText(originalText, 'transcript')} disabled={!originalText} className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors disabled:opacity-20 cursor-pointer" title={t('export')}>
                  <Download size={13} />
                </button>
              </div>
            </div>
            <div ref={originalRef} className="flex-1 px-10 py-8 overflow-y-auto text-[15px] text-zinc-800 dark:text-zinc-200 leading-8 whitespace-pre-wrap select-text font-sans font-light tracking-wide min-h-[300px] max-h-[calc(100vh-270px)]">
              {originalText || (
                <span className="text-zinc-300 dark:text-zinc-500 italic font-light select-none text-sm">
                  {t('transcriptPlaceholder')}
                </span>
              )}
            </div>
          </section>

          {/* Right Side: Split Subtitles and Notes */}
          <section className="flex flex-col h-[calc(100vh-200px)] lg:h-[auto]">
            {/* Top Part: Refined Notes */}
            <div className="flex-1 flex flex-col border-b border-zinc-100 dark:border-zinc-900">
              <div className="flex items-center justify-between px-10 py-4 border-b border-zinc-50 dark:border-zinc-950">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none">{t('notesTitle')}</h2>
                <div className="flex items-center gap-1">
                  <button onClick={() => exportText(processedText, 'notes')} disabled={!processedText} className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors disabled:opacity-20 cursor-pointer" title={t('export')}>
                    <Download size={13} />
                  </button>
                  <button onClick={clearAll} className="p-2 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer" title={t('clear')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div ref={processedRef} className="flex-1 px-10 py-6 overflow-y-auto text-[14px] text-zinc-800 dark:text-zinc-200 leading-7 whitespace-pre-wrap select-text font-sans font-light tracking-wide">
                {processedText || (
                  <span className="text-zinc-300 dark:text-zinc-500 italic font-light select-none text-sm">
                    {t('notesPlaceholder')}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Part: Live Subtitles */}
            <div className="h-[250px] flex flex-col bg-zinc-50/20 dark:bg-zinc-950/10">
              <div className="flex items-center justify-between px-10 py-3 border-b border-zinc-50 dark:border-zinc-950 select-none">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none">{t('subtitlesTitle')}</h2>
              </div>
              <div ref={subtitleContainerRef} className="flex-1 px-10 py-4 overflow-y-auto space-y-3 font-sans">
                {subtitles.length === 0 && (
                  <span className="text-zinc-300 dark:text-zinc-500 italic font-light select-none text-sm block py-2">
                    {t('subtitlesPlaceholder')}
                  </span>
                )}
                {subtitles.map(sub => (
                  <div key={sub.id} className="text-xs border-l-2 border-zinc-200 dark:border-zinc-800 pl-3 py-1 space-y-0.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-800 dark:text-zinc-200 font-light select-text">{sub.original}</span>
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono select-none">{sub.time}</span>
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400 font-normal select-text">{sub.translation}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        {/* ===== Bottom Action Bar ===== */}
        <footer className="border-t border-zinc-100 dark:border-zinc-900 px-10 py-5 flex items-center justify-between bg-white dark:bg-black">
          {/* Status Message */}
          <div className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 font-normal select-none min-w-[200px]">
            <StatusDot />
            <span>{t(statusMessage) !== statusMessage ? t(statusMessage) : statusMessage}</span>
          </div>

          {/* Core Controls */}
          <div className="flex items-center gap-5">
            <button onClick={processTranscript} disabled={isListening || !originalText.trim()}
              className="px-6 py-2.5 text-xs font-medium tracking-wider uppercase bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 font-sans">
              <Sparkles size={12} /> {t('refineNotes')}
            </button>

            <button onClick={toggleListening}
              className={`w-14 h-14 rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-300 cursor-pointer
                ${isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white recording-pulse shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                  : 'bg-zinc-950 hover:bg-zinc-900 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black shadow-[0_4px_12px_rgba(0,0,0,0.05)]'}`}>
              {isListening ? <Square size={16} fill="white" stroke="none" /> : <Mic size={18} />}
            </button>
          </div>

          {/* App Version */}
          <div className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono tracking-wider uppercase select-none min-w-[200px] text-right">
            {t('version')}
          </div>
        </footer>

        {/* ===== Settings Modal ===== */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/10 dark:bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4 animate-modalBackdrop" onClick={() => setShowSettings(false)}>
            <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl p-8 relative shadow-xl animate-modalContent" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-heading font-normal italic text-lg select-none">{t('settingsTitle')}</h3>
                <button onClick={() => setShowSettings(false)} className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-5 text-sm">
                {/* 厂商快捷预设 */}
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs font-light block mb-2 select-none">{t('presetLabel')}</span>
                  <div className="flex flex-wrap gap-2">
                    {providerPresets.map((preset, idx) => {
                      const isActive = apiBaseUrl.trim() === preset.url.trim() && llmModel.trim() === preset.model.trim();
                      return (
                        <button key={idx} onClick={() => handlePresetSelect(preset)}
                          className={`px-2.5 py-1 text-[11px] rounded-md transition-all duration-200 cursor-pointer font-sans ${
                            isActive
                              ? 'bg-zinc-950 text-white dark:bg-white dark:text-black font-medium scale-[1.03] shadow-sm'
                              : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}>
                          {preset.name()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-zinc-100 dark:border-zinc-900" />

                <label className="flex flex-col gap-2">
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs font-light">{t('apiBaseUrlLabel')}</span>
                  <input type="text" placeholder="https://api.openai.com/v1" value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)}
                    className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none transition-colors" />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs font-light">{t('apiKeyLabel')}</span>
                  <input type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)}
                    className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none transition-colors" />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs font-light">{t('modelLabel')}</span>
                  <input type="text" placeholder="gpt-4o-mini" value={llmModel} onChange={e => setLlmModel(e.target.value)}
                    className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none transition-colors" />
                </label>


              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-xs font-light text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-all duration-200 cursor-pointer">
                  {t('cancel')}
                </button>
                <button onClick={saveSettings} className="px-5 py-2 text-xs bg-zinc-950 text-white dark:bg-white dark:text-black rounded-lg hover:bg-zinc-900 dark:hover:bg-zinc-100 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] font-medium cursor-pointer">
                  {t('saveSettings')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
