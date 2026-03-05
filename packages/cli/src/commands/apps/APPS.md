# `bunny apps` (Experimental)

Manage apps (Magic Containers). Apps are multi-container deployments where all containers share a localhost network. Configuration is stored in a `bunny.jsonc` file which is committed to your repo. The app ID is written back to the config on first deploy, so cloning the repo gives you everything you need. The JSONC format supports a `$schema` property for editor autocompletion.

```bash
# Scaffold a new bunny.jsonc (interactive)
bunny apps init

# Deploy (creates the app on first run, builds from Dockerfile if configured)
bunny apps deploy

# Deploy a pre-built image
bunny apps deploy --image ghcr.io/myorg/api:v1.2

# Sync remote config to local bunny.jsonc
bunny apps pull

# Apply local bunny.jsonc changes to remote
bunny apps push
```

## `bunny apps init`

Scaffold a new `bunny.jsonc` config file. Prompts for name and regions. If a `Dockerfile` is detected in the current directory, offers to use it for build-and-deploy and prompts for a container registry. Otherwise prompts for a container image.

```bash
bunny apps init
bunny apps init --name my-api --image nginx:latest
```

| Flag      | Description                           |
| --------- | ------------------------------------- |
| `--name`  | App name (defaults to directory name) |
| `--image` | Primary container image               |

## `bunny apps list`

List all apps.

```bash
bunny apps list
bunny apps ls --output json
```

## `bunny apps show`

Show app details including status, regions, scaling, cost, and containers.

```bash
bunny apps show
bunny apps show --id <app-id>
```

## `bunny apps deploy`

Deploy an app. If `bunny.jsonc` has no `id`, the app is created on Bunny first. If `dockerfile` is set in the primary container config (first entry in `containers`), the image is built and pushed automatically (prompts for a registry if not configured). Use `--image` to skip the build and deploy a pre-built image.

```bash
# Build from Dockerfile + deploy
bunny apps deploy

# Deploy a pre-built image
bunny apps deploy --image ghcr.io/myorg/api:v1.2
```

| Flag      | Description                                        |
| --------- | -------------------------------------------------- |
| `--image` | Container image to deploy (skips Dockerfile build) |

## `bunny apps pull` / `bunny apps push`

Sync configuration between the remote API and local `bunny.jsonc`.

```bash
# Pull remote state to local bunny.jsonc
bunny apps pull
bunny apps pull --force

# Push local bunny.jsonc to remote
bunny apps push
bunny apps push --dry-run
```

## `bunny apps env`

Manage environment variables per container.

```bash
# List vars (primary container)
bunny apps env list

# Set a variable on a specific container
bunny apps env set DATABASE_URL postgres://localhost:5432/mydb --container postgres

# Remove a variable
bunny apps env remove OLD_VAR

# Pull remote vars to .env
bunny apps env pull
```

| Flag          | Description                         |
| ------------- | ----------------------------------- |
| `--container` | Target container (default: primary) |

## `bunny apps endpoints`

Manage endpoints (CDN or Anycast) per container.

```bash
bunny apps endpoints list
bunny apps endpoints add --type cdn --ssl --container-port 3000 --public-port 443
bunny apps endpoints remove <endpoint-id>
```

## `bunny apps volumes`

Manage persistent volumes.

```bash
bunny apps volumes list
bunny apps volumes remove <volume-id> --force
```

## `bunny apps regions`

View available regions and app region settings.

```bash
bunny apps regions list
bunny apps regions show
```
