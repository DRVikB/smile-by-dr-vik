// Renders the Dark and Tinted App Icon appearances for iOS 18+ (and iOS 26/27's
// Home Screen modes) from the SmileCompose symbol: the smile arc and its two
// reference lines, drawn on the same geometry as the Light icon
// (AppIcon-1024.png), so the three read as one mark.
//
//   swift scripts/render-app-icons.swift
//
// Dark:   warm charcoal ground, champagne-gold arc, quiet reference lines.
// Tinted: greyscale on black. iOS recolours it from luminance with the
//         user's chosen tint, so the arc is near-white and the lines mid-grey.
import AppKit
import CoreGraphics

let size = 1024
let outDir = "ios/App/App/Assets.xcassets/AppIcon.appiconset"

func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

/// The symbol's arc (M28 43 C37 68 63 68 72 43 in its 100-unit artwork), placed as on the Light icon.
func arcPath() -> CGPath {
  let s: CGFloat = 13.5, dx: CGFloat = -163, dy: CGFloat = -190.5
  let p = { (x: CGFloat, y: CGFloat) in CGPoint(x: x * s + dx, y: y * s + dy) }
  let path = CGMutablePath()
  path.move(to: p(28, 43))
  path.addCurve(to: p(72, 43), control1: p(37, 68), control2: p(63, 68))
  return path
}

struct Palette {
  let groundTop: UInt32, groundBottom: UInt32
  let arcStart: UInt32, arcEnd: UInt32
  let lines: UInt32, linesAlpha: CGFloat
  let shadow: CGFloat
}

func render(_ file: String, _ palette: Palette) {
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  // Opaque: App Store icons may not contain transparency.
  guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("context") }
  ctx.translateBy(x: 0, y: CGFloat(size))
  ctx.scaleBy(x: 1, y: -1) // top-left origin, like the artwork

  let full = CGRect(x: 0, y: 0, width: size, height: size)
  let ground = CGGradient(colorsSpace: space, colors: [color(palette.groundTop), color(palette.groundBottom)] as CFArray, locations: [0, 1])!
  ctx.addRect(full)
  ctx.clip()
  ctx.drawLinearGradient(ground, start: CGPoint(x: 180, y: 0), end: CGPoint(x: 844, y: 1024), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
  ctx.resetClip()

  // Reference lines: the facial midline and the incisal plane.
  ctx.setStrokeColor(color(palette.lines, palette.linesAlpha))
  ctx.setLineWidth(7)
  ctx.setLineCap(.round)
  ctx.move(to: CGPoint(x: 512, y: 210)); ctx.addLine(to: CGPoint(x: 512, y: 815))
  ctx.move(to: CGPoint(x: 270, y: 440)); ctx.addLine(to: CGPoint(x: 755, y: 440))
  ctx.strokePath()

  // The arc: a soft shadow, then the stroke filled with its gradient.
  let arc = arcPath()
  if palette.shadow > 0 {
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 18), blur: 36, color: color(0x000000, palette.shadow))
    ctx.addPath(arc); ctx.setLineWidth(82); ctx.setLineCap(.round)
    ctx.setStrokeColor(color(palette.arcEnd)); ctx.strokePath()
    ctx.restoreGState()
  }
  ctx.saveGState()
  ctx.addPath(arc); ctx.setLineWidth(82); ctx.setLineCap(.round)
  ctx.replacePathWithStrokedPath()
  ctx.clip()
  let arcGradient = CGGradient(colorsSpace: space, colors: [color(palette.arcStart), color(palette.arcEnd)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(arcGradient, start: CGPoint(x: 215, y: 380), end: CGPoint(x: 810, y: 700), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
  ctx.restoreGState()

  guard let image = ctx.makeImage(),
        let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { fatalError("encode") }
  try! data.write(to: URL(fileURLWithPath: "\(outDir)/\(file)"))
  print("Wrote \(outDir)/\(file)")
}

render("AppIcon-1024-dark.png", Palette(groundTop: 0x2C2824, groundBottom: 0x121110, arcStart: 0xEBD7B4, arcEnd: 0xB48E58,
                                        lines: 0x8C7F71, linesAlpha: 0.38, shadow: 0.45))
render("AppIcon-1024-tinted.png", Palette(groundTop: 0x000000, groundBottom: 0x000000, arcStart: 0xFFFFFF, arcEnd: 0xD6D6D6,
                                          lines: 0x7A7A7A, linesAlpha: 0.7, shadow: 0))
