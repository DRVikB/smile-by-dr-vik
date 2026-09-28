import UIKit
import Capacitor

/// Appearance bridge for the web app.
///
/// - `set(style)`: applies Settings › Appearance (System / Light / Dark) to the
///   window, so the status bar and native UI (share sheet, photo picker,
///   Sign in with Apple, alerts) match the app's theme.
/// - `accessibility()`: Reduce Transparency / Increase Contrast / Reduce Motion,
///   with `accessibilityChange` events when they change.
@objc(AppearancePlugin)
public class AppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppearancePlugin"
    public let jsName = "SmileAppearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "accessibility", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        let names: [Notification.Name] = [
            UIAccessibility.reduceTransparencyStatusDidChangeNotification,
            UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
            UIAccessibility.reduceMotionStatusDidChangeNotification
        ]
        for name in names {
            NotificationCenter.default.addObserver(self, selector: #selector(accessibilityChanged), name: name, object: nil)
        }
    }

    private func state() -> [String: Bool] {
        [
            "reduceTransparency": UIAccessibility.isReduceTransparencyEnabled,
            "increaseContrast": UIAccessibility.isDarkerSystemColorsEnabled,
            "reduceMotion": UIAccessibility.isReduceMotionEnabled
        ]
    }

    @objc private func accessibilityChanged() {
        notifyListeners("accessibilityChange", data: state())
    }

    @objc func accessibility(_ call: CAPPluginCall) {
        call.resolve(state())
    }

    @objc func set(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle
        switch call.getString("style") {
        case "light": style = .light
        case "dark": style = .dark
        default: style = .unspecified
        }
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }
}
