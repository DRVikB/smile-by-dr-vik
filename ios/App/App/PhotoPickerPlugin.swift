import Foundation
import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// "Choose from Photos" using Apple's system photo picker (PHPicker).
///
/// The picker runs outside the app and returns only the photo the clinician
/// selects, so SmileCompose never asks for Photo Library access. HEIC photos
/// are delivered as JPEG. The copy handed to the web layer lives in the app's
/// temporary folder and is deleted by `releasePhoto` once it has been read.
@objc(PhotoPickerPlugin)
public class PhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "PhotoPickerPlugin"
    public let jsName = "SmilePhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releasePhoto", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private let folder = FileManager.default.temporaryDirectory.appendingPathComponent("picked-photos", isDirectory: true)

    @objc func pickPhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil, let presenter = self.bridge?.viewController else {
                call.reject("The photo picker is already open.")
                return
            }
            // No PHPhotoLibrary argument: the picker returns no asset identifiers
            // and requires no permission.
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            configuration.preferredAssetRepresentationMode = .compatible
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingCall = call
            presenter.present(picker, animated: true)
        }
    }

    @objc func releasePhoto(_ call: CAPPluginCall) {
        if let path = call.getString("path"), let url = URL(string: path), url.path.hasPrefix(folder.path) {
            try? FileManager.default.removeItem(at: url)
        }
        call.resolve()
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let provider = results.first?.itemProvider else {
            call.resolve(["cancelled": true])
            return
        }
        let type: UTType = provider.hasItemConformingToTypeIdentifier(UTType.png.identifier) ? .png : .jpeg
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
            guard let url = url, error == nil else {
                call.reject("The photo couldn’t be opened.")
                return
            }
            // The provided file is deleted when this handler returns, so keep a private copy.
            let destination = self.folder
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(type == .png ? "png" : "jpg")
            do {
                try FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: url, to: destination)
            } catch {
                call.reject("The photo couldn’t be opened.")
                return
            }
            call.resolve([
                "cancelled": false,
                "path": destination.absoluteString,
                "webPath": self.bridge?.portablePath(fromLocalURL: destination)?.absoluteString ?? "",
                "mimeType": type == .png ? "image/png" : "image/jpeg"
            ])
        }
    }
}
