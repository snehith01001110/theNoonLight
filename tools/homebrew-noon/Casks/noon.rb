cask "noon" do
  version "0.4.2"
  sha256 "49f71226c95223acd2a989d0a9c951b9425fb4a45ac2fc77418e4b64903ec231"

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
