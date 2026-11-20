cask "noon" do
  version "0.4.3"
  sha256 "3b2afe038b3a2c7a645f6e8e6724ba584e596ca7300047f1014ba76710756ec1"

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
