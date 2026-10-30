"""Fast offline regression tests; runnable without pytest."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from knowledge import LocalKnowledgeBase
from kokoro_engine import clean_text_for_tts, detect_language_and_voice
from key_pool import GroqKeyPool


class YukiOfflineTests(unittest.TestCase):
    def test_language_routing(self):
        cases = [("Hello", "en-us"), ("こんにちは", "ja"), ("Hola", "es"), ("नमस्ते", "hi")]
        for text, expected in cases:
            with self.subTest(text=text):
                self.assertEqual(detect_language_and_voice(text)[0], expected)

    def test_tts_cleanup(self):
        self.assertEqual(clean_text_for_tts("**Hello** https://example.com"), "Hello")

    def test_local_knowledge(self):
        kb = LocalKnowledgeBase(Path(__file__).parents[1] / "knowledge")
        self.assertTrue(kb.search("local RAG"))

    def test_key_pool_client_uses_selected_key(self):
        pool = GroqKeyPool(["key-a", "key-b"])
        selected = pool.get_api_key()
        self.assertIsNotNone(pool.get_async_client(selected))


if __name__ == "__main__":
    unittest.main()
