require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "PaywallSdkReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "14.0" }
  s.source       = { :git => "https://github.com/cloudcaptainai/helium-react-native-sdk.git", :tag => "#{s.version}" }

  # IMPORTANT: Include generated source files here
  s.source_files = "ios/**/*.{h,m,mm,swift}", "ios/generated/**/*.{h,cpp,mm}"

  # New Architecture build settings
  s.pod_target_xcconfig    = {
      "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/../node_modules/react-native/React/CxxHeaders\"",
      "OTHER_CPLUSPLUSFLAGS" => "$(inherited) -DRCT_NEW_ARCH_ENABLED",
      "CLANG_CXX_LANGUAGE_STANDARD" => "c++17" # Ensure C++17 for JSI
  }

  s.dependency 'Helium', '2.0.11' # Your custom native dependency

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
