# LocalMind

LocalMind is a privacy-first, local-first AI chat application that runs entirely on your machine. It leverages local LLMs (via Ollama) to provide a ChatGPT-like experience without sending your data to any external server.

## Features

- **100% Local**: All data stays on your machine. No cloud, no tracking, no data leaks.
- **Multiple Model Support**: Works with any model served by Ollama (Llama 2, Mistral, CodeLlama, etc.)
- **RAG (Retrieval Augmented Generation)**: Upload documents (PDF, TXT, MD) and ask questions about their content.
- **Plugin System**: Extend functionality with community plugins.
- **Export & Share**: Export conversations as Markdown or JSON.
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS.

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Ollama](https://ollama.ai/) (for local LLM)

### Running with Docker (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/imDarshanGK/localmind.git
   cd localmind
   ```

2. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the application:
   ```bash
   docker-compose up -d
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Running without Docker

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup instructions.

## Community Showcase

We love seeing what the community builds with LocalMind! Here are some projects, integrations, and resources created by our users:

### Projects & Integrations

- **[localmind-obsidian](https://github.com/example/localmind-obsidian)** — Obsidian plugin to sync notes with LocalMind for RAG queries.
- **[localmind-telegram-bot](https://github.com/example/localmind-telegram-bot)** — Telegram bot that forwards messages to LocalMind for local AI responses.
- **[localmind-vscode](https://github.com/example/localmind-vscode)** — VS Code extension for inline code assistance using LocalMind.
- **[localmind-home-assistant](https://github.com/example/localmind-home-assistant)** — Home Assistant integration for voice commands powered by LocalMind.

### Tutorials & Guides

- **[Running LocalMind on a Raspberry Pi](https://example.com/blog/localmind-raspberry-pi)** — Step-by-step guide to deploy LocalMind on a Raspberry Pi 4/5.
- **[Building a Custom Plugin for LocalMind](https://example.com/blog/localmind-plugin-tutorial)** — Walkthrough of creating a weather plugin.
- **[Using LocalMind with Custom Ollama Models](https://example.com/blog/localmind-custom-models)** — How to fine-tune and use custom models.

### Community Contributions

- **[localmind-themes](https://github.com/example/localmind-themes)** — Collection of community-created UI themes.
- **[localmind-lang-packs](https://github.com/example/localmind-lang-packs)** — Language translations contributed by the community.

> **Want to add your project?** Open a pull request to update this section, or share it in our [Discussions](https://github.com/imDarshanGK/localmind/discussions)!

## Documentation

- [API Documentation](backend/routes/) — Explore the backend API endpoints.
- [Plugin Development Guide](CONTRIBUTING.md#plugins) — Learn how to create plugins.
- [Roadmap](ROADMAP.md) — See what's coming next.

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:
- Setting up a development environment
- Code style and conventions
- Testing
- Pull request process

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- [GitHub Issues](https://github.com/imDarshanGK/localmind/issues) — Bug reports and feature requests
- [Discussions](https://github.com/imDarshanGK/localmind/discussions) — Q&A and community conversations
