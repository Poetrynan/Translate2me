const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('http'); // 统一使用 http/https 库处理
const httpsSecure = require('https');
const url = require('url');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');

let mainWindow;
let translator = null;

// 动态载入 @xenova/transformers 本地翻译管道
async function initTranslator() {
  try {
    console.log('[NMT] 正在载入本地 NLLB-600M 翻译引擎...');
    // 使用 dynamic import() 引入 ES Module 格式的 @xenova/transformers
    const { pipeline } = await import('@xenova/transformers');
    translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M');
    console.log('[NMT] 本地 NLLB 翻译引擎载入成功！');
  } catch (e) {
    console.error('[NMT] 载入本地 NLLB 翻译引擎失败:', e);
  }
}

// 路径辅助函数：处理开发模式与打包后的 .exe 二进制路径
function getBinaryPath() {
  const rootDir = app.isPackaged 
    ? path.join(process.resourcesPath, '..')
    : path.join(__dirname, '..', '..');
  const exeName = process.platform === 'win32' ? 'sherpa-onnx-offline.exe' : 'sherpa-onnx-offline';
  return path.join(rootDir, 'bin', exeName);
}

function getModelPath(subPath) {
  const rootDir = app.isPackaged 
    ? path.join(process.resourcesPath, '..')
    : path.join(__dirname, '..', '..');
  return path.join(rootDir, 'models', 'sensevoice', subPath);
}

// 配置文件路径定义
const configDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'config')
  : path.join(__dirname, '..', '..', 'config');
const configFilePath = path.join(configDir, 'config.json');

const defaultConfig = {
  llm_base_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", // 默认智谱 AI Base URL
  zhipuai_api_key: "", // 保持 key 名称以复用原 config.json
  zhipuai_model: "glm-4-flash",
  stt_device: "cpu",
  stt_compute_type: "int8",
  source_language: "English",
  target_language: "中文"
};

// 获取本地配置
function getLocalConfig() {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    if (fs.existsSync(configFilePath)) {
      const data = fs.readFileSync(configFilePath, 'utf-8');
      const loaded = JSON.parse(data);
      return { ...defaultConfig, ...loaded };
    } else {
      fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return { ...defaultConfig };
    }
  } catch (e) {
    console.error('读取配置文件失败:', e);
    return { ...defaultConfig };
  }
}

// 保存配置
function saveLocalConfig(newConfig) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const current = getLocalConfig();
    const updated = { ...current, ...newConfig };
    fs.writeFileSync(configFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    return { status: 'success' };
  } catch (e) {
    console.error('保存配置文件失败:', e);
    return { status: 'error', message: e.message };
  }
}

// 44字节标准 WAV 文件头生成器
function writeWavHeader(sampleCount, sampleRate = 16000) {
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM Format = 1
  buffer.writeUInt16LE(1, 22); // Mono Channel
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  return buffer;
}

// 通用 OpenAI 兼容的 HTTP 请求发送器
function requestOpenAICompatible(llmConfig, prompt, callback) {
  const { baseUrl, apiKey, model } = llmConfig;
  
  let cleanUrl = baseUrl.trim();
  const isAnthropic = cleanUrl.includes('api.anthropic.com');
  const isGemini = cleanUrl.includes('generativelanguage.googleapis.com');

  let postData;
  let headers;
  let parsedUrl;

  if (isAnthropic) {
    // Anthropic Messages API
    let anthropicUrl = cleanUrl;
    if (!anthropicUrl.endsWith('/messages')) {
      anthropicUrl = anthropicUrl.replace(/\/$/, '') + '/v1/messages';
    }
    // 清理可能的双重 v1 路径
    anthropicUrl = anthropicUrl.replace(/\/v1\/v1\//, '/v1/');
    
    parsedUrl = url.parse(anthropicUrl);

    postData = JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3
    });

    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(postData)
    };
  } else {
    // OpenAI Compatible API
    let targetUrl = cleanUrl;
    if (isGemini) {
      if (!targetUrl.includes('/openai')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/v1beta/openai/chat/completions';
      } else if (!targetUrl.endsWith('/chat/completions')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/chat/completions';
      }
    } else {
      if (!targetUrl.endsWith('/chat/completions')) {
        const tempParsed = url.parse(targetUrl);
        const pathname = tempParsed.pathname || '';
        if (pathname === '/' || pathname === '') {
          targetUrl = targetUrl.replace(/\/$/, '') + '/v1/chat/completions';
        } else {
          targetUrl = targetUrl.replace(/\/$/, '') + '/chat/completions';
        }
      }
    }
    parsedUrl = url.parse(targetUrl);

    postData = JSON.stringify({
      model: model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Length': Buffer.byteLength(postData)
    };
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const httpLib = isHttps ? httpsSecure : https;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path,
    method: 'POST',
    headers: headers
  };

  const req = httpLib.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        let json = JSON.parse(body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (isAnthropic) {
            // 将 Anthropic 响应结构映射回 OpenAI 规范，供应用无缝解析
            const textContent = json.content && json.content[0] ? json.content[0].text : '';
            json = {
              choices: [
                {
                  message: {
                    content: textContent
                  }
                }
              ]
            };
          }
          callback(null, json);
        } else {
          callback(new Error(json.error?.message || `HTTP ${res.statusCode}: ${body}`));
        }
      } catch (e) {
        callback(new Error(`解析大模型响应 JSON 失败 (HTTP ${res.statusCode}): ${e.message}`));
      }
    });
  });

  req.on('error', (e) => {
    callback(e);
  });

  req.write(postData);
  req.end();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: 'Translate2me - 智能实时转录与翻译笔记',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC 通道处理 ---

// 1. 获取和保存设置
ipcMain.handle('config:get', async () => {
  return getLocalConfig();
});

ipcMain.handle('config:save', async (event, newConfig) => {
  return saveLocalConfig(newConfig);
});

// 2. 通用 OpenAI 大模型翻译整理
ipcMain.handle('llm:process', async (event, { llmConfig, prompt }) => {
  return new Promise((resolve) => {
    requestOpenAICompatible(llmConfig, prompt, (err, data) => {
      if (err) {
        resolve({ status: 'error', message: err.message });
      } else {
        try {
          const content = data.choices[0].message.content;
          const parsed = JSON.parse(content);
          resolve({
            status: 'success',
            translation: parsed.translation,
            standardized_text: parsed.standardized_text
          });
        } catch (e) {
          resolve({ status: 'error', message: '大模型返回格式不是有效的翻译 JSON: ' + e.message });
        }
      }
    });
  });
});

ipcMain.handle('llm:generatePrompt', async (event, { llmConfig, courseName }) => {
  const prompt = `As an expert in linguistics and the specific academic field of "${courseName}", your task is to generate a single, powerful sentence. This sentence will be used as an initial prompt for speech recognition/translation to improve accuracy on technical terms.

The sentence must:
1. Start with "You are a simultaneous interpretation expert in..."
2. Be concise and professional.
3. Include 3-5 of the most critical keywords related to the topic.
4. The entire output must be a single, valid JSON object with one key: "prompt".

Example for "Machine Learning and Deep Learning":
{
  "prompt": "You are a simultaneous interpretation expert in machine learning and deep learning, focusing on terms like neural networks, backpropagation, and transformers."
}

Now, generate the JSON for the topic: "${courseName}"`;

  return new Promise((resolve) => {
    requestOpenAICompatible(llmConfig, prompt, (err, data) => {
      if (err) {
        resolve({ status: 'error', message: err.message });
      } else {
        try {
          const content = data.choices[0].message.content;
          const parsed = JSON.parse(content);
          resolve({
            status: 'success',
            prompt: parsed.prompt
          });
        } catch (e) {
          resolve({ status: 'error', message: '大模型返回格式错误: ' + e.message });
        }
      }
    });
  });
});

// 3. 本地 ASR + 本地 NMT 语音转录与即时翻译
ipcMain.handle('asr:transcribe', async (event, payload) => {
  let pcmArray;
  let sourceLang = 'English';
  let targetLang = '中文';

  if (payload && Array.isArray(payload)) {
    pcmArray = payload;
  } else if (payload && payload.pcmArray) {
    pcmArray = payload.pcmArray;
    sourceLang = payload.sourceLang || 'English';
    targetLang = payload.targetLang || '中文';
  } else {
    return { status: 'error', message: '无效的 PCM 载荷格式' };
  }

  const tempWavPath = path.join(app.getPath('temp'), `t2m_temp_${Date.now()}.wav`);
  
  try {
    const sampleCount = pcmArray.length;
    const wavHeader = writeWavHeader(sampleCount, 16000);
    const int16Buffer = Buffer.alloc(sampleCount * 2);
    
    // Float32 pcm 转换至 Int16
    for (let i = 0; i < sampleCount; i++) {
      const s = Math.max(-1, Math.min(1, pcmArray[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      int16Buffer.writeInt16LE(Math.floor(val), i * 2);
    }
    
    fs.writeFileSync(tempWavPath, Buffer.concat([wavHeader, int16Buffer]));

    const exePath = getBinaryPath();
    const modelPath = getModelPath('model.int8.onnx');
    const tokensPath = getModelPath('tokens.txt');

    if (!fs.existsSync(exePath)) {
      throw new Error(`找不到本地 ASR 引擎: ${exePath}`);
    }
    if (!fs.existsSync(modelPath) || !fs.existsSync(tokensPath)) {
      throw new Error(`找不到本地 SenseVoice 模型文件。请确保 models/sensevoice/ 下有 model.int8.onnx 和 tokens.txt。`);
    }

    const args = [
      `--sense-voice-model=${modelPath}`,
      `--tokens=${tokensPath}`,
      '--provider=cpu',
      '--sense-voice-use-itn=1',
      tempWavPath
    ];

    // 运行 ASR 听写命令行程序
    const originalText = await new Promise((resolve, reject) => {
      const child = spawn(exePath, args, { shell: false });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => stdout += data);
      child.stderr.on('data', (data) => stderr += data);

      child.on('close', (code) => {
        if (code === 0) {
          // sherpa-onnx-offline 输出通常在最后几行，提取结果文本
          // 典型格式: Result: "xxx"
          const lines = stdout.split('\n');
          let resultText = '';
          for (const line of lines) {
            if (line.includes('Result:')) {
              const match = line.match(/Result:\s*"?(.*?)"?\s*$/);
              if (match) resultText = match[1];
            }
          }
          if (!resultText) {
            // 回退尝试正则抓取结果
            const match = stdout.match(/Result:\s*([^\r\n]+)/);
            resultText = match ? match[1].replace(/"/g, '') : '';
          }
          resolve(resultText.trim());
        } else {
          reject(new Error(`ASR 进程异常退出 (Code ${code}): ${stderr}`));
        }
      });
    });

    if (!originalText) {
      return { status: 'success', original: '', translation: '' };
    }

    // NLLB 语言代码映射
    const nllbLangMap = {
      'English': 'eng_Latn',
      'Chinese': 'zho_Hans',
      '中文': 'zho_Hans',
      'Cantonese': 'yue_Hant',
      'Japanese': 'jpn_Jpan',
      '日本語': 'jpn_Jpan',
      'Korean': 'kor_Hang',
      '한국어': 'kor_Hang',
      'Français': 'fra_Latn',
      'Deutsch': 'deu_Latn'
    };

    let srcLangCode = nllbLangMap[sourceLang] || 'eng_Latn';
    let tgtLangCode = nllbLangMap[targetLang] || 'zho_Hans';

    // 自动语种识别 (LID) 支持
    if (sourceLang === 'Auto') {
      if (/[\u4e00-\u9fa5]/.test(originalText)) {
        srcLangCode = 'zho_Hans';
      } else if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(originalText)) {
        srcLangCode = 'jpn_Jpan';
      } else if (/[\uac00-\ud7af\u1100-\u11ff]/.test(originalText)) {
        srcLangCode = 'kor_Hang';
      } else {
        srcLangCode = 'eng_Latn';
      }
    }

    // 运行本地 NMT NLLB-600M 翻译
    let translatedText = '';
    if (srcLangCode === tgtLangCode) {
      // 语种一致时直接使用原文，无需浪费资源做机翻
      translatedText = originalText;
    } else if (translator) {
      try {
        const output = await translator(originalText, {
          src_lang: srcLangCode,
          tgt_lang: tgtLangCode
        });
        translatedText = output[0]?.translation_text || '';
      } catch (err) {
        console.error('NLLB 翻译失败:', err);
        translatedText = `[NLLB 翻译错误]: ${err.message}`;
      }
    } else {
      translatedText = '[本地 NLLB 翻译引擎未加载，请确认依赖]';
    }

    return {
      status: 'success',
      original: originalText,
      translation: translatedText
    };

  } catch (e) {
    console.error('ASR 听写出错:', e);
    return { status: 'error', message: e.message };
  } finally {
    // 安全删除临时音频文件
    try {
      if (fs.existsSync(tempWavPath)) {
        fs.unlinkSync(tempWavPath);
      }
    } catch {}
  }
});

app.on('ready', async () => {
  createWindow();
  // 窗口启动后在后台加载本地翻译引擎，避免阻塞 UI 渲染
  initTranslator();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
