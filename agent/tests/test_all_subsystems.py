"""Run strict model/provider checks followed by a real-room voice conversation."""
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    for script in [ROOT/'src/verify_models.py', ROOT/'eval_harness.py', ROOT/'tests/test_livekit_e2e.py']:
        subprocess.run([sys.executable,str(script)],check=True)
