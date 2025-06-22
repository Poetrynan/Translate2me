# text_processing_handler.py
import threading
import zhipuai
import json

class TextProcessingHandler:
    def __init__(self, api_key="", zhipu_model="glm-4", callback=None, status_callback=None): # 默认使用 glm-4
        self.api_key = api_key
        self.zhipu_model = zhipu_model
        self.callback = callback
        self.status_callback = status_callback
        self.client = None
        self.is_processing = False

    def _update_status(self, message):
        if self.status_callback:
            self.status_callback(message)

    def set_api_key(self, api_key):
        self.api_key = api_key
        self.client = None # API Key 变化后，客户端需要重新初始化

    # [核心修正] 添加缺失的 set_zhipu_model 方法
    def set_zhipu_model(self, model_name):
        """设置智谱AI模型的名称"""
        if model_name: # 确保传入的 model_name 不是空字符串或 None
            self.zhipu_model = model_name
            self._update_status(f"智谱AI模型已更新为: {self.zhipu_model}")
        else:
            self._update_status("警告: 尝试设置空的智谱AI模型名称。")


    def _init_client(self):
        if not self.api_key:
            self._update_status("错误: 未设置API Key")
            return False
        try:
            self.client = zhipuai.ZhipuAI(api_key=self.api_key)
            return True
        except Exception as e:
            self._update_status(f"初始化API客户端失败: {e}")
            return False

    def generate_lecture_prompt(self, course_description):
        """
        为专业授课场景生成Whisper提示词。
        """
        if not self.client:
            if not self._init_client():
                return "错误: API客户端未初始化。"

        meta_prompt = f"""
As an expert in linguistics and the specific academic field of "{course_description}", your task is to generate a single, powerful sentence. This sentence will be used as an initial prompt for the Whisper speech recognition model to improve its accuracy on technical terms.

The sentence must:
1. Start with "You are a simultaneous interpretation expert in..."
2. Be concise and professional.
3. Include 3-5 of the most critical keywords related to the topic.
4. The entire output must be a single, valid JSON object with one key: "prompt".

Example for "Machine Learning and Deep Learning":
{{
  "prompt": "You are a simultaneous interpretation expert in machine learning and deep learning, focusing on terms like neural networks, backpropagation, and transformers."
}}

Now, generate the JSON for the topic: "{course_description}"
"""
        try:
            response = self.client.chat.completions.create(
                model="glm-4-flash",  # 使用快速模型生成提示词
                messages=[{"role": "user", "content": meta_prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,
                timeout=15.0,
            )
            result_content = response.choices[0].message.content
            result_data = json.loads(result_content)
            whisper_prompt = result_data.get("prompt", "")
            if whisper_prompt:
                return whisper_prompt.strip()
            else:
                return "错误: 未能从API响应中解析出提示词。"

        except Exception as e:
            return f"错误: 生成提示词时API调用失败: {e}"

    def process_text(self, text, target_language="中文"):
        """翻译并整理文本"""
        if self.is_processing: return
        if not text.strip():
            if self.callback: self.callback("输入文本为空", "输入文本为空")
            return
        if not self.client:
            if not self._init_client():
                if self.callback: self.callback("API客户端初始化失败", "API客户端初始化失败")
                return

        self.is_processing = True
        threading.Thread(
            target=self._processing_thread_worker, args=(text, target_language), daemon=True
        ).start()

    def _processing_thread_worker(self, text, target_language):
        try:
            prompt = f"""
As a professional AI assistant for international students, strictly follow these steps:
1. **Translate**: Translate the following "Original Text" into fluent and accurate "{target_language}".
2. **Standardize**: Review and polish the "{target_language}" translation. Correct grammar, improve phrasing to be professional, clear, and suitable for formal lecture notes.
3. **Format Output**: Return your work as a single, valid JSON object with two keys: "translation" (for the direct translation) and "standardized_text" (for the polished version). Do not include any other explanations.

--- Original Text ---
{text}
"""
            response = self.client.chat.completions.create(
                model=self.zhipu_model, # 这里会使用更新后的 zhipu_model
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            result_content = response.choices[0].message.content
            result_data = json.loads(result_content)
            translation = result_data.get("translation", "翻译结果解析失败")
            standardized = result_data.get("standardized_text", "整理结果解析失败")
            if self.callback:
                self.callback(translation, standardized)

        except Exception as e:
            error_msg = f"文本处理错误: {e}"
            if self.callback: self.callback(error_msg, error_msg)
        finally:
            self.is_processing = False