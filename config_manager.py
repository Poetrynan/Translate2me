# config_manager.py
import json
import tkinter as tk
import customtkinter as ctk
from tkinter import messagebox
from pathlib import Path
from utils import get_config_file_path


class ConfigManager:
    def __init__(self):
        self.config_file = get_config_file_path()
        self.default_config = {
            "zhipuai_api_key": "",
            "zhipuai_model": "glm-4",
            "stt_device": "cpu",
            "stt_compute_type": "int8",
            "target_language": "中文"
        }
        self.config = self._load_config()

    def _load_config(self):
        try:
            if self.config_file.exists():
                with open(self.config_file, "r", encoding="utf-8") as f:
                    loaded_config = json.load(f)
                config = self.default_config.copy()
                config.update(loaded_config)
                return config
            else:
                self._save_config(self.default_config)
                return self.default_config.copy()
        except (json.JSONDecodeError, IOError):
            return self.default_config.copy()

    def _save_config(self, config_data):
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config_data, f, ensure_ascii=False, indent=4)
        except IOError as e:
            print(f"保存配置文件失败: {e}")

    def get_setting(self, key):
        return self.config.get(key, self.default_config.get(key))

    def set_setting(self, key, value):
        self.config[key] = value
        self._save_config(self.config)


class SettingsDialog(ctk.CTkToplevel):
    """
    [新增] 用于配置高级设置的对话框
    """

    def __init__(self, parent, config_manager):
        super().__init__(parent)
        self.config_manager = config_manager
        self.title("应用设置")
        self.geometry("500x320")
        self.resizable(False, False)
        self.grab_set()  # 模态窗口，阻止主窗口交互
        self.grid_columnconfigure(1, weight=1)

        # API Key
        ctk.CTkLabel(self, text="智谱AI API Key:").grid(row=0, column=0, padx=20, pady=(20, 5), sticky="w")
        self.api_key_var = tk.StringVar(value=self.config_manager.get_setting("zhipuai_api_key"))
        self.api_key_entry = ctk.CTkEntry(self, textvariable=self.api_key_var, width=250, show="*")
        self.api_key_entry.grid(row=0, column=1, padx=20, pady=(20, 5), sticky="ew")

        # Zhipu Model
        ctk.CTkLabel(self, text="智谱AI 模型:").grid(row=1, column=0, padx=20, pady=5, sticky="w")
        self.zhipu_model_var = tk.StringVar(value=self.config_manager.get_setting("zhipuai_model"))
        self.zhipu_model_entry = ctk.CTkComboBox(self, variable=self.zhipu_model_var,
                                                 values=["glm-4", "glm-4-flash"], width=250)
        self.zhipu_model_entry.grid(row=1, column=1, padx=20, pady=5, sticky="ew")

        # Separator
        separator = ctk.CTkFrame(self, height=2, fg_color="gray80")
        separator.grid(row=2, column=0, columnspan=2, padx=20, pady=15, sticky="ew")

        # STT Device
        ctk.CTkLabel(self, text="STT 运行设备:").grid(row=3, column=0, padx=20, pady=5, sticky="w")
        self.stt_device_var = tk.StringVar(value=self.config_manager.get_setting("stt_device"))
        self.stt_device_dropdown = ctk.CTkComboBox(self, variable=self.stt_device_var,
                                                   values=["cpu", "cuda"], width=250, state="readonly")
        self.stt_device_dropdown.grid(row=3, column=1, padx=20, pady=5, sticky="ew")

        # STT Compute Type
        ctk.CTkLabel(self, text="STT 计算类型:").grid(row=4, column=0, padx=20, pady=5, sticky="w")
        self.stt_compute_var = tk.StringVar(value=self.config_manager.get_setting("stt_compute_type"))
        self.stt_compute_dropdown = ctk.CTkComboBox(self, variable=self.stt_compute_var,
                                                    values=["int8", "float16", "float32"], width=250, state="readonly")
        self.stt_compute_dropdown.grid(row=4, column=1, padx=20, pady=5, sticky="ew")

        # Buttons
        button_frame = ctk.CTkFrame(self, fg_color="transparent")
        button_frame.grid(row=5, column=0, columnspan=2, pady=30, sticky="ew")
        button_frame.grid_columnconfigure((0, 1), weight=1)
        save_button = ctk.CTkButton(button_frame, text="保存并关闭", command=self.save_and_close)
        save_button.grid(row=0, column=0, padx=(20, 10), pady=10, sticky="ew")
        cancel_button = ctk.CTkButton(button_frame, text="取消", command=self.destroy, fg_color="gray")
        cancel_button.grid(row=0, column=1, padx=(10, 20), pady=10, sticky="ew")

        self.protocol("WM_DELETE_WINDOW", self.destroy)

    def save_and_close(self):
        """保存所有设置到文件并关闭窗口"""
        self.config_manager.set_setting("zhipuai_api_key", self.api_key_var.get().strip())
        self.config_manager.set_setting("zhipuai_model", self.zhipu_model_var.get())
        self.config_manager.set_setting("stt_device", self.stt_device_var.get())
        self.config_manager.set_setting("stt_compute_type", self.stt_compute_var.get())
        messagebox.showinfo("设置已保存", "部分设置（如STT设备）可能需要重新加载模型才能生效。", parent=self)
        self.destroy()