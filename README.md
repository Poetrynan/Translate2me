# Translate2me - 智能实时转录与翻译笔记 📢➡️📝

🎉 欢迎使用 Translate2me - 一款专为留学生、研究人员和专业人士打造的智能实时转录与翻译笔记工具！本项目基于 GPLv3 许可证开源。

## 功能特点 ✨

  - 🎙️ **多源音频输入**: 支持麦克风输入和系统声音捕获（Loopback），方便录制会议、讲座或任何电脑音频。
  - 🚀 **高性能实时转录**: 基于 `faster-whisper` 和本地优化的 `large-v3-turbo` 模型，提供快速准确的语音转文字服务。
  - 🗣️ **智能场景模式**:
      - **日常会话**: 通用场景下的流畅转录。
      - **专业授课**: 可输入课程/专业名称，通过智谱AI生成定制化的Whisper提示词 (Prompt)，提升专业术语识别准确率。
  - 🌐 **多语言翻译与润色**: 集成智谱AI (`glm-4`, `glm-4-flash`)，将转录文本快速翻译成多种目标语言（中文、English、日本語、한국어、Français、Deutsch），并进行专业化润色，生成高质量笔记。
  - 🔇 **精准语音活动检测 (VAD)**: 采用 `Silero VAD` 技术，有效区分语音和静默，提升转录效率和准确性。
  - ⚙️ **灵活配置**:
      - 通过图形化界面轻松配置智谱AI API Key、选择AI模型、STT运行设备 (CPU/CUDA) 及计算类型 (`int8`, `float16`, `float32`)。
      - 配置文件保存在 `config/config.json`。
  - 💾 **结果保存**: 一键保存原始转录文本和翻译整理后的文本到 `output` 文件夹。
  - 🎨 **现代化用户界面**: 使用 `customtkinter` 构建美观易用的界面。

## 系统要求 💻

  - Python 3.8+ 环境
  - Windows 操作系统 (当前主要测试环境，Linux/macOS可能需要调整)
  - 推荐8GB以上内存 (运行 `large-v3-turbo` 模型)
  - 如需GPU加速，需兼容 `faster-whisper` 的NVIDIA显卡及CUDA环境 (通常 CUDA 11.x 或 12.x)。

## 安装指南 📦

1.  **克隆仓库**:

    ```bash
    git clone https://github.com/your-repo/Translate2me.git # 替换为您的仓库地址
    cd Translate2me
    ```

2.  **创建并激活虚拟环境** (推荐):

    ```bash
    python -m venv venv
    venv\Scripts\activate  # Windows
    # source venv/bin/activate  # Linux/macOS
    ```

3.  **安装依赖**:
    根据 `requirements.txt` 文件安装依赖。由于部分库可能需要特定编译环境，建议手动逐个或分批安装：

    ```bash
    pip install customtkinter faster-whisper av zhipuai sounddevice soundcard PyInstaller pyaudio CTranslate2
    ```

    **注意事项**:

      * `faster-whisper` 依赖 `CTranslate2`。请确保 `CTranslate2` 与您的CPU/GPU环境兼容。
      * `PyAudio` 在Windows上可能需要预编译的wheel文件，或者在系统中安装 PortAudio。
      * `soundcard` 用于系统声音捕获。

4.  **手动下载并存放模型文件**:

      - 本项目所需的所有模型（如 `large-v3-turbo` 语音识别模型、`silero_vad.onnx` 语音活动检测模型）**需用户自行手动下载**。
      - 下载后请将模型文件分别放置到如下目录结构：
        ```
        manual_models/
        └── large-v3-turbo/
            ├── model.bin
            ├── config.json
            ├── tokenizer.json
            └── vocabulary.txt
        vad_model/
        └── silero_vad.onnx
        silero-vad-master/  # 若需源码或调优，可放置完整 silero-vad 仓库
        ```
      - 相关模型可在其[官方仓库](https://github.com/SYSTRAN/faster-whisper)、[HuggingFace](https://huggingface.co/collections/openai/whisper-20231116)、[Silero VAD](https://github.com/snakers4/silero-vad)等处获取。
      - **注意：模型文件较大，请确保下载完整且放置路径正确，否则程序将无法正常运行。**

5.  **VAD模型**:

      - `Silero VAD` 模型 (`silero_vad.onnx`) 已包含在 `vad_model/` 目录中，并由 `audio_handler.py` 自动加载。

## 使用方法 🚀

1.  **运行主程序**:

    ```bash
    python main.py
    ```

2.  **初次运行**:

      - 如果未配置智谱AI API Key，应用会提示您在“应用设置”中输入。

3.  **主界面操作**:

      - **音频设备**: 从下拉菜单选择您的麦克风或"系统声音 (Loopback)"。
      - **场景模式**:
          - 选择"日常会话"可直接开始。
          - 选择"专业授课"，输入课程/专业名称，点击"生成提示词"，等待提示词生成成功后再开始聆听。
      - **翻译目标语言**: 选择您希望将转录内容翻译成的语言。
      - **开始/停止聆听**: 点击"🎤 开始聆听"按钮启动实时转录。再次点击"⏹️ 停止聆听"结束。
      - **翻译与整理**: 停止聆听后，若有转录内容，点击"⚡ 翻译与整理"按钮，将原文发送给智谱AI进行处理。
      - **保存结果**: 分别点击"💾 保存原文"和"💾 保存结果"来保存文本文件到 `output` 目录。
      - **清理重置**: 点击"🧹 清理重置"清空当前所有文本框内容。
      - **应用设置 ⚙️**: 配置API Key、AI模型、STT设备和计算类型等。

## 核心组件 🧩

  - `main.py`: 应用主入口，负责构建和管理图形用户界面 (GUI) 及各模块的协调。
  - `audio_handler.py`: 处理音频输入（麦克风、系统声音），使用 `faster-whisper` 进行实时语音转录，集成 `Silero VAD` 进行语音活动检测。
  - `text_processing_handler.py`: 调用智谱AI API，负责文本的翻译、润色以及为"专业授课"模式生成Whisper提示词。
  - `config_manager.py`: 管理应用的配置信息（如API Key, 模型选择等），通过 `config/config.json` 文件进行持久化存储。
  - `utils.py`: 提供通用的辅助函数，如文件保存、资源路径获取等。

## 配置文件 `config/config.json` ⚙️

应用启动时会自动创建或加载此文件。您可以通过"应用设置"界面修改这些配置。

```json
{
    "zhipuai_api_key": "YOUR_ZHIPUAI_API_KEY",
    "zhipuai_model": "glm-4", // 可选 "glm-4-flash"
    "stt_device": "cpu", // 可选 "cuda"
    "stt_compute_type": "int8", // 可选 "float16", "float32"
    "target_language": "中文"
}
```

## API 使用说明 💡

本应用使用智谱AI (ZhipuAI) 提供的 API 进行文本翻译、润色和专业提示词生成。默认情况下：

  - **翻译与润色**功能使用在"应用设置"中配置的智谱AI模型（默认为 `glm-4`）。
  - **专业授课模式下的提示词生成**固定使用 `glm-4-flash` 模型，以保证快速响应。

请确保您已在智谱AI开放平台获取 API Key 并在本应用中正确配置，以便使用相关功能。

## 常见问题 ❓

  - **转录不准确或速度慢?**
      - 确保音频输入清晰，减少背景噪音。
      - 在"专业授课"模式下，尝试生成更精准的提示词。
      - 如果使用CPU，`large-v3-turbo` 模型可能会较慢。考虑在"应用设置"中切换到GPU (`cuda`) 并选择合适的计算类型 (`float16` 通常是速度和精度的良好平衡)。
      - 检查 `stt_compute_type` 设置，`int8` 速度最快但精度可能略低，`float32` 精度最高但速度最慢。
  - **无法捕获系统声音?**
      - 确保您的系统支持Loopback音频捕获，并且没有其他应用独占音频设备。
  - **API Key错误?**
      - 请在智谱AI开放平台获取有效的API Key，并在"应用设置"中正确填写。

## 贡献 🤝

欢迎任何形式的贡献！无论是提交 Issue、发起 Pull Request，还是提供新的想法，都对项目非常有帮助。
如果您发现了 Bug 或有功能建议，请随时在 "Issues" 页面提交。

## 鸣谢 🙏

  - 感谢 [智谱AI](https://open.bigmodel.cn/) 提供强大的大语言模型API支持。
  - 感谢 [faster-whisper](https://github.com/SYSTRAN/faster-whisper) 项目提供高效的语音识别引擎。
  - 感谢 [Silero VAD](https://github.com/snakers4/silero-vad) 提供精准的语音活动检测工具。
  - 感谢 [OpenAI Whisper](https://github.com/openai/whisper) 及 [HuggingFace](https://huggingface.co/collections/openai/whisper-20231116) 提供的语音识别模型资源。
  - 感谢 [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter) 提供的现代化UI组件库。
  - 以及所有依赖库的开发者们。
## Figma版本部分原型图展示：
<img width="2560" height="1600" alt="save" src="https://github.com/user-attachments/assets/05dc9fd7-3682-4d28-9447-a1c1d6c517db" />
<img width="2560" height="1600" alt="main_application_window_2" src="https://github.com/user-attachments/assets/9794021b-4739-4665-b718-7d2c521d4a26" />
<img width="2560" height="1600" alt="onboarding" src="https://github.com/user-attachments/assets/05e377c5-7ed3-4e43-9340-2722e29598bb" />
<img width="1324" height="669" alt="image" src="https://github.com/user-attachments/assets/e971d5b7-420a-4d33-bc71-7d892a37425d" />






## 许可证 📜

本项目采用 **GNU General Public License v3.0 (GPLv3)** 进行许可。

🎯 Translate2me - 让跨语言学习和工作更高效！
