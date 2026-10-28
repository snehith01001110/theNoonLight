cask "noon" do
  version "0.1.0"
  sha256 "ae1be8e8bedc7dc2825b9d96c6d679debdd1f7812aec8f4138f400a9a3fee79b"

  url "https://github.com/snehith01001110/noon-releases/releases/download/v#{version}/Noon.zip"
  name "Noon"
  desc "Run coding agents side by side on a live map of your code"
  homepage "https://thenoonlight.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: :golden_gate

  app "Noon.app"
end
