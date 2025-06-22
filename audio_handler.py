# audio_handler.py (留学生听课优化版 - 修正TypeError)
import threading
import queue
import time
import sys
import numpy as np
import sounddevice as sd
import soundcard as sc
from pathlib import Path
from faster_whisper import WhisperModel
import torch
from collections import deque
import hashlib
from difflib import SequenceMatcher
import re


class AudioHandler:
    def __init__(self, ui_update_callback=None, status_callback=None, device='cpu'):
        self.ui_update_callback = ui_update_callback
        self.status_callback = status_callback
        self.is_listening = False
        self.device = device
        self.compute_type = None

        self.audio_input_queue = queue.Queue()
        self.sample_rate = 16000
        self.channels = 1
        self.dtype = np.float32

        self.model = None
        self._audio_capture_thread = None
        self._transcription_thread = None
        self._sd_stream = None

        self.full_transcript_parts = []
        self.recent_transcripts = deque(maxlen=15)
        self.transcript_hashes = set()
        self.stable_context = ""
        self.dynamic_initial_prompt = "The following is an academic lecture. Focus on accurate transcription of spoken English."

        self.vad_model = None
        self.get_speech_timestamps = None
        try:
            base_dir = Path(__file__).resolve().parent
            vad_repo_path = base_dir / 'silero-vad-master'
            if vad_repo_path.exists():
                self.vad_model, self.vad_utils = torch.hub.load(
                    repo_or_dir=str(vad_repo_path), model='silero_vad', source='local', onnx=True, trust_repo=True
                )
                self.get_speech_timestamps = self.vad_utils[0]
                self._update_status("Silero VAD模型已加载 (留学生优化)。")
            else:
                self._update_status("警告：未找到Silero VAD，将使用Whisper内置VAD。")
        except Exception as e:
            self._update_status(f"VAD模型加载失败: {e} (留学生优化)")

        self._setup_optimized_params(device)

    def _setup_optimized_params(self, device):
        """为留学生听课场景（可能含非母语口音）优化的参数"""
        self.active_params = {
            "buffer_size_seconds": 6.0,
            "vad_threshold": 0.4,
            "beam_size": 5,
            "temperature": 0.0,
            "no_speech_threshold": 0.6,
            "min_confidence": -1.0,
            "condition_on_previous_text": True,
            "similarity_threshold": 0.7,
            "vad_min_silence_duration_ms": 1000,
            # [核心修正] 确保 patience 是一个浮点数，而不是 None
            "patience": 1.0,
            "length_penalty": 1.0,
        }
        if 'cuda' in device.lower():
            self.active_params["beam_size"] = 5
            self._update_status("参数策略：CUDA留学生优化模式。")
        else:
            self.active_params["beam_size"] = 3
            self._update_status("参数策略：CPU留学生优化模式。")

    def _update_status(self, message):
        if self.status_callback:
            self.status_callback(message)

    def load_model(self, model_path_or_name, device, compute_type):
        try:
            self._update_status(f"正在加载留学生优化模型 {Path(model_path_or_name).name} ({compute_type}) 到 {device}")
            self.model = WhisperModel(
                model_path_or_name, device=device, compute_type=compute_type, local_files_only=True
            )
            self.compute_type = compute_type
            self.device = device
            self._update_status(f"留学生优化模型 {Path(model_path_or_name).name} 加载成功。")
            return True
        except Exception as e:
            self._update_status(f"留学生优化模型加载失败: {e}")
            self.model = None
            return False

    def get_available_devices(self):
        devices_list = []
        try:
            for i, device_info in enumerate(sd.query_devices()):
                if device_info['max_input_channels'] > 0:
                    devices_list.append(f"{device_info['name']}")
        except Exception:
            pass
        try:
            if sc.default_speaker():
                devices_list.append("系统声音 (Loopback)")
        except Exception:
            pass
        return devices_list if devices_list else ["未找到可用设备"]

    def start_listening(self, device_identifier, initial_prompt=""):
        if self.is_listening: return True
        if not self.model: return False

        self.is_listening = True
        self.full_transcript_parts.clear()
        self.recent_transcripts.clear()
        self.transcript_hashes.clear()
        self.stable_context = ""
        self.dynamic_initial_prompt = initial_prompt.strip() if initial_prompt.strip() else "The following is an academic lecture. Focus on accurate transcription of spoken English, including diverse accents."

        while not self.audio_input_queue.empty():
            try:
                self.audio_input_queue.get_nowait()
            except queue.Empty:
                break

        self._audio_capture_thread = threading.Thread(
            target=self._capture_audio_loop, args=(device_identifier,), daemon=True
        )
        self._transcription_thread = threading.Thread(target=self._reliable_processing_loop, daemon=True)
        self._audio_capture_thread.start()
        self._transcription_thread.start()
        return True

    def stop_listening(self):
        if not self.is_listening: return
        self.is_listening = False
        self.audio_input_queue.put(None)

        if self._sd_stream and self._sd_stream.active:
            try:
                self._sd_stream.stop(ignore_errors=True)
                self._sd_stream.close(ignore_errors=True)
            except Exception as e:
                print(f"停止音频流错误: {e}")
        self._sd_stream = None

        for thread in [self._audio_capture_thread, self._transcription_thread]:
            if thread and thread.is_alive():
                thread.join(timeout=1.0)
        self._update_status("监听已停止。")

    def _sd_callback(self, indata, frames, time, status):
        if self.is_listening:
            self.audio_input_queue.put(indata.copy())

    def _capture_audio_loop(self, device_identifier):
        try:
            if "Loopback" in device_identifier:
                default_speaker = sc.default_speaker()
                if not default_speaker:
                    self._update_status("错误：找不到默认扬声器用于系统声音捕获。")
                    return
                mic_id = default_speaker.id
                with sc.get_microphone(id=str(mic_id), include_loopback=True).recorder(
                        samplerate=self.sample_rate, channels=self.channels) as mic:
                    while self.is_listening:
                        data = mic.record(numframes=self.sample_rate // 10)
                        if self.is_listening and data is not None:
                            self.audio_input_queue.put(data.astype(self.dtype))
            else:
                device_id_int = None
                all_devices = sd.query_devices()
                for i, dev_info in enumerate(all_devices):
                    if dev_info['name'] == device_identifier and dev_info['max_input_channels'] > 0:
                        device_id_int = i
                        break

                if device_id_int is None:
                    self._update_status(f"错误：找不到名为 '{device_identifier}' 的有效输入设备。")
                    return

                self._sd_stream = sd.InputStream(samplerate=self.sample_rate, device=device_id_int,
                                                 channels=self.channels,
                                                 dtype=self.dtype, callback=self._sd_callback,
                                                 blocksize=int(self.sample_rate * 0.1))
                self._sd_stream.start()
                while self.is_listening:
                    time.sleep(0.1)
        except Exception as e:
            self._update_status(f"音频捕获错误: {e}")
            import traceback
            traceback.print_exc()

    def _reliable_processing_loop(self):
        params = self.active_params
        buffer_size = int(self.sample_rate * params["buffer_size_seconds"])
        accumulated_audio = np.array([], dtype=self.dtype)

        while self.is_listening:
            try:
                audio_chunk = self.audio_input_queue.get(timeout=0.1)
                if audio_chunk is None: break

                mono_chunk = audio_chunk.flatten()
                accumulated_audio = np.concatenate((accumulated_audio, mono_chunk))

                if len(accumulated_audio) < buffer_size:
                    continue

                if self.get_speech_timestamps:
                    speech_timestamps = self.get_speech_timestamps(
                        torch.from_numpy(accumulated_audio), self.vad_model,
                        threshold=params['vad_threshold'],
                        min_silence_duration_ms=500,
                        min_speech_duration_ms=150
                    )
                    if not speech_timestamps:
                        keep_samples = len(accumulated_audio) // 3
                        accumulated_audio = accumulated_audio[-keep_samples:]
                        continue

                self._transcribe_with_deduplication(accumulated_audio)
                accumulated_audio = np.array([], dtype=self.dtype)

            except queue.Empty:
                continue
            except Exception as e:
                print(f"处理循环错误: {e}")
                import traceback
                traceback.print_exc()

    def _transcribe_with_deduplication(self, audio_data):
        if not self.model: return
        params = self.active_params
        try:
            prompt = (self.dynamic_initial_prompt + " " + self.stable_context).strip()

            vad_config = {
                "threshold": params["no_speech_threshold"],
                "min_silence_duration_ms": params["vad_min_silence_duration_ms"]
            }

            # 确保 patience 是浮点数
            current_patience = params.get("patience", 1.0)  # 如果 get 返回 None，则默认为 1.0
            if current_patience is None:  # 再次检查，以防 params 中存的是 None
                current_patience = 1.0

            segments, info = self.model.transcribe(
                audio_data,
                beam_size=params["beam_size"],
                language='en',
                initial_prompt=prompt,
                vad_filter=True,
                vad_parameters=vad_config,
                temperature=params["temperature"],
                condition_on_previous_text=params["condition_on_previous_text"],
                patience=current_patience,  # 使用确保是浮点数的 patience
                length_penalty=params.get("length_penalty", 1.0),  # 确保 length_penalty 也有默认值
            )
            new_text = self._process_segments(segments)
            if new_text and not self._is_duplicate_or_repetitive(new_text):
                self._update_transcript(new_text)
        except Exception as e:
            self._update_status(f"转录错误 (留学生优化): {e}")
            import traceback
            traceback.print_exc()

    def _process_segments(self, segments):
        text_parts = []
        for segment in segments:
            if hasattr(segment, 'avg_logprob') and segment.avg_logprob < self.active_params["min_confidence"]:
                continue
            text_parts.append(segment.text.strip())
        return " ".join(text_parts).strip()

    def _is_duplicate_or_repetitive(self, new_text):
        text_hash = hashlib.md5(new_text.encode()).hexdigest()
        if text_hash in self.transcript_hashes:
            return True
        for recent in self.recent_transcripts:
            if SequenceMatcher(None, new_text.lower(), recent.lower()).ratio() > self.active_params[
                "similarity_threshold"]:
                return True
        return False

    def _update_transcript(self, new_text):
        self.recent_transcripts.append(new_text)
        self.transcript_hashes.add(hashlib.md5(new_text.encode()).hexdigest())

        self.stable_context = (self.stable_context + " " + new_text).strip()
        context_words = self.stable_context.split()
        if len(context_words) > 70:
            self.stable_context = " ".join(context_words[-60:])

        self.full_transcript_parts.append(new_text)
        if self.ui_update_callback:
            full_text = " ".join(self.full_transcript_parts)
            self.ui_update_callback(new_text, full_text)

    def get_full_transcript(self):
        return " ".join(self.full_transcript_parts)