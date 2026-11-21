cask "noon" do
  version "0.5.0"
  sha256 "e7d98552f9de0f0373029a7a5fc887e97b8c95b6c14fbf54f12f2bf236f093bb"

  url "https://github.com/snehith01001110/noon-releases/releases/download/v#{version}/Noon.zip"
  name "Noon"
  desc "Run coding agents side by side on a live map of your code"
  homepage "https://thenoonlight.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :golden_gate

  app "Noon.app"
end
