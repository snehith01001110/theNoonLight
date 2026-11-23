cask "noon" do
  version "0.5.1"
  sha256 "25d7e3603189e9d4b6da65f96de7170fe39e3e974dfb36650bc22083e0ba07d9"

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
