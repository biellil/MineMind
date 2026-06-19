## Git Commit Guidelines

**MANDATORY**: All commits must follow the Conventional Commits specification with emojis.

### Commit Message Format

```
<emoji> <type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types with Emojis

| Emoji | Type | When to use |
|-------|------|-------------|
| ✨ | **feat** | A new feature |
| 🐛 | **fix** | A bug fix |
| 📝 | **docs** | Documentation only changes |
| 💄 | **style** | Code style/formatting (whitespace, semicolons, etc) |
| ♻️ | **refactor** | Code change that neither fixes a bug nor adds a feature |
| ⚡️ | **perf** | Performance improvements |
| ✅ | **test** | Adding or updating tests |
| 🔧 | **chore** | Changes to build process or auxiliary tools |
| 🏗️ | **build** | Changes that affect the build system or dependencies |
| 🤖 | **ci** | Changes to CI configuration files and scripts |
| ⏪️ | **revert** | Reverts a previous commit |
| 🔒️ | **security** | Security improvements or fixes |
| 🚀 | **deploy** | Deployment and release changes |
| 🎉 | **init** | Initial project setup |
| 🔥 | **remove** | Removing code, files, or features |
| 🚑️ | **hotfix** | Critical production fix |
| 🌐 | **i18n** | Internationalization and localization |
| ♿️ | **a11y** | Accessibility improvements |
| 🎨 | **ui** | UI/UX improvements |
| 📱 | **mobile** | Mobile-specific changes |
| 🗄️ | **database** | Database schema or migration changes |
| 📦 | **deps** | Dependency updates |
| ⬆️ | **deps-up** | Upgrade dependencies |
| ⬇️ | **deps-down** | Downgrade dependencies |
| 🐳 | **docker** | Docker-related changes |
| ☸️ | **k8s** | Kubernetes configuration changes |
| 🔀 | **merge** | Merge branches |
| 📈 | **analytics** | Analytics and tracking |
| 🚨 | **lint** | Fix lint warnings/errors |
| 🧹 | **cleanup** | Code cleanup and housekeeping |
| 🏷️ | **release** | Versioning and releases |
| 💚 | **healthcheck** | Fix CI/build health issues |
| 🎯 | **types** | Type definitions and typing improvements |
| 🔍 | **debug** | Add or improve debugging/logging |
| 🚧 | **wip** | Work in progress |
| 🧪 | **experiment** | Experimental features or prototypes |
| 📊 | **monitoring** | Monitoring, metrics, and observability |

### Examples

```bash
✨ feat(auth): add Google OAuth authentication

🐛 fix(api): prevent duplicate webhook processing

📝 docs(readme): add Docker setup instructions

♻️ refactor(database): simplify repository pattern

⚡️ perf(cache): reduce database queries using Redis

✅ test(users): add integration tests for user creation

🔧 chore(eslint): update linting configuration

🏗️ build(deps): upgrade NestJS to latest version

🤖 ci(github): add automated release workflow

⏪️ revert: revert payment gateway migration

🔒️ security(auth): validate JWT signature before processing

🚀 deploy: release version 2.5.0

🎉 init: bootstrap NestJS project structure

🔥 remove(legacy): delete deprecated authentication service

🚑️ hotfix(payments): fix production payment failure

🌐 i18n: add Portuguese translations

♿️ a11y(ui): improve keyboard navigation support

🎨 ui(dashboard): redesign statistics cards

🗄️ database: create users and roles tables

📦 deps: update express and mongoose

🐳 docker: optimize production image size

☸️ k8s: add readiness and liveness probes

🚨 lint: fix ESLint violations across project

🎯 types(user): improve UserDTO typing

🔍 debug(api): add request tracing logs

📊 monitoring: add Prometheus metrics endpoint

### Important Rules

**NEVER** include these lines in commits:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
```