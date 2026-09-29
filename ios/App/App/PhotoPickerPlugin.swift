import Foundation
import AVFoundation
import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// "Choose from Photos" using Apple's system photo picker (PHPicker), and
/// "Take Photo" using the iPhone camera itself (SmileCameraViewController below).
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
        CAPPluginMethod(name: "takePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releasePhoto", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var cameraOpen = false
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

    /// A full-resolution photograph from the camera, with Apple's photo processing and colour,
    /// framed with the same smile guide the app uses. Nothing is saved to the Photo Library.
    @objc func takePhoto(_ call: CAPPluginCall) {
        let g = call.getObject("guide") ?? [:]
        let guide = CGRect(x: g["x"] as? Double ?? 0.3, y: g["y"] as? Double ?? 0.54,
                           width: g["width"] as? Double ?? 0.4, height: g["height"] as? Double ?? 0.15)
        let front = call.getString("camera") == "front"
        DispatchQueue.main.async {
            guard !self.cameraOpen, self.pendingCall == nil, let presenter = self.bridge?.viewController else {
                call.reject("The camera is already open.")
                return
            }
            self.cameraOpen = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else {
                        self.cameraOpen = false
                        call.reject("Camera access is turned off. Turn it on in Settings › SmileCompose › Camera.", "camera_denied")
                        return
                    }
                    // Strong capture, like the enclosing closures: the plugin lives as long as the bridge, the
                    // camera holds this only until it finishes, and the call must always be answered.
                    let camera = SmileCameraViewController(guide: guide, front: front) { result in
                        self.cameraOpen = false
                        switch result {
                        case .cancelled:
                            call.resolve(["cancelled": true])
                        case .failed(let message):
                            call.reject(message)
                        case .captured(let data):
                            do { call.resolve(try self.store(data, png: false)) } catch { call.reject("The photo couldn’t be saved.") }
                        }
                    }
                    camera.modalPresentationStyle = .fullScreen
                    presenter.present(camera, animated: true)
                }
            }
        }
    }

    /// A private copy in the temporary folder, handed to the web layer and deleted by `releasePhoto`.
    private func store(_ data: Data, png: Bool) throws -> [String: Any] {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent(UUID().uuidString).appendingPathExtension(png ? "png" : "jpg")
        try data.write(to: destination, options: .completeFileProtection)
        return [
            "cancelled": false,
            "path": destination.absoluteString,
            "webPath": bridge?.portablePath(fromLocalURL: destination)?.absoluteString ?? "",
            "mimeType": png ? "image/png" : "image/jpeg"
        ]
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


// MARK: - Camera

/// The SmileCompose camera: a 3:4 live view (4:3 in landscape) showing exactly the photo's frame,
/// the smile guide at the same fractions of that frame as the web capture guide, pinch or −/+ zoom
/// across the lenses, and a flip between cameras. It captures a full-quality still
/// (AVCapturePhotoOutput, quality prioritised) rather than a frame of video.
final class SmileCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate {
    enum Result { case cancelled, failed(String), captured(Data) }

    private let guide: CGRect
    private var front: Bool
    private let completion: (Result) -> Void
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.camera")
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    /// The zoom factor that reads as 1× (the wide lens), and the most we allow.
    private var zoomBase: CGFloat = 1
    private var zoomMax: CGFloat = 5
    private var pinchStart: CGFloat = 1
    private var finished = false

    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let previewHost = UIView()
    private let guideView = UIView()
    private let hint = UILabel()
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let shutter = UIButton(type: .custom)
    private let zoomLabel = UILabel()
    private let zoomOut = UIButton(type: .system)
    private let zoomIn = UIButton(type: .system)
    private let zoomBar = UIView()

    init(guide: CGRect, front: Bool, completion: @escaping (Result) -> Void) {
        self.guide = guide
        self.front = front
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        previewHost.layer.addSublayer(previewLayer)
        previewHost.clipsToBounds = true
        previewHost.layer.cornerRadius = 18
        previewHost.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        view.addSubview(previewHost)

        guideView.layer.borderColor = UIColor.white.cgColor
        guideView.layer.borderWidth = 2
        guideView.layer.cornerRadius = 12
        guideView.isUserInteractionEnabled = false
        previewHost.addSubview(guideView)

        hint.text = "Line the smile up inside the box"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 15, weight: .medium)
        hint.textAlignment = .center
        hint.adjustsFontSizeToFitWidth = true
        view.addSubview(hint)

        let symbols = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbols), for: .normal)
        closeButton.accessibilityLabel = "Cancel"
        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera", withConfiguration: symbols), for: .normal)
        flipButton.accessibilityLabel = "Switch camera"
        for button in [closeButton, flipButton] {
            button.tintColor = .white
            button.backgroundColor = UIColor(white: 1, alpha: 0.14)
            button.layer.cornerRadius = 22
            view.addSubview(button)
        }
        closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        flipButton.addTarget(self, action: #selector(flip), for: .touchUpInside)

        shutter.backgroundColor = .white
        shutter.layer.cornerRadius = 32
        shutter.layer.borderColor = UIColor(white: 1, alpha: 0.45).cgColor
        shutter.layer.borderWidth = 0
        shutter.accessibilityLabel = "Take photo"
        shutter.addTarget(self, action: #selector(capture), for: .touchUpInside)
        view.addSubview(shutter)
        let ring = UIView()
        ring.isUserInteractionEnabled = false
        ring.layer.borderColor = UIColor.white.cgColor
        ring.layer.borderWidth = 3
        ring.tag = 42
        view.addSubview(ring)

        zoomBar.backgroundColor = UIColor(white: 1, alpha: 0.14)
        zoomBar.layer.cornerRadius = 20
        view.addSubview(zoomBar)
        zoomOut.setImage(UIImage(systemName: "minus", withConfiguration: symbols), for: .normal)
        zoomIn.setImage(UIImage(systemName: "plus", withConfiguration: symbols), for: .normal)
        zoomOut.accessibilityLabel = "Zoom out"
        zoomIn.accessibilityLabel = "Zoom in"
        for button in [zoomOut, zoomIn] { button.tintColor = .white; zoomBar.addSubview(button) }
        zoomOut.addTarget(self, action: #selector(stepZoomOut), for: .touchUpInside)
        zoomIn.addTarget(self, action: #selector(stepZoomIn), for: .touchUpInside)
        zoomLabel.textColor = .white
        zoomLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
        zoomLabel.textAlignment = .center
        zoomBar.addSubview(zoomLabel)

        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let portrait = view.bounds.height >= view.bounds.width
        let top: CGFloat = 64, bottom: CGFloat = 170
        let area = CGRect(x: safe.minX + 12, y: safe.minY + top, width: safe.width - 24, height: safe.height - top - bottom)
        // The live view has the photo's own shape, so it shows the whole photo and the guide maps exactly.
        let aspect: CGFloat = portrait ? 3.0 / 4.0 : 4.0 / 3.0
        var size = CGSize(width: area.width, height: area.width / aspect)
        if size.height > area.height { size = CGSize(width: area.height * aspect, height: area.height) }
        previewHost.frame = CGRect(x: area.midX - size.width / 2, y: area.midY - size.height / 2, width: size.width, height: size.height)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.frame = previewHost.bounds
        CATransaction.commit()
        guideView.frame = CGRect(x: guide.minX * size.width, y: guide.minY * size.height, width: guide.width * size.width, height: guide.height * size.height)
        if let connection = previewLayer.connection, connection.isVideoOrientationSupported { connection.videoOrientation = currentOrientation() }

        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 10, width: 44, height: 44)
        hint.frame = CGRect(x: safe.minX + 70, y: safe.minY + 10, width: safe.width - 140, height: 44)
        zoomBar.frame = CGRect(x: safe.midX - 80, y: safe.maxY - bottom + 18, width: 160, height: 40)
        zoomOut.frame = CGRect(x: 0, y: 0, width: 48, height: 40)
        zoomIn.frame = CGRect(x: 112, y: 0, width: 48, height: 40)
        zoomLabel.frame = CGRect(x: 48, y: 0, width: 64, height: 40)
        shutter.frame = CGRect(x: safe.midX - 32, y: safe.maxY - 92, width: 64, height: 64)
        view.viewWithTag(42)?.frame = shutter.frame.insetBy(dx: -7, dy: -7)
        view.viewWithTag(42)?.layer.cornerRadius = (shutter.frame.width + 14) / 2
        flipButton.frame = CGRect(x: safe.maxX - 76, y: safe.maxY - 82, width: 44, height: 44)
    }

    private func currentOrientation() -> AVCaptureVideoOrientation {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    private static func camera(front: Bool) -> AVCaptureDevice? {
        if front { return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) }
        // A multi-lens virtual camera switches lenses as you zoom, like the Camera app.
        for type in [AVCaptureDevice.DeviceType.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera] {
            if let device = AVCaptureDevice.default(type, for: .video, position: .back) { return device }
        }
        return nil
    }

    private func configureSession() {
        let front = self.front
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            self.session.inputs.forEach { self.session.removeInput($0) }
            guard let device = Self.camera(front: front), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.finish(.failed("The camera couldn’t be started.")) }
                return
            }
            self.session.addInput(input)
            if !self.session.outputs.contains(self.photoOutput), self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
            }
            self.photoOutput.maxPhotoQualityPrioritization = .quality
            self.session.commitConfiguration()

            // With an ultra-wide lens, 1× (the wide lens) is the first switch-over point.
            let hasUltraWide = device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
            let base = hasUltraWide ? CGFloat(device.virtualDeviceSwitchOverVideoZoomFactors.first?.doubleValue ?? 1) : 1
            self.device = device
            self.zoomBase = base
            self.zoomMax = min(device.maxAvailableVideoZoomFactor, base * 5)
            self.setZoom(base)
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    private func setZoom(_ factor: CGFloat) {
        guard let device = device else { return }
        let clamped = min(max(factor, zoomBase), zoomMax)
        if (try? device.lockForConfiguration()) != nil {
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
        }
        let shown = clamped / zoomBase
        DispatchQueue.main.async {
            self.zoomLabel.text = String(format: "%.1f×", shown)
            self.zoomOut.isEnabled = clamped > self.zoomBase + 0.01
            self.zoomIn.isEnabled = clamped < self.zoomMax - 0.01
        }
    }

    private var currentZoom: CGFloat { device?.videoZoomFactor ?? zoomBase }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        if gesture.state == .began { pinchStart = currentZoom }
        let target = pinchStart * gesture.scale
        sessionQueue.async { self.setZoom(target) }
    }

    @objc private func stepZoomIn() { let z = currentZoom; sessionQueue.async { self.setZoom(z + self.zoomBase * 0.5) } }
    @objc private func stepZoomOut() { let z = currentZoom; sessionQueue.async { self.setZoom(z - self.zoomBase * 0.5) } }

    @objc private func flip() {
        front.toggle()
        configureSession()
    }

    @objc private func cancel() { finish(.cancelled) }

    @objc private func capture() {
        shutter.isEnabled = false
        let orientation = currentOrientation()
        let mirrored = front
        sessionQueue.async {
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .quality
            if let connection = self.photoOutput.connection(with: .video) {
                if connection.isVideoOrientationSupported { connection.videoOrientation = orientation }
                // The front camera's photo matches its mirrored live view, as the web capture does.
                if connection.isVideoMirroringSupported {
                    connection.automaticallyAdjustsVideoMirroring = false
                    connection.isVideoMirrored = mirrored
                }
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
        UIView.animate(withDuration: 0.08, animations: { self.previewHost.alpha = 0.2 }) { _ in
            UIView.animate(withDuration: 0.2) { self.previewHost.alpha = 1 }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else {
            DispatchQueue.main.async {
                self.shutter.isEnabled = true
                self.hint.text = "That photo didn’t work. Please try again."
            }
            return
        }
        DispatchQueue.main.async { self.finish(.captured(data)) }
    }

    private func finish(_ result: Result) {
        guard !finished else { return }
        finished = true
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
        dismiss(animated: true) { self.completion(result) }
    }
}
