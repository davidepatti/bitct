// A small macOS shell for the portable application. No server or third-party runtime.
import Cocoa
import WebKit

final class PlaygroundDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Bitcoin Playground"
        window.minSize = NSSize(width: 840, height: 690)
        window.contentView = webView
        window.backgroundColor = NSColor(calibratedRed: 0.973, green: 0.961, blue: 0.929, alpha: 1)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        installMenu()
        guard let url = Bundle.main.url(forResource: "bitcoin-playground", withExtension: "html") else {
            let alert = NSAlert()
            alert.messageText = "The Playground file is missing."
            alert.informativeText = "Download the complete app again, or open the portable HTML edition."
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    private func installMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Bitcoin Playground", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Bitcoin Playground", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewItem.submenu = viewMenu
        menu.addItem(viewItem)
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    @objc private func showAbout() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "Bitcoin Playground",
            .applicationVersion: "1.0.0",
            .credits: NSAttributedString(string: "An offline teaching simulation for the Bitcoin course.\nNo Bitcoin network connection or real funds."),
            .init(rawValue: "Copyright"): "Copyright © 2026 Davide Patti. MIT License."
        ])
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // The app only navigates its bundled document and its local hash routes.
        guard let url = navigationAction.request.url,
              url.isFileURL,
              url.standardizedFileURL.path == Bundle.main.url(forResource: "bitcoin-playground", withExtension: "html")?.standardizedFileURL.path else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = PlaygroundDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
