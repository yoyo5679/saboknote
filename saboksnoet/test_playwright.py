from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Listen for console events
        def handle_console(msg):
            print(f"CONSOLE [{msg.type}]: {msg.text}")
            
        def handle_page_error(err):
            print(f"PAGE ERROR: {err.message}")
            
        page.on("console", handle_console)
        page.on("pageerror", handle_page_error)
        
        print("Navigating to local index.html...")
        page.goto("file:///Users/hong-eunseong/Documents/안티그래비티/saboksnoet/index.html")
        
        # Give it a moment to load and execute
        page.wait_for_timeout(2000)
        
        # Check if functions exist
        res = page.evaluate("""() => {
            return {
                switchView: typeof switchView,
                openModal: typeof openModal,
                supabase: typeof supabase
            }
        }""")
        print(f"EVAL RESULT: {res}")
        
        print("Done.")
        browser.close()

if __name__ == '__main__':
    run()
