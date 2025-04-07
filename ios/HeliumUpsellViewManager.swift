//
//  HeliumUpsellViewManager.swift
//  HeliumBridgeNative
//
//  Created by Anish Doshi on 2/11/25.
//
import Foundation
import React
import HeliumC
import SwiftUI

// Helper extension to find parent view controller
extension UIView {
    var parentViewController: UIViewController? {
        var parentResponder: UIResponder? = self
        while parentResponder != nil {
            parentResponder = parentResponder?.next
            if let viewController = parentResponder as? UIViewController {
                return viewController
            }
        }
        return nil
    }
}

// Custom view that handles the SwiftUI hosting
class HeliumUpsellView: UIView {
    private var hostingController: UIHostingController<AnyView>?
    
    @objc var trigger: String = "" {
        didSet {
            updateView()
        }
    }
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }
    
    private func setupView() {
        updateView()
    }
    
    private func updateView() {
        // Remove existing hosting controller view if it exists
        hostingController?.view.removeFromSuperview()
        hostingController?.removeFromParent()
        
        // Get the SwiftUI view with current trigger
        let swiftUIView = Helium.shared.upsellViewForTrigger(trigger: trigger)
        
        // Create new hosting controller
        hostingController = UIHostingController(rootView: AnyView(swiftUIView))
        
        if let hostingView = hostingController?.view {
            // Add the hosting controller's view as a subview
            hostingView.frame = bounds
            hostingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            hostingView.backgroundColor = .clear
            addSubview(hostingView)
            
            // If this view is being used in a view controller hierarchy
            if let parentViewController = parentViewController {
                parentViewController.addChild(hostingController!)
                hostingController?.didMove(toParent: parentViewController)
            }
        }
    }
    
    override func layoutSubviews() {
        super.layoutSubviews()
        hostingController?.view.frame = bounds
    }
}

@objc(HeliumUpsellViewManager)
class HeliumUpsellViewManager: RCTViewManager {
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func view() -> UIView! {
        return HeliumUpsellView()
    }
    
    @objc func setTrigger(_ view: HeliumUpsellView, trigger: NSString) {
        view.trigger = trigger as String
    }
}
