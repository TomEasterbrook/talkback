# Homebrew formula for talkback
# Install: brew tap <your-username>/talkback && brew install talkback
# Or: brew install --HEAD <your-username>/talkback/talkback

class Talkback < Formula
  desc "Voice notifications for AI coding assistants and terminal workflows"
  homepage "https://github.com/talkback/talkback"
  license "MIT"
  head "https://github.com/talkback/talkback.git", branch: "main"

  # For stable releases, uncomment and update:
  # url "https://github.com/talkback/talkback/archive/refs/tags/v1.0.0.tar.gz"
  # sha256 "YOUR_SHA256_HERE"
  # version "1.0.0"

  depends_on "node@18" => :build
  depends_on "sox"

  def install
    system "npm", "install", "--production", "--ignore-scripts"
    system "npm", "run", "build"

    # Install the built package
    libexec.install Dir["*"]

    # Create wrapper script
    (bin/"talkback").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@18"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    EOS
  end

  def caveats
    <<~EOS
      To get started:
        1. Get an ElevenLabs API key at https://elevenlabs.io
        2. Run: talkback setup

      Quick test:
        talkback "Hello, world!"

      For AI coding assistants, reserve a voice:
        export TALKBACK_VOICE=$(talkback reserve)
    EOS
  end

  test do
    assert_match "Voice for agentic coders", shell_output("#{bin}/talkback --help")
  end
end
