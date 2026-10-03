import XCTest

final class SmokeTests: XCTestCase {
    func testLaunchAndAccessibility() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "uk.co.drvik.smilecompose")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        if !app.buttons["New Smile Design"].waitForExistence(timeout: 10) {
            for _ in 0..<3 {
                if app.buttons["Back"].exists { app.buttons["Back"].tap() }
                if app.buttons["New Smile Design"].waitForExistence(timeout: 3) { break }
            }
        }
        XCTAssertTrue(app.buttons["New Smile Design"].exists)
        if app.buttons["Settings"].exists {
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.buttons["Sign in or create account"].waitForExistence(timeout: 15))
        app.buttons["Sign in or create account"].tap()

        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 15))
        app.textFields.firstMatch.tap(); app.textFields.firstMatch.typeText("simulator@example.invalid")
        app.secureTextFields.firstMatch.tap()
        app.secureTextFields.firstMatch.typeText("fixture-only-not-a-credential")
        app.buttons["Sign in"].tap()
        XCTAssertTrue(app.staticTexts["QA."].waitForExistence(timeout: 30))
        }
        XCTAssertTrue(app.buttons["Profile and settings"].waitForExistence(timeout: 30))
        app.buttons["New Smile Design"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.waitForExistence(timeout: 20))
        app.switches.firstMatch.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.isEnabled)
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 30), app.debugDescription)
        let photo = app.images.matching(NSPredicate(format: "identifier == 'PXGGridLayout-Info' AND label CONTAINS '02 October'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 15)); photo.tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 45))
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 30))
        for count in ["4", "6", "8", "10", "6"] { app.switches[count].tap(); XCTAssertEqual(app.switches[count].value as? String, "1") }
        app.buttons["Treatment"].tap()
        let composite = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Composite bonding'")).firstMatch
        XCTAssertTrue(composite.waitForExistence(timeout: 15), app.debugDescription); composite.tap()
        app.buttons["Review"].tap()
        XCTAssertTrue(app.buttons["Generate Smile"].waitForExistence(timeout: 15))
        app.buttons["Generate Smile"].tap()
        if app.buttons["Continue"].waitForExistence(timeout: 3) {
            let permission = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'I have explained'")).firstMatch
            XCTAssertTrue(permission.waitForExistence(timeout: 10), app.debugDescription); permission.tap()
            app.buttons["Continue"].tap()
        }
        let options = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Options'")).firstMatch
        XCTAssertTrue(options.waitForExistence(timeout: 90), app.debugDescription)
        let slider = app.sliders["Before and after comparison"]
        XCTAssertTrue(slider.exists); slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.1, thenDragTo: slider.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)))
        XCTAssertNotEqual(slider.value as? String, "50 percent original, 50 percent concept")
        XCTAssertTrue(app.images["AI-generated smile concept"].exists)
        options.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Overlay'" )).firstMatch.waitForExistence(timeout: 10)); app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Overlay'" )).firstMatch.tap()
        app.buttons["Close options"].tap()
        XCTAssertTrue(app.buttons["Increase overlay strength"].waitForExistence(timeout: 10)); app.buttons["Increase overlay strength"].tap()
        app.buttons["Decrease overlay strength"].tap()
        options.tap(); app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Slide'" )).firstMatch.tap(); app.buttons["Close options"].tap()
        print("QA_GENERATE_TREE\n" + app.debugDescription)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "launch"; shot.lifetime = .keepAlways; add(shot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "accessibility"; tree.lifetime = .keepAlways; add(tree)
        print("QA_ACCESSIBILITY_START\n" + app.debugDescription + "\nQA_ACCESSIBILITY_END")
        app.terminate()
        app.launch()
        XCTAssertTrue(options.waitForExistence(timeout: 30), "Saved comparison must reopen after force-close")
        XCTAssertTrue(app.images["AI-generated smile concept"].exists)
        if app.frame.width > 700 {
            XCUIDevice.shared.orientation = .landscapeLeft
            XCTAssertTrue(options.waitForExistence(timeout: 15)); XCTAssertTrue(app.images["AI-generated smile concept"].exists)
            let landscape = XCTAttachment(screenshot: app.screenshot()); landscape.name = "ipad-landscape"; landscape.lifetime = .keepAlways; add(landscape)
            XCUIDevice.shared.orientation = .portrait
        }
    }
}

// Explicitly selected by qa:ios-live-generation; never part of deterministic QA.
final class PhotoImportTests: XCTestCase {
    func testAuthorizedFolderImportsWithoutProvider() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        let run = safari.buttons["Run local photo checks"]
        XCTAssertTrue(run.waitForExistence(timeout: 45)); run.tap()
        let outcome = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' OR label BEGINSWITH 'FAIL:'")).firstMatch
        XCTAssertTrue(outcome.waitForExistence(timeout: 90), safari.debugDescription)
        XCTAssertTrue(outcome.label.hasPrefix("PASS: six local photo checks"), outcome.label)
    }
}

final class LiveGenerationTests: XCTestCase {
    func testSyntheticStagingGeneration() throws {
        guard ProcessInfo.processInfo.environment["SMILE_QA_LIVE"] == "1" else { throw XCTSkip("Live provider QA requires the explicit live scheme") }
        continueAfterFailure = false
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        let run = safari.buttons["Run live generations"]
        XCTAssertTrue(run.waitForExistence(timeout: 45))
        run.tap()
        let outcome = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' OR label BEGINSWITH 'FAIL:'")).firstMatch
        XCTAssertTrue(outcome.waitForExistence(timeout: 230), safari.debugDescription)
        XCTAssertTrue(outcome.label.hasPrefix("PASS: all live results"), outcome.label)
        let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "live-delivered"; shot.lifetime = .keepAlways; add(shot)
        safari.terminate(); safari.launch()
        let verify = safari.buttons["Verify saved results after relaunch"]
        XCTAssertTrue(verify.waitForExistence(timeout: 45)); verify.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' AND label CONTAINS 'reopened after relaunch'")).firstMatch.waitForExistence(timeout: 30))
        let reopened = XCTAttachment(screenshot: safari.screenshot()); reopened.name = "live-reopened"; reopened.lifetime = .keepAlways; add(reopened)
    }
}
