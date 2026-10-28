# homebrew-noon (not published yet)

A Homebrew tap for Noon, ready to publish once `noon-releases` is public and
its release is out. Homebrew's main cask list needs 75 stars and a public
repository at least 30 days old, so a personal tap comes first.

To publish:

1. Set `version` and `sha256` in `Casks/noon.rb` to the published release's
   ZIP (`shasum -a 256 Noon.zip`).
2. Create the public repository `snehith01001110/homebrew-noon` with this
   folder's contents at its root.
3. Check it: `brew tap snehith01001110/noon && brew audit --cask --online --strict snehith01001110/noon/noon`.
4. Add the install line to the page under the Download button:
   `brew install --cask snehith01001110/noon/noon`.

A `zap` stanza (the files Noon leaves after it's removed) is left out until
its data folders are confirmed.
