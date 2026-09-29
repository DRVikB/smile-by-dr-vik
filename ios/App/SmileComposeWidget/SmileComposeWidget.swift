import SwiftUI
import WidgetKit

// SmileCompose widgets: shortcuts into the app, never patient information (widgets show on the
// Home Screen and Lock Screen, where anyone can see them). Taps open the app through its URL
// scheme (uk.co.drvik.smilecompose://shortcut/<action>), handled like the Home Screen quick actions.
//
// Artwork (Assets.xcassets, rendered by scripts/render-widget-art.swift): the Home Screen app icon's
// mark (Light and Dark, as on the icon), a satin ground, and the Home screen's hero photograph
// cropped to the smile — the app's own artwork, not a patient.
//
// Every size shares one type scale (Type below), so text is the same size in every widget.

/// Shared with the app (ShortcutsPlugin in the app's SceneDelegate.swift writes it). Needs the App Group
/// capability on both targets; until it is enabled the suite is empty and the widget shows its
/// generic text. Only the clinician's own preferred name is stored — never patient information.
private let appGroup = "group.uk.co.drvik.smilecompose"
private let nameKey = "widget.displayName"

private func sharedName() -> String? {
    let name = UserDefaults(suiteName: appGroup)?.string(forKey: nameKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return name?.isEmpty == false ? name : nil
}

private enum Action: String {
    case new, cases, sample
    var url: URL { URL(string: "uk.co.drvik.smilecompose://shortcut/\(rawValue)")! }
}

// MARK: - Brand

private func rgb(_ hex: UInt32, _ opacity: Double = 1) -> Color {
    Color(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)
}

private struct Palette {
    let text: Color, wordmark: Color
    let pill: Color, pillStroke: Color, pillText: Color
    let gold: [Color], goldStroke: Color, goldText: Color
    let arrowFill: Color, arrowStroke: Color, arrowText: Color

    static func of(_ scheme: ColorScheme) -> Palette {
        scheme == .dark
            ? Palette(text: rgb(0xF4EFE7), wordmark: rgb(0xD5C19B),
                      pill: rgb(0xFFFFFF, 0.08), pillStroke: rgb(0xFFFFFF, 0.16), pillText: rgb(0xF4EFE7),
                      gold: [rgb(0xBF9A60), rgb(0x7E6038)], goldStroke: rgb(0xE8CF9C, 0.65), goldText: rgb(0xFFF8EC),
                      arrowFill: rgb(0x000000, 0.18), arrowStroke: rgb(0xC9A46A, 0.9), arrowText: rgb(0xE8CF9C))
            : Palette(text: rgb(0x2A2521), wordmark: rgb(0x5E564B),
                      pill: rgb(0xFFFFFF, 0.66), pillStroke: rgb(0xFFFFFF, 0.95), pillText: rgb(0x2A2521),
                      gold: [rgb(0xEFDBB4), rgb(0xD3B27C)], goldStroke: rgb(0xFFFFFF, 0.75), goldText: rgb(0x2A2521),
                      arrowFill: rgb(0xFFFFFF, 0.6), arrowStroke: rgb(0xFFFFFF, 0.95), arrowText: rgb(0x5E4A30))
    }
}

/// One type scale for every widget. `k` is 1 on iPhone and only shrinks (evenly, for all text) to fit
/// the smaller iPad widgets.
private struct Type {
    let k: CGFloat
    var greeting: CGFloat { 22 * k }
    var label: CGFloat { 13 * k }
    var wordmark: CGFloat { 8 * k }
    var pill: CGFloat { 32 * k }
    var arrow: CGFloat { 30 * k }
    var mark: CGFloat { 40 * k }
    var gap: CGFloat { 7 * k }
}

/// The mark from the Home Screen app icon (Light: the charcoal glass arc; Dark: the champagne arc).
/// `large` uses the icon's own hairline guides; the default artwork thickens them for small sizes.
private struct AppMark: View {
    var large = false
    var body: some View {
        let image = Image(large ? "SmileMarkLarge" : "SmileMark").resizable()
        if #available(iOSApplicationExtension 18.0, *) {
            image.widgetAccentedRenderingMode(.accentedDesaturated).scaledToFit()
        } else {
            image.scaledToFit()
        }
    }
}

/// The same mark as vector lines, for the monochrome Lock Screen (geometry from the app icon, in the
/// mark's square: arc, facial midline and incisal plane).
private struct LineMark: View {
    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height)
            let o = CGPoint(x: (geo.size.width - w) / 2, y: (geo.size.height - w) / 2)
            let at = { (x: CGFloat, y: CGFloat) in CGPoint(x: o.x + x * w, y: o.y + y * w) }
            ZStack {
                Path { p in
                    p.move(to: at(0.5, 0.083)); p.addLine(to: at(0.5, 0.917))
                    p.move(to: at(0.12, 0.402)); p.addLine(to: at(0.88, 0.402))
                }
                .stroke(.secondary, lineWidth: max(1, w * 0.03))
                Path { p in
                    p.move(to: at(0.091, 0.352))
                    p.addCurve(to: at(0.909, 0.352), control1: at(0.238, 0.820), control2: at(0.762, 0.820))
                }
                .stroke(.primary, style: StrokeStyle(lineWidth: w * 0.11, lineCap: .round))
                .widgetAccentable()
            }
        }
    }
}

private struct Wordmark: View {
    let t: Type, colour: Color
    var body: some View {
        Text("SMILECOMPOSE").font(.system(size: t.wordmark, weight: .semibold)).tracking(t.wordmark * 0.3).foregroundStyle(colour).lineLimit(1)
    }
}

/// "Welcome, Dr Vik." — or, until the name is shared with the widget, the app's line.
private struct Greeting: View {
    let name: String?, t: Type, colour: Color
    var body: some View {
        Group {
            if let name { Text("Welcome,\n\(name.hasSuffix(".") ? name : name + ".")") } else { Text("Smile design,\nvisualised.") }
        }
        .font(.system(size: t.greeting, weight: .regular, design: .serif))
        .foregroundStyle(colour)
        .lineLimit((name?.count ?? 0) > 14 ? 3 : 2) // a long name wraps rather than truncating
        .minimumScaleFactor(0.8)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct Pill: View {
    let title: String, symbol: String, action: Action, primary: Bool, t: Type, p: Palette
    var body: some View {
        Link(destination: action.url) {
            HStack(spacing: 7 * t.k) {
                Image(systemName: symbol).font(.system(size: t.label, weight: .regular)).frame(width: 16 * t.k)
                Text(title).font(.system(size: t.label, weight: .medium)).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12 * t.k)
            .frame(maxWidth: .infinity, minHeight: t.pill, maxHeight: t.pill)
            .foregroundStyle(primary ? p.goldText : p.pillText)
            .background {
                if primary {
                    Capsule().fill(LinearGradient(colors: p.gold, startPoint: .top, endPoint: .bottom)).widgetAccentable()
                } else {
                    Capsule().fill(p.pill)
                }
            }
            .overlay { Capsule().strokeBorder(primary ? p.goldStroke : p.pillStroke, lineWidth: 0.8) }
        }
    }
}

private struct Pills: View {
    let t: Type, p: Palette
    var body: some View {
        VStack(spacing: t.gap) {
            Pill(title: "New design", symbol: "plus", action: .new, primary: true, t: t, p: p)
            Pill(title: "Cases", symbol: "folder", action: .cases, primary: false, t: t, p: p)
            Pill(title: "Sample case", symbol: "play", action: .sample, primary: false, t: t, p: p)
        }
    }
}

private struct ArrowButton: View {
    let t: Type, p: Palette
    var body: some View {
        Image(systemName: "arrow.right")
            .font(.system(size: t.label, weight: .medium))
            .foregroundStyle(p.arrowText)
            .frame(width: t.arrow, height: t.arrow)
            .background(Circle().fill(p.arrowFill))
            .overlay(Circle().strokeBorder(p.arrowStroke, lineWidth: 0.9))
            .widgetAccentable()
    }
}

// MARK: - Backgrounds (full bleed, behind the content margins)

private struct Silk: View {
    let name: String
    var body: some View {
        GeometryReader { geo in
            Image(name).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped()
        }
    }
}

/// Satin, with the smile photograph bleeding in from the right and fading into the silk.
private struct WideBackground: View {
    var photoWidth: CGFloat = 0.6
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .trailing) {
                Silk(name: "SilkWide")
                Image("WidgetSmile").resizable().scaledToFill()
                    .frame(width: geo.size.width * photoWidth, height: geo.size.height).clipped()
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black.opacity(0.8), location: 0.42), .init(color: .black, location: 0.62)],
                                         startPoint: .leading, endPoint: .trailing))
            }
        }
    }
}

/// Large: the smile across the top, fading down into the satin.
private struct TallBackground: View {
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                Silk(name: "SilkWide")
                Image("WidgetSmile").resizable().scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height * 0.68).clipped()
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0.55), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.45)], startPoint: .leading, endPoint: .trailing))
            }
        }
    }
}

private extension View {
    /// iOS 17+ widgets declare their background (the system removes it in tinted and StandBy modes);
    /// iOS 16 draws it and applies the standard margin itself.
    @ViewBuilder func widgetBackground<B: View>(@ViewBuilder _ background: () -> B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget, content: background)
        } else {
            padding(16).background(background())
        }
    }
}

// MARK: - Timeline (static: the widget has no changing content)

private struct Entry: TimelineEntry { let date: Date; let name: String? }

/// Static apart from the name; the app asks WidgetKit to reload when the name changes.
private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, name: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, name: sharedName()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now, name: sharedName())], policy: .never))
    }
}

// MARK: - Views
// Designed for the iPhone content areas (inside the margins): small and medium 138 pt tall, large
// 332 pt wide. Smaller iPad widgets scale everything by the same factor.

/// Small: the greeting, and an arrow into a new smile design.
private struct SmallView: View {
    let p: Palette, name: String?
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 138))
            VStack(alignment: .leading, spacing: 0) {
                AppMark().frame(width: t.mark, height: t.mark)
                Spacer(minLength: 2)
                Greeting(name: name, t: t, colour: p.text)
                Spacer(minLength: 4)
                HStack(alignment: .center, spacing: 4) {
                    Wordmark(t: t, colour: p.wordmark)
                    Spacer(minLength: 0)
                    ArrowButton(t: t, p: p)
                }
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Medium (and iPad extra large): the greeting, three actions, and the smile.
private struct WideView: View {
    let p: Palette, name: String?
    var reference: CGFloat = 138
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / reference))
            HStack(alignment: .center, spacing: 10 * t.k) {
                VStack(alignment: .leading, spacing: 0) {
                    AppMark().frame(width: t.mark, height: t.mark)
                    Spacer(minLength: 2)
                    Greeting(name: name, t: t, colour: p.text)
                    Spacer(minLength: 4)
                    Wordmark(t: t, colour: p.wordmark)
                }
                .frame(width: min(geo.size.width * 0.37, 210 * t.k), alignment: .leading)
                Pills(t: t, p: p).frame(width: min(geo.size.width * 0.41, 150 * t.k))
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
        }
        .widgetURL(Action.new.url)
    }
}

/// Large: the smile across the top; the greeting and the three actions beneath it.
private struct LargeView: View {
    let p: Palette, name: String?
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.width / 332))
            VStack(alignment: .leading, spacing: 0) {
                AppMark().frame(width: t.mark, height: t.mark)
                Spacer(minLength: 8)
                HStack(alignment: .bottom, spacing: 12 * t.k) {
                    VStack(alignment: .leading, spacing: 8 * t.k) {
                        Greeting(name: name, t: t, colour: p.text)
                        Wordmark(t: t, colour: p.wordmark)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Pills(t: t, p: p).frame(width: min(geo.size.width * 0.45, 150 * t.k))
                }
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// The mark alone, on satin, as large as the widget allows: it reaches past the content margins so the
/// arc sits about 13 pt from the edges (the artwork's own padding keeps it clear of the corners).
private struct MarkView: View {
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) * 1.12
            AppMark(large: true).frame(width: side, height: side)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .widgetURL(Action.new.url)
    }
}

private struct WidgetView: View {
    let entry: Entry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = Palette.of(scheme)
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                LineMark().padding(10)
            }
            .widgetURL(Action.new.url)
            .widgetBackground { Color.clear }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                LineMark().frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.name.map { "Welcome, \($0)" } ?? "SmileCompose").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text("New smile design").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .widgetURL(Action.new.url)
            .widgetBackground { Color.clear }
        case .accessoryInline:
            Label(entry.name.map { "Welcome, \($0)" } ?? "New smile design", systemImage: "plus.circle")
                .widgetURL(Action.new.url)
                .widgetBackground { Color.clear }
        case .systemMedium:
            WideView(p: p, name: entry.name).widgetBackground { WideBackground() }
        case .systemLarge:
            LargeView(p: p, name: entry.name).widgetBackground { TallBackground() }
        case .systemExtraLarge:
            WideView(p: p, name: entry.name, reference: 300).widgetBackground { WideBackground(photoWidth: 0.62) }
        default:
            SmallView(p: p, name: entry.name).widgetBackground { Silk(name: "SilkSquare") }
        }
    }
}

// MARK: - Widgets

struct SmileComposeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeWidget", provider: Provider()) { entry in WidgetView(entry: entry) }
            .configurationDisplayName("SmileCompose")
            .description("Start a new smile design, open your cases or try the sample case.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge,
                                .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct SmileComposeMarkWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeMark", provider: Provider()) { _ in
            MarkView().widgetBackground { Silk(name: "SilkSquare") }
        }
        .configurationDisplayName("SmileCompose Symbol")
        .description("The SmileCompose symbol. Tap to start a new smile design.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct SmileComposeWidgets: WidgetBundle {
    var body: some Widget {
        SmileComposeWidget()
        SmileComposeMarkWidget()
    }
}
