"""Browser regressions and optional live microphone lifecycle checks.

Install Playwright in a Python environment, then run against a running frontend.
Live mode uses YUKI_TEST_ACCESS_CODE and connects to the real worker.
"""
import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='http://localhost:3001')
    parser.add_argument('--output', default='.local/browser-checks')
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    results = {'origin': args.origin, 'mode': 'live' if args.live else 'browser-regression'}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=[
            '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        ])
        context = browser.new_context(permissions=['microphone'])
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('''
          window.ownedStreams = []; window.peerConnections = [];
          const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async (...args) => {
            const stream = await gum(...args); window.ownedStreams.push(stream); return stream;
          };
          const Peer = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends Peer {
            constructor(...args) { super(...args); window.peerConnections.push(this); }
          };
        ''')
        try:
            page.goto(args.origin)
            page.wait_for_load_state('networkidle')
            requests = []
            page.on('request', lambda request: requests.append(request.url) if '/api/token' in request.url else None)
            page.get_by_role('button', name='Start Conversation').click()
            expect(page.get_by_role('alert').filter(has_text='Please accept')).to_be_visible()
            assert not requests, 'Admission was requested without consent'
            results['consent_before_admission'] = True
            page.locator('#voice-consent').check()

            if args.live:
                page.get_by_label('Access code, if provided').fill(os.getenv('YUKI_TEST_ACCESS_CODE', ''))
                for attempt in range(2):
                    page.get_by_role('button', name='Start Conversation').click()
                    expect(page.get_by_role('button', name='End Call', exact=False)).to_be_visible(timeout=120000)
                    if attempt == 0:
                        page.get_by_role('button', name='Mute Mic', exact=False).click()
                    expect(page.get_by_role('button', name='Unmute Mic', exact=False)).to_be_visible()
                    assert page.evaluate('ownedStreams.every(s => s.getAudioTracks().every(t => t.readyState === "ended" || !t.enabled))')
                    page.get_by_role('button', name='End Call', exact=False).click()
                    page.wait_for_function('() => peerConnections.every(p => p.connectionState === "closed")')
                    page.wait_for_function('() => ownedStreams.every(s => s.getTracks().every(t => t.readyState === "ended"))')
                    page.wait_for_timeout(2500)
                results.update(live_connection=True, reconnect_keeps_mute=True, tracks_and_connections_closed=True)
            else:
                page.get_by_role('button', name='Open Preferences', exact=True).click()
                dialog = page.get_by_role('dialog')
                expect(dialog).to_be_visible()
                assert dialog.evaluate('(dialog) => dialog.contains(document.activeElement)')
                dialog.locator('button:not([disabled])').last.focus()
                page.keyboard.press('Tab')
                assert dialog.evaluate('(dialog) => dialog.contains(document.activeElement)')
                page.keyboard.press('Escape')
                expect(dialog).not_to_be_visible()
                results['preferences_focus_escape'] = True
                page.route('**/api/harness', lambda route: route.fulfill(status=429, content_type='application/json', body=json.dumps({'message': 'Please retry after 30s.'})))
                page.get_by_role('button', name='Open Harness & Observability Suite').click()
                page.get_by_role('button', name='Benchmarks', exact=True).click()
                page.get_by_role('button', name='Show test commands').click()
                expect(page.get_by_role('dialog').get_by_role('alert')).to_contain_text('Please retry after 30s.')
                results['diagnostic_failure_handled'] = True
                page.keyboard.press('Escape')
                page.route('**/api/token', lambda route: route.fulfill(status=503, content_type='application/json', body=json.dumps({'isConfigured': False, 'message': 'Test service unavailable.'})))
                for attempt in range(2):
                    page.get_by_role('button', name='Start Conversation').click()
                    page.get_by_role('button', name='Launch Sandbox Demo').click()
                    expect(page.get_by_role('button', name='End Call', exact=False)).to_be_visible()
                    if attempt == 0:
                        page.get_by_role('button', name='Mute Mic', exact=False).click()
                    assert page.evaluate('ownedStreams.at(-1).getAudioTracks()[0].enabled === false')
                    page.get_by_role('button', name='End Call', exact=False).click()
                    assert page.evaluate('ownedStreams.at(-1).getAudioTracks()[0].readyState === "ended"')
                results['sandbox_mute_and_cleanup'] = True

            page.screenshot(path=str(output / 'desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(output / 'mobile.png'), full_page=True)
            results['mobile_no_overflow'] = True
            page.emulate_media(reduced_motion='reduce')
            expect(page.locator('.voice-orb')).to_be_visible()
            results['reduced_motion'] = True
            assert not errors, errors
            results['page_errors'] = errors
            results['passed'] = True
        finally:
            context.close()
            browser.close()
            (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
