// Azure deployment entry point.
// See specs/infrastructure-terraform-spec.md for the full resource design.

// Example module layout:
// module "network" { source = "./modules/network" }
// module "container_apps" { source = "./modules/container-apps" }
// module "security" { source = "./modules/security" }
