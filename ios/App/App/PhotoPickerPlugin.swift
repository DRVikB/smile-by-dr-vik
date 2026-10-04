import Foundation
import AVFoundation
import CoreMotion
import Vision
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

/// Live alignment checks for the capture guide, computed from on-device face
/// landmarks (Vision) and the device's gravity vector (Core Motion). Pure
/// rules, so the camera only draws what they decide. Nothing leaves the device.
struct CaptureGuidance {
    struct Face {
        /// All in the photo frame's normalised coordinates, origin top-left.
        var centreX: CGFloat
        var mouth: CGRect
        /// Inner-lip opening height / mouth width.
        var opening: CGFloat
        var rollDegrees: CGFloat
        var yawDegrees: CGFloat
    }
    enum Step: Equatable { case noFace, centre, closer, further, raise, lower, levelDevice, uprightDevice, headStraight, lookAhead, smile, ready }

    /// The device is upright and level: its own tilt from the nearest upright
    /// orientation, and how far it leans towards or away from the patient.
    static func deviceLevel(gravity g: (x: Double, y: Double, z: Double)) -> (sideDegrees: Double, leanDegrees: Double) {
        let angle = atan2(g.x, g.y) * 180 / .pi
        let quarter = (angle / 90).rounded() * 90
        let lean = asin(max(-1, min(1, g.z))) * 180 / .pi
        return (angle - quarter, lean)
    }

    static func step(face: Face?, guide: CGRect, gravity: (x: Double, y: Double, z: Double)?) -> Step {
        guard let f = face else { return .noFace }
        if abs(f.centreX - 0.5) > 0.06 { return .centre }
        let ratio = f.mouth.width / guide.width
        if ratio < 0.6 { return .closer }
        if ratio > 1.05 { return .further }
        if f.mouth.midY < guide.minY { return .lower }
        if f.mouth.midY > guide.maxY { return .raise }
        if let g = gravity {
            let level = deviceLevel(gravity: g)
            if abs(level.sideDegrees) > 3 { return .levelDevice }
            if abs(level.leanDegrees) > 10 { return .uprightDevice }
        }
        if abs(f.rollDegrees) > 5 { return .headStraight }
        if abs(f.yawDegrees) > 12 { return .lookAhead }
        if f.opening < 0.1 { return .smile }
        return .ready
    }

    static func message(_ step: Step) -> String {
        switch step {
        case .noFace: return "Find the face, looking straight at the camera"
        case .centre: return "Centre the face"
        case .closer: return "Move a little closer"
        case .further: return "Move a little further away"
        case .raise: return "Move the camera down a little"
        case .lower: return "Move the camera up a little"
        case .levelDevice: return "Level the device"
        case .uprightDevice: return "Hold the device upright"
        case .headStraight: return "Keep the head straight"
        case .lookAhead: return "Look straight at the camera"
        case .smile: return "Smile and show the teeth"
        case .ready: return "Hold still"
        }
    }
}

/// The SmileCompose camera: a 3:4 live view (4:3 in landscape) showing exactly the photo's frame,
/// the smile guide at the same fractions of that frame as the web capture guide, live alignment
/// guidance (the guide turns gold when the face, device and smile line up), pinch or −/+ zoom
/// across the lenses, and a flip between cameras. It captures a full-quality still
/// (AVCapturePhotoOutput, quality prioritised) rather than a frame of video.
final class SmileCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum Result { case cancelled, failed(String), captured(Data) }

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)

    private let guide: CGRect
    private var front: Bool
    private let completion: (Result) -> Void
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.camera")
    private let analysisQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.camera.analysis")
    private let photoOutput = AVCapturePhotoOutput()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let motion = CMMotionManager()
    private var device: AVCaptureDevice?
    private var rotationCoordinator: AnyObject?
    /// The zoom factor that reads as 1× (the wide lens), and the most we allow.
    private var zoomBase: CGFloat = 1
    private var zoomMax: CGFloat = 5
    private var pinchStart: CGFloat = 1
    private var finished = false
    private var lastAnalysis = Date.distantPast
    private var latestFace: CaptureGuidance.Face?
    private var readySince: Date?
    private var wasReady = false

    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let previewHost = UIView()
    private let guideView = UIView()
    private let midline = UIView()
    private let levelLine = UIView()
    private let hint = UILabel()
    private let hintPill = UIView()
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let shutter = UIButton(type: .custom)
    private let zoomLabel = UILabel()
    private let zoomOut = UIButton(type: .system)
    private let zoomIn = UIButton(type: .system)
    private let zoomBar = UIView()
    private let haptic = UIImpactFeedbackGenerator(style: .light)

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
        previewHost.backgroundColor = UIColor(white: 0.07, alpha: 1)
        previewHost.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        view.addSubview(previewHost)

        for line in [midline, levelLine] {
            line.backgroundColor = UIColor(white: 1, alpha: 0.35)
            line.isUserInteractionEnabled = false
            previewHost.addSubview(line)
        }
        guideView.layer.borderColor = UIColor.white.cgColor
        guideView.layer.borderWidth = 2
        guideView.layer.cornerRadius = 12
        guideView.isUserInteractionEnabled = false
        previewHost.addSubview(guideView)

        hintPill.backgroundColor = UIColor(white: 0, alpha: 0.55)
        hintPill.layer.cornerRadius = 18
        hintPill.isUserInteractionEnabled = false
        view.addSubview(hintPill)
        hint.text = "Line the smile up inside the box"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 15, weight: .semibold)
        hint.textAlignment = .center
        hint.adjustsFontSizeToFitWidth = true
        hint.accessibilityTraits = .updatesFrequently
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

        // iPadOS pauses the camera when it treats the app as multitasking (Stage
        // Manager, Split View): say so instead of showing a silent black preview.
        let centre = NotificationCenter.default
        centre.addObserver(self, selector: #selector(sessionInterrupted(_:)), name: AVCaptureSession.wasInterruptedNotification, object: session)
        centre.addObserver(self, selector: #selector(sessionResumed), name: AVCaptureSession.interruptionEndedNotification, object: session)
        centre.addObserver(self, selector: #selector(sessionFailed), name: AVCaptureSession.runtimeErrorNotification, object: session)

        if motion.isDeviceMotionAvailable {
            motion.deviceMotionUpdateInterval = 1.0 / 15
            motion.startDeviceMotionUpdates()
        }
        haptic.prepare()
        configureSession()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        motion.stopDeviceMotionUpdates()
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
        midline.bounds = CGRect(x: 0, y: 0, width: 1, height: size.height)
        midline.center = CGPoint(x: size.width / 2, y: size.height / 2)
        levelLine.bounds = CGRect(x: 0, y: 0, width: size.width * 0.8, height: 1)
        levelLine.center = CGPoint(x: size.width / 2, y: size.height * 0.42)
        applyRotation()

        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 10, width: 44, height: 44)
        hint.frame = CGRect(x: safe.minX + 80, y: safe.minY + 14, width: safe.width - 160, height: 36)
        let pillWidth = min(hint.intrinsicContentSize.width + 36, safe.width - 150)
        hintPill.frame = CGRect(x: safe.midX - pillWidth / 2, y: safe.minY + 14, width: pillWidth, height: 36)
        zoomBar.frame = CGRect(x: safe.midX - 80, y: safe.maxY - bottom + 18, width: 160, height: 40)
        zoomOut.frame = CGRect(x: 0, y: 0, width: 48, height: 40)
        zoomIn.frame = CGRect(x: 112, y: 0, width: 48, height: 40)
        zoomLabel.frame = CGRect(x: 48, y: 0, width: 64, height: 40)
        shutter.frame = CGRect(x: safe.midX - 32, y: safe.maxY - 92, width: 64, height: 64)
        view.viewWithTag(42)?.frame = shutter.frame.insetBy(dx: -7, dy: -7)
        view.viewWithTag(42)?.layer.cornerRadius = (shutter.frame.width + 14) / 2
        flipButton.frame = CGRect(x: safe.maxX - 76, y: safe.maxY - 82, width: 44, height: 44)
    }

    // MARK: Orientation

    private func currentOrientation() -> AVCaptureVideoOrientation {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    /// Preview and analysis frames upright for the current orientation (rotation
    /// angles on iOS 17+, where the older orientation property is deprecated).
    private func applyRotation() {
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            let previewAngle = coordinator.videoRotationAngleForHorizonLevelPreview
            let captureAngle = coordinator.videoRotationAngleForHorizonLevelCapture
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(previewAngle) { c.videoRotationAngle = previewAngle }
            sessionQueue.async {
                if let c = self.videoOutput.connection(with: .video), c.isVideoRotationAngleSupported(captureAngle) { c.videoRotationAngle = captureAngle }
            }
        } else {
            let orientation = currentOrientation()
            if let c = previewLayer.connection, c.isVideoOrientationSupported { c.videoOrientation = orientation }
            sessionQueue.async {
                if let c = self.videoOutput.connection(with: .video), c.isVideoOrientationSupported { c.videoOrientation = orientation }
            }
        }
    }

    // MARK: Session

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
            if #available(iOS 16.0, *), self.session.isMultitaskingCameraAccessSupported {
                self.session.isMultitaskingCameraAccessEnabled = true
            }
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
            if !self.session.outputs.contains(self.videoOutput), self.session.canAddOutput(self.videoOutput) {
                self.videoOutput.alwaysDiscardsLateVideoFrames = true
                self.videoOutput.setSampleBufferDelegate(self, queue: self.analysisQueue)
                self.session.addOutput(self.videoOutput)
            }
            // Analysis frames mirror the front preview, so landmarks map onto what is shown.
            if let c = self.videoOutput.connection(with: .video), c.isVideoMirroringSupported {
                c.automaticallyAdjustsVideoMirroring = false
                c.isVideoMirrored = front
            }
            self.photoOutput.maxPhotoQualityPrioritization = .quality
            self.session.commitConfiguration()

            // With an ultra-wide lens, 1× (the wide lens) is the first switch-over point.
            let constituents = device.constituentDevices.map(\.deviceType)
            let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
            let hasUltraWide = constituents.contains(.builtInUltraWideCamera)
            let base = hasUltraWide ? (switchOvers.first ?? 1) : 1
            // Opening zoom: the telephoto lens where the phone has one; 1.5× on the selfie camera.
            let telephoto = constituents.contains(.builtInTelephotoCamera) ? switchOvers.last : nil
            let start = front ? base * 1.5 : (telephoto ?? base)
            self.device = device
            self.zoomBase = base
            self.zoomMax = min(device.maxAvailableVideoZoomFactor, max(base * 5, start))
            self.setZoom(start)
            DispatchQueue.main.async {
                if #available(iOS 17.0, *) {
                    self.rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: self.previewLayer)
                }
                self.applyRotation()
            }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    @objc private func sessionInterrupted(_ note: Notification) {
        var message = "The camera is paused. Return to SmileCompose full screen to continue."
        if let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int,
           let reason = AVCaptureSession.InterruptionReason(rawValue: raw) {
            switch reason {
            case .videoDeviceNotAvailableWithMultipleForegroundApps:
                message = "The camera pauses while other apps share the screen. Show SmileCompose full screen."
            case .videoDeviceInUseByAnotherClient:
                message = "Another app is using the camera. Close it to continue."
            default: break
            }
        }
        DispatchQueue.main.async { self.setHint(message, ready: false) }
    }

    @objc private func sessionResumed() {
        DispatchQueue.main.async { self.setHint("Line the smile up inside the box", ready: false) }
    }

    @objc private func sessionFailed() {
        sessionQueue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    // MARK: Guidance

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // About eight checks a second is enough to guide, and light on the battery.
        let now = Date()
        guard now.timeIntervalSince(lastAnalysis) > 0.12, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastAnalysis = now
        let request = VNDetectFaceLandmarksRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up)
        try? handler.perform([request])
        let face = (request.results ?? []).max { $0.boundingBox.width < $1.boundingBox.width }.flatMap(Self.describe)
        DispatchQueue.main.async { self.latestFace = face; self.updateGuidance() }
    }

    /// Vision coordinates (normalised, origin bottom-left) to the photo frame's, origin top-left.
    private static func describe(_ observation: VNFaceObservation) -> CaptureGuidance.Face? {
        guard let landmarks = observation.landmarks, let outer = landmarks.outerLips, let inner = landmarks.innerLips else { return nil }
        let box = observation.boundingBox
        func points(_ region: VNFaceLandmarkRegion2D) -> [CGPoint] {
            region.normalizedPoints.map { CGPoint(x: box.minX + $0.x * box.width, y: 1 - (box.minY + $0.y * box.height)) }
        }
        let lips = points(outer), opening = points(inner)
        guard let minX = lips.map(\.x).min(), let maxX = lips.map(\.x).max(), let minY = lips.map(\.y).min(), let maxY = lips.map(\.y).max(),
              let innerTop = opening.map(\.y).min(), let innerBottom = opening.map(\.y).max(), maxX > minX else { return nil }
        let degrees: (NSNumber?) -> CGFloat = { CGFloat(($0?.doubleValue ?? 0) * 180 / .pi) }
        return CaptureGuidance.Face(
            centreX: box.midX,
            mouth: CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY),
            opening: (innerBottom - innerTop) / (maxX - minX),
            rollDegrees: degrees(observation.roll),
            yawDegrees: degrees(observation.yaw))
    }

    private func updateGuidance() {
        let gravity = motion.deviceMotion.map { ($0.gravity.x, $0.gravity.y, $0.gravity.z) }
        let step = CaptureGuidance.step(face: latestFace, guide: guide, gravity: gravity)
        let ready = step == .ready
        readySince = ready ? (readySince ?? Date()) : nil
        let steady = ready && Date().timeIntervalSince(readySince!) > 0.6
        setHint(steady ? "Lined up — take the photo" : CaptureGuidance.message(step), ready: ready)
        if steady && !wasReady { haptic.impactOccurred() }
        wasReady = steady

        let centred = latestFace.map { abs($0.centreX - 0.5) <= 0.06 } ?? false
        midline.backgroundColor = centred ? Self.gold : UIColor(white: 1, alpha: 0.35)
        if let g = gravity {
            let level = CaptureGuidance.deviceLevel(gravity: g)
            levelLine.transform = CGAffineTransform(rotationAngle: CGFloat(-level.sideDegrees * .pi / 180))
            levelLine.backgroundColor = abs(level.sideDegrees) <= 3 ? Self.gold : UIColor(white: 1, alpha: 0.35)
        }
    }

    private func setHint(_ text: String, ready: Bool) {
        hint.text = text
        hint.textColor = ready ? .black : .white
        hintPill.backgroundColor = ready ? Self.gold : UIColor(white: 0, alpha: 0.55)
        guideView.layer.borderColor = (ready ? Self.gold : UIColor.white).cgColor
        guideView.layer.borderWidth = ready ? 3 : 2
        view.viewWithTag(42)?.layer.borderColor = (ready ? Self.gold : UIColor.white).cgColor
        view.setNeedsLayout()
    }

    // MARK: Zoom, flip, capture

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
        latestFace = nil
        configureSession()
    }

    @objc private func cancel() { finish(.cancelled) }

    @objc private func capture() {
        shutter.isEnabled = false
        let orientation = currentOrientation()
        var captureAngle: CGFloat?
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            captureAngle = coordinator.videoRotationAngleForHorizonLevelCapture
        }
        let mirrored = front
        sessionQueue.async {
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .quality
            if let connection = self.photoOutput.connection(with: .video) {
                if #available(iOS 17.0, *), let angle = captureAngle {
                    if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
                } else if connection.isVideoOrientationSupported {
                    connection.videoOrientation = orientation
                }
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
                self.setHint("That photo didn’t work. Please try again.", ready: false)
            }
            return
        }
        DispatchQueue.main.async { self.finish(.captured(data)) }
    }

    private func finish(_ result: Result) {
        guard !finished else { return }
        finished = true
        motion.stopDeviceMotionUpdates()
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
        dismiss(animated: true) { self.completion(result) }
    }
}
