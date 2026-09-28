import UIKit
import WebKit
import Capacitor

/// SmileCompose's root view controller.
///
/// Works around Capacitor 8.5.2 on iOS 27: at page start, Capacitor's bridge
/// script calls `prompt()` synchronously to ask native whether its Cookies and
/// HTTP patches are enabled. That round trip never completes in the iOS 27
/// WebView, which leaves the app on a blank screen. Both features are disabled
/// in this app (native would answer "false"), so answer those two checks in the
/// page instead. Every other `prompt()` still goes to native unchanged.
///
/// Remove once a Capacitor release fixes the synchronous handshake.
class SmileComposeBridgeViewController: CAPBridgeViewController {
    private var launchCover: UIView?
    private var loadingObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        // App-local plugins: permission-free photo picker, native Sign in with Apple,
        // Keychain storage for the sign-in session and the appearance bridge.
        bridge?.registerPluginInstance(PhotoPickerPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(SecureStoragePlugin())
        bridge?.registerPluginInstance(AppearancePlugin())

        // Warm ivory in Light and deep charcoal in Dark behind the web view, so
        // launch, rotation and overscroll never flash white.
        view.backgroundColor = SmileComposeColors.background
        webView?.isOpaque = false
        webView?.backgroundColor = SmileComposeColors.background
        webView?.scrollView.backgroundColor = SmileComposeColors.background

        showLaunchCover()
    }

    /// Keeps the launch screen's artwork up until the page has loaded (its first
    /// paint is the matching web launch view), so startup never shows a blank
    /// frame between the two. Never holds the app for more than a few seconds.
    private func showLaunchCover() {
        guard let cover = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view else { return }
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.accessibilityElementsHidden = true // the web launch view announces loading
        view.addSubview(cover)
        launchCover = cover
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { self?.hideLaunchCover() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.hideLaunchCover() }
    }

    private func hideLaunchCover() {
        guard let cover = launchCover else { return }
        launchCover = nil
        loadingObservation = nil
        UIView.animate(withDuration: 0.25, animations: { cover.alpha = 0 }, completion: { _ in cover.removeFromSuperview() })
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let source = """
        (function () {
          var nativePrompt = window.prompt;
          window.prompt = function (message, defaultValue) {
            try {
              var payload = JSON.parse(message);
              if (payload && (payload.type === "CapacitorCookies.isEnabled" || payload.type === "CapacitorHttp")) return "false";
            } catch (error) {}
            return nativePrompt.call(window, message, defaultValue);
          };
        })();
        """
        // Capacitor has installed its content controller by now but adds its own
        // document-start scripts only after the web view exists, so this runs first.
        configuration.userContentController.addUserScript(
            WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        return super.webView(with: frame, configuration: configuration)
    }
}

/// SmileCompose surface colours for native views (matches src/app/theme.css).
enum SmileComposeColors {
    static let background = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x14 / 255, green: 0x13 / 255, blue: 0x12 / 255, alpha: 1)
            : UIColor(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF6 / 255, alpha: 1)
    }
    static let text = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0xF2 / 255, green: 0xED / 255, blue: 0xE6 / 255, alpha: 1)
            : UIColor(red: 0x3C / 255, green: 0x3C / 255, blue: 0x3C / 255, alpha: 1)
    }
}
