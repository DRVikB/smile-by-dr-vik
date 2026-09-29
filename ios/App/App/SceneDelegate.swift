import UIKit
import Capacitor
import WidgetKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = SmileComposeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Launched from a Home Screen quick action or a widget: held until the app is listening.
        if let item = connectionOptions.shortcutItem { ShortcutsPlugin.shared.receive(item) }
        for context in connectionOptions.urlContexts { ShortcutsPlugin.shared.receive(context.url) }
    }

    /// Home Screen quick action while the app is already running.
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(ShortcutsPlugin.shared.receive(shortcutItem))
    }

    // Cover the screen while the app is inactive so the App Switcher snapshot
    // never shows a patient photograph.
    private var privacyCover: UIView?

    func sceneWillResignActive(_ scene: UIScene) {
        guard privacyCover == nil, let window else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = SmileComposeColors.background
        let label = UILabel()
        label.text = "SmileCompose"
        label.font = UIFont(name: "Georgia", size: 26) ?? .systemFont(ofSize: 26)
        label.textColor = SmileComposeColors.text
        label.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: cover.centerYAnchor)
        ])
        cover.accessibilityElementsHidden = true
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Widget taps are app shortcuts; every other link (sign-in callbacks) goes to Capacitor.
        let others = URLContexts.filter { !ShortcutsPlugin.shared.receive($0.url) }
        if !others.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: others) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


/// Home Screen quick actions (long press on the app icon, declared in Info.plist as
/// UIApplicationShortcutItems) and widget taps. Each is passed to the web app as a "shortcut"
/// event; one that launched the app is retained until the app adds its listener. Also shares
/// the clinician's preferred name with the widget.
@objc(ShortcutsPlugin)
public class ShortcutsPlugin: CAPPlugin, CAPBridgedPlugin {
    static let shared = ShortcutsPlugin()
    public let identifier = "ShortcutsPlugin"
    public let jsName = "SmileShortcuts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setWidgetName", returnType: CAPPluginReturnPromise)
    ]

    private static let prefix = "uk.co.drvik.smilecompose.shortcut."
    private static let actions: Set<String> = ["new", "cases", "sample"]
    static let appGroup = "group.uk.co.drvik.smilecompose"

    /// A widget link: uk.co.drvik.smilecompose://shortcut/<action>.
    @discardableResult
    func receive(_ url: URL) -> Bool {
        guard url.scheme == "uk.co.drvik.smilecompose", url.host == "shortcut" else { return false }
        let action = url.lastPathComponent
        guard Self.actions.contains(action) else { return false }
        notifyListeners("shortcut", data: ["type": action], retainUntilConsumed: true)
        return true
    }

    /// The clinician's preferred name for the widget greeting ("Welcome, Dr Vik."), or nil to clear it.
    /// Stored in the App Group shared with the widget; without that capability it is simply not shared.
    @objc func setWidgetName(_ call: CAPPluginCall) {
        let name = call.getString("name")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let defaults = UserDefaults(suiteName: Self.appGroup)
        if let name, !name.isEmpty { defaults?.set(String(name.prefix(40)), forKey: "widget.displayName") } else { defaults?.removeObject(forKey: "widget.displayName") }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @discardableResult
    func receive(_ item: UIApplicationShortcutItem) -> Bool {
        guard item.type.hasPrefix(Self.prefix) else { return false }
        let action = String(item.type.dropFirst(Self.prefix.count))
        notifyListeners("shortcut", data: ["type": action], retainUntilConsumed: true)
        return true
    }
}
