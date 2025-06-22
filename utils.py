# utils.py (Final Version)
import os
import sys
import datetime
from pathlib import Path

def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def ensure_directory(directory_path_str):
    directory_path = Path(directory_path_str)
    directory_path.mkdir(parents=True, exist_ok=True)
    return str(directory_path)

def save_text_to_file(text, file_prefix="output"):
    output_dir = ensure_directory("output")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"{file_prefix}_{timestamp}.txt"
    file_path = os.path.join(output_dir, file_name)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(text)
    return file_path

def get_config_file_path():
    config_dir = Path(".") / "config"
    ensure_directory(str(config_dir))
    return str(config_dir / "config.json")
# utils.py
import os
import sys
import datetime
from pathlib import Path
from tkinter import messagebox

def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")
    return Path(base_path) / relative_path

def ensure_directory(directory_path):
    directory_path.mkdir(parents=True, exist_ok=True)
    return directory_path

def save_text_to_file(text, file_prefix, parent_widget):
    """保存文本到文件，并显示信息框"""
    if not text.strip():
        messagebox.showwarning("无内容", "没有文本可供保存。", parent=parent_widget)
        return
    try:
        output_dir = ensure_directory(Path(".") / "output")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        file_name = f"{file_prefix}_{timestamp}.txt"
        file_path = output_dir / file_name
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(text)
        messagebox.showinfo("成功", f"文件已保存！\n路径: {file_path.absolute()}", parent=parent_widget)
    except Exception as e:
        messagebox.showerror("保存失败", f"保存文件时出错: {e}", parent=parent_widget)


def get_config_file_path():
    config_dir = Path(".") / "config"
    ensure_directory(config_dir)
    return config_dir / "config.json"