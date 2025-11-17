{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    { self
    , nixpkgs
    , flake-utils
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages."${system}";
        # https://stackoverflow.com/a/78004800
        oscgoesbrrrpkg = pkgs.buildNpmPackage rec {
          env = {
            ELECTRON_SKIP_BINARY_DOWNLOAD = 1;
          };
          pname = "OscGoesBrrr";
          version = "0.0.0-dev";
          src = ./.;
          npmDepsHash = "sha256-HObRprVAnJWSay8x7+Apkp0sKx1CpnjIB1ze4xks/Lo=";
          postInstall = ''
            makeWrapper ${pkgs.electron}/bin/electron $out/bin/${pname} \
              --add-flags $out/lib/node_modules/${pname} \
              --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true}}"
          '';
        };
      in

      {
        packages = {
          default = oscgoesbrrrpkg;
          oscgoesbrrr = oscgoesbrrrpkg;
        };

        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            nodejs
            electron
          ];
        };

        formatter = pkgs.nixfmt-tree;
      }
    );
}
