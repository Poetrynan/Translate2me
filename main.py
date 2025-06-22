# main.py
import os
import sys
import threading
import tkinter as tk
from tkinter import messagebox
import customtkinter as ctk
from pathlib import Path

# 确保所有模块都已正确导入
from audio_handler import AudioHandler
from text_processing_handler import TextProcessingHandler
from config_manager import ConfigManager, SettingsDialog
from utils import save_text_to_file, get_resource_path

# --- UI美学定义 ---
ctk.set_appearance_mode("Light")
ctk.set_default_color_theme("blue")

# --- 按钮颜色定义 ---
BLUE_BUTTON_COLOR = "#3B82F6"
BLUE_BUTTON_HOVER_COLOR = "#2563EB"
DISABLED_BUTTON_COLOR = "#94A3B8"

# --- 模型硬编码 ---
STT_MODEL_NAME = "large-v3-turbo"


class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Translate2me - 智能实时转录与翻译笔记")
        self.geometry("1280x800")
        self.minsize(1100, 720)

        # 初始化核心组件
        self.config_manager = ConfigManager()
        self.audio_handler = AudioHandler(
            ui_update_callback=self.handle_stt_update,
            status_callback=self.update_status,
            device=self.config_manager.get_setting("stt_device")
        )
        self.text_processor = TextProcessingHandler(
            api_key=self.config_manager.get_setting("zhipuai_api_key"),
            zhipu_model=self.config_manager.get_setting("zhipuai_model"),
            callback=self.handle_processed_text,
            status_callback=self.update_status
        )

        self.current_whisper_prompt = ""
        self.create_ui()

        self.after(100, self.initial_setup)
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

    def initial_setup(self):
        """应用启动后的初始化流程"""
        self.update_status("应用启动，准备加载本地STT模型...", "🟠")
        self.load_stt_model_from_config()
        self.update_device_list()
        if not self.config_manager.get_setting("zhipuai_api_key"):
            self.after(200, self.prompt_for_api_key_initial_dialog)
        else:
            self.update_status("API Key已配置，所有功能就绪。")

    def create_ui(self):
        """创建全新的用户界面"""
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # --- 顶部控制面板 ---
        control_panel = ctk.CTkFrame(self, corner_radius=0, fg_color="#F1F5F9", height=120)
        control_panel.grid(row=0, column=0, sticky="ew", padx=0, pady=0)
        control_panel.grid_columnconfigure(4, weight=1)

        # 音频设备设置
        device_frame = ctk.CTkFrame(control_panel, fg_color="transparent")
        device_frame.grid(row=0, column=0, padx=20, pady=20, sticky="w")
        ctk.CTkLabel(device_frame, text="音频设备", font=ctk.CTkFont(weight="bold")).pack(anchor="w")
        self.device_var = tk.StringVar()
        self.device_dropdown = ctk.CTkComboBox(device_frame, variable=self.device_var, state="readonly", width=200,
                                               button_color=BLUE_BUTTON_COLOR)
        self.device_dropdown.pack(anchor="w", pady=(5, 0))

        # 智能提示词生成器
        prompt_frame = ctk.CTkFrame(control_panel, fg_color="transparent")
        prompt_frame.grid(row=0, column=1, padx=20, pady=20, sticky="w")
        ctk.CTkLabel(prompt_frame, text="场景模式", font=ctk.CTkFont(weight="bold")).pack(anchor="w")
        self.prompt_mode_menu = ctk.CTkOptionMenu(prompt_frame,
                                                  values=["日常会话", "专业授课"],
                                                  command=self.toggle_prompt_mode,
                                                  fg_color=BLUE_BUTTON_COLOR,
                                                  button_color=BLUE_BUTTON_COLOR,
                                                  button_hover_color=BLUE_BUTTON_HOVER_COLOR)
        self.prompt_mode_menu.pack(anchor="w", pady=(5, 0))

        self.course_entry = ctk.CTkEntry(prompt_frame, placeholder_text="输入课程/专业名称...", width=200)
        self.generate_prompt_button = ctk.CTkButton(prompt_frame, text="生成提示词", command=self.generate_prompt,
                                                    fg_color=BLUE_BUTTON_COLOR, hover_color=BLUE_BUTTON_HOVER_COLOR)

        # 翻译语言设置
        lang_frame = ctk.CTkFrame(control_panel, fg_color="transparent")
        lang_frame.grid(row=0, column=2, padx=20, pady=20, sticky="w")
        ctk.CTkLabel(lang_frame, text="翻译目标语言", font=ctk.CTkFont(weight="bold")).pack(anchor="w")
        self.language_var = tk.StringVar(value=self.config_manager.get_setting("target_language"))
        self.language_dropdown = ctk.CTkComboBox(lang_frame, variable=self.language_var,
                                                 values=["中文", "English", "日本語", "한국어", "Français", "Deutsch"],
                                                 state="readonly", command=self.on_target_language_change,
                                                 button_color=BLUE_BUTTON_COLOR)
        self.language_dropdown.pack(anchor="w", pady=(5, 0))

        # 主操作按钮
        action_frame = ctk.CTkFrame(control_panel, fg_color="transparent")
        action_frame.grid(row=0, column=3, padx=(20, 10), pady=20, sticky="w")
        ctk.CTkLabel(action_frame, text="主操作", font=ctk.CTkFont(weight="bold")).pack(anchor="w")
        self.listen_button = ctk.CTkButton(action_frame, text="🎤 开始聆听", height=38,
                                           font=ctk.CTkFont(size=16, weight="bold"),
                                           command=self.toggle_listening,
                                           fg_color=BLUE_BUTTON_COLOR,
                                           hover_color=BLUE_BUTTON_HOVER_COLOR,
                                           state="disabled")
        self.listen_button.pack(fill="x", pady=(5, 0))
        self.toggle_prompt_mode("日常会话")

        # 设置按钮
        settings_frame = ctk.CTkFrame(control_panel, fg_color="transparent")
        settings_frame.grid(row=0, column=4, padx=20, pady=20, sticky="e")
        ctk.CTkButton(settings_frame, text="应用设置 ⚙️", command=self.show_settings_dialog,
                      fg_color="#64748B", hover_color="#475569").pack()

        # --- 内容显示区 ---
        main_content_frame = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        main_content_frame.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 10))
        main_content_frame.grid_columnconfigure((0, 1), weight=1)
        main_content_frame.grid_rowconfigure(1, weight=1)

        ctk.CTkLabel(main_content_frame, text="实时转录 (原文)", font=ctk.CTkFont(size=18, weight="bold")).grid(row=0,
                                                                                                                column=0,
                                                                                                                padx=10,
                                                                                                                pady=(
                                                                                                                5, 5),
                                                                                                                sticky="w")
        self.transcript_textbox = ctk.CTkTextbox(main_content_frame, wrap="word", font=("Arial", 16),
                                                 corner_radius=8, border_width=1, border_color="#D1D5DB")
        self.transcript_textbox.grid(row=1, column=0, sticky="nsew", padx=(10, 5), pady=5)

        ctk.CTkLabel(main_content_frame, text="翻译与整理 (结果)", font=ctk.CTkFont(size=18, weight="bold")).grid(row=0,
                                                                                                                  column=1,
                                                                                                                  padx=10,
                                                                                                                  pady=(
                                                                                                                  5, 5),
                                                                                                                  sticky="w")
        self.processed_textbox = ctk.CTkTextbox(main_content_frame, wrap="word", font=("Microsoft YaHei UI", 16),
                                                corner_radius=8, border_width=1, border_color="#D1D5DB")
        self.processed_textbox.grid(row=1, column=1, sticky="nsew", padx=(5, 10), pady=5)

        bottom_bar = ctk.CTkFrame(main_content_frame, fg_color="transparent")
        bottom_bar.grid(row=2, column=0, columnspan=2, sticky="ew", padx=10, pady=(10, 0))
        self.process_button = ctk.CTkButton(bottom_bar, text="⚡ 翻译与整理", state="disabled",
                                            command=self.process_full_transcript, fg_color="#10B981",
                                            hover_color="#059669")
        self.process_button.pack(side="left", padx=(0, 10))
        self.clear_button = ctk.CTkButton(bottom_bar, text="🧹 清理重置", command=self.clear_all_content,
                                          fg_color="#6B7280", hover_color="#4B5563")
        self.clear_button.pack(side="left")

        self.save_original_button = ctk.CTkButton(bottom_bar, text="💾 保存原文", command=self.save_transcript_text)
        self.save_original_button.pack(side="right")
        self.save_processed_button = ctk.CTkButton(bottom_bar, text="💾 保存结果", command=self.save_processed_text)
        self.save_processed_button.pack(side="right", padx=(0, 10))

        self.status_bar_frame = ctk.CTkFrame(self, height=25, corner_radius=0, fg_color="#F1F5F9",
                                             border_width=1, border_color="#E2E8F0")
        self.status_bar_frame.grid(row=2, column=0, sticky="ew")
        self.status_icon = ctk.CTkLabel(self.status_bar_frame, text="⚪", font=ctk.CTkFont(size=14))
        self.status_icon.pack(side="left", padx=(10, 5))
        self.status_bar = ctk.CTkLabel(self.status_bar_frame, text="就绪", anchor="w", font=ctk.CTkFont(size=12))
        self.status_bar.pack(side="left", padx=5, fill="x", expand=True)

    def toggle_prompt_mode(self, mode):
        """切换场景模式时，更新UI"""
        if mode == "专业授课":
            self.course_entry.pack(anchor="w", pady=(5, 5), fill="x")
            self.generate_prompt_button.pack(anchor="w", fill="x")
            self.listen_button.configure(state="disabled")  # 需要先生成prompt才能开始
            self.update_status("已切换到专业授课模式，请输入课程名称并生成提示词。", "🔵")
        else:  # 日常会话
            self.course_entry.pack_forget()
            self.generate_prompt_button.pack_forget()
            self.current_whisper_prompt = "The following is a general conversation."  # 默认提示词
            if self.audio_handler.model:  # 检查模型是否已加载
                self.listen_button.configure(state="normal")
            else:
                self.listen_button.configure(state="disabled")  # 如果模型未加载，保持禁用
            self.update_status("已切换到日常会话模式，可直接开始聆听。", "🔵")

    def generate_prompt(self):
        """点击按钮，调用API生成提示词"""
        course_description = self.course_entry.get()
        if not course_description.strip():
            messagebox.showwarning("输入为空", "请输入您的课程或专业名称。", parent=self)
            return

        self.generate_prompt_button.configure(state="disabled", text="生成中...")
        self.listen_button.configure(state="disabled")

        threading.Thread(
            target=self._generate_prompt_worker,
            args=(course_description,),
            daemon=True
        ).start()

    def _generate_prompt_worker(self, course_description):
        """在后台线程中调用API"""
        prompt = self.text_processor.generate_lecture_prompt(course_description)
        self.after(0, self._on_prompt_generated, prompt)

    def _on_prompt_generated(self, prompt):
        """API调用完成后在主线程更新UI"""
        self.generate_prompt_button.configure(state="normal", text="生成提示词")
        if "错误:" in prompt:
            self.update_status(prompt, "🔴")
            messagebox.showerror("提示词生成失败", prompt, parent=self)
        else:
            self.current_whisper_prompt = prompt
            self.update_status(f"专家提示词已生成，可以开始聆听。", "🟢")
            self.listen_button.configure(state="normal")
            messagebox.showinfo("提示词已生成", f"已为您生成以下专家提示词：\n\n'{prompt}'", parent=self)

    def load_stt_model_from_config(self):
        """从配置文件加载STT模型"""
        device = self.config_manager.get_setting("stt_device")
        compute_type = self.config_manager.get_setting("stt_compute_type")
        model_path = Path(get_resource_path("manual_models")) / STT_MODEL_NAME

        if not model_path.exists() or not (model_path / "model.bin").exists():
            self.update_status(f"错误: 在 {model_path} 中找不到模型文件！", "🔴")
            messagebox.showerror("模型文件缺失", f"无法在指定路径找到模型：\n{model_path.absolute()}")
            # 即使模型加载失败，也应该让按钮恢复可操作状态，但不是开始聆听的状态
            self.listen_button.configure(state="disabled", text="模型加载失败")
            return

        self.listen_button.configure(state="disabled", text="模型加载中...")
        self.update_status(f"正在加载 {STT_MODEL_NAME} ({compute_type} on {device})...", "🟠")
        threading.Thread(target=self._load_stt_model_thread_worker, args=(str(model_path), device, compute_type),
                         daemon=True).start()

    def _load_stt_model_thread_worker(self, model_path_or_name, device, compute_type):
        """在后台线程中加载STT模型"""
        success = self.audio_handler.load_model(model_path_or_name, device, compute_type)
        if success:
            self.update_status(f"STT模型加载成功，随时可以开始。", "🟢")
            # 根据当前场景模式决定 listen_button 的状态
            button_state = "normal" if self.prompt_mode_menu.get() == "日常会话" else "disabled"
            if self.prompt_mode_menu.get() == "专业授课" and self.current_whisper_prompt and "错误:" not in self.current_whisper_prompt:
                button_state = "normal"  # 如果是专业授课且已生成有效prompt，则也启用

            self.after(0, lambda: self.listen_button.configure(
                state=button_state,
                text="🎤 开始聆听"
            ))
        else:
            self.update_status(f"错误：STT模型加载失败。", "🔴")
            self.after(0, lambda: self.listen_button.configure(
                state="disabled",
                text="模型加载失败"
            ))

    def show_settings_dialog(self):
        """显示设置对话框，并在关闭后处理模型重载"""
        original_device = self.config_manager.get_setting("stt_device")
        original_compute_type = self.config_manager.get_setting("stt_compute_type")

        dialog = SettingsDialog(self, self.config_manager)
        self.wait_window(dialog)

        new_device = self.config_manager.get_setting("stt_device")
        new_compute_type = self.config_manager.get_setting("stt_compute_type")

        self.text_processor.set_api_key(self.config_manager.get_setting("zhipuai_api_key"))
        self.text_processor.set_zhipu_model(self.config_manager.get_setting("zhipuai_model"))

        if original_device != new_device or original_compute_type != new_compute_type:
            self.update_status("STT配置已更改，将重新加载模型...", "🟠")
            if self.audio_handler.is_listening:
                self.audio_handler.stop_listening()
                self.listen_button.configure(text="🎤 开始聆听")

            self.audio_handler = AudioHandler(
                ui_update_callback=self.handle_stt_update,
                status_callback=self.update_status,
                device=new_device
            )
            self.load_stt_model_from_config()  # 会自动更新按钮状态
        else:
            self.update_status("设置已更新。")

    def update_device_list(self):
        """更新可用音频设备列表"""
        devices = self.audio_handler.get_available_devices()
        self.device_dropdown.configure(values=devices if devices else ["未找到设备"])
        if devices:
            self.device_var.set(devices[0])

    def toggle_listening(self):
        """开始或停止聆听"""
        if self.audio_handler.is_listening:
            self.audio_handler.stop_listening()
            self.listen_button.configure(text="🎤 开始聆听")
            if self.audio_handler.get_full_transcript().strip():  # 检查是否有内容
                self.process_button.configure(state="normal")
            self.update_status("聆听已停止。", "🟢")
        else:
            # BUG 1 & 2 修正点：开始新的聆听前，不应调用 clear_all_content()
            # UI上的转录文本框将在新的转录开始时自动被新内容覆盖或清空（由handle_stt_update和_update_transcript_ui的逻辑决定）
            # AudioHandler 内部的 full_transcript_parts 会在 start_listening 时清空

            device_name = self.device_var.get()
            if not device_name or "未找到" in device_name:
                messagebox.showerror("设备错误", "请选择一个有效的音频输入设备。", parent=self)
                return

            # [修正] 清空上一次的实时转录文本框，但保留处理结果
            self.transcript_textbox.delete("1.0", "end")
            # audio_handler内部会在start_listening时清空其full_transcript_parts

            self.update_status(f"正在启动对 {device_name} 的监听...", "🔵")
            success = self.audio_handler.start_listening(device_name, initial_prompt=self.current_whisper_prompt)
            if success:
                self.listen_button.configure(text="⏹️ 停止聆听")
                self.process_button.configure(state="disabled")  # 新的聆听开始，禁用处理按钮
            else:
                self.update_status("启动监听失败，请检查设备或日志。", "🔴")

    def handle_stt_update(self, new_text_segment, full_text):
        self.after(0, self._update_transcript_ui, full_text)

    def _update_transcript_ui(self, full_text_so_far):
        self.transcript_textbox.delete("1.0", "end")
        self.transcript_textbox.insert("1.0", full_text_so_far)
        self.transcript_textbox.see("end")

    def process_full_transcript(self):
        transcript = self.audio_handler.get_full_transcript()
        if not transcript.strip():
            messagebox.showwarning("无内容", "没有转录内容可供处理。", parent=self)
            return

        # 检查API Key
        current_api_key = self.config_manager.get_setting("zhipuai_api_key")
        if not current_api_key:
            messagebox.showerror("API Key缺失", "请先在“应用设置”中配置您的智谱AI API Key。", parent=self)
            self.show_settings_dialog()  # 引导用户去设置
            return

        self.process_button.configure(state="disabled")
        target_language = self.language_var.get()
        self.update_status(f"正在翻译和整理文本到 {target_language}...", "🟠")
        self.processed_textbox.delete("1.0", "end")
        self.processed_textbox.insert("1.0",
                                      f"正在请求 {self.config_manager.get_setting('zhipuai_model')} 进行处理，请稍候...")
        self.text_processor.process_text(transcript, target_language)

    def handle_processed_text(self, translation, normalized):
        self.after(0, self._update_processed_text_ui, translation, normalized)
        self.after(0, self.process_button.configure, {"state": "normal"})

    def _update_processed_text_ui(self, translation, normalized):
        self.processed_textbox.delete("1.0", "end")
        self.processed_textbox.insert("end", f"【翻译速览】\n{translation}\n\n")
        self.processed_textbox.insert("end", f"【整理润色】\n{normalized}")

    def on_target_language_change(self, selected_language):
        self.config_manager.set_setting("target_language", selected_language)
        self.update_status(f"翻译目标语言已设置为: {selected_language}")

    def save_transcript_text(self):
        save_text_to_file(self.transcript_textbox.get("1.0", "end-1c"), "transcript_original", self)

    def save_processed_text(self):
        save_text_to_file(self.processed_textbox.get("1.0", "end-1c"), "processed_result", self)

    def clear_all_content(self):
        """只由“清理重置”按钮调用，用于清空所有文本框和内部记录"""
        if self.audio_handler.is_listening:
            messagebox.showwarning("操作无效", "请先停止聆听，再进行清理重置。", parent=self)
            return

        self.transcript_textbox.delete("1.0", "end")
        self.processed_textbox.delete("1.0", "end")
        if self.audio_handler:  # 确保 audio_handler 存在
            self.audio_handler.full_transcript_parts.clear()
            self.audio_handler.stable_context = ""  # 也重置滚动上下文

        # 重置场景模式到日常会话，并更新按钮状态
        self.prompt_mode_menu.set("日常会话")
        self.toggle_prompt_mode("日常会话")  # 这会处理 listen_button 的状态

        self.update_status("内容已清空，准备开始新的任务。", "🟢")

    def update_status(self, message, icon_key="🟢"):
        print(f"STATUS: {message}")
        self.after(0, lambda: self.status_icon.configure(text=icon_key))
        self.after(0, lambda: self.status_bar.configure(text=message))

    def on_closing(self):
        if self.audio_handler.is_listening:
            self.audio_handler.stop_listening()
        self.destroy()

    def prompt_for_api_key_initial_dialog(self):
        dialog = ctk.CTkInputDialog(
            text="首次使用，请输入您的智谱AI API Key以启用翻译和智能提示词功能。",
            title="API Key 配置")
        key_input = dialog.get_input()
        if key_input and key_input.strip():
            self.config_manager.set_setting("zhipuai_api_key", key_input.strip())
            self.text_processor.set_api_key(key_input.strip())  # 确保也更新 text_processor 实例
            self.update_status("API Key 已保存。", "🟢")
        else:
            self.update_status("API Key 未设置，高级功能将受限。", "🟠")


if __name__ == "__main__":
    app = App()
    app.mainloop()