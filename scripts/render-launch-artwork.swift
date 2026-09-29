// Renders the iOS launch-screen artwork into ios/App/App/Launch/:
//   LaunchSymbol@2x/@3x.png     the Home Screen app icon itself (96 pt), so the logo is the same everywhere
//   public/brand/smilecompose-launch-icon.png  the same, for the web launch view (BrandLaunch)
//   LaunchSignature@2x/@3x.png  the Dr Vik logo (66 × 27 pt)
// Bundled PNGs rather than asset-catalog images: the launch-screen renderer
// did not draw asset-catalog images on the iOS 27 simulator, while bundled
// files render reliably. Loose files have no Dark variant: the app icon brings its own
// ground, so it reads on both the Ivory and charcoal backgrounds; the Dr Vik logo uses
// the brand bronze, which reads on both;
// the wordmark and "Designed By" are labels in named colours that follow
// Light and Dark (LaunchText, LaunchSubtle).
// Run from the repository root: swift scripts/render-launch-artwork.swift
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let out = root.appendingPathComponent("ios/App/App/Launch")
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
guard let logo = NSImage(contentsOf: root.appendingPathComponent("public/dr-vik-logo.png")) else { fatalError("public/dr-vik-logo.png not found") }

// Bronze: 3.9:1 on Ivory (#FAF9F6) and 4.9:1 on the dark launch background (#141312).
let bronze = NSColor(srgbRed: 140 / 255, green: 122 / 255, blue: 104 / 255, alpha: 1)

func png(width: CGFloat, height: CGFloat, scale: CGFloat, draw: (CGContext) -> Void) -> Data {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(width * scale), pixelsHigh: Int(height * scale), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: width, height: height)
  NSGraphicsContext.saveGraphicsState()
  let context = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  let cg = context.cgContext
  cg.translateBy(x: 0, y: height) // top-left origin, like the SVG
  cg.scaleBy(x: 1, y: -1)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)
  draw(cg)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

/// The Home Screen app icon (AppIcon-1024.png), rounded as iOS shows it, with a hairline edge so it
/// holds its shape on the Ivory background.
guard let appIcon = NSImage(contentsOf: root.appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")) else { fatalError("AppIcon-1024.png not found") }
func symbol(_ cg: CGContext, size: CGFloat) {
  let rect = NSRect(x: 0, y: 0, width: size, height: size)
  let tile = NSBezierPath(roundedRect: rect, xRadius: size * 0.2237, yRadius: size * 0.2237)
  NSGraphicsContext.saveGraphicsState()
  tile.addClip()
  appIcon.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  NSGraphicsContext.restoreGraphicsState()
  let edge = NSBezierPath(roundedRect: rect.insetBy(dx: 0.25, dy: 0.25), xRadius: size * 0.2237 - 0.25, yRadius: size * 0.2237 - 0.25)
  edge.lineWidth = 0.5
  NSColor(srgbRed: 60 / 255, green: 48 / 255, blue: 36 / 255, alpha: 0.14).setStroke(); edge.stroke()
}

func tinted(_ image: NSImage, _ color: NSColor) -> NSImage {
  let result = NSImage(size: image.size)
  result.lockFocus()
  image.draw(in: NSRect(origin: .zero, size: image.size))
  color.set()
  NSRect(origin: .zero, size: image.size).fill(using: .sourceIn)
  result.unlockFocus()
  return result
}

let symbolSize: CGFloat = 96
let logoHeight: CGFloat = 27
let logoWidth = (logoHeight * logo.size.width / logo.size.height).rounded()
let bronzeLogo = tinted(logo, bronze)

for scale in [2, 3] as [CGFloat] {
  try! png(width: symbolSize, height: symbolSize, scale: scale) { symbol($0, size: symbolSize) }
    .write(to: out.appendingPathComponent("LaunchSymbol@\(Int(scale))x.png"))
  try! png(width: logoWidth, height: logoHeight, scale: scale) { _ in
    bronzeLogo.draw(in: NSRect(x: 0, y: 0, width: logoWidth, height: logoHeight), from: .zero, operation: .sourceOver, fraction: 1,
                    respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  }.write(to: out.appendingPathComponent("LaunchSignature@\(Int(scale))x.png"))
}
try! png(width: symbolSize, height: symbolSize, scale: 3) { symbol($0, size: symbolSize) }
  .write(to: root.appendingPathComponent("public/brand/smilecompose-launch-icon.png"))
print("LaunchSymbol \(Int(symbolSize)) pt, LaunchSignature \(Int(logoWidth))×\(Int(logoHeight)) pt")
