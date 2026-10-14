import UIKit
import WebKit
import Capacitor
import AVFoundation
import Photos

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
    private let sideBar = SideBarPlugin()

    override func capacitorDidLoad() {
        // App-local plugins: permission-free photo picker, native Sign in with Apple,
        // Keychain storage for the sign-in session and the appearance bridge.
        bridge?.registerPluginInstance(PhotoPickerPlugin())
        bridge?.registerPluginInstance(ShortcutsPlugin.shared)
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(SecureStoragePlugin())
        bridge?.registerPluginInstance(AppearancePlugin())
        bridge?.registerPluginInstance(sideBar)
        bridge?.registerPluginInstance(HapticsPlugin())
        bridge?.registerPluginInstance(PermissionsPlugin())
        if #available(iOS 27.1, *) {
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { (self: Self, _: UITraitCollection) in
                self.view.setNeedsLayout()
            }
        }

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

    // MARK: iPhone Duo side bar

    #if DEBUG
    /// Layout checks only (never in a release build): a headless simulator cannot be turned, so
    /// launching with `-SmileOrientation landscape` (or `portrait`) asks the scene for that orientation.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let wanted = UserDefaults.standard.string(forKey: "SmileOrientation"),
              let scene = view.window?.windowScene else { return }
        // "landscape" turns the device anticlockwise, which keeps iPhone Duo's side bar on the right.
        let mask: UIInterfaceOrientationMask = wanted == "landscape" ? .landscapeLeft : wanted == "landscapeRight" ? .landscapeRight : .portrait
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
            NSLog("SmileOrientation %@ refused: %@", wanted, error.localizedDescription)
        }
    }
    #endif

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishSideBar()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSideBar()
    }

    /// Where the system keeps its vertical bar (the outer display, and the inner display in
    /// landscape) and, while the device is partly folded, where the fold divides the screen.
    /// The web app draws its own controls, so it is told the same geometry system bars use.
    private func publishSideBar() {
        guard #available(iOS 27.1, *) else { return }
        var state: [String: Any] = ["edge": "none", "viewWidth": view.bounds.width, "viewHeight": view.bounds.height]
        let edge = traitCollection.verticalBarEdge
        if edge != .unspecified {
            let rightToLeft = view.effectiveUserInterfaceLayoutDirection == .rightToLeft
            let onRight = (edge == .trailing) != rightToLeft
            // The column a 44-point system bar would occupy: below the clock and camera, above the Home indicator.
            let bar = view.edgeInsets(for: .bar(onEdge: onRight ? .right : .left, extent: 44))
            state["edge"] = onRight ? "right" : "left"
            state["inset"] = onRight ? view.safeAreaInsets.right : view.safeAreaInsets.left
            state["x"] = bar.left
            state["y"] = bar.top
            state["width"] = view.bounds.width - bar.left - bar.right
            state["height"] = view.bounds.height - bar.top - bar.bottom
        }
        if let fold = view.reservedRegions(kind: .division).first(where: { $0.isActive }) {
            state["fold"] = ["x": fold.frame.minX, "y": fold.frame.minY, "width": fold.frame.width, "height": fold.frame.height]
        }
        sideBar.update(state)
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

/// iPhone Duo: reports where the system's side bar sits (`get`, and `change` events as the
/// device opens, closes, turns or folds). See `publishSideBar()` above and src/native/sideBar.ts.
@objc(SideBarPlugin)
public class SideBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SideBarPlugin"
    public let jsName = "SmileSideBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]
    private var state: [String: Any] = ["edge": "none"]

    func update(_ next: [String: Any]) {
        guard !NSDictionary(dictionary: next).isEqual(to: state) else { return }
        state = next
        #if DEBUG
        NSLog("SmileSideBar %@", "\(next)")
        #endif
        notifyListeners("change", data: next)
    }

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state) }
    }
}

/// A small tap in the hand: a smile is ready, the comparison divider passes its resting place, a tooth
/// is chosen, a main gold button is pressed. The system's own haptics setting applies. See src/native/haptics.ts.
@objc(HapticsPlugin)
public class HapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HapticsPlugin"
    public let jsName = "SmileHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]
    private let selection = UISelectionFeedbackGenerator()
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let light = UIImpactFeedbackGenerator(style: .light)

    @objc func play(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        DispatchQueue.main.async {
            switch kind {
            case "ready": self.soft.impactOccurred(intensity: 0.9)
            case "tick": self.selection.selectionChanged()
            case "select": self.light.impactOccurred(intensity: 0.7)
            case "press": self.light.impactOccurred(intensity: 0.45)
            default: break
            }
            call.resolve()
        }
    }
}

/// Settings › Privacy & Data › App Permissions: what the system has recorded for the app's two
/// permissions (`status`), and a way to open the app's page in iOS Settings (`openSettings`). It never
/// asks for a permission itself. See src/native/permissions.ts.
@objc(PermissionsPlugin)
public class PermissionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PermissionsPlugin"
    public let jsName = "SmilePermissions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        let camera: String
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: camera = "allowed"
        case .denied: camera = "denied"
        case .restricted: camera = "restricted"
        default: camera = "notAsked"
        }
        let photos: String
        switch PHPhotoLibrary.authorizationStatus(for: .addOnly) {
        case .authorized, .limited: photos = "allowed"
        case .denied: photos = "denied"
        case .restricted: photos = "restricted"
        default: photos = "notAsked"
        }
        call.resolve(["camera": camera, "photosAdd": photos])
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.resolve(); return }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}

/// SmileCompose surface colours for native views (matches src/app/theme.css).
enum SmileComposeColors {
    /// The page canvas: white in Light, near-black in Dark (--background).
    static let background = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x0D / 255, green: 0x0E / 255, blue: 0x0F / 255, alpha: 1)
            : UIColor.white
    }
    static let text = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0xF2 / 255, green: 0xED / 255, blue: 0xE6 / 255, alpha: 1)
            : UIColor(red: 0x3C / 255, green: 0x3C / 255, blue: 0x3C / 255, alpha: 1)
    }
}
