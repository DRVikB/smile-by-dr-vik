import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        excludePatientDataFromBackup()
        protectPatientData()
        return true
    }

    /// Apple file Data Protection, not application-level encryption. The default
    /// entitlement covers new files; migrate existing WebKit data explicitly.
    /// WebKit may choose attributes for its own files: verify on a locked device.
    private func protectPatientData() {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        let roots = [library.appendingPathComponent("WebKit", isDirectory: true),
                     library.appendingPathComponent("Application Support/WebKit", isDirectory: true),
                     library.appendingPathComponent("Caches/exports", isDirectory: true),
                     library.appendingPathComponent("Caches/" + (Bundle.main.bundleIdentifier ?? "uk.co.drvik.smilecompose") + "/WebKit", isDirectory: true)]
        for root in roots {
            do {
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: root.path)
                var directory = root
                var values = URLResourceValues(); values.isExcludedFromBackup = true
                try directory.setResourceValues(values)
            } catch { NSLog("SmileCompose: patient storage protection needs verification") }
        }
        DispatchQueue.global(qos: .utility).async {
            for root in roots {
                guard let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [.skipsPackageDescendants]) else { continue }
                for case let url as URL in files {
                    if (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { files.skipDescendants(); continue }
                    do { try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path) }
                    catch { NSLog("SmileCompose: an existing WebKit file could not be reprotected") }
                }
            }
        }
    }

    func applicationProtectedDataDidBecomeAvailable(_ application: UIApplication) {
        protectPatientData()
    }

    /// Cases, patient photos and results live in the WebView's storage under
    /// Library/WebKit. Exclude the local cache from iCloud/computer backups.
    /// Account cloud sync is a separate, authenticated application path;
    /// deleting the app removes its local cache, not the remote account cases.
    private func excludePatientDataFromBackup() {
        guard var directory = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?
            .appendingPathComponent("WebKit", isDirectory: true) else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
        } catch {
            NSLog("SmileCompose: could not exclude local case data from backup")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
