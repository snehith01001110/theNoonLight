cask "noon" do
  version "0.1.0"
  sha256 "41a325200b3abd98f35151c03f8c47ce5e8f0405b63ac24eaddbfa1cc9523121"

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
