#!/bin/bash
#
# Installation script for run-kit (Universal Multi-Language Runner)
# Issue #4839: Universal runner integration
#
# This script installs run-kit on the server to enable multi-language code execution
#
# Usage:
#   bash install-run-kit.sh
#   or
#   ssh root@dev.example.integram.io 'bash -s' < install-run-kit.sh

set -e

echo "=========================================="
echo "Installing run-kit Universal Runner"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "This script should be run as root for system-wide installation"
  echo "Attempting sudo..."
  SUDO="sudo"
else
  SUDO=""
fi

# Detect OS
OS=$(uname -s)
ARCH=$(uname -m)

echo "Detected OS: $OS"
echo "Detected Architecture: $ARCH"
echo ""

# Function to install Rust/Cargo if not present
install_cargo() {
  if command -v cargo &> /dev/null; then
    echo "✓ Cargo is already installed"
    cargo --version
  else
    echo "Installing Rust and Cargo..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    echo "✓ Rust and Cargo installed successfully"
    cargo --version
  fi
}

# Function to install run-kit via cargo
install_via_cargo() {
  echo "Installing run-kit via cargo..."
  cargo install run-kit

  # Add cargo bin to PATH if not already there
  if [[ ":$PATH:" != *":$HOME/.cargo/bin:"* ]]; then
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.profile
    export PATH="$HOME/.cargo/bin:$PATH"
  fi

  echo "✓ run-kit installed successfully via cargo"
}

# Function to install run-kit via binary download
install_via_binary() {
  echo "Installing run-kit via precompiled binary..."

  # Determine download URL based on OS and architecture
  case "$OS" in
    Linux)
      case "$ARCH" in
        x86_64)
          BINARY_URL="https://github.com/Esubaalew/run/releases/latest/download/run-linux-x86_64"
          ;;
        aarch64|arm64)
          BINARY_URL="https://github.com/Esubaalew/run/releases/latest/download/run-linux-aarch64"
          ;;
        *)
          echo "Unsupported architecture: $ARCH"
          return 1
          ;;
      esac
      ;;
    Darwin)
      case "$ARCH" in
        x86_64)
          BINARY_URL="https://github.com/Esubaalew/run/releases/latest/download/run-macos-x86_64"
          ;;
        arm64)
          BINARY_URL="https://github.com/Esubaalew/run/releases/latest/download/run-macos-arm64"
          ;;
        *)
          echo "Unsupported architecture: $ARCH"
          return 1
          ;;
      esac
      ;;
    *)
      echo "Unsupported OS: $OS"
      return 1
      ;;
  esac

  # Download binary
  echo "Downloading from: $BINARY_URL"
  curl -L -o /tmp/run "$BINARY_URL"

  # Make executable and move to /usr/local/bin
  chmod +x /tmp/run
  $SUDO mv /tmp/run /usr/local/bin/run

  echo "✓ run-kit installed successfully to /usr/local/bin/run"
}

# Main installation flow
echo "Installation options:"
echo "1. Install via cargo (recommended, compiles from source)"
echo "2. Install via precompiled binary (faster)"
echo ""

# Try cargo installation first, fallback to binary if cargo not available
if command -v cargo &> /dev/null || [ -f "$HOME/.cargo/bin/cargo" ]; then
  echo "Using cargo installation method..."
  install_cargo
  install_via_cargo
else
  echo "Cargo not found. Installing via precompiled binary..."
  install_via_binary
fi

# Verify installation
echo ""
echo "Verifying installation..."
if command -v run &> /dev/null; then
  echo "✓ run-kit is installed and available in PATH"
  run --version || echo "run version: installed"
  echo ""
  echo "Installation complete!"
  echo ""
  echo "Usage examples:"
  echo "  run --lang python --code 'print(\"Hello, World!\")'"
  echo "  run examples/go/hello/main.go"
  echo "  run  # Start interactive REPL"
  echo ""
  echo "For more information, visit: https://github.com/Esubaalew/run"
else
  echo "✗ Installation failed. run-kit is not in PATH."
  echo "Please check the installation logs above for errors."
  exit 1
fi
