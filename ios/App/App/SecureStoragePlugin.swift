import Foundation
import Capacitor
import Security

/// Keychain storage for the sign-in session (Supabase access and refresh tokens).
///
/// Items are readable only on this device after it has been unlocked once
/// since restart (`AfterFirstUnlockThisDeviceOnly`): they are never synced to
/// iCloud Keychain or restored from a backup onto another device. Keychain
/// items outlive an app deletion, so a fresh install starts signed out.
@objc(SecureStoragePlugin)
public class SecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStoragePlugin"
    public let jsName = "SmileSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "uk.co.drvik.smilecompose.session"
    private let installMarker = "smilecompose.secureStorage.installed"

    override public func load() {
        // UserDefaults is removed with the app; the Keychain is not.
        guard !UserDefaults.standard.bool(forKey: installMarker) else { return }
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
        UserDefaults.standard.set(true, forKey: installMarker)
    }

    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    private func validKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 128 else {
            call.reject("A storage key is required.")
            return nil
        }
        return key
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
        } else {
            call.reject("Secure storage is unavailable.", String(status))
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        guard let value = call.getString("value") else {
            call.reject("A value is required.")
            return
        }
        let data = Data(value.utf8)
        let attributes: [String: Any] = [kSecValueData as String: data,
                                         kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query(key).merging(attributes) { $1 } as CFDictionary, nil)
        }
        status == errSecSuccess ? call.resolve() : call.reject("Secure storage is unavailable.", String(status))
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        let status = SecItemDelete(query(key) as CFDictionary)
        status == errSecSuccess || status == errSecItemNotFound ? call.resolve() : call.reject("Secure storage is unavailable.", String(status))
    }
}
