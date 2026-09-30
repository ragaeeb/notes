"""Actual Chromium core/worker check. Requires Python Playwright and system Chromium.
Not an app E2E result. Executes the local bundle at about:blank; no server.
"""
import json
import os
from pathlib import Path
import threading
import time
import psutil
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/implementation/evidence/chromium-core.json"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
stop = threading.Event()
samples = []
def sample():
    while not stop.is_set():
        rss = 0
        processes = 0
        for p in psutil.Process(os.getpid()).children(recursive=True):
            try:
                if "chromium" in p.name().lower():
                    rss += p.memory_info().rss
                    processes += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        if processes:
            samples.append({"unixSeconds":time.time(), "summedChromiumRssBytes":rss,"processes":processes})
        stop.wait(0.1)
thread = threading.Thread(target=sample, daemon=True)
thread.start()
logs = []
errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),headless=True,args=["--no-sandbox","--enable-precise-memory-info"])
        try:
            page = browser.new_page()
            page.on("console", lambda message: logs.append({"type":message.type,"text":message.text}))
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content('<h1>Chromium core — network-free qualification</h1><p>Production core executed in local wrappers and blob classic workers. Not the React app or Vite build.</p><pre id="result">Running…</pre>')
            page.evaluate((ROOT / ".offline-build/browser-memory.js").read_text())
            page.wait_for_function("window.__RESULT__ !== undefined", timeout=180000)
            report = page.evaluate("window.__RESULT__")
            report["browserVersion"] = browser.version
            report["console"] = logs
            report["uncaughtPageErrors"] = errors
            page.screenshot(path=str(ROOT/"docs/implementation/evidence/chromium-core.png"),full_page=True)
        finally:
            browser.close()
finally:
    stop.set()
    thread.join()
report["browserClosed"] = True
report["transport"] = "In-memory execution at about:blank. Managed URLBlocklist prevents navigation, including localhost; blob module workers also fail under this opaque origin. Policies were not changed. Blob classic workers execute the transpiled production entry with local module wrappers."
report["memory"] = {"measurement":"Sampled sum of Chromium process RSS every 100 ms; includes shared pages, NOT private/PSS or isolated peak worker memory.", "peakSummedRssBytes":max((s["summedChromiumRssBytes"] for s in samples),default=0), "samples":samples}
OUTPUT.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"output":str(OUTPUT),"summary":report["summary"],"browser":report["browserVersion"],"memoryPeakSumRss":report["memory"]["peakSummedRssBytes"],"responsiveness":report["responsiveness"]}))
for case in report["cases"]:
    if case["status"] == "fail":
        print(case["name"],case.get("detail"))
raise SystemExit(1 if report["summary"]["fail"] or errors else 0)
