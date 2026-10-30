"""Play every real voice preview and verify its served PCM against the manifest."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import wave

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',default='http://localhost:3001')
    parser.add_argument('--output',default='.local/voice-previews-browser')
    args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    catalog=json.loads((ROOT/'frontend/src/data/voice-catalog.json').read_text())
    manifest=json.loads((ROOT/'frontend/src/data/voice-previews.json').read_text())
    results={'origin':args.origin,'previews':[],'passed':False}
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True)
        page=browser.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script('''window.previewAudio=[];const OriginalAudio=window.Audio;
          window.Audio=function(...args){const audio=new OriginalAudio(...args);window.previewAudio.push(audio);return audio;};
          window.Audio.prototype=OriginalAudio.prototype;''')
        try:
            page.goto(args.origin);page.wait_for_load_state('networkidle')
            page.get_by_role('button',name='Open Preferences',exact=True).click()
            page.get_by_role('button',name='Voice & Language',exact=True).click()
            for group in catalog:
                for voice in group['voices']:
                    preview=manifest[voice['id']]
                    response=page.request.get(args.origin+preview['src'])
                    assert response.ok, f"Missing sample: {voice['id']}"
                    with wave.open(io.BytesIO(response.body()),'rb') as audio:
                        assert audio.getframerate()==24000 and audio.getnchannels()==1
                        digest=hashlib.sha256(audio.readframes(audio.getnframes())).hexdigest()
                    assert digest==preview['pcmSha256']
                    page.get_by_role('button',name=f"Preview {voice['name']} {voice['lang']} voice",exact=True).click()
                    page.wait_for_function('() => previewAudio.at(-1).currentTime>0.05 && !previewAudio.at(-1).paused')
                    assert page.evaluate('expected => previewAudio.at(-1).src === new URL(expected, location.href).href',preview['src'])
                    assert page.evaluate('previewAudio.slice(0,-1).every(audio=>audio.paused)')
                    expect(page.get_by_role('button',name=f"Stop {voice['name']} {voice['lang']} voice",exact=True)).to_be_visible()
                    results['previews'].append({'voice':voice['id'],'sha256':digest,'played':True})
            page.get_by_role('button',name='Done',exact=True).click()
            assert page.evaluate('previewAudio.every(audio=>audio.paused)')
            assert len({row['sha256'] for row in results['previews']})==18
            assert not errors,errors
            results.update(passed=True,previous_audio_stopped=True,modal_close_stopped_audio=True,page_errors=errors)
            page.screenshot(path=str(output/'page.png'),full_page=True)
        finally:
            browser.close();(output/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(results,indent=2))

if __name__=='__main__':main()
